# Análisis remoto opcional y autohospedable

La publicación pública sigue funcionando localmente. Este servidor es una opción de despliegue institucional, no un servicio contratado ni un servidor activo. El usuario debe configurar un endpoint autorizado y dar consentimiento explícito antes de enviar señales. No se incluyen imágenes, PDF, texto libre, nombres, identificadores, nombres de archivo ni datos de cuenta. El contexto clínico estructurado es opcional y solo se transmite después del consentimiento para el análisis remoto.

## Mismo análisis local y remoto

`server/build-runtime.mjs` empaqueta `analyzeCase` desde `src/ecg/analyze.ts`, exactamente el motor del visor y del informe. El transporte FastAPI valida y reduce la entrada, sustituye identificadores de origen por grupos anónimos y ejecuta ese motor con JSON por stdin, sin shell ni archivos temporales. La respuesta es:

```json
{"schemaVersion":1,"analysis":{"schemaVersion":1,"algorithmVersion":"...","leads":[]}}
```

`analysis` respeta `CaseAnalysis` de `src/ecg/analysisTypes.ts`; incluye las doce derivaciones, incluso cuando faltan señales. No constituye una segunda implementación Python con números distintos. La inferencia ONNX se mantiene separada y desactivada hasta disponer de un modelo y contrato de entrada aprobados.

## Preparación local

Desde la raíz del repositorio:

```sh
npm ci
node server/build-runtime.mjs
python3 -m venv /tmp/cardioekg-api-venv
/tmp/cardioekg-api-venv/bin/pip install -r server/requirements.txt
```

Configurar `CARDIOEKG_API_TOKEN` con un secreto aleatorio de al menos 32 caracteres y `CARDIOEKG_ALLOWED_ORIGINS` con orígenes exactos separados por comas. No se aceptan comodines. Los secretos se suministran al proceso, nunca a la compilación pública del sitio. El navegador debe pedir el token para esa sesión en una instalación autorizada; no guardarlo en almacenamiento persistente.

```sh
/tmp/cardioekg-api-venv/bin/uvicorn app:app --app-dir server --host 127.0.0.1 --port 8000 --no-access-log --log-level warning
```

En producción debe usarse TLS, un proxy sin registro de cuerpos, límites adicionales por identidad/IP y controles institucionales. No exponer directamente el puerto de desarrollo a Internet. No se aprovisiona ni paga alojamiento.

Alternativa contenedor, desde la raíz:

```sh
docker build -f server/Dockerfile -t cardioekg-api .
docker run --rm --read-only --tmpfs /tmp -p 127.0.0.1:8000:8000 --env-file /ruta/privada/cardioekg.env cardioekg-api
```

## Contrato y límites

- `GET /health`: informa si la configuración y el motor están disponibles; no expone secretos, señales ni rutas internas.
- `OPTIONS /api/analyze`: solo para los orígenes configurados; no utiliza cookies.
- `POST /api/analyze`: requiere `Origin` exacto, `Authorization: Bearer <token>` y JSON `{"schemaVersion":1,"case":{...}}`.
- `case` utiliza los campos de señal de `ViewerCase`: `traces`, `measurements`, `pattern`, `origin`, `findingOrigin`, `synchronized`, `rhythmLead`, procedencia de medidas, límites temporales y calibración. `measurementWindows` conserva los intervalos manuales válidos por medida (`lead`, `start`, `end`, en segundos); se descartan únicamente las ventanas con derivación desconocida/ausente, límites invertidos o fuera de la señal. Los campos adicionales se descartan. Los identificadores del caso se sustituyen y `leadSources` conserva solo grupos de igualdad anónimos.
- `clinicalContext` admite únicamente edad entre 0 y 120 años, sexo declarado, síntomas, momento de inicio, antecedentes, categorías de medicamentos, estado de electrolitos y marcapasos mediante enumeraciones cerradas. Se conservan los valores desconocidos explícitos. Las notas `freeText` y cualquier campo de identificación se descartan antes del motor. La interfaz pública para adultos y las restricciones institucionales siguen aplicándose.
- Máximo 8 MiB por solicitud, doce derivaciones reconocidas, 30 segundos, 100.000 muestras por derivación, 5.000 muestras/s y amplitudes finitas dentro del límite de transporte de ±100 mV. Estos límites son técnicos y no definen normalidad clínica.
- Dos análisis simultáneos por proceso; los siguientes reciben HTTP 429. Tiempo máximo de 30 segundos, con finalización del subproceso.
- Respuestas y errores llevan `Cache-Control: no-store`. No hay base de datos, archivos de señal, almacenamiento de solicitudes ni llamadas a terceros.
- Errores 401/403: autenticación/origen; 413: tamaño; 422: contrato inválido; 503: configuración o motor no disponible; 504: tiempo agotado. Los mensajes no devuelven el cuerpo de señal ni el stderr del motor.

La no retención del proceso no configura automáticamente los registros, backups o telemetría de un proveedor de alojamiento. Esa revisión corresponde a la instalación autorizada.

## Modelos ONNX

`server/onnx_manifest.py` prepara un adaptador CPU que falla cerrado. Requiere un manifiesto local con `schemaVersion:1`, lista ordenada `labels`, `inputShapes`, `modelFile`, SHA-256, `approvedForPublicUse:true` y evidencia declarada de validación externa y calibración. Valida rutas, huella, forma, finitud y salida de probabilidades.

El adaptador no está conectado a `/api/analyze` y no se activa por existir un archivo de pesos. Un administrador responsable debe revisar datos, licencias, métricas por clase y contrato antes de habilitar una integración de inferencia. Un booleano en un manifiesto no demuestra por sí mismo validación clínica; es una barrera técnica para evitar activación accidental. No se envían señales a OpenEvidence ni a modelos de terceros.

## Pruebas

```sh
/tmp/cardioekg-api-venv/bin/pip install -r server/requirements-test.txt
/tmp/cardioekg-api-venv/bin/python -m unittest discover -s server -p test_app.py
node server/build-runtime.mjs
node --test server/bridge.test.mjs
```

Se comprueban autenticación y origen, tamaño/forma, eliminación de identificadores, ausencia de archivos de señal, errores sin datos sensibles, tiempo agotado, límite de concurrencia y bloqueo de candidatos ONNX no aprobados. También se ejecuta una petición HTTP real contra el puente canónico con correcciones manuales. La prueba del puente compara la salida con una ejecución directa del mismo motor. No equivale a una validación clínica ni prueba una infraestructura externa no desplegada.

### Entorno comprobado

Pruebas ejecutadas con Python 3.12, FastAPI 0.141.1, Pydantic 2.13.4 y httpx 0.28.1, disponibles en el entorno compartido. La descarga inicial de dependencias desde PyPI devolvió HTTP 503; se usaron las bibliotecas ya instaladas para ejecutar los tests. El contenedor no se considera probado hasta construirlo en un entorno con acceso a los registros de paquetes.
