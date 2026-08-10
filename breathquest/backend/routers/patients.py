"""
routers/patients.py — Patient management (therapist-only).
"""

import asyncio

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from database import get_db
from models.models import Therapist, Patient, GameSession
from schemas.schemas import PatientCreate, PatientUpdate, PatientOut, PatientDetailOut, ParentInviteCodeOut
from core.security import hash_pin, generate_unique_player_code
from core.deps import get_current_therapist
from core.security import generate_invite_code
from core import assessment_client

router = APIRouter(prefix="/patients", tags=["patients"])


@router.post("", response_model=PatientOut, status_code=status.HTTP_201_CREATED)
async def create_patient(
    data: PatientCreate,
    therapist: Therapist = Depends(get_current_therapist),
    db: AsyncSession = Depends(get_db),
):
    # 2026-08-10: patient_id now originates in Assessment, not here -- a
    # BreathQuest-only patient with no assessment_patient_id is exactly the
    # disconnected-identity bug this branch exists to fix (see routers/
    # therapist_patients.py in agenti_ai and core/assessment_client.py's
    # create_assessment_patient). Fails loudly (503) rather than silently
    # falling back to the old disconnected behavior if Assessment is
    # unreachable -- a therapist should know their patient wasn't really
    # created, not get a patient that looks fine but has no diagnostic
    # linkage.
    #
    # asyncio.to_thread: create_assessment_patient does blocking urllib I/O
    # -- calling it directly here would reintroduce the exact class of bug
    # already fixed once across this backend (see git log d2afa76).
    assessment_patient_id, error = await asyncio.to_thread(
        assessment_client.create_assessment_patient,
        therapist.email, data.first_name, data.age, data.diagnosis_notes,
    )
    if assessment_patient_id is None:
        raise HTTPException(
            status_code=503,
            detail=f"Could not create the Assessment-side patient record: {error}",
        )

    # player_code is NOT NULL + unique on the model — this endpoint 500'd on
    # every single call before this, since nothing here ever set it (kid
    # self-registration, in auth.py, generated one inline; this therapist-
    # driven path never did). Same collision-checked generator both use now.
    player_code = await generate_unique_player_code(db, data.avatar)
    patient = Patient(
        therapist_id=therapist.id,
        first_name=data.first_name,
        avatar=data.avatar,
        pin_hash=hash_pin(data.pin),
        player_code=player_code,
        age=data.age,
        diagnosis_notes=data.diagnosis_notes,
        assessment_patient_id=assessment_patient_id,
    )
    db.add(patient)
    await db.flush()
    return patient


@router.get("", response_model=list[PatientDetailOut])
async def list_patients(
    therapist: Therapist = Depends(get_current_therapist),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Patient)
        .where(Patient.therapist_id == therapist.id)
        .order_by(Patient.created_at.desc())
    )
    patients = result.scalars().all()

    out = []
    for p in patients:
        # Get session stats
        stats = await db.execute(
            select(
                func.count(GameSession.id).label("total"),
                func.sum(GameSession.stars_earned).label("stars"),
                func.max(GameSession.started_at).label("last"),
            ).where(GameSession.patient_id == p.id)
        )
        row = stats.one()
        out.append(PatientDetailOut(
            **PatientOut.model_validate(p).model_dump(),
            diagnosis_notes=p.diagnosis_notes,
            total_sessions=row.total or 0,
            total_stars=int(row.stars or 0),
            last_session_at=row.last,
        ))
    return out


@router.get("/{patient_id}", response_model=PatientDetailOut)
async def get_patient(
    patient_id: str,
    therapist: Therapist = Depends(get_current_therapist),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Patient).where(Patient.id == patient_id,
                              Patient.therapist_id == therapist.id)
    )
    patient = result.scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    stats = await db.execute(
        select(
            func.count(GameSession.id).label("total"),
            func.sum(GameSession.stars_earned).label("stars"),
            func.max(GameSession.started_at).label("last"),
        ).where(GameSession.patient_id == patient.id)
    )
    row = stats.one()
    return PatientDetailOut(
        **PatientOut.model_validate(patient).model_dump(),
        diagnosis_notes=patient.diagnosis_notes,
        total_sessions=row.total or 0,
        total_stars=int(row.stars or 0),
        last_session_at=row.last,
    )


@router.patch("/{patient_id}", response_model=PatientOut)
async def update_patient(
    patient_id: str,
    data: PatientUpdate,
    therapist: Therapist = Depends(get_current_therapist),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Patient).where(Patient.id == patient_id,
                              Patient.therapist_id == therapist.id)
    )
    patient = result.scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(patient, field, value)

    return patient


@router.delete("/{patient_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_patient(
    patient_id: str,
    therapist: Therapist = Depends(get_current_therapist),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Patient).where(Patient.id == patient_id,
                              Patient.therapist_id == therapist.id)
    )
    patient = result.scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    await db.delete(patient)


@router.post("/{patient_id}/parent-invite-code", response_model=ParentInviteCodeOut)
async def generate_parent_invite_code(
    patient_id: str,
    therapist: Therapist = Depends(get_current_therapist),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Patient).where(Patient.id == patient_id, Patient.therapist_id == therapist.id)
    )
    patient = result.scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    code = generate_invite_code()
    patient.parent_invite_code = code
    await db.flush()

    return ParentInviteCodeOut(invite_code=code)
