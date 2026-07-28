"""
oo level — vowel duration + lip rounding, via formant tracking.

Drives Chime's own "Submarine Dive" mechanic: a held, rounded "oo"
makes a submarine dive deeper; losing rounding or duration lets it float
back up.

Needs a slightly larger audio window than the other extractors (formant
tracking wants ~200-500ms of stable voicing to be reliable) — buffer frames
before calling this rather than calling it per 50ms frame like the others.
"""

import numpy as np
import parselmouth
from .common import FeatureResult

# Typical adult "oo" (as in "boot") formant targets in Hz. Children's formants
# run higher due to shorter vocal tracts — these need recalibration against
# real child speech samples before this is trustworthy for scoring, not just
# for the prototype.
TARGET_F1 = 300.0
TARGET_F2 = 870.0
FORMANT_TOLERANCE_HZ = 250.0  # how far off-target still counts as "rounding toward oo"

MIN_VALID_DURATION_S = 0.15  # shorter than this, treat as not a real attempt


def extract(audio_chunk: np.ndarray, sample_rate: int = 16000) -> FeatureResult:
    duration_s = len(audio_chunk) / sample_rate
    if duration_s < MIN_VALID_DURATION_S:
        return FeatureResult(score=0.0, is_valid_attempt=False, raw_features={"duration_s": duration_s})

    sound = parselmouth.Sound(audio_chunk.astype(np.float64), sampling_frequency=sample_rate)
    formant = sound.to_formant_burg()

    # Sample formants across the middle 60% of the chunk (avoids onset/offset noise)
    start, end = duration_s * 0.2, duration_s * 0.8
    times = np.linspace(start, end, num=10)
    f1_vals, f2_vals = [], []
    for t in times:
        f1 = formant.get_value_at_time(1, t)
        f2 = formant.get_value_at_time(2, t)
        if f1 and f2 and not np.isnan(f1) and not np.isnan(f2):
            f1_vals.append(f1)
            f2_vals.append(f2)

    if not f1_vals:
        return FeatureResult(score=0.0, is_valid_attempt=False, raw_features={"duration_s": duration_s})

    mean_f1, mean_f2 = float(np.mean(f1_vals)), float(np.mean(f2_vals))
    f1_dist = abs(mean_f1 - TARGET_F1)
    f2_dist = abs(mean_f2 - TARGET_F2)
    quality_score = max(0.0, 1.0 - (f1_dist + f2_dist) / (2 * FORMANT_TOLERANCE_HZ))

    duration_score = min(1.0, duration_s / 1.5)  # 1.5s sustained "oo" = full score
    combined = float(quality_score * duration_score)

    return FeatureResult(
        score=combined,
        is_valid_attempt=True,
        raw_features={"f1": mean_f1, "f2": mean_f2, "duration_s": duration_s, "quality_score": quality_score},
    )
