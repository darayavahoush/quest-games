"""
Run once after setting up Postgres and running BreathQuest at least once
(so its `therapists`/`patients` tables already exist — see README):

    python -m app.seed

Creates VaakMirror's own tables (via SQLAlchemy metadata, no Alembic
migration system set up yet) and seeds the exercise library. There's no
demo patient seeded anymore — patients are created through BreathQuest
(therapist creates one, or a kid self-registers), not through VaakMirror.
"""

from app.database import Base, SessionLocal, engine
from app.models import ExerciseTemplate

EXERCISE_LIBRARY = [
    dict(
        title="Breath-stream & Lip-friction Drills",
        description="Guided breath control and lip-shaping drills to build the airflow precision fricative sounds need.",
        duration_label="4 min",
        target_categories=["Fricative"],
    ),
    dict(
        title="Tongue-tip Elevation & Alveolar Tapping",
        description="Tongue-tip lift and tapping practice against the alveolar ridge, building range for t/d/s/z/n/l sounds.",
        duration_label="5 min",
        target_categories=["Alveolar", "Plosive"],
    ),
    dict(
        title="Humming to Voiced-sound Bridge",
        description="Hums transition into voiced consonants to build vocal cord engagement for voiced sound pairs.",
        duration_label="3 min",
        target_categories=["Voiced"],
    ),
    dict(
        title="Cheek & Jaw Warm-up Massage",
        description="A gentle warm-up massage sequence for cheeks and jaw, used at the start of any session.",
        duration_label="3 min",
        target_categories=["General"],
    ),
    dict(
        title="Lip Rounding for Sh / Ch / J",
        description="Practice rounding and forward lip projection needed for post-alveolar sounds.",
        duration_label="4 min",
        target_categories=["Post-alveolar", "Affricate"],
    ),
]


def run():
    # Requires patients/therapists (BreathQuest's tables) to already exist,
    # since GameSession.patient_id and ExerciseAssignment.patient_id declare
    # a ForeignKey("patients.id"). If BreathQuest hasn't been run yet, this
    # will fail with an error mentioning the missing "patients" table —
    # that's expected; run BreathQuest first.
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        if db.query(ExerciseTemplate).count() == 0:
            db.add_all([ExerciseTemplate(**e) for e in EXERCISE_LIBRARY])
            print(f"Seeded {len(EXERCISE_LIBRARY)} exercise templates.")
        db.commit()
    finally:
        db.close()

    print("Done.")


if __name__ == "__main__":
    run()
