import asyncio
import json
from pathlib import Path
import inspect
import os
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
import app as service
from onnx_manifest import approved_manifest, ModelNotApproved

ORIGIN = 'https://cardioscopio-ecg.dorydaza.chatgpt.site'
TOKEN = 'test-secret-token-longer-than-thirty-two-characters'
HEADERS = {'Origin': ORIGIN, 'Authorization': 'Bearer ' + TOKEN}


def case():
    return {'schemaVersion': 1, 'case': {'traces': {'II': {'mv': [0, .1, .2, .1] * 50, 'seconds': 2}},
            'measurements': {}, 'patientName': 'MUST-NOT-LEAVE-REQUEST', 'sourceUrl': 'https://sensitive.invalid/record',
            'id': 'sensitive-record', 'captureProvenance': {'commonRecording': True, 'commonCalibration': True,
            'timing': 'sequential', 'leadSources': {'II': 'sensitive-file.jpg'}}}}


def configured(monkeypatch, real_measurements=False):
    if not real_measurements:
        async def mock_measurements(_payload):
            return {'schemaVersion': 1, 'ok': True, 'engine': 'test'}
        monkeypatch.setattr(service, 'measure_signals_isolated', mock_measurements)
    monkeypatch.setenv('CARDIOEKG_ALLOWED_ORIGINS', ORIGIN)
    monkeypatch.setenv('CARDIOEKG_API_TOKEN', TOKEN)
    return TestClient(service.create_app())


def test_fails_closed_for_missing_config_origin_and_token(monkeypatch):
    monkeypatch.delenv('CARDIOEKG_API_TOKEN', raising=False)
    monkeypatch.delenv('CARDIOEKG_ALLOWED_ORIGINS', raising=False)
    client = TestClient(service.create_app())
    assert client.post('/api/analyze', json=case(), headers=HEADERS).status_code == 503
    client = configured(monkeypatch)
    assert client.post('/api/analyze', json=case(), headers={'Origin': 'https://other.invalid', 'Authorization': 'Bearer ' + TOKEN}).status_code == 403
    assert client.post('/api/analyze', json=case(), headers={'Origin': ORIGIN}).status_code == 401
    assert client.post('/api/analyze', json=case(), headers={'Authorization': 'Bearer ' + TOKEN}).status_code == 403
    assert client.options('/api/analyze', headers={'Origin': ORIGIN}).status_code == 200
    assert client.options('/api/analyze', headers={'Origin': 'https://other.invalid'}).status_code == 403
    monkeypatch.setenv('CARDIOEKG_ALLOWED_ORIGINS', '*')
    assert client.post('/api/analyze', json=case(), headers=HEADERS).status_code == 503


def test_validates_transport_and_does_not_expose_payload(monkeypatch):
    client = configured(monkeypatch)
    for transform in [
        lambda value: value['case']['traces']['II'].update(seconds=31),
        lambda value: value['case']['traces']['II'].update(mv=[101]),
        lambda value: value['case']['traces'].update(X={'mv': [0], 'seconds': 1}),
        lambda value: value['case'].update(markersByLead={'II': [{'start': 1, 'end': 3, 'phase': 'qrs'}]}),
        lambda value: value.update(schemaVersion=2),
    ]:
        request = case()
        transform(request)
        response = client.post('/api/analyze', json=request, headers=HEADERS)
        assert response.status_code == 422
        assert 'MUST-NOT-LEAVE-REQUEST' not in response.text
    response = client.post('/api/analyze', content=b'x' * (service.MAX_BODY + 1), headers=HEADERS)
    assert response.status_code == 413
    assert response.headers['cache-control'] == 'no-store'


def test_identifiers_are_removed_and_analysis_has_no_persistence(monkeypatch, tmp_path):
    client = configured(monkeypatch)
    runtime = tmp_path / 'runtime'
    runtime.mkdir()
    (runtime / 'analyze.mjs').write_text('// fixed test runtime')
    monkeypatch.setattr(service, 'ROOT', tmp_path)
    sent = []
    analysis = {'schemaVersion': 1, 'algorithmVersion': 'test', 'leads': [{'lead': lead} for lead in service.LEADS]}

    class Process:
        returncode = 0
        async def communicate(self, data):
            sent.append(json.loads(data))
            return json.dumps(analysis).encode(), b''

    async def spawn(*args, **kwargs):
        assert args[-1] == str(runtime / 'analyze.mjs')
        assert kwargs['cwd'] == tmp_path
        return Process()

    monkeypatch.setattr(asyncio, 'create_subprocess_exec', spawn)
    before = sorted(str(path) for path in tmp_path.rglob('*'))
    response = client.post('/api/analyze', json=case(), headers=HEADERS)
    assert response.status_code == 200
    assert response.json() == {'schemaVersion': 1, 'analysis': analysis}
    raw = json.dumps(sent)
    assert 'MUST-NOT-LEAVE-REQUEST' not in raw
    assert 'sensitive-record' not in raw
    assert 'sensitive-file' not in raw
    assert 'sourceUrl' not in raw
    assert sent[0]['id'] == 'remote-analysis'
    assert sent[0]['captureProvenance']['leadSources']['II'] == 'recording-1'
    assert sorted(str(path) for path in tmp_path.rglob('*')) == before
    assert response.headers['access-control-allow-origin'] == ORIGIN
    assert response.headers['cache-control'] == 'no-store'


def test_bad_runtime_response_is_not_returned(monkeypatch, tmp_path):
    client = configured(monkeypatch)
    (tmp_path / 'runtime').mkdir()
    (tmp_path / 'runtime' / 'analyze.mjs').write_text('// test')
    monkeypatch.setattr(service, 'ROOT', tmp_path)
    class Process:
        returncode = 0
        async def communicate(self, data):
            return b'{"patientName":"bad-runtime-leak"}', b'private stderr'
    async def spawn(*args, **kwargs):
        return Process()
    monkeypatch.setattr(asyncio, 'create_subprocess_exec', spawn)
    response = client.post('/api/analyze', json=case(), headers=HEADERS)
    assert response.status_code == 503
    assert 'bad-runtime-leak' not in response.text
    assert 'private stderr' not in response.text


def test_onnx_candidate_cannot_activate_itself_without_external_gates(tmp_path):
    path = tmp_path / 'manifest.json'
    for manifest in [{}, {'schemaVersion': 1, 'approvedForPublicUse': True, 'validation': {'externalPassed': False, 'calibrated': True}}]:
        path.write_text(json.dumps(manifest))
        try:
            approved_manifest(path)
            assert False, 'Unapproved candidate loaded'
        except ModelNotApproved:
            pass


def test_timeout_kills_the_runtime_without_returning_its_output(monkeypatch, tmp_path):
    client = configured(monkeypatch)
    (tmp_path / 'runtime').mkdir()
    (tmp_path / 'runtime' / 'analyze.mjs').write_text('// test')
    monkeypatch.setattr(service, 'ROOT', tmp_path)
    process = None
    class Process:
        returncode = None
        killed = False
        async def communicate(self, data):
            raise TimeoutError()
        def kill(self):
            self.killed = True
            self.returncode = -9
        async def wait(self):
            return self.returncode
    process = Process()
    async def spawn(*args, **kwargs):
        return process
    monkeypatch.setattr(asyncio, 'create_subprocess_exec', spawn)
    response = client.post('/api/analyze', json=case(), headers=HEADERS)
    assert response.status_code == 504
    assert process.killed


def test_at_most_two_concurrent_analyses(monkeypatch, tmp_path):
    import httpx
    configured(monkeypatch)
    (tmp_path / 'runtime').mkdir()
    (tmp_path / 'runtime' / 'analyze.mjs').write_text('// test')
    monkeypatch.setattr(service, 'ROOT', tmp_path)
    async def scenario():
        release = asyncio.Event()
        processes = []
        class Process:
            returncode = 0
            async def communicate(self, data):
                await release.wait()
                return json.dumps({'schemaVersion': 1, 'leads': [{'lead': lead} for lead in service.LEADS]}).encode(), b''
        async def spawn(*args, **kwargs):
            process = Process()
            processes.append(process)
            return process
        monkeypatch.setattr(asyncio, 'create_subprocess_exec', spawn)
        transport = httpx.ASGITransport(app=service.create_app())
        async with httpx.AsyncClient(transport=transport, base_url='http://test') as client:
            first = asyncio.create_task(client.post('/api/analyze', json=case(), headers=HEADERS))
            second = asyncio.create_task(client.post('/api/analyze', json=case(), headers=HEADERS))
            for _ in range(1000):
                if len(processes) == 2: break
                await asyncio.sleep(.001)
            assert len(processes) == 2
            third = await client.post('/api/analyze', json=case(), headers=HEADERS)
            assert third.status_code == 429
            release.set()
            assert (await first).status_code == 200
            assert (await second).status_code == 200
    asyncio.run(scenario())


def test_real_canonical_http_transport(monkeypatch):
    runtime = service.ROOT / 'runtime' / 'analyze.mjs'
    if not runtime.is_file():
        raise unittest.SkipTest('Build the canonical bridge first')
    client = configured(monkeypatch, real_measurements=True)
    import subprocess
    fixture = json.loads((service.ROOT.parent / 'src' / 'data' / 'normal.json').read_text())
    item = {'traces': {lead: {'mv': values, 'seconds': len(values) / fixture['sampleRate']} for lead, values in fixture['signals'].items()},
            'measurements': {'prMs': 174, 'axisDeg': 0}, 'measurementOrigins': {'prMs': 'caliper', 'axisDeg': 'caliper'},
            'synchronized': False, 'origin': 'clinical', 'findingOrigin': 'source',
            'measurementWindows': {'prMs': [{'lead': 'II', 'start': .5, 'end': .674}]},
            'clinicalContext': {'ageYears': 64, 'sexAtBirth': 'female', 'symptoms': ['chest-pain'], 'onset': 'now', 'history': ['hypertension'], 'medications': ['qt-prolonging'], 'electrolytes': 'known-abnormal', 'paced': 'no'}}
    normalized = service.Case.model_validate(item).anonymous_payload()
    measure_input = {key: normalized[key] for key in ('traces', 'rhythmTrace', 'rhythmLead', 'measurementWindows') if key in normalized}
    measure_input['axisComparable'] = False
    normalized['pythonAnalysis'] = asyncio.run(service.measure_signals_isolated(measure_input))
    normalized['measurementEngine'] = 'python'
    expected = subprocess.run(['node', str(runtime)], input=json.dumps(normalized), capture_output=True, text=True, check=True, timeout=30)
    response = client.post('/api/analyze', json={'schemaVersion': 1, 'case': item}, headers=HEADERS)
    assert response.status_code == 200
    assert response.json()['analysis'] == json.loads(expected.stdout)
    pr = next(m for m in response.json()['analysis']['measurements'] if m['key'] == 'prMs')
    assert abs(pr['value'] - 174) < 1e-9
    assert pr['windows'] == [{'lead': 'II', 'start': .5, 'end': .674, 'source': 'manual'}]
    assert next(m for m in response.json()['analysis']['measurements'] if m['key'] == 'axisDeg')['value'] is None


def test_valid_manual_measurement_windows_survive_invalid_neighbors_without_identifiers():
    value = case()['case']
    value['measurementWindows'] = {
        'prMs': [
            {'lead': 'II', 'start': .2, 'end': .374, 'patientName': 'STRIPPED'},
            {'lead': 'X', 'start': .2, 'end': .4},
            {'lead': 'II', 'start': .7, 'end': .2},
            {'lead': 'I', 'start': .1, 'end': .2},
            {'lead': 'II', 'start': 1.9, 'end': 2.5},
        ],
        'qrsMs': 'invalid', 'unknownMeasure': [{'lead': 'II', 'start': .1, 'end': .2}],
    }
    result = service.Case.model_validate(value).anonymous_payload()
    assert result['measurementWindows'] == {'prMs': [{'lead': 'II', 'start': .2, 'end': .374}]}
    assert 'STRIPPED' not in json.dumps(result)


def test_structured_context_survives_without_forwarding_free_text_or_names(monkeypatch):
    configured(monkeypatch)
    value = case()['case']
    value['clinicalContext'] = {
        'ageYears': 64, 'sexAtBirth': 'female', 'symptoms': ['chest-pain', 'dyspnea'],
        'onset': 'hours', 'history': ['hypertension'], 'medications': ['qt-prolonging'],
        'electrolytes': 'known-abnormal', 'paced': 'no',
        'freeText': 'PATIENT-SECRET-NOTES', 'patientName': 'PATIENT-NAME', 'recordId': 'PATIENT-ID',
    }
    result = service.Case.model_validate(value).anonymous_payload()
    assert result['clinicalContext'] == {
        'ageYears': 64, 'sexAtBirth': 'female', 'symptoms': ['chest-pain', 'dyspnea'],
        'onset': 'hours', 'history': ['hypertension'], 'medications': ['qt-prolonging'],
        'electrolytes': 'known-abnormal', 'paced': 'no',
    }
    assert 'PATIENT-' not in json.dumps(result)
    unknown = service.Case.model_validate({**value, 'clinicalContext': {'sexAtBirth': 'unspecified', 'onset': 'unknown', 'electrolytes': 'unknown', 'paced': 'unknown'}})
    assert unknown.anonymous_payload()['clinicalContext']['onset'] == 'unknown'
    client = TestClient(service.create_app())
    for context in [{'ageYears': -1}, {'ageYears': 121}, {'ageYears': '64'}, {'sexAtBirth': 'unrecognized'}, {'symptoms': ['not-a-symptom']}, {'medications': ['specific-private-name']}]:
        response = client.post('/api/analyze', json={'schemaVersion': 1, 'case': {**value, 'clinicalContext': context}}, headers=HEADERS)
        assert response.status_code == 422
        assert 'specific-private-name' not in response.text


def test_python_measurement_timeout_kills_and_reaps_subprocess(monkeypatch):
    class Process:
        returncode = None
        killed = False
        waited = False
        async def communicate(self, data):
            await asyncio.Event().wait()
        def kill(self):
            self.killed = True
            self.returncode = -9
        async def wait(self):
            self.waited = True
            return self.returncode
    process = Process()
    async def spawn(*args, **kwargs):
        return process
    monkeypatch.setattr(asyncio, 'create_subprocess_exec', spawn)
    async def run():
        try:
            await service.measure_signals_isolated({'traces': {}}, timeout=.01)
            assert False, 'Expected timeout'
        except TimeoutError:
            pass
    asyncio.run(run())
    assert process.killed and process.waited


def test_python_measurement_failure_does_not_fall_back_to_node(monkeypatch, tmp_path):
    client = configured(monkeypatch)
    (tmp_path / 'runtime').mkdir()
    (tmp_path / 'runtime' / 'analyze.mjs').write_text('// test')
    monkeypatch.setattr(service, 'ROOT', tmp_path)
    async def fail(_payload):
        raise ValueError('private measurement error')
    async def unexpected_spawn(*args, **kwargs):
        assert False, 'Node must not run without Python measurements'
    monkeypatch.setattr(service, 'measure_signals_isolated', fail)
    monkeypatch.setattr(asyncio, 'create_subprocess_exec', unexpected_spawn)
    response = client.post('/api/analyze', json=case(), headers=HEADERS)
    assert response.status_code == 503
    assert 'private measurement error' not in response.text


# Standard-library runner keeps backend verification independent of pytest.
class _Patch:
    def __init__(self): self.active=[]
    def setenv(self,key,value):
        handle=patch.dict(os.environ,{key:value});handle.start();self.active.append(handle)
    def delenv(self,key,raising=True):
        handle=patch.dict(os.environ);handle.start();self.active.append(handle);os.environ.pop(key,None)
    def setattr(self,obj,key,value):
        handle=patch.object(obj,key,value);handle.start();self.active.append(handle)
    def close(self):
        for handle in reversed(self.active):handle.stop()

class ServiceTests(unittest.TestCase):
    pass

def _as_unittest(function):
    def run(self):
        edits=_Patch()
        try:
            with tempfile.TemporaryDirectory() as folder:
                params={'monkeypatch':edits,'tmp_path':Path(folder)}
                function(**{key:params[key] for key in inspect.signature(function).parameters})
        finally:edits.close()
    return run

for _name,_function in list(globals().items()):
    if _name.startswith('test_') and callable(_function):setattr(ServiceTests,_name,_as_unittest(_function))

if __name__=='__main__':unittest.main()

class LongStripContractTests(unittest.TestCase):
    def test_manual_long_windows_keep_capture_identity_and_duration(self):
        from app import Case
        case=Case.model_validate({'traces':{'II':{'mv':[0.0]*250,'seconds':1}},'rhythmTrace':{'mv':[0.0]*2500,'seconds':10},'measurementWindows':{'qrsMs':[{'lead':'II','captureLead':'II-long','start':8,'end':8.12}]}})
        window=case.anonymous_payload()['measurementWindows']['qrsMs'][0]
        self.assertEqual(window['captureLead'],'II-long')
        self.assertEqual(window['start'],8)
