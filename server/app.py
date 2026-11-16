"""Optional, stateless transport for the same CardioEKG analysis used in the browser.

No image uploads, clinical-record storage, request body logging, or third-party APIs.
"""
from __future__ import annotations

import asyncio
import hmac
import json
import os
import re
import sys
import tempfile
from pathlib import Path
from typing import Annotated, Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, model_validator, field_validator, ValidationError

LEADS = ('I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6')
Lead = Literal['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6']
Measure = Literal['rateBpm', 'prMs', 'qrsMs', 'qtMs', 'axisDeg']
MEASURE_DIR = Path(__file__).resolve().parent / 'measure'
MEASURE_MAGIC = ((b'%PDF', '.pdf'), (b'\x89PNG\r\n\x1a\n', '.png'), (b'\xff\xd8\xff', '.jpg'))
MAX_BODY = 8 * 1024 * 1024
MAX_RESPONSE = 4 * 1024 * 1024
ROOT = Path(__file__).resolve().parent


async def measure_signals_isolated(measure_input: dict, timeout: float = 60) -> dict:
    """Run the authoritative Python measurement with a bounded subprocess lifetime."""
    process = None
    code = 'import sys,json;sys.path.insert(0,sys.argv[1]);from run_measure import measure_signals;print(json.dumps(measure_signals(json.load(sys.stdin)),allow_nan=False))'
    try:
        async with asyncio.timeout(timeout):
            process = await asyncio.create_subprocess_exec(
                sys.executable, '-I', '-c', code, str(MEASURE_DIR),
                stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
                cwd=ROOT, env={'PATH': os.getenv('PATH', ''), 'PYTHONNOUSERSITE': '1'},
            )
            measured, _ = await process.communicate(json.dumps(measure_input, allow_nan=False).encode())
        if process.returncode != 0 or len(measured) > MAX_RESPONSE:
            raise ValueError('Python measurement failed')
        result = json.loads(measured)
        if not isinstance(result, dict) or result.get('ok') is not True or result.get('schemaVersion') != 1:
            raise ValueError('Invalid Python measurement result')
        return result
    finally:
        if process and process.returncode is None:
            try:
                process.kill()
            except ProcessLookupError:
                pass
            await process.wait()


class TransportModel(BaseModel):
    # Unknown fields, including names, filenames, intake, and account identifiers,
    # are never copied to the analysis subprocess or response.
    model_config = ConfigDict(extra='ignore', allow_inf_nan=False)


class SignalCalibration(TransportModel):
    speed: Literal[25,50]
    gain: Literal[5,10,20]
    gainSource: Literal['user-declared','digital']


class Trace(TransportModel):
    recordingCalibration: SignalCalibration | None = None
    mv: Annotated[list[float], Field(min_length=1, max_length=100_000)]
    seconds: Annotated[float, Field(gt=0, le=30)]
    quality: Annotated[float | None, Field(ge=0, le=1)] = None

    @model_validator(mode='after')
    def calibrated_bounds(self):
        if len(self.mv) / self.seconds > 5000:
            raise ValueError('Sampling rate exceeds transport limit')
        if any(abs(value) > 100 for value in self.mv):
            raise ValueError('Signal amplitude exceeds calibrated transport limit')
        return self


class Measurements(TransportModel):
    rateBpm: float | None = None
    prMs: float | None = None
    qrsMs: float | None = None
    qtMs: float | None = None
    axisDeg: float | None = None

    @model_validator(mode='after')
    def finite_bounds(self):
        if any(value is not None and abs(value) > 1_000_000 for value in self.model_dump().values()):
            raise ValueError('Measurement exceeds transport limit')
        return self


class Marker(TransportModel):
    start: Annotated[float, Field(ge=0, le=30)]
    end: Annotated[float, Field(gt=0, le=30)]
    phase: Literal['p', 'qrs', 't']

    @model_validator(mode='after')
    def positive_window(self):
        if self.end <= self.start:
            raise ValueError('Marker end must follow its start')
        return self


class MeasurementWindow(TransportModel):
    captureLead: Literal['I','II','III','aVR','aVL','aVF','V1','V2','V3','V4','V5','V6','II-long'] | None = None
    lead: Lead
    start: Annotated[float, Field(ge=0, le=30)]
    end: Annotated[float, Field(gt=0, le=30)]

    @model_validator(mode='after')
    def positive_window(self):
        if self.end <= self.start:
            raise ValueError('Measurement end must follow its start')
        return self


class Provenance(TransportModel):
    commonRecording: bool = False
    commonCalibration: bool = False
    speed: Annotated[float | None, Field(gt=0, le=100)] = None
    gain: Annotated[float | None, Field(gt=0, le=100)] = None
    layout: Literal['4x3', '2x6', '3x4', '6x2', '12x1', 'individual', 'unknown'] | None = None
    timing: Literal['simultaneous', 'sequential', 'unknown'] = 'unknown'
    userConfirmedComparable: bool | None = None
    # leadSources contains source identifiers in the browser; only equality groups
    # are passed onward, never the actual filename, fingerprint, or source string.
    leadSources: dict[Lead, Annotated[str, Field(max_length=512)]] | None = None


class ClinicalContext(TransportModel):
    model_config = ConfigDict(extra='ignore', allow_inf_nan=False, strict=True)
    # Structured optional values only. freeText, names, and arbitrary clinical
    # documents are ignored by TransportModel and never reach the runtime.
    ageYears: Annotated[float | None, Field(ge=0, le=120)] = None
    sexAtBirth: Literal['female', 'male', 'other', 'unspecified'] | None = None
    symptoms: Annotated[list[Literal['chest-pain', 'dyspnea', 'syncope', 'palpitations', 'none']] | None, Field(max_length=5)] = None
    onset: Literal['now', 'hours', 'days', 'unknown'] | None = None
    history: Annotated[list[Literal['cardiac', 'hypertension', 'diabetes', 'family-sudden-death', 'none']] | None, Field(max_length=5)] = None
    medications: Annotated[list[Literal['qt-prolonging', 'av-nodal', 'digoxin', 'other', 'none']] | None, Field(max_length=5)] = None
    electrolytes: Literal['known-abnormal', 'normal', 'unknown'] | None = None
    paced: Literal['yes', 'no', 'unknown'] | None = None

    @field_validator('symptoms', 'history', 'medications')
    @classmethod
    def consistent_choices(cls, values):
        if values is None:
            return values
        choices = list(dict.fromkeys(values))
        if len(choices) > 1:
            choices = [value for value in choices if value != 'none']
        return choices


class Case(TransportModel):
    rhythmStrip: Literal['long','short'] | None = None
    rhythmTrace: Trace | None = None
    algorithmFindings: Annotated[list[Literal['sinus','af','rbbb','lbbb']],Field(max_length=4)] | None = None
    traces: dict[Lead, Trace]
    measurements: Measurements = Field(default_factory=Measurements)
    pattern: Literal['sinus', 'af', 'rbbb', 'lbbb', 'indeterminate'] = 'indeterminate'
    origin: Literal['simulation', 'clinical', 'research'] = 'research'
    findingOrigin: Literal['manual', 'algorithm', 'source', 'simulation'] = 'manual'
    synchronized: bool = False
    rhythmLead: Lead | None = None
    measurementOrigins: dict[Measure, Literal['automatic', 'caliper']] = Field(default_factory=dict)
    measurementReasons: dict[Measure, Annotated[str, Field(max_length=80)]] = Field(default_factory=dict)
    measurementWindows: dict[Measure, Annotated[list[MeasurementWindow], Field(max_length=1000)]] = Field(default_factory=dict)
    automaticMarkers: bool = False
    markers: Annotated[list[Marker], Field(max_length=1000)] = Field(default_factory=list)
    markersByLead: dict[Lead, Annotated[list[Marker], Field(max_length=1000)]] = Field(default_factory=dict)
    captureProvenance: Provenance | None = None
    clinicalContext: ClinicalContext | None = None

    @field_validator('measurementWindows', mode='before')
    @classmethod
    def valid_measurement_windows(cls, values):
        if not isinstance(values, dict):
            return {}
        result = {}
        for key in ('rateBpm', 'prMs', 'qrsMs', 'qtMs', 'axisDeg'):
            candidates = values.get(key)
            if not isinstance(candidates, list):
                continue
            valid = []
            for candidate in candidates[:1000]:
                try:
                    valid.append(MeasurementWindow.model_validate(candidate))
                except (ValidationError, TypeError):
                    continue
            if valid:
                result[key] = valid
        return result

    @model_validator(mode='after')
    def markers_within_signal(self):
        if not self.traces or len(self.traces) > 12:
            raise ValueError('One to twelve recognized leads are required')
        self.measurementWindows = {key: [window for window in windows if (self.rhythmTrace is not None and window.end <= self.rhythmTrace.seconds if window.captureLead == 'II-long' else window.lead in self.traces and window.end <= self.traces[window.lead].seconds)] for key, windows in self.measurementWindows.items()}
        self.measurementWindows = {key: windows for key, windows in self.measurementWindows.items() if windows}
        for lead, markers in self.markersByLead.items():
            if lead not in self.traces or any(marker.end > self.traces[lead].seconds for marker in markers):
                raise ValueError('Marker outside the matching signal')
        if self.markers and any(marker.end > min(trace.seconds for trace in self.traces.values()) for marker in self.markers):
            raise ValueError('Shared marker outside the signal')
        return self

    def anonymous_payload(self):
        payload = self.model_dump(exclude_none=True)
        payload['id'] = 'remote-analysis'
        provenance = payload.get('captureProvenance')
        if provenance and provenance.get('leadSources'):
            groups = {}
            provenance['leadSources'] = {
                lead: groups.setdefault(value, f'recording-{len(groups) + 1}')
                for lead, value in provenance['leadSources'].items()
            }
        return payload


class AnalysisRequest(TransportModel):
    schemaVersion: Literal[1]
    case: Case


class BodyLimit:
    """Bound request bytes before JSON parsing, even without Content-Length."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or scope['method'] not in ('POST', 'PUT', 'PATCH'):
            return await self.app(scope, receive, send)
        chunks = []
        size = 0
        while True:
            message = await receive()
            if message['type'] == 'http.disconnect':
                return
            chunk = message.get('body', b'')
            size += len(chunk)
            if size > MAX_BODY:
                return await JSONResponse({'detail': 'Request exceeds 8 MiB'}, status_code=413)(scope, receive, send)
            chunks.append(chunk)
            if not message.get('more_body', False):
                break
        message = {'type': 'http.request', 'body': b''.join(chunks), 'more_body': False}
        delivered = False

        async def bounded_receive():
            nonlocal delivered
            if not delivered:
                delivered = True
                return message
            return await receive()

        await self.app(scope, bounded_receive, send)


def configuration():
    origins = tuple(value.strip().rstrip('/') for value in os.getenv('CARDIOEKG_ALLOWED_ORIGINS', '').split(',') if value.strip())
    token = os.getenv('CARDIOEKG_API_TOKEN', '')
    if '*' in origins or any(not origin.startswith(('https://', 'http://localhost:', 'http://127.0.0.1:')) for origin in origins):
        return (), ''
    return origins, token


def create_app():
    api = FastAPI(title='CardioEKG optional analysis', version='1.0.0', docs_url=None, redoc_url=None, openapi_url=None)
    api.add_middleware(BodyLimit)

    @api.exception_handler(RequestValidationError)
    async def invalid_request(request: Request, error: RequestValidationError):
        return JSONResponse({'detail': 'Invalid calibrated signal request'}, status_code=422)

    slots = asyncio.BoundedSemaphore(2)

    @api.middleware('http')
    async def privacy_headers(request: Request, call_next):
        if request.method == 'POST' and request.url.path == '/api/analyze':
            try:
                authorize(request)
            except HTTPException as error:
                response = JSONResponse({'detail': error.detail}, status_code=error.status_code)
            else:
                response = await call_next(request)
        else:
            response = await call_next(request)
        response.headers['Cache-Control'] = 'no-store'
        response.headers['Pragma'] = 'no-cache'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        origins, _ = configuration()
        origin = request.headers.get('origin', '')
        if origin in origins:
            response.headers['Access-Control-Allow-Origin'] = origin
            response.headers['Vary'] = 'Origin'
        return response

    def authorize(request: Request):
        origins, token = configuration()
        if not origins or len(token) < 32:
            raise HTTPException(status_code=503, detail='Remote analysis is not configured')
        if request.headers.get('origin', '') not in origins:
            raise HTTPException(status_code=403, detail='Origin is not authorized')
        supplied = request.headers.get('authorization', '')
        if not hmac.compare_digest(supplied.encode(), ('Bearer ' + token).encode()):
            raise HTTPException(status_code=401, detail='Authentication required')

    @api.options('/api/analyze')
    @api.options('/api/measure')
    async def preflight(request: Request):
        origins, token = configuration()
        if request.headers.get('origin', '') not in origins or len(token) < 32:
            raise HTTPException(status_code=403, detail='Origin is not authorized')
        return JSONResponse({}, headers={
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Authorization, Content-Type',
            'Access-Control-Max-Age': '0',
        })

    @api.get('/health')
    async def health():
        origins, token = configuration()
        return {'service': 'CardioEKG', 'schemaVersion': 1,
                'configured': bool(origins and len(token) >= 32),
                'runtimeReady': (ROOT / 'runtime' / 'analyze.mjs').is_file(),
                'measureReady': (MEASURE_DIR / 'run_measure.py').is_file(),
                'storage': 'none', 'onnx': 'disabled-unless-explicitly-approved'}

    @api.post('/api/analyze')
    async def analyze(payload: AnalysisRequest, request: Request):
        authorize(request)
        if not (ROOT / 'runtime' / 'analyze.mjs').is_file():
            raise HTTPException(status_code=503, detail='Canonical analysis runtime is not built')
        try:
            await asyncio.wait_for(slots.acquire(), timeout=.01)
        except TimeoutError:
            raise HTTPException(status_code=429, detail='Analysis capacity is busy')
        process = None
        try:
            case = payload.case.anonymous_payload()
            provenance = case.get('captureProvenance') or {}
            comparable = 'I' in case['traces'] and 'aVF' in case['traces'] and bool(case.get('synchronized') or provenance.get('timing') == 'simultaneous' or provenance.get('userConfirmedComparable') or provenance.get('commonRecording') and provenance.get('commonCalibration')) and provenance.get('commonCalibration') is not False
            measure_input = {key: case[key] for key in ('traces', 'rhythmTrace', 'rhythmLead', 'measurementWindows') if key in case}
            measure_input['axisComparable'] = comparable
            measure_input['simultaneous'] = case.get('synchronized', False)
            python_analysis = await measure_signals_isolated(measure_input)
            case['measurementEngine'] = 'python'
            case['pythonAnalysis'] = python_analysis
            process = await asyncio.create_subprocess_exec(
                os.getenv('CARDIOEKG_NODE_BIN', 'node'), str(ROOT / 'runtime' / 'analyze.mjs'),
                stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
                cwd=ROOT,
                env={'PATH': os.getenv('PATH', ''), 'NODE_ENV': 'production'},
            )
            raw = json.dumps(case, allow_nan=False, separators=(',', ':')).encode()
            output, _ = await asyncio.wait_for(process.communicate(raw), timeout=30)
            if process.returncode != 0 or len(output) > MAX_RESPONSE:
                raise ValueError('Invalid canonical runtime response')
            analysis = json.loads(output)
            if analysis.get('schemaVersion') != 1 or not isinstance(analysis.get('leads'), list) or len(analysis['leads']) != 12:
                raise ValueError('Incompatible canonical analysis')
            return {'schemaVersion': 1, 'analysis': analysis}
        except TimeoutError:
            if process and process.returncode is None:
                process.kill()
                await process.wait()
            raise HTTPException(status_code=504, detail='Analysis timed out')
        except (ValueError, OSError, json.JSONDecodeError):
            raise HTTPException(status_code=503, detail='Analysis could not be completed')
        finally:
            if process and process.returncode is None:
                process.kill()
                await process.wait()
            slots.release()

    @api.post('/api/measure')
    async def measure(request: Request, layout: str = 'auto', vel: float | None = None, gain: float | None = None, px_mm: float | None = None):
        """Mide un ECG (PDF vectorial, PDF escaneado, PNG o JPG) con ecg_analisis.py. Cuerpo = bytes del archivo.
        El archivo es un dato no confiable: se valida por firma, se guarda en un directorio temporal nuevo y vacío y se lee con
        `python -I` en un subproceso con entorno mínimo y plazo de 60 s. No se conserva nada."""
        authorize(request)
        if not (MEASURE_DIR / 'run_measure.py').is_file():
            raise HTTPException(status_code=503, detail='Measurement engine is not installed')
        if not re.fullmatch(r'auto|3x4r|3x4|6x2|12x1|(?:(?:I|II|III|aVR|aVL|aVF|V[1-6])(?:,(?:I|II|III|aVR|aVL|aVF|V[1-6]))*)(?:/(?:(?:I|II|III|aVR|aVL|aVF|V[1-6])(?:,(?:I|II|III|aVR|aVL|aVF|V[1-6]))*))*', layout):
            raise HTTPException(status_code=422, detail='Invalid layout')
        for value, low, high in ((vel, 5, 100), (gain, 2.5, 40), (px_mm, 2, 60)):
            if value is not None and not (low <= value <= high):
                raise HTTPException(status_code=422, detail='Calibration value out of range')
        body = await request.body()
        extension = next((ext for magic, ext in MEASURE_MAGIC if body.startswith(magic)), None)
        if not body or extension is None:
            raise HTTPException(status_code=415, detail='Only PDF, PNG or JPEG files are accepted')
        try:
            await asyncio.wait_for(slots.acquire(), timeout=.01)
        except TimeoutError:
            raise HTTPException(status_code=429, detail='Analysis capacity is busy')
        process = None
        try:
            with tempfile.TemporaryDirectory(prefix='cardioekg-measure-') as work:
                source = Path(work) / ('ecg' + extension)
                source.write_bytes(body)
                command = [sys.executable, '-I', str(MEASURE_DIR / 'run_measure.py'), str(source), '--layout', layout]
                for flag, value in (('--vel', vel), ('--ganancia', gain), ('--px_mm', px_mm)):
                    if value is not None:
                        command += [flag, repr(float(value))]
                process = await asyncio.create_subprocess_exec(
                    *command, stdin=asyncio.subprocess.DEVNULL, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
                    cwd=work, env={'PATH': os.getenv('PATH', ''), 'MPLCONFIGDIR': work, 'OMP_NUM_THREADS': '1'})
                output, _ = await asyncio.wait_for(process.communicate(), timeout=60)
            if process.returncode != 0 or len(output) > MAX_RESPONSE:
                raise ValueError('Invalid measurement response')
            result = json.loads(output)
            if result.get('schemaVersion') != 1 or 'ok' not in result:
                raise ValueError('Incompatible measurement result')
            if not result['ok']:
                raise HTTPException(status_code=422, detail=str(result.get('error', 'The ECG could not be read'))[:300])
            return result
        except TimeoutError:
            if process and process.returncode is None:
                process.kill()
                await process.wait()
            raise HTTPException(status_code=504, detail='Measurement timed out')
        except (ValueError, OSError, json.JSONDecodeError):
            raise HTTPException(status_code=503, detail='Measurement could not be completed')
        finally:
            if process and process.returncode is None:
                process.kill()
                await process.wait()
            slots.release()

    return api


app = create_app()
