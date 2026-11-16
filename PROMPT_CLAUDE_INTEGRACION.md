# Prompt Maestro para Claude — Arquitectura Integrada de CardioEKG v23

Usa este documento junto con el archivo comprimido **`CardioEKG-v23-codigo-completo.zip`** para que Claude comprenda exactamente toda la base técnica ya integrada (sobre el original CardioEKG v22.1) y pueda iterar contigo en nuevas mejoras de UI/UX, reglas clínicas o modelos sin romper ninguna invariante ni prueba existente.

---

## Prompt listo para copiar y pegar en Claude

```markdown
Eres el arquitecto principal e ingeniero clínico-frontend de **CardioEKG v23** (React 19 + TypeScript + Vite + motor Python científico `ecg_analisis.py` / `run_measure.py` ejecutado vía Pyodide en navegador y subproceso aislado en servidor FastAPI). Te adjunto el código fuente completo actualizado en `CardioEKG-v23-codigo-completo.zip` (derivado de `CardioEKG v22.1`, ya integrado, compilado y verificado con `npm test`, `npm run build` y `pytest`).

### 1. Inventario de Cambios Integrados en v23 (Respecto a v22.1)

#### A. OCR y Calibración de Fotografías de ECG (`src/research/`)
- `src/research/labelOcr.ts`: Preprocesamiento con estiramiento robusto por percentiles 2.º–98.º + imagen integral 2D para umbralización adaptativa por bloques combinada con `isGridColour` (inmune a sombras, viñeteado y reflujo).
- `src/research/labels.ts`: Normalizador `normalizeLeadToken` con tabla `LEAD_CONFUSIONS` penalizada (`ll`→`II`, `lll`→`III`, `Vl`/`Vi`→`V1`, `Vs`→`V5`, `aVl`→`aVL`), NMS espacial por derivación al 3 %, emparejamiento bipartito óptimo de costo mínimo en `applyLeadLabels`, y `readPrintedCalibration` resistente a glifos rotos (`25mm/5`, `10mm/rnV`).
- Tests: `src/research/labels.test.mjs`.

#### B. Diccionario Médico Integrado Unificado (`src/evidence.ts`, `src/terms/lexicon.ts`, `src/terms/TechnicalText.tsx`)
- Sin modo separado para estudiantes: interfaz única clínica + docente.
- `src/terms/TechnicalText.tsx` pasa `{ deduplicate: true }` a `technicalSegments`: cada término técnico se subraya **solo una vez por bloque** de texto y enlaza todas sus fuentes clínicas verificadas.
- `src/terms/lexicon.ts`: Eliminados sustantivos genéricos fuera de contexto (`derivaciones`, `aurículas`, `ventrículos`, `conducción eléctrica`, `eje eléctrico`) y añadidos **19 términos clínicos** (Elevación/Depresión ST, Sgarbossa, Wellens, de Winter, Brugada, Preexcitación WPW, QTc, BAV 1.º / Wenckebach / Mobitz II / 3.º, HBAI, HVI, Taquicardia Ventricular, Flutter Auricular, Alternancia Eléctrica, CHA₂DS₂-VA, Tisdale).
- `src/evidence.ts`: Añadidas 8 fuentes primarias (`universal-mi`, `esc-acs`, `esc-af-2024`, `esc-va`, `esc-svt`, `aha-tdp`, `smith-sgarbossa`, `tisdale-2013`) y actualizadas las 15 definiciones base (ES/EN).
- Tests: `src/terms/terms.test.mjs`, `scripts/catalog.test.mjs`.

#### C. Motor Híbrido de Delineación y Dinámica en Python (`server/measure/` y `src/ecg/`)
- `server/measure/ecg_analisis.py`:
  - `fin_T`: Estima `T_onset` por máxima curvatura positiva post-J y `T_fin` por fusión tangente + curvatura ($0{,}55\cdot t_{\text{tan}} + 0{,}45\cdot t_{\text{curv}}$).
  - `detectar_actividad_auricular_diastolica`: Detector espectral Welch ($3{,}8\text{–}5{,}8\text{ Hz}$) en diástole T–Q para detectar ondas F de flutter auricular y suprimir falsas ondas P.
  - `analizar_dinamica_latido_a_latido`: Extrae `pr_variable`, `wenckebach_suspected`, `qrs_alternans` (> 20 % entre pares/impares), `pvc_count` y `pac_count`.
- `server/measure/run_measure.py`: Emite marcadores `'t'` con `tOnsetOffsetMs`, suprime P falsas en flutter sospechado, calcula `qtcBogossianMs` cuando $\text{QRS} \ge 120\text{ ms}$ (dejando `qtcBazettMs` y `qtcFridericiaMs` en `null`), y expone los campos en `estimate.global` y `leadDetails`.
- Tipos TS: `src/ecg/estimate.ts` (`LeadDetail.tOnsetOffsetMs?`, `GlobalFeatures` ampliado) y `src/ecg/pythonAnalysis.ts` (`derived.qtcBogossianMs?`).

#### D. Cribado Clínico Articulado, Literatura y 6 Escalas (`src/ecg/clinicalScales.ts`, `analyze.ts`, `AnalysisPanel.tsx`, `main.tsx`)
- `src/ecg/clinicalScales.ts` (`evaluateClinicalScreening`) conectado a `CaseAnalysis.screening` en `src/ecg/analysisTypes.ts` y `src/ecg/analyze.ts`.
- **Contratos principales expuestos por `analysis.screening: ClinicalScreeningReport`:**
  - `triage`: `{ level: 'emergent' | 'urgent' | 'routine' | 'normal', label: Localized, rationale: Localized, redFlags: Localized[], immediateActions: Localized[], sourceIds: string[] }`
  - `articulatedComparison`: `LiteratureComparisonItem[]` (`parameter: 'rate' | 'rhythm' | 'pr' | 'qrs' | 'qt-qtc' | 'axis' | 'st-t' | 'dynamics'`, `label`, `observed`, `guidelineCutoff`, `status: 'normal' | 'borderline' | 'abnormal' | 'not-evaluable'`, `interpretation`, `referenceId`, `citation`)
  - `scales`: `ClinicalScaleResult[]` (`id`: `'tisdale-qtc' | 'cha2ds2-va' | 'smith-sgarbossa' | 'wct-brugada-vereckei-pava' | 'omi-territorial-screen' | 'av-conduction-syncope'`, `applicability: 'indicated' | 'conditional' | 'not-indicated'`, `score`, `maxScore`, `riskLevel`, `riskLabel`, `criteriaBreakdown[]`, `missingInputs[]`, `recommendation`, `citation`)
- UI integrada y responsiva:
  - `src/ecg/AnalysisPanel.tsx` + `src/brand.css`: Banner de triaje, tabla comparativa con scroll horizontal aislado (`.screening-table-wrap`), tarjetas de escalas indicadas con checklist (`✓`/`·`/`?`) y acordeón secundario para escalas condicionales. Eliminada alerta duplicada cuando `screening` está presente.
  - `src/main.tsx`: `Management` conectado a `analysis.presumptive?.primary` + `analysis.screening` (ya no colapsa entidades fuera de BRD/BRI a `'indeterminate'`), corregido import case-sensitive `import('./integrations/WaveMaven.tsx')` para que `npm run build` (`tsc --noEmit`) pase limpio, y pulida la contención móvil en `src/brand.css`.
  - `src/ecg/TrainingStatus.tsx`: Wrappers responsivos y tabla de métricas calibradas PTB-XL / Chapman / LUDB / QTDB leyendo `public/models/research-summary.json`.

#### E. Pipeline Neuronal y Validación Empírica Calibrada (`training/`)
- `training/delineation_unet.py`: `ECGResSEUNet1D` ($K=9$, Residual + SE + cuello dilatado + cabezal multitarea de ritmo), `JimenezPerezCompositeLoss` (BCE + Dice + Prewitt-11 BoundaryLoss + Prewitt-3 F1InstanceLoss) y `enforce_physiological_sequence`.
- `training/clinical-run/diagnosis.py`, `delineation.py`, `download_data.py`, `export_summary.py`:
  - Diagnóstico calibrado sobre PTB-XL 1.0.3 (`6.000` descargados; `human-only`: fit `2.683`, selección `327`, calibración Platt `500`, test `1.000`) + Chapman 1.0.0 (`1.000` externos): `blend_top2` (`resnet1d` PyTorch MPS + `mlp_neural`) logró **AUROC selección `0,9608`**, **AUROC test `0,9437` con ECE `0,0172`** (Brier `0,0477`), y **AUROC externo Chapman `0,9201`** (ECE `0,0984` por *prior shift* poblacional entre bradicardia sinusal 2,9 % vs. 32,8 %).
  - Delineación sobre LUDB 1.0.1 (`200`) + QTDB 1.0.0 (`30`): `trained_1d_resse_unet` alcanzó MedAE **`4,0 ms`** en P/QRS y **`6,0 ms`** en fin de T en `ludb:test` (`10,0 ms` inicio de T).
  - Reportes agregados incluidos: `public/models/research-summary.json`, `training/clinical-run/diagnosis-report.json`, `training/clinical-run/delineation-report.json`, `docs/cambios-v23.md`. *(Nota: los archivos brutos `.dat`/`.mat`/`.joblib`/`.pt` de `data/` se excluyen del zip liviano para mantenerlo ligero; pueden regenerarse en cualquier momento ejecutando `.venv/bin/python training/clinical-run/download_data.py` seguido de `diagnosis.py` y `delineation.py`).*

---

### 2. Invariantes Críticas que Debes Respetar en Cualquier Modificación Futura

1. **Seguridad y Calibración Clínica (`src/ecg/analyze.test.mjs`, `src/ecg/knowledge/scenarios.test.mjs`, `src/ecg/clinicalScales.test.mjs`):**
   - Mantén `calibrated: false` y `probability: undefined` en `CaseAnalysis.confidence`, `MeasurementDetail.confidence` y `AnalysisFinding.confidence` hasta completar validación fotográfica clínica externa.
   - `clinicalContext.freeText` y `item.pattern` / diagnóstico de origen **nunca** deben alterar mediciones, hallazgos, `presumptive` ni `analysis.screening`.
2. **Exportación PDF (`src/report/report.test.mjs`):**
   - No modifiques la cadena `'P/QRS boundaries and T offset'` en `src/ecg/analyze.ts`.
3. **Motor Python (`server/test_measure.py`):**
   - El error de `qtMs` en los trazados sintéticos de `gen_sintetico.py` debe mantenerse estrictamente en $[-40, 0]\text{ ms}$.
4. **Guardas científicas (`training/clinical-run/test_scientific_guards.py`):**
   - No incluyas claves de nivel fila (`patient_id`, `ecg_id`, `patient`, `record`, `p_signal`, `mv`, `signal`, `test_rows`) en `public/models/research-summary.json`.

---

### 3. Comandos de Verificación

```bash
npm install
npm test
npm run build
# Para validar la parte Python (en un entorno con servidor/dependencias):
python -m pytest server/test_app.py server/test_measure.py server/measure/test_measure_signals.py training/test_pipeline.py training/clinical-run/test_scientific_guards.py -v
```

### 4. Tu Primera Tarea al Recibir este Proyecto
Confirma que comprendes esta arquitectura resumiendo brevemente las secciones anteriores y pregúntame qué ajuste específico de UI, nueva escala clínica o integración quiero trabajar sobre `CardioEKG v23`.
```
