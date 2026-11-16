"""Pruebas de /api/measure con ECG sintéticos de valores conocidos (measure/gen_sintetico.py)."""
import json
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import app as service
from test_app import HEADERS, ORIGIN, TOKEN

MEASURE = Path(__file__).resolve().parent / 'measure'


@pytest.fixture(scope='module')
def sinteticos(tmp_path_factory):
    work = tmp_path_factory.mktemp('sint')
    subprocess.run([sys.executable, '-I', str(MEASURE / 'gen_sintetico.py')], cwd=work, check=True, capture_output=True, timeout=300)
    return work / 'sint', json.loads((work / 'sint' / 'verdad.json').read_text())


def client(monkeypatch):
    monkeypatch.setenv('CARDIOEKG_ALLOWED_ORIGINS', ORIGIN)
    monkeypatch.setenv('CARDIOEKG_API_TOKEN', TOKEN)
    return TestClient(service.create_app())


@pytest.mark.parametrize('nombre,extension', [('A_3x4r_etiquetas', 'pdf'), ('B_6x2_etiquetas', 'pdf'), ('E_3x4r_50mms', 'png')])
def test_mide_los_sinteticos_dentro_de_la_tolerancia(monkeypatch, sinteticos, nombre, extension):
    # En imagen la velocidad no está en el texto del archivo: el cliente la envía desde la calibración de captura.
    consulta = '?vel=50&gain=10' if nombre.startswith('E_') else ''
    carpeta, verdad = sinteticos
    real = verdad[nombre]
    respuesta = client(monkeypatch).post('/api/measure' + consulta, headers=HEADERS, content=(carpeta / f'{nombre}.{extension}').read_bytes())
    assert respuesta.status_code == 200, respuesta.text
    cuerpo = respuesta.json()
    medido = cuerpo['measurements']
    assert abs(medido['rateBpm'] - real['FC']) <= 3
    assert abs(medido['qrsMs'] - real['QRS']) <= 8
    assert abs(medido['axisDeg'] - real['eje_QRS']) <= 3
    # PR y QT salen más cortos que el nominal (sesgo documentado en el método): se acota, no se iguala
    assert -25 <= medido['prMs'] - real['PR'] <= 0
    assert -40 <= medido['qtMs'] - real['QT'] <= 0
    assert set(cuerpo['traces']) == {'I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'}
    assert cuerpo['quality']['warnings'] is not None
    assert cuerpo['ranges']['qrsMs'][0] <= cuerpo['ranges']['qrsMs'][1]
    assert 'NaN' not in respuesta.text


def test_exige_autenticacion_y_origen(monkeypatch, sinteticos):
    carpeta, _ = sinteticos
    datos = (carpeta / 'A_3x4r_etiquetas.pdf').read_bytes()
    c = client(monkeypatch)
    assert c.post('/api/measure', headers={'Origin': ORIGIN}, content=datos).status_code == 401
    assert c.post('/api/measure', headers={'Origin': 'https://otro.invalid', 'Authorization': 'Bearer ' + TOKEN}, content=datos).status_code == 403


def test_rechaza_archivos_que_no_son_ecg_y_parametros_peligrosos(monkeypatch):
    c = client(monkeypatch)
    assert c.post('/api/measure', headers=HEADERS, content=b'#!/bin/sh\necho hola').status_code == 415
    assert c.post('/api/measure', headers=HEADERS, content=b'').status_code == 415
    pdf = b'%PDF-1.4 no es un ecg'
    assert c.post('/api/measure?layout=../../etc/passwd', headers=HEADERS, content=pdf).status_code == 422
    assert c.post('/api/measure?vel=0', headers=HEADERS, content=pdf).status_code == 422
    # un PDF inválido no devuelve trazas de pila ni rutas
    r = c.post('/api/measure', headers=HEADERS, content=pdf)
    assert r.status_code in (422, 503) and 'Traceback' not in r.text and '/tmp' not in r.text


def test_no_deja_archivos_ni_hereda_el_entorno(monkeypatch, sinteticos, tmp_path):
    carpeta, _ = sinteticos
    aislado = tmp_path / 'tmp'
    aislado.mkdir()
    monkeypatch.setattr(service.tempfile, 'tempdir', str(aislado))
    monkeypatch.setenv('SECRET_CANARY', 'no-debe-llegar-al-subproceso')
    vistos = {}
    original = service.asyncio.create_subprocess_exec

    async def espia(*args, **kwargs):
        vistos.update(kwargs)
        vistos['args'] = args
        return await original(*args, **kwargs)
    monkeypatch.setattr(service.asyncio, 'create_subprocess_exec', espia)
    r = client(monkeypatch).post('/api/measure', headers=HEADERS, content=(carpeta / 'D_3x4_sin_etiquetas.pdf').read_bytes())
    assert r.status_code == 200
    assert 'SECRET_CANARY' not in vistos['env'] and '-I' in vistos['args']
    assert list(aislado.iterdir()) == []
