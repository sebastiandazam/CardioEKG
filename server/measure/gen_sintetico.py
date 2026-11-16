#!/usr/bin/env python3
"""Genera ECG sintéticos (PDF vectorial + PNG) con intervalos exactos conocidos, en varias distribuciones."""
import json, sys
import numpy as np
import matplotlib
matplotlib.use("Agg")
matplotlib.rcParams["pdf.fonttype"] = 42
import matplotlib.pyplot as plt

LEADS = ["I","II","III","aVR","aVL","aVF","V1","V2","V3","V4","V5","V6"]
VEC = {"I":(1,0),"II":(.5,np.sqrt(3)/2),"III":(-.5,np.sqrt(3)/2),"aVR":(-.75,-np.sqrt(3)/4),"aVL":(.75,-np.sqrt(3)/4),"aVF":(0,np.sqrt(3)/2)}
PREC_R = {"V1":0.15,"V2":0.5,"V3":0.9,"V4":1.3,"V5":1.2,"V6":0.9}
PREC_S = {"V1":-0.9,"V2":-0.7,"V3":-0.4,"V4":-0.2,"V5":-0.1,"V6":-0.05}

def bump(t, a, b, amp):
    y = np.zeros_like(t); m = (t >= a) & (t <= b)
    y[m] = amp * 0.5 * (1 - np.cos(2*np.pi*(t[m]-a)/(b-a)))
    return y

def beat(t, amp_qrs, amp_t, amp_p, PR, QRS, QT, Pdur):
    """t en ms respecto al inicio del QRS (0). P empieza en -PR. QT termina en QT."""
    y = bump(t, -PR, -PR+Pdur, amp_p)
    a = amp_qrs
    q = np.interp(t, [0, 10, 40, 70, QRS], [0, -0.08*abs(a), a, -0.25*abs(a)*np.sign(a), 0], left=0, right=0)
    q[(t<0)|(t>QRS)] = 0
    y += q + bump(t, QRS+40, QT, amp_t)
    return y

def sintetizar(hr=72, PR=160, QRS=90, QT=380, Pdur=100, eje=60, dur=10.0, fs=500, seed=1, jitter=15):
    rng = np.random.default_rng(seed)
    RR = 60000/hr
    t = np.arange(0, dur*1000, 1000/fs)
    onsets = []; x = 400.0
    while x < dur*1000 - 500:
        onsets.append(x); x += RR + rng.uniform(-jitter, jitter)
    A = 1.4
    hx, hy = A*np.cos(np.radians(eje)), A*np.sin(np.radians(eje))
    sig = {}
    for k in LEADS:
        if k in VEC:
            a = hx*VEC[k][0] + hy*VEC[k][1]
        else:
            a = PREC_R[k] + PREC_S[k]*0   # amplitud principal positiva
        tamp = 0.25*a if k not in ("aVR",) else 0.25*a
        pamp = 0.12*np.sign(a if abs(a) > 0.05 else 1)*min(1, abs(a)/0.5+0.3)
        y = np.zeros_like(t)
        for o in onsets:
            m = (t > o-PR-50) & (t < o+QT+100)
            y[m] += beat(t[m]-o, a, tamp, pamp, PR, QRS, QT, Pdur)
        y += 0.005*rng.standard_normal(len(t))
        sig[k] = y
    truth = dict(FC=hr, PR=PR, QRS=QRS, QT=QT, QTc_Bazett=QT/np.sqrt(RR/1000), P_dur=Pdur, eje_QRS=eje, RR=RR, onsets=onsets)
    return t, sig, truth

LAYOUTS = {
 "3x4r": [["I","aVR","V1","V4"],["II","aVL","V2","V5"],["III","aVF","V3","V6"],["II"]],
 "3x4": [["I","aVR","V1","V4"],["II","aVL","V2","V5"],["III","aVF","V3","V6"]],
 "6x2": [["I","V1"],["II","V2"],["III","V3"],["aVR","V4"],["aVL","V5"],["aVF","V6"]],
 "12x1": [[k] for k in LEADS],
}

def dibujar(t, sig, layout, nombre, vel=25, gan=10, etiquetas=True, pulso=True, dpi=200, color_traza="k", grid_color=(1,.78,.78)):
    fila_mm = {4: 40, 3: 45, 6: 28, 12: 14}[len(layout)]
    H = 210; W = 297
    fig = plt.figure(figsize=(W/25.4, H/25.4))
    ax = fig.add_axes([0,0,1,1]); ax.set_xlim(0, W); ax.set_ylim(H, 0); ax.axis("off")
    x0, top = 20.0, (22.0 if len(layout) == 12 else 25.0)
    dur_ms = t[-1]; ancho = dur_ms/1000*vel
    ncol = max(len(f) for f in layout)
    y1 = top + len(layout)*fila_mm
    # cuadrícula
    for xx in np.arange(x0-10, x0+ancho+5, 1): ax.plot([xx,xx],[top-12,min(y1+8,H-1)], color=grid_color, lw=.25 if (xx-x0+10)%5 else .6)
    for yy in np.arange(top-12, min(y1+8,H-1), 1): ax.plot([x0-10,x0+ancho+5],[yy,yy], color=grid_color, lw=.25 if (yy-top+12)%5 else .6)
    for r, fila in enumerate(layout):
        yb = top + (r+.5)*fila_mm
        if len(fila) == 1 and ncol > 1:
            tramos = [(fila[0], 0, dur_ms)]
        else:
            tramos = [(k, c*dur_ms/ncol, (c+1)*dur_ms/ncol) for c, k in enumerate(fila)]
        for k, a, b in tramos:
            m = (t >= a) & (t < b)
            ax.plot(x0 + t[m]/1000*vel, yb - sig[k][m]*gan, color=color_traza, lw=.5)
            if etiquetas: ax.text(x0 + a/1000*vel + 1.5, yb - fila_mm*.45, k, fontsize=9, color="b")
        if pulso:
            ax.plot([x0-8,x0-7,x0-7,x0-2,x0-2,x0-1], [yb,yb,yb-gan,yb-gan,yb,yb], color=color_traza, lw=.5)
    ax.text(10, H-6, f"{vel} mm/s, {gan} mm/mV", fontsize=8)
    fig.savefig(nombre+".pdf")
    fig.savefig(nombre+".png", dpi=dpi)
    plt.close(fig)

if __name__ == "__main__":
    import os
    os.makedirs("sint", exist_ok=True)
    casos = [
      ("A_3x4r_etiquetas", dict(layout="3x4r", vel=25, gan=10, etiquetas=True, hr=72, PR=160, QRS=90, QT=380, eje=60)),
      ("B_6x2_etiquetas", dict(layout="6x2", vel=25, gan=10, etiquetas=True, hr=58, PR=200, QRS=100, QT=420, eje=-20)),
      ("C_12x1_ganancia5", dict(layout="12x1", vel=25, gan=5, etiquetas=True, hr=90, PR=140, QRS=84, QT=340, eje=75)),
      ("D_3x4_sin_etiquetas", dict(layout="3x4", vel=25, gan=10, etiquetas=False, pulso=False, hr=66, PR=180, QRS=96, QT=400, eje=30)),
      ("E_3x4r_50mms", dict(layout="3x4r", vel=50, gan=10, etiquetas=True, hr=75, PR=170, QRS=92, QT=370, eje=45)),
    ]
    verdad = {}
    for nombre, p in casos:
        t, sig, tr = sintetizar(hr=p["hr"], PR=p["PR"], QRS=p["QRS"], QT=p["QT"], eje=p["eje"], dur=10.0 if p["vel"]==25 else 5.0, seed=3)
        dibujar(t, sig, LAYOUTS[p["layout"]], "sint/"+nombre, vel=p["vel"], gan=p["gan"], etiquetas=p["etiquetas"], pulso=p.get("pulso", True))
        tr["layout"] = p["layout"]; verdad[nombre] = tr
    json.dump(verdad, open("sint/verdad.json","w"), default=float)
    print("ok", list(verdad))
