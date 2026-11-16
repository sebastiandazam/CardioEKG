# Integraciones de CardioEKG v18

## Estado de acceso

El propietario comunica autorización de BioDigital, OpenEvidence y ECG Wave-Maven. Se registra esa comunicación sin atribuirles textos o condiciones que no constan en documentación recibida. Los borradores de `resource-requests/` permanecen como historial; no se enviaron mensajes desde esta sesión.

## Wave-Maven disponible

Se importó el catálogo oficial: 547 referencias con contexto y diagnóstico docente. Se incluyen los PDF originales y una imagen de alta resolución de los casos 1, 2, 3, 4, 5 y 15. El buscador prioriza esos seis casos locales. Los demás ofrecen acceso a la referencia oficial.

Al seleccionar un ECG local, se conserva el cuestionario inicial y se abre la captura de imagen completa con ese archivo. El usuario verifica regiones, calibración y reconstrucción. El contexto original puede incorporarse al formulario opcional, pero el diagnóstico de referencia se conserva separado y no se usa para medir ni asignar la impresión automática. Aparece atribuido en el visor y el informe.

Los recursos Wave-Maven conservan su copyright y atribución. No pasan a tener la licencia MIT del código. El manifiesto de importación conserva URLs y hashes. Importar seis imágenes no es entrenar un clasificador ni validar medidas; no se activan pesos nuevos.

## OpenEvidence disponible sin API

Se mantiene mostrar/copiar el prompt y abrir OpenEvidence. La consulta incluye el contexto clínico aportado, con revisión previa; no se adjuntan imágenes ni señales crudas.

El usuario puede pegar una respuesta real y sus referencias en el caso. El texto queda identificado como pegado manualmente, de origen y exactitud no verificados automáticamente. Permanece en memoria de la sesión al navegar y puede eliminarse. No modifica el motor de ECG. El PDF lo incluye solamente cuando el usuario marca la opción de esa descarga; las referencias enlazadas deben usar HTTPS.

La conexión incrustada sigue sin activación: no se recibió URL ni método de acceso. El conector admite un endpoint oficial en `VITE_OPENEVIDENCE_EMBED_URL`, junto con `VITE_OPENEVIDENCE_EMBED_AUTHORIZED=1` una vez comprobada su configuración técnica. No hay iframe vacío ni API simulada.

## BioDigital preparado, sin activación

Se preparó un conector separado del atlas local. Se activa con `VITE_BIODIGITAL_EMBED_URL`, que debe contener el enlace oficial a un modelo de la cuenta del proyecto y su identificador público de dominio (`dk` o `uaid`). No acepta dominios ajenos, credenciales de URL, claves secretas ni modelos sin identificador. No se reutiliza el identificador de MSD ni una cuenta de demostración ajena.

El proveedor debe registrar `cardioscopio-ecg.dorydaza.chatgpt.site`. La clave pública del visor está destinada al cliente; el developer secret nunca debe entrar en variables `VITE_` ni en este repositorio.

Cuando esté configurado, el usuario carga explícitamente el iframe. Se utiliza la Viewer API oficial 1.2.1, cuyo archivo público respondió HTTP 200 en la comprobación, con controles de reproducción y pausa tras `ready`. Se conserva el referrer de origen para la comprobación de dominio que exige BioDigital. No se envían ECG ni contexto. La animación del proveedor no se presenta como conducción sincronizada científicamente con el ECG: falta definir y verificar ese mapeo por modelo. Si falla la conexión, el atlas local permanece disponible.

Referencias técnicas consultadas:
- https://developer.biodigital.com/docs/widget%2Fgetting-started%2Ffirst-widget
- https://developer.biodigital.com/pages/documentation/1/getting-started/intro.html
- https://devsupport.biodigital.com/hc/en-us/articles/234450188-How-to-register-an-app
- https://human-api.biodigital.com/docs/unstyled/symbols/HumanAPI.Human.html

## Comprobaciones y límites

Pruebas de integridad de PDFs/PNG y hashes, catálogo sin duplicados, separación de contexto y respuesta, carga del archivo al flujo de captura, exclusión de contenido externo por defecto en PDF, comparación del análisis antes/después de incorporar referencias y rechazo de URLs de proveedores inválidas. Se compila y verifica desde una extracción limpia antes de publicar.

La revisión interactiva en Safari/WebGL y la conexión real a cuentas BioDigital/OpenEvidence siguen pendientes; no hay credenciales de activación. Los candidatos diagnósticos siguen inactivos y no hay validación clínica nueva.
