# Plan de corrección: preexcitación y precisión diagnóstica

Fecha: 2026-11-13. Estado: corrección de integración implementada en motor 2.6.0 / Python signals v3.2 / KB 1.3.0. La validación clínica externa, las anotaciones médicas independientes y la comprobación interactiva móvil siguen pendientes; no se declara completado ese trabajo con pruebas de software.

## Evidencia del incidente

La captura corresponde al caso 218 de ECG Wave-Maven: https://ecg.bidmc.harvard.edu/maven/dispcase.asp?caseid=218&ans=1 . La explicación de referencia describe patrón de preexcitación ventricular WPW, con PR corto, QRS ancho y onda delta; delta negativa en V1 y III y positiva en I, aVL y precordiales laterales. El patrón ECG no establece por sí solo síndrome WPW sintomático ni localización invasiva de la vía.

El PDF «Sin título» adjunto fue generado desde Terminal y contiene registros de una aplicación de escritorio; no es el informe de CardioEKG. Por ello falta la salida concreta del usuario y no puede atribuirse todavía su diferencia exacta a un recorte, calibración o configuración determinados.

Se reprodujeron dos rutas con el PDF original del caso, en la revisión publicada 2b689c1. Distribución declarada 3×4 más tira, velocidad 25 mm/s y ganancia 10 mm/mV; estas condiciones deben contrastarse con el original antes de una referencia manual. Son estimaciones del propio sistema, NO anotaciones médicas:

| Ruta | FC | PR | QRS | Delta |
| --- | ---: | ---: | ---: | --- |
| Lectura vectorial original con `measure_file` | 78,85 lpm | 66 ms | 160 ms | candidatos en 5 derivaciones; duración agregada 70 ms |
| `measure_signals` sobre las señales exportadas | 83,22 lpm en segmentos / 78,86 en tira larga | 88,5 ms | 227 ms | `deltaSlurMs=null` en las 12 derivaciones |

El visor toma la frecuencia de la tira larga cuando existe; 83,22 lpm es el valor de segmentos del registro interno, no el valor final que debería mostrarse en ese caso. QRS locales: II 109 ms, V1 193 ms, V2 227 ms y otras derivaciones entre 118 y 140 ms; la tira de II da 107 ms. Estas diferencias exigen revisar los límites, no elegir arbitrariamente la cifra que coincida con la respuesta.

### Defectos confirmados en el código

1. `run_measure.py::measure_traces` fija `morphology.deltaSlurMs=None`. La regla WPW requiere ese dato, por lo que pierde una evidencia indispensable.
2. La ruta vectorial conserva `extra.preexcitation`; la ruta central de señales no conserva esos candidatos/polaridades de manera equivalente.
3. `ecg_analisis.py` agrega evidencia delta cuando existen al menos tres derivaciones. `measure_traces` llama al analizador una derivación a la vez: la condición multiderivación no puede cumplirse en una de esas llamadas aisladas.
4. El máximo local del QRS permite que una delimitación extrema domine la medida global; el ejemplo V2=227 ms debe revisarse frente a latidos individuales, ruido, delta y final del complejo.
5. La aproximación de empastamiento >=30 ms del catálogo de reglas es operacional y no un detector de delta validado; no basta con rellenar ese número o bajar su umbral.

## Orden de implementación

### 1. Congelar una reproducción y anotar la referencia

- Conservar imagen original, PDF vectorial, reconstrucción de la captura y ventanas exactas utilizadas, sin identificadores.
- Añadir el caso como regresión de desarrollo con etiqueta de referencia separada de las entradas.
- Obtener revisión independiente de calibración, límites P/QRS/T, delta y posibles artefactos; conservar desacuerdos entre revisores. La respuesta textual de Wave-Maven identifica el patrón, pero no proporciona límites médicos numéricos de todas las ondas.
- Registrar errores por etapa: formato/calibración, reconstrucción, detección de latidos, delineación, rasgos y razonamiento.

### 2. Unificar la medición Python y su contrato

- Definir un único resultado con procedencia, unidades, resolución, límites temporales, candidatos, incertidumbre y advertencias. El contrato debe llegar intacto al visor, reglas, prompt de evidencia e informe.
- Conservar candidatos delta por derivación y latido antes de agregarlos; incluir polaridad, pendiente inicial/terminal, duración candidata y consistencia.
- Agregar evidencia de latidos representativos sin fingir simultaneidad entre segmentos sucesivos. Para señales simultáneas, usar alineación multiderivación real.
- Hacer que las distintas entradas compartan la misma lógica clínica, conservando las diferencias legítimas de resolución y señal. Ninguna ruta puede convertir un rasgo disponible en ausencia silenciosa.

### 3. Delinear preexcitación y reintentar con criterios objetivos

- Revisar el inicio temprano y lento del QRS y la separación respecto a P; admitir delta positiva, negativa y variable entre derivaciones. Medir PR desde inicio de P hasta inicio de la despolarización, incluida la delta.
- Delimitar latidos individuales y resumir solo los comparables. Un máximo extremo no debe imponerse sin comprobar repetibilidad y calidad.
- Si hay conflicto, probar un conjunto pequeño y prefijado de configuraciones de filtrado/delineación; compararlas con continuidad del trazo, preservación de la morfología, residuos frente a la imagen, calibración y estabilidad entre latidos.
- Elegir la solución mejor sustentada por la señal, no la que coincide con el diagnóstico esperado. Limitar intentos/tiempo; si persiste el conflicto, mostrarlo y pedir corrección únicamente de las ventanas afectadas.

### 4. Integrar el diferencial, sin forzar una etiqueta

- Integrar PR, inicio del QRS, delta y distribución entre derivaciones para priorizar preexcitación cuando exista evidencia.
- Evaluar bloqueo de rama, retraso inespecífico, hipertrofia y patrones de Q/ST-T considerando que la preexcitación puede imitarlos. No descartar patologías coexistentes sin evidencia.
- Separar patrón WPW del síndrome clínico. Preguntas opcionales sobre taquicardias documentadas, palpitaciones y síncope aportan contexto y urgencia; no reemplazan los criterios del trazado.
- Mostrar evidencias a favor, contradicciones y qué dato falta, con confianza cualitativa hasta disponer de calibración válida. Evitar presentar una hipótesis secundaria débil como diagnóstico principal solo porque faltó un rasgo de la hipótesis principal.

### 5. Entrenamiento y evaluación adecuados al objetivo

- Los 547 casos ya revisados son material de desarrollo: no constituyen un conjunto externo independiente. El experimento de categorías amplias no entrenó un detector validado de delta ni límites de onda.
- Entrenar la delineación y el detector morfológico con señales/imágenes que tengan anotaciones pertinentes. PTB-XL, LUDB/QTDB y otras fuentes pueden aportar componentes diferentes, tras comprobar qué etiquetas contienen; no se supone que todas anoten WPW o delta.
- Separar pacientes y duplicados antes de ajustar. Mantener fotos/renderizados del mismo ECG en su partición. Añadir pruebas externas no utilizadas para ajustar, con fotos reales autorizadas, PDF y variaciones de escala/ruido.
- Medir error de FC, PR, QRS, QT y eje; sensibilidad, especificidad, AUPRC y confusiones por patrón; cobertura, abstención e intervalos de confianza. Los porcentajes individuales solo se mostrarán después de calibración reservada.

### 6. Criterios de aceptación y despliegue

- Regresión del caso 218: evidencia de preexcitación llega a las reglas; límites superpuestos revisables; ninguna respuesta de referencia alimenta el predictor.
- Controles normales y mimetizadores: delta negativa, PR corto sin delta, bloqueos, QRS ancho, hipertrofia, Q patológicas, ruido y electrodos alterados. Verificar que mejorar WPW no aumenta falsas preexcitaciones o infartos.
- Objetivos iniciales de medidas en señales evaluables, ya acordados: MAE FC <=5 lpm, PR <=20 ms, QRS <=15 ms, QT <=30 ms y eje circular <=15 grados; publicar dispersión/cobertura y no ocultar fallos. Son objetivos de investigación, no certificación clínica.
- Visor, informe, explicación y prompt deben compartir exactamente los mismos datos, incluidas correcciones e incertidumbre.
- Publicar únicamente después de la regresión y evaluación correspondiente, con reversión y versión identificable. Un acierto en este caso de desarrollo no acredita generalización ni éxito en todos los casos de Wave-Maven.

## Pendiente concreto

Falta el informe real que obtuvo el usuario. Con él se podrá comparar su reconstrucción y sus cifras con esta reproducción, y decidir si además existe un fallo específico en la captura o calibración. No se necesita volver a descargar todo Wave-Maven para investigar esta incidencia.
