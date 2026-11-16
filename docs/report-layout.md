# Informe de resultados resumido

El PDF predeterminado muestra primero una única impresión, confianza cualitativa y avisos clínicos, seguidos de una tabla de frecuencia, PR, QRS, QT y eje, con QTc cuando puede evaluarse. El contexto y los hallazgos que sustentan la impresión se condensan; se eliminan las listas automáticas de diagnósticos alternativos no acompañados de explicación en el resumen. Las alternativas contextualizadas siguen presentes.

Las 12 derivaciones se agrupan en dos columnas con ventanas representativas de hasta 3,2 s, límites temporales, duración total disponible, mediciones visuales PR/QRS/QT y marcas R/S/ST. Se declara expresamente que son ventanas, no todo el registro. Se conserva completa la tira larga cuando existe. Los recortes priorizan las correcciones manuales y los tiempos exactos se conservan una sola vez en el resumen, a precisión de milisegundos. La ganancia es común y se adapta a picos grandes sin recortarlos. Las derivaciones ausentes o no evaluables se identifican.

Cada derivación tiene una línea de medidas y observaciones morfológicas seleccionadas. Se retiran los párrafos repetidos de método, confianza, índices técnicos y descripciones numéricas ya mostradas. Las referencias principales tienen enlaces; la atribución del registro se mantiene. Los avisos clínicos, límites de uso institucional y estado no evaluable no se convierten en normalidad.

El selector **Informe técnico ampliado** conserva el exportador anterior: todas las ventanas del registro, límites completos, métodos, advertencias técnicas y bibliografía íntegra. Está desactivado por defecto. Las descargas rápidas de ejemplos usan el mismo resumen. Las notas libres y la respuesta pegada de OpenEvidence siguen excluidas salvo elección expresa.

Frecuencia, intervalos y eje se redondean a enteros en la presentación y las conclusiones; las amplitudes del resumen usan hasta dos decimales. La precisión de cálculo, clasificación y correcciones no cambia. Los tiempos de auditoría y la escala conservan los decimales necesarios. La lectura por apartados de la página queda plegada, con conclusión y alertas visibles. El prompt de IA pide una respuesta más breve y sin repetir medidas.

Verificación: PDF ES/EN generados con el motor Python para ritmo sinusal, FA y el caso de desarrollo de preexcitación. El caso sinusal pasa de 18 a 4 páginas. La comprobación es de presentación y regresión de software; no es validación clínica. Se revisaron páginas rasterizadas con Poppler nativo.
