from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import Integer, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from vaakmirror.auth import get_current_patient_id
from database import get_db
from vaakmirror.models import Attempt, AttemptOutcome, GameSession
from vaakmirror.schemas import AttemptCreate, AttemptOut, SessionCreate, SessionOut, WeakSound

router = APIRouter(tags=["vaakmirror-sessions"])

# Same success/threshold shape as dashboard.py's category rollups, but keyed
# on sound_id and scoped to the calling kid's own token rather than a
# therapist-owned patient_id — this is what Minimal Pair Drill uses to pick
# which contrast a kid actually needs, not what a therapist views.
_SUCCESS_OUTCOMES = (AttemptOutcome.passed, AttemptOutcome.caught)
_MIN_ATTEMPTS = 4
_WEAK_THRESHOLD = 65.0


@router.post("/sessions", response_model=SessionOut)
async def create_session(
    payload: SessionCreate,
    patient_id: str = Depends(get_current_patient_id),
    db: AsyncSession = Depends(get_db),
):
    session = GameSession(patient_id=patient_id, game=payload.game)
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


@router.post("/sessions/{session_id}/attempts", response_model=AttemptOut)
async def log_attempt(
    session_id: int,
    payload: AttemptCreate,
    patient_id: str = Depends(get_current_patient_id),
    db: AsyncSession = Depends(get_db),
):
    session = await db.get(GameSession, session_id)
    if not session or session.patient_id != patient_id:
        raise HTTPException(status_code=404, detail="Session not found")

    attempt = Attempt(session_id=session_id, **payload.model_dump())
    db.add(attempt)
    await db.commit()
    await db.refresh(attempt)
    return attempt


@router.get("/sessions/weak-sounds", response_model=list[WeakSound])
async def get_weak_sounds(
    patient_id: str = Depends(get_current_patient_id),
    db: AsyncSession = Depends(get_db),
):
    """Per-sound accuracy for the calling kid, sounds below threshold first.
    Used by Minimal Pair Drill to auto-pick which contrast to practice —
    intentionally patient-self-scoped (no therapist_id/ownership check)
    since a kid's own token already limits this to their own attempts."""
    stmt = (
        select(
            Attempt.sound_id.label("sound_id"),
            func.count(Attempt.id).label("attempts"),
            func.sum(cast(Attempt.outcome.in_(_SUCCESS_OUTCOMES), Integer)).label("successes"),
        )
        .join(GameSession, Attempt.session_id == GameSession.id)
        .where(GameSession.patient_id == patient_id, Attempt.sound_id.isnot(None))
        .group_by(Attempt.sound_id)
    )
    result = await db.execute(stmt)
    rows = result.all()
    out = []
    for r in rows:
        attempts = r.attempts or 0
        successes = r.successes or 0
        if attempts < _MIN_ATTEMPTS:
            continue
        accuracy = round((successes / attempts) * 100, 1)
        out.append(WeakSound(sound_id=r.sound_id, accuracy=accuracy, attempts=attempts))
    out.sort(key=lambda w: w.accuracy)
    return [w for w in out if w.accuracy < _WEAK_THRESHOLD] or out[:5]


@router.patch("/sessions/{session_id}/end", response_model=SessionOut)
async def end_session(
    session_id: int,
    patient_id: str = Depends(get_current_patient_id),
    db: AsyncSession = Depends(get_db),
):
    session = await db.get(GameSession, session_id)
    if not session or session.patient_id != patient_id:
        raise HTTPException(status_code=404, detail="Session not found")

    session.ended_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(session)
    return session
