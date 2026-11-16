"""Regression checks for the shared normalized signal interface."""
import unittest
import json
from pathlib import Path
import numpy as np
from gen_sintetico import beat, sintetizar, LEADS
from run_measure import measure_signals, p_separated_from_qrs
from ecg_analisis import punto_quiebre


class SignalMeasurementTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        _, signals, _ = sintetizar(dur=5)
        cls.traces = {k: {'mv': v.tolist(), 'seconds': 5} for k, v in signals.items()}

    def test_regular_and_manual(self):
        result = measure_signals({'traces': self.traces, 'axisComparable': True,
            'measurementWindows': {'qrsMs': [{'lead': 'II', 'start': 1.0, 'end': 1.1}]}})
        m = result['estimate']['measurements']
        self.assertAlmostEqual(m['rateBpm'], 72, delta=3)
        self.assertAlmostEqual(m['qrsMs'], 90, delta=25)
        self.assertAlmostEqual(m['axisDeg'], 60, delta=15)
        self.assertAlmostEqual(result['manualMeasurements']['qrsMs'], 100)
        self.assertTrue(result['estimate']['markersByLead']['II'])
        t_markers = [x for x in result['estimate']['markersByLead']['II'] if x['phase'] == 't']
        self.assertTrue(t_markers)
        self.assertTrue(all(x['end'] > x['start'] for x in t_markers))
        self.assertIsNotNone(result['estimate']['leadDetails']['II']['tOnsetOffsetMs'])
        self.assertIsNotNone(result['estimate']['global']['tAxisDeg'])

    def test_absent_p_and_incomparable_axis(self):
        t = np.arange(1250) * 4.0
        x = np.zeros_like(t, dtype=float)
        for onset in range(400, 4800, 833):
            x += beat(t-onset, 1, .25, 0, 160, 90, 380, 100)
        result = measure_signals({'traces': {k: {'mv': x.tolist(), 'seconds': 5} for k in LEADS}})
        self.assertIsNone(result['estimate']['measurements']['prMs'])
        self.assertIsNone(result['estimate']['measurements']['axisDeg'])

    def test_manual_axis_uses_augmented_lead_geometry(self):
        traces = dict(self.traces)
        for lead, amplitude in [('I', 1), ('aVF', np.sqrt(3)/2)]:
            signal = np.zeros(1250)
            signal[250:275] = amplitude
            traces[lead] = {'mv': signal.tolist(), 'seconds': 5}
        windows = [{'lead': lead, 'start': 1., 'end': 1.1} for lead in ('I', 'aVF')]
        result = measure_signals({'traces': traces, 'measurementWindows': {'axisDeg': windows}, 'axisComparable': True})
        self.assertAlmostEqual(result['manualMeasurements']['axisDeg'], 45, delta=.1)
        incompatible = measure_signals({'traces': traces, 'measurementWindows': {'axisDeg': windows}, 'axisComparable': False})
        self.assertNotIn('axisDeg', incompatible['manualMeasurements'])

    def test_qrs_maximum_supported_and_separate_rhythm(self):
        _, fast, _ = sintetizar(hr=100, QRS=130, dur=5, seed=12)
        traces = dict(self.traces)
        traces['V6'] = {'mv': fast['V6'].tolist(), 'seconds': 5}
        result = measure_signals({'traces': traces, 'rhythmTrace': {'mv': fast['II'].tolist(), 'seconds': 5}, 'rhythmLead': 'II'})
        estimate = result['estimate']; rhythm = result['rhythmEstimate']
        self.assertAlmostEqual(estimate['measurements']['rateBpm'], 72, delta=3)
        self.assertAlmostEqual(rhythm['measurements']['rateBpm'], 100, delta=4)
        self.assertEqual(estimate['qrsMethod'], 'robust-local-consensus')
        supported = estimate['measurementLeads']['qrsMs']
        self.assertAlmostEqual(estimate['measurements']['qrsMs'], max(estimate['leadDetails'][lead]['qrsMs'] for lead in supported))
        self.assertEqual(rhythm['measurementLeads']['qrsMs'], ['II'])
        self.assertAlmostEqual(rhythm['measurements']['qrsMs'], rhythm['leadDetails']['II']['qrsMs'])

    def test_qtc_uses_manual_windows_and_refuses_wide_qrs(self):
        windows = {'qtMs': [{'lead': 'II', 'start': 1, 'end': 1.4}],
                   'qrsMs': [{'lead': 'II', 'start': 1, 'end': 1.08}]}
        result = measure_signals({'traces': self.traces, 'measurementWindows': windows})
        rr = 60 / result['estimate']['measurements']['rateBpm']
        self.assertAlmostEqual(result['derived']['qtcBazettMs'], 400 / np.sqrt(rr))
        self.assertAlmostEqual(result['derived']['qtcFridericiaMs'], 400 / rr**(1/3))
        windows['qrsMs'][0]['end'] = 1.14
        wide = measure_signals({'traces': self.traces, 'measurementWindows': windows})
        self.assertIsNone(wide['derived']['qtcBazettMs'])
        self.assertIsNone(wide['derived']['qtcFridericiaMs'])

    def test_irregular_rhythm_withholds_pr_and_axis(self):
        t = np.arange(2000) * 4.0
        x = np.zeros_like(t)
        for onset in [500, 1200, 2200, 2750, 3800, 4500, 5550, 6200, 7250]:
            x += beat(t-onset, 1, .25, .1, 160, 90, 380, 100)
        result = measure_signals({'traces': {k: {'mv': x.tolist(), 'seconds': 8} for k in LEADS}, 'axisComparable': True})
        self.assertTrue(result['quality']['irregular'])
        self.assertIsNone(result['estimate']['measurements']['prMs'])
        self.assertIsNone(result['estimate']['measurements']['axisDeg'])
        self.assertIsNone(result['derived']['qtcBazettMs'])

    def test_rapid_irregular_record_does_not_claim_pr(self):
        source = json.loads((Path(__file__).resolve().parents[2] / 'src/data/afib.json').read_text())
        traces = {k: {'mv': v, 'seconds': len(v)/source['sampleRate']} for k,v in source['signals'].items()}
        result = measure_signals({'traces': traces, 'axisComparable': True})
        self.assertIsNone(result['estimate']['measurements']['prMs'])
        self.assertIsNone(result['estimate']['global']['pPresent'])
        self.assertTrue(result['quality']['irregular'])
        self.assertGreater(result['estimate']['measurements']['rateBpm'], 130)
        self.assertLess(result['estimate']['measurements']['rateBpm'], 190)
        self.assertTrue(all(d['morphology']['qMs'] != 0 for d in result['estimate']['leadDetails'].values()))

    def test_delta_breakpoint_matches_least_squares_reference(self):
        random = np.random.default_rng(8)
        for _ in range(10):
            x = random.normal(size=120).cumsum()
            a, b = 20, 75
            reference = []
            for bp in range(a+8, b-3):
                errors = []
                for indices in (np.arange(a,bp), np.arange(bp,b+1)):
                    fit = np.polyfit(indices,x[indices],1)
                    errors.append(np.sum((np.polyval(fit,indices)-x[indices])**2))
                reference.append((sum(errors),bp))
            self.assertEqual(punto_quiebre(x,a,b)[0], min(reference)[1])

    def test_repeatable_positive_and_negative_delta_candidates(self):
        t = np.arange(1500)/250
        signal = np.zeros_like(t)
        for onset in np.arange(.5, 5.6, .8):
            d = (t-onset)*1000
            signal += np.interp(d, [-150,-125,-85,-65,-1,0,40,65,95,140,145,180,250,360,420],
                [0,.1,.1,0,0,0,.18,1,-.25,0,0,0,.25,0,0],left=0,right=0)
        traces = {k: {'mv': (signal * (-1 if k in ('V1','III','aVR') else 1)).tolist(), 'seconds': 6} for k in LEADS}
        result = measure_signals({'traces': traces})
        evidence = result['estimate']['global']['preexcitation']
        self.assertEqual(evidence['status'], 'supported')
        for lead, polarity in [('II','positive'), ('V1','negative')]:
            candidate = result['estimate']['leadDetails'][lead]['morphology']['deltaEvidence']
            self.assertEqual(candidate['status'], 'supported')
            self.assertEqual(candidate['polarity'], polarity)
            self.assertGreaterEqual(candidate['repeatableBeats'], 2)

    def test_simultaneous_alignment_requires_matching_timing(self):
        aligned = measure_signals({'traces': self.traces, 'simultaneous': True})
        self.assertTrue(aligned['quality']['refinement']['simultaneousAligned'])
        self.assertEqual(aligned['estimate']['qrsMethod'], 'global-simultaneous')
        mismatch = dict(self.traces)
        mismatch['I'] = {'mv': mismatch['I']['mv'][:-250], 'seconds': 4.5}
        result = measure_signals({'traces': mismatch, 'simultaneous': True})
        self.assertFalse(result['quality']['refinement']['simultaneousAligned'])
        self.assertNotEqual(result['estimate']['qrsMethod'], 'global-simultaneous')
        self.assertTrue(any('Alineación simultánea' in w for w in result['quality']['warnings']))

    def test_noisy_signals_have_bounded_retry_and_no_supported_delta(self):
        _, signals, _ = sintetizar(dur=5, seed=40)
        random = np.random.default_rng(4)
        traces = {k: {'mv': (v + .06*random.normal(size=len(v))).tolist(), 'seconds': 5} for k,v in signals.items()}
        result = measure_signals({'traces': traces})
        self.assertNotEqual(result['estimate']['global']['preexcitation']['status'], 'supported')
        refinement = result['quality']['refinement']
        self.assertLessEqual(refinement['attempts'], 3)
        self.assertLessEqual(len(refinement['retries']), 4)
        self.assertTrue(all(r['selected'] in ('original','sg-5ms','sg-9ms','none') for r in refinement['retries']))

    def test_short_pr_without_delta_is_not_positive(self):
        _, signals, _ = sintetizar(PR=100, dur=5, seed=3)
        traces = {k: {'mv': v.tolist(), 'seconds': 5} for k,v in signals.items()}
        result = measure_signals({'traces': traces, 'axisComparable': True})
        self.assertNotEqual(result['estimate']['global']['preexcitation']['status'], 'supported')
        self.assertLessEqual(result['quality']['refinement']['attempts'], 3)

    def test_development_case_when_local_fixture_available(self):
        path = Path('/tmp/cardio-case218-file.json')
        if not path.is_file(): self.skipTest('Local development fixture is not available')
        payload = json.loads(path.read_text())
        result = measure_signals({'traces': payload['traces'], 'rhythmTrace': payload['rhythmTrace'], 'rhythmLead': 'II', 'axisComparable': True})
        ev = result['estimate']['global']['preexcitation']
        self.assertEqual(ev['status'], 'supported')
        self.assertGreaterEqual(len(ev['supportingLeads']), 3)
        per = result['estimate']['leadDetails']
        self.assertTrue(any(per[k]['morphology']['deltaEvidence']['polarity'] == 'negative' for k in ev['supportingLeads']))
        self.assertTrue(any(per[k]['morphology']['deltaEvidence']['polarity'] == 'positive' for k in ev['supportingLeads']))
        self.assertIn('V2', result['quality']['refinement']['excludedLeads'])
        self.assertTrue(2 <= result['quality']['refinement']['attempts'] <= 3)
        self.assertLess(result['estimate']['measurements']['qrsMs'], per['V2']['qrsMs'])
        self.assertTrue(all(w['start'] < w['end'] <= w['peak'] for k in ev['supportingLeads'] for w in per[k]['morphology']['deltaEvidence']['windows']))

    def test_overlapping_p_and_qrs_are_not_accepted(self):
        self.assertFalse(p_separated_from_qrs(-104, -119))
        self.assertFalse(p_separated_from_qrs(-110, -109))
        self.assertTrue(p_separated_from_qrs(-108, -45))

    def test_flat_signal_fails_explicitly(self):
        with self.assertRaises(ValueError):
            measure_signals({'traces': {'II': {'mv': [0] * 500, 'seconds': 2}}})


if __name__ == '__main__':
    unittest.main()
