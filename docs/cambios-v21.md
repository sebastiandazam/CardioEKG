# CardioEKG v21 · auditoría completa de la v20.1

Fecha: 2026-11-12. Pruebas: 152 de 152 (`npm test`), `tsc --noEmit` sin errores, `vite build` correcto. Motor `cardioekg-analysis-2.3.0`.

## Estado de los 17 hallazgos de la revisión de la v16

Corregidos en v17–v18 (verificado en el código y en `auditRegression.test.mjs`): H1 QRS global, H2 medidas independientes de la etiqueta, H3 decisión multietiqueta, H4 `.gitignore`, H5 repolarización secundaria, H7 bradicardia < 50, H8 confirmación al salir, H9 ganancia precordial, H10 latidos perdidos, H11 ganancia única en el PDF, H12 animación sin mecanismo asignado, H14 comparación con tolerancia, H15 ventanas de II corta. Siguen abiertos: H6 (reentrenar con la cohorte completa; requiere descargar datos) y la validación con lectores expertos.

## Problemas encontrados y corregidos en esta auditoría

| # | Área | Problema | Corrección |
| --- | --- | --- | --- |
| 1 | Medición | **Regresión de la v20:** el cuadro de 5 mm detectado en la vista previa (precisión de ±1 px en 22 px, cerca de 4,5 %) sustituía a la calibración automática precisa del worker como escala | Se separó en `gridHint`: solo coloca el recuadro manual; la escala automática vuelve a ser la del worker |
| 2 | Detección | Una foto inclinada 1,5° reducía la detección de 4 bandas a 1 | `deskew.ts`: mide la inclinación (±8°) y endereza la imagen una vez al cargarla; todo lo demás trabaja sobre la imagen enderezada |
| 3 | Detección | Una sombra recortaba el papel y dejaba fuera la última columna | Umbral de Otsu para el papel y extensión hasta donde continúa la cuadrícula impresa |
| 4 | Detección | Hoja de 6 bandas sin etiquetas: se abandonaba la lectura y se usaba la plantilla fija | Se lee sobre las bandas como 4 × 3 y se avisa de la ambigüedad |
| 5 | OCR | La binarización global convertía en negro las zonas en sombra | Se iguala la iluminación antes de binarizar |
| 6 | Calibración | Sin cuadro detectado, el recuadro caía en el encabezado | Aparece en la esquina de la zona de la derivación I |
| 7 | Clínica | El QTc tenía dos escalas distintas (450/460 en la lectura; 470/480 en las reglas) | Una sola: limítrofe desde 450/460, prolongado desde 470/480, ≥ 500 alto riesgo |
| 8 | Clínica | BRI o marcapasos con dolor torácico: no había ningún criterio de isquemia | Criterios de Sgarbossa con la modificación de Smith (`sgarbossa()`), como «sugiere» y urgente |
| 9 | Clínica | La conclusión podía repetir «frecuencia rápida» junto a «FA con respuesta rápida» | Deduplicado |
| 10 | Uso | No se podía llevar la lectura a una nota | Botón «Copiar lectura» (texto plano) |
| 11 | Uso | «Olvidar zonas aprendidas» no confirmaba nada; no se informaba del enderezado | Mensajes de estado |
| 12 | Coherencia | Versión del motor sin cambiar tras modificarlo; rótulo «v18» | Motor 2.3.0 (un servicio remoto antiguo se marca como incompatible) y rótulo v21 |

## Verificación

- Navegador real (Chrome sin interfaz): detección, enderezado y OCR ejecutados dentro de la página con el caso 1 de Wave-Maven y con una versión degradada del mismo (inclinada 1,5°, sombra, desenfoque, JPEG, fondo gris). En la degradada: inclinación medida −1,5°, 4 bandas, distribución 4 × 3 y 6 etiquetas leídas.
- La «foto» degradada es una simulación hecha a partir de una hoja digital, no una fotografía real.

## Pendiente (no se puede resolver solo con código)

1. Descargar las cohortes completas y reentrenar (`bulk_download.py`, `--full`).
2. Medir la digitalización con fotos reales de papel y la lectura sistemática frente a lectores expertos.
3. Las etiquetas I, II y III no se leen por OCR; se colocan por posición.
4. Sin perspectiva: se corrige la inclinación, no el trapecio de una foto tomada en ángulo.
5. No se detectan bloqueos AV de segundo y tercer grado, preexcitación ni espigas de marcapasos.
