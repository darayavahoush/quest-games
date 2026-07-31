"""
word level — whole-word intelligibility, via ASR.

backend/routers/chime.py's /village-builder/score-word endpoint calls
score_word_attempt() directly; the frontend's Village Builder game posts to
that endpoint. Audio is transcribed server-side via faster-whisper
(same router's /village-builder/transcribe), matching VaakSiddhi's setup.
"""

from dataclasses import dataclass
from difflib import SequenceMatcher

MIN_CONFIDENCE_FOR_VALID = 0.4  # below this, ASR itself wasn't sure enough to trust
LENGTH_MISMATCH_PENALTY_SCALE = 0.5  # how strongly length gaps pull score down


@dataclass
class WordMatchResult:
    transcript: str
    confidence: float          # ASR confidence, 0.0-1.0
    match_score: float         # similarity to target word, 0.0-1.0
    is_valid_attempt: bool


def score_word_attempt(transcript: str, target_word: str, asr_confidence: float) -> WordMatchResult:
    """
    Call this with faster-whisper's output:
        segments, info = whisper_model.transcribe(audio_path)
        transcript = segments[0].text
        asr_confidence = ... (derived from segment.avg_logprob in routers/chime.py)
    """
    clean_transcript = transcript.strip().lower()
    clean_target = target_word.strip().lower()

    if not clean_transcript:
        return WordMatchResult(transcript="", confidence=0.0, match_score=0.0, is_valid_attempt=False)

    similarity = SequenceMatcher(None, clean_transcript, clean_target).ratio()

    # Penalize length mismatches beyond what SequenceMatcher's ratio() already
    # captures — short, dissimilar words (e.g. "cat" vs "bat") otherwise still
    # score deceptively high just from shared letters.
    len_diff = abs(len(clean_transcript) - len(clean_target))
    max_len = max(len(clean_transcript), len(clean_target), 1)
    length_penalty = 1.0 - min(1.0, (len_diff / max_len) * LENGTH_MISMATCH_PENALTY_SCALE)
    match_score = similarity * length_penalty

    # A low-confidence transcription that happens to string-match the target
    # shouldn't count as a genuine valid attempt.
    is_valid_attempt = asr_confidence >= MIN_CONFIDENCE_FOR_VALID

    return WordMatchResult(
        transcript=transcript,
        confidence=asr_confidence,
        match_score=match_score,
        is_valid_attempt=is_valid_attempt,
    )
