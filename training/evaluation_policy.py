"""Prespecified provenance and calibration boundaries; not clinical validation."""
import hashlib
import numpy as np

def human_validated(row):
    return str(row.get('validated_by_human','')).strip().lower() in {'true','1','yes'}

def calibration_groups(patients, seed=20261112):
    """Deterministic 50/50 patient split, independent of labels and predictions."""
    patients=np.asarray(patients).astype(str)
    unique=sorted(set(patients),key=lambda p:hashlib.sha256(f'{seed}:{p}'.encode()).hexdigest())
    probability=set(unique[:len(unique)//2])
    first=np.array([p in probability for p in patients],dtype=bool)
    return first,~first
