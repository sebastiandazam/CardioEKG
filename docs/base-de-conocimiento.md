# Base de conocimiento y diagnóstico presuntivo (v22.1; KB 1.4.0)

CardioEKG v22 incorpora un motor que contrasta las medidas del trazado y la historia clínica con criterios publicados (guías AHA/ACC/HRS, ESC, Cuarta Definición Universal del Infarto, criterios clásicos y estudios de validación). Con ese contraste propone un **diagnóstico presuntivo**, hallazgos concurrentes, un diferencial y una lista de entidades graves que el trazado no permite descartar.

> Uso educativo. La «fuerza» que muestra el panel es un peso relativo de evidencia, **no una probabilidad calibrada**. El resultado no sustituye la lectura del trazado original por un profesional ni la valoración clínica.

## Ampliación bibliográfica del 13 de noviembre de 2026

Se añaden 24 registros bibliográficos y se vuelve a consultar una guía existente. El catálogo contiene 130 referencias normalizadas: 25 con secciones del texto consultadas y 105 registros previos, sin atribuirles una revisión nueva. Se actualizan recomendaciones y limitaciones de 41 entidades; no se añaden nuevas etiquetas diagnósticas ni pesos entrenados. Se separan dos estudios distintos de Smith de 2012 que compartían un identificador.

Fuentes, alcance y evidencia original sintetizada: [ritmo y conducción](literature-rhythm-conduction.md), [isquemia y causas sistémicas](literature-ischemia-systemic.md) y los manifiestos en `evidence/`. La página Fuentes permite buscar y descargar el catálogo. Los informes conservan la procedencia de las referencias utilizadas. El nivel de consulta bibliográfica no indica certeza ni validación diagnóstica.

## Contenido

| Dominio | Archivo | Entidades |
| --- | --- | --- |
| Ritmo y arritmias | `src/ecg/knowledge/kb/rhythm.json` | 25 |
| Conducción (bloqueos, preexcitación, Brugada, QT congénito, marcapasos) | `conduction.json` | 18 |
| Cavidades, eje y voltaje | `chamber.json` | 19 |
| Isquemia e infarto | `ischemia.json` | 15 |
| Repolarización, electrolitos, fármacos y causas sistémicas | `repolarization.json` | 17 |
| **Total** | | **94 entidades · 508 criterios · 130 referencias normalizadas** |

Los recuentos de urgencia y rendimiento publicados en la auditoría v22 son históricos; no representan una evaluación clínica de la versión actual.

Cada entidad incluye:
- criterios **requeridos** (lógica `all`, `any` o `atLeast:N`), **de apoyo** y **de exclusión**;
- modificadores por contexto clínico (edad, sexo, síntomas, antecedentes, fármacos, potasio, calcio, temperatura, marcapasos);
- simuladores (*mimics*), siguiente paso según la guía, limitaciones y referencias.

Cada criterio cita su fuente en `ref` y documenta en `note` de dónde sale el umbral.

## Cómo razona el motor (`engine.ts`)

1. **Rasgos.** `buildFeatures` convierte las medidas en rasgos globales (FC, PR, QRS, QTc, ejes de P, QRS y T, regularidad, conducción P-QRS, alternancia) y rasgos por derivación (P, Q, R, S, J, ST con su pendiente, segmento PR, T, relación T/QRS, empastamiento inicial).
   - Una derivación ruidosa no aporta datos.
   - Un QRS delineado sin q significa q = 0 (ausente), no «desconocido».
   - Una q que coincide con la deflexión más profunda y va seguida de r < 0,1 mV se considera ambigua (rS con línea de base desplazada) y queda como desconocida.
2. **Lógica de tres valores.** Cada criterio da verdadero, falso o *no evaluable*. La falta de datos nunca cuenta como ausencia del hallazgo.
3. **Estado de cada entidad:**
   - *cumplida*: se satisfacen los requeridos;
   - *posible*: algún requerido se cumple y el resto es desconocido;
   - *no evaluable*;
   - *no cumplida*;
   - *excluida*: una exclusión es verdadera.
4. **Peso de evidencia.** Es la suma de log₁₀ de las razones de verosimilitud.
   - Se usa la LR publicada, o la derivada de sensibilidad y especificidad publicadas, cuando existe.
   - Si no existe, se aplica un factor heurístico fijo: requerido cumplido ×3, apoyo cumplido ×1,5, apoyo ausente ×0,8, contexto que eleva ×2, contexto que reduce ×0,5.
   - Fuerza resultante: fuerte si el peso es ≥ 1,3, moderada si es ≥ 0,6 y débil en el resto. El panel indica si la evidencia de cada entidad es publicada, heurística o mixta.
5. **Diagnóstico presuntivo.**
   - **Principal**: el hallazgo anormal cumplido con más fuerza; los empates se rompen por urgencia y luego por peso.
   - **Concurrentes**: los demás hallazgos cumplidos. Los conjuntos alternativos de criterios de un mismo hallazgo (`group`: HVI, BRI AHA/Strauss, variantes de FA, bloqueo bifascicular, prolongación del QT, Brugada, digoxina, isquemia ST-T) se muestran una sola vez: la variante más urgente y, a igualdad, la mejor sustentada.
   - **Diferencial**: entidades posibles y simuladores de lo cumplido.
   - **No se puede descartar**: entidades urgentes o emergentes no evaluables que el trazado deja abiertas, sea porque algún criterio del trazado las apoya o porque falta una medida del ECG que necesitan. No se listan las que dependen solo de un dato clínico ausente ni de rasgos que la digitalización nunca mide.

## Auditoría clínica v22 (`scripts/kb-auditoria-v22.mjs`)

Los cambios aplicados sobre la base que compilaron los agentes de investigación:

| Cambio | Motivo |
| --- | --- |
| **TEP:** pasa a exigir ≥ 2 signos independientes. La T negativa debe ser ≥ 0,1 mV en ≥ 2 de V2–V4, con QRS estrecho. Se excluye con BRI o marcapasos. | Los signos ECG del TEP son inespecíficos (ESC 2019). La T negativa en V1 es normal, y con BRD la T negativa en V1–V3 es secundaria. |
| **HVD:** se excluye con QRS ≥ 120 ms, preexcitación o marcapasos. | AHA 2009, parte V. |
| **HVI** (Sokolow, Cornell, Peguero, Romhilt-Estes, *strain*) y **MCH:** se excluyen con BRI u otro QRS ancho sin rSR′, preexcitación o marcapasos. | AHA 2009, parte V: con BRI el voltaje y el ST-T no son valorables. |
| **ST y T** (IAMCEST, SCASEST, Wellens, de Winter, pericarditis, repolarización precoz) y **ondas Q:** se excluyen con BRI, marcapasos o preexcitación. | Alteraciones secundarias. Con BRI o marcapasos se usan las entidades de Sgarbossa. |
| **Hiperpotasemia:** exige K⁺ alto informado y al menos un signo ECG. | El ECG aislado es poco sensible e inespecífico. |
| **BRD + hemibloqueo posterior:** rS en I/aVL y qR en III/aVF pasan a ser requeridos. | AHA 2009, parte III: el eje derecho solo no basta. |
| **Q en V2–V3:** además de > 20 ms, se exige \|q\| ≥ 0,05 mV. | Límite de resolución del papel digitalizado. **No es un umbral de la DUIM.** |
| Se agrupan las variantes de un mismo hallazgo. | Evita mostrar el mismo diagnóstico dos veces. |
| Se retiran las cifras de sensibilidad o especificidad de 1,0 (2 criterios). | Muestras pequeñas o cifras derivadas: generaban LR infinitas. |
| Los simuladores que no existían como entidad se reasignan; 10 condiciones clínicas pasan a un glosario. | Corazón de atleta, EPOC, amiloidosis, derrame, hipomagnesemia, etc. |

## Limitaciones conocidas

- **Pesos.** La mayoría son heurísticos (el recuento histórico v22 identificó 47 de 492 criterios con rendimiento publicado). La fuerza ordena las hipótesis, pero no es una probabilidad calibrada; no ha habido validación clínica independiente.
- **Rasgos no medibles en esta digitalización:** onda U, frecuencia auricular independiente (conteo de P en bloqueo AV), latidos agrupados, espigas de marcapasos, ondas épsilon y fibrilatorias, y derivaciones V7–V9/V4R. Las entidades que dependen de ellos quedan como *no evaluables*: pausa sinusal, extrasístoles, FV, bloqueos AV de 2.º grado, IAM posterior o de VD.
- **QTc con QRS ≥ 120 ms.** Sobrestima la repolarización; considerar el JT.
- **Referencias no verificadas** (la fuente abierta no mostraba los datos completos): `tabas-2008`, `calcium-review`, `rumancik-jama`, `emnews-digoxin-2002`, `petek-2022`, `ecg-core-curriculum`. Llevan `verified: false` y el panel las marca.
- **Validación hecha:**
  - 19 pruebas del motor y de escenarios clínicos: IAMCEST anterior con umbral por edad y sexo, BRD, BRI, HVI, FA rápida, hiperpotasemia, preexcitación, QT largo, datos de ST ausentes;
  - 6 casos de extremo a extremo: simulaciones de sinusal, FA, BRD y BRI, y dos registros reales de la base PTB (uno normal y uno con FA).
  - Falta validar sobre una cohorte etiquetada (por ejemplo PTB-XL) para medir sensibilidad y especificidad reales.
