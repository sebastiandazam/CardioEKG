#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ecg_analisis.py (v3.1, genérico; v3 + ajuste de bordes de fila, ver CardioEKG docs/medicion-python.md) - Medición cuantitativa de un ECG de 12 derivaciones.

Acepta:  PDF vectorial (lee el trazo directamente) | PDF escaneado | imagen PNG/JPG.
Funciona con cualquier distribución habitual:  3x4 con tira de ritmo, 3x4 sin tira, 6x2, 12x1
(o una propia con --layout), cualquier velocidad (25, 50 mm/s...) y ganancia (5, 10, 20 mm/mV).

Uso:
    python3 -I ecg_analisis.py ecg.pdf --salida resultados/
    python3 -I ecg_analisis.py foto.png --layout 3x4r --px_mm 11.8
    python3 -I ecg_analisis.py ecg.pdf --layout "I,aVR,V1,V4/II,aVL,V2,V5/III,aVF,V3,V6/II" --vel 50 --ganancia 20

Opciones de --layout:  auto (por defecto) | 3x4r | 3x4 | 6x2 | 12x1 | texto "fila1/fila2/..." con columnas
separadas por coma. Una fila con una sola derivación cuando hay varias columnas se toma como tira de ritmo.

Salidas:  resultados.json | reporte.md | fiduciales.png

Cómo decide la distribución (modo auto): 1) rótulos de texto del PDF, 2) forma de la hoja (nº de filas y
columnas). Si no puede decidir, se detiene y pide --layout. Todo lo asumido queda en la sección "Supuestos".

Dependencias: numpy, scipy, pdfplumber, pillow, matplotlib.
"""
import argparse
import json
import os
import re
import warnings

import numpy as np
from scipy.signal import find_peaks, savgol_filter, welch


warnings.filterwarnings("ignore", category=RuntimeWarning)

PT_MM = 72 / 25.4
LEADS12 = ["I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6"]
LIMB = ["I", "II", "III", "aVR", "aVL", "aVF"]
PREC = ["V1", "V2", "V3", "V4", "V5", "V6"]
VEC = {"I": (1, 0), "II": (.5, np.sqrt(3) / 2), "III": (-.5, np.sqrt(3) / 2),
       "aVR": (-.75, -np.sqrt(3) / 4), "aVL": (.75, -np.sqrt(3) / 4), "aVF": (0, np.sqrt(3) / 2)}
PRESETS = {
    "3x4r": [["I", "aVR", "V1", "V4"], ["II", "aVL", "V2", "V5"], ["III", "aVF", "V3", "V6"], ["II"]],
    "3x4": [["I", "aVR", "V1", "V4"], ["II", "aVL", "V2", "V5"], ["III", "aVF", "V3", "V6"]],
    "6x2": [["I", "V1"], ["II", "V2"], ["III", "V3"], ["aVR", "V4"], ["aVL", "V5"], ["aVF", "V6"]],
    "12x1": [[k] for k in LEADS12],
}
STD_GRID = PRESETS["3x4"]


def parse_layout(s):
    if s is None or s == "auto":
        return None
    if s in PRESETS:
        return [list(r) for r in PRESETS[s]]
    filas = [[x.strip() for x in f.split(",")] for f in s.split("/")]
    for f in filas:
        for x in f:
            if x not in LEADS12:
                raise ValueError(f"Derivación desconocida en --layout: {x}")
    return filas


def layout_por_forma(nfil, ncol):
    tabla = {(4, 4): "3x4r", (3, 4): "3x4", (6, 2): "6x2", (12, 1): "12x1"}
    k = tabla.get((nfil, ncol))
    if k:
        return [list(r) for r in PRESETS[k]], f"distribución '{k}' deducida de la forma de la hoja ({nfil} filas x {ncol} columnas)"
    if nfil == 1:
        return [["II"]], "una sola fila: se asume derivación II"
    raise ValueError(f"No puedo deducir la distribución de {nfil} filas x {ncol} columnas; use --layout")


def construir_segmentos(layout, cols):
    """Segmentos (fila, columna, rango en ms, derivación). full = abarca todo el ancho (tira de ritmo o 12x1)."""
    ncol = len(cols) - 1
    segs = []
    for r, fila in enumerate(layout):
        if len(fila) == 1 and ncol > 1:
            segs.append(dict(row=r, col=None, lo=int(cols[0]), hi=int(cols[-1]), lead=fila[0], full=True))
        elif len(fila) == ncol:
            for c, k in enumerate(fila):
                segs.append(dict(row=r, col=c, lo=int(cols[c]), hi=int(cols[c + 1]), lead=k, full=(ncol == 1)))
        else:
            raise ValueError(f"La fila {r + 1} del layout tiene {len(fila)} derivaciones pero la hoja tiene {ncol} columnas")
    return segs


def leer_escala_texto(txt):
    v = re.search(r"(\d+(?:[.,]\d+)?)\s*mm\s*/\s*s(?:ec)?\b", txt or "", re.I)
    g = re.search(r"(\d+(?:[.,]\d+)?)\s*mm\s*/\s*mV", txt or "", re.I)
    cv = lambda m: float(m.group(1).replace(",", ".")) if m else None
    return cv(v), cv(g)


# ----------------------------------------------------------------------------------------------
# 1. EXTRACCIÓN: PDF VECTORIAL
# ----------------------------------------------------------------------------------------------
def _col(o):
    c = o.get("stroking_color")
    try:
        return tuple(round(float(v), 3) for v in c)
    except TypeError:
        return c


def extraer_vector(pg, layout_arg, vel, gan):
    sup = []
    txt = pg.extract_text() or ""
    tv, tg = leer_escala_texto(txt)
    if vel is None:
        vel = tv
    if gan is None:
        gan = tg
    if vel is None:
        vel = 25.0
        sup.append("Velocidad no encontrada en el PDF: se asumió 25 mm/s (use --vel).")
    if gan is None:
        gan = 10.0
        sup.append("Ganancia no encontrada en el PDF: se asumió 10 mm/mV (use --ganancia).")
    objs = list(pg.curves) + list(pg.lines)
    # color del trazo: el que acumula más puntos en objetos de >=5 puntos (la cuadrícula son líneas de 2 puntos)
    cnt = {}
    for o in objs:
        if len(o.get("pts", [])) >= 5:
            cnt[_col(o)] = cnt.get(_col(o), 0) + len(o["pts"])
    if not cnt:
        return None
    color = max(cnt, key=cnt.get)
    trace = [o for o in objs if _col(o) == color]

    # escala real de la hoja a partir de la cuadrícula (separación mínima de líneas horizontales largas)
    ys = sorted(set(round(o["top"], 2) for o in pg.lines
                    if _col(o) != color and abs(o["top"] - o["bottom"]) < .01 and (o["x1"] - o["x0"]) > 100))
    d = np.diff(ys)
    d = d[d > 0.5]
    pt_mm = PT_MM
    grid_mm = float("nan")
    if len(d) > 3:
        s = np.bincount(np.round(d * 100).astype(int)).argmax() / 100.0
        if 0.5 * PT_MM <= s <= 2 * PT_MM:
            pt_mm = s
            grid_mm = s / PT_MM
        else:
            sup.append(f"Separación de cuadrícula inesperada ({s:.2f} pt): se asumió escala real (1 mm = {PT_MM:.3f} pt).")
    else:
        sup.append("No se detectó cuadrícula vectorial: se asumió escala real de la hoja.")
    pt_ms = pt_mm * vel / 1000.0
    pt_mv = pt_mm * gan

    # cadenas continuas
    segs0 = [np.array([(float(a), float(b)) for a, b in o["pts"]]) for o in trace if len(o.get("pts", [])) >= 2]
    n = len(segs0)
    pred = {}
    for i in range(n):
        for j in range(n):
            if i != j and np.allclose(segs0[j][-1], segs0[i][0], atol=0.05):
                pred[i] = j
    succ = {v: k for k, v in pred.items()}
    cad = []
    for i in range(n):
        if i in pred:
            continue
        c = [i]
        while c[-1] in succ:
            c.append(succ[c[-1]])
        cad.append(np.vstack([segs0[i] for i in c]))
    cad = [a for a in cad if (a[:, 0].max() - a[:, 0].min()) >= 12 * pt_mm]       # descarta marcas pequeñas
    if not cad:
        return None
    # filas por agrupación de la mediana de y (separación > 8 mm)
    med = np.array([np.median(a[:, 1]) for a in cad])
    orden = np.argsort(med)
    grupos = [[orden[0]]]
    for i in orden[1:]:
        if med[i] - med[grupos[-1][-1]] > 8 * pt_mm:
            grupos.append([i])
        else:
            grupos[-1].append(i)
    nfil = len(grupos)
    x0 = min(a[:, 0].min() for a in cad)
    filas, ybase = [], []
    for g in grupos:
        L = sorted([cad[i] for i in g], key=lambda a: a[0, 0])
        a = np.vstack(L)
        yb = float(np.median(a[:, 1]))
        ybase.append(yb)
        filas.append((L, yb))

    sig, fs = [], []
    for L, yb in filas:
        a = np.vstack(L)
        t = np.maximum.accumulate((a[:, 0] - x0) / pt_ms)
        t = t + np.arange(len(t)) * 1e-6
        v = (yb - a[:, 1]) / pt_mv
        dt = np.diff(t)
        fs.append(1000.0 / np.median(dt[dt > 1e-3]))
        sig.append(np.interp(np.arange(0, int(t.max()), 1.0), t, v))
    largo = min(len(s) for s in sig)
    sig = np.vstack([s[:largo] for s in sig])

    # columnas: separadores gruesos verticales -> inicios de cadenas -> reparto igual
    layout = parse_layout(layout_arg)
    ncol_lay = max(len(f) for f in layout) if layout else None
    xmax = max(a[:, 0].max() for a in cad)
    seps = sorted(set(round(o["x0"], 1) for o in objs if abs(o["x1"] - o["x0"]) < .5 and o.get("linewidth", 0) >= 1.2
                      and 3 * pt_mm < (o["bottom"] - o["top"]) < 40 * pt_mm and x0 + 10 < o["x0"] < xmax - 10))
    cols = None
    fuente_col = ""
    if seps and (ncol_lay is None or len(seps) == ncol_lay - 1):
        cols = [0.0] + [(s - x0) / pt_ms for s in seps] + [float(largo)]
        fuente_col = "separadores de columna del PDF"
    if cols is None:
        inicios = sorted(set(round((L_[0, 0] - x0) / pt_ms / 100) * 100 for L, _ in filas for L_ in L if len(L) > 1))
        if len(L) > 1 and len(inicios) > 1 and (ncol_lay is None or len(inicios) == ncol_lay):
            cols = [0.0] + [float(i) for i in inicios[1:]] + [float(largo)]
            fuente_col = "inicios de los trazos"
    # rótulos
    words = [w for w in pg.extract_words() if w["text"] in LEADS12]
    if layout is None and words:
        ncol_g = (len(cols) - 1) if cols else None
        cols_pt = [x0 + c * pt_ms for c in cols] if cols else None
        etiq = [[] for _ in range(nfil)]
        for w in words:
            cand = [(yb - w["bottom"], r) for r, yb in enumerate(ybase) if yb - w["bottom"] > -5]
            if cand:
                etiq[min(cand)[1]].append((w["x0"], w["text"]))
        etiq = [sorted(e) for e in etiq]
        ncol_e = max(len(e) for e in etiq)
        if ncol_g is None:
            ncol_g = ncol_e
        if all(len(e) in (1, ncol_g) for e in etiq) and ncol_g >= 1 and all(len(e) > 0 for e in etiq):
            layout = [[t for _, t in e] for e in etiq]
            sup.append("Distribución leída de los rótulos de derivación del PDF.")
            if cols is None:
                cols = list(np.linspace(0, largo, ncol_g + 1))
                fuente_col = "reparto igual (sin separadores)"
    if cols is None:
        ncol = ncol_lay or (len(layout[0]) if layout else None)
        if ncol is None:
            ncol = 4 if nfil in (3, 4) else (2 if nfil == 6 else 1)
        cols = list(np.linspace(0, largo, ncol + 1))
        fuente_col = "reparto igual de la hoja (sin separadores)"
        sup.append(f"Columnas repartidas en {ncol} partes iguales.")
    ncol = len(cols) - 1
    if layout is None:
        layout, msg = layout_por_forma(nfil, ncol)
        sup.append(msg)
    if len(layout) != nfil:
        raise ValueError(f"El layout tiene {len(layout)} filas pero se detectaron {nfil} en el PDF")
    segs = construir_segmentos(layout, cols)
    return dict(sig=sig, cols=cols, layout=layout, segs=segs, ncol=ncol, vel=vel, gan=gan, fs_orig=float(np.median(fs)),
                supuestos=sup, control=dict(modo="PDF vectorial", grid_mm=grid_mm, color_trazo=str(color), filas=nfil,
                                            columnas=ncol, columnas_desde=fuente_col))


# ----------------------------------------------------------------------------------------------
# 2. EXTRACCIÓN: IMAGEN / PDF ESCANEADO
# ----------------------------------------------------------------------------------------------
def _periodo_cuadricula(grid, W):
    """Período de la cuadrícula (px por mm) por autocorrelación de las proyecciones, con refinamiento subpíxel."""
    acs = []
    for axis in (0, 1):
        pr = grid.mean(axis=axis).astype(float)
        pr -= pr.mean()
        n = len(pr)
        f = np.fft.rfft(pr, 2 * n)
        ac = np.fft.irfft(f * np.conj(f))[:n]
        acs.append(ac[:min(n, 1500)] / (ac[0] + 1e-12))
    m = min(len(a) for a in acs)
    ac = sum(a[:m] for a in acs) / 2
    sc = {}
    for L in range(4, min(200, m // 6)):
        sc[L] = np.mean([ac[int(round(k * L)) - 1:int(round(k * L)) + 2].max() for k in range(1, 6)])
    best = max(sc.values())
    L = next(l for l in sorted(sc) if sc[l] >= 0.65 * best and ac[l] >= ac[l - 1] and ac[l] >= ac[l + 1])
    per = float(L)
    ks, pks = [], []
    for k in range(1, max(3, min(40, (m - 1) // L - 1))):
        c = int(round(k * per))
        w = max(2, L // 4)
        if c + w >= m:
            break
        pk = int(np.argmax(ac[c - w:c + w + 1])) + c - w
        ks.append(k)
        pks.append(pk)
        if len(ks) >= 3:
            per = float(np.polyfit(ks, pks, 1)[0])
    opciones = [p for p in (per, per / 5.0) if 120 <= W / p <= 500]
    return opciones[0] if len(opciones) == 1 else None


def _seguir_traza(mask, yc):
    """Sigue el trazo columna a columna. 1) Viterbi sobre los tramos de tinta de cada columna: elige la cadena
    continua (así se ignoran textos o marcas sueltas). 2) En tramos largos (flancos empinados) toma el extremo
    en el sentido del movimiento, para conservar los picos."""
    H, W = mask.shape
    cols, xs = [], []
    for x in range(W):
        col = np.flatnonzero(mask[:, x])
        if len(col) == 0:
            continue
        br = np.flatnonzero(np.diff(col) > 1)
        cols.append((np.r_[col[0], col[br + 1]], np.r_[col[br], col[-1]]))
        xs.append(x)
    n = len(cols)
    ys = np.full(W, np.nan)
    if n == 0:
        return ys
    costo = np.zeros(len(cols[0][0]))
    back = []
    for i in range(1, n):
        s1, e1 = cols[i]
        s0, e0 = cols[i - 1]
        d = np.maximum(0, np.maximum(s1[:, None] - e0[None, :], s0[None, :] - e1[:, None]))
        tot = costo[None, :] + d
        k = np.argmin(tot, axis=1)
        costo = tot[np.arange(len(s1)), k]
        back.append(k)
    j = int(np.argmin(costo))
    elegido = [0] * n
    elegido[-1] = j
    for i in range(n - 1, 0, -1):
        j = int(back[i - 1][j])
        elegido[i - 1] = j
    prev = float(yc)
    dirn = 0
    for i in range(n):
        st, en = float(cols[i][0][elegido[i]]), float(cols[i][1][elegido[i]])
        c = 0.5 * (st + en)
        if en - st <= 3:
            y = c
        else:
            d = np.sign(c - prev) if abs(c - prev) >= 1 else dirn
            y = st if d < 0 else (en if d > 0 else c)
            dirn = d if d != 0 else dirn
        ys[xs[i]] = y
        prev = y
    return ys


def extraer_raster(img, layout_arg, px_mm, vel, gan, dpi=None, texto=None):
    sup = []
    tv, tg = leer_escala_texto(texto)
    vel = vel or tv
    gan = gan or tg
    if vel is None:
        vel = 25.0
        sup.append("Velocidad no indicada: se asumió 25 mm/s (use --vel).")
    if gan is None:
        gan = 10.0
        sup.append("Ganancia no indicada: se asumió 10 mm/mV (use --ganancia).")
    arr = np.asarray(img.convert("RGB")).astype(int)
    H, W, _ = arr.shape
    mx, mn = arr.max(2), arr.min(2)
    dark = mx < 130
    grid = ((mx - mn) > 25) & (mx > 140)
    if grid.sum() <= 0.002 * H * W:
        gray_grid = (mx >= 165) & (mx <= 238) & ((mx - mn) <= 25)
        if gray_grid.sum() > 0.005 * H * W:
            grid = gray_grid
    if px_mm is None:
        if grid.sum() > 0.002 * H * W:
            px_mm = _periodo_cuadricula(grid, W)
            if px_mm:
                sup.append(f"Escala estimada de la cuadrícula: {px_mm:.2f} px/mm.")
        if px_mm is None and dpi:
            px_mm = dpi / 25.4
            sup.append(f"Escala tomada del dpi de renderizado ({dpi} dpi).")
        if px_mm is None:
            raise ValueError("No pude estimar la escala de la imagen; indique --px_mm (píxeles por mm).")
    px_ms = px_mm * vel / 1000.0
    px_mv = px_mm * gan
    # región del registro
    if grid.sum() > 0.002 * H * W:
        yy = np.flatnonzero(grid.mean(1) > 0.02)
        xx = np.flatnonzero(grid.mean(0) > 0.02)
        y0, y1, xa, xb = (yy.min(), yy.max(), xx.min(), xx.max()) if (len(yy) and len(xx)) else (0, H - 1, 0, W - 1)
    else:
        y0, y1, xa, xb = 0, H - 1, 0, W - 1
    layout = parse_layout(layout_arg)
    ext_px = int(25 * px_mm)                                   # los picos pueden salir de la cuadrícula
    Y0, Y1 = max(0, y0 - ext_px), min(H - 1, y1 + ext_px)
    sub = dark[Y0:Y1 + 1, xa:xb + 1]
    ycoord = np.nonzero(sub[y0 - Y0:y1 - Y0 + 1])[0] + (y0 - Y0)
    nfil = len(layout) if layout else None
    from scipy.ndimage import binary_dilation, binary_erosion
    region = sub[y0 - Y0:y1 - Y0 + 1]
    region_dil = binary_dilation(region, structure=np.ones((3, 1)))
    largos = binary_erosion(region_dil, structure=np.ones((1, max(3, int(3 * px_mm)))))      # tramos planos = líneas base
    kw = max(3, int(3 * px_mm))
    prof = np.convolve(largos.sum(1).astype(float), np.ones(kw) / kw, "same")
    if float(prof.max()) <= 0:
        prof = np.convolve(region.sum(1).astype(float), np.ones(kw) / kw, "same")
    if nfil is None:
        pk, _ = find_peaks(prof, distance=max(3, int(12 * px_mm)), prominence=0.15 * max(1e-9, float(prof.max())))
        if len(pk) < 3:
            pk, _ = find_peaks(prof, distance=max(3, int(10 * px_mm)), prominence=0.05 * max(1e-9, float(prof.max())))
        nfil = int(len(pk)) if len(pk) >= 3 else 4
    sep_min = max(3, int(0.5 * (y1 - y0 + 1) / max(1, nfil)))
    pk, pr_ = find_peaks(prof, distance=sep_min, prominence=0.02 * max(1e-9, float(prof.max())))
    if len(pk) >= nfil:
        top = np.sort(pk[np.argsort(pr_["prominences"])[::-1][:nfil]])
        cen = (y0 - Y0) + top.astype(float)                                              # línea base de cada fila
    else:
        cen = np.array([(y0 - Y0) + (i + .5) * (y1 - y0 + 1) / nfil for i in range(nfil)])
        ycoord = np.nonzero(region)[0] + (y0 - Y0)
        for _ in range(25):
            asg = np.argmin(np.abs(ycoord[:, None] - cen[None, :]), 1)
            cen = np.array([ycoord[asg == i].mean() if np.any(asg == i) else cen[i] for i in range(nfil)])
    bordes = [0] + [int((cen[i] + cen[i + 1]) / 2) for i in range(nfil - 1)] + [sub.shape[0]]
    if nfil > 1:
        # v3.1 (CardioEKG): las filas exteriores no se extienden más de 0,75 pasos de fila; así el texto del pie de hoja
        # (velocidad, ganancia, filtros) no compite con el trazo en el seguimiento (Viterbi).
        paso_fila = float(np.median(np.diff(cen)))
        bordes[0] = max(0, int(cen[0] - 0.75 * paso_fila))
        bordes[-1] = min(sub.shape[0], int(cen[-1] + 0.75 * paso_fila))
    sig = []
    for i in range(nfil):
        ys = _seguir_traza(sub[bordes[i]:bordes[i + 1]], cen[i] - bordes[i])
        ok = ~np.isnan(ys)
        if ok.sum() < 50:
            raise ValueError("No se pudo seguir el trazo en una de las filas; revise la imagen o el --layout")
        ys = np.interp(np.arange(len(ys)), np.flatnonzero(ok), ys[ok])
        v = (np.median(ys) - ys) / px_mv
        sig.append(v)
    # recorte inicial: pulso de calibración (subida y bajada de ~1 mV separadas >=4 mm en los primeros 12 mm)
    ini = 0
    v0 = sig[0]
    ventana = int(12 * px_mm)
    dv = np.diff(v0[:ventana])
    up = np.flatnonzero(dv > 0.6 * 10 / gan)
    dn = np.flatnonzero(dv < -0.6 * 10 / gan)
    if len(up) and len(dn) and dn.max() - up.min() > 3.5 * px_mm:
        ini = int(dn.max()) + 3 + int(2 * px_mm)
        sup.append("Se recortó el pulso de calibración inicial.")
    # a 1 kHz
    t_px = (np.arange(len(sig[0])) - ini) / px_ms
    out = []
    for v in sig:
        m = np.arange(len(v)) >= ini
        out.append(np.interp(np.arange(0, t_px.max(), 1.0), t_px[m], v[m]))
    largo = min(len(s) for s in out)
    sig = np.vstack([s[:largo] for s in out])
    ncol_lay = max(len(f) for f in layout) if layout else None
    if layout is None:
        ncol = 4 if nfil in (3, 4) else (2 if nfil == 6 else 1)
        layout, msg = layout_por_forma(nfil, ncol)
        sup.append(msg)
        ncol_lay = ncol
    cols = list(np.linspace(0, largo, ncol_lay + 1))
    if ncol_lay > 1:
        sup.append(f"Columnas repartidas en {ncol_lay} partes iguales (sin separadores detectables en imagen).")
    segs = construir_segmentos(layout, cols)
    return dict(sig=sig, cols=cols, layout=layout, segs=segs, ncol=ncol_lay, vel=vel, gan=gan, fs_orig=float(px_mm * vel),
                supuestos=sup, control=dict(modo="imagen", px_mm=float(px_mm), filas=nfil, columnas=ncol_lay,
                                            grid_mm=float("nan")))


def extraer(ruta, layout=None, px_mm=None, vel=None, gan=None, pagina=0, forzar_raster=False):
    from PIL import Image
    if ruta.lower().endswith(".pdf"):
        import pdfplumber
        pdf = pdfplumber.open(ruta)
        pg = pdf.pages[pagina]
        if not forzar_raster:
            r = extraer_vector(pg, layout, vel, gan)
            if r:
                return r
        img = pg.to_image(resolution=300).original
        return extraer_raster(img, layout, px_mm, vel, gan, dpi=300, texto=pg.extract_text())
    return extraer_raster(Image.open(ruta), layout, px_mm, vel, gan)


# ----------------------------------------------------------------------------------------------
# UTILIDADES DE SEÑAL
# ----------------------------------------------------------------------------------------------
def sg(x, w, p=2):
    w = int(w) | 1
    if w <= p:
        return x
    return savgol_filter(x, w, p, mode="interp")


def rellenar(x):
    x = np.array(x, float)
    bad = np.isnan(x)
    if bad.all():
        return x
    if bad.any():
        x[bad] = np.interp(np.flatnonzero(bad), np.flatnonzero(~bad), x[~bad])
    return x



# ----------------------------------------------------------------------------------------------
# 3. DETECCIÓN DE LATIDOS Y LATIDO PROMEDIO
# ----------------------------------------------------------------------------------------------
def detectar_R_multi(xs, lo, hi):
    """Detecta latidos con la energía de pendiente sumada de varias derivaciones simultáneas.
    El instante de referencia es el pico de la derivación con mayor excursión (igual para todas)."""
    etot = 0
    slopes_list = []
    for x in xs:
        seg = x[lo:hi]
        d = np.gradient(sg(seg, 9))
        slopes_list.append(np.abs(d))
        e = np.convolve(d ** 2, np.ones(30) / 30, "same")
        etot = etot + e                                  # mismo mV en todas: las derivaciones de QRS grande dominan
    pk_ref = float(np.percentile(etot, 99.2)) if len(etot) >= 500 else float(etot.max())
    pk, _ = find_peaks(etot, height=max(0.1 * pk_ref, 0.015 * float(etot.max())), distance=250)
    if len(pk) == 0:
        return np.array([], int)
    alt = etot[pk]
    pk = pk[alt >= 0.3 * np.median(alt)]
    out = []
    for p in pk:
        a, b = max(0, p - 50), min(hi - lo, p + 50)
        mejor = max(xs, key=lambda x: np.ptp(x[lo + a:lo + b]))
        if p >= 300:
            base = np.median(mejor[lo + p - 300:lo + p - 200])
        else:
            base = np.median(mejor[lo + p + 200:lo + p + 300])
        out.append(lo + a + int(np.argmax(np.abs(mejor[lo + a:lo + b] - base))))
    margin = 45 if (hi - lo) <= 3500 else 100
    out = sorted({r for r in out if lo + margin < r < hi - margin})
    # Suprimir ondas T picudas o tipo lápida contadas como segundo QRS (hiperpotasemia o STEMI gigante)
    if len(out) >= 2:
        def local_slope(r):
            a, b = max(0, r - lo - 45), min(hi - lo, r - lo + 45)
            return max(float(sd[a:b].max()) for sd in slopes_list) if b > a else 0.0
        keep = [True] * len(out)
        if len(out) >= 3:
            dt0, dt1 = out[1] - out[0], out[2] - out[1]
            s1_ref = max(1e-9, local_slope(out[1]))
            if 260 <= dt0 <= 780 and 180 <= dt1 <= 320 and local_slope(out[0]) < 0.50 * s1_ref and local_slope(out[2]) < 0.50 * s1_ref:
                keep[0] = False
        for i in range(1, len(out)):
            if not keep[i - 1]:
                continue
            dt = out[i] - out[i - 1]
            prev_idx = next((j for j in range(i - 2, -1, -1) if keep[j]), None)
            prev_dt = out[i - 1] - out[prev_idx] if prev_idx is not None else None
            next_dt = out[i + 1] - out[i] if i + 1 < len(out) else None
            short_long = (next_dt is not None and next_dt > 1.35 * dt and dt + next_dt >= 550) or (
                prev_dt is not None and prev_dt > 1.35 * dt and dt + prev_dt >= 550)
            ratio_thr = 0.62 if (dt >= 260 and ((next_dt is not None and dt + next_dt >= 800) or (prev_dt is not None and dt + prev_dt >= 800) or (len(out) == 2))) else 0.50
            if 180 <= dt <= 460 and (short_long or (len(out) == 2 and (hi - lo) <= 3500)):
                if local_slope(out[i]) < ratio_thr * max(1e-9, local_slope(out[i - 1])):
                    keep[i] = False
        out = [r for r, k in zip(out, keep) if k]
    return np.array(out, int)


def latidos_derivacion(fila, R, lo, hi, pre, post, bw):
    mats = []
    for r in R:
        if r - 60 < lo or r + 120 > hi:
            continue
        idx = np.arange(r - pre, r + post)
        seg = np.full(pre + post, np.nan)
        ok = (idx >= lo) & (idx < hi) & (idx >= 0) & (idx < len(fila))
        seg[ok] = fila[idx[ok]]
        b = seg[pre + bw[0]:pre + bw[1]]
        if np.isnan(b).mean() > 0.5:
            continue
        mats.append(seg - np.nanmedian(b))
    return np.array(mats)


def latidos_promedio(ext, R_de, pre, post, bw):
    """Mediana de los latidos de cada derivación, con enmascarado por segmento (se aprovechan latidos parciales).
    Si una derivación tiene tira de ritmo, se usa solo esa (más latidos, sin duplicar)."""
    sig, segs = ext["sig"], ext["segs"]
    por_lead = {}
    for s in segs:
        por_lead.setdefault(s["lead"], []).append(s)
    B, N, CNT, MM = {}, {}, {}, {}
    for k, L in por_lead.items():
        rit = [s for s in L if s["full"] and ext["ncol"] > 1]
        mats = []
        for s in (rit if rit else L):
            M = latidos_derivacion(sig[s["row"]], R_de(s), s["lo"] + 12, s["hi"] - 12, pre, post, bw)
            if len(M):
                mats.append(M)
        if not mats:
            continue
        M = np.vstack(mats)
        B[k] = np.nanmedian(M, axis=0)
        CNT[k] = np.sum(~np.isnan(M), axis=0)
        N[k] = len(M)
        MM[k] = M
    return B, N, CNT, MM





# ----------------------------------------------------------------------------------------------
# 4. FIDUCIALES
# ----------------------------------------------------------------------------------------------
class Ctx:
    def __init__(self, pre, post):
        self.pre, self.post = pre, post

    def ix(self, ms):
        return int(round(ms)) + self.pre

    def ms(self, i):
        return i - self.pre


def onda_P(x, cx, noise, lim_ini=-215, lim_fin=-95):
    """x: señal suavizada relativa a TP. Devuelve (onset, offset, pico, amp) en índices o None."""
    a0, a1 = cx.ix(lim_ini), cx.ix(lim_fin)
    seg = x[a0:a1]
    j = int(np.argmax(np.abs(seg)))
    amp = seg[j]
    if abs(amp) < max(0.04, 4 * noise):
        return None
    s = np.sign(amp)
    pk = a0 + j
    a = pk
    while a > cx.ix(-270) and s * x[a] > max(0.08 * abs(amp), 3 * noise):
        a -= 1
    b = pk
    while b < cx.ix(-50) and s * x[b] > max(0.08 * abs(amp), 3 * noise):
        b += 1
    if b >= cx.ix(-50):                                      # no regresó a la base: mínimo antes del QRS
        b = pk + int(np.argmin(s * x[pk:cx.ix(-50)]))
    return a, b, pk, float(amp)


def inicio_qrs(x, level, thr, ipk, i_min):
    dev = np.abs(x - level)
    i = ipk
    run = 0
    while i > i_min:
        if dev[i] < thr:
            run += 1
            if run >= 4:
                return i + 4
        else:
            run = 0
        i -= 1
    return i_min


def punto_quiebre(x, a, b):
    """Mejor ajuste de dos rectas, usando sumas acumuladas equivalentes a mínimos cuadrados."""
    if b - a < 12:
        return None
    ys = np.asarray(x[a:b + 1], dtype=float)
    xx = np.arange(len(ys), dtype=float)
    def prefix(values):
        return np.concatenate(([0.0], np.cumsum(values)))
    sx, sy, sxx, sxy, syy = (prefix(z) for z in (xx, ys, xx*xx, xx*ys, ys*ys))
    def fit(lo, hi):
        n = hi - lo
        ax, ay = sx[hi] - sx[lo], sy[hi] - sy[lo]
        denom = (sxx[hi] - sxx[lo]) - ax*ax/n
        cov = (sxy[hi] - sxy[lo]) - ax*ay/n
        slope = cov / denom
        error = np.maximum(0, (syy[hi] - syy[lo]) - ay*ay/n - cov*cov/denom)
        return error, slope
    boundaries = np.arange(8, b-a-3)
    if not len(boundaries):
        return None
    e1, p1 = fit(0, boundaries)
    e2, p2 = fit(boundaries, len(ys))
    best = int(np.argmin(e1+e2))
    return int(a + boundaries[best]), float(p1[best]), float(p2[best])


def fin_T(x, level, J, cx, rrm_ms=None):
    """Delimita T_onset, T_peak y T_end fusionando tangente y radio mínimo de curvatura (Singh & Gupta 2009)."""
    hi_cap = len(x) - 55
    if rrm_ms is not None and np.isfinite(rrm_ms) and rrm_ms < 620:
        hi_cap = min(hi_cap, cx.ix(max(cx.ms(J) + 95, float(rrm_ms) - 65)))
    i0, i1 = J + 40, min(J + 560, hi_cap)
    if i1 <= i0 + 20:
        return dict(amp=0.0, onset=float("nan"), pico=i0, tangente=float("nan"), tangente_pura=float("nan"), curvatura=float("nan"), umbral=float("nan"), base_post=float(level))
    seg = x[i0:i1] - level
    j = int(np.argmax(np.abs(seg)))
    amp = float(seg[j])
    s = np.sign(amp) if amp != 0 else 1.0
    ip = i0 + j
    xs = s * (x - level)
    d = np.gradient(xs)
    d2 = np.gradient(d)

    # T_onset: máximo de curvatura positiva (despegue desde el segmento ST hacia el pico T)
    on_lo, on_hi = max(J + 20, ip - 140), max(J + 30, ip - 12)
    t_onset = float("nan")
    if on_hi > on_lo + 4:
        kappa_on = d2[on_lo:on_hi] / np.power(1.0 + d[on_lo:on_hi] ** 2, 1.5)
        t_onset = float(on_lo + int(np.argmax(kappa_on)))

    # T_end por tangente de máxima pendiente descendente
    end_cap = len(xs) - 1 if hi_cap == len(x) - 55 else min(len(xs) - 1, hi_cap + 25)
    jj = ip + int(np.argmin(d[ip:max(ip + 2, min(ip + 135, end_cap - 10))]))
    bl_lo, bl_hi = min(jj + 50, max(jj + 5, end_cap - 15)), min(jj + 110, end_cap)
    bl = float(np.median(xs[bl_lo:bl_hi])) if bl_hi > bl_lo else 0.0
    t_tan = jj + (bl - xs[jj]) / d[jj] if d[jj] < -1e-4 else float("nan")

    # T_end por radio mínimo de curvatura (máxima curvatura convexa tras el punto de inflexión)
    curv_lo, curv_hi = jj, min(ip + 190, end_cap)
    t_curv = float("nan")
    if curv_hi > curv_lo + 5:
        kappa_end = d2[curv_lo:curv_hi] / np.power(1.0 + d[curv_lo:curv_hi] ** 2, 1.5)
        t_curv = float(curv_lo + int(np.argmax(kappa_end)))

    # Fusión tangente + curvatura para reducir el sesgo de cola asintótica
    if np.isfinite(t_tan) and np.isfinite(t_curv) and 0 <= t_curv - t_tan <= 45:
        te = 0.55 * t_tan + 0.45 * t_curv
    elif np.isfinite(t_tan):
        te = t_tan
    else:
        te = t_curv

    # por umbral: primer punto tras el pico donde la señal baja a bl + 10% de la amplitud
    thr = bl + 0.1 * max(0.0, abs(amp) - bl)
    k = ip
    while k < end_cap and xs[k] > thr:
        k += 1
    return dict(amp=amp, onset=t_onset, pico=ip, tangente=float(te), tangente_pura=float(t_tan), curvatura=float(t_curv), umbral=float(k), base_post=float(s * bl + level))


def _residuo_auricular(sig_1khz, r_peaks, mask_qrs=False):
    """Sustrae la plantilla mediana QRST alineada a cada R para aislar la actividad auricular continua."""
    if len(r_peaks) < 3 or len(sig_1khz) < 512:
        return None
    rr = np.diff(r_peaks)
    if not len(rr):
        return None
    rrm = float(np.median(rr))
    pre_w = 50
    post_w = int(min(500, 0.62 * rrm))
    beats = []
    for r in r_peaks:
        if r - pre_w >= 0 and r + post_w <= len(sig_1khz):
            base = float(np.median(sig_1khz[r - pre_w:r - pre_w + 15]))
            beats.append(sig_1khz[r - pre_w:r + post_w] - base)
    if len(beats) < 2:
        return None
    med = np.median(beats, axis=0)
    med = med - float(np.median(med[:15]))
    resid = np.asarray(sig_1khz, dtype=float).copy()
    for r in r_peaks:
        a, b = max(0, int(r) - pre_w), min(len(resid), int(r) + post_w)
        ma, mb = a - (int(r) - pre_w), b - (int(r) - pre_w)
        resid[a:b] -= med[ma:mb]
        if mask_qrs:
            q0, q1 = max(1, int(r) - 35), min(len(resid) - 2, int(r) + 45)
            if q1 > q0:
                resid[q0:q1] = np.linspace(resid[q0 - 1], resid[q1 + 1], q1 - q0)
    return resid - float(np.median(resid))


def detectar_actividad_auricular_diastolica(sig_1khz, r_peaks, qrs_on_ms, t_end_ms):
    """Analiza el residuo continuo sin QRST en busca de ondas F de flutter (3.8-5.8 Hz)."""
    if len(r_peaks) < 4 or not np.isfinite(t_end_ms) or not np.isfinite(qrs_on_ms):
        return dict(flutter_suspected=False, atrial_rate_bpm=None, spectral_purity=None)
    resid = _residuo_auricular(sig_1khz, r_peaks, mask_qrs=False)
    if resid is None or len(resid) < 512:
        return dict(flutter_suspected=False, atrial_rate_bpm=None, spectral_purity=None)
    freqs, psd = welch(resid, fs=1000.0, nperseg=min(4096, len(resid)))
    mask_band = (freqs >= 3.6) & (freqs <= 6.2)
    mask_total = (freqs >= 1.0) & (freqs <= 15.0)
    tot = float(np.sum(psd[mask_total]))
    if not np.any(mask_band) or tot <= 1e-9:
        return dict(flutter_suspected=False, atrial_rate_bpm=None, spectral_purity=None)
    band_psd = psd[mask_band]
    idx_pk = int(np.argmax(band_psd))
    f_dom = float(freqs[mask_band][idx_pk])
    # Con ventana larga (nperseg=4096, df~0.24 Hz), sumar el lóbulo principal (±1 bin)
    lo_b, hi_b = max(0, idx_pk - 1), min(len(band_psd), idx_pk + 2)
    purity = float(np.sum(band_psd[lo_b:hi_b]) / tot)
    amp_rms = float(np.sqrt(np.mean(resid ** 2)))
    flutter = bool(3.8 <= f_dom <= 5.8 and purity >= 0.34 and amp_rms >= 0.025)
    # En flutter 2:1 rápido (p. ej. 150-165 lpm), la onda F queda en fase con cada QRST y es parcialmente restada por la mediana; evaluar también señal con máscara solo de QRS.
    if not flutter and len(r_peaks) >= 8 and len(sig_1khz) >= 2048:
        q_masked = np.asarray(sig_1khz, dtype=float).copy()
        for rp in r_peaks:
            q0, q1 = max(1, int(rp) - 38), min(len(q_masked) - 2, int(rp) + 55)
            if q1 > q0:
                q_masked[q0:q1] = np.linspace(q_masked[q0 - 1], q_masked[q1 + 1], q1 - q0)
        q_masked -= float(np.median(q_masked))
        fq, pq = welch(q_masked, fs=1000.0, nperseg=min(4096, len(q_masked)))
        mb = (fq >= 3.8) & (fq <= 5.75)
        mv = (fq >= 1.5) & (fq <= 3.5)
        mt = (fq >= 1.0) & (fq <= 15.0)
        tot_q = float(np.sum(pq[mt]))
        if np.any(mb) and np.any(mv) and tot_q > 1e-9:
            bp = pq[mb]
            ip = int(np.argmax(bp))
            fd_q = float(fq[mb][ip])
            e_fl = float(np.sum(bp[max(0, ip - 1):min(len(bp), ip + 2)]))
            vp = pq[mv]
            ivp = int(np.argmax(vp))
            e_v = float(np.sum(vp[max(0, ivp - 1):min(len(vp), ivp + 2)]))
            pur_q = float(e_fl / tot_q)
            rms_q = float(np.sqrt(np.mean(q_masked ** 2)))
            if 3.8 <= fd_q <= 5.75 and pur_q >= 0.45 and rms_q >= 0.03 and e_fl >= 2.0 * max(1e-9, e_v):
                flutter, f_dom, purity = True, fd_q, pur_q
    return dict(flutter_suspected=flutter, atrial_rate_bpm=round(f_dom * 60.0, 1) if flutter else None, spectral_purity=round(purity, 3))


def detectar_ondas_p_diastolicas(sig_1khz, r_peaks):
    """Cuenta ondas P (incluidas P bloqueadas) tras sustraer QRST en ritmos con RR suficiente."""
    if len(r_peaks) < 3 or len(sig_1khz) < 2000:
        return dict(p_count=0, r_count=int(len(r_peaks)), p_qrs_ratio=None, p_rate_bpm=None, av_pr_variable=None)
    rr = np.diff(r_peaks)
    if len(rr) == 0 or float(np.median(rr)) < 680.0:
        return dict(p_count=0, r_count=int(len(r_peaks)), p_qrs_ratio=None, p_rate_bpm=None, av_pr_variable=None)
    resid = _residuo_auricular(sig_1khz, r_peaks, mask_qrs=True)
    if resid is None:
        return dict(p_count=0, r_count=int(len(r_peaks)), p_qrs_ratio=None, p_rate_bpm=None, av_pr_variable=None)
    s = sg(resid, 25)
    noise = float(np.std(resid - sg(resid, 21)))
    thr = max(0.035, 3.0 * noise)
    pks, _ = find_peaks(s, distance=380, height=thr, prominence=max(0.03, 2.5 * noise))
    if len(pks) < 3:
        return dict(p_count=int(len(pks)), r_count=int(len(r_peaks)), p_qrs_ratio=None, p_rate_bpm=None, av_pr_variable=None)
    pp = np.diff(pks).astype(float)
    pp_valid = pp[(pp >= 400) & (pp <= 1500)]
    p_rate = float(60000.0 / np.median(pp_valid)) if len(pp_valid) >= 2 else None
    ratio = round(float(len(pks) / len(r_peaks)), 2) if len(r_peaks) >= 3 else None
    max_pr = min(470, int(0.42 * float(np.median(rr))))
    prs = []
    for r in r_peaks:
        cand = [int(r - p) for p in pks if 80 <= r - p <= max_pr]
        if cand:
            prs.append(min(cand))
    av_pr_var = bool(max(prs) - min(prs) >= 45) if len(prs) >= 3 else None
    return dict(p_count=int(len(pks)), r_count=int(len(r_peaks)), p_qrs_ratio=ratio,
                p_rate_bpm=round(p_rate, 1) if p_rate is not None else None, av_pr_variable=av_pr_var)


def analizar_dinamica_latido_a_latido(pl, rr_ms):
    """Extrae variabilidad de PR (Wenckebach), agrupamiento de latidos, alternancia eléctrica del QRS y ectopias (PAC/PVC)."""
    prs = [b["PR"] for b in pl if b.get("PR") is not None and np.isfinite(b["PR"])]
    r_amps = [b["R_mm"] for b in pl if b.get("R_mm") is not None and np.isfinite(b["R_mm"])]
    qrs_durs = [b["QRS"] for b in pl if b.get("QRS") is not None and np.isfinite(b["QRS"])]

    pr_variable = None
    wenckebach = False
    if len(prs) >= 3:
        pr_range = float(max(prs) - min(prs))
        pr_variable = bool(pr_range >= 30.0)
        diffs = np.diff(prs)
        wenckebach = bool(np.sum(diffs >= 15.0) >= 2 and pr_range >= 35.0)

    grouped_beating = None
    if len(rr_ms) >= 4:
        rr_arr = np.asarray(rr_ms, dtype=float)
        rr_med = float(np.median(rr_arr))
        big_jumps = int(np.sum(np.abs(np.diff(rr_arr)) >= 0.14 * max(rr_med, 1.0)))
        cv_rr = float(rr_arr.std(ddof=1) / max(rr_arr.mean(), 1.0))
        grouped_beating = bool(cv_rr >= 0.10 and big_jumps >= max(2, len(rr_arr) - 2))

    qrs_alternans = None
    if len(r_amps) >= 6:
        d_amp = np.diff(r_amps)
        sign_flips = int(np.sum(d_amp[:-1] * d_amp[1:] < 0))
        med_r = float(np.median(np.abs(r_amps)))
        qrs_alternans = bool(sign_flips >= len(d_amp) - 1 and float(np.median(np.abs(d_amp))) >= max(1.5, 0.15 * med_r))

    pvc_count, pac_count = 0, 0
    if len(rr_ms) >= 3 and len(qrs_durs) >= len(rr_ms) + 1:
        rr_med = float(np.median(rr_ms))
        qrs_med = float(np.median(qrs_durs))
        for idx, rr_val in enumerate(rr_ms):
            if rr_val < 0.82 * rr_med:
                if qrs_durs[idx + 1] >= max(120.0, qrs_med + 25.0):
                    pvc_count += 1
                else:
                    pac_count += 1
    return dict(pr_variable=pr_variable, wenckebach_suspected=wenckebach, grouped_beating=grouped_beating,
                qrs_alternans=qrs_alternans, pvc_count=pvc_count, pac_count=pac_count)


def morfologia(x, level, on, j, prom=None):
    seg = sg(x, 5)[on:j + 1] - level
    if prom is None:
        prom = max(0.04, 0.10 * float(np.ptp(seg)))          # ignora muescas <10 % del QRS
    pp, _ = find_peaks(seg, prominence=prom)
    pn, _ = find_peaks(-seg, prominence=prom)
    ev = sorted([(int(i), "+", float(seg[i])) for i in pp] + [(int(i), "-", float(seg[i])) for i in pn])
    if not ev:
        return "?", {}
    mx = max(abs(a) for _, _, a in ev)
    letras, nR = [], 0
    for _, s, a in ev:
        up = abs(a) >= 0.5 * mx
        if s == "+":
            nR += 1
            l = ("R" if up else "r") + ("'" if nR > 1 else "")
        else:
            l = ("S" if up else "s") if nR > 0 else ("Q" if up else "q")
        letras.append(l)
    txt = "".join(letras)
    if txt in ("Q", "q"):
        txt = "QS"
    R = max([a for _, s, a in ev if s == "+"], default=0.0)
    q = [a for i, s, a in ev if s == "-" and nR == 0 or (s == "-" and i < next((i2 for i2, s2, _ in ev if s2 == "+"), 1e9))]
    S = min([a for i, s, a in ev if s == "-" and i > next((i2 for i2, s2, _ in ev if s2 == "+"), 1e9)], default=0.0)
    Q = min(q, default=0.0)
    return txt, dict(R=R, S=S, Q=Q)


def eje_ls(areas):
    ks = [k for k in LIMB if k in areas and np.isfinite(areas[k])]
    A = np.array([VEC[k] for k in ks])
    y = np.array([areas[k] for k in ks])
    sol, *_ = np.linalg.lstsq(A, y, rcond=None)
    pred = A @ sol
    ss = ((y - y.mean()) ** 2).sum()
    r2 = 1 - ((y - pred) ** 2).sum() / ss if ss > 0 else float("nan")
    return float(np.degrees(np.arctan2(sol[1], sol[0]))), float(np.hypot(*sol)), float(r2)


def ang_dif(a, b):
    d = abs(a - b) % 360
    return 360 - d if d > 180 else d



def analizar(ext, sexo=None):
    sig = ext["sig"]
    segs = ext["segs"]
    N_ms = sig.shape[1]
    # ---- latidos: tira de ritmo / derivaciones de ancho completo, o por columna ------------
    completos = [s for s in segs if s["full"]]
    Rg_full = detectar_R_multi([sig[r] for r in sorted({s["row"] for s in completos})], 0, N_ms) if completos else np.array([], int)
    col_segs = [s for s in segs if not s["full"] and s.get("col") is not None]
    if completos and (len(Rg_full) >= 2 or not col_segs):
        Rg = Rg_full
        grupos = [Rg]
        R_de = lambda s: Rg[(Rg >= s["lo"]) & (Rg < s["hi"])]
    else:
        Rc = {}
        for c in sorted({s["col"] for s in col_segs}):
            ss = [s for s in col_segs if s["col"] == c]
            Rc[c] = detectar_R_multi([sig[s["row"]] for s in ss], ss[0]["lo"], ss[0]["hi"])
        grupos = list(Rc.values())
        R_de = lambda s: Rc[s["col"]] if s.get("col") in Rc else Rg_full
    rrs = [np.diff(g) for g in grupos if len(g) > 1]
    Rall = np.concatenate([g for g in grupos if len(g)]) if any(len(g) for g in grupos) else np.array([], int)
    if not rrs:
        rr_hint = ext.get("rr_hint_ms")
        if N_ms <= 3500 and len(Rall) >= 1 and rr_hint is not None and np.isfinite(rr_hint) and float(rr_hint) > 250:
            rr = np.array([float(rr_hint)], dtype=float)
        else:
            raise ValueError("No se detectaron al menos 2 latidos consecutivos")
    else:
        rr = np.concatenate(rrs).astype(float)
    RRm = float(np.median(rr))
    pre = int(max(300, min(420, 0.42 * RRm)))
    post = int(max(480, min(650, 0.63 * RRm)))
    bw = (-250, -190)
    cx = Ctx(pre, post)
    ix = cx.ix
    avisos = list(ext.get("supuestos", []))
    if RRm < 750:
        avisos.append("Frecuencia alta (RR < 750 ms): la ventana de base (TP) puede incluir la P del latido siguiente; "
                      "las mediciones de P, PR y ST son menos fiables.")
    if len(rr) < 4:
        avisos.append("Pocos intervalos RR (<4): la variabilidad del RR no es interpretable.")
    # derivación de referencia para la medición latido a latido
    cands = [s for s in segs if s["lead"] == "II"]
    cands_full = [s for s in cands if s["full"]]
    if cands_full:
        refsegs = cands_full[:1]
    elif cands:
        refsegs = cands
    else:
        refsegs = [max(segs, key=lambda s: np.ptp(sig[s["row"]][s["lo"]:s["hi"]]))]
    lead_ref = refsegs[0]["lead"]

    B, N, CNT, MM = latidos_promedio(ext, R_de, pre, post, bw)
    if not B:
        raise ValueError("No se detectaron al menos 2 latidos consecutivos")
    if len(B) < 6:
        avisos.append(f"Solo {len(B)} derivaciones medibles; los ejes y los criterios de voltaje pueden quedar incompletos.")
    MR = MM.get("II", next(iter(MM.values())))
    Bf = {k: rellenar(v) for k, v in B.items()}
    Bs = {k: sg(v, 9) for k, v in Bf.items()}                # suavizado ligero (~9 ms)
    B15 = {k: sg(v, 15) for k, v in Bf.items()}

    # ---- ritmo / variabilidad ------------------------------------------------------------
    d_rr = np.diff(rr)
    rr_de = float(rr.std(ddof=1)) if len(rr) > 1 else float("nan")
    rr_cv = float(100 * rr_de / rr.mean()) if (len(rr) > 1 and rr.mean() > 0) else float("nan")
    ritmo_res = dict(
        n_latidos=int(len(Rall)), RR_ms=rr.tolist(), RR_medio=float(rr.mean()), RR_DE=rr_de,
        RR_min=float(rr.min()), RR_max=float(rr.max()), FC_media=float(60000 / rr.mean()),
        FC_min=float(60000 / rr.max()), FC_max=float(60000 / rr.min()),
        SDNN=rr_de, RMSSD=float(np.sqrt(np.mean(d_rr ** 2))) if len(d_rr) else None,
        pNN50=float(100 * np.mean(np.abs(d_rr) > 50)) if len(d_rr) else None,
        variacion_max_min_ms=float(rr.max() - rr.min()), CV_pct=rr_cv)

    # ---- ruido por derivación ------------------------------------------------------------
    ruido = {}
    for k in LEADS12:
        if k in Bf:
            seg = Bf[k][ix(bw[0]):ix(bw[1])]
            ruido[k] = float(np.std(seg - sg(seg, 21)))
    r_glob = float(np.median(list(ruido.values())))

    # ---- onda P (mediana entre derivaciones con P medible) -------------------------------
    P = {}
    for k in LEADS12:
        if k in B15:
            r = onda_P(B15[k], cx, ruido.get(k, r_glob))
            if r:
                P[k] = r
    p_on = float(np.median([cx.ms(v[0]) for v in P.values()])) if len(P) >= 1 else float("nan")
    p_off = float(np.median([cx.ms(v[1]) for v in P.values()])) if len(P) >= 1 else float("nan")
    if len(P) < 3:
        avisos.append(f"P medible en solo {len(P)} derivación(es): PR y duración de P poco fiables.")
    p_off_u = p_off if not np.isnan(p_off) else -110.0

    # ---- nivel PR provisional y onset del QRS por derivación -----------------------------
    def niveles(a, b):
        return {k: float(np.median(Bs[k][ix(a):ix(b)])) for k in Bs}

    ipk = {k: ix(-40) + int(np.argmax(np.abs(Bs[k][ix(-40):ix(25)]))) for k in Bs}

    def nivel_plateau(x, ip):
        """Nivel del segmento PR: retrocede desde el pico hasta hallar un tramo plano (pendiente baja)."""
        g = np.abs(np.gradient(sg(x, 21)))
        gb = g[ix(bw[0]):ix(bw[1])]
        thr_g = max(0.0012, min(0.0025, float(np.mean(gb)) + 4 * float(np.std(gb))))     # tope: no confundir una delta con el plano
        i = ip - 10                                         # el ápice de la R también es "plano": se parte antes
        amp = abs(x[ip])
        while i > ix(-230) and not (np.all(g[i - 6:i + 1] < thr_g) and abs(x[i] - x[ip]) >= 0.5 * amp):
            i -= 1
        return float(np.median(x[i - 12:i + 1]))

    nivel = {k: nivel_plateau(Bs[k], ipk[k]) for k in Bs}
    ipk = {k: ix(-40) + int(np.argmax(np.abs(Bs[k][ix(-40):ix(25)] - nivel[k]))) for k in Bs}

    def onsets(niv, minthr=0.015):
        out = {}
        for k in Bs:
            if abs(Bs[k][ipk[k]] - niv[k]) < 0.25:
                continue                                      # R pequeña: onset poco fiable
            thr = max(minthr, 4 * ruido.get(k, r_glob))
            out[k] = inicio_qrs(Bs[k], niv[k], thr, ipk[k], ix(max(p_off_u - 15, -150)))
        if not out and Bs:
            for k in Bs:
                if abs(Bs[k][ipk[k]] - niv[k]) < 0.04:
                    continue
                thr = max(minthr, 4 * ruido.get(k, r_glob))
                out[k] = inicio_qrs(Bs[k], niv[k], thr, ipk[k], ix(max(p_off_u - 15, -150)))
        if not out and Bs:
            k0 = next(iter(Bs))
            out[k0] = max(0, ipk[k0] - 25)
        return out

    def segundo(d):
        o = sorted(d.values())
        return o[1] if len(o) > 2 else o[0]

    on0 = onsets(nivel)
    on_prov = sorted(v for v in on0.values())[1] if len(on0) > 2 else min(on0.values())
    if not np.isnan(p_off) and (on_prov - ix(p_off + 5)) >= 6:      # PR re-estimado en el segmento PR real
        nivel = niveles(p_off + 5, cx.ms(on_prov) - 3)
    on_k = onsets(nivel)
    ord_on = sorted(on_k.values())
    qrs_on = ord_on[1] if len(ord_on) > 2 else ord_on[0]      # 2.º más temprano: robusto a ruido
    qrs_on_ms = cx.ms(qrs_on)

    # ---- fin del QRS (J) por velocidad espacial ------------------------------------------
    V = np.sqrt(np.mean([np.gradient(sg(Bf[k], 7)) ** 2 for k in LEADS12 if k in Bf], axis=0))
    if RRm is not None and np.isfinite(RRm) and RRm < 550:
        w_lo, w_hi = ix(-180), ix(-55)
        wins = [V[i:i + 40] for i in range(w_lo, max(w_lo + 1, w_hi - 39), 10)]
        Vb = min(wins, key=lambda w: float(np.mean(w) + np.std(w))) if wins else V[ix(bw[0]):ix(bw[1])]
        thrV = min(0.006, max(0.0020, float(Vb.mean() + 3 * Vb.std()), 0.08 * float(V.max())))
    else:
        Vb = V[ix(bw[0]):ix(bw[1])]
        thrV = max(Vb.mean() + 3 * Vb.std(), 0.0025)
    r0 = ix(0)

    def buscar_J(th):
        j = r0
        while j < ix(150):
            if np.all(V[j:j + 8] < th) and j > r0 + 10:
                break
            j += 1
        return j

    J = buscar_J(thrV)
    # sensibilidad al criterio: umbral de velocidad (fin) y umbral de desviación (inicio)
    sens_J = {th: cx.ms(buscar_J(th)) for th in (0.002, 0.0025, 0.0035, 0.005)}
    sens_on = {th: cx.ms(segundo(onsets(nivel, th))) for th in (0.010, 0.015, 0.025, 0.040)}
    qrs_sens = (min(sens_J.values()) - max(sens_on.values()), max(sens_J.values()) - min(sens_on.values()))
    J_ms = cx.ms(J)
    qrs_dur = J_ms - qrs_on_ms

    # ---- delta -----------------------------------------------------------------------------
    delta = {}
    for k, o in on_k.items():
        b = ipk[k]
        if b - o < 16:
            continue
        r = punto_quiebre(Bs[k], o, b)
        if r:
            bp, s1, s2 = r
            delta[k] = dict(fin=cx.ms(bp), dur=cx.ms(bp) - cx.ms(o), amp=float(Bs[k][bp] - nivel[k]),
                            pend1=float(s1), pend2=float(s2))
    dvalid = {k: v for k, v in delta.items() if abs(v["pend2"]) > 3 * abs(v["pend1"]) and v["dur"] >= 15}
    delta_fin = float(np.median([v["fin"] for v in dvalid.values()])) if len(dvalid) >= 3 else float("nan")
    delta_dur = float(delta_fin - qrs_on_ms) if not np.isnan(delta_fin) else float("nan")
    pol = {}
    for k in LEADS12:
        if k in Bs:
            a = float(Bs[k][ix(min(qrs_on_ms + 40, delta_fin if not np.isnan(delta_fin) else qrs_on_ms + 40))] - nivel[k])
            pol[k] = dict(amp_mm=a * 10, signo="+" if a > 0.05 else ("-" if a < -0.05 else "0"))

    # ---- T ---------------------------------------------------------------------------------
    T = {k: fin_T(B15[k], nivel[k], J, cx, RRm) for k in LEADS12 if k in B15}
    amp_min = 0.15
    Tv = {k: v for k, v in T.items() if abs(v["amp"]) >= amp_min and np.isfinite(v["tangente"])}
    while len(Tv) < 2 and amp_min > 0.03:
        amp_min /= 2
        Tv = {k: v for k, v in T.items() if abs(v["amp"]) >= amp_min and np.isfinite(v["tangente"])}
        avisos.append(f"T de baja amplitud: se bajó el umbral de medición a {amp_min * 10:.1f} mm.")
    if not Tv:
        raise ValueError("No se pudo medir la onda T en ninguna derivación")
    tend_tan = float(np.median([cx.ms(v["tangente"]) for v in Tv.values()]))
    tend_umb = float(np.median([cx.ms(v["umbral"]) for k, v in T.items() if abs(v["amp"]) >= amp_min]))
    tend_rango = (float(min(cx.ms(v["tangente"]) for v in Tv.values())), float(max(cx.ms(v["tangente"]) for v in Tv.values())))
    tpico = {k: cx.ms(v["pico"]) for k, v in Tv.items()}
    tpe = {k: cx.ms(Tv[k]["tangente"]) - tpico[k] for k in Tv}

    # ---- intervalos -----------------------------------------------------------------------
    pr = qrs_on_ms - p_on
    QT_t = tend_tan - qrs_on_ms
    QT_u = tend_umb - qrs_on_ms
    rr_s = RRm / 1000.0
    fc = 60000.0 / RRm

    def qtc(qt):
        return dict(Bazett=qt / np.sqrt(rr_s), Fridericia=qt / rr_s ** (1 / 3),
                    Framingham=qt + 154 * (1 - rr_s), Hodges=qt + 1.75 * (fc - 60),
                    Bogossian_QT_menos_mitad_QRS=qt - 0.5 * qrs_dur)

    qt_lead = {}
    for k in Tv:
        if k in on_k:
            qt_lead[k] = cx.ms(Tv[k]["tangente"]) - cx.ms(on_k[k])
    intervalos = dict(
        PR=pr, P_on=p_on, P_off=p_off, P_dur=p_off - p_on, QRS_on=qrs_on_ms, QRS_fin_J=J_ms, QRS=qrs_dur,
        delta_fin=delta_fin, delta_dur=delta_dur,
        QRS_rango_por_criterio=list(qrs_sens), QRS_fin_sensibilidad=sens_J, QRS_inicio_sensibilidad=sens_on,
        QT_tangente=QT_t, QT_umbral=QT_u, T_fin_tangente=tend_tan, T_fin_umbral=tend_umb,
        T_fin_rango_derivaciones=list(tend_rango),
        QTc_tangente=qtc(QT_t), QTc_umbral=qtc(QT_u),
        JT=tend_tan - J_ms, JTc_Bazett=(tend_tan - J_ms) / np.sqrt(rr_s),
        Tpico_Tfin_mediana=float(np.median(list(tpe.values()))),
        QT_dispersion_ms=float(max(qt_lead.values()) - min(qt_lead.values())) if len(qt_lead) > 2 else None,
        QT_por_derivacion=qt_lead, QRS_on_por_derivacion={k: cx.ms(v) for k, v in on_k.items()})

    # ---- amplitudes, morfología, ST, T -----------------------------------------------------
    leads = {}
    for k in LEADS12:
        if k not in Bs:
            continue
        x = Bs[k]
        lv = nivel[k]
        morf, am = morfologia(Bf[k], lv, qrs_on, J)
        q = x[qrs_on:J + 1] - lv
        Rm = float(q.max())
        Sm = float(q.min())
        # amplitud de P
        d = dict(morfologia=morf, R_mm=Rm * 10, S_mm=Sm * 10, Q_mm=am.get("Q", 0) * 10,
                 amp_pico_a_pico_mm=(Rm - Sm) * 10, area_QRS=float(np.trapezoid(q)),
                 area_delta=float(np.trapezoid(x[qrs_on:ix(qrs_on_ms + 40)] - lv)),
                 area_terminal=float(np.trapezoid(x[J - 40:J] - lv)),
                 area_T=float(np.trapezoid(x[J:ix(tend_tan)] - lv)),
                 area_P=float(np.trapezoid(B15[k][ix(p_on):ix(p_off)])) if not np.isnan(p_on) else None,
                 nivel_PR_mm=lv * 10, n_latidos=int(N.get(k, 0)),
                 ST_J_mm=float(x[J] - lv) * 10, ST_J60_mm=float(x[J + 60] - lv) * 10, ST_J80_mm=float(x[J + 80] - lv) * 10,
                 ST_J60_vs_TP_mm=float(x[J + 60]) * 10)
        if k in P:
            d["P_amp_mm"] = P[k][3] * 10
        if k in T:
            t = T[k]
            ts = B15[k][J + 40:ix(tend_tan)] - lv
            bif = bool((ts.max() > 0.05) and (ts.min() < -0.05))
            d.update(T_amp_mm=t["amp"] * 10, T_bifasica=bif, T_pico_ms=cx.ms(t["pico"]))
        # Q patológica (excluye III, aVR, V1)
        q_dur = None
        if am.get("Q", 0) < -0.05:
            ii = qrs_on
            while ii < J and x[ii] - lv < -0.02:
                ii += 1
            q_dur = ii - qrs_on
        d["Q_dur_ms"] = q_dur
        d["Q_patologica"] = bool(k not in ("III", "aVR", "V1") and q_dur is not None and q_dur >= 30 and abs(am["Q"]) >= 0.25 * max(Rm, 1e-6))
        leads[k] = d

    # ---- onda U (V2-V4) ---------------------------------------------------------------------
    U = {}
    for k in ("V2", "V3", "V4"):
        if k in B15:
            a = ix(tend_tan + 30)
            b = ix(min(tend_tan + 200, 0.62 * RRm))
            seg = B15[k][a:b] - np.median(B15[k][a - 20:a])
            pp, pr_ = find_peaks(seg, prominence=0.05)
            U[k] = float(seg[pp].max() * 10) if len(pp) else 0.0

    # ---- ejes -------------------------------------------------------------------------------
    def eje(campo):
        ar = {k: leads[k][campo] for k in LIMB if k in leads and leads[k][campo] is not None}
        return eje_ls(ar) if len(ar) >= 4 else (float("nan"),) * 3

    ax_qrs, mag_qrs, r2_qrs = eje("area_QRS")
    ax_delta, _, r2_d = eje("area_delta")
    ax_term, _, _ = eje("area_terminal")
    ax_t, _, r2_t = eje("area_T")
    ax_p, _, r2_p = eje("area_P")
    einthoven = None
    if all(k in leads for k in ("I", "II", "III", "aVR", "aVL", "aVF")):
        a = {k: leads[k]["area_QRS"] for k in LIMB}
        einthoven = dict(II_menos_I_mas_III=a["II"] - (a["I"] + a["III"]),
                         suma_aumentadas=a["aVR"] + a["aVL"] + a["aVF"],
                         escala=float(np.mean(np.abs(list(a.values())))))
    # transición precordial
    trans = None
    for k in PREC:
        if k in leads and leads[k]["R_mm"] >= abs(leads[k]["S_mm"]):
            trans = k
            break

    # ---- criterios de voltaje --------------------------------------------------------------
    g = lambda k, f: leads[k][f] if k in leads else float("nan")
    volt = dict(
        Sokolow_Lyon_mm=abs(g("V1", "S_mm")) + max(g("V5", "R_mm"), g("V6", "R_mm")),
        R_aVL_mm=g("aVL", "R_mm"), Cornell_mm=g("aVL", "R_mm") + abs(g("V3", "S_mm")),
        Gubner_mm=g("I", "R_mm") + abs(g("III", "S_mm")),
        R_V5_o_V6_mm=max(g("V5", "R_mm"), g("V6", "R_mm")),
        bajo_voltaje_limb=bool(all(leads[k]["amp_pico_a_pico_mm"] < 5 for k in LIMB if k in leads)),
        bajo_voltaje_prec=bool(all(leads[k]["amp_pico_a_pico_mm"] < 10 for k in PREC if k in leads)))

    # ---- preexcitación (criterios objetivos, no diagnóstico) ------------------------------
    pre_ex = dict(
        PR_corto=bool(pr < 120), QRS_ancho_ge110=bool(qrs_dur >= 110), delta_medible=bool(len(dvalid) >= 3),
        derivaciones_con_delta=sorted(dvalid), delta_dur_ms=delta_dur,
        fraccion_QRS_que_es_delta=float(delta_dur / qrs_dur) if qrs_dur else None,
        eje_delta_grados=ax_delta, polaridad_delta=pol,
        transicion_precordial=trans)
    pre_ex["criterios_cumplidos"] = int(pre_ex["PR_corto"]) + int(pre_ex["QRS_ancho_ge110"]) + int(pre_ex["delta_medible"])

    # ---- latido a latido en la derivación de referencia (incertidumbre) ---------------------
    pl = []
    for s in refsegs:
        x2 = sig[s["row"]]
        is_short = (s["hi"] - s["lo"]) <= 3500
        for r in R_de(s):
            a, b = r - pre, r + post
            if is_short:
                if r - 260 < s["lo"] + 12 or r + 150 > s["hi"] - 12:
                    continue
                idx = np.arange(a, b)
                ok = (idx >= s["lo"]) & (idx < s["hi"]) & (idx >= 0) & (idx < len(x2))
                raw_seg = np.full(pre + post, np.nan)
                raw_seg[ok] = x2[idx[ok]]
                bs_win = raw_seg[pre + bw[0]:pre + bw[1]]
                if np.isnan(bs_win).mean() > 0.5:
                    continue
                seg = rellenar(raw_seg - np.nanmedian(bs_win))
            else:
                if a < s["lo"] + 12 or b > s["hi"] - 12:
                    continue
                seg = x2[a:b] - np.median(x2[a + pre + bw[0]:a + pre + bw[1]])
            s9, s15 = sg(seg, 9), sg(seg, 15)
            nz = float(np.std(seg[pre + bw[0]:pre + bw[1]] - sg(seg[pre + bw[0]:pre + bw[1]], 21)))
            p = onda_P(s15, cx, nz)
            niv = float(np.median(s9[ix(p_off + 5):ix(qrs_on_ms - 3)])) if (not np.isnan(p_off) and qrs_on_ms - 3 > p_off + 5) else float(np.median(s9[ix(-110):ix(-95)]))
            ip = ix(-40) + int(np.argmax(np.abs(s9[ix(-40):ix(25)] - niv)))
            on = inicio_qrs(s9, niv, max(0.015, 4 * nz), ip, ix(-150))
            Vv = np.abs(np.gradient(sg(seg, 7)))
            Vbb = Vv[pre + bw[0]:pre + bw[1]]
            th = max(Vbb.mean() + 3 * Vbb.std(), 0.003)
            jj = ix(10)
            while jj < ix(150) and not np.all(Vv[jj:jj + 8] < th):
                jj += 1
            t = fin_T(s15, niv, jj, cx, RRm)
            qt_val = (cx.ms(t["tangente"]) - cx.ms(on)) if (b <= s["hi"] - 12 and np.isfinite(t["tangente"])) else None
            pl.append(dict(R_ms=int(r), PR=(cx.ms(on) - cx.ms(p[0])) if p else None, P_dur=(cx.ms(p[1]) - cx.ms(p[0])) if p else None,
                           P_amp_mm=p[3] * 10 if p else None, QRS=cx.ms(jj) - cx.ms(on),
                           QT=qt_val,
                           R_mm=float((s9[ip] - niv) * 10)))

    def ag(campo):
        v = np.array([d[campo] for d in pl if d[campo] is not None], float)
        if len(v) == 0:
            return dict(media=float("nan"), DE=None, n=0)
        return dict(media=float(v.mean()), DE=float(v.std(ddof=1)) if len(v) > 1 else None, n=int(len(v)))

    por_latido = {c: ag(c) for c in ("PR", "P_dur", "QRS", "QT", "R_mm")}
    p_detectadas = int(sum(1 for d in pl if d["PR"] is not None))
    s_ref = refsegs[0]
    flutter_info = detectar_actividad_auricular_diastolica(sig[s_ref["row"]], R_de(s_ref), qrs_on_ms, tend_tan)
    diastolic_p = detectar_ondas_p_diastolicas(sig[s_ref["row"]], R_de(s_ref))
    dinamica = analizar_dinamica_latido_a_latido(pl, rr)
    if diastolic_p.get("av_pr_variable") is True:
        dinamica["pr_variable"] = True
    elif diastolic_p.get("p_qrs_ratio") is not None and abs(diastolic_p["p_qrs_ratio"] - 2.0) <= 0.25 and diastolic_p.get("av_pr_variable") is False:
        dinamica["pr_variable"] = False
    ruido_raw = float(np.median([np.nanstd(m[pre + bw[0]:pre + bw[1]] - sg(rellenar(m[pre + bw[0]:pre + bw[1]]), 21)) for m in MR]))
    ruido_raw = max(ruido_raw, 1e-5)                         # imágenes muy limpias: ruido por debajo de 1 píxel
    snr = {k: float(leads[k]["amp_pico_a_pico_mm"] / 10 / ruido_raw) for k in leads}

    calidad = dict(
        modo_lectura=ext["control"]["modo"], distribucion=ext["layout"], velocidad_mm_s=ext["vel"], ganancia_mm_mV=ext["gan"],
        escala_cuadricula_mm=ext["control"].get("grid_mm"), derivacion_referencia=lead_ref,
        fs_original_Hz=ext["fs_orig"], ruido_latido_individual_uV=ruido_raw * 1000, SNR_mediano=float(np.median(list(snr.values()))),
        latidos_por_derivacion={k: int(v) for k, v in N.items()}, Einthoven=einthoven,
        P_detectada_por_latido=f"{p_detectadas}/{len(pl)}", flutter=flutter_info, diastolic_p=diastolic_p, avisos=avisos)
    cqt = {}
    res = dict(
        ritmo=ritmo_res, intervalos=intervalos, ejes=dict(
            QRS_grados=ax_qrs, QRS_ajuste_R2=r2_qrs, delta_grados=ax_delta, terminal_40ms_grados=ax_term,
            T_grados=ax_t, P_grados=ax_p, P_ajuste_R2=r2_p, angulo_QRS_T_frontal=ang_dif(ax_qrs, ax_t)),
        transicion_precordial=trans, voltajes=volt, onda_U_mm=U, preexcitacion=pre_ex, dinamica=dinamica,
        por_latido_DII=por_latido, por_latido_detalle=pl, derivaciones=leads, calidad=calidad)
    aux = dict(B=Bf, Bs=Bs, cx=cx, R=R_de(s_ref), ritmo=sig[s_ref["row"]], ref=s_ref, on_k=on_k, ipk=ipk, P=P, J=J, qrs_on=qrs_on, T=T, Tv=Tv, nivel=nivel,
               delta_fin=delta_fin, delta_candidates=delta, p_on=p_on, p_off=p_off, tend=tend_tan, ext=ext, V=V, thrV=thrV)
    return res, aux




# ----------------------------------------------------------------------------------------------
# 5. FIGURA DE AUDITORÍA Y REPORTE
# ----------------------------------------------------------------------------------------------
def figura(res, aux, ruta):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    cx, ext = aux["cx"], aux["ext"]
    t = np.arange(-cx.pre, cx.post)
    fig = plt.figure(figsize=(24, 15))
    gs = fig.add_gridspec(4, 4, height_ratios=[1.1, 1, 1, 1])
    ax = fig.add_subplot(gs[0, :])
    s_ref = aux["ref"]
    xr = np.arange(s_ref["lo"], s_ref["hi"])
    ax.plot(xr, aux["ritmo"][s_ref["lo"]:s_ref["hi"]], lw=.8, color="k")
    ax.plot(aux["R"], aux["ritmo"][aux["R"]], "rv")
    for a, b, r in zip(aux["R"][:-1], aux["R"][1:], res["ritmo"]["RR_ms"]):
        ax.text((a + b) / 2, aux["ritmo"].max() * .9, f"{int(r)}", ha="center", fontsize=9, color="crimson")
    ax.set_title(f"Derivación de referencia ({res['calidad']['derivacion_referencia']})  FC {res['ritmo']['FC_media']:.0f} lpm  RR {res['ritmo']['RR_medio']:.0f}±{res['ritmo']['RR_DE']:.0f} ms")
    lay = STD_GRID
    iv = res["intervalos"]
    marcas = [(iv["P_on"], "tab:green", "P ini"), (iv["P_off"], "tab:olive", "P fin"), (iv["QRS_on"], "tab:blue", "QRS ini"),
              (iv["delta_fin"], "tab:purple", "fin delta"), (iv["QRS_fin_J"], "tab:red", "J"), (iv["T_fin_tangente"], "tab:orange", "T fin")]
    for r in range(3):
        for c in range(4):
            k = lay[r][c]
            a = fig.add_subplot(gs[r + 1, c])
            if k in aux["B"]:
                a.plot(t, aux["B"][k], lw=1.2, color="k")
                a.axhline(aux["nivel"][k], color="gray", ls=":", lw=.8)
                for m, col, lab in marcas:
                    if m == m:
                        a.axvline(m, color=col, lw=.9, alpha=.9)
                if k in aux["Tv"]:
                    a.plot(aux["Tv"][k]["pico"] - cx.pre, aux["B"][k][aux["Tv"][k]["pico"]], "o", color="tab:orange", ms=4)
                a.set_title(f"{k}  (n={res['calidad']['latidos_por_derivacion'].get(k)})", fontsize=10)
            a.set_xlim(-260, 420)
            a.grid(alpha=.3)
            a.set_xticks(range(-250, 401, 50))
            a.tick_params(labelsize=7)
    h = [plt.Line2D([0], [0], color=c, label=l) for _, c, l in marcas]
    fig.legend(handles=h, loc="lower center", ncol=6)
    plt.tight_layout(rect=(0, .03, 1, 1))
    plt.savefig(ruta, dpi=70)
    plt.close(fig)


def f(x, d=0):
    return "n/d" if x is None or (isinstance(x, float) and np.isnan(x)) else f"{x:.{d}f}"


def reporte(res, sexo=None):
    r, iv, ej, q = res["ritmo"], res["intervalos"], res["ejes"], res["calidad"]
    pl = res["por_latido_DII"]
    L = []
    A = L.append
    A("# Reporte de mediciones del ECG\n")
    A("## Ritmo\n")
    A(f"- Latidos analizados: {r['n_latidos']}  |  RR medio **{f(r['RR_medio'])} ms** (mín {f(r['RR_min'])}, máx {f(r['RR_max'])}, DE {f(r['RR_DE'],1)})")
    A(f"- FC media **{f(r['FC_media'])} lpm** (rango {f(r['FC_min'])}–{f(r['FC_max'])})")
    A(f"- SDNN {f(r['SDNN'],1)} ms, RMSSD {f(r['RMSSD'],1)} ms, pNN50 {f(r['pNN50'],0)} %, CV {f(r['CV_pct'],1)} %, variación máx–mín {f(r['variacion_max_min_ms'])} ms")
    A(f"- P detectada en {q['P_detectada_por_latido']} latidos de la derivación de referencia ({q['derivacion_referencia']})\n")
    A("## Intervalos (12 derivaciones, latido promedio)\n")
    A("| Parámetro | Valor (ms) | Latido a latido, der. de referencia (media ± DE) | Referencia |\n|---|---|---|---|")

    def lp(c):
        d = pl[c]
        return f"{f(d['media'])} ± {f(d['DE'],1)} (n={d['n']})"

    A(f"| P: duración | {f(iv['P_dur'])} | {lp('P_dur')} | <120 |")
    A(f"| **PR** | **{f(iv['PR'])}** | {lp('PR')} | 120–200 |")
    A(f"| Onda delta | {f(iv['delta_dur'])} | - | - |")
    A(f"| **QRS** | **{f(iv['QRS'])}** (rango según criterio {f(iv['QRS_rango_por_criterio'][0])}–{f(iv['QRS_rango_por_criterio'][1])}) | {lp('QRS')} (solo una derivación) | <120 |")
    A(f"| **QT** (tangente / umbral) | **{f(iv['QT_tangente'])}** / {f(iv['QT_umbral'])} | {lp('QT')} | - |")
    A(f"| JT | {f(iv['JT'])} | - | - |")
    A(f"| Tpico–Tfin (mediana) | {f(iv['Tpico_Tfin_mediana'])} | - | - |")
    A(f"| Dispersión del QT | {f(iv['QT_dispersion_ms'])} | - | informativo |\n")
    A("| QTc | QT tangente | QT umbral |\n|---|---|---|")
    for k in iv["QTc_tangente"]:
        A(f"| {k} | {f(iv['QTc_tangente'][k])} | {f(iv['QTc_umbral'][k])} |")
    A(f"\nJTc (Bazett): {f(iv['JTc_Bazett'])} ms. Referencia QTc: <450 ms hombres, <460 ms mujeres.\n")
    A("## Ejes (frontal, mínimos cuadrados con 6 derivaciones)\n")
    A("| Eje | Grados |\n|---|---|")
    A(f"| QRS | {f(ej['QRS_grados'])}° (R² {f(ej['QRS_ajuste_R2'],2)}) |")
    A(f"| Delta (primeros 40 ms) | {f(ej['delta_grados'])}° |")
    A(f"| Terminal (últimos 40 ms) | {f(ej['terminal_40ms_grados'])}° |")
    A(f"| T | {f(ej['T_grados'])}° |")
    A(f"| P | {f(ej['P_grados'])}° (poco fiable si la P es <1 mm) |")
    A(f"| Ángulo QRS–T frontal | {f(ej['angulo_QRS_T_frontal'])}° |\n")
    A(f"Transición precordial (primera derivación con R ≥ |S|): **{res['transicion_precordial']}**\n")
    v = res["voltajes"]
    A("## Voltajes (mm)\n")
    A(f"- Sokolow-Lyon {f(v['Sokolow_Lyon_mm'],1)} (≥35 positivo), R aVL {f(v['R_aVL_mm'],1)} (>11), Cornell {f(v['Cornell_mm'],1)} (>28 H / >20 M), Gubner {f(v['Gubner_mm'],1)} (>25)")
    A(f"- Bajo voltaje: limb {v['bajo_voltaje_limb']}, precordiales {v['bajo_voltaje_prec']}. En preexcitación estos criterios no son fiables.\n")
    A("## Por derivación\n")
    A("| Der. | Morf. | R | S | Q | Q dur | ST J | ST J+60 | ST J+80 | T | T bif. | P | n |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|")
    for k in LEADS12:
        d = res["derivaciones"].get(k)
        if d:
            A(f"| {k} | {d['morfologia']} | {f(d['R_mm'],1)} | {f(d['S_mm'],1)} | {f(d['Q_mm'],1)} | {f(d['Q_dur_ms'])} | {f(d['ST_J_mm'],1)} | {f(d['ST_J60_mm'],1)} | {f(d['ST_J80_mm'],1)} | {f(d.get('T_amp_mm'),1)} | {d.get('T_bifasica')} | {f(d.get('P_amp_mm'),1)} | {d['n_latidos']} |")
    A("\n(valores en mm; 1 mm = 0,1 mV; ST relativo al segmento PR)\n")
    pe = res["preexcitacion"]
    A("## Preexcitación (criterios objetivos)\n")
    A(f"- PR corto (<120): {pe['PR_corto']}; QRS ≥110 ms: {pe['QRS_ancho_ge110']}; delta medible en ≥3 derivaciones: {pe['delta_medible']} ({', '.join(pe['derivaciones_con_delta'])})")
    A(f"- Delta {f(pe['delta_dur_ms'])} ms = {f(100*pe['fraccion_QRS_que_es_delta'],0) if pe['fraccion_QRS_que_es_delta'] else 'n/d'} % del QRS; eje de la delta {f(pe['eje_delta_grados'])}°")
    A("- Polaridad de la delta: " + ", ".join(f"{k} {d['signo']}" for k, d in pe["polaridad_delta"].items()))
    A(f"\nOnda U (mm, V2–V4): {res['onda_U_mm']}\n")
    A("## Calidad y supuestos\n")
    A(f"- Lectura: {q['modo_lectura']}; velocidad {q['velocidad_mm_s']} mm/s; ganancia {q['ganancia_mm_mV']} mm/mV; escala de cuadrícula {f(q['escala_cuadricula_mm'],3)} mm (esperado 1,000)")
    A(f"- Distribución usada: {q['distribucion']}")
    A(f"- Muestreo original ≈ {f(q['fs_original_Hz'])} Hz; ruido por latido {f(q['ruido_latido_individual_uV'],1)} µV; SNR mediano {f(q['SNR_mediano'],0)}")
    if q["Einthoven"]:
        e = q["Einthoven"]
        A(f"- Einthoven: II − (I + III) = {f(e['II_menos_I_mas_III'],1)} mV·ms; aVR+aVL+aVF = {f(e['suma_aumentadas'],1)} mV·ms (escala media {f(e['escala'],0)})")
    A(f"- Latidos promediados por derivación: {q['latidos_por_derivacion']}")
    for a in q["avisos"]:
        A(f"- AVISO: {a}")
    A("\nIncertidumbre típica: ±5–10 ms en intervalos (criterio de inicio/fin de onda). Medición de estudio; no sustituye lectura clínica.")
    return "\n".join(L)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", help="PDF o imagen del ECG")
    ap.add_argument("--salida", default="resultados")
    ap.add_argument("--sexo", choices=["M", "F"], default=None)
    ap.add_argument("--layout", default="auto", help="auto | 3x4r | 3x4 | 6x2 | 12x1 | 'I,aVR,V1,V4/II,aVL,...'")
    ap.add_argument("--px_mm", type=float, default=None, help="píxeles por mm (solo imágenes)")
    ap.add_argument("--vel", type=float, default=None, help="velocidad del papel mm/s")
    ap.add_argument("--ganancia", type=float, default=None, help="ganancia mm/mV")
    ap.add_argument("--pagina", type=int, default=0)
    ap.add_argument("--raster", action="store_true", help="forzar lectura como imagen aunque el PDF sea vectorial")
    a = ap.parse_args()
    os.makedirs(a.salida, exist_ok=True)
    ext = extraer(a.pdf, a.layout, a.px_mm, a.vel, a.ganancia, a.pagina, a.raster)
    res, aux = analizar(ext, a.sexo)
    with open(os.path.join(a.salida, "resultados.json"), "w") as fh:
        json.dump(res, fh, indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o))
    with open(os.path.join(a.salida, "reporte.md"), "w") as fh:
        fh.write(reporte(res, a.sexo))
    figura(res, aux, os.path.join(a.salida, "fiduciales.png"))
    print(reporte(res, a.sexo))


if __name__ == "__main__":
    main()
