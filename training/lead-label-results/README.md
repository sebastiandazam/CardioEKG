# Entrenamiento ejecutado: identidad de etiquetas de derivación

Se entrenó una **red neuronal pequeña nueva**, no solo una configuración OCR: MLP de 385 entradas → 32 unidades ReLU → 12 clases softmax. Las clases son I, II, III, aVR, aVL, aVF y V1–V6. No diagnostica ECG ni extrae la señal.

## Datos

Utiliza las 256 hojas sintéticas de `sheet_ocr_pilot.py`, generadas desde **256 ECG clínicos reales de 256 pacientes de PTB-XL 1.0.3**, bajo CC BY 4.0. La identidad de registro, paciente, fold y hashes de fuente están en `../sheet-ocr-results/report.json`. Se conserva la separación por paciente: 192 ajuste, 32 selección, 32 prueba.

Para este experimento las cajas de texto son conocidas por el generador: **la localización es un oráculo**. No se enseña a encontrar las cajas en la página. Se obtienen 2.304 etiquetas de ajuste y cuatro versiones de recorte por etiqueta, con desplazamientos de ±2 píxeles y margen de 2–6 píxeles: **9.216 recortes de ajuste**. Selección y prueba tienen 384 etiquetas cada una, sin esas aumentaciones. Las tipografías y el generador de prueba proceden de la misma familia que ajuste; esto limita mucho la generalización.

## Ajuste y resultados

Se ejecutó Adam durante 150 iteraciones, con semilla 20261111, dos hilos de BLAS y penalización L2 de 0,001. El optimizador alcanzó el máximo de iteraciones sin converger; se registra `optimizer_converged: false`. Los parámetros corresponden al último estado, sin ocultar ese aviso.

El umbral se eligió en selección entre 0,50, 0,60, 0,70, 0,80, 0,90, 0,95, 0,98 y 0,99, buscando máxima cobertura con precisión de aceptación ≥99 %. Se eligió **0,50**. En las **384 cajas verdaderas conocidas de prueba**, clasificó correctamente las 384 y no se abstuvo.

**Este 100 % no es precisión de detección de una hoja completa.** Como prueba posterior de rechazo se tomaron 128 recortes de papel/cuadrícula sin etiqueta de las mismas hojas de prueba: el modelo aceptó erróneamente **116/128** con el umbral fijado. No se había entrenado una clase «sin etiqueta». Por eso **no se activa en la web ni debe sustituir al detector/OCR**. Una confianza softmax alta no garantiza que exista una derivación. El resultado útil es un candidato de identidad de texto para futuras regiones de texto correctamente localizadas, con necesidad de entrenar y validar rechazo de fondo y dominios fotográficos externos.

## Pesos y características

`candidate.json` contiene unos 126 KiB de pesos y sesgos, el orden de clases y la especificación de características:

1. Recortar la caja de texto conocida con margen de 4 píxeles.
2. Escala de grises por máximo RGB para atenuar cuadrícula roja.
3. Tinta `(máximo(gris) − gris) / máximo(1, máximo(gris) − mínimo(gris))`.
4. Convertir a 8 bits y redimensionar con bilineal a 16×24; aplanar por filas y dividir por 255.
5. Añadir `mínimo(4, ancho_caja_sin_margen / alto_caja_sin_margen) / 4`.
6. Producto por primera matriz + sesgo, ReLU; segunda matriz + sesgo, softmax.

`check_label_candidate.py` reconstruyó la inferencia desde los pesos redondeados exportados: las 384 predicciones permanecen iguales y la mayor diferencia de confianza fue 1,44×10⁻¹⁰. Esto comprueba la exportación numérica en Python; todavía no comprueba equivalencia de interpolación PIL/Canvas ni uso en navegador.

`report.json` incluye resultados de selección, matriz de confusión y cada etiqueta de prueba. `export-check.json` incluye la verificación de pesos y el fallo de rechazo de fondo.

## Reproducir

```sh
python training/sheet_ocr_pilot.py
OPENBLAS_NUM_THREADS=2 OMP_NUM_THREADS=2 python training/train_lead_labels.py
OPENBLAS_NUM_THREADS=2 OMP_NUM_THREADS=2 python training/check_label_candidate.py
```

Son necesarias NumPy, Pillow y scikit-learn. Las hojas, señales y recortes de origen permanecen en `data/`, excluidos de Git y del despliegue estático. Faltan una clase de fondo, detección de regiones, fuentes y formatos externos, fotos clínicas autorizadas y evaluación independiente. No hay aval para uso con registros de pacientes.
