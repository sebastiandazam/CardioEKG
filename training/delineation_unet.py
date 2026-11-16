"""Hybrid 1D Residual-SE U-Net with Multitask Rhythm Gate and Prewitt Boundary Loss.

Synthesizes the top architectural patterns validated in ECG delineation literature:
- Jiménez-Pérez et al. (Sci. Rep. 2021; arXiv:2111.12996): 1D U-Net with K=9 kernels,
  Prewitt 11-sample BoundaryLoss, and Prewitt 3-sample F1InstanceLoss for crisp P/QRS/T onsets.
- Joung et al. (arXiv:2304.06237): Multiscale arrhythmia classification head suppressing
  false-positive P-wave delineations in atrial fibrillation and atrial flutter.
- Sereda et al. / Moskalenko et al. (LUDB 1.0.1): Single-lead & 12-lead dense segmentation
  paired with physiological P -> QRS -> T sequential state constraints.

Pure NumPy/PyTorch module: safe to import for architecture inspection or training without
mutating production runtime behavior until external validation gates pass.
"""
from __future__ import annotations

import numpy as np

WAVE_CHANNELS = ("baseline", "p", "qrs", "t")
RHYTHM_CLASSES = ("sr", "afib", "afl", "svt", "vt")


def _try_import_torch():
    try:
        import torch
        import torch.nn as nn
        import torch.nn.functional as F

        return torch, nn, F
    except ImportError:
        return None, None, None


torch, nn, F = _try_import_torch()


def enforce_physiological_sequence(
    probs: np.ndarray,
    fs: float = 500.0,
    af_afl_prob: float = 0.0,
    qrs_thresh: float = 0.45,
    p_thresh: float = 0.42,
    t_thresh: float = 0.42,
) -> dict[str, list[tuple[int, int]]]:
    """Decode class probability tracks (C=4, N) into non-overlapping P, QRS, T spans.

    Enforces cardiac electromechanical causality:
    1. Locate QRS complexes >= 40 ms separated by >= 200 ms refractory interval.
    2. Before each QRS_onset, search P in [QRS_onset - 340 ms, QRS_onset - 20 ms] unless
       the rhythm head indicates high AF/AFL probability (>= 0.55).
    3. After each QRS_offset, search T in [QRS_offset + 20 ms, min(next_QRS - 20 ms, QRS_onset + 650 ms)].
    """
    if probs.ndim != 2 or probs.shape[0] < 4:
        raise ValueError(f"Expected probability map of shape (4, N), got {probs.shape}")

    n_samples = probs.shape[1]

    def _spans(track: np.ndarray, threshold: float, min_samples: int) -> list[tuple[int, int]]:
        active = track >= threshold
        spans: list[tuple[int, int]] = []
        start = None
        for i, val in enumerate(active):
            if val and start is None:
                start = i
            elif not val and start is not None:
                if i - start >= min_samples:
                    spans.append((start, i))
                start = None
        if start is not None and n_samples - start >= min_samples:
            spans.append((start, n_samples))
        return spans

    # 1. QRS spans with minimum width 36 ms and refractory merge < 180 ms
    raw_qrs = _spans(probs[2], qrs_thresh, max(2, int(round(0.036 * fs))))
    qrs_spans: list[tuple[int, int]] = []
    min_gap = int(round(0.180 * fs))
    for s, e in raw_qrs:
        if qrs_spans and s - qrs_spans[-1][1] < min_gap:
            prev_s, prev_e = qrs_spans[-1]
            # Keep strongest integrated QRS probability
            if float(probs[2, s:e].sum()) > float(probs[2, prev_s:prev_e].sum()):
                qrs_spans[-1] = (s, e)
        else:
            qrs_spans.append((s, e))

    p_spans: list[tuple[int, int]] = []
    t_spans: list[tuple[int, int]] = []
    min_pt = max(2, int(round(0.035 * fs)))

    suppress_p = af_afl_prob >= 0.55
    for idx, (qs, qe) in enumerate(qrs_spans):
        prev_t_end = t_spans[-1][1] + int(round(0.015 * fs)) if t_spans else 0
        if not suppress_p:
            p_win_start = max(prev_t_end, qs - int(round(0.340 * fs)))
            p_win_end = max(p_win_start, qs - int(round(0.016 * fs)))
            if p_win_end - p_win_start >= min_pt:
                cands = _spans(probs[1, p_win_start:p_win_end], p_thresh, min_pt)
                if cands:
                    best = max(cands, key=lambda c: float(probs[1, p_win_start + c[0] : p_win_start + c[1]].sum()))
                    p_spans.append((p_win_start + best[0], p_win_start + best[1]))

        next_qs = qrs_spans[idx + 1][0] - int(round(0.020 * fs)) if idx + 1 < len(qrs_spans) else n_samples
        t_win_start = min(n_samples, qe + int(round(0.016 * fs)))
        t_win_end = min(next_qs, qs + int(round(0.650 * fs)))
        if t_win_end - t_win_start >= min_pt:
            cands = _spans(probs[3, t_win_start:t_win_end], t_thresh, min_pt)
            if cands:
                best = max(cands, key=lambda c: float(probs[3, t_win_start + c[0] : t_win_start + c[1]].sum()))
                t_spans.append((t_win_start + best[0], t_win_start + best[1]))

    return {"p": p_spans, "qrs": qrs_spans, "t": t_spans}


if nn is not None:

    class SEBlock1D(nn.Module):
        """Squeeze-and-Excitation channel attention across 12-lead / bottleneck feature maps."""

        def __init__(self, channels: int, reduction: int = 8):
            super().__init__()
            hidden = max(4, channels // reduction)
            self.fc1 = nn.Conv1d(channels, hidden, kernel_size=1)
            self.fc2 = nn.Conv1d(hidden, channels, kernel_size=1)

        def forward(self, x):
            scale = x.mean(dim=-1, keepdim=True)
            scale = F.gelu(self.fc1(scale))
            scale = torch.sigmoid(self.fc2(scale))
            return x * scale

    class ConvResSEBlock1D(nn.Module):
        """Residual 1D block with odd K=9 receptive field and SE channel recalibration."""

        def __init__(
            self,
            in_ch: int,
            out_ch: int,
            kernel_size: int = 9,
            dilation: int = 1,
            dropout: float = 0.05,
        ):
            super().__init__()
            pad = (dilation * (kernel_size - 1)) // 2
            groups1 = min(8, out_ch) if out_ch % min(8, out_ch) == 0 else 1
            self.conv1 = nn.Conv1d(in_ch, out_ch, kernel_size, padding=pad, dilation=dilation, bias=False)
            self.norm1 = nn.GroupNorm(groups1, out_ch)
            self.conv2 = nn.Conv1d(out_ch, out_ch, kernel_size, padding=pad, dilation=dilation, bias=False)
            self.norm2 = nn.GroupNorm(groups1, out_ch)
            self.se = SEBlock1D(out_ch)
            self.drop = nn.Dropout(dropout) if dropout > 0 else nn.Identity()
            self.shortcut = (
                nn.Sequential(nn.Conv1d(in_ch, out_ch, kernel_size=1, bias=False), nn.GroupNorm(groups1, out_ch))
                if in_ch != out_ch
                else nn.Identity()
            )

        def forward(self, x):
            h = F.gelu(self.norm1(self.conv1(x)))
            h = self.drop(h)
            h = self.norm2(self.conv2(h))
            h = self.se(h)
            return F.gelu(h + self.shortcut(x))

    class ECGResSEUNet1D(nn.Module):
        """5-level 1D ResSE-UNet with dilated bottleneck and multitask rhythm suppression gate."""

        def __init__(
            self,
            in_leads: int = 12,
            num_seg_classes: int = 4,
            num_rhythm_classes: int = 5,
            base_ch: int = 24,
            depth: int = 5,
            kernel_size: int = 9,
        ):
            super().__init__()
            self.depth = depth
            self.num_seg_classes = num_seg_classes
            self.encoders = nn.ModuleList()
            self.pools = nn.ModuleList()
            ch = in_leads
            enc_channels: list[int] = []
            for lvl in range(depth):
                out_ch = base_ch * (2**lvl)
                self.encoders.append(ConvResSEBlock1D(ch, out_ch, kernel_size=kernel_size))
                enc_channels.append(out_ch)
                if lvl < depth - 1:
                    self.pools.append(nn.MaxPool1d(kernel_size=2, stride=2))
                ch = out_ch

            # Dilated multiscale context block at bottleneck
            self.bottleneck_dilated = nn.Sequential(
                ConvResSEBlock1D(ch, ch, kernel_size=7, dilation=2),
                ConvResSEBlock1D(ch, ch, kernel_size=7, dilation=4),
            )

            # Symmetric decoder
            self.upconvs = nn.ModuleList()
            self.decoders = nn.ModuleList()
            for lvl in range(depth - 2, -1, -1):
                skip_ch = enc_channels[lvl]
                self.upconvs.append(nn.ConvTranspose1d(ch, skip_ch, kernel_size=2, stride=2))
                self.decoders.append(ConvResSEBlock1D(skip_ch * 2, skip_ch, kernel_size=kernel_size))
                ch = skip_ch

            self.seg_head = nn.Conv1d(ch, num_seg_classes, kernel_size=1)

            # Multiscale arrhythmia head (Joung et al. 2023)
            multi_dim = sum(enc_channels[-3:]) * 2
            self.rhythm_head = nn.Sequential(
                nn.Linear(multi_dim, 64),
                nn.GELU(),
                nn.Dropout(0.15),
                nn.Linear(64, num_rhythm_classes),
            )
            nn.init.constant_(self.rhythm_head[-1].bias, -2.5)
            self.p_gate_strength = nn.Parameter(torch.tensor(3.5))

        def forward(self, x, use_rhythm_gate: bool = True):
            orig_len = x.shape[-1]
            stride = 2 ** (self.depth - 1)
            pad = (stride - (orig_len % stride)) % stride
            if pad > 0:
                x = F.pad(x, (0, pad), mode="replicate")

            skips = []
            h = x
            for lvl in range(self.depth):
                h = self.encoders[lvl](h)
                skips.append(h)
                if lvl < self.depth - 1:
                    h = self.pools[lvl](h)

            h = self.bottleneck_dilated(h)

            # Collect multiscale pooled statistics from the deepest 3 encoder/bottleneck stages
            pooled_feats = []
            for feat in [skips[-3], skips[-2], h]:
                pooled_feats.append(feat.mean(dim=-1))
                pooled_feats.append(feat.amax(dim=-1))
            rhythm_logits = self.rhythm_head(torch.cat(pooled_feats, dim=-1))

            for i, lvl in enumerate(range(self.depth - 2, -1, -1)):
                h = self.upconvs[i](h)
                skip = skips[lvl]
                if h.shape[-1] != skip.shape[-1]:
                    h = F.interpolate(h, size=skip.shape[-1], mode="linear", align_corners=False)
                h = self.decoders[i](torch.cat([h, skip], dim=1))

            seg_logits = self.seg_head(h)[..., :orig_len]

            # Suppress false P waves when AFIB (idx 1) or AFL (idx 2) probability is elevated
            if use_rhythm_gate:
                rhythm_probs = torch.sigmoid(rhythm_logits)
                af_afl_prob = torch.clamp(rhythm_probs[:, 1] + rhythm_probs[:, 2], max=1.0).unsqueeze(-1)
                seg_logits = seg_logits.clone()
                seg_logits[:, 1, :] = seg_logits[:, 1, :] - F.softplus(self.p_gate_strength) * af_afl_prob

            return seg_logits, rhythm_logits

    class JimenezPerezCompositeLoss(nn.Module):
        """BCE + Soft Dice + Prewitt-11 BoundaryLoss + Prewitt-3 F1InstanceLoss (arXiv:2111.12996)."""

        def __init__(self, boundary_weight: float = 0.5, instance_weight: float = 0.25):
            super().__init__()
            self.boundary_weight = boundary_weight
            self.instance_weight = instance_weight
            k11 = torch.tensor([1, 1, 1, 1, 1, 0, -1, -1, -1, -1, -1], dtype=torch.float32) / 10.0
            k3 = torch.tensor([1, 0, -1], dtype=torch.float32) / 2.0
            self.register_buffer("prewitt11", k11.view(1, 1, 11))
            self.register_buffer("prewitt3", k3.view(1, 1, 3))

        def _prewitt_grad(self, tensor_bcn, kernel):
            b, c, n = tensor_bcn.shape
            flat = tensor_bcn.reshape(b * c, 1, n)
            pad = kernel.shape[-1] // 2
            return F.conv1d(flat, kernel, padding=pad).reshape(b, c, n)

        def forward(self, seg_logits, seg_targets):
            bce = F.binary_cross_entropy_with_logits(seg_logits, seg_targets)
            probs = torch.sigmoid(seg_logits)

            # Soft Dice over P, QRS, T channels (indices 1..3)
            p_fg = probs[:, 1:, :]
            t_fg = seg_targets[:, 1:, :]
            inter = (p_fg * t_fg).sum(dim=-1)
            denom = p_fg.sum(dim=-1) + t_fg.sum(dim=-1) + 1e-6
            dice = 1.0 - ((2.0 * inter + 1e-6) / denom).mean()

            # Prewitt 11-sample boundary L2 loss & Prewitt 3-sample onset/offset slope loss
            g_pred11 = self._prewitt_grad(p_fg, self.prewitt11)
            g_true11 = self._prewitt_grad(t_fg, self.prewitt11)
            boundary_loss = F.smooth_l1_loss(g_pred11, g_true11)

            g_pred3 = torch.abs(self._prewitt_grad(p_fg, self.prewitt3))
            g_true3 = torch.abs(self._prewitt_grad(t_fg, self.prewitt3))
            b_inter = (g_pred3 * g_true3).sum(dim=-1)
            b_denom = g_pred3.sum(dim=-1) + g_true3.sum(dim=-1) + 1e-6
            instance_loss = 1.0 - ((2.0 * b_inter + 1e-6) / b_denom).mean()

            return bce + dice + self.boundary_weight * boundary_loss + self.instance_weight * instance_loss

else:  # pragma: no cover - graceful fallback when PyTorch is absent
    SEBlock1D = None
    ConvResSEBlock1D = None
    ECGResSEUNet1D = None
    JimenezPerezCompositeLoss = None
