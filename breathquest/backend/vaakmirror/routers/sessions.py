from datetime import datetime, timezone
import asyncio
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import Integer, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from vaakmirror.auth import get_current_patient_id
from database import get_db
from vaakmirror import agent_bridge
from vaakmirror.models import Attempt, AttemptOutcome, GameSession, GameSettings
from vaakmirror.schemas import AttemptCreate, AttemptOut, SessionCreate, SessionOut, WeakSound
from retraining import data_store
from retraining.scheduler import run_retrain_if_due

router = APIRouter(tags=["vaakmirror-sessions"])
logger = logging.getLogger(__name__)

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
    background_tasks: BackgroundTasks,
    patient_id: str = Depends(get_current_patient_id),
    db: AsyncSession = Depends(get_db),
):
    session = await db.get(GameSession, session_id)
    if not session or session.patient_id != patient_id:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.ended_at is not None:
        # Already ended — e.g. natural completion racing a pagehide beacon
        # sent when the kid closed the tab a beat later. Safe no-op rather
        # than overwriting ended_at and double-logging to the agent (this
        # also protects _log_session_to_agent's retrain-trigger below from
        # double-firing on the same race).
        return session

    session.ended_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(session)

    await _log_session_to_agent(db, session, background_tasks)

    return session


async def _log_session_to_agent(db: AsyncSession, session: GameSession, background_tasks: BackgroundTasks):
    """Feed this session's result back to the same adaptive-difficulty agent
    Chime and BreathQuest use (see vaakmirror/agent_bridge.py) — keeps the
    kid's per-child agent learning from every app, not just this one. Never
    lets agent bookkeeping break the actual game flow for the kid.

    Also triggers the same shared, thread-safe retrain check Chime and
    BreathQuest trigger on every event (retraining/scheduler.py) —
    previously VaakMirror logged real events here but never checked whether
    a shared-policy retrain was due, so its sessions never contributed
    toward a PPO/RecurrentPPO retrain the way Chime's did.

    data_store.add_event() and maybe_update_tabular_q_from_new_event() are
    both synchronous, blocking file I/O (SQLite for the former, a JSON
    Q-table write for the latter) — run through asyncio.to_thread so they
    execute on a worker thread instead of blocking this coroutine's event
    loop. Chime and BreathQuest's own versions of this call are safe
    without that, since their route handlers are plain `def`, which
    FastAPI already runs in a threadpool wholesale; this one is `async
    def` (it needs to await the DB queries above it), so the blocking
    calls need to be threaded off explicitly or every concurrent request
    to the whole app stalls for as long as the SQLite/file write takes."""
    try:
        stmt = select(
            func.count(Attempt.id).label("attempts"),
            func.sum(cast(Attempt.outcome.in_(_SUCCESS_OUTCOMES), Integer)).label("successes"),
        ).where(Attempt.session_id == session.id)
        result = await db.execute(stmt)
        row = result.one()
        attempts = row.attempts or 0
        successes = row.successes or 0
        score = (successes / attempts) if attempts else 0.0

        settings_result = await db.execute(
            select(GameSettings).where(
                GameSettings.patient_id == session.patient_id, GameSettings.game == session.game
            )
        )
        settings = settings_result.scalar_one_or_none()
        difficulty = agent_bridge.round_size_to_difficulty(settings.round_size if settings else None)

        await asyncio.to_thread(
            data_store.add_event,
            child_id=session.patient_id,
            level_id=session.game.value,
            attempt_number=session.id,
            score=score,
            is_valid_attempt=attempts > 0,
            threshold_at_time=difficulty,
            quit_flag=(attempts == 0),
            db_path=agent_bridge.DB_PATH,
        )
        await asyncio.to_thread(
            agent_bridge.agent_service.maybe_update_tabular_q_from_new_event,
            session.patient_id, session.game.value, attempts == 0,
        )
        background_tasks.add_task(run_retrain_if_due, agent_bridge.DB_PATH)
    except Exception:
        logger.exception("Failed to log VaakMirror session %s to the adaptive-difficulty agent", session.id)
