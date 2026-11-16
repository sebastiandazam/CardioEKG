"""Fast checks of separation and fail-closed behavior, not clinical validation."""
import json,sys,unittest
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).parent))
from diagnosis import targets_external,thresholds
P=Path('training/clinical-run')
class Guards(unittest.TestCase):
 def test_frozen_patient_groups_do_not_cross_splits(self):
  cohorts=json.loads((P/'cohort-manifest.json').read_text());seen={};counts={};excluded=set(cohorts['excluded_ptb_patients'])
  for row in cohorts['cohorts']['ptb']:
   self.assertNotIn(row['patient_id'],excluded);self.assertEqual(seen.setdefault(row['patient_id'],row['split']),row['split']);counts[row['split']]=counts.get(row['split'],0)+1
   fold=int(row['strat_fold']);self.assertIn(fold,range(1,8) if row['split']=='fit' else {'selection':[8],'calibration':[9],'test':[10]}[row['split']])
  self.assertEqual(counts,{'fit':4000,'selection':500,'calibration':500,'test':1000})
 def test_generic_bundle_blocks_are_unknown_not_false_negatives(self):
  y=targets_external('#Dx: 59118001,164909002');self.assertTrue(np.isnan(y[2]));self.assertTrue(np.isnan(y[3]));self.assertTrue(np.isnan(y[13]));self.assertTrue(np.isnan(y[14]))
  y=targets_external('#Dx: 713427006,733534002');self.assertEqual(y[2],1);self.assertEqual(y[3],1)
 def test_empty_calibration_disables_thresholds(self):
  self.assertEqual(thresholds(np.empty((0,15)),np.empty((0,15))),[[-1,2]]*15)
 def test_unvalidated_candidates_never_report_active(self):
  for file in ['diagnosis-report.json','delineation-report.json']:
   report=json.loads((P/file).read_text());self.assertFalse(report['activation_gate_passed']);self.assertTrue(report['gate_failures'])
 def test_public_summary_contains_no_rows_or_signals(self):
  summary=json.loads(Path('public/models/research-summary.json').read_text());self.assertFalse(summary['validated_model_available']);self.assertFalse(summary['diagnostic_use_enabled'])
  forbidden={'patient_id','ecg_id','patient','record','records_rows','p_signal','mv','signal','test_rows'}
  def walk(v):
   if isinstance(v,dict):
    for k,x in v.items():self.assertNotIn(k,forbidden);walk(x)
   elif isinstance(v,list):
    for x in v:walk(x)
  walk(summary)
if __name__=='__main__':unittest.main()
