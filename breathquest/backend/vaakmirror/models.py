import enum
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
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

from database import Base


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


# NOTE: There is deliberately no Child/Patient model here. BreathQuest owns
# that table (`patients`, String/UUID primary key) — VaakMirror only stores
# a `patient_id` reference to it. Now that this file shares BreathQuest's
# own `Base` (imported from the top-level `database` module, post-merge),
# a real ForeignKey("patients.id") WOULD resolve correctly at DDL time —
# but it's deliberately still left as a plain indexed String, matching the
# ownership boundary in auth.py (assert_therapist_owns_patient /
# get_current_patient_id do the real enforcement). Revisit this decision
# now that a real FK is actually possible post-merge, if desired.


class GameSession(Base):
    # Named vaakmirror_sessions, not game_sessions — BreathQuest already has
    # its own (differently-shaped) game_sessions table, and the two would
    # collide otherwise.
    __tablename__ = "vaakmirror_sessions"

    id = Column(Integer, primary_key=True)
    patient_id = Column(String, nullable=False, index=True)  # logical ref to patients.id
    game = Column(Enum(GameName), nullable=False)
    started_at = Column(DateTime(timezone=True), default=utcnow)
    ended_at = Column(DateTime(timezone=True), nullable=True)

    attempts = relationship("vaakmirror.models.Attempt", back_populates="session", cascade="all, delete-orphan")


class Attempt(Base):
    __tablename__ = "attempts"

    id = Column(Integer, primary_key=True)
    session_id = Column(Integer, ForeignKey("vaakmirror_sessions.id"), nullable=False)
    sound_id = Column(String(16), nullable=True)
    place = Column(String(32), nullable=True)
    manner = Column(String(32), nullable=True)
    voicing = Column(String(16), nullable=True)
    outcome = Column(Enum(AttemptOutcome), nullable=False)
    score = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    session = relationship("vaakmirror.models.GameSession", back_populates="attempts")


class ExerciseTemplate(Base):
    __tablename__ = "exercise_templates"

    id = Column(Integer, primary_key=True)
    title = Column(String(160), nullable=False)
    description = Column(Text, nullable=False)
    duration_label = Column(String(32), nullable=False)
    # JSON instead of ARRAY: works on both Postgres (stored as jsonb) and
    # SQLite (this demo build's DB) — same Python-side list in/out either way.
    target_categories = Column(JSON, nullable=False, default=list)

    assignments = relationship("vaakmirror.models.ExerciseAssignment", back_populates="exercise")


class GameSettings(Base):
    """Per-patient, per-game clinical parameters a therapist can tune —
    starting with round_size (how many sounds/attempts appear per session).
    A separate row per (patient_id, game) rather than one JSON blob per
    patient, so each game's settings can evolve independently."""
    __tablename__ = "game_settings"

    id = Column(Integer, primary_key=True)
    patient_id = Column(String, nullable=False, index=True)  # logical ref to patients.id, same pattern as elsewhere in this file
    game = Column(Enum(GameName), nullable=False)
    round_size = Column(Integer, nullable=True)  # null = use the game's built-in default
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    updated_by = Column(String, nullable=True)  # therapist_id who last changed it


class ExerciseAssignment(Base):
    __tablename__ = "exercise_assignments"

    id = Column(Integer, primary_key=True)
    patient_id = Column(String, nullable=False, index=True)  # logical ref to patients.id
    exercise_id = Column(Integer, ForeignKey("exercise_templates.id"), nullable=False)
    status = Column(Enum(AssignmentStatus), nullable=False, default=AssignmentStatus.assigned)
    assigned_at = Column(DateTime(timezone=True), default=utcnow)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    exercise = relationship("vaakmirror.models.ExerciseTemplate", back_populates="assignments")
