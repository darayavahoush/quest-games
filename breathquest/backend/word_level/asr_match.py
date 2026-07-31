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


@dataclass
class WordMatchResult:
    transcript: str
    confidence: float          # ASR confidence, 0.0-1.0
    match_score: float         # similarity to target word, 0.0-1.0
    is_valid_attempt: bool


def _best_token_similarity(transcript: str, target_word: str) -> float:
    """Compares the target word against each word in the transcript
    individually and takes the best match, rather than the whole transcript
    at once. A child saying "the dog" for target word "dog" should score
    the same as saying "dog" alone — comparing the full string (even with a
    length-mismatch penalty layered on) still punishes completely normal,
    grammatically fuller speech just for being longer than a bare target
    word."""
    target = target_word.strip().lower()
    tokens = transcript.strip().lower().split()
    if not tokens:
        return 0.0
    return max(SequenceMatcher(None, tok, target).ratio() for tok in tokens)


def score_word_attempt(transcript: str, target_word: str, asr_confidence: float) -> WordMatchResult:
    """
    Call this with faster-whisper's output:
        segments, info = whisper_model.transcribe(audio_path)
        transcript = segments[0].text
        asr_confidence = ... (derived from segment.avg_logprob in routers/chime.py)
    """
    if not transcript.strip():
        return WordMatchResult(transcript="", confidence=0.0, match_score=0.0, is_valid_attempt=False)

    match_score = _best_token_similarity(transcript, target_word)

    # A low-confidence transcription — Whisper hallucinating a plausible
    # word from silence/noise, not just mis-hearing — shouldn't count as a
    # genuine valid attempt even if it happens to string-match the target.
    is_valid_attempt = asr_confidence >= MIN_CONFIDENCE_FOR_VALID

    return WordMatchResult(
        transcript=transcript,
        confidence=asr_confidence,
        match_score=match_score,
        is_valid_attempt=is_valid_attempt,
    )
