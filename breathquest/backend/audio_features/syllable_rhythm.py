"""
ma level — syllable repetition / rhythm (diadochokinetic rate).

Drives Chime's own "Drum Island" mechanic: each clear "ma" hits a
drum in sync with a target beat, scored on timing accuracy rather than just
presence.

Call this on a rolling buffer (~2-3s) rather than a single short frame —
onset detection needs enough audio to find repeated events.
"""

import numpy as np
import librosa
from .common import FeatureResult

TARGET_ONSETS_PER_SEC = 2.5  # typical child DDK rate target, needs calibration
TIMING_TOLERANCE_S = 0.15    # how close an onset needs to be to the target beat


def extract(audio_chunk: np.ndarray, sample_rate: int = 16000) -> FeatureResult:
    duration_s = len(audio_chunk) / sample_rate
    if duration_s < 1.0:
        return FeatureResult(score=0.0, is_valid_attempt=False, raw_features={"duration_s": duration_s})

    onset_frames = librosa.onset.onset_detect(
        y=audio_chunk.astype(np.float32), sr=sample_rate, units="time", backtrack=False
    )

    if len(onset_frames) < 2:
        return FeatureResult(score=0.0, is_valid_attempt=len(onset_frames) > 0,
                              raw_features={"onset_times": onset_frames.tolist(), "num_onsets": len(onset_frames)})

    intervals = np.diff(onset_frames)
    target_interval = 1.0 / TARGET_ONSETS_PER_SEC
    interval_errors = np.abs(intervals - target_interval)

    # Score each interval: 1.0 if within tolerance, decaying linearly beyond it
    interval_scores = np.clip(1.0 - (interval_errors / TIMING_TOLERANCE_S), 0.0, 1.0)
    rhythm_score = float(np.mean(interval_scores))

    return FeatureResult(
        score=rhythm_score,
        is_valid_attempt=True,
        raw_features={
            "num_onsets": len(onset_frames),
            "mean_interval_s": float(np.mean(intervals)),
            "onsets_per_sec": len(onset_frames) / duration_s,
        },
    )
