# Captura raster del caso 218: comprobación numérica

El PDF original `artifacts/wave-maven-review/pdf/case-218.pdf` se usa exclusivamente como entrada de imagen. Su identificación conocida como caso de WPW solo se utiliza para comprobar el resultado **después** del cálculo; no entra en el detector, la selección de recortes ni las medidas. El script requiere el PDF local, Poppler (`pdftoppm`), Pillow, Node con `--experimental-strip-types` y las dependencias Python de medición:

```sh
node --experimental-strip-types scripts/check-capture-preexcitation.mjs
```

Los resultados y trazas se escriben en `artifacts/capture-preexcitation/`, que está ignorado por Git. El script falla si la captura automática no devuelve trazas sin aviso o si deja de obtener evidencia compatible en al menos dos derivaciones. Es una regresión de un caso, no una estimación de sensibilidad o especificidad.

## Método y límites

Se renderiza la página a 216 dpi, correspondiente a la escala 3 que calcula `pdfRenderScale` para la página de 792 × 612 puntos. Poppler rasteriza el PDF y Pillow realiza las operaciones de redimensionado y recorte bilineal: aproximan el render y canvas del navegador, sin ser idénticos a PDF.js/canvas. La imagen de 2376 × 1836 se reduce a 1200 × 927 para `analyzeSheet`, se elige explícitamente la disposición 4×3 y se aplican las coordenadas porcentuales propuestas a la imagen completa, con el redondeo y límites de tamaño de `digitizePhoto`. Cada recorte se procesa con `processPhotoRaster`, que usa el digitalizador real y rechaza escala desconocida. Se ejecuta `measure_signals` real en CPython con las trazas aceptadas, sin presuponer simultaneidad ni eje comparable. Se incluye la tira larga II como ritmo.

No se ejecutan DocumentPicker, PDF.js, OCR, interfaz, selección manual, corrección de inclinación ni navegador. Tampoco se verifica una fotografía real, otra resolución de cámara ni la experiencia de publicación. El resultado no es QA visual ni prueba clínica. La elección 4×3 es explícita; no prueba inferencia de disposición o etiquetas. No se han inspeccionado aquí visualmente todos los límites de recorte.

Se compara la calibración automática de cada recorte con una referencia manual independiente de 5 mm calculada a partir de las dimensiones físicas nominales del PDF (216/25,4 píxeles/mm), a 25 mm/s y 10 mm/mV. Esta referencia es un supuesto físico para la comparación; no debe presentarse como calibración detectada automáticamente o comprobada con regla. El procesamiento automático sí informa jerarquía de cuadrícula mayor/menor para las 13 regiones.

## Resultado observado

En la ejecución de esta revisión, las 13 regiones propuestas pasaron la digitalización automática sin avisos; la escala de los recortes cortos fue aproximadamente 8,51 px/mm horizontal y 8,52 px/mm vertical, con duración de 2,44 s. La tira larga, reducida por el límite de 1800 píxeles, dio 9,92 s. La medida automática produjo PR 89 ms, QRS 139 ms y evidencia morfológica compatible en II, aVL, V5, III y aVF. Con la referencia manual nominal resultaron PR 89 ms, QRS 141 ms y las mismas cinco derivaciones. La salida vectorial de referencia previamente calculada por el equipo dio PR 88,5 ms, QRS 140 ms y cinco derivaciones compatibles; no constituye una verdad de terreno independiente.

Para este raster y estos recortes, la captura no explica por sí sola una pérdida de evidencia de delta ni una discrepancia importante de escala. La coincidencia entre ambas calibraciones y la referencia vectorial da confianza limitada en este caso concreto. Si en la aplicación sigue sin aparecer el hallazgo, revisar selección de derivaciones y aceptación de trazas, transformación de la respuesta central a la interfaz y reglas de presentación; también verificar mediante una sesión real de navegador y captura móvil, que este ensayo no cubre.
