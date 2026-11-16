#!/usr/bin/env python3
"""Ejecuta ecg_analisis.py sobre un archivo y escribe un JSON compacto y serializable por stdout.

Uso (siempre aislado):  python3 -I run_measure.py ruta [--layout L] [--vel V] [--ganancia G] [--px_mm P]
No escribe archivos, no usa la red. El archivo de entrada se trata como dato no confiable.
"""
import argparse
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np  # noqa: E402

import ecg_analisis as E  # noqa: E402

LEADS = E.LEADS12
OUT_FS = 250  # Hz de las señales devueltas (la lectura interna es a 1 kHz)


def limpio(o):
    if isinstance(o, dict):
        return {str(k): limpio(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [limpio(v) for v in o]
    if isinstance(o, np.ndarray):
        return limpio(o.tolist())
    if isinstance(o, (np.floating, float)):
        v = float(o)
        return v if math.isfinite(v) else None
    if isinstance(o, np.integer):
        return int(o)
    if isinstance(o, np.bool_):
        return bool(o)
    return o


def senales(ext):
    """Una traza por derivación (mV, 250 Hz); la tira de ritmo se devuelve aparte."""
    sig, paso = ext["sig"], int(round(1000 / OUT_FS))
    trazas, ritmo = {}, None
    for s in ext["segs"]:
        y = sig[s["row"]][s["lo"]:s["hi"]:paso]
        t = {"mv": [round(float(v), 4) for v in y], "seconds": round(len(y) / OUT_FS, 3)}
        if s["full"] and ext["ncol"] > 1:
            ritmo = {"lead": s["lead"], **t}
        if s["lead"] not in trazas or not (s["full"] and ext["ncol"] > 1):
            trazas[s["lead"]] = t
    return trazas, ritmo


def measure_file(ruta, layout="auto", vel=None, ganancia=None, px_mm=None, raster=False):
    """Same measurement contract in CPython and browser Python; no network or persistence."""
    ext = E.extraer(ruta, layout, px_mm, vel, ganancia, 0, raster)
    res, _ = E.analizar(ext)
    iv, rt, ej, q = res["intervalos"], res["ritmo"], res["ejes"], res["calidad"]
    qtc = iv["QTc_tangente"]
    trazas, ritmo = senales(ext)
    por_lead = {k: {c: d.get(c) for c in ("morfologia", "R_mm", "S_mm", "Q_mm", "Q_dur_ms", "Q_patologica", "ST_J_mm", "ST_J60_mm",
                                          "ST_J80_mm", "T_amp_mm", "T_bifasica", "P_amp_mm", "n_latidos")}
               for k, d in res["derivaciones"].items()}
    out = {
        "schemaVersion": 1, "ok": True, "engine": "ecg_analisis-v3",
        "measurements": {"rateBpm": rt["FC_media"], "prMs": iv["PR"], "qrsMs": iv["QRS"], "qtMs": iv["QT_tangente"], "axisDeg": ej["QRS_grados"]},
        "ranges": {"qrsMs": iv["QRS_rango_por_criterio"], "qtMs": [iv["QT_tangente"], iv["QT_umbral"]],
                   "beatToBeat": res["por_latido_DII"]},
        "extra": {"qtcFridericiaMs": qtc["Fridericia"], "qtcBazettMs": qtc["Bazett"], "pDurationMs": iv["P_dur"], "jtMs": iv["JT"],
                  "tAxisDeg": ej["T_grados"], "pAxisDeg": ej["P_grados"], "qrsTAngleDeg": ej["angulo_QRS_T_frontal"],
                  "precordialTransition": res["transicion_precordial"], "voltage": res["voltajes"], "preexcitation": res["preexcitacion"],
                  "rr": {k: rt[k] for k in ("n_latidos", "RR_medio", "RR_DE", "RR_min", "RR_max", "CV_pct")}},
        "leads": por_lead,
        "quality": {"mode": q["modo_lectura"], "layout": q["distribucion"], "speedMmS": q["velocidad_mm_s"], "gainMmMv": q["ganancia_mm_mV"],
                    "referenceLead": q["derivacion_referencia"], "pDetected": q["P_detectada_por_latido"], "einthoven": q["Einthoven"],
                    "warnings": q["avisos"]},
        "traces": trazas, "rhythmTrace": ritmo,
    }
    return limpio(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ruta")
    ap.add_argument("--layout", default="auto")
    ap.add_argument("--vel", type=float, default=None)
    ap.add_argument("--ganancia", type=float, default=None)
    ap.add_argument("--px_mm", type=float, default=None)
    ap.add_argument("--raster", action="store_true")
    a = ap.parse_args()
    try:
        out = measure_file(a.ruta, a.layout, a.vel, a.ganancia, a.px_mm, a.raster)
    except ValueError as e:
        out = {"schemaVersion": 1, "ok": False, "error": str(e)[:300]}
    sys.stdout.write(json.dumps(out, allow_nan=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    sys.exit(main())


def p_separated_from_qrs(p_end_ms, qrs_start_ms):
    """Require a visible gap; a P candidate overlapping QRS is not trustworthy."""
    return (p_end_ms is not None and qrs_start_ms is not None
            and np.isfinite(p_end_ms) and np.isfinite(qrs_start_ms)
            and p_end_ms + 5 < qrs_start_ms)


def delta_evidence(x, lead, result, aux, seconds):
    """Per-beat corroboration of v3's two-slope candidate; not a diagnosis.

    Uses each detected beat's own samples and the median beat's local onset/peak
    offsets. Sequential leads are never treated as simultaneous.
    """
    empty = dict(status='not-evaluable', polarity=None, durationMs=None,
        initialSlopeMvPerMs=None, terminalSlopeMvPerMs=None,
        repeatableBeats=0, analyzedBeats=0, windows=[])
    on, peak = aux['on_k'].get(lead), aux['ipk'].get(lead)
    if on is None or peak is None or result['calidad']['ruido_latido_individual_uV'] >= 30:
        return empty
    cv = result['ritmo']['CV_pct']
    if not np.isfinite(cv) or cv > 10:
        return empty
    cx = aux['cx']; onset_ms, peak_ms = cx.ms(on), cx.ms(peak)
    if peak_ms - onset_ms < 16:
        return empty
    # Bounds keep work predictable even for long recordings.
    anchors = aux['R']
    if len(anchors) > 8:
        anchors = anchors[np.linspace(0, len(anchors)-1, 8).astype(int)]
    valid_anchors = [int(r) for r in anchors if r + onset_ms >= 30 and r + peak_ms + 30 < len(x)]
    empty['analyzedBeats'] = len(valid_anchors)
    if len(valid_anchors) < 2:
        return empty
    median_candidate = aux['delta_candidates'].get(lead)
    if not median_candidate:
        empty['status'] = 'not-supported'
        return empty
    d = median_candidate
    # Search criteria pre-specified from the existing v3 breakpoint detector.
    if not (25 <= d['dur'] <= 80 and abs(d['amp']) >= .03 and d['pend1']*d['pend2'] > 0 and abs(d['pend2']) >= 1.8*abs(d['pend1'])):
        empty['status'] = 'not-supported'
        return empty
    candidates = []
    for r in valid_anchors:
        a, b = int(r + onset_ms), int(r + peak_ms)
        if b-a < 16: continue
        segment = E.sg(x[a-30:b+30], 9)
        fitted = E.punto_quiebre(segment, 30, 30 + b-a)
        if fitted is None: continue
        bp, s1, s2 = fitted
        duration = bp - 30
        amp = float(segment[bp] - segment[30])
        if not (25 <= duration <= 80 and abs(duration-d['dur']) <= 20 and abs(amp) >= .03
                and s1*s2 > 0 and abs(s2) >= 1.8*abs(s1) and amp*d['amp'] > 0):
            continue
        start, end, peak_time = a/1000, (a+duration)/1000, b/1000
        if not 0 <= start < end <= peak_time <= seconds: continue
        candidates.append(dict(duration=duration, initial=float(s1), terminal=float(s2),
            polarity='positive' if amp > 0 else 'negative',
            window=dict(start=start,end=end,peak=peak_time,polarity='positive' if amp > 0 else 'negative')))
    empty['repeatableBeats'] = len(candidates)
    if len(candidates) < 2 or len(candidates)/len(valid_anchors) < (2/3):
        empty['status'] = 'not-supported'
        return empty
    polarities = {c['polarity'] for c in candidates}
    return dict(status='supported', polarity=next(iter(polarities)) if len(polarities)==1 else 'mixed',
        durationMs=float(np.median([c['duration'] for c in candidates])),
        initialSlopeMvPerMs=float(np.median([c['initial'] for c in candidates])),
        terminalSlopeMvPerMs=float(np.median([c['terminal'] for c in candidates])),
        repeatableBeats=len(candidates), analyzedBeats=len(valid_anchors), windows=[c['window'] for c in candidates])


def measure_traces(traces, rhythm_trace=None, rhythm_lead=None, measurement_windows=None, axis_comparable=False, simultaneous=False):
    """Measure normalized mV traces independently; indices are converted to seconds.

    E.analizar requires 1 kHz input. Independent analysis avoids treating sequential
    leads as simultaneous. Boundaries are median-beat offsets projected onto each
    detected R peak, not individual beat delineations.
    """
    from scipy.signal import resample_poly
    from fractions import Fraction
    import warnings

    if not isinstance(traces, dict) or not traces:
        raise ValueError('No hay derivaciones para medir')
    results, markers, failures, details = {}, {}, [], {}
    def one(lead, trace, smooth_window=0, rr_hint_ms=None, rhythm_cv_pct=None):
        if not isinstance(trace, dict) or not isinstance(trace.get('mv'), list):
            raise ValueError('Traza inválida')
        x = np.asarray(trace['mv'], dtype=float)
        seconds = float(trace.get('seconds', 0))
        if trace.get('quality', 1) < .8 or len(x) < 100 or len(x) > 30000 or not 1 <= seconds <= 30 or not np.isfinite(x).all() or np.max(np.abs(x)) > 50:
            raise ValueError('Traza inválida o fuera de límites')
        ratio = Fraction(1000 * seconds / len(x)).limit_denominator(10000)
        x = resample_poly(x, ratio.numerator, ratio.denominator)
        residual = 0.0
        if smooth_window:
            filtered = E.sg(x, smooth_window)
            residual = float(np.sqrt(np.mean((x-filtered)**2)))
            x = filtered
        seg = dict(lead=lead, row=0, lo=0, hi=len(x), full=True, col=0)
        ext = dict(sig=x[np.newaxis, :], segs=[seg], ncol=1, layout=[[lead]], vel=25, gan=10,
                   control={'modo': 'señal digital'}, fs_orig=len(trace['mv']) / seconds, supuestos=[],
                   rr_hint_ms=rr_hint_ms)
        with warnings.catch_warnings():
            warnings.simplefilter('ignore', RuntimeWarning)
            res, aux = E.analizar(ext)
        res['_filterResidualMv'] = residual
        cx = aux['cx']; p = aux['P'].get(lead); t = aux['Tv'].get(lead)
        on = aux['on_k'].get(lead)
        bounds = []
        t_onset_ms = cx.ms(t['onset']) if (t and np.isfinite(t.get('onset', float('nan')))) else None
        t_end_ms = cx.ms(t['tangente']) if (t and np.isfinite(t.get('tangente', float('nan')))) else None
        t_reliable = (t is not None and t_onset_ms is not None and t_end_ms is not None
                      and cx.ms(aux['J']) + 15 <= t_onset_ms < cx.ms(t['pico']) < t_end_ms)
        for r in aux['R']:
            pairs = []
            if p is not None: pairs.append(('p', cx.ms(p[0]), cx.ms(p[1])))
            if on is not None: pairs.append(('qrs', cx.ms(on), cx.ms(aux['J'])))
            if t_reliable: pairs.append(('t', t_onset_ms, t_end_ms))
            for phase, start, end in pairs:
                a, b = (r + start) / 1000, (r + end) / 1000
                if np.isfinite(a) and np.isfinite(b) and 0 <= a < b <= seconds:
                    bounds.append(dict(phase=phase, start=round(a, 4), end=round(b, 4)))
        d = res['derivaciones'].get(lead, {})
        iv = res['intervalos']; rt = res['ritmo']; quality = res['calidad']
        flutter_flag = bool(quality.get('flutter', {}).get('flutter_suspected'))
        p_found, p_tested = (int(v) for v in quality['P_detectada_por_latido'].split('/'))
        cv_local = rt['CV_pct']
        cv_eff = cv_local if np.isfinite(cv_local) else (rhythm_cv_pct if rhythm_cv_pct is not None and np.isfinite(rhythm_cv_pct) else 0.0)
        min_p_beats = 1 if seconds <= 3.5 else 2
        p_reliable = (not flutter_flag and p is not None and on is not None and p_separated_from_qrs(cx.ms(p[1]), cx.ms(on))
                      and p_tested >= min_p_beats and p_found >= min_p_beats and p_found / p_tested >= .5
                      and cv_eff <= 14.5 and rt['RR_medio'] >= 480)
        if not p_reliable:
            bounds = [m for m in bounds if m['phase'] != 'p']
        def mv(key):
            v = d.get(key)
            return v / 10 if v is not None else None
        qrs_on = cx.ms(on) if on is not None else None
        st60, st80 = mv('ST_J60_mm'), mv('ST_J80_mm')
        st_slope = None if st60 is None or st80 is None else ('up' if st80-st60 > .05 else 'down' if st80-st60 < -.05 else 'flat')
        r_amp, t_amp = mv('R_mm'), mv('T_amp_mm')
        noise_mv = quality['ruido_latido_individual_uV']/1000
        tq_ratio = abs(t_amp/r_amp) if t_amp is not None and r_amp is not None and abs(r_amp) > .05 else None
        pr_seg_mv = mv('nivel_PR_mm')
        if not (p_reliable and pr_seg_mv is not None and abs(pr_seg_mv) <= .35):
            pr_seg_mv = None
        r_peak_ms = None
        if on is not None and r_amp is not None and r_amp >= max(.05, 4 * noise_mv) and aux['J'] > on:
            q_seg = aux['Bs'][lead][on:aux['J']+1] - aux['nivel'][lead]
            if len(q_seg):
                q_max = float(np.max(q_seg))
                if q_max > 0.15:
                    hi_peaks = np.flatnonzero(q_seg >= 0.78 * q_max)
                    r_peak_ms = float(int(hi_peaks[-1])) if len(hi_peaks) else float(int(np.argmax(q_seg)))
                else:
                    r_peak_ms = float(int(np.argmax(q_seg)))
        q_mv_val = mv('Q_mm')
        q_ms_val = d.get('Q_dur_ms') if (d.get('Q_dur_ms') or 0) > 0 else None
        if q_ms_val is None and d.get('morfologia') != 'QS' and q_mv_val is not None and q_mv_val <= -0.04 and on is not None and aux['J'] > on:
            q_seg_q = aux['B'][lead][on:aux['J']+1] - aux['nivel'][lead]
            if len(q_seg_q) >= 5:
                pos_idx = np.flatnonzero(q_seg_q >= max(0.03, 0.20 * float(np.max(q_seg_q))))
                first_r = int(pos_idx[0]) if len(pos_idx) else len(q_seg_q)
                neg_q = int(np.sum(q_seg_q[:first_r] <= -0.015))
                if neg_q >= 5:
                    q_ms_val = float(neg_q)
        p_term_mv, p_term_ms, p_biphasic = None, None, None
        if p_reliable and p is not None:
            p_seg = aux['B'][lead][p[0]:p[1]+1] - aux['nivel'][lead]
            if len(p_seg) >= 10:
                neg_idx = np.flatnonzero(p_seg < -0.015)
                if len(neg_idx) > 0 and float(np.max(p_seg)) > 0.015 and neg_idx[-1] > int(np.argmax(p_seg)):
                    p_term_mv = float(np.min(p_seg))
                    p_term_ms = float(len(neg_idx))
                    p_biphasic = bool(len(neg_idx) >= 20)
                else:
                    p_term_mv, p_term_ms, p_biphasic = 0.0, 0.0, False
        detail = dict(beatRMv=[b['R_mm']/10 for b in res['por_latido_detalle']],
            peaksSeconds=[float(r)/1000 for r in aux['R']], qrsMs=iv['QRS'],
            pOnsetOffsetMs=cx.ms(p[0]) if p_reliable else None,
            tOnsetOffsetMs=t_onset_ms if t_reliable else None,
            tEndOffsetMs=t_end_ms if t else None,
            qrsOnsetOffsetMs=qrs_on, qrsEndOffsetMs=cx.ms(aux['J']), netQrsMvMs=d.get('area_QRS'),
            jMv=mv('ST_J_mm'), stMv=mv('ST_J60_mm'), rMv=mv('R_mm'), sMv=mv('S_mm'),
            tMv=mv('T_amp_mm'), pMv=mv('P_amp_mm') if p_reliable else None, noiseMv=noise_mv,
            rrCv=rt['CV_pct']/100, beatCount=rt['n_latidos'], completeBeatCount=d.get('n_latidos', 0),
            morphology=dict(stSlope=st_slope, prSegMv=pr_seg_mv, tQrsRatio=tq_ratio, deltaSlurMs=None,
                qMv=q_mv_val, qMs=q_ms_val, qsComplex=d.get('morfologia') == 'QS',
                rPeakMs=r_peak_ms, rPrime=None, notched=None, pMs=iv['P_dur'] if p_reliable else None, pTerminalMv=p_term_mv,
                pTerminalMs=p_term_ms, pBiphasic=p_biphasic))
        complexes = []
        fs = len(trace['mv']) / seconds
        raw = np.asarray(trace['mv'], float)
        for m in bounds:
            if m['phase'] != 'qrs' or m['start'] < .05: continue
            lo, hi = int(m['start']*fs), int(np.ceil(m['end']*fs))
            base = raw[max(0, lo-round(fs*.04)):max(0, lo-round(fs*.008))]
            segment = raw[lo:hi+1]
            if len(base) == 0 or len(segment) < 5: continue
            a = np.convolve(np.pad(segment, (1,1), mode='edge'), np.ones(3)/3, mode='valid') - np.median(base)
            maximum, minimum, peak = float(a.max()), float(a.min()), int(a.argmax())
            peaks = []
            for i in range(2, len(a)-2):
                if a[i] > .06 and a[i] >= a[i-1] and a[i] > a[i+1] and a[i] - min(a[i-2], a[i+2]) > .008:
                    if not peaks or i-peaks[-1] > fs*.02: peaks.append(i)
                    elif a[i] > a[peaks[-1]]: peaks[-1] = i
            rsr = len(peaks)>=2 and peaks[-1]>len(a)*.5 and min(a[peaks[0]:peaks[-1]+1])<min(a[peaks[0]],a[peaks[-1]])*.5
            longest = run = 0
            for value in a[peak:]:
                run = run+1 if value < -max(.04, maximum*.12) else 0
                longest = max(longest, run)
            complexes.append(dict(rsr=bool(rsr), terminalS=longest/fs>=.04,
                broadLateR=maximum>.12 and np.sum(a>=maximum*.5)/fs>=.04 and peak/fs>=.06,
                noInitialQ=bool(np.min(a[:max(2,round(len(a)*.25))])>-.04),
                negativeDominant=minimum<-.1 and abs(minimum)>maximum*1.2))
        delta = delta_evidence(x, lead, res, aux, seconds)
        detail['morphology']['deltaEvidence'] = delta
        detail['morphology']['deltaSlurMs'] = delta['durationMs'] if delta['status'] == 'supported' else None
        detail['clinicalMorphology'] = {key: (sum(c[key] for c in complexes)/len(complexes)>=.75 if len(complexes)>=2 else False)
            for key in ('rsr','terminalS','broadLateR','noInitialQ','negativeDominant')}
        detail['clinicalMorphology']['beats'] = len(complexes)
        if len(complexes) >= 2:
            morf_str = d.get('morfologia', '')
            qr_rbbb = bool(lead in ('V1', 'V2') and q_mv_val is not None and q_mv_val <= -0.10 and r_amp is not None and r_amp >= 0.35 and r_peak_ms is not None and r_peak_ms >= 55.0)
            detail['morphology']['rPrime'] = bool("'" in morf_str or detail['clinicalMorphology']['rsr'] or qr_rbbb)
            detail['morphology']['notched'] = bool("'" in morf_str or detail['clinicalMorphology']['rsr'] or detail['clinicalMorphology']['broadLateR'] or qr_rbbb)
        return res, bounds, detail
    rhythm_result, rhythm_markers, rhythm_detail = None, [], None
    rhythm_rr_ms, rhythm_cv_pct = None, None
    if rhythm_trace is not None and rhythm_lead in LEADS:
        try:
            rhythm_result, rhythm_markers, rhythm_detail = one(rhythm_lead, rhythm_trace)
            rhythm_rr_ms = rhythm_result['ritmo']['RR_medio']
            rhythm_cv_pct = rhythm_result['ritmo']['CV_pct']
        except (ValueError, IndexError, KeyError, TypeError, FloatingPointError, ZeroDivisionError) as e:
            failures.append(f'ritmo {rhythm_lead}: {str(e)[:100]}')
    pending_single_beat = []
    for lead, trace in traces.items():
        if lead not in LEADS: continue
        try:
            results[lead], markers[lead], details[lead] = one(lead, trace, rr_hint_ms=rhythm_rr_ms, rhythm_cv_pct=rhythm_cv_pct)
        except (ValueError, IndexError, KeyError, TypeError, FloatingPointError, ZeroDivisionError) as e:
            if '2 latidos' in str(e) and float(trace.get('seconds', 0)) <= 3.5:
                pending_single_beat.append(lead)
            else:
                failures.append(f'{lead}: {str(e)[:100]}')
    inferred_rr = rhythm_rr_ms or (float(np.median([r['ritmo']['RR_medio'] for r in results.values()])) if results else None)
    for lead in pending_single_beat:
        try:
            results[lead], markers[lead], details[lead] = one(lead, traces[lead], rr_hint_ms=inferred_rr, rhythm_cv_pct=rhythm_cv_pct)
        except (ValueError, IndexError, KeyError, TypeError, FloatingPointError, ZeroDivisionError) as e:
            failures.append(f'{lead}: {str(e)[:100]}')
    # Two predefined, light smoothing attempts only for failed delineation or a
    # QRS endpoint that reaches v3's fixed search limit. Never select by a target
    # diagnosis or by agreement with another lead.
    attempts = 1
    retry_summary = []
    retry_candidates = [lead for lead in LEADS if lead in traces and
        (lead not in results or results[lead]['intervalos']['QRS_fin_J'] >= 150)][:4]
    def score(candidate):
        result = candidate[0]; stats = result['por_latido_DII']['QRS']; iv = result['intervalos']
        if stats['n'] < 2 or stats['DE'] is None or not np.isfinite(stats['DE']): return float('inf')
        return float(stats['DE'] + abs(stats['media'] - iv['QRS']) + 1000*result['_filterResidualMv'])
    for lead in retry_candidates:
        base = (results[lead], markers[lead], details[lead]) if lead in results else None
        chosen, selected = base, 'original' if base else None
        for window in (5, 9):
            attempts = max(attempts, 2 if window == 5 else 3)
            try:
                candidate = one(lead, traces[lead], window, rr_hint_ms=inferred_rr, rhythm_cv_pct=rhythm_cv_pct)
                raw = np.asarray(traces[lead]['mv'], float)
                spread = float(np.std(raw))
                # 0.01 mV and 5% of waveform spread are hard distortion limits.
                if candidate[0]['_filterResidualMv'] > min(.01, max(.001, .05*spread)): continue
                if score(candidate) < (score(chosen) if chosen else float('inf')):
                    chosen, selected = candidate, f'sg-{window}ms'
            except (ValueError, IndexError, KeyError, TypeError, FloatingPointError, ZeroDivisionError):
                continue
        if chosen:
            results[lead], markers[lead], details[lead] = chosen
            failures = [f for f in failures if not f.startswith(lead + ': ')]
        retry_summary.append(dict(lead=lead, selected=selected or 'none',
            endpointAtLimit=bool(chosen and chosen[0]['intervalos']['QRS_fin_J'] >= 150)))
    if not results and rhythm_result is None:
        raise ValueError('Ninguna traza pudo analizarse: ' + '; '.join(failures))
    def median(values):
        v = [float(x) for x in values if x is not None and np.isfinite(x)]
        return float(np.median(v)) if v else None
    short_ref = results.get('II') or next(iter(results.values()), rhythm_result)
    ref = rhythm_result or short_ref
    cv = ref['ritmo']['CV_pct']
    prs = [results[k]['intervalos']['PR'] for k,d in details.items() if d['pMv'] is not None]
    pr_iqr = float(np.percentile(prs, 75) - np.percentile(prs, 25)) if len(prs) >= 3 else 0.0
    irregular = np.isfinite(cv) and (cv > 14.5 or (cv > 10.0 and not (len(prs) >= 3 and pr_iqr < 25.0)))
    flutter_info = ref['calidad'].get('flutter', {})
    flutter_suspected = bool(flutter_info.get('flutter_suspected')) and not (np.isfinite(cv) and cv > 22.0)
    diast_p = ref.get('calidad', {}).get('diastolic_p', {})
    has_av_dissociation = (not irregular and diast_p.get('p_qrs_ratio') is not None
                           and diast_p['p_qrs_ratio'] >= 1.55 and diast_p.get('av_pr_variable') is True)
    # P must be supported in at least three leads and not confounded by diastolic flutter waves or AV dissociation.
    pr = median(prs) if len(prs) >= 3 and not irregular and not flutter_suspected and not has_av_dissociation else None
    areas = {k: r['derivaciones'][k]['area_QRS'] for k, r in results.items() if k in E.LIMB and k in r['derivaciones']}
    p_areas = {k: r['derivaciones'][k]['area_P'] for k, r in results.items() if k in E.LIMB and k in r['derivaciones'] and r['derivaciones'][k].get('area_P') is not None}
    t_areas = {k: r['derivaciones'][k]['area_T'] for k, r in results.items() if k in E.LIMB and k in r['derivaciones'] and r['derivaciones'][k].get('area_T') is not None}
    axis = None
    p_axis = None
    t_axis = None
    if len(areas) >= 4 and not irregular and axis_comparable:
        angle, magnitude, fit = E.eje_ls(areas)
        if np.isfinite(fit) and fit >= .8 and magnitude > 1: axis = angle
        if len(p_areas) >= 4 and pr is not None:
            pa, pmag, pfit = E.eje_ls(p_areas)
            if np.isfinite(pfit) and pfit >= .65 and pmag > .1: p_axis = pa
        if len(t_areas) >= 4:
            ta, tmag, tfit = E.eje_ls(t_areas)
            if np.isfinite(tfit) and tfit >= .7 and tmag > .2: t_axis = ta
    if pr is None:
        for arr in markers.values(): arr[:] = [m for m in arr if m['phase'] != 'p']
    warn = ['Las marcas proyectan límites del latido mediano sobre los picos R; la onda T delimita inicio por curvatura y fin por fusión tangente-curvatura.',
            'Las derivaciones se analizan independientemente; el eje requiere ajuste coherente de las derivaciones de miembros.']
    if irregular: warn.append('Ritmo irregular: PR y eje no evaluables con el latido mediano.')
    if flutter_suspected: warn.append(f"Actividad auricular rápida compatible con ondas F de flutter (~{flutter_info.get('atrial_rate_bpm')} lpm): ondas P automáticas suprimidas.")
    if len(prs) < 3: warn.append('P/PR no evaluable: apoyo insuficiente en tres derivaciones.')
    if ref['ritmo']['RR_medio'] < 500: warn.append('RR medio inferior a 500 ms: P y PR automáticos no evaluables por posible superposición con la onda T precedente.')
    for res in list(results.values()) + ([rhythm_result] if rhythm_result else []):
        for warning in res['calidad']['avisos']:
            if not warning.startswith('Solo 1 derivaciones') and warning not in warn:
                warn.append(warning)
    warn.extend(failures)
    all_supported = [k for k,d in details.items() if d['completeBeatCount'] >= 1 and np.isfinite(d['qrsMs']) and np.isfinite(d['noiseMv']) and d['noiseMv'] < .03]
    censored = [k for k in all_supported if results[k]['intervalos']['QRS_fin_J'] >= 150]
    supported = [k for k in all_supported if k not in censored]
    # A lone extreme lead does not define global width: require another
    # independently measured local duration within 20 ms, where possible.
    aligned = None
    if simultaneous:
        try:
            aligned_leads = list(results)
            durations = [float(traces[k]['seconds']) for k in aligned_leads]
            if len(aligned_leads) < 3 or max(durations)-min(durations) > .004:
                raise ValueError('Las derivaciones no comparten duración suficiente para alineación.')
            arrays = []
            for k in aligned_leads:
                trace = traces[k]; ratio = Fraction(1000 * trace['seconds'] / len(trace['mv'])).limit_denominator(10000)
                arrays.append(resample_poly(np.asarray(trace['mv'], float), ratio.numerator, ratio.denominator))
            if max(map(len, arrays)) - min(map(len, arrays)) > 4:
                raise ValueError('Las longitudes remuestreadas no permiten alineación.')
            n = min(map(len, arrays)); segs = [dict(lead=k,row=i,lo=0,hi=n,full=True,col=0) for i,k in enumerate(aligned_leads)]
            ext = dict(sig=np.stack([a[:n] for a in arrays]), segs=segs, ncol=1, layout=[aligned_leads],
                       vel=25, gan=10, control={'modo':'señal digital simultánea'}, fs_orig=1000, supuestos=[])
            with warnings.catch_warnings():
                warnings.simplefilter('ignore', RuntimeWarning)
                multi, multi_aux = E.analizar(ext)
            duration = multi['intervalos']['QRS']; endpoint = multi['intervalos']['QRS_fin_J']
            if not np.isfinite(duration) or not 36 <= duration <= 250 or endpoint >= 150:
                raise ValueError('Límite global de QRS incierto o truncado.')
            aligned = dict(qrsMs=float(duration), leads=aligned_leads, beatCount=multi['ritmo']['n_latidos'],
                           qrsOnsetOffsetMs=float(multi['intervalos']['QRS_on']), qrsEndOffsetMs=float(endpoint),
                           peaksSeconds=[float(r)/1000 for r in multi_aux['R']])
        except (ValueError, IndexError, KeyError, TypeError, FloatingPointError, ZeroDivisionError) as error:
            warn.append('Alineación simultánea no evaluable: ' + str(error)[:120])
    qrs_consensus = [k for k in supported if any(other != k and abs(details[k]['qrsMs'] - details[other]['qrsMs']) <= 20 for other in supported)]
    if len(supported) >= 6 and np.median([details[k]['qrsMs'] for k in supported]) < 108:
        wide_cnt = sum(1 for k in supported if details[k]['qrsMs'] >= 120)
        has_prec_rprime = any(details.get(rk, {}).get('morphology', {}).get('rPrime') for rk in ('V1', 'V2', 'V3'))
        if wide_cnt <= 2 and not has_prec_rprime:
            qrs_consensus = [k for k in qrs_consensus if details[k]['qrsMs'] < 120]
    qrs_selected = qrs_consensus if len(supported) >= 2 else supported
    excluded_qrs = [k for k in all_supported if k not in qrs_selected]
    if excluded_qrs:
        warn.append('QRS local discordante sin otra derivación cercana (20 ms): ' + ', '.join(excluded_qrs) + '; revisar sus límites.')
    if len(supported) >= 2 and not qrs_consensus:
        warn.append('No hay acuerdo entre duraciones locales de QRS; medida global no evaluable.')
    measurements = dict(rateBpm=short_ref['ritmo']['FC_media'], prMs=pr,
        qrsMs=max((details[k]['qrsMs'] for k in qrs_selected), default=None),
        qtMs=median([r['intervalos']['QT_tangente'] for r in results.values()]), axisDeg=axis)
    if aligned:
        measurements['qrsMs'] = aligned['qrsMs']
    reference = 'II' if 'II' in results else next(iter(results), rhythm_lead)
    measurement_leads = {k: ([reference] if k == 'rateBpm' else list(areas) if k == 'axisDeg' else qrs_selected if k == 'qrsMs' else list(results))
                         for k, value in measurements.items() if value is not None}
    ref_din = ref.get('dinamica', {})
    ref_found, ref_tested = (int(v) for v in ref['calidad']['P_detectada_por_latido'].split('/'))
    p_conducted_frac = (ref_found / ref_tested) if (ref_tested >= 2 and pr is not None) else None
    p_rate_bpm = None
    p_qrs_ratio = None
    pr_var_out = ref_din.get('pr_variable') if not irregular and not flutter_suspected else None
    p_present_out = True if pr is not None else None
    vent_rate = ref['ritmo']['FC_media'] if rhythm_result else measurements['rateBpm']
    if flutter_suspected:
        p_present_out = True
        p_rate_bpm = flutter_info.get('atrial_rate_bpm')
        if p_rate_bpm is not None and vent_rate and vent_rate > 0:
            p_qrs_ratio = round(float(p_rate_bpm) / float(vent_rate), 2)
    elif diast_p.get('p_qrs_ratio') is not None and vent_rate is not None and vent_rate <= 82 and (
            (not irregular and diast_p['p_qrs_ratio'] >= 1.55)
            or (diast_p['p_qrs_ratio'] >= 1.45 and diast_p.get('av_pr_variable') is True)):
        raw_ratio = float(diast_p['p_qrs_ratio'])
        p_qrs_ratio = 2.0 if (not irregular and 1.75 <= raw_ratio <= 2.3) else round(raw_ratio, 2)
        p_rate_bpm = diast_p.get('p_rate_bpm')
        p_present_out = True
        if diast_p.get('av_pr_variable') is not None:
            pr_var_out = bool(diast_p['av_pr_variable'])
    estimate = dict(measurements=measurements, markersByLead=markers, leadDetails=details,
        measurementLeads=measurement_leads, reasons={k: ('pUnavailable' if k == 'prMs' else 'axisUnavailable' if k == 'axisDeg' else 'detectionUncertain') for k,v in measurements.items() if v is None},
        qrsMethod=('robust-local-consensus' if len(supported) >= 2 else 'maximum-supported-local') if measurements['qrsMs'] is not None else 'not-evaluable',
        globalFeatures=dict(
            pAxisDeg=p_axis,
            tAxisDeg=t_axis,
            prVariable=pr_var_out,
            pConductedFraction=p_conducted_frac,
            pRateBpm=p_rate_bpm,
            pQrsRatio=p_qrs_ratio,
            groupedBeating=ref_din.get('grouped_beating'),
            qrsAlternans=ref_din.get('qrs_alternans'),
            pPresent=p_present_out,
            flutterSuspected=flutter_suspected,
            atrialRateBpm=flutter_info.get('atrial_rate_bpm'),
            wenckebachSuspected=bool(ref_din.get('wenckebach_suspected')),
            pvcCount=int(ref_din.get('pvc_count', 0)),
            pacCount=int(ref_din.get('pac_count', 0)),
        ))
    if aligned:
        estimate['qrsMethod'] = 'global-simultaneous'
        estimate['measurementLeads']['qrsMs'] = aligned['leads']
    estimate['global'] = estimate.pop('globalFeatures')
    qualifying = [k for k,d in details.items() if d['morphology']['deltaEvidence']['status'] == 'supported']
    evaluable = [k for k,d in details.items() if d['morphology']['deltaEvidence']['status'] != 'not-evaluable']
    # This aggregate is waveform evidence, not a diagnosis of preexcitation.
    status = 'supported' if (len(qualifying) >= 3 or (len(qualifying) >= 1 and pr is not None and pr < 115 and measurements['qrsMs'] is not None and measurements['qrsMs'] >= 120)) else 'not-supported' if len(evaluable) >= 3 and not qualifying else 'not-evaluable'
    estimate['global']['preexcitation'] = dict(status=status, supportingLeads=qualifying,
        limitations=['Candidatos por derivación y latido, sin suponer simultaneidad; técnica no validada clínicamente.',
                     'La falta de evidencia no excluye preexcitación; confirmar límites en el ECG original.'])
    auto_windows = {}
    for key in ('prMs', 'qrsMs', 'qtMs'):
        if measurements[key] is None: continue
        windows = []
        for lead in measurement_leads.get(key, []):
            detail, trace = details[lead], traces[lead]
            for r in detail['peaksSeconds']:
                start_ms = detail['pOnsetOffsetMs'] if key == 'prMs' else detail['qrsOnsetOffsetMs']
                end_ms = detail['qrsOnsetOffsetMs'] if key == 'prMs' else detail['qrsEndOffsetMs'] if key == 'qrsMs' else detail['tEndOffsetMs']
                if start_ms is None or end_ms is None: continue
                start, end = r + start_ms/1000, r + end_ms/1000
                if np.isfinite(start) and np.isfinite(end) and 0 <= start < end <= trace['seconds']:
                    windows.append(dict(lead=lead,start=round(start,4),end=round(end,4),source='automatic'))
                    break
        if windows: auto_windows[key] = windows
    ref_detail = rhythm_detail if rhythm_result else details.get(reference)
    if ref_detail and len(ref_detail['peaksSeconds']) >= 2:
        auto_windows['rateBpm'] = [dict(lead=reference,**({'captureLead':'II-long'} if rhythm_result and rhythm_lead == 'II' else {}),
            start=ref_detail['peaksSeconds'][0], end=ref_detail['peaksSeconds'][-1], source='automatic')]
    if aligned and aligned['peaksSeconds']:
        for r in aligned['peaksSeconds']:
            a, b = r+aligned['qrsOnsetOffsetMs']/1000, r+aligned['qrsEndOffsetMs']/1000
            if 0 <= a < b <= min(float(traces[k]['seconds']) for k in aligned['leads']):
                auto_windows['qrsMs'] = [dict(lead=k,start=round(a,4),end=round(b,4),source='automatic') for k in aligned['leads']]
                break
    estimate['measurementWindows'] = auto_windows
    rhythm_estimate = None
    if rhythm_result:
        rr_cv = rhythm_result['ritmo']['CV_pct']
        detected, tested = (int(v) for v in rhythm_result['calidad']['P_detectada_por_latido'].split('/'))
        rhythm_pr = rhythm_result['intervalos']['PR'] if rhythm_detail['pMv'] is not None and tested >= 4 and detected/tested >= .75 and np.isfinite(rr_cv) and rr_cv <= 10 else None
        if rhythm_pr is None:
            rhythm_markers = [m for m in rhythm_markers if m['phase'] != 'p']
        qrs_supported = rhythm_detail['completeBeatCount'] >= 1 and np.isfinite(rhythm_detail['noiseMv']) and rhythm_detail['noiseMv'] < .03 and np.isfinite(rhythm_detail['qrsMs'])
        rm = dict(rateBpm=rhythm_result['ritmo']['FC_media'], prMs=rhythm_pr,
                  qrsMs=rhythm_detail['qrsMs'] if qrs_supported else None,
                  qtMs=rhythm_result['intervalos']['QT_tangente'], axisDeg=None)
        rhythm_estimate = dict(measurements=rm, markersByLead={rhythm_lead: rhythm_markers}, leadDetails={rhythm_lead: rhythm_detail},
            measurementLeads={k: [rhythm_lead] for k,v in rm.items() if v is not None and np.isfinite(v)},
            reasons={k: ('pUnavailable' if k == 'prMs' else 'axisUnavailable' if k == 'axisDeg' else 'detectionUncertain') for k,v in rm.items() if v is None or not np.isfinite(v)},
            qrsMethod='maximum-supported-local' if qrs_supported else 'not-evaluable',
            globalFeatures=None)
        r_din = rhythm_result.get('dinamica', {})
        r_flut = rhythm_result.get('calidad', {}).get('flutter', {})
        rhythm_estimate['global'] = dict(pAxisDeg=None, tAxisDeg=None, prVariable=r_din.get('pr_variable'),
            pConductedFraction=detected/tested if tested >= 4 and rhythm_detail['pMv'] is not None else None,
            qrsAlternans=r_din.get('qrs_alternans'),
            pPresent=False if r_flut.get('flutter_suspected') else (True if rhythm_pr is not None else None),
            flutterSuspected=bool(r_flut.get('flutter_suspected')),
            atrialRateBpm=r_flut.get('atrial_rate_bpm'),
            wenckebachSuspected=bool(r_din.get('wenckebach_suspected')),
            pvcCount=int(r_din.get('pvc_count', 0)),
            pacCount=int(r_din.get('pac_count', 0)))
        del rhythm_estimate['globalFeatures']
    manual = {}
    for key, windows in (measurement_windows or {}).items():
        if key not in ('prMs', 'qrsMs', 'qtMs', 'axisDeg') or not isinstance(windows, list): continue
        valid = []
        for w in windows:
            lead = w.get('lead'); trace = rhythm_trace if w.get('captureLead') == 'II-long' else traces.get(lead)
            if not trace: continue
            a, b = w.get('start'), w.get('end')
            if not isinstance(a, (float,int)) or not isinstance(b, (float,int)) or not (0 <= a < b <= trace['seconds']): continue
            valid.append((lead, trace, a, b))
        if key != 'axisDeg' and valid:
            manual[key] = (valid[0][3] - valid[0][2]) * 1000
        elif key == 'axisDeg' and axis_comparable:
            areas_manual = {}
            for lead, trace, a, b in valid:
                if lead not in ('I', 'aVF'): continue
                fs = len(trace['mv']) / trace['seconds']; x = np.asarray(trace['mv'], float)
                lo, hi = int(a*fs), int(b*fs)
                baseline = x[max(0, lo-int(.08*fs)):lo]
                if len(baseline) and hi > lo and np.isfinite(x[lo:hi]).all():
                    areas_manual[lead] = float(np.sum(x[lo:hi] - np.median(baseline)) / fs)
            if len(areas_manual) == 2 and np.hypot(areas_manual['I'], areas_manual['aVF']) > .001:
                manual[key] = float(np.degrees(np.arctan2(areas_manual['aVF'] * 2 / np.sqrt(3), areas_manual['I'])))
    final_qt = manual.get('qtMs', measurements['qtMs'])
    final_qrs = manual.get('qrsMs', measurements['qrsMs'])
    final_rate = rhythm_result['ritmo']['FC_media'] if rhythm_result else measurements['rateBpm']
    derived = dict(qtcFridericiaMs=None, qtcBazettMs=None, qtcBogossianMs=None)
    if (not irregular and final_qt is not None and final_qrs is not None and final_rate is not None
            and np.isfinite(final_qt) and np.isfinite(final_qrs) and np.isfinite(final_rate)
            and 0 < final_qt and 0 < final_rate):
        rr_seconds = 60 / final_rate
        if 0 < final_qrs < 120:
            derived = dict(qtcFridericiaMs=final_qt / rr_seconds**(1/3), qtcBazettMs=final_qt / np.sqrt(rr_seconds), qtcBogossianMs=None)
        elif final_qrs >= 120:
            qt_bogossian = max(120.0, final_qt - 0.485 * (final_qrs - 100.0))
            derived = dict(qtcFridericiaMs=None, qtcBazettMs=None, qtcBogossianMs=qt_bogossian / rr_seconds**(1/3))
    return limpio(dict(schemaVersion=1, ok=True, engine='ecg_analisis-signals-v3.2', estimate=estimate, manualMeasurements=manual, derived=derived,
        rhythmEstimate=rhythm_estimate,
        quality=dict(refinement=dict(attempts=attempts,selected='consenso-local',reason='QRS con corroboración local de 20 ms; reintentos solo en fallos o límites truncados, elegidos por repetibilidad y distorsión de señal.',excludedLeads=excluded_qrs,retries=retry_summary,simultaneousAligned=bool(aligned)), warnings=warn, irregular=bool(irregular), analyzedLeads=list(results), referenceLead=rhythm_lead if rhythm_result else ('II' if 'II' in results else next(iter(results))),
                     pDetectedLeads=len(prs), rrCvPct=cv)))


def measure_signals(payload):
    """Same input contract used by the browser worker, usable from CPython."""
    if not isinstance(payload, dict):
        raise ValueError('Entrada inválida')
    return measure_traces(payload.get('traces'), payload.get('rhythmTrace'), payload.get('rhythmLead'),
                          payload.get('measurementWindows'), payload.get('axisComparable', False), payload.get('simultaneous', False))
