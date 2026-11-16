# Diagnóstico de calibración con una imagen pública completa

Se ejecutó el flujo completo de propuestas por `analyzeSheet`, recorte de cada derivación sobre el original y reducción isotrópica hasta 1800×460, seguida de `digitize`. La reducción local usó Pillow bilineal; por tanto comprueba el algoritmo y los tamaños del worker, pero no sustituye la equivalencia exacta de interpolación Canvas ni una prueba interactiva en navegador.

Fuente de la imagen pública: ECG-Image-Database, distribución oficial Kaggle `physionet/ecg-image-database`, original `D0/D0_000022/D0_000022_04.jpeg`, 2132×1652. Su licencia declarada es CC BY-ND 4.0. El original y todos los recortes se conservaron localmente en `data/`; **no se redistribuyen ni se usaron para entrenar**. Los informes contienen solo coordenadas, escalas y estados.

## Fallo reproducido

El digitalizador elegía una textura de escaneo de aproximadamente **2 píxeles** como separación milimétrica. En la derivación I (447×212), estimaba 2,039×2,121 px/mm y **8,77 s**, aunque las líneas principales de la imagen están separadas unos 37–39 píxeles y su cuadrícula milimétrica corresponde aproximadamente a 7,5 px/mm. Cinco de los trece recortes no llegaban a calibrarse; otros devolvían una escala incorrecta. Esto demuestra que las pruebas de cuadrícula sintética anteriores no cubrían el fallo de escaneo real.

La captura de pantalla del usuario, de resolución mucho menor, dio doce `smallCrop` (109×76 aproximadamente) y una `unevenScale`. No reproduce exactamente las trece `atypicalScale` de la última captura y no debe presentarse como esa reproducción exacta: falta el archivo ECG original de ese caso. No se redujeron los límites de duración/altura ni se supuso una duración fija.

## Corrección y resultado

`grid-calibration.ts` busca una retícula de líneas principales de alta prominencia, pliega varios intervalos y exige evidencia coherente de las cuatro líneas intermedias. Si una dirección verifica la jerarquía 1/5 mm, puede establecer el significado de las unidades de la otra dirección **solo cuando esta tiene una retícula principal medida independientemente y la relación X/Y cumple el límite de anisotropía existente**. No se igualan sus longitudes ni se inventan tiempos.

Después de la corrección, las **13 calibraciones** de la imagen pública retornan valores apoyados por la retícula: derivaciones cortas entre 7,32–7,55 px/mm horizontalmente y aproximadamente 7,48–7,53 verticalmente, duración del recorte 2,37–2,44 s. La tira larga reducida a 1800×198 da 6,983×7,010 px/mm y **10,311 s**, sin forzar 10 s.

**Cuatro derivaciones conservan `interruptedTrace`**. La calibración recuperada no implica que toda la señal se haya extraído correctamente; esas reconstrucciones aún requieren revisión/corrección.

La estimación de referencia sobre el original completo usa, cuando la proyección global no conserva líneas menores, consenso de al menos tres parches distintos a resolución original. Exige acuerdo de al menos el 75 % de parches verificados y desviación logarítmica <0,12 en ambos ejes. Para este original devolvió **7,4994×7,5248 px/mm**. `confidence` es una puntuación heurística de contraste, no una probabilidad validada.

Los informes `before.json` y `after.json` conservan todas las propuestas, dimensiones de recorte, estimaciones de cada perfil y códigos de error. Las pruebas añadidas verifican textura de escaneo de 2 píxeles, cuadrícula mayor/menor, ambigüedad de unidades, anisotropía real y equivalencia numérica de dimensiones explícitas manuales frente a referencia original verificada. El piloto existente de 160 renderizados físicamente calibrados sigue devolviendo 160 calibraciones, sin cambiar sus advertencias de calidad.

`pixelTraceDraft` permite dibujar una curva exclusivamente en coordenadas de imagen cuando no puede establecerse escala. No devuelve segundos, mV ni medidas clínicas. Esa vista provisional nunca confirma la calibración.


## Mismo procesador que el worker

`worker-check.mjs` importa directamente `photoProcess.ts`, el módulo usado por el worker del navegador, y ejecuta `analyzeSheet`, calibración compartida y `reconstructSheet` con adaptadores `createImageBitmap`/Canvas de Node. En la imagen pública retorna cero fallos de calibración y cuatro advertencias `interruptedTrace`; `worker-check.json` conserva los resultados. Este ensayo usa los mismos límites y lógica de redimensionado, aunque el motor gráfico nativo no equivale a Safari.

```sh
node --experimental-strip-types training/calibration-e2e-results/worker-check.mjs /ruta/local/al/original-publico.jpeg
```

La nueva calibración común manual usa un cuadro de cuadrícula de 5 × 5 mm verificado por el usuario; no exige redibujar cada derivación. Los trazos provisionales que carecen de escala no contienen tiempos, amplitudes ni medidas clínicas.
