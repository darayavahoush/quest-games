from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_patient_id
from app.database import get_db
from app.models import Attempt, GameSession
from app.schemas import AttemptCreate, AttemptOut, SessionCreate, SessionOut

router = APIRouter(tags=["sessions"])


@router.post("/sessions", response_model=SessionOut)
def create_session(
    payload: SessionCreate,
    patient_id: str = Depends(get_current_patient_id),
    db: Session = Depends(get_db),
):
    # patient_id comes from the kid's own token, never from the request body
    # — a kid can only ever log sessions/attempts against themself.
    session = GameSession(patient_id=patient_id, game=payload.game)
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.post("/sessions/{session_id}/attempts", response_model=AttemptOut)
def log_attempt(
    session_id: int,
    payload: AttemptCreate,
    patient_id: str = Depends(get_current_patient_id),
    db: Session = Depends(get_db),
):
    session = db.query(GameSession).get(session_id)
    if not session or session.patient_id != patient_id:
        raise HTTPException(status_code=404, detail="Session not found")

    attempt = Attempt(session_id=session_id, **payload.model_dump())
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    return attempt


@router.patch("/sessions/{session_id}/end", response_model=SessionOut)
def end_session(
    session_id: int,
    patient_id: str = Depends(get_current_patient_id),
    db: Session = Depends(get_db),
):
    session = db.query(GameSession).get(session_id)
    if not session or session.patient_id != patient_id:
        raise HTTPException(status_code=404, detail="Session not found")

    session.ended_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(session)
    return session
