# Avisos de terceros

- **PTB‑XL v1.0.3**, Patrick Wagner, Nils Strodthoff, Ralf-Dieter Bousseljot, Wojciech Samek y Tobias Schaeffter. Registro 00351, [DOI 10.13026/kfzx-aw45](https://doi.org/10.13026/kfzx-aw45), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Copia en JSON de las 12 derivaciones, remuestreada a 250 Hz por [ECG Atlas](https://github.com/infocusp/ecg-atlas). Atribución adicional a PhysioNet. [Cita de la plataforma](https://pmc.ncbi.nlm.nih.gov/articles/PMC13641116/).
- **PTB Diagnostic ECG Database v1.0.0**, Ralf-Dieter Bousseljot, Dieter Kreiseler y Andreas Schnabel. Registro s0303lre, [base original](https://physionet.org/content/ptbdb/1.0.0/), [ODC‑By 1.0](https://physionet.org/content/ptbdb/view-license/1.0.0/). Extracto de 12 s desde el segundo 4, remuestreado a 250 Hz por ECG Atlas. Se conservan las 12 derivaciones convencionales. El encabezado clínico queda en la fuente.
- Las huellas de los archivos originales declaradas por ECG Atlas, las revisiones de los extractos y la frecuencia de muestreo constan en `src/data/*.json`.
- **React**, **React DOM** y **Scheduler**. Copyright Meta Platforms, Inc. and affiliates. Sus licencias MIT se incorporan a las compilaciones distribuidas. [React](https://github.com/facebook/react).
- **Marca de GitHub**. GitHub, Inc. La marca Invertocat se usa para enlazar al repositorio de Liquid Glass JS. [Guía de marca](https://brand.github.com/foundations/logo) · [SVG de Primer Octicons](https://github.com/primer/octicons/blob/main/icons/mark-github-16.svg).
- **Referencias visuales**. La interfaz implementa gradientes y acabados de vidrio propios, inspirados en [ShaderGradient](https://github.com/ruucm/shadergradient) y [Liquid Glass JS](https://github.com/dashersw/liquid-glass-js).

- **Instrument Serif** e **Instrument Sans**. Fuentes SIL Open Font License 1.1. Los archivos de licencia se incluyen en `src/fonts/` y en los avisos de la distribución. [Instrument Serif](https://github.com/google/fonts/tree/main/ofl/instrumentserif) · [Instrument Sans](https://github.com/google/fonts/tree/main/ofl/instrumentsans).

- **Malla de referencia de HeartDeformNets**. Fanwei Kong y Shawn C. Shadden. La plantilla `wh_template.vtp` se convirtió para el visor, con normalización geométrica, cuantización y color por estructura. Licencia Apache 2.0 incluida en la distribución. [Repositorio de HeartDeformNets](https://github.com/fkong7/HeartDeformNets) · [Artículo de origen](https://pubmed.ncbi.nlm.nih.gov/36327186/).
- **Heart Atlas**, CC BY-SA 4.0, basado en BodyParts3D. La vista de referencia estática se incluye con atribución. El atlas detallado de los casos públicos se solicita por separado, desde un recurso de versión fija. [Heart Atlas y atribución](https://w3lld1.github.io/heart-atlas/en/) · [Licencia CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).


## Reconocimiento local de etiquetas

Tesseract.js 6 y Tesseract.js-core, Apache-2.0. Modelo inglés LSTM preentrenado de tessdata_fast 4.1.0, Apache-2.0, <https://github.com/tesseract-ocr/tessdata_fast/tree/4.1.0>. Motor, WASM y modelo se sirven en `/ocr/`; licencias junto a los archivos. No se envían imágenes a servicios de OCR. El modelo no fue entrenado específicamente para ECG por este proyecto; el ajuste experimental de preprocesamiento con hojas de PTB-XL está documentado en `training/sheet-ocr-results/README.md`.


## PDF local

PDF.js (Mozilla Foundation), Apache-2.0, se utiliza para elegir y rasterizar páginas en el dispositivo. PDF.js 6.5.438, motor de análisis, trabajador y recursos de fuente/decodificación se sirven desde el mismo sitio. Las licencias correspondientes se incluyen en `public/pdf/` y en la distribución. La interfaz no ejecuta acciones JavaScript del documento ni muestra anotaciones interactivas; solo renderiza una página a imagen.


## Local PDF generation

CardioEKG uses jsPDF (MIT) for local report generation. The distributed LICENSE.txt includes its license. No html-to-PDF web service is used. Embedded wordmark outlines derive from Instrument Sans under the SIL Open Font License; its license is included.

## HRA reference anatomy

HRA/HuBMAP Visible Human Male heart v1.2, CC BY 4.0, with authors and pinned source in `public/anatomy/LICENSE-HRA.txt` and `src/anatomy/ATTRIBUTION.md`. These licenses apply to the anatomy assets separately from application code.


## ECG Wave-Maven · incorporación v18

Catálogo oficial de 547 referencias y PDF/PNG de los casos 1, 2, 3, 4, 5 y 15. ECG Wave-Maven © Beth Israel Deaconess Medical Center. Desarrolladores: Larry A. Nathanson, Seth McClennen, Charles Safran y Ary L. Goldberger, BIDMC / Harvard Medical School. Fuente: https://ecg.bidmc.harvard.edu/maven/mavenmain.asp . Los PDF conservan la atribución original; los PNG se renderizan de esos PDF. Autorización de uso comunicada por el propietario de CardioEKG; no se atribuye una licencia abierta nueva ni se aplica MIT a estos materiales. Procedencia y hashes en training/wave-maven/import-manifest.json. No se ha entrenado ni validado un modelo con esta importación.

## Local Python measurement runtime (v22.1)

On explicit measurement, the browser loads Pyodide 0.27.7 (MPL-2.0) and its
NumPy 2.0.2, SciPy 1.14.1 (BSD), Pillow 10.2.0 (HPND) and OpenBLAS 0.3.26
(BSD) packages from the official pinned jsDelivr distribution. ECG pixels are
processed in a browser worker and are not uploaded to this CDN.
Runtime source, package metadata and licenses: https://github.com/pyodide/pyodide/tree/0.27.7
and https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide-lock.json .
These are numerical/image libraries, not clinically validated ECG model weights.
