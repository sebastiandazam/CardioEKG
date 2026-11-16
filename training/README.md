# Entrenamiento y evaluación de ECG

Implementación reproducible para comparar digitalización y clasificación en un entorno de investigación. Cada ejecución genera artefactos candidatos. El aval institucional, la validación del flujo con fotos y la decisión regulatoria se documentan por separado antes de activar el uso con pacientes.

## Datos y separación

- [PTB-XL 1.0.3](https://doi.org/10.13026/kfzx-aw45), CC BY 4.0. Contiene 21.799 ECG clínicos de 12 derivaciones. Usar `records100/` y `ptbxl_database.csv`. Ajuste en folds 1–7, selección en 8, calibración y umbrales en 9 y prueba interna en 10. Excluir de los cuatro subconjuntos a todos los pacientes que tengan algún registro en la prueba fotográfica.
- [Chapman–Shaoxing–Ningbo 1.0.0](https://doi.org/10.13026/wgex-er52), CC BY 4.0. Reservar los 45.152 registros de `WFDBRecords/` como evaluación externa. Revisar la frecuencia de cada clase y la comparabilidad de las anotaciones. Para bloqueo completo, los códigos genéricos de bloqueo se tratan como indeterminados. [Correspondencias SNOMED CT usadas por el Challenge](https://moody-challenge.physionet.org/2021/).
- [ECG-Image-Database](https://pmc.ncbi.nlm.nih.gov/articles/PMC13402943/) proporciona fotos y trazados emparejados. Obtenerlos de la distribución oficial, registrar la licencia y el origen del registro, y preparar un conjunto bloqueado de fotos de PTB-XL con un `ecg_id` por línea en `data/photo-test-ptb-ids.txt`. Para comparar digitalizadores, crear `data/photo-pairs.csv` con una fila por derivación de 2,5 s y columnas `photo,signal,record,zero_y,pixels_per_mv,quality`. `photo` es un recorte rectificado sin cabecera identificable, `signal` es un archivo NumPy con 250 muestras en mV del intervalo exacto de la foto, `record` es el `ecg_id` y las coordenadas de calibración se expresan en píxeles del recorte antes de escalar. Registrar la calidad antes de ejecutar los modelos.
- [ECG Wave-Maven](https://ecg.bidmc.harvard.edu/maven/mavenmain.asp) se enlaza para estudio. El pipeline emplea las colecciones con permisos de entrenamiento documentados.

## Ejecución

En Python 3.11 o 3.12, desde este directorio, con acceso a los repositorios de dependencias y a las fuentes de ECG:

```sh
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
mkdir -p data
python -m pip freeze > data/environment.lock.txt
python -m unittest -v

python prepare.py --ptb data/ptb-xl --external data/chapman \
  --photo-test-ids data/photo-test-ptb-ids.txt --out prepared/run01

python train.py --data prepared/run01 --out runs/classifier01 --device cpu
python digitize.py --data prepared/run01 --out runs/digitizer01 --device cpu \
  --photo-test-ids data/photo-test-ptb-ids.txt --photo-pairs data/photo-pairs.csv
```

Para descargar solo los registros necesarios de PTB-XL y el conjunto completo de Chapman desde una máquina con conexión, puede usarse el cliente AWS con el acceso público documentado en PhysioNet:

```sh
aws s3 sync --no-sign-request s3://physionet-open/ptb-xl/1.0.3/ data/ptb-xl/ \
  --exclude '*' --include 'records100/*' --include 'ptbxl_database.csv' \
  --include 'scp_statements.csv' --include 'LICENSE.txt'
aws s3 sync --no-sign-request s3://physionet-open/ecg-arrhythmia/1.0.0/ data/chapman/
```

Se necesitan varios GB para las descargas y matrices preparadas. Los directorios de salida deben ser nuevos. `--device cuda` permite usar GPU en Linux. Conservar el entorno resuelto, versiones de los datos, particiones, huellas de archivos, semillas y métricas de la ejecución. La rama de digitalización trabaja con recortes rectificados y calibración declarada. El protocolo debe evaluar adicionalmente encuadre, rectificación y calibración del flujo web completo.

## Artefactos

- `classifier.onnx`, `manifest.json` y `metrics.json`. Compara reglas, CNN 1D y ResNet 1D. Selecciona el candidato exportable por AUPRC macro de selección, con preferencia por menor latencia de CPU para diferencias inferiores a 0,005. Reporta rendimiento, calibración y abstenciones por clase, intervalos bootstrap por paciente y resultados por sexo y rango de edad cuando hay datos. Las reglas constituyen una referencia exploratoria.
- `digitizer.onnx` y `digitizer_metrics.json`. Comparan seguimiento clásico por continuidad y segmentación con U-Net sobre renderizados de señales reales y, con el manifiesto de pares, fotos independientes. Reportan cobertura, error de amplitud y relación señal-ruido por calidad.
- ONNX de clasificación espera `segments: float32[1,12,250]` y `leadII: float32[1,1,1000]` a 100 Hz en mV. Orden I, II, III, aVR, aVL, aVF, V1–V6. El formato 4×3 tiene cuatro ventanas sucesivas de 2,5 s, cada una con tres derivaciones simultáneas. La tira larga II debe corresponder al mismo ECG. `probabilities: float32[1,4]` contiene probabilidades sigmoidales calibradas e independientes en orden `sinus,af,rbbb,lbbb`. Los límites `lower` y `upper` del manifiesto definen evidencia negativa y positiva. Valores `-1` y `2` deshabilitan la decisión respectiva.
- ONNX de digitalización espera `ink: float32[1,1,96,256]`, una imagen monocanal con el preprocesamiento de `ink_probability`. Emite `traceMask: float32[1,1,96,256]`; la máscara requiere seguimiento y calibración para obtener mV. La web usa su propio digitalizador clásico. Este candidato sirve para comparación en el entorno de entrenamiento.
- Los scripts validan los modelos exportados con ONNX y comparan sus salidas con PyTorch antes de registrar el artefacto como candidato.

## Evaluación supervisada

Bloquear versión, umbrales y tamaño del conjunto de prueba antes de ver los resultados. Seleccionar fotos que cubran centros, dispositivos y calidades de impresión representativos. Dos lectores evalúan cada ECG digital de referencia en forma independiente y ciega a la estimación. Un tercero adjudica discrepancias. `evaluate_pilot.py` recibe únicamente una tabla local seudonimizada y escribe resultados agregados:

```sh
python evaluate_pilot.py data/pilot.csv --output runs/pilot-report.json
```

La tabla contiene `patient,record,quality`. Para cada hallazgo agregar columnas con sufijos `_reader1`, `_reader2`, `_adjudicated`, `_score` y `_decision`. Los campos de lectura y decisión son 0, 1 o vacíos. El puntaje es una probabilidad entre 0 y 1 o queda vacío. Para `rate_bpm,pr_ms,qrs_ms,qt_ms,axis_deg` agregar sufijos `_reference` y `_estimate`. Dejar en blanco los valores no evaluables. El reporte contabiliza discrepancias, abstenciones y error en las medidas, incluyendo distancia angular circular para el eje. Conservar los archivos del piloto en el entorno institucional conforme al protocolo.

## Estado de esta entrega

Se ejecutaron seis pruebas con entradas sintéticas para verificar partición por paciente, tiempos del formato 4×3, abstención, adjudicación y recuperación de una curva calibrada. El entorno de implementación bloqueó la descarga de datos y de las dependencias de entrenamiento. Quedan pendientes el entrenamiento real, la comparación con fotos independientes, la prueba de exportación y la evaluación institucional.

## Piloto de extracción ejecutado en la nube

El 2026-11-11 se descargó un subconjunto autorizado de PTB-XL y se ejecutó un entrenamiento pequeño de segmentación de píxeles sobre renderizados de señales reales. El candidato aprendido no se activó porque empeoró el error de amplitud. La corrección de iluminación se comparó sobre 160 renderizados físicamente calibrados; los resultados, limitaciones, fuentes y reproducción están en [trace-pilot-results/README.md](trace-pilot-results/README.md). Esta ejecución supera la limitación anterior de descarga para ese subconjunto, pero no equivale al entrenamiento completo ni a validación con fotos clínicas independientes.

## Piloto de etiquetas de hojas completas

Se amplió la descarga a 256 ECG reales de 256 pacientes y se generaron hojas anotadas para comprobar propuestas OCR. El experimento de configuración de Tesseract preentrenado y su prueba bloqueada de 32 pacientes se documentan en [sheet-ocr-results/README.md](sheet-ocr-results/README.md). No se entrenaron nuevos pesos neuronales: la precisión observada del 76,1 % y sensibilidad del 60,7 % exigen revisión de las asignaciones propuestas.

## Red de identidad de etiquetas realmente entrenada

Después del piloto OCR se entrenó una red MLP pequeña con 9.216 recortes aumentados de etiquetas pertenecientes a 192 pacientes, con otros 32 pacientes para selección y 32 para prueba. Reconoció las 384 etiquetas de prueba cuando sus cajas eran conocidas, pero falló el rechazo de papel sin etiqueta (116 falsas aceptaciones de 128). Por ello se conserva como candidato **no activado**. Véanse los pesos, resultados y límites en [lead-label-results/README.md](lead-label-results/README.md). Este entrenamiento no equivale a detección de hojas completas ni a entrenamiento diagnóstico.

## Entrenamiento real parcial ejecutado el 12 de noviembre de 2026

Se congeló un plan de 6.000 PTB-XL, 1.000 Chapman externos, 200 LUDB y 30 QTDB. Un fallo general HTTP503 interrumpió la descarga. Se entrenaron realmente dos clasificadores clásicos sobre 508 registros de 506 pacientes y un delineador experimental sobre un único registro LUDB de ajuste; no hay datos de calibración ni evaluación externa completa, todos los umbrales diagnósticos se mantienen deshabilitados y ningún candidato se activó. Los recuentos exactos, limitaciones, comparación NeuroKit2 y reproducción están en [docs/training-2026-11-12.md](../docs/training-2026-11-12.md) y `clinical-run/`.
