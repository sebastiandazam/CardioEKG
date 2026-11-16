"""Prepare disjoint waveform cohorts from local PhysioNet downloads."""
from __future__ import annotations

import argparse
import ast
import csv
import hashlib
import json
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path

import numpy as np

LEADS = ("I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6")
CLASSES = ("sinus", "af", "rbbb", "lbbb")
PTB_CODES = ("SR", "AFIB", "CRBBB", "CLBBB")
EXTERNAL_CODES = ("426783006", "164889003", "713427006", "733534002")
SAMPLE_RATE = 100
RHYTHM_SAMPLES = 1000
SEGMENT_SAMPLES = 250
PARTITIONS = ("fit", "selection", "calibration", "test", "external")


@dataclass(frozen=True)
class Entry:
    record: str
    patient: str
    partition: str
    file: Path
    labels: tuple[float, ...]
    age: float = np.nan
    sex: str = ""
    age_censored: bool = False


def photo_exclusions(ids_file: Path) -> set[str]:
    """One PTB-XL ecg_id per line. Fail closed for missing provenance."""
    values = {line.strip().lstrip("0") for line in ids_file.read_text().splitlines()
              if line.strip() and not line.lstrip().startswith("#")}
    if not values or not all(value.isdecimal() for value in values):
        raise ValueError("Supply a nonempty list of PTB-XL ECG IDs from the independent photo benchmark.")
    return values


def hash_ids(values: set[str]) -> str:
    return hashlib.sha256("\n".join(sorted(values)).encode()).hexdigest()


def ptb_entries(root: Path, excluded: set[str], include_weak_labels: bool = False) -> list[Entry]:
    with (root / "ptbxl_database.csv").open(newline="") as handle:
        rows = list(csv.DictReader(handle))
    by_record = {row["ecg_id"].lstrip("0"): row["patient_id"] for row in rows}
    if len(rows) != len(by_record) or any(not patient for patient in by_record.values()):
        raise ValueError("PTB-XL record IDs must be unique and linked to patient IDs")
    missing = excluded.difference(by_record)
    if missing:
        raise ValueError(f"Photo benchmark includes unknown PTB-XL IDs: {sorted(missing)[:10]}")
    excluded_patients = {by_record[record] for record in excluded}
    entries = []
    for row in rows:
        record, patient = row["ecg_id"], row["patient_id"]
        if patient in excluded_patients:
            continue
        fold = int(row["strat_fold"])
        if fold not in range(1, 11):
            raise ValueError(f"Unexpected fold {fold} for {record}")
        partition = {8: "selection", 9: "calibration", 10: "test"}.get(fold, "fit")
        codes = ast.literal_eval(row["scp_codes"])
        if not isinstance(codes, dict) or not codes:
            continue
        # PTB-XL rhythm statements can have likelihood 0 meaning no assigned
        # likelihood. Presence of a statement is the target used here.
        labels = tuple(float(code in codes) for code in PTB_CODES)
        age = parse_age(row.get("age", ""))
        entries.append(Entry(record, patient, partition, root / row["filename_lr"], labels,
                             age, {"0": "male", "1": "female"}.get(row.get("sex", ""), ""), str(row.get('age','')) in {'300','300.0'}))
    validate_groups(entries)
    from evaluation_policy import human_validated
    allowed={row['ecg_id'] for row in rows if human_validated(row)}
    entries=[entry for entry in entries if entry.record in allowed or include_weak_labels and entry.partition=='fit']
    return entries


def parse_age(raw: str) -> float:
    try:
        age = float(raw)
    except (ValueError, TypeError):
        return np.nan
    return 90.0 if age == 300 else age if 0 <= age <= 120 else np.nan


def external_entries(root: Path) -> list[Entry]:
    headers = sorted((root / "WFDBRecords").rglob("*.hea"))
    if len(headers) != 45152:
        raise ValueError(f"Expected the full Chapman–Shaoxing–Ningbo release (45152); found {len(headers)}")
    entries = []
    for header in headers:
        fields = {}
        for line in header.read_text().splitlines():
            if line.startswith("#") and ":" in line:
                name, value = line[1:].split(":", 1)
                fields[name.strip().casefold()] = value.strip()
        if not fields.get("dx"):
            raise ValueError(f"Missing diagnostic annotations in {header.name}")
        codes = {code.strip() for code in fields["dx"].split(",")}
        # Generic BBB codes do not identify complete versus incomplete blocks.
        # Preserve those labels as unknown for that class.
        labels = [
            1.0 if code in codes else 0.0 for code in EXTERNAL_CODES
        ]
        for index, generic_code in ((2, "59118001"), (3, "164909002")):
            if generic_code in codes and not labels[index]:
                labels[index] = np.nan
        entries.append(Entry(header.stem, header.stem, "external", header.with_suffix(""),
                             tuple(labels), parse_age(fields.get("age", "")),
                             fields.get("sex", "").casefold()))
    validate_groups(entries)
    if len({entry.record for entry in entries}) != len(entries):
        raise ValueError("Duplicate external record identifiers")
    return entries


def validate_groups(entries: list[Entry]) -> None:
    assignments = {}
    for entry in entries:
        previous = assignments.setdefault(entry.patient, entry.partition)
        if previous != entry.partition:
            raise ValueError(f"Patient {entry.patient} appears in {previous} and {entry.partition}")


def waveform(path: Path) -> np.ndarray:
    import wfdb
    from scipy.signal import resample_poly

    record = wfdb.rdrecord(str(path), physical=True)
    channels = {lead.casefold(): index for index, lead in enumerate(record.sig_name)}
    if len(channels) != 12 or set(channels) != {lead.casefold() for lead in LEADS}:
        raise ValueError(f"{path.name}: expected exactly 12 standard lead labels")
    signal = np.asarray(record.p_signal, dtype=np.float32).T
    for channel, units in enumerate(record.units):
        units = units.casefold().replace("µ", "u").replace("μ", "u")
        if units not in {"uv", "mv", "v"}:
            raise ValueError(f"{path.name}: unsupported physical unit {units!r}")
        signal[channel] *= {"uv": 0.001, "mv": 1.0, "v": 1000.0}[units]
    signal = signal[[channels[lead.casefold()] for lead in LEADS]]
    if not np.isfinite(signal).all():
        raise ValueError(f"{path.name}: nonfinite waveform")
    ratio = Fraction(SAMPLE_RATE) / Fraction(str(record.fs))
    if ratio != 1:
        signal = resample_poly(signal, ratio.numerator, ratio.denominator, axis=1)
    if signal.shape != (len(LEADS), RHYTHM_SAMPLES):
        raise ValueError(f"{path.name}: expected a 10-second recording, got {signal.shape}")
    return signal


def paper_layout(waveform_12: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Apply standard 4-by-3 time offsets without treating strips as synchronous."""
    if waveform_12.shape != (len(LEADS), RHYTHM_SAMPLES):
        raise ValueError("Expected a 12-by-1000 waveform")
    segments = np.stack([lead[index // 3 * SEGMENT_SAMPLES:(index // 3 + 1) * SEGMENT_SAMPLES]
                         for index, lead in enumerate(waveform_12)])
    return segments, waveform_12[1:2]


def write_split(entries: list[Entry], output: Path, split: str) -> None:
    rows = [entry for entry in entries if entry.partition == split]
    if not rows:
        raise ValueError(f"Empty split {split}")
    temporary = output / f".{split}.tmp"
    temporary.mkdir()
    try:
        signals = np.lib.format.open_memmap(temporary / "segments.npy", mode="w+",
                                            dtype=np.float32, shape=(len(rows), 12, 250))
        rhythm = np.lib.format.open_memmap(temporary / "leadII.npy", mode="w+",
                                           dtype=np.float32, shape=(len(rows), 1, 1000))
        for index, row in enumerate(rows):
            signals[index], rhythm[index] = paper_layout(waveform(row.file))
        signals.flush()
        rhythm.flush()
        np.savez(temporary / "metadata.npz",
                 labels=np.array([row.labels for row in rows], dtype=np.float32),
                 patients=np.array([row.patient for row in rows]),
                 records=np.array([row.record for row in rows]),
                 age=np.array([row.age for row in rows]),
                 age_censored=np.array([row.age_censored for row in rows]),
                 sex=np.array([row.sex for row in rows]))
        temporary.rename(output / split)
    except Exception:
        from shutil import rmtree
        rmtree(temporary)
        raise
    print(f"{split}: {len(rows)} ECG records")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ptb", type=Path, required=True)
    parser.add_argument("--external", type=Path)
    parser.add_argument("--photo-test-ids", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument('--include-weak-labels',action='store_true',help='Explicit exploratory mixed-label ablation; never a human-only validation claim.')
    args = parser.parse_args()
    excluded = photo_exclusions(args.photo_test_ids)
    entries = ptb_entries(args.ptb, excluded, args.include_weak_labels)
    if args.external:
        entries.extend(external_entries(args.external))
    args.out.mkdir(parents=True, exist_ok=True)
    splits = PARTITIONS if args.external else PARTITIONS[:-1]
    for split in splits:
        if (args.out / split).exists():
            raise FileExistsError(f"Use a fresh output directory. Found {args.out / split}")
    for split in splits:
        write_split(entries, args.out, split)
    provenance = {
        'label_policy': 'mixed-exploratory' if args.include_weak_labels else 'human-validated-only',
        'age_300_encoding': 'lower_bound_90_plus_age_censored_true',
        "ptb_xl_version": "1.0.3",
        "ptb_xl_metadata_sha256": hashlib.sha256((args.ptb / "ptbxl_database.csv").read_bytes()).hexdigest(),
        "chapman_version": "1.0.0" if args.external else None,
        "photo_holdout_ecg_ids_sha256": hash_ids(excluded),
        "photo_holdout_ecg_count": len(excluded),
        "partitions": {split: sum(entry.partition == split for entry in entries) for split in splits},
    }
    (args.out / "dataset.json").write_text(json.dumps(provenance, indent=2) + "\n")


if __name__ == "__main__":
    main()
