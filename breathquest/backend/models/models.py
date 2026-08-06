"""
models/models.py — All database models for BreathQuest.
"""

import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    String, Integer, Float, Boolean, Text, DateTime,
    ForeignKey, JSON, Enum as SAEnum
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from database import Base


def utcnow():
    return datetime.now(timezone.utc)

def new_uuid():
    return str(uuid.uuid4())


class LevelID(str, enum.Enum):
    pinwheel    = "pinwheel"
    float_rider = "float_rider"
    candle      = "candle"
    balloon     = "balloon"
    dandelion   = "dandelion"
    dragon      = "dragon"


class SessionStatus(str, enum.Enum):
    in_progress = "in_progress"
    completed   = "completed"
    abandoned   = "abandoned"


class Therapist(Base):
    __tablename__ = "therapists"

    id:               Mapped[str]           = mapped_column(String, primary_key=True, default=new_uuid)
    email:            Mapped[str]           = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password:  Mapped[str]           = mapped_column(String(255), nullable=False)
    full_name:        Mapped[str]           = mapped_column(String(255), nullable=False)
    clinic_name:      Mapped[str | None]    = mapped_column(String(255))
    is_active:        Mapped[bool]          = mapped_column(Boolean, default=True)
    created_at:       Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=utcnow)
    last_login:       Mapped[datetime|None] = mapped_column(DateTime(timezone=True))

    patients: Mapped[list["Patient"]] = relationship(back_populates="therapist", cascade="all, delete-orphan")


class Patient(Base):
    __tablename__ = "patients"

    id:               Mapped[str]           = mapped_column(String, primary_key=True, default=new_uuid)
    therapist_id:     Mapped[str | None]    = mapped_column(ForeignKey("therapists.id"), nullable=True, index=True)
    first_name:       Mapped[str]           = mapped_column(String(100), nullable=False)
    avatar:           Mapped[str]           = mapped_column(String(50), default="chick")
    pin_hash:         Mapped[str]           = mapped_column(String(64), nullable=False)
    player_code:      Mapped[str]           = mapped_column(String(10), unique=True, nullable=False, index=True)
    # Separate from player_code deliberately — a therapist can hand this out
    # to grant parent access without also exposing the kid's own login code.
    # Nullable: most patients won't have one generated until a therapist
    # requests it. Single-use — cleared once redeemed (see parent-register).
    parent_invite_code: Mapped[str | None] = mapped_column(nullable=True, unique=True)
    # Set when this patient was linked from an Assessment-side patient
    # record via kid-pin-setup. Unique + nullable so PIN setup can
    # find-or-create idempotently on re-link instead of duplicating
    # (see routers/auth.py::kid_pin_setup).
    assessment_patient_id: Mapped[str | None] = mapped_column(String, nullable=True, unique=True, index=True)
    age:              Mapped[int | None]    = mapped_column(Integer)
    diagnosis_notes:  Mapped[str | None]   = mapped_column(Text)
    is_active:        Mapped[bool]          = mapped_column(Boolean, default=True)
    created_at:       Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=utcnow)

    therapist: Mapped["Therapist | None"]   = relationship(back_populates="patients")
    sessions:  Mapped[list["GameSession"]]  = relationship("models.models.GameSession", back_populates="patient", cascade="all, delete-orphan")
    notes:     Mapped[list["TherapistNote"]]= relationship("models.models.TherapistNote", back_populates="patient", cascade="all, delete-orphan")
    assignments: Mapped[list["Assignment"]] = relationship("models.models.Assignment", back_populates="patient", cascade="all, delete-orphan")
    goals:       Mapped[list["Goal"]]       = relationship("models.models.Goal", back_populates="patient", cascade="all, delete-orphan")
    messages:    Mapped[list["Message"]]    = relationship("models.models.Message", back_populates="patient", cascade="all, delete-orphan")
    home_practice_logs: Mapped[list["HomePracticeLog"]] = relationship("models.models.HomePracticeLog", back_populates="patient", cascade="all, delete-orphan")
    parent: Mapped["Parent | None"] = relationship("models.models.Parent", back_populates="patient", uselist=False, cascade="all, delete-orphan")


class GameSession(Base):
    __tablename__ = "game_sessions"

    id:                   Mapped[str]          = mapped_column(String, primary_key=True, default=new_uuid)
    patient_id:           Mapped[str]          = mapped_column(ForeignKey("patients.id"), nullable=False, index=True)
    level_id:             Mapped[str]          = mapped_column(SAEnum(LevelID), nullable=False)
    started_at:           Mapped[datetime]     = mapped_column(DateTime(timezone=True), default=utcnow)
    ended_at:             Mapped[datetime|None]= mapped_column(DateTime(timezone=True))
    duration_seconds:     Mapped[float|None]   = mapped_column(Float)
    status:               Mapped[str]          = mapped_column(SAEnum(SessionStatus), default=SessionStatus.in_progress)
    stars_earned:         Mapped[int|None]     = mapped_column(Integer)
    completed:            Mapped[bool]         = mapped_column(Boolean, default=False)
    completion_message:   Mapped[str|None]     = mapped_column(String(255))
    avg_breath_strength:  Mapped[float|None]   = mapped_column(Float)
    max_breath_strength:  Mapped[float|None]   = mapped_column(Float)
    breath_consistency:   Mapped[float|None]   = mapped_column(Float)
    total_puffs:          Mapped[int|None]     = mapped_column(Integer)
    lives_lost:           Mapped[int|None]     = mapped_column(Integer)

    patient: Mapped["Patient"]              = relationship(back_populates="sessions")
    events:  Mapped[list["SessionEvent"]]   = relationship(back_populates="session", cascade="all, delete-orphan")


class SessionEvent(Base):
    __tablename__ = "session_events"

    id:           Mapped[str]          = mapped_column(String, primary_key=True, default=new_uuid)
    session_id:   Mapped[str]          = mapped_column(ForeignKey("game_sessions.id"), nullable=False, index=True)
    timestamp:    Mapped[datetime]     = mapped_column(DateTime(timezone=True), default=utcnow)
    event_type:   Mapped[str]          = mapped_column(String(50))
    breath_value: Mapped[float|None]   = mapped_column(Float)
    event_data:   Mapped[dict|None]    = mapped_column(JSON)

    session: Mapped["GameSession"] = relationship("models.models.GameSession", back_populates="events")


class TherapistNote(Base):
    __tablename__ = "therapist_notes"

    id:           Mapped[str]          = mapped_column(String, primary_key=True, default=new_uuid)
    patient_id:   Mapped[str]          = mapped_column(ForeignKey("patients.id"), nullable=False, index=True)
    therapist_id: Mapped[str]          = mapped_column(ForeignKey("therapists.id"), nullable=False)
    created_at:   Mapped[datetime]     = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at:   Mapped[datetime]     = mapped_column(DateTime(timezone=True), default=utcnow)
    session_id:   Mapped[str|None]     = mapped_column(ForeignKey("game_sessions.id"))
    content:      Mapped[str]          = mapped_column(Text, nullable=False)
    tags:         Mapped[list|None]    = mapped_column(JSON)

    patient: Mapped["Patient"] = relationship(back_populates="notes")


class AssignmentStatus(str, enum.Enum):
    assigned   = "assigned"
    in_progress = "in_progress"
    completed  = "completed"
    overdue    = "overdue"


class Assignment(Base):
    """Homework — a specific level/word-set a therapist assigns to a patient."""
    __tablename__ = "assignments"

    id:           Mapped[str]           = mapped_column(String, primary_key=True, default=new_uuid)
    patient_id:   Mapped[str]           = mapped_column(ForeignKey("patients.id"), nullable=False, index=True)
    assigned_by:  Mapped[str]           = mapped_column(ForeignKey("therapists.id"), nullable=False)
    game:         Mapped[str]           = mapped_column(String(50), nullable=False)   # e.g. "chime", "breathquest", "vaakmirror"
    level_id:     Mapped[str|None]      = mapped_column(String(50))                  # phoneme/level/word-set target, if applicable
    title:        Mapped[str]           = mapped_column(String(255), nullable=False)
    instructions: Mapped[str|None]      = mapped_column(Text)
    status:       Mapped[str]           = mapped_column(SAEnum(AssignmentStatus), default=AssignmentStatus.assigned)
    created_at:   Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=utcnow)
    due_at:       Mapped[datetime|None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime|None] = mapped_column(DateTime(timezone=True))

    patient: Mapped["Patient"] = relationship(back_populates="assignments")


class Goal(Base):
    """A measurable target tracked against SessionEvent/GameSession aggregates."""
    __tablename__ = "goals"

    id:            Mapped[str]           = mapped_column(String, primary_key=True, default=new_uuid)
    patient_id:    Mapped[str]           = mapped_column(ForeignKey("patients.id"), nullable=False, index=True)
    created_by:    Mapped[str]           = mapped_column(ForeignKey("therapists.id"), nullable=False)
    target_metric: Mapped[str]           = mapped_column(String(100), nullable=False)  # e.g. "/s/_accuracy", "breath_consistency"
    target_value:  Mapped[float]         = mapped_column(Float, nullable=False)
    baseline_value: Mapped[float|None]   = mapped_column(Float)
    target_date:   Mapped[datetime|None] = mapped_column(DateTime(timezone=True))
    achieved:      Mapped[bool]          = mapped_column(Boolean, default=False)
    achieved_at:   Mapped[datetime|None] = mapped_column(DateTime(timezone=True))
    created_at:    Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=utcnow)

    patient: Mapped["Patient"] = relationship(back_populates="goals")


class SenderRole(str, enum.Enum):
    therapist = "therapist"
    parent    = "parent"


class Message(Base):
    """In-app therapist <-> parent communication log, per patient."""
    __tablename__ = "messages"

    id:          Mapped[str]           = mapped_column(String, primary_key=True, default=new_uuid)
    patient_id:  Mapped[str]           = mapped_column(ForeignKey("patients.id"), nullable=False, index=True)
    sender_role: Mapped[str]           = mapped_column(SAEnum(SenderRole), nullable=False)
    sender_id:   Mapped[str|None]      = mapped_column(String)  # therapist_id when sender_role == therapist; nullable for parent (no parent accounts yet)
    body:        Mapped[str]           = mapped_column(Text, nullable=False)
    created_at:  Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=utcnow)
    read_at:     Mapped[datetime|None] = mapped_column(DateTime(timezone=True))

    patient: Mapped["Patient"] = relationship(back_populates="messages")


class HomePracticeLog(Base):
    """Manual, parent-reported home practice — distinct from in-app GameSession
    telemetry, since home practice often happens without the device/mic set up."""
    __tablename__ = "home_practice_logs"

    id:            Mapped[str]           = mapped_column(String, primary_key=True, default=new_uuid)
    patient_id:    Mapped[str]           = mapped_column(ForeignKey("patients.id"), nullable=False, index=True)
    logged_at:     Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=utcnow)
    practiced_on:  Mapped[datetime]      = mapped_column(DateTime(timezone=True), nullable=False)
    duration_minutes: Mapped[int|None]   = mapped_column(Integer)
    notes:         Mapped[str|None]      = mapped_column(Text)

    patient: Mapped["Patient"] = relationship(back_populates="home_practice_logs")


class Parent(Base):
    __tablename__ = "parents"

    id: Mapped[str] = mapped_column(primary_key=True, default=lambda: __import__("uuid").uuid4().hex)
    # One parent per child (unique) — matches the current product decision;
    # relax this constraint later if multi-parent support is ever needed.
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(nullable=False)
    full_name: Mapped[str | None] = mapped_column(nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
    last_login: Mapped[datetime | None] = mapped_column(nullable=True)

    patient: Mapped["Patient"] = relationship("models.models.Patient", back_populates="parent")
