# Guía de integración: `ecg_analisis.py` (v3, genérico)

Documento para quien (persona o agente Claude) vaya a **incorporar este módulo en otro código de análisis**. Explica qué hace, cómo se llama, qué devuelve, qué convenciones usa, cómo decide cada medida y dónde puede fallar.

---

## 1. Qué es y qué no es

- **Es** un medidor cuantitativo de ECG de 12 derivaciones. Entrada: PDF vectorial, PDF escaneado o imagen (PNG/JPG). Salida: un diccionario/JSON con intervalos, ejes, amplitudes, ST, T, ritmo, calidad y supuestos, más una figura de auditoría.
- **No es** un diagnosticador. Entrega mediciones y criterios objetivos (por ejemplo, los de preexcitación). La interpretación clínica queda fuera y debe hacerla una persona cualificada.
- Es **un solo archivo** (`ecg_analisis.py`), sin estado global, sin red y sin escribir fuera de la carpeta de salida.

Dependencias: `numpy`, `scipy`, `pdfplumber`, `pillow`, `matplotlib` (backend `Agg`). Tiempo típico: ~5 s por ECG.

---

## 2. Uso rápido

### Línea de comandos

```bash
python3 -I ecg_analisis.py ecg.pdf --salida resultados/
python3 -I ecg_analisis.py foto.png --layout 3x4r --px_mm 11.8
python3 -I ecg_analisis.py ecg.pdf --layout "I,aVR,V1,V4/II,aVL,V2,V5/III,aVF,V3,V6/II" --vel 50 --ganancia 20
```

| Opción | Significado |
|---|---|
| `--salida` | Carpeta de salida (`resultados.json`, `reporte.md`, `fiduciales.png`) |
| `--layout` | `auto` (por defecto), `3x4r`, `3x4`, `6x2`, `12x1`, o texto `"fila1/fila2/..."` con columnas separadas por coma |
| `--px_mm` | Píxeles por mm (solo imágenes; si se omite se estima de la cuadrícula) |
| `--vel`, `--ganancia` | mm/s y mm/mV si no están en el texto del PDF |
| `--raster` | Forzar lectura como imagen aunque el PDF sea vectorial |
| `--pagina` | Página del PDF (por defecto 0) |
| `--sexo M/F` | Reservado para umbrales por sexo en el reporte |

### Como librería

```python
import sys; sys.path.insert(0, "/ruta/al/modulo")
import ecg_analisis as E

ext = E.extraer("ecg.pdf", layout="auto")        # lectura -> señales calibradas
res, aux = E.analizar(ext)                        # mediciones (dict) + datos auxiliares para figuras
E.figura(res, aux, "fiduciales.png")              # auditoría visual
texto_md = E.reporte(res)                         # reporte en markdown
```

Firmas reales:

- `extraer(ruta, layout=None, px_mm=None, vel=None, gan=None, pagina=0, forzar_raster=False) -> ext`
- `analizar(ext, sexo=None) -> (res, aux)`
- `figura(res, aux, ruta_png)`, `reporte(res, sexo=None) -> str`

Regla de seguridad para ejecutarlo: llamarlo con `python3 -I` (modo aislado) y pasar las rutas como argumentos; el módulo no ejecuta nada del archivo que lee.

---

## 3. Arquitectura (flujo de datos)

```
PDF / imagen
   │
   ├─ extraer_vector()  ─┐   (si el PDF tiene trazo vectorial)
   └─ extraer_raster()  ─┴─> ext = {sig, cols, layout, segs, ncol, vel, gan, fs_orig, supuestos, control}
                                  │
                         analizar(ext)
                                  │  1. detectar latidos (tira de ritmo o por columna)
                                  │  2. latido promedio (mediana) por derivación, con enmascarado
                                  │  3. fiduciales globales: P, QRS (inicio, J), delta, T
                                  │  4. intervalos, QTc, ejes, amplitudes, ST, T, U, voltajes
                                  │  5. medición latido a latido en una derivación de referencia (incertidumbre)
                                  │  6. controles de calidad
                                  ▼
                         res (JSON-serializable)  +  aux (arrays para graficar)
```

### El objeto `ext` (salida de la lectura)

| Clave | Contenido |
|---|---|
| `sig` | `ndarray (filas, N)`: una fila por renglón de la hoja, **muestreada a 1 kHz (1 muestra = 1 ms)**, en **mV** |
| `cols` | Bordes de las columnas en ms (`[0, 2500, 5000, 7500, N]` en un 3×4 de 10 s) |
| `layout` | Lista de filas con los nombres de derivación; una fila con un solo nombre en una hoja de varias columnas es una tira de ritmo |
| `segs` | Lista de segmentos `{row, col, lo, hi, lead, full}`; `full=True` si abarca todo el ancho |
| `ncol`, `vel`, `gan`, `fs_orig` | Columnas, mm/s, mm/mV, frecuencia de muestreo original aproximada (Hz) |
| `supuestos` | Lista de textos con todo lo asumido; se propaga a `calidad.avisos` |
| `control` | Metadatos de la lectura (modo, escala de cuadrícula, filas, columnas…) |

**Un punto clave para integrar:** si ya tienes las señales de otra fuente (por ejemplo, un archivo digital con 12 derivaciones), puedes **saltarte la lectura** y construir tú mismo un `ext` con esa estructura (señales a 1 kHz en mV, `segs`, `cols`, `layout`, `ncol`, `vel`, `gan`) y llamar a `analizar(ext)`. El análisis no depende de PDF ni de imágenes.

---

## 4. Convenciones (léelas antes de consumir el JSON)

| Tema | Convención |
|---|---|
| Referencia temporal | **t = 0 es el pico de la R** de la derivación de referencia (se alinea igual para todas las derivaciones simultáneas). Los instantes negativos son anteriores a la R |
| Unidades de tiempo | Milisegundos. Campos como `P_on`, `QRS_on`, `QRS_fin_J`, `T_fin_*` son **relativos a la R** (p. ej. `P_on = -185`) |
| Intervalos | Duraciones absolutas en ms: `PR`, `QRS`, `QT_*`, `JT`, `P_dur` |
| Amplitudes `*_mm` | Son **mV × 10** (mm equivalentes a 10 mm/mV), no mm de papel. Sirven para comparar con criterios clásicos (Sokolow 35 mm, etc.) aunque la ganancia original sea otra |
| Áreas `area_*` | mV·ms, con la línea base del segmento PR. Se usan para los ejes |
| ST | Relativo al **nivel del segmento PR** de cada derivación (`ST_J_mm`, `ST_J60_mm`, `ST_J80_mm`). `ST_J60_vs_TP_mm` es el mismo punto respecto a la línea base TP |
| Ángulos | Plano frontal, grados; 0° = hacia I, +90° = inferior |
| Valores no medibles | `NaN` (en el JSON aparece como `NaN`) o `null`. Un cliente JSON estricto debe tolerarlo |
| Clave heredada | `por_latido_DII` corresponde a la **derivación de referencia** (ver `calidad.derivacion_referencia`), que suele ser II pero no siempre |

---

## 5. Esquema de `res` (resultados.json)

```
ritmo
  n_latidos, RR_ms[], RR_medio, RR_DE, RR_min, RR_max,
  FC_media, FC_min, FC_max, SDNN, RMSSD, pNN50, variacion_max_min_ms, CV_pct
intervalos
  PR, P_on, P_off, P_dur, QRS_on, QRS_fin_J, QRS, delta_fin, delta_dur,
  QRS_rango_por_criterio [min,max], QRS_fin_sensibilidad{umbral:ms}, QRS_inicio_sensibilidad{umbral:ms},
  QT_tangente, QT_umbral, T_fin_tangente, T_fin_umbral, T_fin_rango_derivaciones [min,max],
  QTc_tangente{Bazett,Fridericia,Framingham,Hodges,Bogossian_QT_menos_mitad_QRS}, QTc_umbral{...},
  JT, JTc_Bazett, Tpico_Tfin_mediana, QT_dispersion_ms,
  QT_por_derivacion{lead:ms}, QRS_on_por_derivacion{lead:ms}
ejes
  QRS_grados, QRS_ajuste_R2, delta_grados, terminal_40ms_grados,
  T_grados, P_grados, P_ajuste_R2, angulo_QRS_T_frontal
transicion_precordial            (primera V con R >= |S|)
voltajes
  Sokolow_Lyon_mm, R_aVL_mm, Cornell_mm, Gubner_mm, R_V5_o_V6_mm,
  bajo_voltaje_limb, bajo_voltaje_prec
onda_U_mm{V2,V3,V4}
preexcitacion
  PR_corto, QRS_ancho_ge110, delta_medible, derivaciones_con_delta[], delta_dur_ms,
  fraccion_QRS_que_es_delta, eje_delta_grados, polaridad_delta{lead:{amp_mm,signo}},
  transicion_precordial, criterios_cumplidos (0-3)
por_latido_DII{PR,P_dur,QRS,QT,R_mm : {media, DE, n}}     # latido a latido, derivación de referencia
por_latido_detalle[ {R_ms, PR, P_dur, P_amp_mm, QRS, QT, R_mm} ]
derivaciones{lead: {
  morfologia, R_mm, S_mm, Q_mm, amp_pico_a_pico_mm, Q_dur_ms, Q_patologica,
  area_QRS, area_delta, area_terminal, area_T, area_P, nivel_PR_mm,
  ST_J_mm, ST_J60_mm, ST_J80_mm, ST_J60_vs_TP_mm,
  P_amp_mm, T_amp_mm, T_bifasica, T_pico_ms, n_latidos }}
calidad
  modo_lectura, distribucion, velocidad_mm_s, ganancia_mm_mV, escala_cuadricula_mm,
  derivacion_referencia, fs_original_Hz, ruido_latido_individual_uV, SNR_mediano,
  latidos_por_derivacion{lead:n}, Einthoven{II_menos_I_mas_III, suma_aumentadas, escala},
  P_detectada_por_latido ("8/8"), avisos[]
```

`aux` (no serializable a JSON) trae los latidos promedio por derivación (`B`, `Bs`), el contexto temporal (`cx`), los picos R, los niveles PR, los fiduciales por derivación y datos para graficar. Úsalo solo si quieres dibujar o reprocesar.

---

## 6. Cómo decide cada medida (con los umbrales del código)

### 6.1 Lectura

**PDF vectorial (`extraer_vector`)**
- Velocidad y ganancia: regex sobre el texto (`mm/s`, `mm/sec`, `mm/mV`); si faltan, 25 y 10 con aviso.
- Escala real de la hoja: moda de la separación entre líneas horizontales largas que no son el trazo; debe ser ≈ 1 mm (2,835 pt). Si no hay cuadrícula, se asume escala real.
- Trazo: el color con más puntos entre objetos de ≥ 5 puntos (la cuadrícula son líneas de 2 puntos). Se encadenan los segmentos que empiezan donde termina otro; se descartan cadenas de < 12 mm (pulsos, marcas).
- Filas: se agrupan por la mediana de y (corte si la separación > 8 mm).
- Columnas: separadores verticales gruesos → inicios de los trazos → reparto igual.
- Distribución: `--layout`; si no, rótulos de texto del PDF; si no, la forma de la hoja (4×4 → `3x4r`, 3×4 → `3x4`, 6×2 → `6x2`, 12×1 → `12x1`). Si no puede decidir, lanza `ValueError("... use --layout")`.

**Imagen / PDF escaneado (`extraer_raster`)**
- Máscara de trazo: píxeles con canal máximo < 130 (tinta oscura; excluye rótulos azules y cuadrícula de color). Máscara de cuadrícula: saturación > 25 y brillo > 140.
- Escala: autocorrelación de las proyecciones de la cuadrícula, con refinamiento subpíxel. Se acepta solo si el ancho resultante está entre 120 y 500 mm. Si no, hace falta `--px_mm`.
- Filas: picos del perfil de tramos horizontales planos (erosión de 4 mm); la región se amplía 25 mm arriba y abajo porque los picos pueden salir de la cuadrícula.
- Seguimiento del trazo: Viterbi sobre los tramos de tinta de cada columna (ignora textos sueltos) y, en flancos empinados, se toma el extremo en el sentido del movimiento para conservar los picos de la R.
- Pulso de calibración inicial: se recorta si hay una subida y una bajada de ≈ 1 mV separadas > 3,5 mm en los primeros 12 mm.

### 6.2 Latidos y latido promedio

- Detección: energía de la pendiente (derivada² suavizada) **sumada** entre las derivaciones simultáneas; picos con distancia mínima 250 ms; el instante final es el pico de mayor excursión de la derivación más grande.
- Si existe una derivación de ancho completo (tira de ritmo o 12×1) se usa para todos los latidos; si no, se detecta por columna.
- Latido promedio: mediana, derivación por derivación, con **enmascarado por segmento** (los latidos parciales aportan donde hay datos; las muestras de otra columna se marcan `NaN`). Ventana: `pre = max(300, min(420, 0.42·RR))` y `post = max(480, min(620, 0.62·RR))`. Línea base de cada latido = mediana de `[-250, -190]` ms.
- Si una derivación tiene tira de ritmo se usa solo esa (no se duplican latidos).

### 6.3 Fiduciales

| Medida | Método |
|---|---|
| **Onda P** | En cada derivación con P ≥ max(0,04 mV; 4×ruido), entre −215 y −95 ms: desde el pico, retrocede/avanza hasta caer a max(8 % de la amplitud; 3×ruido). Se toma la **mediana** de las derivaciones |
| **Nivel del segmento PR** | Por derivación, se retrocede desde el pico de la R hasta un tramo plano (pendiente baja, 7 muestras seguidas) que además esté a ≥ 50 % de la altura de la R. Se parte 10 ms antes del ápice porque el ápice también es "plano" |
| **Inicio del QRS** | Por derivación, primer punto (hacia atrás) donde la desviación respecto al nivel PR queda < max(0,015 mV; 4×ruido) durante 4 muestras. Solo cuentan derivaciones con |pico| ≥ 0,25 mV. **Global = el 2.º más temprano** (robusto a ruido) |
| **Fin del QRS (J)** | Velocidad espacial = RMS de la derivada de las 12 derivaciones; J = primer instante tras la R en que queda bajo max(media+3·DE del ruido; 0,0025 mV/ms) durante 8 ms |
| **Delta** | Quiebre óptimo de dos rectas entre el inicio del QRS y el pico, por derivación. Válida si la 2.ª pendiente > 3× la 1.ª y dura ≥ 15 ms; global = mediana si hay ≥ 3 derivaciones |
| **Fin de T** | Por derivación con |T| ≥ 0,15 mV (se baja el umbral si hace falta): (a) **tangente** en la máxima pendiente descendente y (b) **umbral** al 10 % de la amplitud. Global = mediana |
| **QT** | `fin de T − inicio global del QRS`, en las dos variantes (`QT_tangente`, `QT_umbral`) |
| **QTc** | Bazett, Fridericia, Framingham, Hodges y `QT − ½·QRS` (Bogossian) |
| **Ejes** | Ajuste por mínimos cuadrados de un vector frontal (hx, hy) a las áreas netas de I, II, III, aVR, aVL, aVF (vectores de derivación consistentes con Einthoven). Se calculan para QRS, delta (primeros 40 ms), terminal (últimos 40 ms), T y P |
| **Morfología** | Extremos con prominencia ≥ max(0,04 mV; 10 % del pico a pico); letras q/Q, r/R, s/S, r′/R′ (mayúscula si ≥ 50 % del mayor) |
| **ST / T / U** | ST en J, J+60, J+80 ms; T con amplitud y bifasicidad; onda U buscada en V2–V4 tras el fin de T |

### 6.4 Incertidumbre

El módulo entrega tres señales de cuán fiable es cada intervalo:

1. **Rangos por criterio**: `QRS_rango_por_criterio`, `QRS_inicio_sensibilidad`, `QRS_fin_sensibilidad` (qué pasa al variar los umbrales) y `T_fin_rango_derivaciones`.
2. **Latido a latido** en la derivación de referencia: `por_latido_DII` (`media`, `DE`, `n`).
3. **Calidad**: Einthoven (`II − (I+III)` y `aVR+aVL+aVF` deben ser ≈ 0 frente a la `escala`), ruido por latido y número de latidos por derivación.

Un integrador debería **mostrar siempre estos rangos junto al valor puntual** y desconfiar de intervalos cuyo rango sea amplio.

---

## 7. Validación realizada

Se generaron 5 ECG sintéticos con valores conocidos (`gen_sintetico.py`: 3×4 + ritmo, 6×2, 12×1 con 5 mm/mV, 3×4 sin etiquetas ni pulso, y 3×4 a 50 mm/s) y se analizaron como PDF vectorial y como PNG (10 corridas). Errores (medido − real):

| Parámetro | Error medio | Rango |
|---|---|---|
| FC | +0,5 lpm | +0,1 a +2,5 |
| QRS | +0,2 ms | −2 a +5 |
| Eje QRS | −0,6° | −1,3 a +0,1 |
| PR | −9,9 ms | −19 a −6 (sesgo sistemático) |
| QT (tangente) | −29,4 ms | −36 a −23 (sesgo sistemático) |

Interpretación: FC, QRS y eje son fiables. **PR y QT salen más cortos que el valor nominal** porque los sintéticos usan ondas P y T suaves cuyo inicio y fin nominales son asintóticos; en un ECG real el inicio/fin de onda también es una convención. Los sintéticos no tienen deriva de línea base, artefactos ni arritmias: la validación comprueba lectura, distribuciones y escalas, **no exactitud clínica**.

Con el ECG real de prueba (preexcitación), el modo vectorial y el modo imagen dieron FC 57/57 lpm, PR 98/108 ms, QRS 141/153 ms, QT 387/382 ms y eje 74°/73°.

---

## 8. Modos de fallo conocidos y cómo tratarlos

| Situación | Síntoma | Qué hacer |
|---|---|---|
| Imagen con 12 filas muy juntas | Conteo de filas erróneo (`ValueError: No puedo deducir la distribución...`) | Pasar `--layout 12x1` |
| Imagen sin cuadrícula de color (impresión en gris) | `ValueError: ... indique --px_mm` | Pasar `--px_mm` |
| Distribución no estándar | `ValueError` pidiendo `--layout` | Pasar el layout como texto |
| FC > 100 lpm | Aviso: la ventana de base puede incluir la P siguiente | P, PR y ST pierden fiabilidad; marcarlo en la salida |
| P < 0,04 mV o muy pocas derivaciones con P | Aviso "P medible en solo N derivación(es)" | No usar `PR` ni `P_dur` sin cautela |
| T pequeña | Aviso de umbral rebajado | Tomar el QT con cautela |
| QRS ancho / preexcitación | `QRS` y `PR` dependen del criterio | Mirar `QRS_rango_por_criterio` y `fiduciales.png` |
| Pocos latidos (< 4 RR) | Aviso; la variabilidad RR no es interpretable | No usar SDNN/RMSSD/pNN50 |
| Imagen muy limpia (ruido < 1 píxel) | `ruido_latido_individual_uV` ≈ 0,01 | Es el piso numérico; ignorar el SNR |
| Varias páginas | Solo se lee la `--pagina` indicada | Llamar una vez por página |

Todos los avisos quedan en `res["calidad"]["avisos"]`; un integrador **debe** reenviarlos al usuario final.

---

## 9. Cómo integrarlo en otro análisis (patrones recomendados)

### 9.1 Contrato de uso

1. Llamar a `extraer` y `analizar` dentro de `try/except ValueError`; el mensaje del error ya dice qué parámetro falta.
2. Leer **primero** `res["calidad"]`: modo de lectura, distribución usada, avisos y Einthoven.
3. Usar los valores puntuales **junto con** sus rangos (`QRS_rango_por_criterio`, `por_latido_DII`).
4. Presentar `fiduciales.png` cuando se vaya a mostrar una medición a una persona: permite auditar dónde se marcó cada punto.
5. No convertir las medidas en un diagnóstico dentro del código: usar los booleanos de `preexcitacion` como **criterios**, no como veredicto.

### 9.2 Ejemplo mínimo

```python
import json, ecg_analisis as E

def medir_ecg(ruta, layout="auto", **kw):
    try:
        ext = E.extraer(ruta, layout=layout, **kw)
        res, aux = E.analizar(ext)
    except ValueError as e:
        return {"ok": False, "error": str(e)}
    iv, rt, q = res["intervalos"], res["ritmo"], res["calidad"]
    return {
        "ok": True,
        "FC": rt["FC_media"], "RR_ms": rt["RR_medio"],
        "PR": iv["PR"], "QRS": iv["QRS"], "QRS_rango": iv["QRS_rango_por_criterio"],
        "QT": iv["QT_tangente"], "QT_umbral": iv["QT_umbral"],
        "QTc_Fridericia": iv["QTc_tangente"]["Fridericia"],
        "eje_QRS": res["ejes"]["QRS_grados"],
        "preexcitacion_criterios": res["preexcitacion"]["criterios_cumplidos"],
        "avisos": q["avisos"], "lectura": q["modo_lectura"], "layout": q["distribucion"],
    }
```

### 9.3 Si ya tienes la señal digital

Construye `ext` con tus datos y llama a `analizar`:

```python
import numpy as np
sig = np.vstack([...])            # (n_filas, N) en mV, 1 muestra por ms
layout = [["I","aVR","V1","V4"], ["II","aVL","V2","V5"], ["III","aVF","V3","V6"], ["II"]]
cols = [0, 2500, 5000, 7500, sig.shape[1]]
segs = E.construir_segmentos(layout, cols)
ext = dict(sig=sig, cols=cols, layout=layout, segs=segs, ncol=4, vel=25, gan=10,
           fs_orig=500.0, supuestos=[], control=dict(modo="señal digital", grid_mm=float("nan")))
res, aux = E.analizar(ext)
```

(Para un registro 12×1 simultáneo usa `layout = [[k] for k in E.LEADS12]` y `cols = [0, N]`.)

### 9.4 Puntos de extensión

| Quiero… | Dónde tocar |
|---|---|
| Cambiar umbrales de P, QRS, J, T | Funciones `onda_P`, `inicio_qrs`, `fin_T` y el bloque de fiduciales de `analizar` (los umbrales están como constantes literales; ver tabla 6.3) |
| Añadir un nuevo QTc | Función interna `qtc()` dentro de `analizar` |
| Soportar otra distribución | Añadir una entrada a `PRESETS` y, si procede, a la tabla de `layout_por_forma` |
| Añadir un parámetro por derivación | Bloque `leads[k] = d` en `analizar` (todo parte de `Bs[k]`, el latido promedio suavizado, y `nivel[k]`) |
| Cambiar la ventana del latido | `pre`/`post` y `bw` al inicio de `analizar` |
| Usar otra fuente de señal | Construir `ext` (sección 9.3) y llamar solo a `analizar` |

---

## 10. Reglas de seguridad al usarlo desde otro código

- Los archivos de entrada (PDF/imagen) son datos no confiables: ejecutar con `python3 -I`, pasar rutas como argumentos y no ejecutar nada que venga dentro del archivo.
- Escribir la salida en una carpeta nueva y vacía; no mezclar con los scripts.
- Si se integra en un servicio, limitar el tamaño de la imagen (el modo imagen construye máscaras del tamaño de la página; a 300 dpi son ~8 M píxeles).
- No registrar datos personales de la cabecera del ECG (nombre, ID) en logs: el módulo no los lee, pero la figura y el PDF original pueden contenerlos.

---

## 11. Resumen en una frase para el agente que lo integre

> Llama a `extraer()` y luego a `analizar()`; consume `resultados.json` respetando que **t = 0 es la R**, que **`*_mm` = mV×10**, que **PR y QT tienen sesgo sistemático corto frente a las definiciones nominales**, y que **siempre debes reenviar `calidad.avisos` y los rangos de incertidumbre**; el módulo mide, no diagnostica.
