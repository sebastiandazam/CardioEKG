"""Train and compare ECG classifiers and export an unapproved research candidate."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from time import perf_counter

import numpy as np
import torch
from sklearn.linear_model import LogisticRegression
from torch import nn

from metrics import decisions_from, report
from prepare import CLASSES, LEADS
from evaluation_policy import calibration_groups
from rules import estimate


class Cohort:
    def __init__(self, folder: Path):
        self.segments = np.load(folder / "segments.npy", mmap_mode="r")
        self.lead_ii = np.load(folder / "leadII.npy", mmap_mode="r")
        with np.load(folder / "metadata.npz", allow_pickle=False) as metadata:
            self.labels = metadata["labels"]
            self.patients = metadata["patients"]
            self.age = metadata["age"]
            self.sex = metadata["sex"]
        if self.segments.shape != (len(self.labels), 12, 250) or self.lead_ii.shape != (len(self.labels), 1, 1000):
            raise ValueError(f"Invalid ECG geometry in {folder}")
        if self.labels.shape != (len(self.segments), 4):
            raise ValueError(f"Invalid label geometry in {folder}")

    def batch(self, index: np.ndarray, device: torch.device) -> tuple[torch.Tensor, ...]:
        return tuple(torch.from_numpy(data[index]).to(device=device, dtype=torch.float32)
                     for data in (self.segments, self.lead_ii, self.labels))


class ResidualBlock(nn.Module):
    def __init__(self, width: int, dilation: int):
        super().__init__()
        self.body = nn.Sequential(
            nn.Conv1d(width, width, 5, padding=dilation * 2, dilation=dilation, bias=False),
            nn.BatchNorm1d(width), nn.ReLU(),
            nn.Conv1d(width, width, 5, padding=2, bias=False),
            nn.BatchNorm1d(width),
        )
        self.relu = nn.ReLU()

    def forward(self, values: torch.Tensor) -> torch.Tensor:
        return self.relu(values + self.body(values))


def encoder(channels: int, width: int, residual: bool) -> nn.Module:
    features = [
        nn.Conv1d(channels, width, 11, stride=2, padding=5, bias=False),
        nn.BatchNorm1d(width), nn.ReLU(), nn.MaxPool1d(2),
    ]
    if residual:
        features.extend([ResidualBlock(width, 1), ResidualBlock(width, 2), ResidualBlock(width, 4)])
    else:
        for kernel in (7, 5, 3):
            features.extend([nn.Conv1d(width, width, kernel, padding=kernel // 2, bias=False),
                             nn.BatchNorm1d(width), nn.ReLU()])
    return nn.Sequential(*features)


class Classifier(nn.Module):
    def __init__(self, residual: bool):
        super().__init__()
        # Process each simultaneous 3-lead column separately. Aggregation
        # occurs after temporal pooling so columns cannot be mistaken for
        # simultaneous samples.
        self.columns = nn.ModuleList(encoder(3, 24, residual) for _ in range(4))
        self.rhythm = encoder(1, 32, residual)
        self.classify = nn.Sequential(nn.Linear(256, 64), nn.ReLU(),
                                      nn.Dropout(0.15), nn.Linear(64, len(CLASSES)))

    @staticmethod
    def pool(values: torch.Tensor) -> torch.Tensor:
        return torch.cat((values.mean(dim=-1), values.amax(dim=-1)), dim=-1)

    def forward(self, segments: torch.Tensor, lead_ii: torch.Tensor) -> torch.Tensor:
        columns = []
        for index, network in enumerate(self.columns):
            block = segments[:, index * 3:(index + 1) * 3]
            columns.append(self.pool(network(block - block.mean(dim=-1, keepdim=True))))
        columns.append(self.pool(self.rhythm(lead_ii - lead_ii.mean(dim=-1, keepdim=True))))
        return self.classify(torch.cat(columns, dim=-1))


class CalibratedClassifier(nn.Module):
    def __init__(self, classifier: Classifier, slope: np.ndarray, intercept: np.ndarray):
        super().__init__()
        self.classifier = classifier
        self.register_buffer("slope", torch.tensor(slope, dtype=torch.float32))
        self.register_buffer("intercept", torch.tensor(intercept, dtype=torch.float32))

    def forward(self, segments: torch.Tensor, lead_ii: torch.Tensor) -> torch.Tensor:
        return (self.classifier(segments, lead_ii) * self.slope + self.intercept).sigmoid()


@torch.inference_mode()
def infer(model: nn.Module, cohort: Cohort, batch_size: int, device: torch.device) -> np.ndarray:
    model.eval()
    indices = np.arange(len(cohort.labels))
    return np.concatenate([model(*cohort.batch(indices[start:start + batch_size], device)[:2])
                           .cpu().numpy() for start in range(0, len(indices), batch_size)])


def train(model: Classifier, fit: Cohort, selection: Cohort, args: argparse.Namespace,
          device: torch.device) -> tuple[Classifier, list[dict], float]:
    rng = np.random.default_rng(args.seed)
    weights = np.sum(fit.labels == 0, axis=0) / np.maximum(np.sum(fit.labels == 1, axis=0), 1)
    loss_function = nn.BCEWithLogitsLoss(pos_weight=torch.tensor(np.clip(weights, 1, 30),
                                                                dtype=torch.float32, device=device))
    optimizer = torch.optim.AdamW(model.parameters(), lr=0.001, weight_decay=0.0001)
    history = []
    best_score = -1.0
    best_weights = {}
    for epoch in range(args.epochs):
        model.train()
        indices = rng.permutation(len(fit.labels))
        losses = []
        for start in range(0, len(indices), args.batch_size):
            segments, rhythm, labels = fit.batch(indices[start:start + args.batch_size], device)
            gains = torch.rand((len(segments), 1, 1), device=device) * 0.15 + 0.925
            segments = segments * gains + torch.randn_like(segments) * 0.015
            rhythm = rhythm * gains + torch.randn_like(rhythm) * 0.015
            optimizer.zero_grad(set_to_none=True)
            loss = loss_function(model(segments, rhythm), labels)
            loss.backward()
            optimizer.step()
            losses.append(loss.detach().cpu().item())
        logits = infer(model, selection, args.batch_size, device)
        performance = report(selection.labels, logits, (logits >= 0).astype(np.int8),
                             selection.patients, probability_model=False)
        score = float(np.mean([entry["auprc"] for entry in performance.values()
                              if entry["auprc"] is not None]))
        history.append({"epoch": epoch + 1, "loss": float(np.mean(losses)), "selection_macro_auprc": score})
        if score > best_score:
            best_score = score
            best_weights = {key: value.detach().cpu().clone() for key, value in model.state_dict().items()}
        print(f"Epoch {epoch + 1}: loss {history[-1]['loss']:.4f}, selection macro AUPRC {score:.4f}", flush=True)
    model.load_state_dict(best_weights)
    return model, history, best_score


def calibration(labels: np.ndarray, logits: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    slopes, intercepts = [], []
    for index in range(len(CLASSES)):
        model = LogisticRegression()
        model.fit(logits[:, index, None], labels[:, index])
        slopes.append(model.coef_[0, 0])
        intercepts.append(model.intercept_[0])
    return np.array(slopes), np.array(intercepts)


def bands(labels: np.ndarray, probabilities: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    lower, upper = np.full(len(CLASSES), -1.0), np.full(len(CLASSES), 2.0)
    for index, _ in enumerate(CLASSES):
        p = probabilities[:, index]
        y = labels[:, index]
        # Engineering selection criteria for this candidate. Final criteria
        # must be registered in the protocol before examining the pilot.
        for threshold in np.linspace(0.01, 0.49, 49):
            selected = p <= threshold
            if selected.sum() >= 20 and (y[selected] == 0).mean() >= 0.95:
                lower[index] = threshold
        for threshold in np.linspace(0.50, 0.99, 50):
            selected = p >= threshold
            if selected.sum() >= 20 and (y[selected] == 1).mean() >= 0.90:
                upper[index] = threshold
                break
    return lower, upper


def latency_ms(model: nn.Module) -> float:
    model.to("cpu").eval()
    segments, rhythm = torch.zeros(1, 12, 250), torch.zeros(1, 1, 1000)
    with torch.inference_mode():
        model(segments, rhythm)
        elapsed = []
        for _ in range(20):
            start = perf_counter()
            model(segments, rhythm)
            elapsed.append(perf_counter() - start)
    return round(float(np.median(elapsed) * 1000), 3)


def rule_scores(cohort: Cohort) -> np.ndarray:
    return np.stack([estimate(segments, rhythm)
                     for segments, rhythm in zip(cohort.segments, cohort.lead_ii)])


def validate_splits(cohorts: dict[str, Cohort]) -> None:
    assigned: dict[str, str] = {}
    for name, cohort in cohorts.items():
        if name == "external":
            continue
        for patient in np.unique(cohort.patients):
            if patient in assigned:
                raise ValueError(f"Patient overlap between {assigned[patient]} and {name}")
            assigned[patient] = name
        if np.any(np.sum(cohort.labels == 1, axis=0) == 0) or np.any(np.sum(cohort.labels == 0, axis=0) == 0):
            raise ValueError(f"At least one class has no positive or no negative labels in {name}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--epochs", type=int, default=18)
    parser.add_argument("--batch-size", type=int, default=128)
    parser.add_argument("--seed", type=int, default=64)
    parser.add_argument("--bootstrap", type=int, default=500)
    parser.add_argument("--device", choices=["cpu", "cuda", "mps"], default="cpu")
    args = parser.parse_args()
    if args.epochs < 1 or args.batch_size < 2 or args.bootstrap < 0:
        parser.error("Use at least one epoch, batch size >= 2 and nonnegative bootstrap count.")
    provenance = json.loads((args.data / "dataset.json").read_text())
    if provenance.get('label_policy') not in {'human-validated-only','mixed-exploratory'}:
        raise ValueError('Reprepare data with explicit label provenance policy before training.')
    args.out.mkdir(parents=True, exist_ok=False)
    torch.set_num_threads(min(4, torch.get_num_threads()))
    device = torch.device(args.device)
    cohorts = {name: Cohort(args.data / name) for name in ("fit", "selection", "calibration", "test")}
    if (args.data / "external").is_dir():
        cohorts["external"] = Cohort(args.data / "external")
    validate_splits(cohorts)
    fit, selection, cal = [cohorts[name] for name in ("fit", "selection", "calibration")]
    candidates = {}
    comparison = {}
    for name in ("cnn1d", "resnet1d"):
        torch.manual_seed(args.seed)
        model = Classifier(residual=name == "resnet1d").to(device)
        model, history, score = train(model, fit, selection, args, device)
        comparison[name] = {"selection_macro_auprc": score, "cpu_median_ms": latency_ms(model),
                            "learning_curve": history}
        candidates[name] = model
    maximum = max(entry["selection_macro_auprc"] for entry in comparison.values())
    winner = min((name for name in candidates if comparison[name]["selection_macro_auprc"] >= maximum - 0.005),
                 key=lambda name: comparison[name]["cpu_median_ms"])
    for name, model in candidates.items():
        raw = infer(model.to(device), cal, args.batch_size, device)
        probability_mask, threshold_mask=calibration_groups(cal.patients,args.seed)
        if min(probability_mask.sum(),threshold_mask.sum())<30:
            raise ValueError('Insufficient patient-disjoint calibration data; keep candidate inactive.')
        slope, intercept = calibration(cal.labels[probability_mask], raw[probability_mask])
        calibrated = CalibratedClassifier(model, slope, intercept).to(device).eval()
        probabilities = infer(calibrated, cal, args.batch_size, device)
        lower, upper = bands(cal.labels[threshold_mask], probabilities[threshold_mask])
        for k in range(len(CLASSES)):
            if any(min(int(cal.labels[mask,k].sum()),int(mask.sum()-cal.labels[mask,k].sum()))<10 for mask in (probability_mask,threshold_mask)):
                lower[k],upper[k]=-1,2
        comparison[name]['calibration_roles']={'probability_records':int(probability_mask.sum()),'threshold_records':int(threshold_mask.sum()),'patient_overlap':0}
        comparison[name]["calibration"] = report(cal.labels, probabilities,
                                                 decisions_from(probabilities, lower, upper), cal.patients)
        for split in ("test", "external"):
            if split not in cohorts:
                continue
            cohort = cohorts[split]
            predictions = infer(calibrated, cohort, args.batch_size, device)
            decisions = decisions_from(predictions, lower, upper)
            result = {"all": report(cohort.labels, predictions, decisions, cohort.patients, args.bootstrap)}
            for group, mask in {
                "female": cohort.sex == "female", "male": cohort.sex == "male",
                "age_18_64": (cohort.age >= 18) & (cohort.age < 65), "age_65_plus": cohort.age >= 65,
            }.items():
                if mask.any():
                    result[group] = report(cohort.labels[mask], predictions[mask], decisions[mask],
                                           cohort.patients[mask], args.bootstrap)
            comparison[name][split] = result
        if name == winner:
            export(calibrated, args.out, name, lower, upper)
    comparison["rules"] = {}
    for split in ("selection", "test", "external"):
        if split not in cohorts:
            continue
        cohort = cohorts[split]
        scores = rule_scores(cohort)
        comparison["rules"][split] = report(cohort.labels, scores, np.nan_to_num(scores, nan=-1).astype(np.int8),
                                           cohort.patients, args.bootstrap, probability_model=False)
    run = {"seed": args.seed, "dataset": provenance, "torch_version": str(torch.__version__),
           "records": {name: len(cohort.labels) for name, cohort in cohorts.items()},
           "patients": {name: len(np.unique(cohort.patients)) for name, cohort in cohorts.items()},
           "winner": winner, "comparison": comparison, "approval": "research-candidate"}
    (args.out / "metrics.json").write_text(json.dumps(run, indent=2, allow_nan=False) + "\n")


def export(model: CalibratedClassifier, out: Path, architecture: str,
           lower: np.ndarray, upper: np.ndarray) -> None:
    import onnx
    import onnxruntime as ort

    path = out / "classifier.onnx"
    model = model.cpu().eval()
    rng = np.random.default_rng(64)
    arrays = [rng.normal(0, 0.2, shape).astype(np.float32) for shape in ((1, 12, 250), (1, 1, 1000))]
    tensors = tuple(torch.from_numpy(array) for array in arrays)
    torch.onnx.export(model, tensors, str(path), input_names=["segments", "leadII"],
                      output_names=["probabilities"], opset_version=17, dynamo=False)
    onnx.checker.check_model(str(path))
    session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    actual, = session.run(["probabilities"], dict(zip(("segments", "leadII"), arrays)))
    np.testing.assert_allclose(actual, model(*tensors).detach().numpy(), atol=1e-5, rtol=1e-4)
    manifest = {"schemaVersion": 1, "status": "research-candidate", "architecture": architecture,
                "classes": list(CLASSES), "leads": list(LEADS), "sampleRate": 100, "units": "mV",
                "decisionBands": {name: {"lower": round(float(lower[i]), 4), "upper": round(float(upper[i]), 4)}
                                  for i, name in enumerate(CLASSES)},
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
