# Comprobación adicional de preexcitación

Fecha: 2026-11-13. Ensayo de desarrollo, sin ajuste de umbrales con estas respuestas y sin validación externa. Los casos Wave-Maven ya estaban en el material revisado del proyecto. No se entregó ninguna etiqueta de diagnóstico a `measure_file` ni a `measure_signals`. Las cifras son estimaciones automáticas, no anotaciones de referencia ni una comparación contra límites medidos por expertos.

Para los casos 193 y 97 se leyó el PDF vectorial local mediante `measure_file` con detección automática de formato y escala; el extractor identificó 3×4 con tira de II, 25 mm/s y 10 mm/mV. Se pasaron sus trazas de 250 Hz a `measure_signals`, con eje comparable y segmentos no simultáneos. La FC final indicada para la ruta de señales es la de la tira larga de II. Ambas rutas comparten código y sus diferencias no determinan cuál es correcta.

| Entrada | Lectura vectorial: FC / PR / QRS | Señales: FC de tira / PR de segmentos / QRS | Evidencia delta en señales |
| --- | --- | --- | --- |
| Wave-Maven 193 | 88,8 lpm / 96 ms / 114 ms | 88,8 lpm / 122 ms / 124 ms | Respaldada en I, III, aVL, V2–V5; III negativa y las demás positivas. |
| Wave-Maven 97 | 84,0 lpm / 65 ms / 261 ms | 84,1 lpm / 92 ms / 189 ms | No evaluable como agregado: solo V6 aportó candidato repetible. |
| PTB Diagnostic ECG, control del catálogo | No aplica | 77,5 lpm / 137 ms / 76 ms | No respaldada; sin derivaciones con candidato repetible. |
| PTB-XL, registro de fibrilación auricular del catálogo | No aplica | 157,8 lpm / no evaluable / 80 ms | No evaluable; sin candidatos repetibles. |

El caso 193 presenta una divergencia relevante en PR: la ruta de señales da 122 ms frente a 96 ms en lectura vectorial, cerca del umbral de 120 ms utilizado por las reglas. Esto puede impedir priorizar preexcitación pese a los candidatos delta; requiere revisión visual y una medición independiente, no ajustar el umbral al caso. En los candidatos respaldados, el inicio de delta coincide exactamente con el inicio del QRS de la misma derivación (0 ms de diferencia): ambos se proyectan desde el mismo inicio del latido mediano. Esa coincidencia es una propiedad del método, no una validación independiente del inicio real. El PR agregado de 122 ms es la mediana de aVR 118, V4 122, II 136, III 97 y aVF 135 ms; la discrepancia exige revisar ambos límites. La ruta de señales detectó II como QRS local discordante. La tira larga produce sus propios PR y QRS (167 y 60 ms), distintos de los agregados de los segmentos.

En el caso 97, la ruta vectorial indicó delta en cuatro derivaciones, pero la ruta de señales solo respaldó V6; no se puede afirmar sensibilidad suficiente en este ejemplo. La ruta de señales rechazó los QRS locales discordantes de V1 y V2 y no pudo analizar III. Las estimaciones vectoriales y de señales para QRS también difieren de forma importante; ninguna está verificada por un observador independiente.

Los controles del catálogo se analizaron como señales explícitamente simultáneas, usando alineación multiderivación cuando fue evaluable. En el registro irregular no se informó PR ni QTc automáticos. Las advertencias del motor incluyen posibles solapamientos de P con el latido precedente, pocos intervalos RR en segmentos cortos y límites QRS discordantes. La selección de candidato delta, sus pendientes y el requisito de repetición son heurísticas no calibradas; se necesita evaluar poblaciones externas, mimetizadores y fotografías autorizadas con anotaciones independientes antes de inferir sensibilidad o especificidad.
