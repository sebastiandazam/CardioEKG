# Revisión con IA dentro de CardioEKG

Fecha: 2026-11-13. Producto v22.1; análisis numérico y KB sin cambios.

## Decisión de integración

Se incorpora un cliente directo de OpenRouter para NVIDIA Nemotron 3.5 Super VL y Nemotron 3 Nano Omni, exclusivamente sus variantes :free. El catálogo público consultado identifica ambas como entrada de texto/imagen y salida de texto, con precios prompt/completion cero y proveedor nvidia. No se requiere acuerdo especial con el proveedor; sí una cuenta y una clave personal, sujeta a sus términos y a la disponibilidad regional. El sitio no crea cuentas, contrata servicios, compra créditos ni incorpora una clave compartida.

Fuentes oficiales:
- https://openrouter.ai/collections/free-models
- https://openrouter.ai/docs/guides/routing/model-variants/free
- https://openrouter.ai/nvidia/nemotron-3.5-super-vl:free
- https://openrouter.ai/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free
- https://openrouter.ai/docs/guides/routing/provider-selection
- https://openrouter.ai/docs/guides/privacy/logging
- https://openrouter.ai/terms

Las variantes :free no requieren compra de créditos según la documentación específica. Los cupos y disponibilidad varían. Cada petición comprueba el catálogo en vivo; si no puede verificar modalidad y tarifa cero, no envía el ECG. Solo admite dos IDs fijos, solo nvidia, allow_fallbacks:false y max_price prompt/completion cero; no incluye modelos alternativos, herramientas, plugins ni búsqueda con coste. No hay reintentos automáticos. Un 402/429 no desencadena compra ni cambio de modelo. Se bloquea una respuesta con coste declarado distinto de cero para investigación manual.

## Opciones descartadas

Qwen3.5-0.8B y 2B, con pesos públicos ONNX y Transformers.js 4.3.2, completaron inferencia de un ECG sintético más prompt en CPU. Se observaron errores básicos de intervalos y eje: la variante 2B llamó físicamente imposible a un PR de 162 ms. No se publican como una alternativa fiable. Probar la transmisión y generar texto no prueba exactitud. Estas pruebas no son entrenamiento ni validación clínica.

Gemini tiene una API con imagen y modalidades gratuitas, pero sus términos actuales dicen: “You may not use the Services in clinical practice, to provide medical advice”. Se descarta para este flujo diagnóstico; además, su cuota gratuita puede usar entradas para mejora de modelos. Fuente: https://aistudio.google.com/docs/terms .

Puter ofrece modelos sin claves del desarrollador, pero factura el consumo a la cuenta del visitante y no constituye una garantía de coste cero: https://developer.puter.com/pricing/ . No se incluye.

No se ha identificado ni acreditado una IA anónima, gratuita y clínicamente validada para todos los ECG. La opción incorporada es una revisión educativa experimental de un servicio más capaz; su exactitud clínica no está establecida.

## Entradas

Se prepara la imagen de captura del caso cuando existe; si no, una reconstrucción de las señales disponibles. La reconstrucción muestra derivaciones ausentes, ventanas independientes desde 0 s y tira larga cuando existe, sin inventar simultaneidad. Conserva extremos y mantiene picos por debajo de las etiquetas. No es la fotografía original.

Puede elegirse otra imagen o página de PDF mediante el selector local existente. La imagen se rasteriza a JPEG hasta 1920 × 1440, eliminando metadatos EXIF; la reducción puede ocultar detalles. Se envía la vista previa revisada, no el PDF ni el nombre del archivo. La imagen alternativa requiere comprobar que corresponda al caso.

El prompt se genera con medidas y estado, contexto estructurado, nota libre, hallazgos, lectura sistemática y hasta cuatro hipótesis con criterios a favor, en contra y pendientes. Prioriza las referencias del diagnóstico principal/concurrentes, hasta ocho fuentes aportadas. El texto puede revisarse antes de enviar; se distingue procedencia de imagen y reconstrucción. El proveedor no dispone de herramientas de navegación en esta petición y no puede acreditar que haya consultado esas fuentes.

## Privacidad y activación

La clave se pega en un campo de contraseña y vive solo en memoria del componente. No se guarda en archivos del proyecto, casos, PDF, URL, cookies o almacenamiento persistente. Puede eliminarse; al abandonar la sección se pierde. La cabecera Authorization se envía únicamente al endpoint fijo HTTPS de OpenRouter, con redirecciones desactivadas. El catálogo público se consulta sin clave ni datos del caso.

Se exige consentimiento por consulta, mayoría de edad y declaración de ECG simulado o ejemplo público autorizado sin datos personales. NVIDIA puede conservar y usar las entradas para entrenamiento según la política publicada; el usuario debe poder autorizar también ese uso. provider.data_collection:allow refleja este consentimiento, no una promesa de confidencialidad. La app no cambia las preferencias de privacidad de la cuenta. Si estas impiden el acceso gratuito, informa del error. No se envían registros de pacientes ni se presenta el servicio gratuito como infraestructura clínica autorizada.

La imagen, prompt, contexto y nota libre se transmiten a OpenRouter y NVIDIA solo al pulsar «Enviar y revisar con IA». Cancelar detiene la espera pero no retira datos ya enviados. Hay un límite de espera de 120 segundos. No se conserva la respuesta en almacenamiento persistente ni se ejecuta HTML o instrucciones recibidas: se muestra como texto, con modelo, proveedor, fecha y aviso de revisión. No reemplaza CaseAnalysis ni se incorpora automáticamente al PDF.

## Verificación

Pruebas de software: consentimiento antes de cualquier conexión, bloqueo por tarifa/modalidad no verificadas, ausencia de claves en URL y metadatos, envío simultáneo de imagen/prompt exactos, límites de tamaño, proveedor fijo, tarifa máxima cero, ausencia de reintentos o fallbacks pagados, errores de cuota/coste y trazabilidad de contexto/criterios. El catálogo y endpoints públicos se verifican sin credenciales.

La primera publicación se comprobó sin credenciales; posteriormente se realizó la prueba sintética descrita al final. Tampoco se ha comprobado interacción en Safari móvil. Ninguna de estas comprobaciones acredita sensibilidad, especificidad o calibración clínica. La revisión profesional y una evaluación independiente siguen pendientes.

Comprobaciones de esta entrega: 227 pruebas JavaScript aprobadas y catálogo público confirmado para los dos modelos. El motor Python completó siete casos reales de ejecución WebAssembly y sus PDF durante la integración. La compilación final comprueba TypeScript y los archivos estáticos.

## Activación del servicio compartido

La publicación incorpora un Worker con ASSETS para conservar la aplicación React y una ruta del mismo origen /api/diagnostic-ai/review. La clave del promotor se configura exclusivamente como secreto OPENROUTER_API_KEY en Sites, no en el código, archivos, manifest ni bundle. /api/diagnostic-ai/status solo devuelve disponibilidad y cupo compartido; nunca la clave. La configuración se aplica al desplegar la versión.

Con el servicio activo, los visitantes no necesitan cuenta ni clave de OpenRouter. Pueden optar explícitamente por una clave personal. El consentimiento sigue siendo obligatorio antes de cada envío, mediante el botón de envío con aviso visible. La imagen y el prompt pasan por el servidor de CardioEKG hacia OpenRouter/NVIDIA; la aplicación no los guarda ni los registra en logs. La cuota gratuita del promotor se comparte entre visitantes; no se compra capacidad adicional.

El servidor limita tamaño de cuerpo, exige JSON y consentimiento, comprueba origen, aplica contadores temporales por IP hasheada en memoria del aislamiento y limita concurrencia. Estas medidas son de mejor esfuerzo, no un contador global persistente ni una garantía contra abuso. Las restricciones de modelos y tarifa cero se aplican otra vez en el servidor. El usuario no puede reemplazar la clave del servidor desde el cuerpo de la petición.

Se completó una prueba real con el cliente de producción: imagen sintética de 12 derivaciones, medidas del motor Python, prompt con contexto y criterios bibliográficos. NVIDIA devolvió una revisión en español sin truncar. Reconoció frecuencia 75 lpm, PR 150 ms, QRS 96 ms y eje +46,37°. Es una comprobación funcional de un solo caso sintético y no acredita exactitud clínica.

## Interacción simplificada

La imagen del caso (o reconstrucción), el prompt con contexto y el modelo gratuito se preparan automáticamente. Un único botón «Enviar y revisar con IA», acompañado del aviso de mayoría de edad, ámbito autorizado y transferencia/uso del proveedor, autoriza la consulta concreta. No hay casilla adicional ni envío al abrir el caso. Las opciones de imagen, PDF, prompt, modelo y clave personal quedan en un desplegable cerrado. La comprobación de disponibilidad evita mostrar campos de clave mientras se conecta. La respuesta conserva trazabilidad en detalle opcional.

El mapa mantiene aceptación conjunta por defecto; la confirmación individual es opcional. La revisión final consolida casilla y continuación en «Confirmar revisión y abrir visor». No se inventan confirmaciones sobre calibración, calidad, comparabilidad de complejos ni datos personales; los fallos siguen requiriendo corrección.
