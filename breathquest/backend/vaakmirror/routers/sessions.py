from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from vaakmirror.auth import get_current_patient_id
from database import get_db
from vaakmirror.models import Attempt, GameSession
from vaakmirror.schemas import AttemptCreate, AttemptOut, SessionCreate, SessionOut

router = APIRouter(tags=["vaakmirror-sessions"])


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
