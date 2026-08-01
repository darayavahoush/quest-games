"""
ee level — vowel duration + tongue-height/frontness, via formant tracking.

Drives Chime's own "Kite Flyer" mechanic: a held, bright "eee" lifts a kite
higher into the sky; losing the vowel quality or duration lets it drift
back down.

Same formant-tracking approach as vowel_quality.py (oo/Submarine Dive), just
aimed at the opposite corner of the vowel space — "ee" (as in "see") is
high and front, so it wants a *low* F1 (tongue high) and a *high* F2
(tongue fronted), the mirror image of "oo"'s low-F1/low-F2 target.

Needs the same ~200-500ms stable-voicing window as vowel_quality.py — buffer
frames before calling this rather than calling it per 50ms frame.
"""

import numpy as np
import parselmouth
from .common import FeatureResult

# Typical adult "ee" (as in "see") formant targets in Hz. As with oo, kids'
# formants run higher due to shorter vocal tracts — recalibrate against real
# child speech samples before trusting this for scoring, not just prototyping.
TARGET_F1 = 270.0
TARGET_F2 = 2300.0
FORMANT_TOLERANCE_HZ = 350.0  # wider than oo's tolerance — F2 for "ee" varies more across speakers

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

    duration_score = min(1.0, duration_s / 1.5)  # 1.5s sustained "ee" = full score
    combined = float(quality_score * duration_score)

    return FeatureResult(
        score=combined,
        is_valid_attempt=True,
        raw_features={"f1": mean_f1, "f2": mean_f2, "duration_s": duration_s, "quality_score": quality_score},
    )
