"""Exploratory morphology baseline for comparison on held-out data."""
from __future__ import annotations

import numpy as np


def candidate_peaks(signal: np.ndarray) -> np.ndarray:
    energy = np.convolve(np.square(np.diff(signal, prepend=signal[0])),
                         np.ones(9) / 9, mode="same")
    floor = max(1e-5, 0.16 * float(np.quantile(energy, 0.95)))
    local_maxima = np.flatnonzero((energy[1:-1] > energy[:-2])
                                  & (energy[1:-1] >= energy[2:])) + 1
    accepted = []
    for index in sorted(local_maxima, key=energy.__getitem__, reverse=True):
        if energy[index] < floor:
            break
        if 22 <= index < len(signal) - 18 and all(abs(index - peak) >= 26 for peak in accepted):
            accepted.append(index)
    return np.array(sorted(accepted), dtype=int)


def qrs_templates(signal: np.ndarray) -> list[np.ndarray]:
    centered = signal - np.median(signal)
    return [centered[peak - 11:peak + 15] for peak in candidate_peaks(centered)]


def estimate(segments: np.ndarray, lead_ii: np.ndarray) -> np.ndarray:
    """Return coarse evidence scores; NaN means the baseline abstained."""
    scores = np.full(4, np.nan)
    strip = lead_ii.reshape(-1)
    peaks = candidate_peaks(strip)
    if len(peaks) >= 5:
        rr = np.diff(peaks).astype(float)
        rr_variation = np.median(np.abs(np.diff(rr))) / np.median(rr)
        p_windows = np.stack([strip[peak - 21:peak - 9] for peak in peaks])
        p_templates = p_windows - np.median(p_windows, axis=1, keepdims=True)
        shared_p = np.median(p_templates, axis=0)
        p_consistent = np.ptp(shared_p) >= 0.03 and np.median(
            np.mean(np.abs(p_templates - shared_p), axis=1)
        ) <= 0.04
        if rr_variation >= 0.13 and not p_consistent:
            scores[:2] = [0.0, 1.0]
        if rr_variation <= 0.07 and p_consistent:
            scores[:2] = [1.0, 0.0]

    templates = [qrs_templates(segments[index]) for index in (6, 10, 11)]
    if all(templates):
        v1, v5, v6 = [np.median(group, axis=0) for group in templates]
        widths = []
        for lead in (v1, v5, v6):
            slope = np.abs(np.diff(lead))
            slope_indices = np.flatnonzero(slope >= max(0.02, 0.16 * slope.max()))
            widths.append(slope_indices[-1] - slope_indices[0] + 1 if slope_indices.size else 0)
        if max(widths) < 12:
            scores[2:] = [0.0, 0.0]
        elif v1[13:22].max() > 0.14 and min(v5[13:22].min(), v6[13:22].min()) < -0.10:
            scores[2:] = [1.0, 0.0]
        elif v1.min() < -0.25 and v1.max() < 0.45 * abs(v1.min()) and v6[6:18].max() > 0.23:
            scores[2:] = [0.0, 1.0]
    return scores
