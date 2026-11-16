# Estimación automática de medidas del ECG

La reconstrucción de una imagen, la medición de la señal y la clasificación diagnóstica son funciones separadas. Las medidas no requieren pesos de un clasificador. La implementación pública anterior dejaba los cinco campos de los registros clínicos a `null`; en las capturas solo la frecuencia intentaba calcularse automáticamente. Se ha sustituido esa conexión incompleta por `src/ecg/estimate.ts`.

## Cálculo y procedencia

- Solo se procesan señales finitas con tiempo y amplitud calibrados, al menos 100 muestras/s y calidad ≥0,8 cuando existe una puntuación de reconstrucción. Se interpolan a 250 Hz para el procesamiento; esto no añade resolución al original.
- Se suaviza la señal y elimina una línea de base móvil. Se detectan complejos mediante energía de cambios rápidos, período refractario y refinamiento de la deflexión. La frecuencia se obtiene del promedio de RR entre complejos detectados; se requieren al menos tres y una morfología delimitable. No se asigna una frecuencia predeterminada ni se exige regularidad sinusal.
- Una plantilla mediana de al menos dos latidos completos permite estimar los límites. QRS usa el comienzo y fin de actividad rápida con un período de silencio. La medida mostrada es la mediana de derivaciones delimitables, con control de dispersión; no es una duración global validada de 12 derivaciones.
- PR busca una P reproducible en II, luego V1/I/aVF/V4 cuando II no permite delimitarla. El caso etiquetado como fibrilación auricular no recibe PR. La ausencia de una estimación de P no diagnostica fibrilación auricular.
- QT usa el final de T por intersección de la pendiente terminal con la línea de base y consenso entre derivaciones. Es QT sin corrección por frecuencia, no QTc. T bifásicas, U, ruido, frecuencias elevadas y repolarización variable pueden invalidar o sesgar la estimación.
- El eje usa las áreas netas de QRS respecto de la línea de base en I y aVF, con la relación geométrica de las derivaciones aumentadas. En los registros clínicos simultáneos se habilita directamente; en capturas requiere confirmar latidos comparables y calibración común. Las derivaciones ausentes, casi isoeléctricas o sin QRS delimitable no reciben un eje.
- Los valores manuales del compás tienen prioridad sobre las estimaciones, incluido un eje de 0°. Cada campo conserva procedencia automática/manual y un motivo específico si no puede estimarse.
- Los límites temporales estimados sirven para visualizar la relación docente con el modelo. No son anotaciones clínicas verificadas y no establecen un diagnóstico.

## Comprobación reproducible

`npm test` incluye pruebas de ondas sintéticas con frecuencia, intervalos y cuadrantes del eje conocidos, polaridad invertida, distintas frecuencias de muestreo, ruido, señales vacías, calidad insuficiente y corrección manual. Hay una prueba de integración que verifica que `clinical.ts` entrega las medidas al modelo de datos real del visor, evitando volver a fijarlas a `null`.

Resultados del algoritmo para los extractos públicos incluidos (no constituyen valores de referencia anotados por expertos):

| Registro | Frecuencia (lpm) | PR (ms) | QRS (ms) | QT (ms) | Eje (°) |
|---|---:|---:|---:|---:|---:|
| PTB Diagnostic ECG, s0303lre, extracto de 12 s | 77 | 140 | 76 | 340 | +69 |
| PTB-XL, 00351, extracto de 10 s, etiquetado AF | 158 | No aplicable | 68 | 256 | +16 |

La procedencia y licencias de las señales siguen en `src/data/*.json`. Los números se calculan de esas muestras al cargar el catálogo; no se copian de esta tabla. Una prueba comprueba que cambiar el tiempo de la señal modifica la frecuencia calculada.

Estas comprobaciones son regresiones de software y plausibilidad de señal. Sigue pendiente la comparación independiente contra límites P/QRS/T anotados por especialistas, con análisis de error por patología, ruido, formato y fotografía. No se presenta este estimador como un dispositivo de medición clínica validado.


## Revisión con anotaciones expertas, no validación independiente

La ejecución parcial reproducible de `training/clinical-run/` incorporó un registro anotado de LUDB que pertenece al conjunto de ajuste. Permitió detectar y corregir dos errores generales: un nivel de base distinto antes de P podía prolongar falsamente PR, y un ST silencioso o deprimido podía confundirse con una separación entre T y U. Tras las comprobaciones, en ese único registro PR fue 144 ms frente a 142 ms anotados, QT 488 frente a 494, y QRS 72 frente a 95. El error de QRS sigue superando el objetivo de 15 ms. No se interpreta el resultado de ajuste como éxito en prueba ni como validación clínica; los candidatos permanecen inactivos. Los archivos de la ejecución registran las limitaciones y las descargas bloqueadas por HTTP 503.
