"""Confirmed-annotation ECG delineation benchmark across LUDB (1.0.1) and QTDB (1.0.0).

Trains and benchmarks:
1. trained_extra_trees: Six multi-estimator boundary regressors around detected R-peaks
2. trained_neural_mlp: Regularized MLP neural boundary regressors on multiscale beat derivatives
3. trained_1d_resse_unet (when PyTorch is available): ECGResSEUNet1D + Prewitt BoundaryLoss
4. ecg_analisis_v3_hybrid: Production curvature+tangent+flutter hybrid engine (server/measure/)
5. neurokit2_dwt: Independent wavelet comparator
"""
import hashlib
import json
import subprocess
import sys
import time
import warnings
from pathlib import Path

import joblib
import neurokit2 as nk
import numpy as np
import wfdb
from scipy.signal import resample_poly
from sklearn.ensemble import ExtraTreesRegressor
from sklearn.neural_network import MLPRegressor
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path("data/clinical-run")
OUT = Path("training/clinical-run")
SEED = 20261112
KEYS = ["p_onset", "p_offset", "qrs_onset", "qrs_offset", "t_onset", "t_offset"]
NK_KEYS = ["ECG_P_Onsets", "ECG_P_Offsets", "ECG_R_Onsets", "ECG_R_Offsets", "ECG_T_Onsets", "ECG_T_Offsets"]

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "server" / "measure"))
import delineation_unet as du  # noqa: E402
import run_measure  # noqa: E402


def references(annotation, fs):
    waves = []
    start = None
    active = None
    for sample, symbol in zip(annotation.sample, annotation.symbol):
        if symbol == "(":
            start = int(sample)
            active = None
        elif symbol in ["p", "N", "t"]:
            active = {"kind": symbol, "peak": int(sample), "start": start, "end": None}
            waves.append(active)
            start = None
        elif symbol == ")":
            if active is not None:
                active["end"] = int(sample)
            active = None
            start = None
    out = []
    for wave in waves:
        if wave["kind"] != "N":
            continue
        r = wave["peak"]
        previous = [w for w in waves if w["kind"] == "p" and r - fs * 0.6 < w["peak"] < r]
        following = [w for w in waves if w["kind"] == "t" and r < w["peak"] < r + fs * 0.9]
        p = previous[-1] if previous else {}
        t = following[0] if following else {}
        values = [p.get("start"), p.get("end"), wave["start"], wave["end"], t.get("start"), t.get("end")]
        offsets = np.array([np.nan if x is None else (x - r) / fs for x in values])
        out.append({"r": r / fs, "offsets": offsets})
    return out


def load(source, row):
    path = ROOT / source / row["record"]
    record = wfdb.rdrecord(str(path))
    lead = next((i for i, s in enumerate(record.sig_name) if s.lower() in ["ii", "mlii"]), 0)
    signal = record.p_signal[:, lead].astype(float)
    units = record.units[lead].lower()
    signal *= {"mv": 1, "uv": 0.001, "v": 1000}[units]
    annotation = wfdb.rdann(str(path), "ii" if source == "ludb" else "q1c")
    refs = references(annotation, record.fs)
    if not refs:
        raise ValueError("No reference QRS peaks")
    clusters = []
    for ref in refs:
        if not clusters or ref["r"] - clusters[-1][-1]["r"] > 8:
            clusters.append([ref])
        else:
            clusters[-1].append(ref)
    windows = []
    for cluster in clusters:
        lo = max(0, int((cluster[0]["r"] - 3) * record.fs))
        hi = min(len(signal), int((cluster[-1]["r"] + 3) * record.fs))
        s = signal[lo:hi]
        refs_local = [{"r": r["r"] - lo / record.fs, "offsets": r["offsets"]} for r in cluster]
        s = resample_poly(s, 250, int(record.fs))
        # Chunk any unusually long QTDB cluster to <= 28s so run_measure constraints hold cleanly
        max_len = 28 * 250
        if len(s) <= max_len:
            windows.append({"signal": s, "refs": refs_local, "seconds": len(s) / 250, "original_offset_s": lo / record.fs})
        else:
            for st in range(0, len(s), 20 * 250):
                en = min(len(s), st + max_len)
                t0, t1 = st / 250, en / 250
                sub_refs = [{"r": r["r"] - t0, "offsets": r["offsets"]} for r in refs_local if t0 + 0.5 <= r["r"] <= t1 - 0.5]
                if sub_refs and en - st >= 500:
                    windows.append({"signal": s[st:en], "refs": sub_refs, "seconds": (en - st) / 250, "original_offset_s": lo / record.fs + t0})
    return windows, record.fs, lead


def feature(signal, r):
    at = int(round(r * 250))
    lo = at - 125
    hi = at + 200
    if lo < 0 or hi > len(signal):
        return None
    a = signal[lo:hi].copy()
    a -= np.median(a[:75])
    scale = max(0.05, float(np.quantile(a, 0.95) - np.quantile(a, 0.05)))
    shape = a / scale
    template = np.interp(np.linspace(0, len(a) - 1, 192), np.arange(len(a)), shape)
    d1 = np.diff(template)
    d2 = np.diff(d1, prepend=d1[0])
    return np.r_[template, d1, d2, np.abs(d1), scale, np.std(a)]


def comparator(signal):
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        clean = nk.ecg_clean(signal, sampling_rate=250)
        _, info = nk.ecg_peaks(clean, sampling_rate=250)
        peaks = np.array(info["ECG_R_Peaks"], dtype=int)
        _, waves = nk.ecg_delineate(clean, rpeaks=peaks, sampling_rate=250, method="dwt")
    return peaks / 250, waves


def hybrid_engine_markers(signal, seconds):
    """Run our upgraded server/measure/ecg_analisis.py + run_measure.py engine on a 250 Hz strip."""
    res = run_measure.measure_traces({"II": {"mv": [float(v) for v in signal], "seconds": float(seconds)}}, rhythm_lead="II", axis_comparable=False, simultaneous=False)
    markers = res["estimate"]["markersByLead"].get("II", [])
    peaks = res["estimate"]["leadDetails"].get("II", {}).get("peaksSeconds", [])
    return markers, np.asarray(peaks, dtype=float)


def pair_hybrid_to_ref(markers, peaks, ref_r):
    if not markers:
        return None
    # Pair nearest marker of each phase within physiological proximity around ref_r
    out = [np.nan] * 6
    p_cands = [m for m in markers if m["phase"] == "p" and ref_r - 0.55 <= (m["start"] + m["end"]) / 2 <= ref_r - 0.02]
    q_cands = [m for m in markers if m["phase"] == "qrs" and abs((m["start"] + m["end"]) / 2 - ref_r) <= 0.15]
    t_cands = [m for m in markers if m["phase"] == "t" and ref_r + 0.04 <= (m["start"] + m["end"]) / 2 <= ref_r + 0.80]
    if p_cands:
        p = max(p_cands, key=lambda m: (m["start"] + m["end"]) / 2)
        out[0], out[1] = p["start"] - ref_r, p["end"] - ref_r
    if q_cands:
        q = min(q_cands, key=lambda m: abs((m["start"] + m["end"]) / 2 - ref_r))
        out[2], out[3] = q["start"] - ref_r, q["end"] - ref_r
    if t_cands:
        t = min(t_cands, key=lambda m: (m["start"] + m["end"]) / 2)
        out[4], out[5] = t["start"] - ref_r, t["end"] - ref_r
    return out


def train_unet_if_available(available):
    if du.torch is None:
        return None
    torch = du.torch
    torch.manual_seed(SEED)
    fit_win = [w for w in available if w["source"] == "ludb" and w["split"] == "fit"]
    if not fit_win:
        return None

    def make_xy(windows):
        xs, ys = [], []
        for w in windows:
            sig = w["signal"].astype(np.float32)
            # Standardize window amplitude gently
            scale = max(0.1, float(np.percentile(np.abs(sig), 99)))
            sig_n = np.clip(sig / scale, -5.0, 5.0)
            n = len(sig_n)
            target = np.zeros((4, n), dtype=np.float32)
            for r in w["refs"]:
                off = r["offsets"]
                for ch, (a_idx, b_idx) in [(1, (0, 1)), (2, (2, 3)), (3, (4, 5))]:
                    if np.isfinite(off[a_idx]) and np.isfinite(off[b_idx]):
                        s_i = max(0, int(round((r["r"] + off[a_idx]) * 250)))
                        e_i = min(n, int(round((r["r"] + off[b_idx]) * 250)))
                        if e_i > s_i:
                            target[ch, s_i:e_i] = 1.0
            target[0] = np.clip(1.0 - target[1:].max(axis=0), 0.0, 1.0)
            # Replicate 1-lead signal cleanly across 12 channels or instantiate in_leads=1
            xs.append(sig_n[np.newaxis, :])
            ys.append(target)
        return xs, ys

    xs, ys = make_xy(fit_win)
    model = du.ECGResSEUNet1D(in_leads=1, num_seg_classes=4, num_rhythm_classes=5, base_ch=16, depth=4, kernel_size=9)
    crit = du.JimenezPerezCompositeLoss(boundary_weight=0.5, instance_weight=0.25)
    opt = torch.optim.AdamW(model.parameters(), lr=2.5e-3, weight_decay=1e-3)
    rng = np.random.default_rng(SEED)

    # Batch equal-length LUDB windows (usually 2500 samples @ 250 Hz) for fast CPU training
    max_len = max(x.shape[-1] for x in xs)
    x_pad = np.zeros((len(xs), 1, max_len), dtype=np.float32)
    y_pad = np.zeros((len(xs), 4, max_len), dtype=np.float32)
    y_pad[:, 0, :] = 1.0
    for idx, (xv, yv) in enumerate(zip(xs, ys)):
        l = xv.shape[-1]
        x_pad[idx, :, :l] = xv
        y_pad[idx, :, :l] = yv

    model.train()
    rhythm_crit = torch.nn.BCEWithLogitsLoss()
    batch_size = 16
    for epoch in range(25):
        order = rng.permutation(len(xs))
        for start in range(0, len(xs), batch_size):
            idx_b = order[start : start + batch_size]
            xb = torch.from_numpy(x_pad[idx_b])
            yb = torch.from_numpy(y_pad[idx_b])
            has_p = (yb[:, 1].amax(dim=-1) > 0.5).float()
            ry_t = torch.stack([has_p, 1.0 - has_p, torch.zeros_like(has_p), torch.zeros_like(has_p), torch.zeros_like(has_p)], dim=-1)
            opt.zero_grad()
            seg_logits, rhythm_logits = model(xb)
            loss = crit(seg_logits, yb) + 0.15 * rhythm_crit(rhythm_logits, ry_t)
            loss.backward()
            opt.step()
    model.eval()
    return model


def aggregate(rows, method_names):
    result = {}
    for source in ["ludb", "qt"]:
        for split in ["fit", "selection", "test", "external"]:
            subset = [r for r in rows if r["source"] == source and r["split"] == split]
            if not subset:
                continue
            methods = {}
            for method in method_names:
                fields = {}
                for k, key in enumerate(KEYS):
                    relevant = [r for r in subset if np.isfinite(r["reference"][k])]
                    errors = [r[method][k] - r["reference"][k] for r in relevant if r.get(method) is not None and np.isfinite(r[method][k])]
                    a = np.array(errors) * 1000.0
                    fields[key] = {
                        "reference_boundaries": len(relevant),
                        "estimated_boundaries": len(a),
                        "coverage": len(a) / len(relevant) if relevant else None,
                        "median_absolute_error_ms": float(np.median(np.abs(a))) if len(a) else None,
                        "mae_ms": float(np.mean(np.abs(a))) if len(a) else None,
                        "p95_absolute_error_ms": float(np.quantile(np.abs(a), 0.95)) if len(a) else None,
                        "mean_error_ms": float(a.mean()) if len(a) else None,
                    }
                methods[method] = fields
            result[source + ":" + split] = {"records": len(set(r["record"] for r in subset)), "reference_beats": len(subset), "r_matched": sum(r["r_matched"] for r in subset), "methods": methods}
    return result


def main():
    started = time.time()
    manifest = json.loads((OUT / "cohort-manifest.json").read_text())
    available, failed, fixtures = [], [], []
    for source in ["ludb", "qt"]:
        for row in manifest["cohorts"][source]:
            try:
                windows, fs, lead = load(source, row)
            except Exception as e:
                failed.append({"source": source, "record": row["record"], "error": str(e)})
                continue
            for index, window in enumerate(windows):
                available.append(dict(window, source=source, record=row["record"] + f":window{index}", split=row["split"], original_fs=fs, original_lead_index=lead))
                fixtures.append({"source": source, "record": row["record"] + f":window{index}", "split": row["split"], "signal": window["signal"].tolist(), "seconds": window["seconds"]})

    (ROOT / "estimate-fixtures.json").write_text(json.dumps(fixtures))
    print("Annotated available windows", len(available), "failed records", len(failed), flush=True)

    X, Y = [], []
    for w in available:
        if w["source"] != "ludb" or w["split"] != "fit":
            continue
        for ref in w["refs"]:
            for shift in [0, -0.012, 0.012, 0.024]:
                x = feature(w["signal"], ref["r"] + shift)
                if x is not None:
                    X.append(x)
                    Y.append(ref["offsets"] - shift)
    if not X:
        raise RuntimeError("No annotated frozen training records")
    X, Y = np.array(X), np.array(Y)

    models, mlp_models = [], []
    for k in range(6):
        valid = np.isfinite(Y[:, k])
        m = ExtraTreesRegressor(n_estimators=128, min_samples_leaf=3, max_features=0.7, n_jobs=4, random_state=SEED + k)
        mlp = make_pipeline(StandardScaler(), MLPRegressor(hidden_layer_sizes=(128, 64), alpha=1e-2, early_stopping=True, max_iter=250, random_state=SEED + k))
        if valid.sum() < 8:
            models.append(None)
            mlp_models.append(None)
        else:
            m.fit(X[valid], Y[valid, k])
            mlp.fit(X[valid], Y[valid, k])
            models.append(m)
            mlp_models.append(mlp)
    print("Fitted ExtraTrees + MLP boundary regressors on", len(X), "augmented beats", flush=True)

    unet_model = train_unet_if_available(available)
    method_names = ["trained_extra_trees", "trained_neural_mlp", "ecg_analisis_v3_hybrid", "neurokit2_dwt"]
    if unet_model is not None:
        method_names.append("trained_1d_resse_unet")
        print("Trained ECGResSEUNet1D with Prewitt BoundaryLoss", flush=True)

    joblib.dump({"models": models, "mlp_models": mlp_models, "features": "delineation.py feature v2", "keys": KEYS, "approved": False}, ROOT / "delineator-candidate.joblib")

    rows = []
    comparison_failures = []
    for wi, w in enumerate(available):
        try:
            peaks, waves = comparator(w["signal"])
        except Exception as e:
            peaks = np.array([])
            waves = {}
            comparison_failures.append({"record": w["record"], "error": str(e)})
        try:
            hyb_markers, _ = hybrid_engine_markers(w["signal"], w["seconds"])
        except Exception as e:
            hyb_markers = []
            comparison_failures.append({"record": w["record"], "method": "ecg_analisis_v3_hybrid", "error": str(e)})

        unet_spans = None
        if unet_model is not None:
            torch = du.torch
            sig = w["signal"].astype(np.float32)
            scale = max(0.1, float(np.percentile(np.abs(sig), 99)))
            sig_n = np.clip(sig / scale, -5.0, 5.0)
            with torch.no_grad():
                seg_logits, r_logits = unet_model(torch.from_numpy(sig_n)[None, None])
                probs = torch.sigmoid(seg_logits[0]).numpy()
                r_probs = torch.sigmoid(r_logits[0]).numpy()
                af_afl = float(min(1.0, r_probs[1] + r_probs[2]))
            unet_spans = du.enforce_physiological_sequence(probs, fs=250.0, af_afl_prob=af_afl)

        for ref in w["refs"]:
            near = int(np.argmin(np.abs(peaks - ref["r"]))) if len(peaks) else None
            matched = near is not None and abs(peaks[near] - ref["r"]) <= 0.1
            prediction, mlp_prediction, nk_prediction = None, None, None
            if matched:
                center = float(peaks[near])
                x = feature(w["signal"], center)
                if x is not None:
                    means, mlp_vals = [], []
                    for m, mlp in zip(models, mlp_models):
                        if m is None:
                            means.append(np.nan)
                        else:
                            est = np.array([tree.predict(x[None])[0] for tree in m.estimators_])
                            means.append(float(est.mean()) if est.std() <= 0.08 else np.nan)
                        if mlp is None:
                            mlp_vals.append(np.nan)
                        else:
                            mlp_vals.append(float(mlp.predict(x[None])[0]))
                    prediction = (np.array(means) + (center - ref["r"])).tolist()
                    mlp_prediction = (np.array(mlp_vals) + (center - ref["r"])).tolist()
                nk_prediction = []
                for key in NK_KEYS:
                    a = waves.get(key, [])
                    value = a[near] if near < len(a) else np.nan
                    nk_prediction.append(float(value) / 250.0 - ref["r"] if np.isfinite(value) else np.nan)

            row_entry = {
                "source": w["source"],
                "split": w["split"],
                "record": w["record"],
                "reference": ref["offsets"].tolist(),
                "trained_extra_trees": prediction,
                "trained_neural_mlp": mlp_prediction,
                "ecg_analisis_v3_hybrid": pair_hybrid_to_ref(hyb_markers, peaks, ref["r"]),
                "neurokit2_dwt": nk_prediction,
                "r_matched": bool(matched),
            }
            if unet_spans is not None:
                u_markers = [{"phase": ph, "start": s / 250.0, "end": e / 250.0} for ph, spans in unet_spans.items() for s, e in spans]
                row_entry["trained_1d_resse_unet"] = pair_hybrid_to_ref(u_markers, peaks, ref["r"])
            rows.append(row_entry)

        if (wi + 1) % 25 == 0:
            print("Delineation evaluated", wi + 1, "/", len(available), flush=True)

    def clean(o):
        if isinstance(o, float) and not np.isfinite(o):
            return None
        if isinstance(o, list):
            return [clean(v) for v in o]
        if isinstance(o, dict):
            return {k: clean(v) for k, v in o.items()}
        return o

    stats = aggregate(rows, method_names)
    node_report = None
    if fixtures:
        r = subprocess.run(["node", "--experimental-strip-types", "training/clinical-run/estimate_node.mjs", str(ROOT / "estimate-fixtures.json"), str(ROOT / "estimate-node-results.json")], capture_output=True, text=True)
        if r.returncode == 0:
            node_report = json.loads((ROOT / "estimate-node-results.json").read_text())
        else:
            comparison_failures.append({"method": "current_ts_estimator", "error": r.stderr[-500:]})
    node_comparison = []
    if node_report:
        for result in node_report:
            refrows = [r for r in rows if r["record"] == result["record"] and r["source"] == result["source"]]
            refs = {}
            for name, a, b in [("prMs", 0, 2), ("qrsMs", 2, 3), ("qtMs", 2, 5)]:
                vals = [(r["reference"][b] - r["reference"][a]) * 1000 for r in refrows if np.isfinite(r["reference"][a]) and np.isfinite(r["reference"][b])]
                refs[name] = float(np.median(vals)) if vals else None
            estimated = result["estimate"]["measurements"]
            node_comparison.append({"source": result["source"], "split": result["split"], "record": result["record"], "reference_median_intervals_ms": refs, "estimated_intervals": estimated, "errors_ms": {k: (estimated.get(k) - v if estimated.get(k) is not None and v is not None else None) for k, v in refs.items()}, "reasons": result["estimate"]["reasons"]})

    gate = ["requiredindependentclinicalphotographicvalidationnotperformed"]
    cohort_records = lambda source, split: len(set(w["record"].split(":window")[0] for w in available if w["source"] == source and w["split"] == split))
    for source, split, required in [("ludb", "fit", 140), ("ludb", "selection", 20), ("ludb", "test", 40), ("qt", "external", 30)]:
        if cohort_records(source, split) < required:
            gate.append(f"{source}:{split}:incompletefrozencohort")
    for cohort in ["ludb:test", "qt:external"]:
        if cohort not in stats:
            gate.append(cohort + ":noindependentreferenceevaluation")
            continue
        for key, metric in stats[cohort]["methods"]["trained_extra_trees"].items():
            if (metric["coverage"] or 0) < 0.9:
                gate.append(cohort + ":" + key + ":coveragebelow0.90")
            if metric["median_absolute_error_ms"] is None or metric["median_absolute_error_ms"] > 20:
                gate.append(cohort + ":" + key + ":medianAEabove20ms")
            if metric["p95_absolute_error_ms"] is None or metric["p95_absolute_error_ms"] > 40:
                gate.append(cohort + ":" + key + ":p95AEabove40ms")

    report = {
        "status": "research_candidate_not_approved",
        "model": "ExtraTrees + MLP neural boundary regressors" + (" + ECGResSEUNet1D" if unet_model is not None else "") + " vs ecg_analisis_v3_hybrid & NeuroKit2 DWT",
        "train_augmented_beats": len(X),
        "train_records": len(set(w["record"].split(":window")[0] for w in available if w["source"] == "ludb" and w["split"] == "fit")),
        "datasets_available": {s: {part: len(set(w["record"].split(":window")[0] for w in available if w["source"] == s and w["split"] == part)) for part in ["fit", "selection", "test", "external"]} for s in ["ludb", "qt"]},
        "metrics": stats,
        "current_ts_estimator_comparison": node_comparison,
        "source_estimator_sha256": hashlib.sha256(Path("src/ecg/estimate.ts").read_bytes()).hexdigest(),
        "failed_records": failed,
        "comparator_failures": comparison_failures,
        "elapsed_seconds": time.time() - started,
        "activation_gate_passed": False,
        "gate_failures": gate,
        "limitations": [
            "modeltrainingRpositionsareexpertanchorswithjitter;testRpositionsareNeuroKitmatchedwithin100ms",
            "wavepresenceisnotclassified;missingannotatedwavesarenotscored",
            "QTDBmanualq1cselectedbeatsnotallrecordbeats;leadrelationmaydifferfromsingleleadestimate",
            "fitresubstitutionmetricsarenotvalidation",
            "noaxisgroundtruthinLUDBorQTDBthereforenovalidatedaxisclaim",
        ],
    }
    (OUT / "delineation-report.json").write_text(json.dumps(clean(report), indent=2))
    (ROOT / "delineation-beat-results.json").write_text(json.dumps(clean(rows)))
    print("DELINEATION COMPLETE", flush=True)


if __name__ == "__main__":
    main()
