# CardioEKG

Flujo guiado de revisión de ECG de 12 derivaciones, con una instalación para investigación clínica supervisada. La edición educativa incluye cuatro simulaciones y dos registros clínicos de PhysioNet. La representación de la conducción sigue la línea de tiempo de los ejemplos simulados. El eje frontal se muestra cuando está disponible. La geometría 3D representa anatomía humana de referencia. Los registros clínicos se muestran junto a un esquema de referencia y conservan su atribución.

La interfaz está disponible en español e inglés mediante **ES / EN**. El recuadro **Diagnóstico presuntivo / Presumptive Diagnosis** muestra la impresión asociada al patrón, manejo inicial orientativo para adultos, signos de alarma y las fuentes clínicas. En el flujo de investigación, se basa en el hallazgo revisado por el investigador. Una clasificación automatizada requiere pesos validados e instalados.

## Abrir la aplicación

Abrir **Cardioscopio.html** en el navegador. El archivo autónomo incluye el visor y el flujo de captura. Las funciones locales de imagen requieren un navegador con Web Workers y acceso a Web Crypto. La opción de OpenEvidence abre el sitio externo únicamente al pulsar su enlace. La pregunta se genera localmente a partir del hallazgo y se puede leer antes de copiarla.

Para ejecutar o desplegar la web desde el código, instalar Node.js 22.12 o posterior.

```sh
npm install
npm test
npm run dev
npm run build
npm run build:offline
```

Publicar `dist/` con un servidor de archivos estáticos. `build:offline` genera de nuevo la edición autónoma. El código propio usa licencia MIT. La portada usa un shader WebGL propio inspirado en ShaderGradient, con un fondo estático cuando WebGL no está disponible. Las dependencias, marcas y señales conservan sus licencias y condiciones. Consultar [fuentes y licencias](docs/fuentes-y-licencias.md) y [avisos de terceros](THIRD_PARTY_NOTICES.md).

## Investigación supervisada

La compilación pública permite probar la captura en el dispositivo con trazados simulados o ejemplos públicos autorizados. El formulario pide confirmarlo antes de acceder a la captura. La compilación privada exige una decisión de habilitación institucional. Antes de desplegarla con pacientes, completar los requisitos de [investigación en Colombia](docs/investigacion-colombia.md).

```sh
VITE_APPROVED_RESEARCH=1 npm run build:research
```

La institución debe servir **dist-research/** en un origen HTTPS privado con autenticación institucional en el servidor. El indicador de compilación habilita la interfaz, y el servidor controla quién puede acceder. No desplegar este directorio en el mismo origen que aplicaciones de terceros. Excluir analítica y servicios remotos de este origen. Aplicar una política de seguridad que restrinja conexiones, trabajadores y recursos al origen local, autorice `blob:` solo para previsualizaciones y permita `wasm-unsafe-eval` únicamente si se instala ONNX.

El flujo revisa 12 recortes calibrados del mismo ECG, estima la frecuencia cuando la tira lo permite y calcula PR, QRS, QT y eje a partir de los puntos que marque el investigador. Al confirmar, el visor recibe únicamente las señales y los resultados derivados en memoria. El estudio debe establecer su propio procedimiento para documentar lecturas y autorizaciones.

Sin pesos aprobados, la clasificación permanece indeterminada hasta que el investigador seleccione un hallazgo. Para instalar un modelo validado, servir el módulo de ONNX Runtime Web, sus archivos WASM y el modelo desde `/models/` en el mismo origen. Inyectar en la compilación la configuración `VITE_APPROVED_MODEL` como un objeto JSON con `runtimeModule`, `wasmDirectory`, `modelUrl`, `sha256` y `decisionBands`. Usar el SHA‑256 del archivo exacto y los umbrales validados. El clasificador exige formato 4×3, tira II de 10 s y confirmación de que las imágenes corresponden al mismo ECG.

## Entrenamiento

El [flujo reproducible](training/README.md) prepara ECG reales, compara modelos, exporta ONNX y calcula métricas de evaluación. Los modelos candidatos y sus métricas requieren ejecutar ese flujo con las cohortes y fotos autorizadas. En esta entrega se verificó el flujo con pruebas locales y la carga de los ejemplos clínicos en el visor. El acceso de red del entorno no permitió descargar las cohortes completas ni ejecutar el entrenamiento.


### Mapa de derivaciones y OCR local

Al cargar una hoja completa, aparece primero un mapa con recuadros de colores y un panel lateral. Cada zona se puede seleccionar, mover, volver a dibujar, reasignar y confirmar. Las doce zonas deben confirmarse antes de reconstruir; esa confirmación no sustituye la revisión de la calibración ni de la señal extraída. Las etiquetas OCR y las propuestas por posición se distinguen en el panel.

La lectura de etiquetas usa Tesseract.js y un modelo LSTM inglés preentrenado, servido desde el mismo sitio (`public/ocr/`). No envía imágenes a un servicio de OCR. Una lectura cancelada, fallida o superior a 60 segundos deja disponibles las propuestas por posición. El modelo y licencias acompañan la distribución; versión tessdata_fast 4.1.0, SHA256 del archivo comprimido `4eecbf64c3bad3835d16773a8d6372ccaaa8b1f253df52a9fa7d3faa4c09afc2`.

Se prepararon 256 ECG reales y sus hojas anotadas para el [piloto reproducible de OCR](training/sheet-ocr-results/README.md). Este trabajo selecciona preprocesamiento de un OCR existente y no entrena nuevos pesos. La evaluación nativa tiene errores y no valida el navegador ni fotos clínicas independientes. El OCR en la edición HTML de un solo archivo necesita los recursos `/ocr/`; si faltan, continúa la selección por posición.

También se ejecutó entrenamiento nuevo de un clasificador compacto de etiquetas con 9.216 recortes aumentados de 192 ECG (pacientes distintos de selección y prueba). Su alta exactitud en recortes conocidos no se generaliza al papel y al fondo: el [informe del candidato](training/lead-label-results/README.md) documenta falsas aceptaciones de regiones sin etiqueta. Se conserva como investigación, sin activar en la preselección pública.


### PDF, formatos y signos de alarma

El selector de archivos admite JPG, PNG, WebP y PDF (hasta 20 MB). Un PDF se abre localmente con PDF.js: se elige una página entre hasta 200, se previsualiza y se rasteriza con un máximo de 8 millones de píxeles antes del OCR y del recorte de derivaciones. No se cargan archivos a un servicio. Los PDF con contraseña deben exportarse sin protección o como imagen. El límite de resolución controla memoria, no demuestra exactitud de digitalización. La prueba de renderizado local verificó un documento simulado de dos páginas, seleccionando y dibujando la segunda con etiquetas y calibración.

La selección del formato incluye ejemplos simulados 4×3 y 2×6 y una tira de II para mostrar qué no equivale a 12 derivaciones. Que una imagen cumpla el formato no garantiza una reconstrucción fiable.

Los casos con signos de alarma o incertidumbre pueden continuar tras aceptar expresamente un aviso de alcance y prioridad de atención urgente. El recordatorio continúa visible durante la captura y en el visor del caso. Siguen vigentes la restricción a adultos y la separación entre práctica pública e instalación institucional para datos de pacientes.


### Identidad CardioEKG

CardioEKG es el nuevo nombre de la aplicación. La K del logotipo incorpora un trazo inspirado en el QRS, generado para el proyecto y guardado en `public/cardioekg-logo.png`. La marca se usa en la cabecera, pie y favicon. Los fondos crema combinan degradados suaves rojos, coral y naranja; las zonas de trazado e imágenes mantienen su contraste de lectura. Se conservan el ID de Sites y la URL histórica `cardioscopio-ecg` para no romper enlaces. Los archivos históricos que conservan ese nombre siguen documentados por su nombre real.


### Reconstrucción en lote y calibración de cuadrícula

La confirmación del mapa (individual o en conjunto) inicia la reconstrucción local de todas las derivaciones seleccionadas. Los trabajadores se ejecutan de forma secuencial para acotar memoria en móviles. Cada resultado aparece superpuesto a su recorte; los trazados sin incidencias pasan al conjunto de revisión y solo los fallidos abren la corrección individual. Una nueva ejecución reutiliza los resultados correctos cuando imagen, recorte, velocidad y ganancia coinciden. La confirmación clínica final del conjunto se mantiene.

Los recuadros iniciales se limitan a filas sin solapamiento. Al moverlos se detienen frente al vecino; un recorte nuevo no puede invadir otra zona. La tira larga solo se incluye automáticamente si se detecta una fila independiente; también puede añadirse o excluirse explícitamente.

Se reprodujo y corrigió una confusión entre líneas principales de 5 mm y menores de 1 mm: el digitalizador anterior calculaba 1,99978 s para un trazado simulado de 10 s. Ahora conserva líneas grises tenues y estima el período fundamental por posiciones, con pruebas de alineación fraccionaria y recortes cortos/largos. Una cuadrícula periódica sin evidencia suficiente de unidades se marca `periodic-only`: su escala es provisional y requiere calibración manual, no aceptación automática. Se mantiene el rechazo de deformación real entre los ejes. Estas pruebas no validan fotos clínicas independientes ni garantizan toda preselección.


### Papel y bandas oscuras en la preselección

La preselección separa primero el papel claro de los márgenes negros o transparentes. Normaliza la iluminación y busca filas solo dentro de ese papel; no cuenta el negro exterior como tinta. Los recortes y las etiquetas OCR se transforman después a porcentajes del archivo original. La vista inicial se centra en el papel, con opción de ver la imagen completa, usando una previsualización generada del mismo bitmap que se analizó. El puntero y los recuadros usan la transformación inversa del mismo marco, independiente del zoom.

Si no hay evidencia de filas, no aparecen recuadros automáticos: se informa del fallo y puede elegirse explícitamente una plantilla manual. El papel vacío o la cuadrícula sin trazado no equivalen a una detección. La regresión que saltaba una primera fila situada antes del 14 % se eliminó, manteniendo un pequeño margen para bordes.

Se comprobó el caso de bandas negras en una imagen sintética y, localmente, en la región de la captura aportada: los doce recuadros quedan dentro del papel y las cuatro filas abarcan sus trazados. Los [resultados y límites](training/paper-region-results/README.md) documentan coordenadas, no validación clínica ni verificación interactiva. La captura y sus recortes quedan fuera de Git y del sitio publicado; no se usaron para entrenamiento.


### Escala común y vistas provisionales

La calibración dejó de elegir la primera periodicidad de píxeles: ahora verifica una retícula principal y evidencia de líneas intermedias, para no confundir el tramado de escáner de 2 px con 1 mm. El análisis global del papel puede aportar una referencia automática verificada por varias regiones. Se usa como respaldo solo para errores de escala locales; no sustituye una calibración local correcta ni anula anisotropía medida localmente. No se supone duración fija ni ancho físico de la hoja.

Si falla la escala, se conserva la reconstrucción provisional en píxeles, sin segundos ni mV y sin incorporarla como señal calibrada al visor. Los errores de escala se agrupan como un problema común del papel, no como trece recuadros mal dimensionados. La herramienta «Calibrar el papel una vez» permite encajar una referencia en un cuadro real de 5 × 5 mm y aplicar sus dimensiones a todos los recortes del mismo archivo. Esa referencia se confirma explícitamente, y no sirve para corregir perspectiva no uniforme.

Se comprobó una imagen pública mediante el mismo código de recorte, redimensionado y procesamiento utilizado por el worker, con adaptadores Canvas de Node: las 13 calibraciones pasan y quedan cuatro avisos de calidad de señal. Los [resultados](training/calibration-e2e-results/README.md) distinguen esta comprobación de una prueba interactiva en Safari y de la reproducción exacta del archivo original del usuario, que no estaba en las capturas de error.


### Solapamiento flexible y aceptación conjunta

Los recuadros pueden ampliarse o moverse sobre parte de otro recuadro para abarcar ondas que se extienden más allá de la zona vecina. Esa intersección geométrica no impide confirmar, reconstruir ni recalibrar. Solo una superposición amplia produce un aviso orientativo; no es un error bloqueante. Se mantienen los límites reales de imagen, la comprobación de escala y los controles de calidad de señal.

El mapa incluye «Aceptar todas las zonas con un solo botón», activado inicialmente. «Aceptar todos y reconstruir» confirma las zonas visibles e inicia el lote sin un OK para cada derivación ni una casilla adicional. El ajuste puede desactivarse para volver a la confirmación individual. La revisión final del caso permanece separada de la aceptación de zonas. Esta sección sustituye la restricción estricta de solapamiento descrita en versiones anteriores.
