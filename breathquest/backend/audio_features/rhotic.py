"""
r level — rhotic /r/ quality, via the F3-lowering marker.

Drives Chime's own "Lion's Roar" mechanic: a strong, held "rrr" builds up
the lion's roar (louder + longer echo); a weak or non-rhotic attempt lets
the roar fade back to a whisper.

American English /r/ is acoustically distinctive among consonants: it's
made by bunching or curling the tongue in a way that pulls the third
formant (F3) sharply down, often close enough to F2 that the two nearly
merge. This F3-F2 proximity ("F3 dip") is the standard clinical/acoustic
marker used to distinguish a genuine rhotic articulation from a vowel-like
glide or a substituted /w/ (a common developmental /r/ error), which does
not show the same F3 lowering.

Like the vowel extractors, this wants a stable ~200-500ms voiced window —
buffer frames before calling rather than calling per 50ms frame. Formant
targets below are typical-adult and, same caveat as vowel_quality.py/
vowel_quality_ee.py, need recalibration against real child speech before
this is trustworthy for scoring rather than prototyping.
"""

import numpy as np
import parselmouth
from .common import FeatureResult

# For a well-formed American /r/, F3 typically drops to within a few hundred
# Hz of F2 (sometimes below it). A wider F3-F2 gap signals a weaker/absent
# rhotic (e.g. a /w/-like substitution, which keeps F3 much higher).
TARGET_F3_MINUS_F2_HZ = 200.0
GAP_TOLERANCE_HZ = 600.0  # gap this wide or wider scores ~0 rhoticity

# Absolute F3 also needs to be depressed relative to a typical non-rhotic F3
# (~2700-3000Hz for adults) — the gap alone can't distinguish a genuinely
# low F3 from both F2 and F3 just being unusually high together.
TARGET_F3_HZ = 2000.0
F3_TOLERANCE_HZ = 700.0

MIN_VALID_DURATION_S = 0.12  # /r/ attempts are often shorter than sustained vowels


def extract(audio_chunk: np.ndarray, sample_rate: int = 16000) -> FeatureResult:
    duration_s = len(audio_chunk) / sample_rate
    if duration_s < MIN_VALID_DURATION_S:
        return FeatureResult(score=0.0, is_valid_attempt=False, raw_features={"duration_s": duration_s})

    sound = parselmouth.Sound(audio_chunk.astype(np.float64), sampling_frequency=sample_rate)
    formant = sound.to_formant_burg()

    # Sample across the middle 60% of the chunk (avoids onset/offset noise) —
    # for /r/ this also tends to land on the point of maximum tongue
    # constriction, where the F3 dip is most pronounced.
    start, end = duration_s * 0.2, duration_s * 0.8
    times = np.linspace(start, end, num=10)
    f2_vals, f3_vals = [], []
    for t in times:
        f2 = formant.get_value_at_time(2, t)
        f3 = formant.get_value_at_time(3, t)
        if f2 and f3 and not np.isnan(f2) and not np.isnan(f3):
            f2_vals.append(f2)
            f3_vals.append(f3)

    if not f3_vals:
        return FeatureResult(score=0.0, is_valid_attempt=False, raw_features={"duration_s": duration_s})

    mean_f2, mean_f3 = float(np.mean(f2_vals)), float(np.mean(f3_vals))
    gap = max(0.0, mean_f3 - mean_f2)
    gap_score = max(0.0, 1.0 - abs(gap - TARGET_F3_MINUS_F2_HZ) / GAP_TOLERANCE_HZ)

    f3_depression_score = max(0.0, 1.0 - abs(mean_f3 - TARGET_F3_HZ) / F3_TOLERANCE_HZ)

    quality_score = float((gap_score + f3_depression_score) / 2.0)
    duration_score = min(1.0, duration_s / 0.8)  # 0.8s held "rrr" = full score
    combined = float(quality_score * duration_score)

    return FeatureResult(
        score=combined,
        is_valid_attempt=True,
        raw_features={
            "f2": mean_f2, "f3": mean_f3, "f3_minus_f2": gap,
            "duration_s": duration_s, "quality_score": quality_score,
        },
    )
