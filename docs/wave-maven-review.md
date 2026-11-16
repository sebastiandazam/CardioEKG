# Revisión completa de Wave-Maven y límites del experimento

El índice público de referencia contiene **547 casos únicos**. Se recuperaron y verificaron las **547 páginas**, con historia/pregunta y explicación presentes en **547/547** y **cero fallos**. No aparecieron identificadores nuevos ni desaparecidos respecto del catálogo de 547 referencias ya existente en el proyecto. La revisión fue realizada el 2026-11-13 UTC.

Fuente: https://ecg.bidmc.harvard.edu/maven/displist.asp?ans=1. El acceso sigue la ruta pública normal con campos opcionales vacíos y cookies de sesión; no usa una cuenta, credenciales inventadas ni evita controles de acceso. El propietario comunicó autorización en la conversación; esto no equivale a una licencia pública emitida por el proveedor.

## Qué se revisó

Se procesó el HTML completo de cada caso, separando historia/pregunta de la explicación y del diagnóstico de referencia. Se inventariaron **1.641 enlaces a recursos**: un PDF original y dos presentaciones GIF por caso. Las dimensiones declaradas de las imágenes se conservan cuando aparecen en HTML; no son calibración fisiológica ni garantía de resolución real. Los 547 diagnósticos del catálogo ya existían antes de esta tarea; ahora hay también las historias y explicaciones completas en caché privada. Esto no significa que se hayan interpretado manualmente 547 imágenes.

Cada registro conserva ID, URL solicitada/final, estado HTTP, fecha UTC, tamaño y SHA-256 del HTML. La caché original y el texto completo están en `artifacts/wave-maven-review/`, ignorado por Git. El informe versionado [coverage.json](../training/wave-maven-review/coverage.json) contiene únicamente metadatos y resultados derivados. Las seis parejas PDF/PNG previamente incluidas se comprobaron contra sus hashes anteriores, sin volver a descargarlas para esta revisión.

El inventario de páginas no ejecuta entrenamiento ni inferencia. La descarga y el experimento de imágenes se registran por separado; el número de páginas revisadas nunca se presenta como número de ECG usados en un entrenamiento.

## Cobertura de diagnósticos del catálogo

Categorías no excluyentes obtenidas con reglas literales reproducibles sobre el diagnóstico del catálogo. Un caso puede pertenecer a varias categorías; las sumas no representan pacientes ni una distribución clínica real. Los cero diagnósticos sin categoría indican cobertura de estas reglas textuales, no adjudicación experta de todas las morfologías.

| Categoría derivada | Casos |
| --- | ---: |
| `ischemia_infarction` | 93 |
| `atrial_supraventricular_rhythm` | 220 |
| `av_conduction_block` | 54 |
| `intraventricular_conduction` | 41 |
| `ventricular_arrhythmia_ectopy` | 36 |
| `electrolyte_metabolic` | 44 |
| `qt_channelopathy` | 14 |
| `preexcitation` | 21 |
| `structural_hypertrophy_valvular` | 57 |
| `pulmonary_right_heart` | 40 |
| `pericardial` | 15 |
| `drug_toxicity` | 12 |
| `pacing_device` | 21 |
| `st_t_morphology` | 10 |
| `systemic_neurological_association` | 9 |
| `clinical_exam_association` | 2 |
| `technical_anatomic_variant` | 30 |
| `unmatched_catalog_label` | 0 |

La búsqueda literal en las historias y explicaciones encontró referencias a historia/síntomas/contexto en 208 casos, comparación o secuencia de ECG en 22, medicamentos/toxicidad en 89, contexto electrolítico/metabólico en 70, y medición, confirmación o diagnóstico diferencial en 98. Son indicadores de texto, no estimaciones de prevalencia ni revisión clínica adjudicada.

## Consecuencias para el razonamiento

La revisión respalda separar un patrón observable del diagnóstico etiológico y de su confirmación clínica:

- [Caso 15](https://ecg.bidmc.harvard.edu/maven/dispcase.asp?caseid=15&ans=1): la fibrilación auricular preexcitada depende de taquicardia muy rápida, irregular y de QRS ancho; el síntoma «palpitaciones» no basta.
- [Caso 19](https://ecg.bidmc.harvard.edu/maven/dispcase.asp?caseid=19&ans=1): la progresión precordial ayuda a distinguir dextrocardia de inversión de electrodos de brazos.
- [Casos 32](https://ecg.bidmc.harvard.edu/maven/dispcase.asp?caseid=32&ans=1) y [69](https://ecg.bidmc.harvard.edu/maven/dispcase.asp?caseid=69&ans=1): los patrones de sobrecarga derecha pueden apoyar sospecha de embolia pulmonar; los autores describen hallazgos no diagnósticos que requieren contexto.
- [Caso 100](https://ecg.bidmc.harvard.edu/maven/dispcase.asp?caseid=100&ans=1): la sospecha de toxicidad por tricíclicos integra alteración de conciencia, frecuencia, QRS/QT, eje y deflexión terminal de aVR.
- [Casos 253](https://ecg.bidmc.harvard.edu/maven/dispcase.asp?caseid=253&ans=1) y [375](https://ecg.bidmc.harvard.edu/maven/dispcase.asp?caseid=375&ans=1): patrón de Brugada y síndrome hereditario son conclusiones distintas. El segundo caso requiere reconocer un contexto farmacológico y la evolución al retirar el fármaco.
- [Caso 261](https://ecg.bidmc.harvard.edu/maven/dispcase.asp?caseid=261&ans=1): taquicardia auricular con bloqueo AV motiva buscar toxicidad digitálica; no autoriza inferirla solo de depresión del ST.

- [Casos 514](https://ecg.bidmc.harvard.edu/maven/dispcase.asp?caseid=514&ans=1) y [536](https://ecg.bidmc.harvard.edu/maven/dispcase.asp?caseid=536&ans=1): el Takotsubo puede parecer un síndrome coronario agudo, incluso con patrón de Wellens; aquí su confirmación usa angiografía y alteraciones de la contracción. El estrés y las ondas T invertidas no bastan para establecer esa etiología.

Estas observaciones sirven para mejorar reglas con datos observables disponibles. Una etiqueta de catálogo no se convierte en una predicción del sistema. Las explicaciones incluyen datos confirmatorios, evolución y tratamientos posteriores que no siempre existirían al momento del primer ECG.

## Experimento posible sin presupuesto

Se verificaron **547/547 PDF originales**, sin fallos, con un total de **82.875.203 bytes (79,04 MiB)**: seis originales previos reutilizados y 541 obtenidos de la fuente. Se mantiene una copia privada de un PDF original por caso; las dos versiones GIF se omiten como presentaciones duplicadas. Una repetición completa usó exclusivamente la caché y verificó de nuevo los hashes de los 547 HTML y 547 PDF. [download_assets.py](../training/wave-maven-review/download_assets.py) reutiliza los seis PDF existentes y limita la red a dos solicitudes simultáneas. El manifiesto privado de activos es `artifacts/wave-maven-review/asset-manifest.json`; [asset-coverage.json](../training/wave-maven-review/asset-coverage.json) publica solo estados, tamaños, hashes y procedencia. Los datos originales no se agregan a `public/` ni a un paquete público nuevo.

Un clasificador superficial de imágenes en CPU puede probar que el recorrido descarga → rasteriza → extrae características → ajusta → evalúa funciona. Debe tratarse como experimento exploratorio: 547 casos docentes heterogéneos, etiquetas derivadas no adjudicadas, ausencia de IDs de pacientes verificados, posible repetición de paciente o trazado, y sesgos del material docente. Las categorías etiológicas pueden necesitar información imposible de deducir de la imagen sola. La historia prospectiva puede estudiarse en otro brazo, manteniendo siempre las respuestas separadas.

Como todos los casos se consultaron para desarrollar conocimiento/reglas, esta colección no constituye una reserva externa intacta. Una partición de casos para el modelo puede medir su comportamiento dentro de esta colección, con control de duplicados y de fuga de datos, pero no acredita validación clínica ni separación por pacientes. Los límites P/QRS/T y medidas expertas no están anotados de forma estructurada; las descripciones de la respuesta no sustituyen esas anotaciones.

Ni la revisión completa ni un experimento pequeño garantizan el diagnóstico correcto de un ECG arbitrario. Una evaluación clínica posterior necesita un conjunto externo independiente, anotaciones verificadas y comparación con lectura experta.

## Reproducción

```sh
python training/wave-maven-review/review_cases.py
python training/wave-maven-review/download_assets.py
```

La segunda ejecución reutiliza caché y verifica SHA-256. `--refresh` afecta solamente el crawler de páginas. La interfaz y la separación de respuestas están documentadas en [README.md](../training/wave-maven-review/README.md).
