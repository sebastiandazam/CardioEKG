"""Held-out calibration, selective performance and patient bootstrap."""
from __future__ import annotations

import numpy as np

from prepare import CLASSES


def scalar(value: float) -> float | None:
    return round(float(value), 6) if np.isfinite(value) else None


def measures(labels: np.ndarray, decisions: np.ndarray) -> dict[str, float]:
    known = np.isfinite(labels)
    covered = known & (decisions != -1)
    positive = covered & (labels == 1)
    negative = covered & (labels == 0)
    return {
        "coverage": covered.sum() / known.sum() if known.any() else np.nan,
        "sensitivity_among_covered": (decisions[positive] == 1).mean() if positive.any() else np.nan,
        "specificity_among_covered": (decisions[negative] == 0).mean() if negative.any() else np.nan,
    }


def decisions_from(probabilities: np.ndarray, lower: np.ndarray, upper: np.ndarray) -> np.ndarray:
    result = np.full(probabilities.shape, -1, dtype=np.int8)
    result[probabilities <= lower] = 0
    result[probabilities >= upper] = 1
    return result


def calibration_error(labels: np.ndarray, probabilities: np.ndarray) -> float:
    boundaries = np.linspace(0.0, 1.0, 11)
    bins = np.minimum(np.searchsorted(boundaries, probabilities, side="right") - 1, 9)
    return sum((bins == group).mean()
               * abs(labels[bins == group].mean() - probabilities[bins == group].mean())
               for group in range(10) if np.any(bins == group))


def discrimination_metrics(labels: np.ndarray, probabilities: np.ndarray) -> tuple[float, float]:
    """Evaluate tied scores as a group for AUROC and average precision."""
    order = np.argsort(-probabilities, kind="stable")
    ordered = probabilities[order]
    changes = np.append(np.flatnonzero(ordered[:-1] != ordered[1:]), len(order) - 1)
    tp = np.cumsum(labels[order])[changes]
    fp = changes + 1 - tp
    recall = tp / tp[-1]
    false_positive_rate = fp / fp[-1]
    trapezoids = np.diff(np.r_[0, false_positive_rate]) * (recall + np.r_[0, recall[:-1]]) / 2
    average_precision = np.sum(np.diff(np.r_[0, recall]) * tp / (changes + 1))
    return float(trapezoids.sum()), float(average_precision)


def intervals(labels: np.ndarray, decisions: np.ndarray, patients: np.ndarray,
              repetitions: int, seed: int) -> dict[str, list[float | None]]:
    if repetitions == 0 or not len(labels):
        return {}
    _, inverse = np.unique(patients, return_inverse=True)
    groups = np.argsort(inverse)
    sizes = np.bincount(inverse)
    boundaries = np.concatenate(([0], sizes.cumsum()))
    positive = labels == 1
    negative = labels == 0
    known = np.isfinite(labels)
    seen = known & (decisions != -1)
    components = np.stack([known, seen, seen & positive, (decisions == 1) & positive,
                           seen & negative, (decisions == 0) & negative]).astype(np.int64)
    clustered = np.add.reduceat(components[:, groups], boundaries[:-1], axis=1)
    result = [[] for _ in range(3)]
    rng = np.random.default_rng(seed)
    for _ in range(repetitions):
        sample = rng.integers(len(sizes), size=len(sizes))
        totals = clustered[:, sample].sum(axis=1)
        for bucket, (numerator, denominator) in zip(result, ((1, 0), (3, 2), (5, 4))):
            if totals[denominator]:
                bucket.append(totals[numerator] / totals[denominator])
    return {name: [scalar(value) for value in np.percentile(bucket, [2.5, 97.5])]
            if bucket else [None, None] for name, bucket in zip(measures(labels, decisions), result)}


def report(labels: np.ndarray, probabilities: np.ndarray, decisions: np.ndarray,
           patients: np.ndarray, repetitions: int = 0, seed: int = 64,
           probability_model: bool = True) -> dict:
    results = {}
    for index, name in enumerate(CLASSES):
        y = labels[:, index]
        p = probabilities[:, index]
        choice = decisions[:, index]
        known = np.isfinite(y)
        scored = known & np.isfinite(p)
        discrimination = scored.any() and len(np.unique(y[scored])) == 2
        auroc, auprc = discrimination_metrics(y[scored], p[scored]) if discrimination else (np.nan, np.nan)
        results[name] = {
            "annotated": int(known.sum()),
            "positives": int(np.sum(y == 1)),
            "abstained": int(np.sum(known & (choice == -1))),
            "abstained_positives": int(np.sum((y == 1) & (choice == -1))),
            "sensitivity_counting_abstentions_as_misses":
                scalar((choice[y == 1] == 1).mean()) if np.any(y == 1) else None,
            **{metric: scalar(value) for metric, value in measures(y, choice).items()},
            "auroc": scalar(auroc),
            "auprc": scalar(auprc),
            "brier": scalar(np.mean(np.square(y[scored] - p[scored]))) if scored.any() and probability_model else None,
            "ece_10_bins": scalar(calibration_error(y[scored], p[scored])) if scored.any() and probability_model else None,
            "patient_bootstrap_95_ci": intervals(y, choice, patients, repetitions, seed + index),
        }
    return results
