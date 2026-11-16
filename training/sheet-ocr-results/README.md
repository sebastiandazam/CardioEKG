# Piloto de etiquetas de derivaciones en hojas completas

## Qué se ejecutó

Se descargaron **256 ECG clínicos reales de 256 pacientes distintos** de [PTB-XL 1.0.3](https://physionet.org/content/ptb-xl/1.0.3/) (Wagner et al., DOI 10.13026/kfzx-aw45), bajo **CC BY 4.0**, y se generaron 256 hojas completas con sus señales y etiquetas conocidas. Se variaron distribución 4×3/2×6, tres tipografías, tamaños de letra, altura de cabecera, sombra y desenfoque leve. Los datos y PNG se conservan en `data/`, fuera de Git y de la web pública.

Esto **no es un conjunto de fotografías clínicas**: las señales son reales, las hojas son renderizadas. No se ajustaron nuevos pesos neuronales de OCR. Se calibró la configuración de un modelo neuronal preentrenado: **Tesseract 5.5.0, idioma eng**. Es importante distinguirlo del entrenamiento de un modelo nuevo y del entrenamiento diagnóstico.

El reparto, por paciente y folds oficiales, fue: 192 registros de folds 1–7 para desarrollo, 32 de fold 8 para selección, 32 de fold 10 bloqueados para prueba. Se eligieron los primeros pacientes elegibles según el orden del CSV, una muestra de conveniencia. Por coste de OCR, se evaluaron tres configuraciones sobre 16 hojas de desarrollo y 8 de selección; después se evaluó una única configuración sobre las 32 hojas de prueba (384 etiquetas). Generar 256 hojas no significa haber usado todas ellas para ajustar el OCR.

## Resultado

Las detecciones se comparan con nombre **y posición**: la etiqueta debe coincidir y su centro debe quedar a menos de 45 píxeles horizontales y 35 verticales de la anotación. Se permite mapear `|`, `l` y `!` a `I`, sin adjudicar nombres por el diagnóstico ni por la señal. Se incluyen detecciones con confianza OCR ≥15; es un filtro experimental, no un umbral clínicamente validado. Una detección duplicada cuenta como falso positivo.

| Configuración | Precisión en selección | Sensibilidad en selección |
|---|---:|---:|
| PSM 11, RGB original | 56,5 % | 27,1 % |
| PSM 11, máximo RGB + autocontraste | **73,8 %** | **61,5 %** |
| PSM 6, máximo RGB + autocontraste | 63,3 % | 59,4 % |

Se seleccionó PSM 11 y máximo RGB/autocontraste por F1 de selección. El máximo de los tres canales atenúa la cuadrícula roja; una cuadrícula gris no desaparece con esta transformación.

**Prueba bloqueada:** 233 etiquetas correctas, 73 falsos positivos y 151 omitidas: **precisión 76,1 %, sensibilidad 60,7 %**. Ninguna de las 32 hojas obtuvo las 12 etiquetas sin error. Estos resultados respaldan usar OCR como propuesta visible y editable; **no respaldan confiar automáticamente en todas las asignaciones**. Tesseract.js y su modelo web pueden diferir de esta instalación nativa, por lo que el resultado no valida por sí solo la implementación del navegador.

## Archivos y reproducción

`report.json` conserva registros, pacientes, folds, configuraciones, resultado por hoja y detecciones con sus coordenadas, además de hashes de señales, metadatos y licencia. Las hojas y el manifiesto anotado se regeneran con:

```sh
python training/sheet_ocr_pilot.py
```

Requiere NumPy, Pillow, scikit-learn/SciPy (por el módulo de descarga compartido), `curl`, Tesseract con eng y las fuentes DejaVu/Liberation del sistema. La ejecución elige la configuración antes de evaluar la prueba; no ajusta un umbral con el resultado del test.

Para avanzar hacia nuevas redes entrenadas: ampliar las anotaciones y tipografías, separar otra prueba externa de fotos autorizadas, revisar falsas etiquetas I/II/III y V1–V6, entrenar detector de regiones y OCR con anotaciones manuales independientes, y contrastar la salida web real. La normalización del papel, la detección de etiquetas y la extracción del trazado son tareas distintas y deben evaluarse por separado.
