# Coordinación de la entrega: motor central y Wave-Maven

Fecha: 2026-11-13. Skill invocada: Orchestrate. Se delegaron cuatro áreas independientes porque la integración asíncrona, la medición científica, la revisión de 547 fuentes y la evaluación de un clasificador requieren verificaciones distintas. No se afirma ahorro medido: no hay métricas de coste comparables por ejecución.

| Tarea | Recurso/modelo seleccionado | Motivo | Resultado |
| --- | --- | --- | --- |
| Adaptar Python, límites, compases y transporte aislado | central_python · gpt-6.1-terra · high | Implementación científica con revisión de unidades y errores clínicos | Completada; worker real, API, límites y pruebas |
| Recuperar catálogo, contextos y originales | maven_review · gpt-6.1-sol · high | Reutilizar el catálogo y verificar procedencia, cobertura y separación de respuestas | Completada; 547 páginas y 547 PDF, sin fallos, SHA verificados |
| Corregir reglas de razonamiento | clinical_rules · gpt-6.1-sol · high | Ambigüedad médica, evidencia trivaluada y riesgo de atribución falsa | Completada; KB 1.2.0, regresiones y fuentes específicas |
| Entrenamiento CPU reproducible | experimental_training · gpt-6.1-terra · high | Preparación de imágenes, partición y evaluación reproducibles | Completada; 547 procesados, 328 ajuste / 110 selección / 109 prueba; pesos inactivos |
| Integración, aceptación y publicación | Coordinador | Un responsable de archivos compartidos y de Sites | Integración y verificaciones descritas en `medicion-python.md` |

Los agentes escribieron en áreas separadas. La revisión de integración detectó y corrigió una discrepancia entre frecuencia corta y tira larga, política distinta de comparabilidad cliente/servidor y reutilización de resultados ante cambios de entradas. La ejecución real de Python reveló P superpuesta al QRS, PR no fiable en ritmo rápido/irregular, QS contradictorio con R visible y atribución de HVI con conducción ancha. Se añadieron regresiones específicas; no se tomaron los mensajes de los agentes como prueba suficiente por sí solos.

La cobertura de referencia no es validación clínica. No se introdujeron respuestas de Wave-Maven como entradas diagnósticas ni se activaron los coeficientes experimentales. RSR′ puede seguir sin detectarse, el inicio de T no se delimita y el QT puede subestimarse. No se promete acertar todos los casos. Las fuentes completas y los coeficientes de investigación quedan en artefactos locales ignorados por Git; el repositorio conserva métodos, índices y resultados agregados reproducibles.

## Segunda entrega: preexcitación

central_python (Terra/high): detector de delta, ventanas, consenso, reintentos y alineación. clinical_rules (Sol/high): KB 1.3.0 y confusión entre patrones. capture_regression (Terra/high): ensayo numérico independiente PDF raster → digitalizador real → Python, sin navegador. El coordinador integró tipos, superposición visual, informe, prompt y regresiones. Se descubrieron también límites en casos 193/97; se registraron sin ajustar umbrales a sus respuestas ni declarar validación.

## Ampliación bibliográfica KB 1.4.0

Dos tareas acotadas con Sol/high: literatura de ritmo/conducción y literatura de isquemia/repolarización/estructura. Se eligió razonamiento alto para contrastar afirmaciones, localizar limitaciones y separar metadatos de texto consultado. Entregaron dos manifiestos de evidencia, 24 referencias nuevas y cambios de contenido en 41 entidades. El coordinador verificó el catálogo, corrigió la propagación de referencias al informe y añadió pruebas de procedencia e identidad bibliográfica. No se equiparan estos resultados con entrenamiento o validación clínica.
