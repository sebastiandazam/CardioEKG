# QA de papel con bandas negras, 2026-11-11

Se reprodujo el error de propuestas situadas sobre bandas negras. Este trabajo es una comprobación de coordenadas y detección de papel; **no es entrenamiento**, validación de digitalización ni verificación interactiva en navegador.

## Entradas

1. Imagen sintética de 600×1050 píxeles: papel claro entre x=30..570, y=470..910, sobre fondo negro. Doce segmentos en tres filas, más una tira larga independiente; baselines conocidos en y=560, 650, 740 y 830.
2. El mismo papel/cuadrícula, pero sin trazados: control negativo para evitar llamar detección a una plantilla.
3. Inspección local de la captura de pantalla proporcionada por el usuario (588×1280), recortando exclusivamente el área de imagen de la aplicación: x=43, y=270, ancho=520, alto=924. Dentro de esa región, la inspección visual identifica el papel del ECG aproximadamente en y=393..740 y cuatro filas en y≈437, 523, 609 y 694. La captura contiene anotaciones previas de la interfaz sobre la banda negra; no constituye una foto clínica independiente.

La captura y sus recortes se mantuvieron en `data/paper-region/`, excluido de Git y del despliegue. **No se entrenó con la imagen del usuario ni se publica su imagen.** Los informes contienen únicamente coordenadas y resultados agregados.

## Antes y después

Referencia anterior: `sheet.ts` del commit `46ff45664ced2573777b8577414c6169788a8b3b`. La versión corregida detecta primero el papel claro y analiza las filas dentro de ese sistema de coordenadas; después transforma los recortes al original.

| Entrada | Cajas enteras dentro del papel, antes → después | Resultado relevante |
|---|---:|---|
| ECG sintético con bandas negras | 0/12 → 12/12 | Las cuatro filas contienen su baseline; error de centro ≈2 px en cada una |
| Papel vacío con bandas negras | 0/12 → 12/12 | `rowsDetected=false`, `rhythmDetected=false`; los recortes son solo plantilla pendiente de revisión |
| Región de la captura del usuario | 0/12 → 12/12 | Papel detectado y=393..740; errores de centro de filas I/II/III/II larga: 2/0/2/5 px |

Antes, los centros sintéticos estaban desviados 413–428 píxeles y caían en la banda negra. La captura real tenía errores de centro de 120–208 píxeles; ninguna de las cuatro cajas representativas contenía su baseline correspondiente. Después, los cuatro baselines de ambos ECG quedan dentro de su fila. La caja de II larga se detecta como una fila independiente en estas dos entradas.

La inspección visual de la captura original confirma que los límites corregidos corresponden a la zona rosada visible del ECG y que las propuestas corregidas no caen en las bandas negras. Esto **no prueba** las asignaciones de nombres por OCR, la integridad de cada onda, la calibración ni las interacciones del navegador.

## Reproducir sin imagen del usuario

```sh
python training/paper-region-results/make_fixture.py
node --experimental-strip-types training/paper-region-results/evaluate.mjs \
  /ruta/absoluta/al/proyecto/src/research/sheet.ts /tmp/paper-region-after.json
```

La reproducción sintética requiere NumPy y Pillow; no necesita descargar datos ni conectarse a servicios externos. `make_fixture.py --screenshot /ruta/privada/captura.jpg` permite repetir localmente el recorte específico de esta captura, sin copiarlo a archivos rastreados. `before.json` y `after.json` conservan todas las cajas y las comprobaciones de posición.

## Comprobación adicional de la guarda de cabecera

Se volvió a ejecutar la QA después de añadir normalización del papel y supresión de líneas de cuadrícula anchas; las conclusiones anteriores se mantienen.

Se inspeccionó también el renderizado local de la imagen pública de referencia (1200×930, con gran cabecera blanca): los centros detectados actuales son 41,94 %, 58,49 %, 74,84 % y 89,78 % de la altura, próximos a las filas visibles 42/58/75/90 %. En una copia experimental que reduce la guarda superior del 14 % al 3,5 %, esos cuatro centros permanecen idénticos: la cabecera no se confunde con un trazado en esta imagen.

Como control de recorte estrecho, se recortó la imagen sintética hasta dejar la primera fila a 10,23 % de altura y sin bandas negras. La guarda del 14 % elimina esa fila y desplaza las asignaciones una fila hacia abajo (I aparece en 32,74 %). Con guarda de 3,5 % se recuperan las cuatro filas, con errores de centro aproximados de 2 píxeles. `header-guard-experiment.json` conserva la comparación. La prueba se ejecutó en una copia local del módulo, sin modificar `src`.

Esto justifica una regresión para ECG recortados cerca de la primera fila; no demuestra inmunidad a todas las cabeceras. La regularidad de filas, su extensión horizontal y la revisión de las etiquetas siguen siendo necesarias para evitar presentar texto como trazado.
