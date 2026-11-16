# Entrega de análisis verificable, informe y anatomía

Estado actual: v22.1 (véase `cambios-v19.md` a `cambios-v22.md`, `base-de-conocimiento.md` y `medicion-python.md`); base v18: véase [correcciones y límites](release-v17.md) e [integraciones](integrations-v18.md). La entrega incorpora el esquema compartido `CaseAnalysis` v1 y motor `cardioekg-analysis-2.7.0` con base de conocimiento `cardioekg-kb-1.4.0`. Visor, PDF y servicio opcional consumen el mismo resultado. Los valores manuales y sus ventanas temporales conservan prioridad.

## Disponible

- Motor central Python automático para captura, visor, casos e informe; las correcciones manuales se calculan con el mismo motor. Sin comparador separado ni sustitución por estimaciones JavaScript en el flujo público. Véase `medicion-python.md`.

- Comparabilidad del eje por procedencia, calibración y señal. Un mismo ECG secuencial con complejos suficientemente estables permite un eje representativo, expresamente aproximado. Solo se pide confirmación junto al resultado si falta evidencia; no se reemplaza una señal no evaluable por una casilla.
- Límites P/QRS/T automáticos y correcciones manuales visibles. Medición sobre señal suavizada y referencia local de base, con controles de P/T/U, ambigüedad y ventanas cortas.
- Análisis de las 12 derivaciones, medidas con procedencia y motivos de abstención, hallazgos de ritmo/conducción/eje/repolarización/voltaje, impresión orientativa, alternativas, confianza cualitativa no calibrada y referencias. Ninguna regla se presenta como una probabilidad diagnóstica validada.
- Informe PDF local ES/EN con trazados, límites, calibración, análisis y referencias; sin identificadores del caso por defecto y sin controles de navegación.
- HRA/HuBMAP para miocardio, tabique interventricular, válvulas y papilares. Atlas vascular separado. Aislamiento, etiquetas, transparencia y cortes reales por GPU. La conducción es docente y explícitamente esquemática; los mecanismos patológicos seleccionables no cambian el diagnóstico del registro.
- Nuevo logotipo SVG y mayor presencia de degradados rojos, naranjas y borgoña; las superficies de lectura permanecen claras.
- Servicio autohospedable opcional con autenticación, consentimiento del cliente, origen permitido, límites y sin almacenamiento. No hay servidor contratado ni configurado en la edición pública.
- OpenEvidence figura como integración oficial pendiente. No se sustituye por otro proveedor ni se presenta un enlace o iframe vacío como integración.

## Entrenamiento realizado y límites

Se ejecutaron dos clasificadores clásicos con 508 registros/506 pacientes de ajuste y ocho etiquetas con ejemplos suficientes en ese subconjunto. La partición disponible conserva 3 registros de selección, 0 calibración, 11 de prueba y 0 externos. No se modificaron las particiones para compensar las descargas. Se entrenó además un delineador experimental con un registro LUDB y se comparó con NeuroKit2 sobre ese registro de ajuste. Esto no constituye validación independiente.

Resultados históricos anteriores a v17, no métricas del motor actual: el registro anotado permitió corregir dos fallos generales del estimador. La última comparación de QA fue PR 144 frente a 142 ms anotados, QT 488 frente a 494 y QRS 72 frente a 95. Persiste un error de QRS que supera el objetivo. LUDB/QTDB no proporcionan aquí una referencia médica del eje que permita declarar validación del eje.

Todos los candidatos y umbrales diagnósticos permanecen desactivados. No se publican sus pesos como aprobados ni se inventan probabilidades. Faltan completar los objetivos de datos, calibración, pruebas externas y fotos clínicas independientes. Detalles, licencias y reproducción en `docs/training-2026-11-12.md`; estado agregado público en `/models/research-summary.json`.

Paso bloqueado: descarga de registros y anotaciones públicas. Error persistente: `HTTP 503: upstream connect error or disconnect/reset before headers. reset reason: remote connection failure`. Los comandos de reanudación conservan las particiones congeladas.

## Recursos y correos

Los borradores de solicitudes en inglés en `docs/resource-requests/` son historial local; no se enviaron desde esta sesión. El propietario comunica autorización de los tres proveedores. Wave-Maven dispone de catálogo y seis ECG locales; BioDigital y OpenEvidence continúan pendientes de activación técnica. Véase `integrations-v18.md`.

## Comprobación

- Pruebas de aplicación: ejecutar `npm test`; el recuento queda en el resultado de cada ejecución. Incluyen mediciones, procedencia, análisis, PDF y anatomía.
- Pruebas HTTP/seguridad del servicio y de identidad con el motor local.
- Pruebas de separación científica, política de anotaciones/calibración, abstención y privacidad.
- Compilación TypeScript/Vite correcta; generación y lectura de un PDF real comprobadas.

No hubo herramientas de navegador/CUA disponibles. Sigue pendiente la revisión interactiva en Safari móvil/WebGL y la construcción del contenedor con sus descargas. Las pruebas de software no acreditan validación clínica.

## Despliegue

Se conserva el proyecto Sites `appgprj_6af487f5ebdc81918d61331b0ba4e9be` y su acceso público. Publicación con el archivo estático de la fuente enviada a Git. Para revertir esta entrega, volver a desplegar la versión guardada anterior del mismo proyecto, sin crear otro sitio.


Almacenamiento local (desde v19): la única persistencia en el navegador es la geometría de zonas confirmadas (`cardioekg.layoutMemory.v1` en `localStorage`): índices de banda y fracciones, sin píxeles, texto ni datos del paciente. Se borra con el botón «Olvidar las zonas aprendidas».

## Revisión Wave-Maven 2026-11-13

Se procesaron 547 páginas con contextos/explicaciones y 547 PDF originales. El experimento de imágenes ajustó pesos con 328 casos, seleccionó con 110 y evaluó con 109. Diez categorías amplias; rendimiento desigual, identidades de pacientes desconocidas y respuestas de referencia revisadas. Los pesos permanecen inactivos. Véanse `wave-maven-review.md`, `wave-maven-experiment.md` y `training/wave-maven-experiment/results.json`; no se garantiza el diagnóstico de cada caso.

## Preexcitación integrada

Delta por latido y derivación, polaridad y ventanas disponibles en visor, revisión antes de confirmar, informe y prompt de evidencia. Caso de desarrollo 218 produce patrón WPW como impresión principal. QRS local usa corroboración y conserva medidas discordantes; reintentos limitados y alineación solo con simultaneidad explícita. Detectores heurísticos no validados; casos adicionales 193 y 97 conservan limitaciones de PR y delta documentadas, respectivamente.

## Biblioteca clínica (KB 1.4.0)

94 entidades, 508 criterios y 130 referencias normalizadas. Búsqueda ES/EN por diagnóstico, título, autor, PMID o DOI en Fuentes, filtros por nivel de consulta y descarga JSON. La procedencia se conserva en el resultado compartido y en el PDF. Véase [ampliación bibliográfica](release-literature-v1.4.md). No se han entrenado nuevos pesos ni establecido exactitud clínica independiente.

## Revisión con IA integrada (opcional)

La sección diagnóstica prepara imagen del caso o reconstrucción etiquetada, prompt editable y contexto clínico. OpenRouter permite consultar dos modelos NVIDIA de visión con sufijo :free, usando una clave personal de sesión. Antes del envío se comprueba soporte de imagen y tarifa cero; se restringe el proveedor a NVIDIA y se prohíben sustituciones. Requiere consentimiento por consulta para ejemplos simulados o públicos autorizados sin datos personales, incluida la política de conservación y posible entrenamiento del proveedor. No se incrustan claves compartidas ni se habilitan modelos de pago.

Las variantes locales Qwen 0.8B/2B se descartaron tras errores básicos en pruebas sintéticas; Gemini se descartó para el flujo diagnóstico por sus condiciones. La salida de NVIDIA tampoco se considera clínicamente validada y no modifica CaseAnalysis. No se ha probado una generación real de OpenRouter: falta una clave personal. Véase [selección, funcionamiento y límites](diagnostic-ai.md).

El servicio compartido incorpora un Worker con secreto de Sites; la interfaz detecta su disponibilidad y permite revisión sin claves de los visitantes. Se probó una generación real de imagen sintética más prompt con el mismo cliente. La clave no forma parte de los artefactos y la cuota gratuita sigue limitada y compartida.

### Revisión con IA simplificada

ECG, consulta con contexto y modelo gratuitos preparados por defecto; opciones avanzadas plegadas. Una sola acción explícita autoriza cada envío externo. La revisión final del ECG se confirma con el botón de apertura del visor, sin casilla repetida. Aceptación conjunta de zonas predeterminada; los fallos de señal/escala conservan su revisión.
