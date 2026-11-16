"""Confirmed-waveform multilabel ECG training, calibration, and reliability evaluation.

Trains multiple candidate architectures (LogisticRegression, ExtraTreesClassifier, MLPClassifier,
optional 1D ResNet in PyTorch when available, and logit-blended ensemble) on frozen patient-disjoint
PTB-XL splits (folds 1-7 fit, fold 8 selection, fold 9 Platt calibration + threshold selection,
fold 10 held-out test) plus external evaluation on Chapman-Shaoxing-Ningbo (ECG-Arrhythmia 1.0.0).
No raw waveforms, patient IDs, or unvalidated approvals are written to public artifacts.
"""
import ast
import csv
import hashlib
import json
import os
import platform
import sys
import time
from pathlib import Path

import joblib
import numpy as np
from scipy.io import loadmat
from scipy.signal import butter, find_peaks, resample_poly, sosfiltfilt, welch
from sklearn.ensemble import ExtraTreesClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    roc_auc_score,
)
from sklearn.multioutput import MultiOutputClassifier
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from evaluation_policy import calibration_groups, human_validated

ROOT = Path("data/clinical-run")
OUT = Path("training/clinical-run")
SEED = 20261112

NAMES = [
    "sinus",
    "af",
    "rbbb",
    "lbbb",
    "first_avb",
    "lafb",
    "wpw",
    "sinus_brady",
    "sinus_tachy",
    "pac",
    "pvc",
    "lvh",
    "mi",
    "st_t",
    "normal",
]
PTB = [
    "SR",
    "AFIB",
    "CRBBB",
    "CLBBB",
    "1AVB",
    "LAFB",
    "WPW",
    "SBRAD",
    "STACH",
    "PAC",
    "PVC",
    "LVH",
    None,
    None,
    "NORM",
]
SNOMED = [
    ["426783006"],
    ["164889003"],
    ["713427006"],
    ["733534002"],
    ["270492004"],
    ["445118002"],
    ["74390002"],
    ["426177001"],
    ["427084000"],
    ["284470004", "63593006"],
    ["427172004", "17338001"],
    ["164873001"],
    ["164865005"],
    None,
    None,
]


def targets_ptb(row, groups):
    codes = ast.literal_eval(row["scp_codes"])
    return np.array(
        [
            float(
                (code in codes)
                if code
                else any(groups.get(c) == ("MI" if i == 12 else "STTC") for c in codes)
            )
            for i, code in enumerate(PTB)
        ]
    )


def targets_external(header):
    line = next((l for l in header.splitlines() if l.startswith("#Dx:")), "")
    codes = set(line.partition(":")[2].strip().split(","))
    labels = np.array(
        [
            np.nan if choices is None else float(any(c in codes for c in choices))
            for choices in SNOMED
        ]
    )
    for idx, generic in [(2, "59118001"), (3, "164909002")]:
        if generic in codes and labels[idx] != 1:
            labels[idx] = np.nan
    return labels


def read_ptb(row):
    path = ROOT / "ptb" / row["filename_lr"]
    header = path.with_suffix(".hea").read_text().splitlines()
    channels = int(header[0].split()[1])
    n = int(header[0].split()[3])
    raw = (
        np.fromfile(path.with_suffix(".dat"), dtype="<i2")
        .reshape(n, channels)
        .T.astype(float)
    )
    for i, line in enumerate(header[1:13]):
        field = line.split()[2]
        gain = float(field.split("(")[0].split("/")[0])
        baseline = float(field.split("(")[1].split(")")[0]) if "(" in field else 0
        raw[i] = (raw[i] - baseline) / gain
    if raw.shape != (12, 1000) or not np.isfinite(raw).all():
        raise ValueError("invalidPTBshape")
    return raw


def read_external(row):
    path = ROOT / "chapman" / row["record"]
    header = path.with_suffix(".hea").read_text()
    lines = header.splitlines()
    raw = loadmat(path.with_suffix(".mat"))["val"].astype(float)
    fs = float(lines[0].split()[2])
    ordered = {line.split()[-1].upper(): i for i, line in enumerate(lines[1:13])}
    for i, line in enumerate(lines[1:13]):
        field = line.split()[2]
        gain = float(field.split("(")[0].split("/")[0])
        baseline = (
            float(field.split("(")[1].split(")")[0])
            if "(" in field
            else float(line.split()[4])
        )
        raw[i] = (raw[i] - baseline) / gain
    raw = raw[[ordered[l] for l in ["I", "II", "III", "AVR", "AVL", "AVF", "V1", "V2", "V3", "V4", "V5", "V6"]]]
    raw = resample_poly(raw, 100, int(fs), axis=1)
    if raw.shape != (12, 1000) or not np.isfinite(raw).all():
        raise ValueError("invalidexternalshape")
    return raw, header


SOS = butter(3, [0.5, 35], fs=100, output="sos", btype="bandpass")
QRS = butter(2, [5, 23], fs=100, output="sos", btype="bandpass")


def r_peaks(signal):
    q = sosfiltfilt(QRS, signal)
    e = np.convolve(q * q, np.ones(8) / 8, mode="same")
    height = np.quantile(e, 0.9) * 0.3
    peaks, _ = find_peaks(
        e,
        height=max(height, 1e-7),
        prominence=max(np.quantile(e, 0.95) * 0.2, 1e-7),
        distance=25,
    )
    result = []
    for p in peaks:
        lo = max(0, p - 8)
        hi = min(len(q), p + 9)
        r = lo + np.argmax(np.abs(q[lo:hi]))
        if not result or r - result[-1] > 22:
            result.append(r)
    return np.array(result, dtype=int)


def features(wave):
    """Extract 12-lead morphology (4x3 segments), aligned beat markers, and atrial/rhythm stats."""
    out = []
    filtered = sosfiltfilt(SOS, wave, axis=1)

    # 1. Paper 4x3 2.5s chunk statistics per lead
    for i, lead_sig in enumerate(filtered):
        signal = lead_sig[i // 3 * 250 : (i // 3 + 1) * 250]
        baseline = np.median(signal)
        signal = signal - baseline
        scale = np.quantile(signal, 0.95) - np.quantile(signal, 0.05)
        q = np.quantile(signal, [0.01, 0.05, 0.25, 0.5, 0.75, 0.95, 0.99])
        diff = np.diff(signal)
        spec = np.abs(np.fft.rfft(signal)) ** 2
        freq = np.fft.rfftfreq(len(signal), 0.01)
        total = spec.sum() + 1e-10
        out.extend(q)
        out.extend([np.std(signal), np.std(diff), np.mean(np.abs(diff)), scale, np.max(np.abs(signal))])
        out.extend(float(spec[(freq >= a) & (freq < b)].sum() / total) for a, b in [(0, 4), (4, 8), (8, 15), (15, 25), (25, 40)])
        peaks = r_peaks(signal)
        beats = [signal[p - 20 : p + 45] for p in peaks if p >= 20 and p + 45 <= len(signal)]
        template = np.median(beats, axis=0) if beats else np.zeros(65)
        template = template / (scale + 0.05)
        out.extend(np.interp(np.linspace(0, 64, 48), np.arange(65), template))
        out.extend([len(peaks), np.std(peaks) if len(peaks) else 0])

    # 2. Time-aligned full-10s multi-lead clinical features around Lead II R-peaks
    rhythm = filtered[1]
    global_peaks = r_peaks(rhythm)
    if len(global_peaks) < 2:
        global_peaks = r_peaks(filtered[6])  # V1 fallback

    lead_templates = []
    lead_r_max = np.zeros(12)
    lead_s_min = np.zeros(12)
    lead_net = np.zeros(12)
    for i, lead_sig in enumerate(filtered):
        beats = [lead_sig[p - 20 : p + 45] for p in global_peaks if p >= 20 and p + 45 <= len(lead_sig)]
        if beats:
            bmat = np.asarray(beats)
            med_b = np.median(bmat, axis=0)
            # PQ baseline in [-120ms, -50ms] => indices [8:15] relative to p-20 (R is at idx 20)
            pq_base = float(np.median(med_b[8:15]))
            centered = med_b - pq_base
            p_amp = float(np.max(centered[2:12]) - np.median(centered[:5]))
            p_min = float(np.min(centered[2:12]) - np.median(centered[:5]))
            delta_slope = float((centered[18] - centered[14]) * 25.0)
            r_amp = float(np.max(centered[16:25]))
            s_amp = float(np.min(centered[16:26]))
            term_s_frac = float(np.mean(centered[22:30] < -0.04))
            j20 = float(np.mean(centered[23:26]))
            st60 = float(np.mean(centered[27:30]))
            t_max = float(np.max(centered[31:56]))
            t_min = float(np.min(centered[31:56]))
            r_amps = bmat[:, 17:24].max(axis=1)
            r_cv = float(np.std(r_amps) / max(0.05, abs(np.mean(r_amps))))
            qrs_net = float(np.sum(centered[16:25]))
            lead_r_max[i] = r_amp
            lead_s_min[i] = s_amp
            lead_net[i] = qrs_net
            lead_templates.append(centered)
            out.extend([p_amp, p_min, delta_slope, r_amp, s_amp, term_s_frac, j20, st60, t_max, t_min, r_cv, qrs_net])
        else:
            lead_templates.append(np.zeros(65))
            out.extend([0.0] * 12)

    # 3. Cross-lead voltage, frontal axis, and morphology concordance features
    sokolow_lyon = abs(lead_s_min[6]) + max(lead_r_max[10], lead_r_max[11])
    cornell = lead_r_max[4] + abs(lead_s_min[8])
    axis_rad = float(np.arctan2(lead_net[5], lead_net[0])) if (abs(lead_net[0]) + abs(lead_net[5]) > 1e-4) else 0.0
    corr_i_v6 = float(np.corrcoef(lead_templates[0][15:26], lead_templates[11][15:26])[0, 1]) if (np.std(lead_templates[0][15:26]) > 1e-4 and np.std(lead_templates[11][15:26]) > 1e-4) else 0.0
    corr_ii_avf = float(np.corrcoef(lead_templates[1][15:26], lead_templates[5][15:26])[0, 1]) if (np.std(lead_templates[1][15:26]) > 1e-4 and np.std(lead_templates[5][15:26]) > 1e-4) else 0.0
    corr_v1_v2 = float(np.corrcoef(lead_templates[6][15:26], lead_templates[7][15:26])[0, 1]) if (np.std(lead_templates[6][15:26]) > 1e-4 and np.std(lead_templates[7][15:26]) > 1e-4) else 0.0
    out.extend([sokolow_lyon, cornell, np.sin(axis_rad), np.cos(axis_rad), corr_i_v6, corr_ii_avf, corr_v1_v2])

    # 4. Atrial residual spectrum after median QRS-T beat cancellation in II & V1 (flutter vs AF)
    for l_idx in (1, 6):
        resid = filtered[l_idx].copy()
        tpl = lead_templates[l_idx]
        for p in global_peaks:
            lo = max(0, p - 15)
            hi = min(len(resid), p + 42)
            t_lo = 20 - (p - lo)
            t_hi = t_lo + (hi - lo)
            resid[lo:hi] -= tpl[t_lo:t_hi]
        f_w, psd_w = welch(resid, fs=100.0, nperseg=min(256, len(resid)))
        p_tot = float(psd_w[(f_w >= 0.5) & (f_w <= 20.0)].sum() + 1e-10)
        flutter_pow = float(psd_w[(f_w >= 3.8) & (f_w <= 5.8)].sum() / p_tot)
        fib_pow = float(psd_w[(f_w > 5.8) & (f_w <= 12.0)].sum() / p_tot)
        out.extend([flutter_pow, fib_pow])

    # 5. Global rhythm / RR / premature beat dynamics
    rr = np.diff(global_peaks) / 100.0
    if len(rr) >= 2:
        med_rr = max(0.01, float(np.median(rr)))
        prem_frac = float(np.mean(rr < 0.8 * med_rr))
        q10, q50, q90 = np.quantile(rr, [0.1, 0.5, 0.9])
        iqr_ratio = float((q90 - q10) / med_rr)
        out.extend([
            float(np.mean(rr)),
            float(np.std(rr)),
            float(np.std(rr) / max(0.01, np.mean(rr))),
            med_rr,
            float(np.min(rr)),
            float(np.max(rr)),
            float(np.sqrt(np.mean(np.diff(rr) ** 2))),
            float(np.mean(np.abs(np.diff(rr)) > 0.05)),
            prem_frac,
            iqr_ratio,
            float(len(global_peaks)),
        ])
    else:
        out.extend([0.0] * 10 + [float(len(global_peaks))])

    return np.nan_to_num(np.asarray(out, dtype=np.float32), nan=0.0, posinf=0.0, neginf=0.0)


def expected_calibration_error(y_true, y_prob, n_bins=10):
    """10-bin Expected Calibration Error (ECE) on calibrated probabilities."""
    bins = np.linspace(0.0, 1.0, n_bins + 1)
    ece = 0.0
    n = len(y_true)
    if n == 0:
        return None
    for i in range(n_bins):
        lo, hi = bins[i], bins[i + 1]
        in_bin = (y_prob >= lo) & (y_prob <= hi if i == n_bins - 1 else y_prob < hi)
        cnt = int(in_bin.sum())
        if cnt > 0:
            ece += (cnt / n) * abs(float(y_true[in_bin].mean()) - float(y_prob[in_bin].mean()))
    return float(ece)


def best_f1_threshold(y_true, y_prob):
    """Find operating threshold on held-out calibration slice maximizing F1."""
    if len(np.unique(y_true)) < 2:
        return 0.5
    best_t, best_f1 = 0.5, -1.0
    for t in np.linspace(0.10, 0.90, 81):
        pred = y_prob >= t
        tp = int(np.sum(pred & (y_true == 1)))
        fp = int(np.sum(pred & (y_true == 0)))
        fn = int(np.sum((~pred) & (y_true == 1)))
        denom = 2 * tp + fp + fn
        f1 = (2 * tp / denom) if denom > 0 else 0.0
        if f1 > best_f1:
            best_f1 = f1
            best_t = float(t)
    return best_t


def per_class(y, p, bounds=None, supported=None, op_thresholds=None):
    reports = []
    for k, name in enumerate(NAMES):
        mask = np.isfinite(y[:, k])
        truth = y[mask, k].astype(int)
        score = p[mask, k]
        pos = int(truth.sum())
        neg = len(truth) - pos
        is_trained = supported is None or k in supported
        r = {
            "class": name,
            "records": len(truth),
            "positives": pos,
            "negatives": neg,
            "trained": is_trained,
            "auroc": float(roc_auc_score(truth, score)) if pos and neg and is_trained else None,
            "average_precision": float(average_precision_score(truth, score)) if pos and is_trained else None,
            "brier": float(brier_score_loss(truth, score)) if len(truth) and is_trained else None,
            "ece": expected_calibration_error(truth, score) if len(truth) and is_trained else None,
        }
        if op_thresholds is not None and is_trained and len(truth):
            th = float(op_thresholds[k])
            pred_op = score >= th
            tp_op = int(np.sum(pred_op & (truth == 1)))
            fp_op = int(np.sum(pred_op & (truth == 0)))
            fn_op = int(np.sum((~pred_op) & (truth == 1)))
            tn_op = int(np.sum((~pred_op) & (truth == 0)))
            r.update({
                "op_threshold": th,
                "sensitivity_op": tp_op / pos if pos else None,
                "specificity_op": tn_op / neg if neg else None,
                "ppv_op": tp_op / (tp_op + fp_op) if (tp_op + fp_op) else None,
                "npv_op": tn_op / (tn_op + fn_op) if (tn_op + fn_op) else None,
                "f1_op": (2 * tp_op / (2 * tp_op + fp_op + fn_op)) if (2 * tp_op + fp_op + fn_op) else None,
            })
        if bounds is not None:
            lower, upper = bounds[k]
            prediction = np.full(len(truth), -1)
            prediction[score < lower] = 0
            prediction[score >= upper] = 1
            accepted = prediction >= 0
            tp = int(np.sum((prediction == 1) & (truth == 1)))
            fp = int(np.sum((prediction == 1) & (truth == 0)))
            fn = int(np.sum((prediction == 0) & (truth == 1)))
            tn = int(np.sum((prediction == 0) & (truth == 0)))
            r.update({
                "lower": lower,
                "upper": upper,
                "coverage": float(accepted.mean()) if len(truth) else None,
                "abstained": int((~accepted).sum()),
                "tp": tp,
                "fp": fp,
                "fn": fn,
                "tn": tn,
                "ppv": tp / (tp + fp) if tp + fp else None,
                "sensitivity_including_abstention": tp / pos if pos else None,
                "sensitivity_among_decided": tp / (tp + fn) if tp + fn else None,
                "specificity_including_abstention": tn / neg if neg else None,
            })
        reports.append(r)

    valid_auc = [r["auroc"] for r in reports if r["auroc"] is not None]
    valid_ap = [r["average_precision"] for r in reports if r["average_precision"] is not None]
    valid_brier = [r["brier"] for r in reports if r["brier"] is not None]
    valid_ece = [r["ece"] for r in reports if r["ece"] is not None]
    return {
        "macro_auroc": float(np.mean(valid_auc)) if valid_auc else None,
        "macro_auprc": float(np.mean(valid_ap)) if valid_ap else None,
        "mean_brier": float(np.mean(valid_brier)) if valid_brier else None,
        "mean_ece": float(np.mean(valid_ece)) if valid_ece else None,
        "classes": reports,
    }


def thresholds(y, p):
    out = []
    for k in range(y.shape[1]):
        truth = y[:, k]
        score = p[:, k]
        positives = score[truth == 1]
        lower = float(np.quantile(positives, 0.05)) if len(positives) >= 10 else -1
        upper = 2
        for t in np.linspace(0.05, 0.99, 95):
            called = score >= t
            if called.sum() >= 10 and np.mean(truth[called]) >= 0.9:
                upper = float(t)
                break
        if lower >= upper:
            lower = min(lower, upper - 0.001)
        out.append([lower, upper])
    return out


def _fit_torch_resnet_if_available(manifest_rows, records, idx_map, splits, supported, y_all):
    """Train a lightweight 1D ResNet on normalized 10s (12, 1000) waveforms when PyTorch is installed."""
    try:
        import torch
        import torch.nn as nn
        from torch.utils.data import DataLoader, TensorDataset
    except ImportError:
        return None, None

    torch.manual_seed(SEED)
    row_by_id = {str(r["ecg_id"]): r for r in manifest_rows}
    # Build (N, 12, 1000) float32 tensor in record order only for PTB records (Chapman evaluated on external)
    n_tot = len(records)
    waves = np.zeros((n_tot, 12, 1000), dtype=np.float32)
    chapman_rows = {}
    for i, r in enumerate(records):
        try:
            if r["source"] == "ptb":
                w = read_ptb(row_by_id[str(r["record"])])
            else:
                if not chapman_rows:
                    chapman_rows = {c["record"]: c for c in json.loads((OUT / "cohort-manifest.json").read_text())["cohorts"]["chapman"]}
                w, _ = read_external(chapman_rows[str(r["record"])])
            w = sosfiltfilt(SOS, w, axis=1).astype(np.float32)
            # Robust per-record global RMS normalization preserving inter-lead ratios
            scale = float(np.percentile(np.abs(w), 99) + 1e-3)
            waves[i] = np.clip(w / scale, -5.0, 5.0)
        except Exception:
            pass

    class ResBlock1D(nn.Module):
        def __init__(self, in_c, out_c, stride=1, k=9):
            super().__init__()
            pad = k // 2
            self.net = nn.Sequential(
                nn.Conv1d(in_c, out_c, k, stride=stride, padding=pad, bias=False),
                nn.BatchNorm1d(out_c),
                nn.GELU(),
                nn.Conv1d(out_c, out_c, k, padding=pad, bias=False),
                nn.BatchNorm1d(out_c),
            )
            self.skip = nn.Conv1d(in_c, out_c, 1, stride=stride, bias=False) if (in_c != out_c or stride != 1) else nn.Identity()
            self.act = nn.GELU()

        def forward(self, x):
            return self.act(self.net(x) + self.skip(x))

    class ECGResNet1D(nn.Module):
        def __init__(self, n_out):
            super().__init__()
            self.stem = nn.Sequential(nn.Conv1d(12, 32, 11, stride=2, padding=5, bias=False), nn.BatchNorm1d(32), nn.GELU())
            self.b1 = ResBlock1D(32, 48, stride=2)
            self.b2 = ResBlock1D(48, 80, stride=2)
            self.b3 = ResBlock1D(80, 128, stride=2)
            self.head = nn.Sequential(nn.Dropout(0.25), nn.Linear(256, n_out))

        def forward(self, x):
            h = self.b3(self.b2(self.b1(self.stem(x))))
            pooled = torch.cat([h.mean(dim=-1), h.amax(dim=-1)], dim=-1)
            return self.head(pooled)

    fit = splits["fit"]
    sel = splits["selection"]
    cache_p = ROOT / "resnet1d-preds-v2.npz"
    cache_pt = ROOT / "resnet1d.pt"
    probs = None
    best_auc = -1.0
    if cache_p.exists() and cache_pt.exists():
        try:
            d = np.load(cache_p)
            if d["probs"].shape == (n_tot, len(NAMES)) and int(d["fit_len"]) == len(fit):
                probs = d["probs"]
                best_auc = float(d["best_auc"])
                return probs, {"epochs": 10, "selection_auroc": best_auc, "cached": True, "weights_path": str(cache_pt)}
        except Exception:
            pass

    device = torch.device("mps" if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available() else "cpu")
    net = ECGResNet1D(len(supported)).to(device)
    y_fit = y_all[fit][:, supported].astype(np.float32)
    pos = np.maximum(1.0, y_fit.sum(axis=0))
    neg = np.maximum(1.0, len(fit) - pos)
    pos_weight = torch.tensor(np.clip(neg / pos, 1.0, 20.0), dtype=torch.float32, device=device)
    crit = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
    opt = torch.optim.AdamW(net.parameters(), lr=1.8e-3, weight_decay=2e-3)
    loader = DataLoader(TensorDataset(torch.from_numpy(waves[fit]), torch.from_numpy(y_fit)), batch_size=64, shuffle=True)

    best_state = None
    for epoch in range(10):
        net.train()
        for xb, yb in loader:
            xb, yb = xb.to(device), yb.to(device)
            opt.zero_grad()
            loss = crit(net(xb), yb)
            loss.backward()
            opt.step()
        net.eval()
        with torch.no_grad():
            sel_logits = net(torch.from_numpy(waves[sel]).to(device)).cpu().numpy()
            sel_p = 1.0 / (1.0 + np.exp(-np.clip(sel_logits, -20, 20)))
        aucs = [roc_auc_score(y_all[sel, k], sel_p[:, j]) for j, k in enumerate(supported) if len(np.unique(y_all[sel, k])) == 2]
        m_auc = float(np.mean(aucs)) if aucs else 0.0
        print(f"  resnet1d epoch {epoch + 1}/10 sel_auroc={m_auc:.4f}", flush=True)
        if m_auc > best_auc:
            best_auc = m_auc
            best_state = {k: v.cpu().clone() for k, v in net.state_dict().items()}
    if best_state is not None:
        net.load_state_dict({k: v.to(device) for k, v in best_state.items()})
        torch.save(best_state, cache_pt)
    net.eval()
    probs = np.full((n_tot, len(NAMES)), 0.5)
    with torch.no_grad():
        for start in range(0, n_tot, 256):
            logits = net(torch.from_numpy(waves[start : start + 256]).to(device)).cpu().numpy()
            p_chunk = 1.0 / (1.0 + np.exp(-np.clip(logits, -20, 20)))
            for j, k in enumerate(supported):
                probs[start : start + 256, k] = p_chunk[:, j]
    np.savez_compressed(cache_p, probs=probs, fit_len=np.array(len(fit)), best_auc=np.array(best_auc))
    return probs, {"epochs": 10, "selection_auroc": best_auc, "device": str(device), "weights_path": str(cache_pt)}


def main():
    started = time.time()
    manifest_name = "cohort-manifest-full.json" if "--full" in sys.argv and (OUT / "cohort-manifest-full.json").exists() else "cohort-manifest.json"
    manifest = json.loads((OUT / manifest_name).read_text())
    groups = {r[""]: r["diagnostic_class"] for r in csv.DictReader((ROOT / "ptb/scp_statements.csv").open())}
    data = {k: [] for k in ["fit", "selection", "calibration", "test", "external"]}
    failed = []

    cache = ROOT / "diagnosis-features-v2.npz"
    meta_path = ROOT / "diagnosis-feature-meta-v2.json"
    available_ptb = ["ptb:" + r["filename_lr"] for r in manifest["cohorts"]["ptb"] if (ROOT / "ptb" / (r["filename_lr"] + ".dat")).exists() and (ROOT / "ptb" / (r["filename_lr"] + ".hea")).exists()]
    available_external = ["chapman:" + r["record"] for r in manifest["cohorts"]["chapman"] if (ROOT / "chapman" / (r["record"] + ".mat")).exists() and (ROOT / "chapman" / (r["record"] + ".hea")).exists()]
    available_token = hashlib.sha256("\n".join(available_ptb + available_external).encode()).hexdigest()

    if cache.exists() and (ROOT / "feature-token-v2.txt").exists() and (ROOT / "feature-token-v2.txt").read_text() == available_token:
        c = np.load(cache)
        metadata = json.loads(meta_path.read_text())
        X, Y = c["X"], c["Y"]
        records = metadata["records"]
        failed = metadata["failed"]
    else:
        X, Y, records = [], [], []
        entries = [("ptb", r) for r in manifest["cohorts"]["ptb"]] + [("chapman", r) for r in manifest["cohorts"]["chapman"]]
        for index, (source, row) in enumerate(entries):
            try:
                if source == "ptb":
                    wave = read_ptb(row)
                    y = targets_ptb(row, groups)
                    identity = row["ecg_id"]
                    patient = row["patient_id"]
                else:
                    wave, header = read_external(row)
                    y = targets_external(header)
                    identity = row["record"]
                    patient = None
                X.append(features(wave))
                Y.append(y)
                records.append({"record": identity, "patient": patient, "split": row["split"], "source": source, "sex": row.get("sex"), "age": row.get("age")})
            except Exception as e:
                failed.append({"source": source, "record": row.get("ecg_id", row.get("record")), "error": str(e)})
            if (index + 1) % 500 == 0:
                print(f"features {index + 1}/{len(entries)} successful={len(X)} failed={len(failed)} elapsed={time.time() - started:.0f}s", flush=True)
        X = np.array(X)
        Y = np.array(Y)
        np.savez_compressed(cache, X=X, Y=Y)
        meta_path.write_text(json.dumps({"records": records, "failed": failed}))
        (ROOT / "feature-token-v2.txt").write_text(available_token)

    policy = os.environ.get("CARDIOEKG_LABEL_POLICY", "human-only")
    if policy not in {"human-only", "mixed-exploratory"}:
        raise ValueError("Unknown label policy")
    human_ids = {str(row["ecg_id"]) for row in manifest["cohorts"]["ptb"] if human_validated(row)}
    for i, r in enumerate(records):
        if r["source"] == "ptb" and (policy == "human-only" or r["split"] != "fit") and str(r["record"]) not in human_ids:
            continue
        data[r["split"]].append(i)

    splits = {k: np.array(v, dtype=int) for k, v in data.items()}
    counts = {
        k: {"records": len(ix), "patients": len({records[i]["patient"] for i in ix if records[i]["patient"] is not None}) if k != "external" else None}
        for k, ix in splits.items()
    }
    if len(splits["fit"]) < 50:
        raise RuntimeError("Fewerthan50frozenfitrecordsavailable")

    fit = splits["fit"]
    selection = splits["selection"]
    cal = splits["calibration"]
    supported = [k for k in range(len(NAMES)) if Y[fit, k].sum() >= 25 and (1 - Y[fit, k]).sum() >= 25]
    unsupported = [NAMES[k] for k in range(len(NAMES)) if k not in supported]
    prob_mask, band_mask = calibration_groups([records[i]["patient"] for i in cal], SEED)
    probability_cal = cal[prob_mask]
    threshold_cal = cal[band_mask]

    models, predictions, scores = {}, {}, {}
    for modelname in ["logistic", "extra_trees", "mlp_neural"]:
        print("TRAIN", modelname, "on", len(fit), "records", len(supported), "classes", flush=True)
        if modelname == "logistic":
            model = make_pipeline(StandardScaler(), MultiOutputClassifier(LogisticRegression(C=0.25, class_weight="balanced", max_iter=800, random_state=SEED), n_jobs=2))
            model.fit(X[fit], Y[fit][:, supported].astype(int))
            prob = model.predict_proba(X)
            probabilities = np.full((len(X), len(NAMES)), 0.5)
            for j, k in enumerate(supported):
                probabilities[:, k] = prob[j][:, 1]
        elif modelname == "extra_trees":
            model = ExtraTreesClassifier(n_estimators=256, min_samples_leaf=2, class_weight="balanced_subsample", max_features="sqrt", n_jobs=4, random_state=SEED)
            model.fit(X[fit], Y[fit][:, supported].astype(int))
            prob = model.predict_proba(X)
            probabilities = np.full((len(X), len(NAMES)), 0.5)
            for j, k in enumerate(supported):
                probabilities[:, k] = prob[j][:, 1]
        else:
            model = make_pipeline(
                StandardScaler(),
                MLPClassifier(hidden_layer_sizes=(192, 96), activation="relu", alpha=1e-2, batch_size=128, learning_rate_init=1e-3, early_stopping=True, validation_fraction=0.1, n_iter_no_change=8, max_iter=60, random_state=SEED),
            )
            model.fit(X[fit], Y[fit][:, supported].astype(int))
            prob = model.predict_proba(X)
            probabilities = np.full((len(X), len(NAMES)), 0.5)
            for j, k in enumerate(supported):
                probabilities[:, k] = prob[:, j]
        models[modelname] = model
        predictions[modelname] = probabilities
        evaluable = [roc_auc_score(Y[selection, k], probabilities[selection, k]) for k in supported if len(selection) >= 30 and len(np.unique(Y[selection, k])) == 2]
        scores[modelname] = float(np.mean(evaluable)) if evaluable else None
        print("SELECTION", modelname, scores[modelname], flush=True)

    # Optional 1D ResNet if PyTorch installed
    resnet_p, resnet_info = _fit_torch_resnet_if_available(manifest["cohorts"]["ptb"], records, data, splits, supported, Y)
    if resnet_p is not None:
        predictions["resnet1d"] = resnet_p
        evaluable = [roc_auc_score(Y[selection, k], resnet_p[selection, k]) for k in supported if len(selection) >= 30 and len(np.unique(Y[selection, k])) == 2]
        scores["resnet1d"] = float(np.mean(evaluable)) if evaluable else None
        print("SELECTION resnet1d", scores["resnet1d"], resnet_info, flush=True)

    # Blend top-2 models on selection split (logit-space average)
    ranked = sorted([m for m in scores if scores[m] is not None], key=lambda m: scores[m], reverse=True)
    if len(ranked) >= 2:
        p1 = np.clip(predictions[ranked[0]], 1e-5, 1 - 1e-5)
        p2 = np.clip(predictions[ranked[1]], 1e-5, 1 - 1e-5)
        blend_logit = 0.55 * np.log(p1 / (1 - p1)) + 0.45 * np.log(p2 / (1 - p2))
        blend_p = 1.0 / (1.0 + np.exp(-blend_logit))
        predictions["blend_top2"] = blend_p
        evaluable = [roc_auc_score(Y[selection, k], blend_p[selection, k]) for k in supported if len(selection) >= 30 and len(np.unique(Y[selection, k])) == 2]
        scores["blend_top2"] = float(np.mean(evaluable)) if evaluable else None
        print("SELECTION blend_top2", scores["blend_top2"], flush=True)

    selected = max((name for name in scores if scores[name] is not None), key=scores.get) if any(value is not None for value in scores.values()) else "extra_trees"
    p = predictions[selected]

    # Fold 9 probability calibration (Platt sigmoid scaling) + operating thresholds + abstention bounds
    calibrators = []
    calibrated = np.full_like(p, 0.5)
    for k in range(len(NAMES)):
        if k not in supported:
            calibrators.append(None)
            continue
        if len(probability_cal) < 30 or len(np.unique(Y[probability_cal, k])) < 2:
            calibrated[:, k] = p[:, k]
            calibrators.append(None)
            continue
        logits = np.log(np.clip(p[:, k], 1e-5, 1 - 1e-5) / (1 - np.clip(p[:, k], 1e-5, 1 - 1e-5)))[:, None]
        m = LogisticRegression(C=1, random_state=SEED).fit(logits[probability_cal], Y[probability_cal, k].astype(int))
        calibrated[:, k] = m.predict_proba(logits)[:, 1]
        calibrators.append({"slope": float(m.coef_[0, 0]), "intercept": float(m.intercept_[0])})

    bounds = thresholds(Y[threshold_cal], calibrated[threshold_cal]) if len(threshold_cal) >= 30 else [[-1, 2] for _ in NAMES]
    op_thresholds = [
        best_f1_threshold(Y[threshold_cal, k], calibrated[threshold_cal, k]) if (len(threshold_cal) >= 30 and k in supported) else 0.5
        for k in range(len(NAMES))
    ]
    for k in range(len(NAMES)):
        if k not in supported or calibrators[k] is None:
            bounds[k] = [-1, 2]

    tests = {
        k: per_class(Y[ix], calibrated[ix], bounds, supported, op_thresholds=op_thresholds)
        for k, ix in splits.items()
        if k in ["selection", "calibration", "test", "external"]
    }

    gate = []
    for split in ["test", "external"]:
        if tests[split]["macro_auroc"] is None or tests[split]["macro_auroc"] < 0.9:
            gate.append(f"{split}:macroAUROCbelow0.90")
    for r in tests["external"]["classes"]:
        if r["class"] in unsupported:
            continue
        if r["positives"] < 30:
            gate.append(r["class"] + ":externalpositivesbelow30")
        if (r.get("coverage") or 0) < 0.8:
            gate.append(r["class"] + ":externalcoveragebelow0.80")
        if (r.get("ppv") or 0) < 0.9:
            gate.append(r["class"] + ":externalPPVbelow0.90")
        if (r.get("sensitivity_including_abstention") or 0) < 0.9:
            gate.append(r["class"] + ":externalsensitivitybelow0.90")
    gate.append("independentclinicalphotographicvalidationnotperformed")

    raw_split_counts = {}
    for r in records:
        raw_split_counts[r["split"]] = raw_split_counts.get(r["split"], 0) + 1

    save_obj = {
        "model": models.get(selected, next((models[r] for r in ranked if r in models), None)),
        "selected_name": selected,
        "top2_blend": ranked[:2] if selected == "blend_top2" else None,
        "resnet1d_info": scores.get("resnet1d"),
        "resnet1d_weights_path": str(ROOT / "resnet1d.pt") if (ROOT / "resnet1d.pt").exists() else None,
        "labels": [NAMES[k] for k in supported],
        "calibrators": calibrators,
        "bounds": bounds,
        "op_thresholds": op_thresholds,
        "feature_definition": "diagnosis.py features version2 (4x3 + aligned 10s PQ/ST/delta/voltage/atrial-spectral)",
        "source": "PTB-XL 1.0.3; external Chapman-Shaoxing-Ningbo 1.0.0",
        "approved": False,
    }
    joblib.dump(save_obj, ROOT / "diagnosis-candidate.joblib")

    report = {
        "label_policy": policy,
        "calibration_roles": {"probability_records": len(probability_cal), "threshold_records": len(threshold_cal), "patient_overlap": 0},
        "status": "research_candidate_not_approved",
        "model_type": "multilabel waveform ensemble with Fold-9 Platt probability calibration" + (" including PyTorch 1D ResNet" if "resnet1d" in scores else " (Logistic + ExtraTrees + MLP neural network)"),
        "selected_model": selected,
        "selection_scores": scores,
        "selection_valid_for_model_choice": len(selection) >= 30,
        "raw_cohort_counts": raw_split_counts,
        "counts": counts,
        "supported_classes": [NAMES[k] for k in supported],
        "unsupported_classes": unsupported,
        "calibrators": calibrators,
        "op_thresholds": op_thresholds,
        "metrics": tests,
        "activation_gate_passed": False,
        "gate_failures": gate,
        "partial_cohort": any(raw_split_counts.get(k, 0) < n for k, n in [("fit", 4000), ("selection", 500), ("calibration", 500), ("test", 1000), ("external", 1000)]),
        "failed_records": failed,
        "feature_count": int(X.shape[1]),
        "training_seconds": time.time() - started,
        "plan_sha256": hashlib.sha256((OUT / "plan.json").read_bytes()).hexdigest(),
        "environment": {"python": platform.python_version(), "numpy": np.__version__},
        "limitations": [
            "noindependentclinicalphotographs",
            "PTBlabelsSCPandexternalSNOMEDnotidentical",
            "externalpatientlinkageunavailable;recordsnotassumedpatients",
            "STTCandnormaldonotmapsafelytoexternalcodes;notexternallyevaluated",
            "signalsnotpaperimages;supportsgroundtruthwaveformsratherthanphotoextraction",
        ],
    }
    (OUT / "diagnosis-report.json").write_text(json.dumps(report, indent=2))
    print("DIAGNOSIS COMPLETE", selected, "test_auroc=", tests["test"]["macro_auroc"], "test_ece=", tests["test"]["mean_ece"], "ext_auroc=", tests["external"]["macro_auroc"], "ext_ece=", tests["external"]["mean_ece"], flush=True)


if __name__ == "__main__":
    main()
