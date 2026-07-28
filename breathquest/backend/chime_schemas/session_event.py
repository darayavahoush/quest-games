"""
Session event schema contract.

Chime and BreathQuest are two separate games sharing one site — same
auth, same database, same deployment — not the same level mechanics. This is
the interface contract for that shared backend: BreathQuest already has

    patients -> sessions -> session_events

This model represents one row that Chime would write to that same
session_events table, alongside BreathQuest's own rows. To integrate: add a
`skill_type` column ('breath' | 'phoneme') to the existing table if not
already generic enough, and store `phoneme_payload` as a JSON/JSONB column —
do not create a second events table just because it's a different game.

Field names here deliberately avoid assuming BreathQuest's exact existing
column names (that repo wasn't available to check against directly) — when
merging, rename to match rather than keeping two conventions side by side.
"""

from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel


class PhonemePayload(BaseModel):
    target_phoneme: Literal["aa", "oo", "ma", "fa", "ha", "word"]
    target_word: Optional[str] = None          # only set when target_phoneme == "word"
    score: float                                # 0.0-1.0, from FeatureResult.score
    is_valid_attempt: bool
    raw_features: dict                          # FeatureResult.raw_features, phoneme-specific
    asr_transcript: Optional[str] = None        # only set for the word level
    asr_confidence: Optional[float] = None       # only set for the word level


class SessionEvent(BaseModel):
    """
    Mirrors what a row in BreathQuest's session_events table needs to become,
    with skill_type distinguishing this from an existing breath-only event.
    """
    session_id: str
    patient_id: str
    timestamp: datetime
    skill_type: Literal["breath", "phoneme"] = "phoneme"
    level_id: str                                # e.g. "aa_rocket_launch"
    attempt_number: int
    payload: PhonemePayload


class DifficultySettings(BaseModel):
    """
    What the DRL agent (ADA) outputs to configure the next attempt/level.
    Kept separate from SessionEvent since this is a decision, not a log entry.
    """
    session_id: str
    patient_id: str
    level_id: str
    threshold_adjustment: float          # delta applied to the level's scoring threshold
    action: Literal["raise_threshold", "lower_threshold", "hold",
                     "unlock_next_level", "offer_free_play", "trigger_hint"]
    agent_version: str                   # which policy produced this, for offline eval later
