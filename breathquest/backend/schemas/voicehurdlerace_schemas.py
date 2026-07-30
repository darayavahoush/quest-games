from datetime import datetime

from pydantic import BaseModel, ConfigDict


class VoiceHurdleRaceSessionCreate(BaseModel):
    level_id: int
    level_name: str
    score: int
    time_remaining: float
    pitch_accuracy: float
    loudness_accuracy: float
    stars: int


class VoiceHurdleRaceSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    patient_id: str
    level_id: int
    level_name: str
    score: int
    time_remaining: float
    pitch_accuracy: float
    loudness_accuracy: float
    stars: int
    created_at: datetime


class LeaderboardEntryOut(BaseModel):
    session_id: str
    patient_name: str
    level_name: str
    stars: int
    created_at: datetime
