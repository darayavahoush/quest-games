"""
routers/kid_progress.py — What the child themself can see about their own
progress. Deliberately minimal: no raw scores, no per-level breakdown, no
clinical language — just concrete, encouraging counts a kid can read
themself. Full session/level detail stays therapist/parent-only.
"""

from datetime import datetime, timezone, timedelta
import asyncio
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_

from database import get_db
from models.models import Patient, GameSession
from models.voicehurdlerace_models import VoiceHurdleRaceSession
from retraining import data_store as chime_data_store

# vaakmirror lives outside breathquest/backend (sibling package under the repo
# root) and isn't guaranteed to be on the Python path in every deploy config —
# Render's root directory here is breathquest/backend, so it structurally
# cannot import this in production. Degrade to a 0 count rather than crashing
# app startup; fix properly later by exposing this via an API/shared DB
# instead of a cross-package model import.
try:
    from vaakmirror.models import GameSession as VaakMirrorSession
except ImportError:
    VaakMirrorSession = None
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
    if VaakMirrorSession is not None:
        vm_week = (await db.execute(
            select(func.count(VaakMirrorSession.id)).where(
                and_(VaakMirrorSession.patient_id == patient.id, VaakMirrorSession.started_at >= week_ago)
            )
        )).scalar() or 0
    else:
        vm_week = 0
    # chime_data_store.* is synchronous SQLite I/O — thread it off since
    # this route is `async def` (same class of bug fixed across
    # dashboard.py/parent.py/chime.py's get_patient_events in this pass:
    # a direct call here would block the whole app's event loop for
    # every other concurrent request while this query runs).
    chime_week = await asyncio.to_thread(
        chime_data_store.count_events_since, [patient.id], week_ago.isoformat(), db_path=CHIME_DB_PATH,
    )

    games_played_this_week = bq_week + vhr_week + vm_week + chime_week

    # Simple streak: count consecutive days (including today) with at least
    # one session/event, walking backward from today. Cheap enough at kid
    # data volumes to compute on read rather than maintaining a counter.
    last_played = await asyncio.to_thread(chime_data_store.last_event_time, child_id=patient.id, db_path=CHIME_DB_PATH)
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
