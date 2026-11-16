# Corrección integrada de preexcitación

Algoritmo compartido 2.6.0; Python `ecg_analisis-signals-v3.2`; KB 1.3.0. La etiqueta de producto v22.1 se conserva al no haberse recibido otro ZIP.

## Cambios

- El resultado Python conserva delta por derivación y latido: polaridad, pendientes, duración candidata, repetibilidad y ventanas. El agregado requiere corroboración multiderivación; no se inventan rasgos ausentes.
- Las reglas integran esos datos y PR, distinguen patrón WPW de síndrome y limitan atribuciones Q/ST–T/BBB/hipertrofia confundidas por preexcitación. No se usa ID de caso ni respuesta publicada como entrada.
- QRS local con corroboración entre derivaciones; valores discordantes quedan visibles. Hasta tres configuraciones de señal en fallos/límites truncados, elegidas por consistencia y distorsión; no se repite hasta coincidir con un diagnóstico conocido. Alineación global solo con sincronía explícita y tiempos compatibles.
- Bandas de candidatos delta en el visor y PDF, tabla por derivación, ventanas automáticas PR/QRS/QT y revisión específica de PR cuando delta y PR no concuerdan. El prompt de evidencia incluye la misma información y contexto; no se transmiten imágenes al copiarlo.

## Verificación

- 213 pruebas JavaScript; 46 Python/servidor; TypeScript y Vite correctos.
- Worker compilado real en Pyodide: cuatro controles simulados, dos registros digitales y caso 218; siete PDF generados. El caso 218 produce `wpw-pattern` como principal, con delta negativa V1/III. Los controles no se convierten en WPW.
- Captura numérica independiente del caso 218: PDF rasterizado → `analyzeSheet`/`processPhotoRaster` → Python; 13 regiones aceptadas, calibración automática, PR 89 ms/QRS 139 ms y candidatos en cinco derivaciones. Se eligió explícitamente disposición 4×3; no se ejecutaron PDF.js, OCR ni la interfaz del navegador.
- Resultados de QA: `qa-preexcitation.json`; reproducción y límites: `capture-preexcitation-qa.md`, `preexcitation-crosscase-qa.md` y scripts `check-central-python.mjs` / `check-capture-preexcitation.mjs`.

## Límites conservados

Las cifras automáticas no son referencia médica anotada. Los umbrales del detector son heurísticos, sin calibración clínica independiente. El caso 193 mantiene PR discordante (mediana 122 ms), y el caso 97 no reúne apoyo delta suficiente en la ruta de señales. No se afirma detectar todos los WPW ni resolver todos los ECG; el material ya revisado es de desarrollo y no validación externa. El inicio de T y algunas morfologías RSR′ siguen limitados. Safari móvil y fotos clínicas independientes requieren comprobación posterior. Los pesos experimentales de categorías amplias permanecen inactivos.

La revisión final también trata la preexcitación como confusor de ST–T con QRS estrecho, no aplica Sgarbossa a este patrón y conserva el QTc numérico como dato revisable sin atribuir un síndrome de QT. El dolor torácico/disnea conservan prioridad clínica aunque la repolarización esté confundida.
