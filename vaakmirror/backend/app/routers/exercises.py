from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.auth import assert_therapist_owns_patient, get_current_identity, get_current_therapist_id
from app.database import get_db
from app.models import AssignmentStatus, ExerciseAssignment, ExerciseTemplate
from app.schemas import AssignmentStatusUpdate, ExerciseAssignmentOut, ExerciseTemplateOut

router = APIRouter(tags=["exercises"])


@router.get("/exercises", response_model=list[ExerciseTemplateOut])
async def list_exercise_library(db: AsyncSession = Depends(get_db)):
    # Static catalog data, no patient info involved — left open rather than
    # gated behind auth.
    result = await db.execute(select(ExerciseTemplate))
    return result.scalars().all()


@router.get("/patients/{patient_id}/exercises", response_model=list[ExerciseAssignmentOut])
async def list_patient_exercises(
    patient_id: str,
    identity: tuple[str, str] = Depends(get_current_identity),
    db: AsyncSession = Depends(get_db),
):
    kind, sub = identity
    if kind == "patient" and sub != patient_id:
        raise HTTPException(status_code=403, detail="Not your exercises")
    if kind == "therapist":
        await assert_therapist_owns_patient(db, sub, patient_id)

    stmt = (
        select(ExerciseAssignment)
        .options(joinedload(ExerciseAssignment.exercise))
        .where(ExerciseAssignment.patient_id == patient_id)
        .order_by(ExerciseAssignment.assigned_at.desc())
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/patients/{patient_id}/exercises/{exercise_id}/assign", response_model=ExerciseAssignmentOut)
async def assign_exercise(
    patient_id: str,
    exercise_id: int,
    therapist_id: str = Depends(get_current_therapist_id),
    db: AsyncSession = Depends(get_db),
):
    await assert_therapist_owns_patient(db, therapist_id, patient_id)
    exercise = await db.get(ExerciseTemplate, exercise_id)
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")

    stmt = select(ExerciseAssignment).where(
        ExerciseAssignment.patient_id == patient_id,
        ExerciseAssignment.exercise_id == exercise_id,
        ExerciseAssignment.status != AssignmentStatus.completed,
    )
    result = await db.execute(stmt)
    existing = result.scalars().first()
    if existing:
        return existing

    assignment = ExerciseAssignment(patient_id=patient_id, exercise_id=exercise_id)
    db.add(assignment)
    await db.commit()
    await db.refresh(assignment)
    return assignment


@router.patch("/exercise-assignments/{assignment_id}", response_model=ExerciseAssignmentOut)
async def update_assignment_status(
    assignment_id: int,
    payload: AssignmentStatusUpdate,
    identity: tuple[str, str] = Depends(get_current_identity),
    db: AsyncSession = Depends(get_db),
):
    assignment = await db.get(ExerciseAssignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    kind, sub = identity
    if kind == "patient" and sub != assignment.patient_id:
        raise HTTPException(status_code=403, detail="Not your assignment")
    if kind == "therapist":
        await assert_therapist_owns_patient(db, sub, assignment.patient_id)

    assignment.status = payload.status
    if payload.status == AssignmentStatus.completed:
        assignment.completed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(assignment)
    return assignment
