# Piloto ejecutado de extracción, 2026-11-11

Este piloto ejecutó entrenamiento, selección y evaluación, no valida uso clínico ni promete que cualquier fotografía se digitalice correctamente. No se entrenó un clasificador diagnóstico.

## Fuente y permisos

- PTB-XL 1.0.3: <https://physionet.org/content/ptb-xl/1.0.3/>, Wagner et al., DOI 10.13026/kfzx-aw45. La descarga oficial de `LICENSE.txt` confirmó **CC BY 4.0**. El hash de licencia y los registros/pacientes/folds están en `report.json`.
- Se descargaron 32 ECG de 32 pacientes distintos, 16 de folds 1–7 para ajuste, 8 del fold 8 para selección y 8 del fold 10 para prueba. Se eligieron los primeros pacientes de cada partición por orden del CSV: es una muestra pequeña de conveniencia, no representativa de todos los hospitales o diagnósticos.
- Cada registro aporta I, II, V1 y V5; imágenes sintéticas de 2,5 s generadas desde señales clínicas reales. Los pacientes de prueba no participaron en el ajuste ni selección del modelo.
- **ECG-Image-Database**, fuente oficial enlazada desde <https://pmc.ncbi.nlm.nih.gov/articles/PMC13402943/>: <https://www.kaggle.com/datasets/physionet/ecg-image-database/>. La API de Kaggle confirmó licencia **CC BY-ND 4.0**, volumen completo 35.540.191.157 bytes. Se pudo descargar sin credenciales un JPEG original mediante `https://www.kaggle.com/api/v1/datasets/download/physionet/ecg-image-database?fileName=D0%2FD0_000022%2FD0_000022_04.jpeg`. Se inspeccionó localmente; no se usó para entrenar ni se distribuyó una transformación o copia con la aplicación. Para un conjunto ampliado de fotos deben revisarse expresamente los permisos y la correspondencia exacta imagen/señal. El original muestra un gran espacio de cabecera y confirma que una plantilla fija no cubre todas las posiciones del papel.
- ECG-Image-Kit y el Challenge 2024 explican la generación de imágenes desde PTB-XL: <https://moody-challenge.physionet.org/2024/> y <https://github.com/alphanumericslab/ecg-image-kit>. No debe confundirse generación de imágenes con validación en fotos independientes.

## Entrenamiento realmente realizado

`trace_pilot.py` ajusta una regresión logística de píxeles con tres características RGB y contraste local de 5×5. Usa 128 recortes para ajuste, 64 para seleccionar umbral y 64 de prueba. Los coeficientes y umbral reproducibles se guardan en `candidate.json`. No se requiere GPU.

Prueba del candidato con seguimiento clásico Python:

| Método | Recortes aceptados / 64 | Mediana error absoluto en mV entre aceptados |
|---|---:|---:|
| Clásico Python | 61 | 0,03139 |
| Píxeles entrenados + seguimiento | 64 | 0,03527 |

El modelo entrenado aumentó cobertura pero **empeoró el error de amplitud**. Se conserva como candidato de investigación; **no se activa en la web**. El digitalizador JS de la web aceptó 62/64, error mediano 0,02415 mV, usando calibración manual conocida. El generador histórico `draw_paired_crop` no sincroniza espaciado de cuadrícula con escala de amplitud: esos 64 recortes sirven para seguimiento con escala manual, no para evaluar calibración automática.

## Comparación de la corrección de iluminación de la web

`physical_fixtures.py` genera un segundo conjunto de 160 recortes físicamente calibrados desde los mismos 8 pacientes de prueba: 32 limpios rojos, 32 grises, 32 con sombra/desenfoque, 32 con trazo tenue y sombra, 32 con sombra fuerte. Cuadrícula, 25 mm/s y 10 mm/mV sí comparten escala; no se reajustan señales después de ver el resultado. Es una prueba de estrés de software, no un conjunto de fotos clínicas ni un ensayo independiente para aval institucional.

Comparación de JS anterior frente a JS con normalización local de papel, con calibración automática:

| Condición | Aceptados antes → después /32 | Mediana MAE antes → después, mV |
|---|---:|---:|
| Rojo limpio | 32 → 32 | 0,00953 → 0,00953 |
| Gris limpio | 32 → 32 | 0,00953 → 0,00953 |
| Sombra y desenfoque | 32 → 32 | 0,01114 → 0,00965 |
| Trazo tenue y sombra | 32 → 32 | 0,02296 → 0,00951 |
| Sombra fuerte | 23 → 32 | 0,01085 → 0,01006 |

Total: **151/160 → 160/160** aceptados. En estos casos limpios la salida permanece idéntica. La amplitud empeoró en 11/160 comparaciones individuales y mejoró en 85/160; el máximo por condición disminuyó o quedó idéntico. No hay garantía de ausencia de regresiones en otras imágenes. `physical-summary.json` incluye máximos y comparaciones pareadas; los informes `browser-physical-before.json` y `browser-physical-after.json` conservan cada resultado, incluidas abstenciones. La mediana de esta tabla usa todos los retornos numéricos, mientras el resumen global JS usa solo aceptados.

## Reproducción

Desde la raíz, con NumPy, SciPy, Pillow y scikit-learn instalados:

```sh
python training/trace_pilot.py
python training/physical_fixtures.py
node --experimental-strip-types training/trace_browser_baseline.mjs data/trace-pilot/js-fixtures.json training/trace-pilot-results/browser-baseline.json
node --experimental-strip-types training/trace_browser_baseline.mjs data/trace-pilot/physical-fixtures.json training/trace-pilot-results/browser-physical-after.json auto
```

El último argumento opcional de `trace_browser_baseline.mjs` permite comparar otro módulo `digitize.ts` (con su `locale.ts` adyacente), por ejemplo extraído del commit anterior. Los datos descargados y RGBA se guardan en `data/`, excluido de Git, y no se publican en `dist/`. Permanecen pendientes fotos clínicas emparejadas, revisión de extracción y calibración por expertos, diversidad de dispositivos, perspectiva, rotación, texto superpuesto y trazados cortados.

## Corrección de selección de filas

Se eliminó la dependencia exclusiva de posiciones verticales fijas: `sheet.ts` busca bandas horizontales de tinta y propone filas cuando tienen separación compatible con el formato elegido. En el JPEG original inspeccionado, los centros propuestos quedan aproximadamente al 42 %, 58 %, 75 % y 90 % de la altura: los tres primeros corresponden a las filas de derivaciones y el último a la tira larga. La cabecera vacía queda fuera del primer recorte. Es una comprobación de posición en una imagen, no una validación cuantitativa de digitalización ni de reconocimiento de nombres. Las etiquetas siguen requiriendo confirmación.
