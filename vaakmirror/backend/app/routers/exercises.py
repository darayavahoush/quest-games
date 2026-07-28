from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.auth import assert_therapist_owns_patient, get_current_identity, get_current_therapist_id
from app.database import get_db
from app.models import AssignmentStatus, ExerciseAssignment, ExerciseTemplate
from app.schemas import AssignmentStatusUpdate, ExerciseAssignmentOut, ExerciseTemplateOut

router = APIRouter(tags=["exercises"])


@router.get("/exercises", response_model=list[ExerciseTemplateOut])
def list_exercise_library(db: Session = Depends(get_db)):
    # Static catalog data, no patient info involved — left open rather than
    # gated behind auth.
    return db.query(ExerciseTemplate).all()


@router.get("/patients/{patient_id}/exercises", response_model=list[ExerciseAssignmentOut])
def list_patient_exercises(
    patient_id: str,
    identity: tuple[str, str] = Depends(get_current_identity),
    db: Session = Depends(get_db),
):
    kind, sub = identity
    if kind == "patient" and sub != patient_id:
        raise HTTPException(status_code=403, detail="Not your exercises")
    if kind == "therapist":
        assert_therapist_owns_patient(db, sub, patient_id)

    return (
        db.query(ExerciseAssignment)
        .options(joinedload(ExerciseAssignment.exercise))
        .filter(ExerciseAssignment.patient_id == patient_id)
        .order_by(ExerciseAssignment.assigned_at.desc())
        .all()
    )


@router.post("/patients/{patient_id}/exercises/{exercise_id}/assign", response_model=ExerciseAssignmentOut)
def assign_exercise(
    patient_id: str,
    exercise_id: int,
    therapist_id: str = Depends(get_current_therapist_id),
    db: Session = Depends(get_db),
):
    assert_therapist_owns_patient(db, therapist_id, patient_id)
    exercise = db.query(ExerciseTemplate).get(exercise_id)
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")

    existing = (
        db.query(ExerciseAssignment)
        .filter(
            ExerciseAssignment.patient_id == patient_id,
            ExerciseAssignment.exercise_id == exercise_id,
            ExerciseAssignment.status != AssignmentStatus.completed,
        )
        .first()
    )
    if existing:
        return existing

    assignment = ExerciseAssignment(patient_id=patient_id, exercise_id=exercise_id)
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return assignment


@router.patch("/exercise-assignments/{assignment_id}", response_model=ExerciseAssignmentOut)
def update_assignment_status(
    assignment_id: int,
    payload: AssignmentStatusUpdate,
    identity: tuple[str, str] = Depends(get_current_identity),
    db: Session = Depends(get_db),
):
    assignment = db.query(ExerciseAssignment).get(assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    kind, sub = identity
    if kind == "patient" and sub != assignment.patient_id:
        raise HTTPException(status_code=403, detail="Not your assignment")
    if kind == "therapist":
        assert_therapist_owns_patient(db, sub, assignment.patient_id)

    assignment.status = payload.status
    if payload.status == AssignmentStatus.completed:
        assignment.completed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(assignment)
    return assignment
