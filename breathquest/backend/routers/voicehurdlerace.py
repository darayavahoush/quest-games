"""
routers/voicehurdlerace.py — VoiceHurdleRace session endpoints.

Follows the same auth pattern as routers/chime.py: the kid's identity
comes from their bearer token via get_current_patient, never from a raw
patient_id in the request body. Therapist-facing endpoints require
get_current_therapist and are scoped to that therapist's own patients.
"""

from typing import Optional

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

router = APIRouter(prefix="/voicehurdlerace", tags=["voicehurdlerace"])


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
    return session


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
