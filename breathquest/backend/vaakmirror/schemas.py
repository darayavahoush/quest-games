from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from vaakmirror.models import AssignmentStatus, AttemptOutcome, GameName


# --- Patients ---
# A lightweight read-only view of a BreathQuest patient — VaakMirror doesn't
# own patient data, just needs enough to label a dashboard/exercise list.


class PatientSummary(BaseModel):
    id: str
    first_name: str
    age: Optional[int] = None


# --- Sessions & attempts ---


class SessionCreate(BaseModel):
    game: GameName


class SessionOut(BaseModel):
    id: int
    patient_id: str
    game: GameName
    started_at: datetime
    ended_at: Optional[datetime]

    model_config = ConfigDict(from_attributes=True)


class AttemptCreate(BaseModel):
    sound_id: Optional[str] = None
    place: Optional[str] = None
    manner: Optional[str] = None
    voicing: Optional[str] = None
    outcome: AttemptOutcome
    score: Optional[float] = None


class AttemptOut(BaseModel):
    id: int
    session_id: int
    sound_id: Optional[str]
    place: Optional[str]
    manner: Optional[str]
    voicing: Optional[str]
    outcome: AttemptOutcome
    score: Optional[float]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# --- Dashboard ---


class CategoryAccuracy(BaseModel):
    category: str
    accuracy: float
    attempts: int


class WeeklyPoint(BaseModel):
    week: str
    accuracy: float
    attempts: int


class FlaggedGap(BaseModel):
    id: str
    title: str
    detail: str
    severity: str  # 'high' | 'medium' | 'low'
    assigned_exercise: Optional[str] = None


class DashboardOut(BaseModel):
    patient: PatientSummary
    sessions_count: int
    manner_accuracy: list[CategoryAccuracy]
    place_accuracy: list[CategoryAccuracy]
    voicing_accuracy: list[CategoryAccuracy]
    progress_over_time: list[WeeklyPoint]
    flagged_gaps: list[FlaggedGap]


# --- Exercises ---


class ExerciseTemplateOut(BaseModel):
    id: int
    title: str
    description: str
    duration_label: str
    target_categories: list[str]

    model_config = ConfigDict(from_attributes=True)


class ExerciseAssignmentOut(BaseModel):
    id: int
    patient_id: str
    status: AssignmentStatus
    assigned_at: datetime
    completed_at: Optional[datetime]
    exercise: ExerciseTemplateOut

    model_config = ConfigDict(from_attributes=True)


class AssignmentStatusUpdate(BaseModel):
    status: AssignmentStatus


class GameSettingsOut(BaseModel):
    game: str
    round_size: int | None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True


class GameSettingsUpdate(BaseModel):
    round_size: int = Field(ge=1, le=50)
