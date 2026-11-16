# CardioEKG v20 · detección con etiquetas impresas y calibración en la cuadrícula

Fecha: 2026-11-12. Pruebas: 147 de 147 correctas (`npm test`), `tsc --noEmit` sin errores, `vite build` correcto.

## Por qué fallaba con las hojas de Wave-Maven

| Problema | Causa en el código | Corrección |
| --- | --- | --- |
| El trazado no se detectaba | `traceMask` exigía tinta gris; el trazado azul marino (0,0,76) y las barras azules quedaban fuera | Tinta = luminancia < 140 que no sea color de cuadrícula (`isGridColour`) |
| El OCR no leía las etiquetas | El preprocesado usaba el canal máximo: el azul puro (0,0,255) se volvía blanco | Luminancia, cuadrícula a blanco y binarización |
| Las etiquetas leídas no coincidían | Wave-Maven imprime «aV R» y «V 1» espaciadas: Tesseract devuelve dos palabras | Se unen palabras vecinas de la misma línea si el hueco es menor que la altura del texto |
| Etiquetas asignadas a la fila de arriba | Una etiqueta justo debajo de las ondas de una fila pertenece a la siguiente | La etiqueta se asigna a la banda cuya línea de base está debajo de ella |
| Columnas aproximadas | Solo había reparto uniforme | Se detectan las barras verticales de cambio de derivación; la columna empieza en la barra junto a la etiqueta |
| Recuadro de 5 mm sobre el encabezado | Posición fija al 10 % / 15 % de la hoja | `locateGridSquare` encuentra las líneas mayores de la cuadrícula y coloca el recuadro en un cuadro grande limpio de trazado |
| Velocidad y ganancia manuales | El texto impreso no se leía | `readPrintedCalibration` lee «25 mm/sec, 10 mm/mV», tolerando errores del OCR, y lo aplica (el usuario puede cambiarlo) |

## Verificación con hojas reales

- Wave-Maven casos 1, 2 y 15, con el OCR real (Tesseract con el mismo modelo `eng` de la app). Se leyeron entre 7 y 8 de las 9 etiquetas no romanas (aVR, aVL, aVF, V1–V6), y velocidad y ganancia 25 mm/s y 10 mm/mV. Las cuatro bandas y sus pulsos de calibración se detectaron en los cinco casos incluidos.
- Las etiquetas romanas (I, II, III) en tipografía serif no se leen: esas derivaciones se colocan por posición en la primera columna. Exigen confianza ≥ 75 para no confundirlas con trazos verticales.
- Nueva prueba de regresión con la imagen real del caso 1 (`src/research/fixtures/wave-maven-case-1.1200x927.rgba.gz`). Comprueba bandas, pulsos, columnas en las barras impresas, que III no caiga en la tira de ritmo y que el cuadro de 5 mm esté en la cuadrícula.

## Límite

Solo se verificó con hojas Wave-Maven (digitales y limpias). Fotos de papel con perspectiva, sombras o cuadrícula gris siguen sin medir.
