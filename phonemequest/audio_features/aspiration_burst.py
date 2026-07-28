"""
ha level — breath support / aspiration burst.

Drives Chime's own "Bubble Wrap Pop" mechanic: each clean "ha" burst pops
one bubble on a sheet of bubble wrap, with a satisfying pop animation. The
sheet fills up over the session. The burst must show an aspiration-like
onset (fast rise, breathy/noisy rather than tonal) rather than accepting
any sharp sound.

Unlike the other extractors, this one is event-based: call it once per
detected onset (from a lightweight energy-based onset trigger upstream),
passing just the burst window, not a continuous stream.
"""

import numpy as np
import librosa
from .common import FeatureResult

MIN_PEAK_RMS = 0.05        # burst must be reasonably loud to register at all
MAX_EXPECTED_PEAK_RMS = 0.4
MAX_BURST_DURATION_S = 0.5  # longer than this looks more like sustained "fa" than a "ha" burst


def extract(audio_chunk: np.ndarray, sample_rate: int = 16000) -> FeatureResult:
    duration_s = len(audio_chunk) / sample_rate
    rms_envelope = librosa.feature.rms(y=audio_chunk.astype(np.float32), frame_length=256, hop_length=64)[0]
    peak_rms = float(np.max(rms_envelope)) if len(rms_envelope) else 0.0

    if peak_rms < MIN_PEAK_RMS:
        return FeatureResult(score=0.0, is_valid_attempt=False,
                              raw_features={"peak_rms": peak_rms, "duration_s": duration_s})

    # Rise time: how quickly the burst reaches its peak (aspiration bursts rise fast)
    peak_idx = int(np.argmax(rms_envelope))
    rise_time_s = (peak_idx / len(rms_envelope)) * duration_s if len(rms_envelope) else duration_s

    duration_penalty = 1.0 if duration_s <= MAX_BURST_DURATION_S else max(
        0.0, 1.0 - (duration_s - MAX_BURST_DURATION_S)
    )
    magnitude_score = min(1.0, (peak_rms - MIN_PEAK_RMS) / (MAX_EXPECTED_PEAK_RMS - MIN_PEAK_RMS))
    score = float(magnitude_score * duration_penalty)

    return FeatureResult(
        score=score,
        is_valid_attempt=True,
        raw_features={"peak_rms": peak_rms, "duration_s": duration_s, "rise_time_s": rise_time_s},
    )
