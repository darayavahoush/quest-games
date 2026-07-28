"""
fa level — sustained frication / airflow control.

Drives Chime's own "Wind Chime Garden" mechanic: continuous "ffff" spins a
garden of wind chimes; each full spin rings a note, building a little tune
the longer you hold it. Stopping lets the chimes slow and go quiet. The
score requires an actual fricative noise signature (high spectral centroid,
broadband high-frequency energy) rather than just any amplitude, so a
generic exhale doesn't score the same as an actual sustained "f".
"""

import numpy as np
import librosa
from .common import FeatureResult

NOISE_FLOOR_RMS = 0.01
MIN_CENTROID_HZ = 2500.0   # fricatives concentrate energy above this range
MAX_EXPECTED_CENTROID_HZ = 6000.0


def extract(audio_chunk: np.ndarray, sample_rate: int = 16000) -> FeatureResult:
    rms = float(np.sqrt(np.mean(audio_chunk.astype(np.float64) ** 2)))
    if rms < NOISE_FLOOR_RMS:
        return FeatureResult(score=0.0, is_valid_attempt=False, raw_features={"rms": rms})

    centroid = librosa.feature.spectral_centroid(y=audio_chunk.astype(np.float32), sr=sample_rate)
    mean_centroid = float(np.mean(centroid))

    if mean_centroid < MIN_CENTROID_HZ:
        # Sound is present but not fricative-shaped (e.g. plain breath/hum) —
        # still a "valid attempt" for engagement purposes, just scores low.
        return FeatureResult(score=0.05, is_valid_attempt=True,
                              raw_features={"rms": rms, "spectral_centroid_hz": mean_centroid})

    score = min(1.0, (mean_centroid - MIN_CENTROID_HZ) / (MAX_EXPECTED_CENTROID_HZ - MIN_CENTROID_HZ))
    return FeatureResult(score=score, is_valid_attempt=True,
                          raw_features={"rms": rms, "spectral_centroid_hz": mean_centroid})
