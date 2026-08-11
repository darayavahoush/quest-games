"""
routers/chime.py — Village Builder / breath-difficulty agent endpoints,
merged in from the standalone Chime backend. Every endpoint that used to
take a raw child_id: str now authenticates via get_current_patient and
uses patient.id internally instead, matching sessions.py's pattern.
"""

import asyncio
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Optional

import numpy as np
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from database import get_db
from models.models import Patient, Therapist
from core.deps import get_current_patient, get_current_therapist
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from retraining import data_store
from retraining.scheduler import run_retrain_if_due
from agent.diagnostic_client import get_diagnostic_context
from word_level.asr_match import score_word_attempt
from audio_features import EXTRACTORS

router = APIRouter(prefix="/chime", tags=["chime"])

# Module-level so tests can override it without needing a real DB file.
DB_PATH = data_store.DEFAULT_DB_PATH


# ============================================================
# Schemas
# ============================================================
class EventIn(BaseModel):
    level_id: str
    attempt_number: int
    score: float
    is_valid_attempt: bool
    threshold_at_time: Optional[float] = None
    action: Optional[str] = None
    quit_flag: bool = False
    raw_features: dict = {}


class EventOut(BaseModel):
    id: int
    child_id: str
    timestamp: str
    level_id: str
    attempt_number: int
    score: float
    is_valid_attempt: bool
    threshold_at_time: Optional[float]
    action: Optional[str]
    quit_flag: bool
    policy_used: Optional[str] = None
    downgrade_reason: Optional[str] = None


class DifficultyDecision(BaseModel):
    action: Literal["raise", "lower", "hold"]
    message: str
    n_events_considered: int


class WordScoreIn(BaseModel):
    transcript: str
    target_word: str
    asr_confidence: float = 1.0


class WordScoreOut(BaseModel):
    transcript: str
    confidence: float
    match_score: float
    is_valid_attempt: bool


class TranscribeOut(BaseModel):
    transcript: str
    confidence: float


class PhonemeScoreOut(BaseModel):
    score: float
    is_valid_attempt: bool
    raw_features: dict


class AgentDecisionOut(BaseModel):
    policy: str
    requested_policy: Optional[str] = None
    action: Literal["raise", "lower", "hold"]
    n_events_considered: int
    message: str
    downgrade_reason: Optional[str] = None


# ============================================================
# Session events
# ============================================================
@router.post("/events", response_model=EventOut)
def log_event(event: EventIn, background_tasks: BackgroundTasks, patient: Patient = Depends(get_current_patient)):
    # patient.id is BreathQuest's own primary key -- get_diagnostic_context
    # needs Assessment's UUID instead, which is only set for patients
    # linked via kid-pin-setup. Unlinked patients (created directly in
    # BreathQuest via AddPatientModal) have no Assessment record to look
    # up at all -- skip the call rather than pass patient.id and silently
    # 404 against an Assessment patient that doesn't correspond to them.
    if patient.assessment_patient_id:
        severity_numeric, targeted_quests = get_diagnostic_context(patient.assessment_patient_id)
    else:
        severity_numeric, targeted_quests = 0.0, frozenset()
    is_targeted_sound = event.level_id in targeted_quests

    # See routers/breath_agent.py's log_breath_event for why this is read
    # here -- same shared AgentService, same reasoning.
    last_decision = _agent_service.get_last_decision(patient.id, event.level_id)
    policy_used = last_decision["policy"] if last_decision else None
    downgrade_reason = last_decision["downgrade_reason"] if last_decision else None
    recommended_action = last_decision["action"] if last_decision else None
    recommendation_message = last_decision["message"] if last_decision else None

    data_store.add_event(
        child_id=patient.id,
        level_id=event.level_id,
        attempt_number=event.attempt_number,
        score=event.score,
        is_valid_attempt=event.is_valid_attempt,
        threshold_at_time=event.threshold_at_time,
        action=event.action,
        quit_flag=event.quit_flag,
        raw_features=event.raw_features,
        severity_numeric=severity_numeric,
        is_targeted_sound=is_targeted_sound,
        policy_used=policy_used,
        downgrade_reason=downgrade_reason,
        recommended_action=recommended_action,
        recommendation_message=recommendation_message,
        db_path=DB_PATH,
    )

    _maybe_update_tabular_q_from_new_event(patient.id, event.level_id, event.quit_flag)
    background_tasks.add_task(run_retrain_if_due, DB_PATH)

    events = data_store.get_events(child_id=patient.id, db_path=DB_PATH)
    latest = events[-1]
    return EventOut(**latest)


@router.get("/events", response_model=list[EventOut])
def get_events(level_id: Optional[str] = None, patient: Patient = Depends(get_current_patient)):
    events = data_store.get_events(child_id=patient.id, db_path=DB_PATH)
    if level_id:
        events = [e for e in events if e["level_id"] == level_id]
    return [EventOut(**e) for e in events]


@router.get("/patients/{patient_id}/events", response_model=list[EventOut])
async def get_patient_events(
    patient_id: str,
    level_id: Optional[str] = None,
    therapist: Therapist = Depends(get_current_therapist),
    db: AsyncSession = Depends(get_db),
):
    """Therapist-facing equivalent of get_events above — didn't exist
    before this, chime.py only had kid-token-gated endpoints. Ownership
    check matches the pattern in routers/voicehurdlerace.py."""
    patient_result = await db.execute(
        select(Patient).where(Patient.id == patient_id, Patient.therapist_id == therapist.id)
    )
    if not patient_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Patient not found")

    # data_store.get_events is synchronous SQLite I/O — thread it off since
    # this route is `async def` (transcribe_audio/score_phoneme above
    # already establish this pattern in this same file; this one just
    # hadn't been brought in line with it).
    events = await asyncio.to_thread(data_store.get_events, child_id=patient_id, db_path=DB_PATH)
    if level_id:
        events = [e for e in events if e["level_id"] == level_id]
    return [EventOut(**e) for e in events]


# ============================================================
# Difficulty decisions
# ============================================================
RECENT_WINDOW = 10


@router.get("/difficulty/{level_id}", response_model=DifficultyDecision)
def get_difficulty(level_id: str, patient: Patient = Depends(get_current_patient)):
    # Delegates to agent.service.AgentService — the same non-learning fallback
    # heuristic BreathQuest's own levels now use too (routers/breath_agent.py).
    return DifficultyDecision(**_agent_service.simple_difficulty_heuristic(patient.id, level_id))


# ============================================================
# Village Builder word matching (stateless — patient dep kept for auth only)
# ============================================================
@router.post("/village-builder/score-word", response_model=WordScoreOut)
def score_word(payload: WordScoreIn, patient: Patient = Depends(get_current_patient)):
    result = score_word_attempt(payload.transcript, payload.target_word, payload.asr_confidence)
    return WordScoreOut(
        transcript=result.transcript,
        confidence=result.confidence,
        match_score=result.match_score,
        is_valid_attempt=result.is_valid_attempt,
    )


# ============================================================
# Village Builder transcription
# ============================================================
_whisper_model = None
WHISPER_MODEL_SIZE = os.environ.get("CHIME_WHISPER_MODEL", "base")


def get_whisper_model():
    global _whisper_model
    if _whisper_model is None:
        from faster_whisper import WhisperModel
        _whisper_model = WhisperModel(WHISPER_MODEL_SIZE, device="cpu", compute_type="int8")
    return _whisper_model


@router.post("/village-builder/transcribe", response_model=TranscribeOut)
async def transcribe_audio(
    audio: UploadFile = File(...),
    patient: Patient = Depends(get_current_patient),
):
    audio_bytes = await audio.read()
    if not audio_bytes:
        return TranscribeOut(transcript="", confidence=0.0)

    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        def _run_transcription():
            model = get_whisper_model()
            segments, _info = model.transcribe(
                tmp_path, language="en", beam_size=1, vad_filter=True,
            )
            return list(segments)

        segments = await asyncio.to_thread(_run_transcription)
        transcript = " ".join(s.text for s in segments).strip()
        if segments:
            avg_logprob = sum(s.avg_logprob for s in segments) / len(segments)
            confidence = max(0.0, min(1.0, 1.0 + avg_logprob / 2.0))
        else:
            confidence = 0.0
        return TranscribeOut(transcript=transcript, confidence=confidence)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {exc}") from exc
    finally:
        Path(tmp_path).unlink(missing_ok=True)


# ============================================================
# Phoneme mini-games (Rocket Launch, Submarine Dive, Drum Island,
# Wind Chime Garden, Bubble Wrap Pop) — audio_features.EXTRACTORS
# keyed by level_id, same upload-then-process shape as transcription.
# ============================================================
def _decode_audio_file(tmp_path: str, target_sr: int = 16000):
    import librosa
    audio_array, _sr = librosa.load(tmp_path, sr=target_sr, mono=True)
    return audio_array


@router.post("/phoneme/score/{level_id}", response_model=PhonemeScoreOut)
async def score_phoneme(
    level_id: str,
    audio: UploadFile = File(...),
    patient: Patient = Depends(get_current_patient),
):
    if level_id not in EXTRACTORS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown phoneme level: {level_id}. Expected one of {list(EXTRACTORS.keys())}",
        )

    audio_bytes = await audio.read()
    if not audio_bytes:
        return PhonemeScoreOut(score=0.0, is_valid_attempt=False, raw_features={})

    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        audio_array = await asyncio.to_thread(_decode_audio_file, tmp_path)
        result = EXTRACTORS[level_id](audio_array, 16000)
        return PhonemeScoreOut(
            score=result.score,
            is_valid_attempt=result.is_valid_attempt,
            raw_features=result.raw_features,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Phoneme scoring failed: {exc}") from exc
    finally:
        Path(tmp_path).unlink(missing_ok=True)


# ============================================================
# Trained-agent decisions
#
# Delegates to agent.service.AgentService (shared with routers/breath_agent.py
# — see that module's docstring for why BreathQuest's own levels reuse this
# same instance rather than a second copy of the ladder).
# ============================================================
from agent.service import AgentService

_agent_service = AgentService(db_path=DB_PATH, recent_window=RECENT_WINDOW)


def _maybe_update_tabular_q_from_new_event(child_id: str, level_id: str, quit_flag: bool):
    _agent_service.maybe_update_tabular_q_from_new_event(child_id, level_id, quit_flag)


@router.get("/agent/decide/{level_id}", response_model=AgentDecisionOut)
def agent_decide(
    level_id: str,
    policy: Literal["rule_based", "bandit", "tabular_q", "ppo", "recurrent_ppo"] = "tabular_q",
    patient: Patient = Depends(get_current_patient),
):
    try:
        result = _agent_service.decide(patient.id, level_id, policy)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=f"Model not found: {exc}") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return AgentDecisionOut(**result)
