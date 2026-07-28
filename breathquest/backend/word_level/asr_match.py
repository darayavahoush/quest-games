"""
word level — whole-word intelligibility, via ASR.

Now actually wired up: backend/main.py's /village-builder/score-word endpoint
calls score_word_attempt() directly, and frontend_prototype/village_builder.html
calls that endpoint for real. Currently fed by the browser's native
SpeechRecognition API (no backend STT needed to get something working), not
faster-whisper — swapping in faster-whisper server-side (matching VaakSiddhi)
is a natural upgrade once transcription quality/control matters more than
shipping quickly, but the interface here doesn't need to change either way.
"""

from dataclasses import dataclass
from difflib import SequenceMatcher


@dataclass
class WordMatchResult:
    transcript: str
    confidence: float          # ASR confidence, 0.0-1.0
    match_score: float         # similarity to target word, 0.0-1.0
    is_valid_attempt: bool


def score_word_attempt(transcript: str, target_word: str, asr_confidence: float) -> WordMatchResult:
    """
    Call this with faster-whisper's output once integrated:
        segments, info = whisper_model.transcribe(audio_path)
        transcript = segments[0].text
        asr_confidence = ... (derive from segment.avg_logprob or similar)
    """
    if not transcript.strip():
        return WordMatchResult(transcript="", confidence=0.0, match_score=0.0, is_valid_attempt=False)

    similarity = SequenceMatcher(None, transcript.strip().lower(), target_word.strip().lower()).ratio()
    return WordMatchResult(
        transcript=transcript,
        confidence=asr_confidence,
        match_score=similarity,
        is_valid_attempt=True,
    )
