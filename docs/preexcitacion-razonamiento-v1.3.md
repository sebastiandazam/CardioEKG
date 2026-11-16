# Razonamiento de preexcitación — base 1.3.0

Esta revisión reemplaza la aproximación de empastamiento ≥30 ms de la base 1.2.0. Ninguna regla clínica actual establece preexcitación a partir de `deltaSlurMs` ni de un corte aislado de duración. Se utiliza el registro estructurado medido por Python y compartido con visor, reglas y explicación.

## Evidencia y contrato

`estimate.global.preexcitation` conserva estado `supported`, `not-supported` o `not-evaluable`, derivaciones de apoyo y limitaciones. Cada `leadDetails[lead].morphology.deltaEvidence` conserva el estado, polaridad positiva/negativa/variable, duración candidata, pendientes inicial y terminal, número de latidos reproducibles y analizados y ventanas temporales candidatas. Las reglas no vuelven a medir la señal ni asumen que los segmentos sucesivos sean simultáneos.

Antes de aceptar un agregado `supported`, las reglas comprueban que al menos tres derivaciones informadas contengan evidencia medible, con duración y pendientes finitas, polaridad y repetibilidad: al menos dos latidos y dos tercios de los latidos analizados. Son filtros de consistencia del detector, **no umbrales clínicos de rendimiento publicado**. La delta puede ser negativa y tener distinta polaridad en distintas derivaciones. No se exige QRS ≥120 ms: una preexcitación parcial puede tener QRS más estrecho.

PR corto medido y evidencia multiderivación corroborada apoyan el **patrón de preexcitación ventricular/WPW**. Los síntomas y las taquiarritmias documentadas son contexto clínico para evaluar el síndrome; no sustituyen la morfología. El motor no identifica de forma definitiva la localización de una vía ni indica una ablación.

Ausencia de metadatos, medición no evaluable, agregado incompatible con los datos locales o derivaciones ruidosas producen un resultado desconocido. Un `not-supported` solo se utiliza si existen al menos tres derivaciones evaluables: significa que no se corroboró el patrón, no que se haya descartado una vía accesoria o preexcitación intermitente. El PR corto sin datos de delta no se convierte en «sin preexcitación».

La salida presuntiva conserva las derivaciones concretas que apoyan el patrón, incluida la delta negativa, su duración candidata, latidos reproducibles/analizados y pendientes. La fuerza es cualitativa y heurística, sin porcentaje individual calibrado.

## Patrones que pueden confundirse

La preexcitación modifica el comienzo y la distribución de la activación, el eje y la repolarización. Puede imitar Q de infarto, criterios de voltaje/puntuación de hipertrofia, bloqueo de rama y cambios ST-T. Cuando la evidencia de preexcitación está corroborada y un patrón imitador también cumple sus criterios observables, ese patrón pasa al diferencial con una explicación explícita del factor de confusión. No se confirma ni se descarta enfermedad coexistente. Un ECG basal o no preexcitado, cambios seriados, síntomas, biomarcadores e imagen pueden ser necesarios para resolverla.

Esto sustituye el antiguo veto por una supuesta delta ≥30 ms. Tampoco se trasladan a preexcitación las cifras de rendimiento de criterios de isquemia/hipertrofia obtenidas sin ese factor de confusión. Si el patrón coexistente queda limitado por preexcitación, no se muestran sus cifras publicadas como rendimiento aplicable a ese resultado.

Las referencias clínicas siguen siendo las ya documentadas de [AHA/ACCF/HRS 2009 sobre conducción intraventricular](https://doi.org/10.1161/CIRCULATIONAHA.108.191095), [AHA 2009 sobre hipertrofia](https://doi.org/10.1161/CIRCULATIONAHA.108.191097) y [Cuarta Definición Universal de Infarto](https://doi.org/10.1093/eurheartj/ehy462). Los filtros técnicos del detector y su corroboración no se presentan como criterios validados de esas guías.

## Regresiones y límites

Se conserva una instantánea de medidas del nuevo recorrido Python del caso docente público 218 y controles sintéticos normal, FA y bloqueos de rama. En esta instantánea, el caso 218 aporta evidencia en cinco derivaciones, incluidas deltas negativas en V1 y III, y PR corto; el patrón WPW llega a diagnóstico presuntivo principal. No se introduce el identificador ni la respuesta de Wave-Maven en las entradas del predictor. El control de BRD conserva un candidato aislado en III que no basta para confirmar preexcitación.

Las pruebas adicionales comprueban delta positiva/negativa, preexcitación parcial con QRS estrecho, PR corto sin datos de delta, evaluación negativa explícita, insuficiente repetibilidad, ruido, metadatos inconsistentes y confusión con Q/ST-T/BRD. Las referencias de desarrollo se mantienen separadas de las entradas y se prueba invariancia frente a etiquetas y texto libre.

Esta es una corrección de integración y razonamiento con regresiones de desarrollo. El caso 218 y los controles usados para ajustar no constituyen validación clínica externa. Las duraciones y pendientes de la instantánea son estimaciones del motor, no anotaciones médicas independientes. Continúan pendientes la evaluación externa, los errores de límites frente a referencia adjudicada, cobertura/abstención y calibración. No se afirman los objetivos de MAE del plan como resultados alcanzados.
