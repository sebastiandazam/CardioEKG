# CardioEKG v19 · cambios sobre v18

Fecha: 2026-11-12. Pruebas: 144 de 144 correctas (`npm test`), `tsc --noEmit` sin errores, `vite build` correcto.

## 1. Lectura real de la hoja de ECG (antes: plantilla por porcentajes)

Archivos nuevos: `src/research/layoutDetect.ts`, `src/research/layoutMemory.ts`, con sus pruebas `layoutDetect.test.mjs` y `layoutMemory.test.mjs`.
Archivos modificados: `sheet.ts`, `SheetInput.tsx`, `SheetReview.tsx`.

Antes, las columnas se colocaban siempre en `4 + col × 93 / n` % de la página. El OCR solo intercambiaba identidades entre esas cajas fijas. Ahora la app hace lo siguiente:

1. **Separa el trazado de la cuadrícula.** Toma la tinta oscura y no roja, y elimina las reglas rectas continuas (marcos, cuadrícula oscura). Una línea de base sobrevive porque cada complejo la interrumpe.
2. **Encuentra cada banda de trazado** por proyección horizontal y descarta el texto: un trazado es una línea continua, mientras que el texto se corta en cada palabra.
3. **Mide dónde empieza y termina la tinta** de cada banda, en lugar de usar los márgenes de la página.
4. **Detecta el pulso de calibración** (flanco de subida, meseta y bajada). La primera derivación empieza después del pulso. Con la cuadrícula calibrada, la altura del pulso da la ganancia en mm/mV y se avisa si no coincide con la ganancia elegida.
5. **Detecta los cortes entre derivaciones** (huecos en el trazado) y deduce la distribución: cortes en ¼, ½ y ¾ indican 4 × 3, y un corte en ½ con 6 bandas indica 2 × 6. Con 6 bandas sin etiquetas, la distribución es ambigua y se deja al usuario. La opción por defecto es «Detectar automáticamente».
6. **Ancla cada derivación en su etiqueta impresa** cuando el OCR la lee: la banda y la posición x de la etiqueta definen la zona. La tira de ritmo es la banda etiquetada como II.
7. **Aprende de las correcciones.** Al pulsar «Aceptar y reconstruir», las zonas confirmadas se guardan relativas a las bandas detectadas: índice de banda y fracción de su ancho. La siguiente hoja con la misma distribución, el mismo número de bandas y una proporción similar empieza desde esa corrección. Solo se guarda geometría, sin píxeles, nombres ni datos del paciente, y solo en `localStorage` de este navegador. Hay un botón para olvidarla.
8. Cada zona indica cómo se colocó: por etiqueta, por corrección aprendida, sobre el trazado detectado o en posición estándar (cuando no se detectó trazado).

**Límite:** se probó con hojas sintéticas, con cuadrícula roja, encabezado de texto, pulsos, márgenes desplazados y filas irregulares. **No se ha medido sobre fotos reales.** Falta una evaluación con un conjunto de imágenes anotadas, por ejemplo ECG-Image-Database o PTB-XL renderizado con distintos dispositivos.

## 2. Lectura sistemática con historia clínica (antes: impresión no concluyente)

Archivo nuevo: `src/ecg/comprehensive.ts`, con su prueba `comprehensive.test.mjs`.
Archivos modificados: `estimate.ts` (morfología por derivación), `analyze.ts`, `analysisTypes.ts`, `AnalysisPanel.tsx`, `report.ts`, `evidencePrompt.ts`, `context.ts`, `ClinicalContextForm.tsx` y `brand.css`.

- **Morfología nueva por derivación** (latido mediano): onda Q (amplitud y duración), complejo QS, tiempo al pico de R, R′ (rsR′), muesca de R, duración de P y componente terminal negativo de P.
- **Lectura por secciones:** ritmo, frecuencia, intervalos (PR, QRS, QT/QTc), eje (con hemibloqueos), onda P (crecimiento auricular), QRS (bloqueos de rama completos e incompletos, trastorno inespecífico, ondas Q patológicas, progresión de R, bajo voltaje), hipertrofia (Sokolow-Lyon y Cornell por sexo; HVD), ST–T (primario frente a secundario) y correlación clínica.
- **Cada afirmación tiene un estado:** *cumple criterios*, *sugiere*, *normal*, *no evaluable* o *contexto*, con el criterio y las derivaciones usadas.
- **Conclusión de una línea.** Nombra los diagnósticos que cumplen criterios (por ejemplo, «Ritmo sinusal; bloqueo completo de rama derecha (FC 75 lpm, PR 156 ms, QRS 168 ms, eje 97°)»), luego los probables, y lista exactamente lo que no se pudo evaluar. Dice «ECG dentro de límites normales» solo cuando las 12 derivaciones se evaluaron y nada salió alterado. No fuerza un diagnóstico cuando faltan datos.
- **La historia clínica cambia la lectura:** edad (criterios pediátricos no aplicados; voltaje poco específico en menores de 35 años), sexo (umbrales de QTc y de Cornell), síntomas (dolor torácico, síncope, palpitaciones), fármacos (que prolongan el QT, digoxina, que enlentecen el nodo AV), potasio alto o bajo (campo nuevo), electrolitos, marcapasos, hipertensión y muerte súbita familiar.
- La conclusión encabeza la impresión, el panel, el PDF y el prompt de evidencia. El formulario clínico se abre desplegado.
- La etiqueta del caso no modifica la lectura (hay una prueba de invariancia).

**Límite:** son reglas de guías, no un modelo validado. Su exactitud depende de la digitalización y de la ganancia. Para las ondas Q se exigen ≥ 40 ms, más que los 30 ms de la definición universal, por el error de digitalización. Falta medir sensibilidad y especificidad por hallazgo frente a lectores expertos.

## 3. Más registros para entrenar

Archivo nuevo: `training/clinical-run/bulk_download.py`.
Archivos modificados: `download_data.py` (opción `--full`) y `diagnosis.py` (lee `cohort-manifest-full.json` con `--full`).

- Antes se descargaba archivo por archivo con curl y la descarga se detuvo en 522 registros de PTB-XL.
- Ahora se replican los conjuntos completos con `aws s3 sync --no-sign-request`, `wget -c` o `curl -C -`, todos reanudables. Cada archivo se verifica con el `SHA256SUMS.txt` de PhysioNet y se guarda el hash de la licencia.
- Conjuntos incluidos: PTB-XL 1.0.3 (21.799 registros, CC BY 4.0), Chapman-Shaoxing-Ningbo 1.0.0 (45.152, CC BY 4.0), LUDB (200) y QTDB (105), ambos ODC-By 1.0.
- `--full` usa todos los registros elegibles de cada pliegue oficial de PTB-XL (separados por paciente) y todo Chapman como validación externa.
- Pasos:
  ```
  python training/clinical-run/bulk_download.py ptb chapman ludb qt
  python training/clinical-run/download_data.py --full
  python training/clinical-run/diagnosis.py --full
  ```

**Límite:** el entorno donde se hizo este cambio no tiene acceso a PhysioNet (HTTP 403), así que la descarga y el reentrenamiento no se ejecutaron aquí. Hay que correrlos en un equipo con internet.
