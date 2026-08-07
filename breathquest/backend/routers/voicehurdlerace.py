"""
routers/voicehurdlerace.py — VoiceHurdleRace session endpoints.

Follows the same auth pattern as routers/chime.py: the kid's identity
comes from their bearer token via get_current_patient, never from a raw
patient_id in the request body. Therapist-facing endpoints require
get_current_therapist and are scoped to that therapist's own patients.
"""

from typing import Optional
import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from database import get_db
from models.models import Patient, Therapist
from models.voicehurdlerace_models import VoiceHurdleRaceSession
from schemas.voicehurdlerace_schemas import (
    VoiceHurdleRaceSessionCreate,
    VoiceHurdleRaceSessionOut,
    LeaderboardEntryOut,
)
from core.deps import get_current_patient, get_current_therapist
from agent.service import AgentService
from retraining import data_store

router = APIRouter(prefix="/voicehurdlerace", tags=["voicehurdlerace"])
logger = logging.getLogger(__name__)

# The last of the four games to get the shared adaptive-difficulty agent —
# see agent/service.py's docstring and vaakmirror/agent_bridge.py for why
# this points at the same DB Chime/BreathQuest/VaakMirror all use rather
# than a separate store: one per-child Q-table learns from every game.
_agent_service = AgentService(db_path=data_store.DEFAULT_DB_PATH, recent_window=10)


def _vhr_level_key(level_id: int) -> str:
    """VoiceHurdleRace's levels are ints (LEVELS[].id in the frontend), but
    AgentService/data_store's level_id namespace is shared across every
    game's string ids — prefix so e.g. level 1 here can't collide with
    Chime's or BreathQuest's own id scheme."""
    return f"vhr_{level_id}"


@router.post("/sessions", response_model=VoiceHurdleRaceSessionOut, status_code=201)
async def create_session(
    data: VoiceHurdleRaceSessionCreate,
    patient: Patient = Depends(get_current_patient),
    db: AsyncSession = Depends(get_db),
):
    session = VoiceHurdleRaceSession(
        patient_id=patient.id,
        level_id=data.level_id,
        level_name=data.level_name,
        score=data.score,
        time_remaining=data.time_remaining,
        pitch_accuracy=data.pitch_accuracy,
        loudness_accuracy=data.loudness_accuracy,
        stars=data.stars,
    )
    db.add(session)
    await db.flush()

    # _log_race_to_agent is synchronous SQLite/file I/O (data_store +
    # AgentService's online Q-table update) — threaded off since this
    # route is `async def` (same class of bug fixed across dashboard.py/
    # kid_progress.py/parent.py/chime.py/vaakmirror's sessions.py in this
    # pass — every direct call here blocks the whole app's event loop for
    # every other concurrent request while the write happens).
    await asyncio.to_thread(_log_race_to_agent, patient.id, data)

    return session


def _log_race_to_agent(patient_id: str, data: VoiceHurdleRaceSessionCreate):
    """VoiceHurdleRace logs one row per *completed* race, not a start/end
    pair — there's no separate abandonment case to log here the way the
    other three games have (see weekly_summary.py's docstring on this same
    point). Never lets agent bookkeeping break the actual game flow."""
    try:
        level_key = _vhr_level_key(data.level_id)
        existing = data_store.get_events(child_id=patient_id, db_path=data_store.DEFAULT_DB_PATH)
        attempt_number = len([e for e in existing if e["level_id"] == level_key]) + 1

        data_store.add_event(
            child_id=patient_id,
            level_id=level_key,
            attempt_number=attempt_number,
            score=data.stars / 3,
            is_valid_attempt=True,
            threshold_at_time=data.difficulty,
            quit_flag=False,
            db_path=data_store.DEFAULT_DB_PATH,
        )
        _agent_service.maybe_update_tabular_q_from_new_event(patient_id, level_key, False)
    except Exception:
        logger.exception("Failed to log VoiceHurdleRace session to the adaptive-difficulty agent")


@router.get("/agent/decide/{level_id}")
async def get_agent_decision(
    level_id: int,
    policy: str = "tabular_q",
    patient: Patient = Depends(get_current_patient),
):
    """Same shape as /chime/agent/decide and /breath/agent/decide — the
    frontend translates the raise/hold/lower action into a scaled
    pitchTolerance/loudnessTolerance before starting the next race (see
    voiceHurdleRace/difficulty.ts)."""
    try:
        # AgentService.decide() does synchronous SQLite/file I/O internally
        # (build_obs/_downgrade_reason both read data_store and check the
        # child's Q-table file) — threaded off since this route is `async
        # def`, same fix as the write path in create_session above.
        result = await asyncio.to_thread(_agent_service.decide, patient.id, _vhr_level_key(level_id), policy)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=f"Model not found: {exc}") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return result


@router.get("/sessions", response_model=list[VoiceHurdleRaceSessionOut])
async def get_my_sessions(
    patient: Patient = Depends(get_current_patient),
    db: AsyncSession = Depends(get_db),
):
    """The logged-in kid's own VoiceHurdleRace history."""
    result = await db.execute(
        select(VoiceHurdleRaceSession)
        .where(VoiceHurdleRaceSession.patient_id == patient.id)
        .order_by(desc(VoiceHurdleRaceSession.created_at))
    )
    return result.scalars().all()


@router.get("/patients/{patient_id}/sessions", response_model=list[VoiceHurdleRaceSessionOut])
async def get_patient_sessions(
    patient_id: str,
    therapist: Therapist = Depends(get_current_therapist),
    db: AsyncSession = Depends(get_db),
):
    """A therapist viewing one of their own patients' history — 404s (not
    403) if the patient isn't theirs, so this doesn't leak which patient
    IDs exist to a therapist probing at random."""
    patient_result = await db.execute(
        select(Patient).where(Patient.id == patient_id, Patient.therapist_id == therapist.id)
    )
    if not patient_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Patient not found")

    result = await db.execute(
        select(VoiceHurdleRaceSession)
        .where(VoiceHurdleRaceSession.patient_id == patient_id)
        .order_by(desc(VoiceHurdleRaceSession.created_at))
    )
    return result.scalars().all()


@router.get("/leaderboard", response_model=list[LeaderboardEntryOut])
async def get_leaderboard(
    therapist: Therapist = Depends(get_current_therapist),
    db: AsyncSession = Depends(get_db),
):
    """Top 10 sessions among this therapist's own patients only — a
    therapist should never see another clinic's kids on a leaderboard."""
    result = await db.execute(
        select(VoiceHurdleRaceSession, Patient)
        .join(Patient, Patient.id == VoiceHurdleRaceSession.patient_id)
        .where(Patient.therapist_id == therapist.id)
        .order_by(desc(VoiceHurdleRaceSession.stars), desc(VoiceHurdleRaceSession.pitch_accuracy))
        .limit(10)
    )
    rows = result.all()
    return [
        LeaderboardEntryOut(
            session_id=session.id,
            patient_name=patient.first_name,
            level_name=session.level_name,
            stars=session.stars,
            created_at=session.created_at,
        )
        for session, patient in rows
    ]
