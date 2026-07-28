import enum
from datetime import datetime, timezone

from sqlalchemy import (
    ARRAY,
    Column,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class GameName(str, enum.Enum):
    mirror_mirror = "mirror_mirror"
    tongue_tamer = "tongue_tamer"
    lip_sync_hero = "lip_sync_hero"


class AttemptOutcome(str, enum.Enum):
    passed = "passed"  # Mirror Mirror / Tongue Tamer hold-to-pass success
    caught = "caught"  # Lip Sync Hero — caught in time
    missed = "missed"  # Lip Sync Hero — note reached the marker unmatched


class AssignmentStatus(str, enum.Enum):
    not_started = "not_started"
    assigned = "assigned"
    in_progress = "in_progress"
    completed = "completed"


# NOTE: There is deliberately no Child/Patient model here anymore. BreathQuest
# owns that table (`patients`, String/UUID primary key) — VaakMirror only
# stores a `patient_id` reference to it. We don't map BreathQuest's Patient
# or Therapist tables as ORM classes in VaakMirror's own Base either
# (see app/auth.py) — that would mean VaakMirror's own create_all() could
# attempt to manage a table it doesn't fully own the schema for. Anything
# that needs to read patients/therapists uses raw SQL via sqlalchemy.text().
#
# patient_id columns below are deliberately plain indexed String columns,
# NOT SQLAlchemy ForeignKey("patients.id"). A real FK constraint requires
# SQLAlchemy to resolve "patients" as a Table object within THIS file's own
# Base.metadata at DDL-generation time — which it can't do without either
# mapping a Patient class here (defeats the ownership boundary above) or
# registering an unmapped stub Table (throwaway once BreathQuest and
# VaakMirror share one Base after the planned backend merge). Referential
# integrity is enforced in application code instead — see
# app/auth.py: assert_therapist_owns_patient() and get_current_patient_id().


class GameSession(Base):
    # Named vaakmirror_sessions, not game_sessions — BreathQuest already has
    # its own (differently-shaped) game_sessions table in the same database,
    # and the two would collide otherwise.
    __tablename__ = "vaakmirror_sessions"

    id = Column(Integer, primary_key=True)
    patient_id = Column(String, nullable=False, index=True)  # logical ref to breathquest.patients.id
    game = Column(Enum(GameName), nullable=False)
    started_at = Column(DateTime(timezone=True), default=utcnow)
    ended_at = Column(DateTime(timezone=True), nullable=True)

    attempts = relationship("Attempt", back_populates="session", cascade="all, delete-orphan")


class Attempt(Base):
    """
    One scored attempt at a single sound or tongue movement, tagged by the
    phonetics taxonomy (place/manner/voicing) where applicable so the
    dashboard can roll results up into categories instead of a flat log.
    Tongue Tamer attempts don't have a place/manner/voicing tag since its
    targets are movements, not phonemes — those columns stay null.
    """

    __tablename__ = "attempts"

    id = Column(Integer, primary_key=True)
    session_id = Column(Integer, ForeignKey("vaakmirror_sessions.id"), nullable=False)
    sound_id = Column(String(16), nullable=True)  # e.g. 'p', 'sh', 'ta', or 'tongue-up'
    place = Column(String(32), nullable=True)
    manner = Column(String(32), nullable=True)
    voicing = Column(String(16), nullable=True)
    outcome = Column(Enum(AttemptOutcome), nullable=False)
    score = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    session = relationship("GameSession", back_populates="attempts")


class ExerciseTemplate(Base):
    """The static oromotor exercise library — not per-patient."""

    __tablename__ = "exercise_templates"

    id = Column(Integer, primary_key=True)
    title = Column(String(160), nullable=False)
    description = Column(Text, nullable=False)
    duration_label = Column(String(32), nullable=False)
    target_categories = Column(ARRAY(String), nullable=False, default=list)

    assignments = relationship("ExerciseAssignment", back_populates="exercise")


class ExerciseAssignment(Base):
    __tablename__ = "exercise_assignments"

    id = Column(Integer, primary_key=True)
    patient_id = Column(String, nullable=False, index=True)  # logical ref to breathquest.patients.id
    exercise_id = Column(Integer, ForeignKey("exercise_templates.id"), nullable=False)
    status = Column(Enum(AssignmentStatus), nullable=False, default=AssignmentStatus.assigned)
    assigned_at = Column(DateTime(timezone=True), default=utcnow)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    exercise = relationship("ExerciseTemplate", back_populates="assignments")
