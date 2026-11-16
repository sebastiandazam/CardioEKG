# CardioEKG v17 — correcciones tras la revisión crítica

Motor `cardioekg-analysis-2.2.0`; esquema de análisis v1 compatible, con campos opcionales para una tira larga independiente y procedencia de ventanas. El número de versión de Sites y el commit se registran al publicar.

## Cambios implementados

- H1: máxima duración local sustentada en ventanas secuenciales; límites alineados con fiducial común en señales simultáneas. La dispersión ya no elimina automáticamente un BRD. Requiere evaluación médica independiente: una regresión sintética no acredita precisión de límites.
- H2: la etiqueta diagnóstica deja de intervenir en P/PR y límites. Una P no delimitada no demuestra ausencia de P ni FA. La referencia del caso queda atribuida; se advierte discrepancia con evidencia sinusal.
- H3: decodificación multietiqueta v2, estados independientes y conservación de ritmo junto con conducción. Ruta pública desactivada; ningún peso nuevo se ha aprobado.
- H4: `/data/` anclado; los JSON docentes de `src/data/` se incluyen en Git. `npm run verify:source` extrae HEAD e instala dependencias nuevas antes de probar y compilar.
- H5: punto J separado de J+60; umbrales de V2/V3 por edad/sexo, abstención del criterio cuando faltan esos datos. Se explicita la interferencia de conducción, estimulación y alto voltaje. En BRD con morfología compatible no se descartan automáticamente cambios fuera de V1–V4. La urgencia por síntomas se conserva. No se ha implementado ni validado Sgarbossa.
- H6: preparación por defecto con anotación humana; mezcla débil solo de ajuste como ablación explícita. Calibración de probabilidades y bandas separada por paciente. Edad 300 se conserva como límite inferior ≥90 y bandera de censura. No se han reentrenado candidatos ni sustituido los resultados históricos por métricas nuevas.
- H7/H13: frecuencia 50–59 descrita sin atribuir disfunción sinusal; QTc contextualizado ante síncope sin asumir mecanismo arrítmico. No se aplican umbrales poblacionales con QRS ancho, RR incierto o ventanas incompatibles.
- H8: captura pendiente conservada en memoria al navegar y abrir ejemplos; descarte explícito. Aviso al recargar mientras hay captura. No hay almacenamiento persistente de imágenes ni garantía ante cierre forzoso del navegador.
- H9: ajustes por derivación y grupo precordial conservados en lote; escala impresa registrada por señal. La ganancia es declarada por el usuario: la cuadrícula no verifica mV y el pulso no se identifica automáticamente.
- H10: intervalos sospechosos hacen abstenerse del cálculo de frecuencia y QTc, con motivo. No se rellenan pausas ni se inventan latidos. Pendiente mejorar sensibilidad con referencia externa.
- H11/H17: ganancia común del informe, altura suficiente para picos, inclusión explícita de nota libre en cada exportación. Contexto estructurado conservado.
- H12: tiempos docentes en milisegundos; selección explícita, estado inicial sin mecanismo asignado y activaciones auricular/ventricular independientes. Los límites reales del ECG permanecen separados de la enseñanza. No se representa anatomía individual ni se deducen lesiones de ST–T.
- H14: comparación semántica con tolerancias de redondeo, diferencias de estado/procedencia/hallazgos conservadas. Servicio educativo apagado por defecto; el token compartido no acredita autorización institucional. Una instalación de pacientes sigue requiriendo identidad individual, política y validación institucional.
- H15: II corta y II larga se almacenan separadas. Ventanas PR/QRS/QT conservan `captureLead` y se dibujan únicamente en su captura, sin suponer desplazamiento temporal. Ventanas antiguas ambiguas no se proyectan automáticamente.
- H16: documentación actualizada y verificación reproducible desde el commit, evitando usar el número de pruebas como evidencia clínica.

## OpenEvidence

El prompt incluye medidas, motivos de abstención, hallazgos y contexto clínico aportado, incluida la nota libre acotada a 1000 caracteres y el contexto inicial del registro cuando existe. La nota se identifica como contexto no verificado, no instrucciones. Se muestra antes de copiar; no se envía automáticamente ni se adjuntan señales o imágenes. Se mantiene copiar y abrir OpenEvidence; se elimina el hipervínculo a ChatGPT. La integración oficial insertada continúa pendiente de acceso autorizado.

## Verificación y límites

Ejecutar `npm test`, `npm run build`, `node server/build-runtime.mjs`, `node --test server/bridge.test.mjs`, las suites Python de servidor y entrenamiento, y `npm run verify:source` tras guardar el commit. Guardar resultados con el SHA exacto de la entrega.

Siguen pendientes la validación clínica externa por medida/categoría, completar los datos y calibración, fotos independientes y revisión interactiva de Safari móvil/WebGL. Los modelos siguen inactivos. No se utilizaron Wave-Maven ni otros recursos sujetos a permiso para entrenamiento nuevo.

Se conserva el proyecto Sites público existente y la versión anterior para reversión.
