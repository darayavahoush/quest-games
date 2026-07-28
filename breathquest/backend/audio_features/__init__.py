"""
Phoneme-specific audio feature extractors for Chime.

Each module exposes a single extract(audio_chunk, sample_rate) -> FeatureResult
function. See common.py for the shared FeatureResult contract.

Chime is a separate game from BreathQuest, with its own mechanics —
they share the site (auth, DB, deployment) but not level designs.

Level -> extractor -> mechanic:
  aa   -> vowel_loudness   -> Rocket Launch
  oo   -> vowel_quality    -> Submarine Dive
  ma   -> syllable_rhythm  -> Drum Island
  fa   -> frication        -> Wind Chime Garden
  ha   -> aspiration_burst -> Bubble Wrap Pop
  word -> word_level/asr_match.py -> Village Builder
"""

from .common import FeatureResult
from . import vowel_loudness, vowel_quality, syllable_rhythm, frication, aspiration_burst

EXTRACTORS = {
    "aa": vowel_loudness.extract,
    "oo": vowel_quality.extract,
    "ma": syllable_rhythm.extract,
    "fa": frication.extract,
    "ha": aspiration_burst.extract,
}

__all__ = ["FeatureResult", "EXTRACTORS", "vowel_loudness", "vowel_quality",
           "syllable_rhythm", "frication", "aspiration_burst"]
