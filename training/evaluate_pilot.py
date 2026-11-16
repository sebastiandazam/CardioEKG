"""Evaluate locked predictions against two blinded readers and adjudicated measurements."""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import numpy as np

from metrics import report
from prepare import CLASSES

MEASUREMENTS = ("rate_bpm", "pr_ms", "qrs_ms", "qt_ms", "axis_deg")


def number(value: str) -> float:
    parsed = float(value) if value.strip() else np.nan
    if not value.strip() or np.isfinite(parsed):
        return parsed
    raise ValueError("Use an empty cell for unavailable results")


def classify(rows: list[dict], name: str) -> tuple[np.ndarray, int]:
    reader_1 = np.array([number(row[f"{name}_reader1"]) for row in rows])
    reader_2 = np.array([number(row[f"{name}_reader2"]) for row in rows])
    adjudication = np.array([number(row[f"{name}_adjudicated"]) for row in rows])
    for readings in (reader_1, reader_2, adjudication):
        if not np.isin(readings[np.isfinite(readings)], (0, 1)).all():
            raise ValueError(f"Unexpected binary reader annotation for {name}")
    agreed = (reader_1 == reader_2)
    requires_adjudication = np.isfinite(reader_1) & np.isfinite(reader_2) & ~agreed
    if np.any(requires_adjudication & ~np.isfinite(adjudication)):
        raise ValueError(f"A disagreement about {name} requires an adjudicated label")
    return np.where(agreed, reader_1, adjudication), int(requires_adjudication.sum())


def evaluate(rows: list[dict], repetitions: int) -> dict:
    if not rows or any(not row["patient"] or not row["record"] or not row["quality"] for row in rows):
        raise ValueError("Provide pseudonymous patient, record and quality values for every case")
    if len(set(row["record"] for row in rows)) != len(rows):
        raise ValueError("Record IDs must be unique in the evaluation file")
    consensus = [classify(rows, name) for name in CLASSES]
    labels = np.stack([entry[0] for entry in consensus], axis=1)
    probabilities = np.array([[number(row[f"{name}_score"]) for name in CLASSES] for row in rows])
    observed_scores = probabilities[np.isfinite(probabilities)]
    if np.any((observed_scores < 0) | (observed_scores > 1)):
        raise ValueError("Scores must be between 0 and 1")
    decisions = np.array([[number(row[f"{name}_decision"]) for name in CLASSES] for row in rows])
    decisions = np.nan_to_num(decisions, nan=-1.0)
    if not np.isin(decisions, (-1, 0, 1)).all():
        raise ValueError("Decisions must be binary or blank")
    patients = np.array([row["patient"] for row in rows])
    quality = np.array([row["quality"] for row in rows])
    groups = {"all_cases": np.ones(len(rows), dtype=bool)}
    groups.update({f"quality/{label}": quality == label for label in np.unique(quality)})
    result = {"reader_disagreements": dict(zip(CLASSES, [entry[1] for entry in consensus]))}
    for group, mask in groups.items():
        measurements = {}
        for name in MEASUREMENTS:
            actual = np.array([number(row[f"{name}_reference"]) for row in rows])[mask]
            prediction = np.array([number(row[f"{name}_estimate"]) for row in rows])[mask]
            known = np.isfinite(actual)
            covered = known & np.isfinite(prediction)
            error = prediction[covered] - actual[covered]
            if name == "axis_deg":
                error = (error + 180) % 360 - 180
            measurements[name] = {
                "annotated": int(known.sum()), "estimated": int(covered.sum()),
                "mean_abs_error": float(np.abs(error).mean()) if len(error) else None,
                "median_signed_error": float(np.median(error)) if len(error) else None,
            }
        result[group] = {
            "records": int(mask.sum()),
            "patients": len(np.unique(patients[mask])),
            "findings": report(labels[mask], probabilities[mask], decisions[mask], patients[mask], repetitions),
            "measurements": measurements,
        }
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("table", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--bootstrap", type=int, default=500)
    args = parser.parse_args()
    if args.bootstrap < 0:
        parser.error("--bootstrap must be nonnegative")
    with args.table.open(newline="") as file:
        evaluation = evaluate(list(csv.DictReader(file)), args.bootstrap)
    with args.output.open("x") as file:
        json.dump(evaluation, file, indent=2, allow_nan=False)
        file.write("\n")
