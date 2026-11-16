# Actualización de evidencia: ritmo y conducción

Consulta: 2026-11-13. Revisión narrativa dirigida, no revisión sistemática. Se añaden **10 referencias únicas**, verificadas mediante texto del cuerpo relevante, a entidades existentes. No se añaden diagnósticos ni probabilidades individuales. Los metadatos y resúmenes propios bilingües están en [el registro de evidencia](../evidence/literature-rhythm-conduction.json); no contiene abstracts ni cuerpos de artículos.

## Qué cambia y por qué

- **FA, ESC 2024:** confirmar el trazado y completar AF-CARE con contexto clínico; la duración mínima ambulatoria no equivale a una regla universal de 30 segundos. El registro breve no determina carga, inicio fiable, patrón temporal, anticoagulación ni elegibilidad para cardioversión. Se consultaron la guía y la revisión de sus cambios, sin trasladar tratamientos a reglas del detector.
- **Bradicardia y pausas:** revisar síntomas sutiles, fármacos, electrolitos, función tiroidea y respuesta al ejercicio cuando esté indicada. Una frecuencia <50 lpm o pausa >3 s aisladas no diagnostican disfunción sinusal ni indican por sí solas marcapasos. ESC 2021 refuerza correlación síntoma-ritmo, causas reversibles y evaluación nodal/infranodal del 2:1 incidental; también se añade contexto de síncope a patrones bifasciculares.
- **Mobitz II:** la revisión de 2024 exige PP estable sin enlentecimiento sinusal, PR igual antes y después de una sola P bloqueada y al menos dos P conducidas consecutivas. Se añade **un criterio requerido no medible** (`m2-stable-pp`, `predicate: null`): la frecuencia auricular media no verifica estabilidad PP. Por tanto el detector conserva el caso como posible, pendiente de tira larga/manual; no lo declara completado con agregados. Se aclaran dos notas de criterios existentes. El bloqueo 2:1 sigue excluido del subtipo II.
- **Preexcitación:** preservar la detección multiderivación positiva/negativa y sus controles de calidad de KB 1.3; ampliar límites de preexcitación mínima/intermitente y PR aparentemente normal. La pérdida gradual de delta puede ser fusión variable por mayor contribución nodal. Se distingue una vía oculta solo retrógrada (puede causar AVRT, sin preexcitación anterógrada visible) de una preexcitación anterógrada sutil.
- **Riesgo WPW:** la revisión de 2023 considera tranquilizadora la pérdida abrupta inequívoca; la revisión deportiva de 2024 también describe límites. La cohorte prospectiva de Jemtrén obliga a evitar una exclusión categórica: 6/45 con hallazgos de bajo riesgo en ejercicio mostraron APERP/SPERRI ≤250 ms en EEF. Se conserva la incertidumbre y se recomienda valoración especializada según síntomas, deporte u ocupación. No se genera riesgo individual ni autorización deportiva.
- **Brugada:** sustituir el paso que presentaba la conversión farmacológica del tipo 2 como conclusión diagnóstica suficiente. La revisión de 2023 documenta especificidad imperfecta y diferencias entre fármacos/poblaciones. La elección de prueba debe ser especializada y contextual; un tipo 2 incidental asintomático no la justifica automáticamente.
- **Taquicardia ancha:** estabilidad clínica no distingue TV de TSV, ausencia de cardiopatía conocida no excluye TV e irregularidad tampoco la excluye. Reforzar ECG basal, medicación, causas metabólicas y límites de algoritmos; no se añaden prescripciones.

## Fuentes y localizadores consultados

| Fuente | Evidencia consultada | Aplicación |
| --- | --- | --- |
| [Van Gelder et al., ESC 2024, PMID 39210723](https://pubmed.ncbi.nlm.nih.gov/39210723/) | Cuerpo editorial, §§2, 3.1/tabla 6 y 3.2 | Documentación ECG, duración y AF-CARE |
| [Rienstra et al., 2024, PMID 39716733](https://pubmed.ncbi.nlm.nih.gov/39716733/) | PMC11666470, cuerpo completo disponible | AF-CARE y límites del manejo desde ECG |
| [Ungaro et al., 2024, PMID 39452294](https://pubmed.ncbi.nlm.nih.gov/39452294/) | PMC11508300, §§2, 4–6 | Preexcitación mínima y contexto deportivo |
| [Antiperovitch et al., 2023, PMID 36990680](https://pubmed.ncbi.nlm.nih.gov/36990680/) | PMC10423537, evaluación no invasiva y figura 2 | Pérdida gradual versus abrupta, vía oculta |
| [Jemtrén et al., 2024, PMID 38363996](https://pubmed.ncbi.nlm.nih.gov/38363996/) | PMC10873488, métodos/resultados/tabla 3/limitaciones | Cohorte de 164: ejercicio frente a EEF |
| [Çinier et al., 2021, PMID 32693770](https://pubmed.ncbi.nlm.nih.gov/32693770/) | PMC8142361, evaluación, disfunción sinusal y bloqueos | Bradicardia/pausas y causas reversibles |
| [Glikson et al., ESC 2021, PMID 34455430](https://pubmed.ncbi.nlm.nih.gov/34455430/) | Cuerpo editorial, §§4, 5.1, 5.2 y 5.3 | Correlación clínica, 2:1 y síncope |
| [Barold y Herweg, 2024, PMID 39267806](https://pubmed.ncbi.nlm.nih.gov/39267806/) | PMC11390567, definición/tabla 1 y errores diagnósticos | PP estable y imitadores de Mobitz II |
| [Wilde et al., 2023, PMID 37345279](https://pubmed.ncbi.nlm.nih.gov/37345279/) | PMC10702857, especificidad, determinantes, conclusiones/figura 4 | Límites de provocación y patrón/síndrome |
| [Whitaker et al., 2023, PMID 37775174](https://pubmed.ncbi.nlm.nih.gov/37775174/) | Cuerpo PMC10541285, introducción/diagnóstico/manejo agudo | Diagnóstico diferencial de QRS ancho |

PubMed Healthcare Public Data se usó primero para búsquedas y metadatos y, cuando permitido, texto PMC. Las solicitudes PMC de Whitaker y de la versión Europace de ESC 2021 fallaron en el proveedor. Se usó Exa para leer cuerpo de las fuentes oficiales PMC/editoriales; también para las secciones relevantes de ESC 2024, cuyo registro PubMed no tiene abstract. `full-text` describe consulta de texto del cuerpo pertinente, no lectura íntegra de todas las páginas de las guías extensas.

## Límites y validación

La cohorte WPW es de pacientes remitidos a estudio y usa propiedades electrofisiológicas, no muerte súbita observada. Los 6/45 no se trasladan a riesgo poblacional ni individual. Los artículos de revisión no son validaciones del detector. No se cambia ningún predicado numérico ni se añade LR o sensibilidad/especificidad. La única nueva puerta lógica es la verificación manual de PP para Mobitz II; datos desconocidos siguen desconocidos. El registro distingue fuente, población, fecha, tipo y localizador; los artículos históricos no se reverifican por asociación.

La prueba dirigida comprueba que PR agregado constante/frecuencia media no completan Mobitz II y que 2:1 sigue excluido. Las pruebas existentes de preexcitación verifican conservación de WPW 1.3. La integración ejecuta el validador de la base y el conjunto de pruebas ECG.
