# Motor central de medición Python

CardioEKG conserva la etiqueta de producto v22.1 y publica el motor compartido `cardioekg-analysis-2.7.0`, con base de razonamiento `cardioekg-kb-1.4.0`. Python deja de ser un comparador opcional: los puntos de entrada de la aplicación (captura, visor, ejemplos e informe) calculan automáticamente mediante el mismo motor Python local. El visor no presenta valores del simulador ni resultados del estimador JavaScript anterior como sustitutos si Python está pendiente o falla.

## Flujo real

1. La captura convierte una imagen o página PDF en señales calibradas con las herramientas de reconstrucción locales existentes. Esto sigue siendo digitalización, no un clasificador clínico aprendido. Los casos digitales y simulados ya contienen señales en mV.
2. Un único worker carga Pyodide 0.27.7, NumPy, SciPy y Pillow desde su distribución oficial fijada. La primera ejecución descarga aproximadamente 38 MB y requiere conexión; ningún ECG se envía al CDN. El runtime se reutiliza, las tareas se serializan y la cancelación de una tarea activa termina su worker.
3. `measure_signals` en `server/measure/run_measure.py` remuestrea cada derivación a 1 kHz y ejecuta `ecg_analisis.py`. Devuelve medidas, detalle por derivación, límites P/QRS y final de T, advertencias, correcciones manuales y QTc cuando puede sostenerlo. El inicio de T no se delimita: no se inventa una banda temporal de T para animar el corazón.
4. La tira larga aporta la frecuencia cuando existe. El eje requiere procedencia/calibración compatibles y un ajuste coherente de las derivaciones de miembros; un registro irregular puede dejarlo sin estimación. En segmentos sucesivos, el QRS usa consenso local con corroboración entre derivaciones; una duración discordante se conserva para revisión y no domina automáticamente el agregado. Solo registros explícitamente simultáneos y con tiempos compatibles permiten delimitación multiderivación alineada.
5. Los compases conservan la selección del usuario, pero Python calcula los intervalos y áreas a partir de esas ventanas. Una cifra manual sin ventana sustentada no reemplaza una medida automática. La identidad de caché incluye señales, tira larga, ventanas, comparabilidad y sincronía; un cambio invalida el resultado previo.
6. El visor y el informe consumen el mismo resultado. El diagnóstico se deriva mediante reglas clínicas explícitas sobre esas medidas y el contexto; los pesos experimentales de Wave-Maven permanecen inactivos. Un diagnóstico de referencia se identifica por separado y nunca se usa como predictor de su propio caso.

El panel separado «Medir y comparar» se retiró de la aplicación. Si Python falla, se conservan los trazados, se informa del fallo y se permite reintentar; no se activa silenciosamente otro estimador. Las funciones JavaScript de medición históricas permanecen en el repositorio para pruebas/regresiones y compatibilidad de herramientas antiguas; no calculan las medidas del flujo público marcado como Python.

## Servidor opcional

`POST /api/analyze` calcula primero con el mismo Python en un subproceso aislado y después aplica el módulo de razonamiento compartido. Una entrada del cliente no puede aportar su propio resultado Python como si lo hubiera calculado el servidor. Se mantiene autenticación, consentimiento, validación, concurrencia limitada, plazo y limpieza. El servicio remoto no está contratado ni configurado en el sitio público.

`POST /api/measure` conserva la lectura de archivos PDF vectoriales/raster o imágenes para instalaciones propias; la interfaz central pública usa las señales revisadas de la captura. Matplotlib y pdfplumber se importan solo cuando se requieren para gráficos/PDF. Los archivos Python de `dist/python-engine/` son los mismos de `server/measure/`, emitidos por Vite sin duplicar el método. El worker incluye esas fuentes canónicas en su propio archivo con hash para que una caché HTTP antigua no mezcle versiones del código Python.

## Límites observados

- El método usa latidos medianos y proyecta sus límites sobre los picos detectados: no es delineación médica individual de cada latido.
- Puede fallar en derivaciones de bajo voltaje, ruido, taquicardia, QRS ancho o P no reproducible. Los fallos se conservan como advertencias del análisis y del informe.
- En pruebas sintéticas persiste un QT menor que el definido por el generador. La prueba de BRD muestra S terminal pero puede omitir RSR′. El BRI expuso una P superpuesta al QRS: ahora se rechaza ese PR falso.
- No detectar P no demuestra su ausencia. No se calcula QTc como fiable con RR irregular o QRS ancho; no se convierte incertidumbre en normalidad.
- Estas pruebas y el experimento de Wave-Maven no acreditan validación clínica ni garantizan acertar un caso nuevo o uno del catálogo.

## Reproducción

- `npm test` y `npm run build` para aplicación y razonamiento.
- `node server/build-runtime.mjs` y `python -m pytest server/test_app.py server/test_measure.py server/measure/test_measure_signals.py` para transporte real y medición.
- `node scripts/check-central-python.mjs /ruta/a/pyodide-0.27.7` ejecuta el worker compilado real en WebAssembly con los cuatro casos simulados y comprueba que visor/análisis conservan las medidas de Python. Requiere la distribución oficial completa disponible localmente; no instala un navegador.
- [Revisión de 547 casos](wave-maven-review.md), [experimento reproducible](wave-maven-experiment.md) y [correcciones de razonamiento](revision-razonamiento-clinico-2026-11-13.md).

La interacción en Safari móvil y el consumo de memoria en teléfonos no se han verificado con un navegador interactivo en esta entrega.

## Verificación de entrega

200 pruebas JavaScript y 40 pruebas Python/servidor aprobadas; compilación TypeScript/Vite correcta. El worker compilado con las fuentes Python canónicas se ejecutó en Pyodide real sobre cuatro trazados simulados y dos registros digitales de ejemplo; se generaron seis PDF y se comprobó la invariancia a la etiqueta de diagnóstico. El informe derivado de QA está en `qa-central-python.json`. Son verificaciones de software y regresiones concretas, no un estudio de exactitud clínica sobre los 547 ECG.

## Corrección de preexcitación

El motor conserva candidatos delta por derivación/latido, pendientes, polaridad, ventanas y repetibilidad. Las reglas consumen evidencia explícita multiderivación y PR; no convierten una duración de empastamiento aislada en un diagnóstico. Los reintentos de señal están limitados a tres configuraciones por derivación afectada y solo se seleccionan por repetibilidad/distorsión de señal; no se optimiza contra la respuesta esperada. Véanse `release-preexcitacion.md`, `preexcitacion-razonamiento-v1.3.md`, `capture-preexcitation-qa.md` y `preexcitation-crosscase-qa.md`.
