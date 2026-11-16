"""Fail-closed adapter for an explicitly approved ONNX candidate.

This is not activated by /api/analyze. The latter uses canonical local analysis.
A deployment must supply a reviewed manifest and feed adapter before inference.
"""
from __future__ import annotations
import hashlib
import json
from pathlib import Path


class ModelNotApproved(ValueError):
    pass


def approved_manifest(path: Path):
    path = path.resolve()
    manifest = json.loads(path.read_text())
    if manifest.get('schemaVersion') != 1 or manifest.get('approvedForPublicUse') is not True:
        raise ModelNotApproved('Model has not been approved for public use')
    validation = manifest.get('validation', {})
    if validation.get('externalPassed') is not True or validation.get('calibrated') is not True:
        raise ModelNotApproved('External validation and probability calibration are required')
    labels = manifest.get('labels')
    if not isinstance(labels, list) or not labels or not all(isinstance(label, str) and label for label in labels) or len(set(labels)) != len(labels):
        raise ModelNotApproved('An explicit ordered class list is required')
    if not isinstance(manifest.get('inputShapes'), dict) or not manifest['inputShapes']:
        raise ModelNotApproved('An explicit reviewed input contract is required')
    if not isinstance(manifest.get('modelFile'), str):
        raise ModelNotApproved('Local model filename is required')
    for shape in manifest['inputShapes'].values():
        if not isinstance(shape, list) or not 1 <= len(shape) <= 5 or not all(isinstance(n, int) and not isinstance(n, bool) and 0 < n <= 100_000 for n in shape):
            raise ModelNotApproved('Input dimensions must be finite positive fixed integers')
        size = 1
        for n in shape: size *= n
        if size > 10_000_000:
            raise ModelNotApproved('Model input exceeds the element limit')
    artifact = (path.parent / manifest['modelFile']).resolve()
    if artifact.parent != path.parent or artifact.suffix != '.onnx' or not artifact.is_file():
        raise ModelNotApproved('Model artifact must be a local ONNX file beside the manifest')
    if artifact.stat().st_size > 100 * 1024 * 1024:
        raise ModelNotApproved('Model artifact exceeds the size limit')
    if hashlib.sha256(artifact.read_bytes()).hexdigest() != manifest.get('sha256'):
        raise ModelNotApproved('Model artifact hash mismatch')
    return manifest, artifact


class ApprovedOnnxRuntime:
    def __init__(self, manifest_path: Path):
        self.manifest, artifact = approved_manifest(manifest_path)
        import onnxruntime as ort
        self.session = ort.InferenceSession(str(artifact), providers=['CPUExecutionProvider'])
        if {value.name for value in self.session.get_inputs()} != set(self.manifest['inputShapes']):
            raise ModelNotApproved('Runtime inputs differ from the reviewed contract')

    def predict(self, feeds):
        import numpy as np
        if set(feeds) != set(self.manifest['inputShapes']):
            raise ModelNotApproved('Input names do not match the reviewed contract')
        prepared = {}
        for name, shape in self.manifest['inputShapes'].items():
            values = np.asarray(feeds[name], dtype=np.float32)
            if list(values.shape) != shape or not np.isfinite(values).all():
                raise ModelNotApproved('Invalid model input')
            prepared[name] = values
        result = self.session.run(None, prepared)
        scores = np.asarray(result[0]).reshape(-1)
        if len(scores) != len(self.manifest['labels']) or not np.isfinite(scores).all() or np.any(scores < 0) or np.any(scores > 1):
            raise ModelNotApproved('Invalid calibrated probability output')
        return dict(zip(self.manifest['labels'], scores.tolist()))
