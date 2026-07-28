"""
aa level — vowel loudness / voice projection.

Drives Chime's own "Rocket Launch" mechanic: sustained loud "aaa"
powers a rocket upward; quiet or inconsistent volume lets it fall back down.
This is a Chime-specific level, distinct from BreathQuest's levels —
the two are separate games sharing only the underlying site (auth, DB,
deployment), not mechanics.
"""

import numpy as np
from .common import FeatureResult

# Below this, treat the frame as silence/noise floor rather than an attempt.
# Tune per-deployment after calibrating against real mic input (BreathQuest
# already does a 1s noise-floor calibration on startup — reuse that value here
# instead of a hardcoded constant once integrated).
NOISE_FLOOR_RMS = 0.01

# RMS value that should map to a full-strength (score = 1.0) attempt.
# This is a starting point — needs calibration against real child voices,
# which tend to have a narrower dynamic range than adult calibration data.
MAX_EXPECTED_RMS = 0.3


def extract(audio_chunk: np.ndarray, sample_rate: int = 16000) -> FeatureResult:
    """
    audio_chunk: mono float32 samples in [-1, 1], one game-loop frame's worth
                 (BreathQuest uses ~50-100ms frames for responsive feedback).
    """
    rms = float(np.sqrt(np.mean(audio_chunk.astype(np.float64) ** 2)))

    if rms < NOISE_FLOOR_RMS:
        return FeatureResult(score=0.0, is_valid_attempt=False, raw_features={"rms": rms})

    score = min(1.0, (rms - NOISE_FLOOR_RMS) / (MAX_EXPECTED_RMS - NOISE_FLOOR_RMS))
    return FeatureResult(score=score, is_valid_attempt=True, raw_features={"rms": rms})
