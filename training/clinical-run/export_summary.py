"""Write aggregate-only research status from real run reports; never publishes rows, signals or weights."""
import datetime
import json
from pathlib import Path

P = Path("training/clinical-run")
D = json.loads((P / "diagnosis-report.json").read_text())
L = json.loads((P / "delineation-report.json").read_text())
dest = Path("public/models/research-summary.json")
dest.parent.mkdir(parents=True, exist_ok=True)

partial_diag = bool(D.get("partial_cohort", True))
ext_count = D.get("counts", {}).get("external", {}).get("records", 0)
delin_test = L.get("metrics", {}).get("ludb:test", {}).get("methods", {})
delin_ext = L.get("metrics", {}).get("qt:external", {}).get("methods", {})

def compact_split_metrics(m):
    if not isinstance(m, dict):
        return None
    return {
        "macro_auroc": m.get("macro_auroc"),
        "macro_auprc": m.get("macro_auprc"),
        "mean_brier": m.get("mean_brier"),
        "mean_ece": m.get("mean_ece"),
    }

def compact_delin(methods_dict):
    out = {}
    for method, boundaries in (methods_dict or {}).items():
        if not isinstance(boundaries, dict):
            continue
        out[method] = {
            b: {
                "median_absolute_error_ms": stats.get("median_absolute_error_ms"),
                "mae_ms": stats.get("mae_ms"),
                "mean_error_ms": stats.get("mean_error_ms"),
                "coverage": stats.get("coverage"),
            }
            for b, stats in boundaries.items()
        }
    return out

summary = {
    "schema_version": 1,
    "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "status": "waveform_training_and_calibration_completed_pending_photo_validation"
    if not partial_diag
    else "partial_research_training",
    "diagnostic_use_enabled": False,
    "validated_model_available": False,
    "candidate_weights_published": False,
    "planned_training_completed": not partial_diag,
    "training_completed_for_available_subset": True,
    "independent_external_validation_completed": ext_count >= 1000,
    "activation_gate_passed": bool(D.get("activation_gate_passed", False))
    and bool(L.get("activation_gate_passed", False)),
    "diagnosis": {
        "method": D.get("model_type"),
        "trained_models": list((D.get("selection_scores") or {}).keys()),
        "selection_scores": D.get("selection_scores"),
        "selected_candidate": D.get("selected_model"),
        "trained_classes": D.get("supported_classes"),
        "classes_with_insufficient_training_support": D.get("unsupported_classes"),
        "records": D.get("counts"),
        "cohort_sizes": {k: (v or {}).get("records", 0) for k, v in (D.get("counts") or {}).items()},
        "planned_cohort_sizes": {"fit": 4000, "selection": 500, "calibration": 500, "test": 1000, "external_chapman": 1000},
        "calibration": D.get("calibration_roles"),
        "reported_validation_performance": {
            split: compact_split_metrics((D.get("metrics") or {}).get(split))
            for split in ("selection", "calibration", "test", "external")
        },
        "gate_failures": D.get("gate_failures"),
    },
    "delineation": {
        "method": L.get("model"),
        "annotated_training_records": L.get("train_records"),
        "augmented_training_beats": L.get("train_augmented_beats"),
        "available_annotated_cohorts": L.get("datasets_available"),
        "planned_ludb_records": 200,
        "planned_qtdb_external_records": 30,
        "heldout_performance_available": bool(delin_test or delin_ext),
        "heldout_ludb_test": compact_delin(delin_test),
        "external_qtdb": compact_delin(delin_ext),
        "gate_failures": L.get("gate_failures"),
    },
    "sources": [
        {"name": "PTB-XL", "version": "1.0.3", "license": "CC BY 4.0", "url": "https://physionet.org/content/ptb-xl/1.0.3/"},
        {"name": "Chapman–Shaoxing–Ningbo", "version": "1.0.0", "license": "CC BY 4.0", "url": "https://physionet.org/content/ecg-arrhythmia/1.0.0/"},
        {"name": "LUDB", "version": "1.0.1", "license": "ODC-By 1.0", "url": "https://physionet.org/content/ludb/1.0.1/"},
        {"name": "QT Database", "version": "1.0.0", "license": "ODC-By 1.0", "url": "https://physionet.org/content/qtdb/1.0.0/"},
    ],
    "pending": [
        "independent clinical ECG photograph validation before photographic clinical activation",
        "institutional clinical authorization before diagnostic device claims",
    ],
    "wave_maven_reused": False,
    "privacy": "Aggregate status only. No patient IDs, record IDs, raw signals, photos or candidate weights are included.",
}

dest.write_text(json.dumps(summary, ensure_ascii=False, indent=2))
(P / "research-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2))
print(dest)
if any(k in dest.read_text() for k in ['"patient_id"', '"p_signal"', '"ecg_id"']):
    raise RuntimeError("Unexpected row-level field in public aggregate summary")
