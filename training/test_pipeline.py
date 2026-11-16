"""Fast checks for data boundaries, report arithmetic and digitization."""
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

from digitize import HEIGHT, WIDTH, draw_paired_crop, errors, ink_probability, interpolate, trace_pixels
from evaluate_pilot import MEASUREMENTS, evaluate
from metrics import decisions_from, report
from prepare import CLASSES, photo_exclusions, paper_layout, ptb_entries
from rules import estimate


class PipelineTests(unittest.TestCase):
    def test_photo_exclusion_covers_patient_not_just_record(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "ptbxl_database.csv").write_text(
                "ecg_id,patient_id,strat_fold,scp_codes,filename_lr,validated_by_human\n"
                "1,102,1,{'SR': 0},a,True\n2,102,1,{'AFIB': 0},b,True\n3,103,9,{'CRBBB': 100},c,True\n"
            )
            ids = root / "exclude.txt"
            ids.write_text("00001\n")
            rows = ptb_entries(root, photo_exclusions(ids))
            self.assertEqual([(r.record, r.partition, r.labels) for r in rows],
                             [("3", "calibration", (0.0, 0.0, 1.0, 0.0))])
            with self.assertRaisesRegex(ValueError, "unknown PTB-XL"):
                ptb_entries(root, {"99"})

    def test_patient_overlap_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "ptbxl_database.csv").write_text(
                "ecg_id,patient_id,strat_fold,scp_codes,filename_lr,validated_by_human\n"
                "1,102,1,{'SR': 0},a,True\n2,102,10,{'AFIB': 0},b,True\n"
            )
            with self.assertRaisesRegex(ValueError, "Patient 102 appears"):
                ptb_entries(root, set())

    def test_asynchronous_layout_and_long_rhythm(self):
        signals = np.tile(np.arange(1000), (12, 1)) + np.arange(12)[:, None] * 1000
        segments, ii = paper_layout(signals)
        self.assertEqual(segments[:, 0].tolist(),
                         [0, 1000, 2000, 3250, 4250, 5250, 6500, 7500, 8500, 9750, 10750, 11750])
        np.testing.assert_array_equal(ii, signals[1:2])
        np.testing.assert_array_equal(np.isnan(estimate(np.zeros((12, 250)), np.zeros((1, 1000)))),
                                      np.ones(4, dtype=bool))

    def test_report_tracks_abstentions_without_credit(self):
        labels = np.tile([1, 1, 0, 0], (4, 1)).T
        probabilities = np.tile([0.9, 0.5, 0.1, 0.1], (4, 1)).T
        decisions = decisions_from(probabilities, np.full(4, 0.2), np.full(4, 0.8))
        stats = report(labels, probabilities, decisions, np.array(["a", "b", "c", "c"]), 20)["af"]
        self.assertEqual(stats["coverage"], 0.75)
        self.assertEqual(stats["auroc"], 1)
        self.assertEqual(stats["sensitivity_among_covered"], 1)
        self.assertEqual(stats["sensitivity_counting_abstentions_as_misses"], 0.5)
        self.assertEqual(stats["abstained_positives"], 1)

    def test_pilot_needs_adjudication_and_wraps_axis(self):
        row = {"record": "trial1", "patient": "pseudo1", "quality": "adequate"}
        for name in CLASSES:
            row.update({f"{name}_reader1": "0", f"{name}_reader2": "0",
                        f"{name}_adjudicated": "", f"{name}_score": "", f"{name}_decision": ""})
        for name in MEASUREMENTS:
            row.update({f"{name}_reference": "", f"{name}_estimate": ""})
        row.update({"axis_deg_reference": "179", "axis_deg_estimate": "-179"})
        self.assertEqual(evaluate([row], 0)["all_cases"]["measurements"]["axis_deg"]["mean_abs_error"], 2)
        row["af_reader2"] = "1"
        with self.assertRaisesRegex(ValueError, "adjudicated"):
            evaluate([row], 0)

    def test_classical_digitization_recovers_clean_trace_and_abstains_on_blank(self):
        signal = 0.45 * np.sin(np.linspace(0, 5 * np.pi, 250))
        image, _, zero, scale = draw_paired_crop(signal, np.random.default_rng(17))
        extracted = trace_pixels(ink_probability(image))
        comparison = errors(signal, interpolate((zero - extracted) / scale, 250))
        self.assertIsNotNone(comparison["mae_mv"])
        self.assertLess(comparison["mae_mv"], 0.08)
        empty = Image.new("RGB", (WIDTH, HEIGHT), "white")
        self.assertTrue(np.isnan(trace_pixels(ink_probability(empty))).all())

    def test_physiological_postprocessor_orders_waves_and_suppresses_af_p(self):
        from delineation_unet import enforce_physiological_sequence

        fs = 500.0
        probs = np.zeros((4, 1000), dtype=np.float32)
        probs[1, 100:140] = 0.85  # valid P before QRS1
        probs[1, 205:245] = 0.90  # impossible P inside/touching QRS2 onset window
        probs[2, 160:210] = 0.92  # QRS1
        probs[3, 270:350] = 0.88  # T1

        sinus = enforce_physiological_sequence(probs, fs=fs, af_afl_prob=0.1)
        self.assertEqual(len(sinus["qrs"]), 1)
        self.assertEqual(len(sinus["p"]), 1)
        self.assertLess(sinus["p"][0][1], sinus["qrs"][0][0])
        self.assertGreater(sinus["t"][0][0], sinus["qrs"][0][1])

        afib = enforce_physiological_sequence(probs, fs=fs, af_afl_prob=0.8)
        self.assertEqual(afib["p"], [])
        self.assertEqual(len(afib["qrs"]), 1)

    def test_resse_unet_and_prewitt_loss_when_torch_present(self):
        import delineation_unet as du

        if du.torch is None:
            self.skipTest("PyTorch not yet installed in .venv")
        torch = du.torch
        model = du.ECGResSEUNet1D(in_leads=12, num_seg_classes=4, num_rhythm_classes=5, base_ch=16, depth=4)
        loss_fn = du.JimenezPerezCompositeLoss()
        x = torch.randn(2, 12, 500)
        seg_logits, rhythm_logits = model(x)
        self.assertEqual(tuple(seg_logits.shape), (2, 4, 500))
        self.assertEqual(tuple(rhythm_logits.shape), (2, 5))
        targets = torch.zeros(2, 4, 500)
        targets[:, 2, 100:130] = 1.0
        loss = loss_fn(seg_logits, targets)
        self.assertTrue(torch.isfinite(loss).item())
        loss.backward()


if __name__ == "__main__":
    unittest.main()
