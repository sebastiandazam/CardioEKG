# CardioEKG v23 — Registro de Cambios Técnicos y Resultados Calibrados

Este documento resume las mejoras algorítmicas, clínicas, de interfaz y de validación empírica integradas sobre la base **CardioEKG v22.1**.

---

## 1. Reconocimiento Óptico (OCR) y Calibración Impresa
- **`src/research/labelOcr.ts`**: Sustitución del umbral global min–max (`< 170`) por un estiramiento de contraste robusto entre percentiles **2.º y 98.º** combinado con **umbralización adaptativa local por bloques mediante imagen integral 2D** e invarianza al color de cuadrícula (`isGridColour`), evitando que sombras o viñeteado degraden las etiquetas en fotografías clínicas.
- **`src/research/labels.ts`**:
  - Incorporado `normalizeLeadToken` con tabla `LEAD_CONFUSIONS` y penalizaciones controladas para corregir glifos frecuentes de Tesseract (`ll`→`II`, `lll`→`III`, `Vl`/`Vi`→`V1`, `Vs`→`V5`, `aVl`→`aVL`, etc.).
  - Añadida supresión de no-máximos espaciales (NMS al 3 %) y asignación bipartita óptima de costo mínimo en `applyLeadLabels`.
  - Mejorado `readPrintedCalibration` preservando límites de token para tolerar degradaciones típicas (`25mm/5`, `10mm/rnV`).
- **Pruebas:** `src/research/labels.test.mjs` (`63` pruebas de investigación aprobadas).

---

## 2. Diccionario Médico Integrado y Fuentes Clínicas
- **`src/evidence.ts`**: Incorporadas 8 fuentes clínicas primarias verificadas (`universal-mi`, `esc-acs`, `esc-af-2024`, `esc-va`, `esc-svt`, `aha-tdp`, `smith-sgarbossa`, `tisdale-2013`) y actualizadas las 15 definiciones base en español e inglés con criterios cuantitativos.
- **`src/terms/lexicon.ts`**: Eliminados alias genéricos ruidosos que disparaban popovers fuera de contexto (`derivaciones`, `aurículas`, `ventrículos`, `conducción eléctrica`, `eje eléctrico`) y añadidos **19 términos especializados** (elevación/depresión ST, Sgarbossa modificado, Wellens, de Winter, Brugada, preexcitación, QTc/Bogossian, bloqueos AV 1.º/Wenckebach/Mobitz II/3.º, HBAI, HVI, taquicardia ventricular, flutter auricular, alternancia eléctrica, $\text{CHA}_2\text{DS}_2\text{-VA}$ y Tisdale).
- **`src/terms/TechnicalText.tsx`**: Activada deduplicación por bloque (`{ deduplicate: true }`) para subrayar solo la primera aparición relevante de cada término y renderizar múltiples citas clínicas enlazadas.
- **Pruebas:** `src/terms/terms.test.mjs`.

---

## 3. Motor Híbrido de Medición y Delineación (`server/measure/`)
- **`server/measure/ecg_analisis.py`**:
  - `fin_T`: Estimación de `T_onset` por máxima curvatura positiva post-J y fusión tangente + radio mínimo de curvatura ($0{,}55\cdot t_{\text{tan}} + 0{,}45\cdot t_{\text{curv}}$) para corregir la subestimación de QT en ondas T de pendiente suave manteniendo el margen de tolerancia $[-40, 0]\text{ ms}$ en trazados sintéticos.
  - `detectar_actividad_auricular_diastolica`: Análisis espectral de Welch en ventanas diastólicas T–Q ($3{,}8\text{–}5{,}8\text{ Hz}$) para detectar ondas F periódicas de flutter y suprimir falsas detecciones de onda P (inspirado en el principio multitarea de Joung et al., `arXiv:2304.06237`).
  - `analizar_dinamica_latido_a_latido`: Detección latido a latido de prolongación progresiva de PR pre-pausa (`wenckebach_suspected`), alternancia eléctrica 1:1 de amplitud QRS (`qrs_alternans`), y conteo de CVP/CAP (`pvc_count`, `pac_count`).
- **`server/measure/run_measure.py`**: Emisión de marcadores `'t'` con `tOnsetOffsetMs`, supresión automática de ondas P cuando `flutter_suspected` es verdadero, cálculo de `qtcBogossianMs` cuando $\text{QRS} \ge 120\text{ ms}$, y propagación tipada hacia `src/ecg/estimate.ts` y `src/ecg/pythonAnalysis.ts`.

---

## 4. Cribado Clínico Articulado, Escalas de Riesgo y UI Técnica (`src/ecg/`)
- **`src/ecg/clinicalScales.ts`** (`evaluateClinicalScreening`): Conectado a `CaseAnalysis.screening` en `src/ecg/analyze.ts` (preservando aislamiento total respecto a `freeText` y etiquetas de origen; manteniendo `calibrated: false` y `probability: undefined` en los badges). Genera:
  1. Triaje estructurado (`emergent | urgent | routine | normal`), signos de alarma (`redFlags`) y acciones inmediatas.
  2. Comparación articulada parámetro a parámetro (`articulatedComparison`) contra umbrales AHA/ACCF/HRS, ESC 2022–2024 y 4.ª Definición Universal del IAM (con ajuste edad/sexo en V2–V3 y QTc de Bogossian si QRS ancho).
  3. **6 escalas clínicas aplicables al caso:** Tisdale QTc (2013), $\text{CHA}_2\text{DS}_2\text{-VA}$ (ESC 2024, neutral al sexo), Regla de Smith-Sgarbossa Modificada (2012), Algoritmo Integrado WCT (Brugada / Vereckei / Pava), Matriz Territorial OMI/STEMI + Equivalentes (de Winter, Wellens, tronco aVR, posterior), y Estratificación de Bloqueo AV / Fascicular / Síncope.
- **`src/main.tsx` (`Management`) y `src/ecg/AnalysisPanel.tsx` (+ `src/brand.css`)**: Integración directa del diagnóstico presuntivo primario y de `analysis.screening` en manejo, tabla comparativa con desplazamiento horizontal responsivo en móvil, y tarjetas de escalas indicadas vs. condicionales. Resolución del conflicto de compilación TypeScript en `WaveMaven.tsx`.
- **`src/ecg/TrainingStatus.tsx` y `training/clinical-run/export_summary.py`**: Corrección del esquema `research-summary.json` para visualizar las particiones reales de PTB-XL / Chapman / LUDB / QTDB y sus métricas calibradas.

---

## 5. Arquitectura Neuronal y Resultados Empíricos sobre ECG Confirmados
- **Arquitectura añadida (`training/delineation_unet.py`)**: `ECGResSEUNet1D` (U-Net 1D residual con atención *Squeeze-and-Excitation*, kernel $K=9$, cuello de botella dilatado y cabezal multitarea de ritmo), pérdida compuesta `JimenezPerezCompositeLoss` (BCE + Dice + `BoundaryLoss` Prewitt-11 + `F1InstanceLoss` Prewitt-3 según Jiménez-Pérez et al., *Sci. Rep.* 2021 / `arXiv:2111.12996`) y post-procesador secuencial `enforce_physiological_sequence`.
- **Cohortes confirmadas descargadas (14.690 / 14.690 archivos, 0 errores):**
  - **Diagnóstico (`training/clinical-run/diagnosis-report.json`):** 7.000 ECG descargados (`PTB-XL 1.0.3` N=6.000 + `Chapman–Shaoxing 1.0.0` N=1.000 externo). Política estricta `human-only`: *fit* = 2.683 registros (2.610 pacientes), selección Fold 8 = 327, calibración Platt Fold 9 = 500 (250 probabilidad / 250 umbral, 0 solapamiento de pacientes), test Fold 10 = 1.000 (936 pacientes), externo Chapman = 1.000.
    - Selección Fold 8 (AUROC macro): `logistic = 0.9205`, `extra_trees = 0.9271`, `mlp_neural = 0.9392`, `resnet1d (PyTorch MPS) = 0.9513`, **`blend_top2 = 0.9608`**.
    - Test interno (PTB-XL Fold 10, N=1.000): **AUROC macro `0.9437`**, AUPRC macro `0.7329`, Brier medio `0.0477`, **ECE medio `0.0172` (1,72 %)**.
    - Validación externa (Chapman, N=1.000): **AUROC macro `0.9201`**, AUPRC macro `0.4517`, Brier medio `0.0782`, ECE medio `0.0984` (*prior shift* documentado: 32,8 % bradicardia sinusal en Chapman vs. 2,9 % en PTB-XL; `activation_gate_passed: false` hasta recalibración de prevalencia local y validación sobre fotografías clínicas).
  - **Delineación (`training/clinical-run/delineation-report.json`):** 200 registros LUDB (`140 fit` [5.036 latidos aumentados], `20 selection`, `40 test`) + 30 QTDB externos (293 ventanas):
    - `trained_1d_resse_unet` en LUDB test (MedAE): `p_onset = 4.0 ms`, `p_offset = 4.0 ms`, `qrs_onset = 4.0 ms`, `qrs_offset = 4.0 ms`, `t_onset = 10.0 ms`, `t_offset = 6.0 ms`.
    - `trained_extra_trees` en LUDB test: `p_onset = 4.9 ms`, `p_offset = 5.1 ms`, `qrs_onset = 3.2 ms`, `qrs_offset = 5.2 ms`, `t_onset = 14.7 ms`, `t_offset = 8.6 ms`; en QTDB externo: `p_onset = 11.6 ms`, `p_offset = 7.8 ms`, `qrs_onset = 8.7 ms`, `qrs_offset = 8.8 ms`, `t_onset = 31.1 ms`, `t_offset = 18.7 ms`.
    - `ecg_analisis_v3_hybrid` en QTDB externo (1-lead): `qrs_onset = 9.0 ms`, `qrs_offset = 9.0 ms`, `t_offset = 22.6 ms` (abstención intencional de P en 1-lead por regla de consenso de 3 derivaciones en `run_measure.py`).
