"""
routers/parent.py — Parent-facing views. Deliberately separate from
dashboard.py (therapist-only) so clinical notes and the ICF PDF report can
never be reachable via a parent token, even by accident.
"""

from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models.models import Parent, Patient, GameSession
from schemas.schemas import ParentProgressOut, WeeklySummaryOut
from core.deps import get_current_parent
from services.weekly_summary import generate_weekly_summary
from retraining import data_store as chime_data_store
from routers.dashboard import LEVEL_NAMES, CHIME_DB_PATH
from schemas.schemas import LevelProgress

router = APIRouter(prefix="/parent", tags=["parent"])


async def _get_linked_patient(parent: Parent, db: AsyncSession) -> Patient:
    result = await db.execute(select(Patient).where(Patient.id == parent.patient_id))
    patient = result.scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Linked child account no longer exists")
    return patient


@router.get("/progress", response_model=ParentProgressOut)
async def get_parent_progress(
    parent: Parent = Depends(get_current_parent),
    db: AsyncSession = Depends(get_db),
):
    patient = await _get_linked_patient(parent, db)

    sessions_result = await db.execute(
        select(GameSession)
        .where(GameSession.patient_id == patient.id)
        .order_by(GameSession.started_at.desc())
    )
    sessions = sessions_result.scalars().all()
    completed = [s for s in sessions if s.completed]

    total_stars = sum(s.stars_earned or 0 for s in completed)
    max_possible = len(LEVEL_NAMES) * 3

    level_progress = []
    for level_id, level_name in LEVEL_NAMES.items():
        level_sessions = [s for s in completed if s.level_id == level_id]
        best_stars = max((s.stars_earned or 0 for s in level_sessions), default=0)
        avg_stars = (sum(s.stars_earned or 0 for s in level_sessions) / len(level_sessions)) if level_sessions else 0.0
        last_played = max((s.started_at for s in level_sessions), default=None)
        level_progress.append(LevelProgress(
            level_id=level_id,
            level_name=level_name,
            attempts=len([s for s in sessions if s.level_id == level_id]),
            best_stars=best_stars,
            avg_stars=round(avg_stars, 2),
            # Deliberately omitted for parents — avg_breath_strength is a
            # clinical/raw measurement, not something a parent needs to see
            # a number for; the trend is conveyed via weekly_summary's text.
            avg_breath_strength=None,
            last_played=last_played,
        ))

    trend = None
    if len(completed) >= 6:
        recent = [s.stars_earned or 0 for s in completed[:5]]
        older = [s.stars_earned or 0 for s in completed[5:10]]
        trend = round((sum(recent) / len(recent)) - (sum(older) / len(older)), 2)

    now = datetime.now(timezone.utc)
    this_monday = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    weekly_data = await generate_weekly_summary(db, patient, this_monday, chime_data_store.DEFAULT_DB_PATH)

    return ParentProgressOut(
        child_first_name=patient.first_name,
        avatar=patient.avatar,
        total_sessions=len(sessions),
        total_stars=total_stars,
        max_possible_stars=max_possible,
        completion_rate=round(len(completed) / len(sessions), 2) if sessions else 0.0,
        improvement_trend=trend,
        level_progress=level_progress,
        weekly_summary=WeeklySummaryOut(**weekly_data),
    )
