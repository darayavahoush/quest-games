"""
routers/kid_progress.py — What the child themself can see about their own
progress. Deliberately minimal: no raw scores, no per-level breakdown, no
clinical language — just concrete, encouraging counts a kid can read
themself. Full session/level detail stays therapist/parent-only.
"""

from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_

from database import get_db
from models.models import Patient, GameSession
from models.voicehurdlerace_models import VoiceHurdleRaceSession
from vaakmirror.models import GameSession as VaakMirrorSession
from retraining import data_store as chime_data_store
from schemas.schemas import KidProgressOut
from core.deps import get_current_patient

router = APIRouter(prefix="/me", tags=["kid-progress"])

CHIME_DB_PATH = chime_data_store.DEFAULT_DB_PATH
LEVELS_PER_STAR_CAP = 6  # matches len(dashboard.LEVEL_NAMES) — max_possible_stars basis


@router.get("/progress", response_model=KidProgressOut)
async def get_my_progress(
    patient: Patient = Depends(get_current_patient),
    db: AsyncSession = Depends(get_db),
):
    stars_result = await db.execute(
        select(func.sum(GameSession.stars_earned)).where(
            GameSession.patient_id == patient.id, GameSession.completed == True
        )
    )
    total_stars = int(stars_result.scalar() or 0)

    week_ago = datetime.now(timezone.utc) - timedelta(days=7)

    bq_week = (await db.execute(
        select(func.count(GameSession.id)).where(
            and_(GameSession.patient_id == patient.id, GameSession.started_at >= week_ago)
        )
    )).scalar() or 0
    vhr_week = (await db.execute(
        select(func.count(VoiceHurdleRaceSession.id)).where(
            and_(VoiceHurdleRaceSession.patient_id == patient.id, VoiceHurdleRaceSession.created_at >= week_ago)
        )
    )).scalar() or 0
    vm_week = (await db.execute(
        select(func.count(VaakMirrorSession.id)).where(
            and_(VaakMirrorSession.patient_id == patient.id, VaakMirrorSession.started_at >= week_ago)
        )
    )).scalar() or 0
    chime_week = chime_data_store.count_events_since([patient.id], week_ago.isoformat(), db_path=CHIME_DB_PATH)

    games_played_this_week = bq_week + vhr_week + vm_week + chime_week

    # Simple streak: count consecutive days (including today) with at least
    # one session/event, walking backward from today. Cheap enough at kid
    # data volumes to compute on read rather than maintaining a counter.
    last_played = chime_data_store.last_event_time(child_id=patient.id, db_path=CHIME_DB_PATH)
    bq_dates_result = await db.execute(
        select(func.date(GameSession.started_at)).where(GameSession.patient_id == patient.id).distinct()
    )
    played_dates = {row[0] for row in bq_dates_result.all()}

    streak = 0
    cursor = datetime.now(timezone.utc).date()
    while cursor.isoformat() in {str(d) for d in played_dates}:
        streak += 1
        cursor = cursor - timedelta(days=1)

    return KidProgressOut(
        first_name=patient.first_name,
        avatar=patient.avatar,
        total_stars=total_stars,
        max_possible_stars=LEVELS_PER_STAR_CAP * 3,
        games_played_this_week=games_played_this_week,
        current_streak_days=streak,
    )
