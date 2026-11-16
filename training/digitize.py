"""Compare classical and U-Net digitizers on calibrated, rectified lead crops."""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HEIGHT, WIDTH = 96, 256
SAMPLES = 250


def interpolate(values: np.ndarray, count: int) -> np.ndarray:
    return np.interp(np.linspace(0, 1, count), np.linspace(0, 1, len(values)), values)


def ink_probability(image: Image.Image) -> np.ndarray:
    rgb = np.asarray(image.convert("RGB"), dtype=np.float32) / 255.0
    dark = 1.0 - rgb.mean(axis=2)
    warm = np.maximum(0, rgb[:, :, 0] - rgb[:, :, 1])
    return np.clip(dark - 1.45 * warm, 0, 1)


def trace_pixels(ink: np.ndarray, threshold: float = 0.34) -> np.ndarray:
    """Follow a high-ink continuous path with a bounded per-column cost."""
    h, w = ink.shape
    track = np.full((h, w), -1, dtype=np.int16)
    cost = ink[:, 0].astype(np.float32)
    positions = np.arange(h)
    shifts = np.arange(-10, 11)
    source = positions[None, :] - shifts[:, None]
    clipped = np.clip(source, 0, h - 1)
    penalty = np.abs(shifts[:, None]) * 0.015
    invalid = source != clipped
    for col in range(1, w):
        transitions = cost[clipped] - penalty
        transitions[invalid] = -np.inf
        best = transitions.argmax(axis=0)
        track[:, col] = clipped[best, positions]
        cost = ink[:, col] + transitions[best, positions]
    path = np.empty(w, dtype=np.int16)
    path[-1] = cost.argmax()
    for col in range(w - 1, 0, -1):
        path[col - 1] = track[path[col], col]
    strong = ink[path, np.arange(w)] >= threshold
    if strong.mean() < 0.56:
        return np.full(w, np.nan)
    valid = np.flatnonzero(strong)
    if np.diff(valid).max(initial=0) > 0.06 * w:
        return np.full(w, np.nan)
    if not strong[0] or not strong[-1]:
        if valid[0] > 0.03 * w or valid[-1] < 0.97 * w:
            return np.full(w, np.nan)
    return np.interp(np.arange(w), np.flatnonzero(strong), path[strong])


def draw_paired_crop(signal: np.ndarray, rng: np.random.Generator) -> tuple[Image.Image, np.ndarray, float, float]:
    zero_y, scale = HEIGHT / 2 + rng.uniform(-4, 4), rng.uniform(18, 26)
    trace_y = zero_y - interpolate(signal, WIDTH) * scale
    # Expand the vertical calibration range if the source trace is high voltage.
    if trace_y.min() < 3 or trace_y.max() > HEIGHT - 4:
        scale = min(scale, (HEIGHT / 2 - 8) / max(np.abs(signal).max(), 0.01))
        trace_y = zero_y - interpolate(signal, WIDTH) * scale
    image = Image.new("RGB", (WIDTH, HEIGHT), (250, 243, 238))
    draw = ImageDraw.Draw(image)
    step = int(rng.integers(6, 10))
    for x in range(int(rng.integers(step)), WIDTH, step):
        draw.line((x, 0, x, HEIGHT), fill=(235, 169, 164))
    for y in range(int(rng.integers(step)), HEIGHT, step):
        draw.line((0, y, WIDTH, y), fill=(235, 169, 164))
    points = [(x, float(y)) for x, y in enumerate(trace_y)]
    draw.line(points, fill=(29, 27, 34), width=int(rng.integers(1, 3)))
    image = image.filter(ImageFilter.GaussianBlur(float(rng.uniform(0, 1.0))))
    noise = rng.normal(0, 5.0, (HEIGHT, WIDTH, 1))
    shadow = np.sin(np.linspace(0, np.pi, WIDTH))[None, :, None] * rng.uniform(0, 30)
    pixels = np.clip(np.asarray(image).astype(float) + noise - shadow, 0, 255).astype(np.uint8)
    mask = Image.new("L", (WIDTH, HEIGHT))
    ImageDraw.Draw(mask).line(points, fill=255, width=2)
    return Image.fromarray(pixels), np.asarray(mask, dtype=np.float32) / 255.0, zero_y, scale


def errors(signal: np.ndarray, reconstructed: np.ndarray) -> dict:
    """Calculate amplitude error with declared calibration and no post-hoc shift."""
    if not np.isfinite(reconstructed).all():
        return {"mae_mv": None, "snr_db": None}
    difference = signal - reconstructed
    noise = max(1e-12, float(np.mean(difference ** 2)))
    power = max(1e-12, float(np.mean(signal ** 2)))
    return {"mae_mv": float(np.abs(difference).mean()), "snr_db": float(10 * np.log10(power / noise))}


def summarise(rows: list[dict]) -> dict:
    groups = {"all": rows}
    groups.update({key: [row for row in rows if row["quality"] == key]
                   for key in sorted({row["quality"] for row in rows}) if key != "all"})
    result = {}
    for quality, cases in groups.items():
        result[quality] = {}
        for method in ("classical", "unet"):
            values = [row[method] for row in cases if row[method]["mae_mv"] is not None]
            result[quality][method] = {
                "strips": len(cases),
                "records": len({row["record"] for row in cases}),
                "coverage": len(values) / len(cases) if cases else None,
                "median_mae_mv": float(np.median([row["mae_mv"] for row in values])) if values else None,
                "median_snr_db": float(np.median([row["snr_db"] for row in values])) if values else None,
            }
    return result


def load_real_pairs(manifest: Path, excluded_ids: set[str]):
    fields = ("photo", "signal", "record", "zero_y", "pixels_per_mv", "quality")
    with manifest.open(newline="") as file:
        reader = csv.DictReader(file)
        if not set(fields).issubset(reader.fieldnames or ()):
            raise ValueError(f"Photo CSV must have columns {', '.join(fields)}")
        for row in reader:
            if row["record"].lstrip("0") not in excluded_ids:
                raise ValueError(f"Photo reference {row['record']} was not excluded from classifier data")
            image_file = manifest.parent / row["photo"]
            signal_file = manifest.parent / row["signal"]
            with Image.open(image_file) as image:
                height = image.height
                crop = image.convert("RGB").resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
            signal = np.load(signal_file, allow_pickle=False)
            if signal.shape != (SAMPLES,) or not np.isfinite(signal).all():
                raise ValueError(f"Expected 250 finite physical mV samples in {signal_file.name}")
            scale = float(row["pixels_per_mv"]) * HEIGHT / height
            zero_y = float(row["zero_y"]) * HEIGHT / height
            if not np.isfinite([scale, zero_y]).all() or scale <= 0:
                raise ValueError(f"Invalid photo calibration for {row['record']}")
            yield crop, signal, zero_y, scale, row["record"], row["quality"]


def compare(args: argparse.Namespace) -> None:
    import torch
    from torch import nn

    from image_model import UNet

    if args.epochs < 1 or args.samples_per_epoch < 1 or args.batch_size < 1:
        raise ValueError("Epochs, sample count and batch size must be positive")
    if args.photo_pairs and not args.photo_test_ids:
        raise ValueError("Supply the independent photo ID list used by prepare.py")
    provenance = json.loads((args.data / "dataset.json").read_text())
    exclusions = set()
    if args.photo_pairs:
        from prepare import hash_ids, photo_exclusions
        exclusions = photo_exclusions(args.photo_test_ids)
        if hash_ids(exclusions) != provenance["photo_holdout_ecg_ids_sha256"]:
            raise ValueError("Photo benchmark IDs differ from the holdout used in preparation")
    args.out.mkdir(parents=True, exist_ok=False)
    fit = np.load(args.data / "fit" / "segments.npy", mmap_mode="r")
    selection = np.load(args.data / "selection" / "segments.npy", mmap_mode="r")
    rng = np.random.default_rng(args.seed)
    torch.manual_seed(args.seed)
    torch.set_num_threads(min(4, torch.get_num_threads()))
    model = UNet().to(args.device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=0.001)
    loss = nn.BCEWithLogitsLoss(pos_weight=torch.tensor([15.0], device=args.device))

    def samples(source, count, generator):
        for index in generator.integers(len(source), size=count):
            lead = int(generator.integers(12))
            signal = source[index, lead]
            image, mask, zero_y, scale = draw_paired_crop(signal, generator)
            yield image, mask, signal, zero_y, scale

    fixed_validation = list(samples(selection, 96, np.random.default_rng(args.seed + 1)))
    best_loss, best_parameters = float("inf"), {}
    history = []
    for epoch in range(args.epochs):
        model.train()
        pairs = samples(fit, args.samples_per_epoch, rng)
        pending = args.samples_per_epoch
        while pending:
            size = min(pending, args.batch_size)
            batch = [next(pairs) for _ in range(size)]
            images = torch.tensor(np.stack([ink_probability(row[0]) for row in batch])[:, None],
                                  device=args.device)
            targets = torch.tensor(np.stack([row[1] for row in batch])[:, None], device=args.device)
            optimizer.zero_grad(set_to_none=True)
            cost = loss(model(images), targets)
            cost.backward()
            optimizer.step()
            pending -= size
        model.eval()
        with torch.inference_mode():
            validation_loss = []
            for start in range(0, len(fixed_validation), args.batch_size):
                batch = fixed_validation[start:start + args.batch_size]
                images = torch.tensor(np.stack([ink_probability(row[0]) for row in batch])[:, None],
                                      device=args.device)
                targets = torch.tensor(np.stack([row[1] for row in batch])[:, None], device=args.device)
                validation_loss.append(loss(model(images), targets).cpu().item())
        value = float(np.mean(validation_loss))
        history.append({"epoch": epoch + 1, "selection_loss": value})
        print(f"Digitization epoch {epoch + 1}: selection loss {value:.4f}", flush=True)
        if value < best_loss:
            best_loss = value
            best_parameters = {key: item.detach().cpu().clone() for key, item in model.state_dict().items()}
    model.load_state_dict(best_parameters)
    model.eval()

    def measure(image, signal, zero_y, scale, record, quality):
        ink = ink_probability(image)
        with torch.inference_mode():
            probabilities = model(torch.tensor(ink[None, None], device=args.device)).sigmoid()
        learned_ink = probabilities[0, 0].cpu().numpy()
        row = {"record": record, "quality": quality}
        for name, pixels in (("classical", trace_pixels(ink)), ("unet", trace_pixels(learned_ink, 0.45))):
            row[name] = errors(signal, interpolate((zero_y - pixels) / scale, SAMPLES))
        return row

    holdout = np.load(args.data / "test" / "segments.npy", mmap_mode="r")
    synth = [measure(image, signal, zero, scale, str(index), "render")
             for index, (image, _, signal, zero, scale) in enumerate(
                 samples(holdout, 256, np.random.default_rng(args.seed + 2)))]
    result = {"status": "research-candidate", "dataset": provenance, "seed": args.seed,
              "history": history, "rendered_test": summarise(synth)}
    if args.photo_pairs:
        real = [measure(*pair) for pair in load_real_pairs(args.photo_pairs, exclusions)]
        if not real:
            raise ValueError("No real photo pairs provided")
        result["real_photo_test"] = summarise(real)

    model = nn.Sequential(model.cpu(), nn.Sigmoid()).eval()
    path = args.out / "digitizer.onnx"
    inputs = torch.zeros(1, 1, HEIGHT, WIDTH)
    torch.onnx.export(model, inputs, str(path), input_names=["ink"],
                      output_names=["traceMask"], opset_version=17, dynamo=False)
    import onnx
    import onnxruntime as ort

    onnx.checker.check_model(str(path))
    session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    prediction, = session.run(["traceMask"], {"ink": inputs.numpy()})
    np.testing.assert_allclose(prediction, model(inputs).detach().numpy(), atol=1e-5, rtol=1e-4)
    (args.out / "digitizer_metrics.json").write_text(json.dumps(result, indent=2, allow_nan=False) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--photo-pairs", type=Path)
    parser.add_argument("--photo-test-ids", type=Path)
    parser.add_argument("--epochs", type=int, default=8)
    parser.add_argument("--samples-per-epoch", type=int, default=4096)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--device", choices=["cpu", "cuda", "mps"], default="cpu")
    parser.add_argument("--seed", type=int, default=64)
    compare(parser.parse_args())
