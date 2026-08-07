"""
routers/parent.py — Parent-facing views. Deliberately separate from
dashboard.py (therapist-only) so clinical notes and the ICF PDF report can
never be reachable via a parent token, even by accident.
"""

from datetime import datetime, timezone, timedelta
import asyncio
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models.models import Parent, Patient, GameSession
from schemas.schemas import ParentProgressOut, WeeklySummaryOut, GuidedActivityOut, HomePracticeIdeaOut
from core.deps import get_current_parent
from services.weekly_summary import generate_weekly_summary
from services.home_practice_ideas import IDEAS, filter_ideas
from retraining import data_store as chime_data_store
from routers.dashboard import LEVEL_NAMES, CHIME_DB_PATH
from vaakmirror.models import GameSession as VaakMirrorSession, Attempt
from schemas.schemas import LevelProgress
from sqlalchemy import func

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


# Sound ids used in VaakMirror/Chime don't always match a home-practice-idea
# goal tag directly (e.g. "th-voiced" vs "th", or a CV syllable like "ta"
# instead of the base sound "t") — this normalizes the common cases down to
# the tags home_practice_ideas.py actually uses.
def _normalize_goal_tag(sound_id: str) -> str:
    s = sound_id.lower()
    if s.startswith("th"):
        return "th"
    for base in ("sh", "ch", "ng", "wh", "qu"):
        if s.startswith(base):
            return base
    if s and s[0] in "szldrtkgnwyh":
        return s[0]
    return s


@router.get("/guided-activity", response_model=GuidedActivityOut)
async def get_guided_activity(
    parent: Parent = Depends(get_current_parent),
    db: AsyncSession = Depends(get_db),
):
    """'Try this activity with your child' — picks one idea from the 50-item
    library, targeted at whichever sound has the lowest recent accuracy if
    we have enough data, otherwise a stable pick-of-the-day so it's not a
    different random suggestion on every refresh."""
    patient = await _get_linked_patient(parent, db)
    since = datetime.now(timezone.utc) - timedelta(days=30)

    accuracy_by_sound: dict[str, list[int]] = {}  # sound -> [correct, total]

    vm_result = await db.execute(
        select(Attempt.sound_id, Attempt.outcome)
        .join(VaakMirrorSession, Attempt.session_id == VaakMirrorSession.id)
        .where(
            VaakMirrorSession.patient_id == patient.id,
            Attempt.created_at >= since,
            Attempt.sound_id.isnot(None),
        )
    )
    for sound_id, outcome in vm_result.all():
        tag = _normalize_goal_tag(sound_id)
        entry = accuracy_by_sound.setdefault(tag, [0, 0])
        entry[1] += 1
        if outcome in ("passed", "caught"):
            entry[0] += 1

    # chime_data_store.get_events is synchronous SQLite I/O — thread it off
    # since this route is `async def` (same fix applied across
    # dashboard.py/kid_progress.py/chime.py's get_patient_events).
    chime_events = await asyncio.to_thread(chime_data_store.get_events, child_id=patient.id, db_path=CHIME_DB_PATH)
    for ev in chime_events:
        if not ev.get("level_id"):
            continue
        try:
            ts = datetime.fromisoformat(ev["timestamp"])
        except (KeyError, ValueError, TypeError):
            continue
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        if ts < since:
            continue
        tag = _normalize_goal_tag(ev["level_id"])
        entry = accuracy_by_sound.setdefault(tag, [0, 0])
        entry[1] += 1
        if ev.get("is_valid_attempt"):
            entry[0] += 1

    weakest_tag = None
    weakest_rate = None
    for tag, (correct, total) in accuracy_by_sound.items():
        if total < 2:
            continue
        rate = correct / total
        if weakest_rate is None or rate < weakest_rate:
            weakest_rate, weakest_tag = rate, tag

    pool = filter_ideas(goal=weakest_tag) if weakest_tag else IDEAS
    if not pool:
        pool = IDEAS

    # Stable per-day pick so the suggestion doesn't change on every refresh.
    pick_index = (hash(patient.id + datetime.now(timezone.utc).strftime("%Y-%m-%d"))) % len(pool)
    idea = pool[pick_index]

    if weakest_tag:
        reason = f"{patient.first_name} has been finding the '{weakest_tag}' sound tricky recently — this activity gives some low-pressure extra practice with it."
    else:
        reason = f"A good all-around activity to try with {patient.first_name} today."

    return GuidedActivityOut(idea=HomePracticeIdeaOut(**idea), reason=reason)
