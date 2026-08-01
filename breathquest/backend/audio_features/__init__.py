"""
Phoneme-specific audio feature extractors for Chime.

Each module exposes a single extract(audio_chunk, sample_rate) -> FeatureResult
function. See common.py for the shared FeatureResult contract.

Chime is a separate game from BreathQuest, with its own mechanics —
they share the site (auth, DB, deployment) but not level designs.

Level -> extractor -> mechanic:
  aa   -> vowel_loudness    -> Rocket Launch
  oo   -> vowel_quality     -> Submarine Dive
  ma   -> syllable_rhythm   -> Drum Island (shell demo) / Firefly Jar (live)
  fa   -> frication         -> Wind Chime Garden
  ha   -> aspiration_burst  -> Bubble Wrap Pop
  ee   -> vowel_quality_ee  -> Kite Flyer
  r    -> rhotic            -> Lion's Roar
  word -> word_level/asr_match.py -> Village Builder
"""

from .common import FeatureResult
from . import (
    vowel_loudness, vowel_quality, syllable_rhythm, frication, aspiration_burst,
    vowel_quality_ee, rhotic,
)

EXTRACTORS = {
    "aa": vowel_loudness.extract,
    "oo": vowel_quality.extract,
    "ma": syllable_rhythm.extract,
    "fa": frication.extract,
    "ha": aspiration_burst.extract,
    "ee": vowel_quality_ee.extract,
    "r": rhotic.extract,
}

__all__ = ["FeatureResult", "EXTRACTORS", "vowel_loudness", "vowel_quality",
           "syllable_rhythm", "frication", "aspiration_burst",
           "vowel_quality_ee", "rhotic"]
