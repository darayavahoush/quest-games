"""
Verifies BreathQuest-issued JWTs. VaakMirror has no login/registration of
its own — a therapist logs into BreathQuest, a kid logs in with their
player_code + PIN against BreathQuest, and whichever token that produces is
what gets sent to VaakMirror's API too. This only works because
settings.secret_key/algorithm are configured to match BreathQuest's exactly
(same claim shape: {"sub": ..., "exp": ..., "type": "therapist" | "patient"}).

Identity existence/active-status checks use raw SQL rather than mapped ORM
classes for the `patients`/`therapists` tables — see the note at the top of
models.py for why: VaakMirror doesn't own those tables' schema and shouldn't
have any code path that could attempt to create or alter them.
"""

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db

bearer = HTTPBearer()


def _decode(token: str) -> dict:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


async def _check_active(db: AsyncSession, table: str, row_id: str) -> bool:
    # `table` is always one of the two literal strings below, never
    # user-supplied, so building the query with an f-string here isn't an
    # injection risk the way it would be with actual request input.
    result = await db.execute(text(f"SELECT is_active FROM {table} WHERE id = :id"), {"id": row_id})
    row = result.first()
    return bool(row and row.is_active)


async def get_current_therapist_id(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> str:
    payload = _decode(credentials.credentials)
    if payload.get("type") != "therapist":
        raise HTTPException(status_code=401, detail="A therapist token is required here")
    therapist_id = payload.get("sub")
    if not therapist_id or not await _check_active(db, "therapists", therapist_id):
        raise HTTPException(status_code=401, detail="Therapist not found or inactive")
    return therapist_id


async def get_current_patient_id(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> str:
    payload = _decode(credentials.credentials)
    if payload.get("type") != "patient":
        raise HTTPException(status_code=401, detail="A patient token is required here")
    patient_id = payload.get("sub")
    if not patient_id or not await _check_active(db, "patients", patient_id):
        raise HTTPException(status_code=401, detail="Patient not found or inactive")
    return patient_id


async def get_current_identity(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> tuple[str, str]:
    """For endpoints either a therapist or the patient themself may call —
    returns ("therapist", id) or ("patient", id)."""
    payload = _decode(credentials.credentials)
    kind = payload.get("type")
    sub = payload.get("sub")
    if kind not in ("therapist", "patient") or not sub:
        raise HTTPException(status_code=401, detail="Invalid token")
    table = "therapists" if kind == "therapist" else "patients"
    if not await _check_active(db, table, sub):
        raise HTTPException(status_code=401, detail=f"{kind.title()} not found or inactive")
    return kind, sub


async def assert_therapist_owns_patient(db: AsyncSession, therapist_id: str, patient_id: str) -> None:
    result = await db.execute(text("SELECT therapist_id FROM patients WHERE id = :id"), {"id": patient_id})
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Patient not found")
    # A self-registered kid (no therapist_id set) has no owning therapist to
    # check against — allowed through for now. Tightening this (e.g.
    # requiring a claim step) is a real gap, not an oversight; flagged in
    # the README.
    if row.therapist_id is not None and row.therapist_id != therapist_id:
        raise HTTPException(status_code=403, detail="This patient belongs to a different therapist")


async def get_patient_summary(db: AsyncSession, patient_id: str) -> dict | None:
    result = await db.execute(
        text("SELECT id, first_name, age FROM patients WHERE id = :id"), {"id": patient_id}
    )
    row = result.first()
    return {"id": row.id, "first_name": row.first_name, "age": row.age} if row else None
