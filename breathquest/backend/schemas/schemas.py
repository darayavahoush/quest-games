"""
schemas/schemas.py — Pydantic v2 request/response models.
"""

from datetime import datetime
from typing import Any
from pydantic import BaseModel, EmailStr, field_validator, ConfigDict
import re


# ------------------------------------------------------------------ #
#  Auth                                                                #
# ------------------------------------------------------------------ #

class TherapistRegister(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    clinic_name: str | None = None

    @field_validator("password")
    @classmethod
    def password_strength(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class TherapistLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    therapist_id: str
    full_name: str


class KidRegisterRequest(BaseModel):
    first_name: str
    avatar: str = "chick"
    pin: str

    @field_validator("pin")
    @classmethod
    def pin_format(cls, v):
        if not re.match(r"^\d{4}$", v):
            raise ValueError("PIN must be exactly 4 digits")
        return v

    @field_validator("avatar")
    @classmethod
    def avatar_valid(cls, v):
        valid = {"chick", "dragon", "cloud", "star", "rocket", "fish"}
        if v not in valid:
            raise ValueError(f"Avatar must be one of {valid}")
        return v


class KidLoginRequest(BaseModel):
    player_code: str
    pin: str

    @field_validator("pin")
    @classmethod
    def pin_format(cls, v):
        if not re.match(r"^\d{4}$", v):
            raise ValueError("PIN must be exactly 4 digits")
        return v


class KidTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    patient_id: str
    first_name: str
    avatar: str
    player_code: str


# ------------------------------------------------------------------ #
#  Therapist                                                           #
# ------------------------------------------------------------------ #

class TherapistOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    full_name: str
    clinic_name: str | None
    is_active: bool
    created_at: datetime


# ------------------------------------------------------------------ #
#  Patient                                                             #
# ------------------------------------------------------------------ #

class PatientCreate(BaseModel):
    first_name: str
    avatar: str = "chick"
    pin: str
    age: int | None = None
    diagnosis_notes: str | None = None

    @field_validator("pin")
    @classmethod
    def pin_format(cls, v):
        if not re.match(r"^\d{4}$", v):
            raise ValueError("PIN must be exactly 4 digits")
        return v

    @field_validator("avatar")
    @classmethod
    def avatar_valid(cls, v):
        valid = {"chick", "dragon", "cloud", "star", "rocket", "fish"}
        if v not in valid:
            raise ValueError(f"Avatar must be one of {valid}")
        return v


class PatientUpdate(BaseModel):
    first_name: str | None = None
    avatar: str | None = None
    age: int | None = None
    diagnosis_notes: str | None = None
    is_active: bool | None = None


class PatientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    first_name: str
    avatar: str
    age: int | None
    is_active: bool
    created_at: datetime
    # Note: diagnosis_notes and pin_hash are NOT exposed here (therapist-only)


class PatientDetailOut(PatientOut):
    """Extended view for therapist dashboard."""
    diagnosis_notes: str | None
    total_sessions: int = 0
    total_stars: int = 0
    last_session_at: datetime | None = None


# ------------------------------------------------------------------ #
#  Session                                                             #
# ------------------------------------------------------------------ #

class SessionStart(BaseModel):
    level_id: str

    @field_validator("level_id")
    @classmethod
    def valid_level(cls, v):
        valid = {"pinwheel", "float_rider", "candle", "balloon", "dandelion", "dragon"}
        if v not in valid:
            raise ValueError(f"Invalid level_id. Must be one of {valid}")
        return v


class SessionEnd(BaseModel):
    stars_earned: int
    completed: bool
    completion_message: str | None = None
    avg_breath_strength: float | None = None
    max_breath_strength: float | None = None
    breath_consistency: float | None = None
    total_puffs: int | None = None
    lives_lost: int | None = None


class SessionEventCreate(BaseModel):
    event_type: str
    breath_value: float | None = None
    event_data: dict[str, Any] | None = None


class SessionEventBatch(BaseModel):
    """Send multiple events at once to reduce API calls during gameplay."""
    events: list[SessionEventCreate]


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    patient_id: str
    level_id: str
    started_at: datetime
    ended_at: datetime | None
    duration_seconds: float | None
    status: str
    stars_earned: int | None
    completed: bool
    avg_breath_strength: float | None
    max_breath_strength: float | None
    breath_consistency: float | None
    total_puffs: int | None
    lives_lost: int | None


# ------------------------------------------------------------------ #
#  Notes                                                               #
# ------------------------------------------------------------------ #

class NoteCreate(BaseModel):
    content: str
    session_id: str | None = None
    tags: list[str] | None = None


class NoteUpdate(BaseModel):
    content: str | None = None
    tags: list[str] | None = None


class NoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    patient_id: str
    therapist_id: str
    session_id: str | None
    content: str
    tags: list[str] | None
    created_at: datetime
    updated_at: datetime


# ------------------------------------------------------------------ #
#  Dashboard / Analytics                                               #
# ------------------------------------------------------------------ #

class LevelProgress(BaseModel):
    level_id: str
    level_name: str
    attempts: int
    best_stars: int
    avg_stars: float
    avg_breath_strength: float | None
    last_played: datetime | None


class PatientProgress(BaseModel):
    patient_id: str
    first_name: str
    avatar: str
    total_sessions: int
    total_stars: int
    max_possible_stars: int
    completion_rate: float           # 0-1
    avg_breath_strength: float | None
    improvement_trend: float | None  # positive = improving
    level_progress: list[LevelProgress]
    recent_sessions: list[SessionOut]


class DashboardSummary(BaseModel):
    total_patients: int
    active_patients: int
    sessions_this_week: int
    avg_stars_this_week: float | None
    most_improved_patient: str | None
    patients: list[PatientDetailOut]


# ------------------------------------------------------------------ #
#  Assignments ("homework")                                            #
# ------------------------------------------------------------------ #

class AssignmentCreate(BaseModel):
    game: str
    level_id: str | None = None
    title: str
    instructions: str | None = None
    due_at: datetime | None = None


class AssignmentUpdate(BaseModel):
    status: str | None = None
    title: str | None = None
    instructions: str | None = None
    due_at: datetime | None = None


class AssignmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    patient_id: str
    assigned_by: str
    game: str
    level_id: str | None
    title: str
    instructions: str | None
    status: str
    created_at: datetime
    due_at: datetime | None
    completed_at: datetime | None


# ------------------------------------------------------------------ #
#  Goals                                                               #
# ------------------------------------------------------------------ #

class GoalCreate(BaseModel):
    target_metric: str
    target_value: float
    baseline_value: float | None = None
    target_date: datetime | None = None


class GoalUpdate(BaseModel):
    target_value: float | None = None
    target_date: datetime | None = None
    achieved: bool | None = None


class GoalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    patient_id: str
    created_by: str
    target_metric: str
    target_value: float
    baseline_value: float | None
    target_date: datetime | None
    achieved: bool
    achieved_at: datetime | None
    created_at: datetime
    current_value: float | None = None   # populated at read time from SessionEvent aggregates, not stored


# ------------------------------------------------------------------ #
#  Messages                                                            #
# ------------------------------------------------------------------ #

class MessageCreate(BaseModel):
    body: str
    sender_role: str = "therapist"  # therapist or parent


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    patient_id: str
    sender_role: str
    sender_id: str | None
    body: str
    created_at: datetime
    read_at: datetime | None


# ------------------------------------------------------------------ #
#  Home practice log                                                   #
# ------------------------------------------------------------------ #

class HomePracticeLogCreate(BaseModel):
    practiced_on: datetime
    duration_minutes: int | None = None
    notes: str | None = None


class HomePracticeLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    patient_id: str
    logged_at: datetime
    practiced_on: datetime
    duration_minutes: int | None
    notes: str | None


# ------------------------------------------------------------------ #
#  Multi-child alert view                                              #
# ------------------------------------------------------------------ #

class PatientAlert(BaseModel):
    patient_id: str
    first_name: str
    days_since_last_session: int | None   # None = never played
    overdue_assignments: int
    flag: str   # "inactive" | "overdue_assignment" | "ok"


# ------------------------------------------------------------------ #
#  Weekly summary (rule-based, no LLM calls)                           #
# ------------------------------------------------------------------ #

class WeeklySummaryOut(BaseModel):
    patient_id: str
    week_start: datetime
    week_end: datetime
    narrative: str            # dense multi-sentence paragraph
    highlights: list[str]     # short chip-style facts for the UI
    stats: dict[str, Any]     # raw numbers backing the narrative, for charts
