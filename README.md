# CardioEKG

Guided 12-lead ECG review workflow, with an installation mode for supervised clinical research. The educational edition includes four simulations and two clinical recordings from PhysioNet. Conduction rendering follows the timeline of the simulated examples. The frontal axis is displayed when available. The 3D geometry represents reference human anatomy. Clinical recordings are shown alongside a reference diagram and retain their attribution.

The interface is available in Spanish and English via **ES / EN**. The **Diagnóstico presuntivo / Presumptive Diagnosis** panel displays the impression associated with the pattern, orientative initial adult management, red flags, and clinical sources. In the research workflow, it is based on the finding reviewed by the investigator. Automated classification requires validated and installed weights.

## Opening the application

Open **Cardioscopio.html** in your browser. The standalone file includes the viewer and the capture workflow. Local image features require a browser with Web Workers and Web Crypto access. The OpenEvidence option opens the external site only when its link is clicked. The query is generated locally from the finding and can be read before copying it.

To run or deploy the web app from source, install Node.js 22.12 or later.

```sh
npm install
npm test
npm run dev
npm run build
npm run build:offline

```

Serve `dist/` with a static file server. `build:offline` regenerates the standalone edition. Original code is licensed under MIT. The landing page uses a custom WebGL shader inspired by ShaderGradient, with a static fallback background when WebGL is unavailable. Dependencies, trademarks, and signals retain their respective licenses and terms. See [sources and licenses](https://www.google.com/search?q=docs/fuentes-y-licencias.md) and [third-party notices](THIRD_PARTY_NOTICES.md).

## Supervised research

The public build allows testing on-device capture with simulated traces or authorized public examples. The form requires confirming this before accessing capture. The private build requires an institutional authorization decision. Before deploying it with patients, complete the requirements in [research in Colombia](https://www.google.com/search?q=docs/investigacion-colombia.md).

```sh
VITE_APPROVED_RESEARCH=1 npm run build:research

```

The institution must serve **dist-research/** over a private HTTPS origin with server-side institutional authentication. The build flag enables the interface, while the server controls who can access it. Do not deploy this directory on the same origin as third-party applications. Exclude analytics and remote services from this origin. Enforce a security policy that restricts connections, workers, and resources to the local origin, authorizes `blob:` only for previews, and allows `wasm-unsafe-eval` only if ONNX is installed.

The workflow reviews 12 calibrated crops of the same ECG, estimates heart rate when the strip permits, and computes PR, QRS, QT, and axis from the points marked by the investigator. Upon confirmation, the viewer receives only the signals and derived results in memory. The study must establish its own procedure for documenting readings and authorizations.

Without approved weights, classification remains indeterminate until the investigator selects a finding. To install a validated model, serve the ONNX Runtime Web module, its WASM files, and the model from `/models/` on the same origin. Inject the `VITE_APPROVED_MODEL` configuration at build time as a JSON object with `runtimeModule`, `wasmDirectory`, `modelUrl`, `sha256`, and `decisionBands`. Use the SHA-256 of the exact file and the validated thresholds. The classifier requires a 4×3 format, a 10 s lead II strip, and confirmation that the images belong to the same ECG.

## Training

The [reproducible pipeline](https://www.google.com/search?q=training/README.md) prepares real ECGs, compares models, exports ONNX, and computes evaluation metrics. Candidate models and their metrics require running this pipeline with authorized cohorts and photos. In this release, the pipeline was verified with local tests and by loading the clinical examples into the viewer. Network access in the environment did not allow downloading the full cohorts or running training.

### Lead map and local OCR

When loading a full sheet, a map with colored boxes and a side panel appear first. Each zone can be selected, moved, redrawn, reassigned, and confirmed. All twelve zones must be confirmed before reconstruction; this confirmation does not replace reviewing the calibration or the extracted signal. OCR labels and position-based proposals are distinguished in the panel.

Label reading uses Tesseract.js and a pretrained English LSTM model served from the same site (`public/ocr/`). It does not send images to an external OCR service. A canceled, failed, or >60-second read leaves the position-based proposals available. The model and licenses accompany the distribution; `tessdata_fast` version 4.1.0, compressed archive SHA-256 `4eecbf64c3bad3835d16773a8d6372ccaaa8b1f253df52a9fa7d3faa4c09afc2`.

256 real ECGs and their annotated sheets were prepared for the [reproducible OCR pilot](https://www.google.com/search?q=training/sheet-ocr-results/README.md). This work selects preprocessing for an existing OCR engine and does not train new weights. Native evaluation has errors and does not validate browser execution or independent clinical photos. OCR in the single-file HTML edition requires the `/ocr/` assets; if missing, position-based selection continues to work.

New training of a compact label classifier was also run using 9,216 augmented crops from 192 ECGs (separate patients for selection and testing). Its high accuracy on known crops does not generalize to paper and background: the [candidate report](https://www.google.com/search?q=training/lead-label-results/README.md) documents false acceptances of unlabeled regions. It is kept for research only and is not enabled in public prescreening.

### PDF, formats, and red flags

The file picker supports JPG, PNG, WebP, and PDF (up to 20 MB). A PDF is opened locally with PDF.js: a page is selected from up to 200 pages, previewed, and rasterized at a maximum of 8 million pixels before OCR and lead cropping. No files are uploaded to any service. Password-protected PDFs must be exported without protection or as an image. The resolution cap controls memory usage and does not demonstrate digitization accuracy. Local rendering tests verified a simulated two-page document by selecting and drawing the second page with labels and calibration.

Format selection includes simulated 4×3 and 2×6 examples and a single lead II strip to show what does not equal 12 leads. Matching a format does not guarantee reliable reconstruction.

Cases with red flags or uncertainty may proceed after expressly accepting a scope and urgent-care priority notice. The reminder remains visible during capture and in the case viewer. The adult-only restriction and the separation between public practice and institutional deployment for patient data remain in effect.

### CardioEKG identity

CardioEKG is the new name of the application. The K in the logo incorporates a QRS-inspired stroke, generated for the project and saved in `public/cardioekg-logo.png`. The branding is used in the header, footer, and favicon. Cream backgrounds combine soft red, coral, and orange gradients; trace and image areas preserve reading contrast. The Sites ID and the historical `cardioscopio-ecg` URL are preserved to avoid breaking links. Historical files that retain that name remain documented under their actual filenames.

### Batch reconstruction and grid calibration

Confirming the map (individually or together) starts local reconstruction of all selected leads. Workers run sequentially to bound memory usage on mobile devices. Each result is overlaid on its crop; traces without issues proceed to the review set, and only failed ones open individual correction. Re-running reuses successful results when the image, crop, speed, and gain match. Final clinical confirmation of the full set remains required.

Initial boxes are constrained to non-overlapping rows. When moved, they stop against neighboring boxes; a new crop cannot invade another zone. The long rhythm strip is only included automatically if an independent row is detected; it can also be added or excluded explicitly.

A confusion between 5 mm major lines and 1 mm minor lines was reproduced and fixed: the previous digitizer calculated 1.99978 s for a simulated 10 s trace. It now preserves faint gray lines and estimates the fundamental period by position, with fractional alignment tests and short/long crop checks. A periodic grid without sufficient unit evidence is marked `periodic-only`: its scale is provisional and requires manual calibration rather than automatic acceptance. Rejection of true inter-axis distortion is maintained. These tests do not validate independent clinical photos or guarantee every prescreening result.

### Paper and dark borders in prescreening

Prescreening first separates light paper from black or transparent margins. It normalizes illumination and searches for rows only within that paper area, without counting outer black margins as ink. Crops and OCR labels are then transformed into percentages of the original file. The initial view centers on the paper, with an option to view the full image, using a preview generated from the same bitmap that was analyzed. The pointer and boxes use the inverse transform of the same frame, independent of zoom.

If no row evidence is found, no automatic boxes appear: the failure is reported and a manual template can be explicitly chosen. Blank paper or a grid without traces does not constitute a detection. The regression that skipped a first row located above 14% was fixed, while keeping a small margin for edges.

The dark-border case was verified on a synthetic image and locally on the region of the provided screenshot: all twelve boxes fall within the paper and the four rows span their traces. The [results and limits](https://www.google.com/search?q=training/paper-region-results/README.md) document coordinates, not clinical validation or interactive verification. The screenshot and its crops remain outside Git and the published site; they were not used for training.

### Common scale and provisional views

Calibration no longer picks the first pixel periodicity: it now verifies a major grid and evidence of intermediate lines, so 2 px scanner dithering is not confused with 1 mm. Global paper analysis can provide an automatic reference verified across multiple regions. It is used as a fallback only for local scale errors; it does not override a valid local calibration or cancel locally measured anisotropy. Neither fixed duration nor fixed physical sheet width is assumed.

If scaling fails, the provisional reconstruction is kept in pixels, without seconds or mV, and is not added to the viewer as a calibrated signal. Scale errors are grouped as a common paper issue rather than thirteen mis-sized boxes. The "Calibrate paper once" ("Calibrar el papel una vez") tool lets you fit a reference to a real 5 × 5 mm square and apply its dimensions to all crops from the same file. That reference is explicitly confirmed and does not correct non-uniform perspective.

A public image was verified using the same cropping, resizing, and processing code used by the worker, with Node Canvas adapters: all 13 calibrations pass, leaving four signal-quality warnings. The [results](https://www.google.com/search?q=training/calibration-e2e-results/README.md) distinguish this check from an interactive Safari test and from exact reproduction of the user's original file, which was not present in the error screenshots.

### Flexible overlap and joint acceptance

Boxes can be expanded or moved over part of another box to capture waves that extend beyond the neighboring zone. This geometric intersection does not block confirmation, reconstruction, or recalibration. Only extensive overlap triggers an advisory warning; it is not a blocking error. Actual image bounds, scale verification, and signal-quality checks remain enforced.

The map includes "Accept all zones with a single button" ("Aceptar todas las zonas con un solo botón"), enabled by default. "Accept all and reconstruct" ("Aceptar todos y reconstruir") confirms the visible zones and starts batch processing without requiring an OK for each lead or an extra checkbox. The setting can be disabled to return to individual confirmation. Final case review remains separate from zone acceptance. This section supersedes the strict non-overlap restriction described in earlier versions.
