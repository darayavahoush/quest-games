from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import Integer, cast, func
from sqlalchemy.orm import Session

from app.auth import assert_therapist_owns_patient, get_current_therapist_id, get_patient_summary
from app.database import get_db
from app.models import Attempt, AttemptOutcome, ExerciseAssignment, ExerciseTemplate, GameSession, AssignmentStatus
from app.schemas import CategoryAccuracy, DashboardOut, FlaggedGap, PatientSummary, WeeklyPoint

router = APIRouter(tags=["dashboard"])

SUCCESS_OUTCOMES = (AttemptOutcome.passed, AttemptOutcome.caught)
MIN_ATTEMPTS_FOR_GAP = 5
GAP_THRESHOLD = 55.0


def _success_flag():
    return cast(Attempt.outcome.in_(SUCCESS_OUTCOMES), Integer)


def _accuracy_by(db: Session, patient_id: str, column) -> list[CategoryAccuracy]:
    rows = (
        db.query(
            column.label("category"),
            func.count(Attempt.id).label("attempts"),
            func.sum(_success_flag()).label("successes"),
        )
        .join(GameSession, Attempt.session_id == GameSession.id)
        .filter(GameSession.patient_id == patient_id, column.isnot(None))
        .group_by(column)
        .all()
    )
    out = []
    for r in rows:
        attempts = r.attempts or 0
        successes = r.successes or 0
        accuracy = round((successes / attempts) * 100, 1) if attempts else 0.0
        out.append(CategoryAccuracy(category=r.category, accuracy=accuracy, attempts=attempts))
    return sorted(out, key=lambda c: c.accuracy)


def _ensure_assigned(db: Session, patient_id: str, exercise_id: int) -> None:
    """See the fuller note in the previous version of this function — this
    is an intentional GET-with-a-side-effect: it's idempotent (checks for
    an existing active assignment first), and this is the one place already
    computing which gaps are flagged."""
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
        return
    db.add(ExerciseAssignment(patient_id=patient_id, exercise_id=exercise_id))


@router.get("/patients/{patient_id}/dashboard", response_model=DashboardOut)
def get_dashboard(
    patient_id: str,
    therapist_id: str = Depends(get_current_therapist_id),
    db: Session = Depends(get_db),
):
    assert_therapist_owns_patient(db, therapist_id, patient_id)
    patient = get_patient_summary(db, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    sessions_count = db.query(GameSession).filter(GameSession.patient_id == patient_id).count()

    manner_accuracy = _accuracy_by(db, patient_id, Attempt.manner)
    place_accuracy = _accuracy_by(db, patient_id, Attempt.place)
    voicing_accuracy = _accuracy_by(db, patient_id, Attempt.voicing)

    weekly_rows = (
        db.query(
            func.date_trunc("week", Attempt.created_at).label("week"),
            func.count(Attempt.id).label("attempts"),
            func.sum(_success_flag()).label("successes"),
        )
        .join(GameSession, Attempt.session_id == GameSession.id)
        .filter(GameSession.patient_id == patient_id)
        .group_by("week")
        .order_by("week")
        .all()
    )
    progress_over_time = [
        WeeklyPoint(
            week=row.week.strftime("Wk of %b %-d") if row.week else "\u2014",
            accuracy=round((row.successes / row.attempts) * 100, 1) if row.attempts else 0.0,
            attempts=row.attempts or 0,
        )
        for row in weekly_rows[-6:]
    ]

    exercises = db.query(ExerciseTemplate).all()
    candidates = (
        [(c, "Manner") for c in manner_accuracy]
        + [(c, "Place") for c in place_accuracy]
        + [(c, "Voicing") for c in voicing_accuracy]
    )

    flagged: list[FlaggedGap] = []
    for cat, dimension in candidates:
        if cat.attempts < MIN_ATTEMPTS_FOR_GAP or cat.accuracy >= GAP_THRESHOLD:
            continue
        severity = "high" if cat.accuracy < 35 else "medium" if cat.accuracy < 50 else "low"
        matching_exercise = next(
            (e for e in exercises if cat.category in (e.target_categories or [])), None
        )
        flagged.append(
            FlaggedGap(
                id=f"gap-{dimension.lower()}-{cat.category.lower()}",
                title=f"{cat.category} ({dimension.lower()})",
                detail=(
                    f"{cat.accuracy:.0f}% accuracy across {cat.attempts} attempts \u2014 "
                    f"below the level where this is likely just normal variation."
                ),
                severity=severity,
                assigned_exercise=matching_exercise.title if matching_exercise else None,
            )
        )
        if matching_exercise:
            _ensure_assigned(db, patient_id, matching_exercise.id)
    flagged.sort(key=lambda g: {"high": 0, "medium": 1, "low": 2}[g.severity])
    db.commit()

    return DashboardOut(
        patient=PatientSummary(**patient),
        sessions_count=sessions_count,
        manner_accuracy=manner_accuracy,
        place_accuracy=place_accuracy,
        voicing_accuracy=voicing_accuracy,
        progress_over_time=progress_over_time,
        flagged_gaps=flagged[:3],
    )
