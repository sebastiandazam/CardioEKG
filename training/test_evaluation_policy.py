import unittest
from evaluation_policy import calibration_groups,human_validated
from prepare import parse_age
class PolicyTests(unittest.TestCase):
    def test_patient_disjoint_calibration_is_reproducible(self):
        patients=['a','b','a','c','d','c']
        a,b=calibration_groups(patients)
        self.assertFalse(set(p for p,k in zip(patients,a) if k)&set(p for p,k in zip(patients,b) if k))
        self.assertEqual(a.tolist(),calibration_groups(patients)[0].tolist())
    def test_unknown_labels_are_not_human_validated(self):
        self.assertFalse(human_validated({}))
        self.assertFalse(human_validated({'validated_by_human':False}))
        self.assertTrue(human_validated({'validated_by_human':'True','scp_codes':"{'SR': 0}"}))
    def test_topcoded_age_is_lower_bound(self):
        self.assertEqual(parse_age('300'),90)
if __name__=='__main__':unittest.main()
