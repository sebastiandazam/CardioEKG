# CardioEKG v22 · diagnóstico presuntivo basado en la literatura

- **Base de conocimiento** (`src/ecg/knowledge/kb/`): 93 entidades cardiacas con 492 criterios y 105 referencias, en cinco dominios: ritmo, conducción, cavidades y eje, isquemia, y repolarización/sistémicas. Detalle en [base-de-conocimiento.md](base-de-conocimiento.md).
- **Motor** (`src/ecg/knowledge/engine.ts`):
  - lógica de tres valores, contigüidad anatómica y contexto clínico;
  - peso de evidencia con LR publicadas cuando existen;
  - diagnóstico presuntivo con hallazgos concurrentes, diferencial y lista de «no se puede descartar»;
  - validador estructural de la base.
- **Medidas nuevas** (`estimate.ts`):
  - por derivación: pendiente del ST, segmento PR, relación T/QRS y empastamiento inicial;
  - globales: ejes de P y T, fracción de P conducidas, PR variable y alternancia del QRS;
  - corrección: una r pequeña ya no se confunde con una Q.
- **Interfaz:** panel «Diagnóstico presuntivo» en la revisión. Para cada entidad muestra:
  - criterios cumplidos, en contra y no evaluables;
  - simuladores y rendimiento publicado;
  - siguiente paso según la guía y referencias.
- **Salidas:** el panel también aparece en el PDF y en la solicitud de segunda opinión. Versiones: motor `cardioekg-analysis-2.4.0`, base `cardioekg-kb-1.1.0`.
- **Auditoría clínica** de la base (`scripts/kb-auditoria-v22.mjs`): elimina falsos positivos de TEP, HVD, HVI dentro del BRI, infarto antiguo e hiperpotasemia sin laboratorio.
- **Pruebas:** 171 en total, con 19 nuevas de motor y escenarios clínicos.

## v22.1 · motor de medición Python

El servidor opcional incorpora `POST /api/measure` (motor `ecg_analisis` v3.1) y el visor, un panel que compara sus medidas con las locales. Detalle en [medicion-python.md](medicion-python.md).
