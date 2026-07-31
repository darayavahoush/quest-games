"""
models/voicehurdlerace_models.py — VoiceHurdleRace game sessions.

Deliberately NOT a new patient/therapist schema — this FKs straight into
the shared `patients` table in models/models.py, same as everything else
in the Hub. There is no bridging/lookup logic here on purpose: the old
agenti_ai router had to guess its way from a BreathQuestPatient id to a
row in a separate legacy `patients` table via player_code string
matching. That workaround only existed because three different patient
tables existed side by side; now that there's one, it isn't needed.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Integer, Float, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


def utcnow():
    return datetime.now(timezone.utc)


def new_uuid():
    return str(uuid.uuid4())


class VoiceHurdleRaceSession(Base):
    __tablename__ = "voicehurdlerace_sessions"

    id:                Mapped[str]      = mapped_column(String, primary_key=True, default=new_uuid)
    patient_id:        Mapped[str]      = mapped_column(ForeignKey("patients.id"), nullable=False, index=True)
    level_id:          Mapped[int]      = mapped_column(Integer, nullable=False)
    level_name:        Mapped[str]      = mapped_column(String(100), nullable=False)
    score:             Mapped[int]      = mapped_column(Integer, nullable=False)
    time_remaining:    Mapped[float]    = mapped_column(Float, nullable=False)
    pitch_accuracy:    Mapped[float]    = mapped_column(Float, nullable=False)
    loudness_accuracy: Mapped[float]    = mapped_column(Float, nullable=False)
    stars:             Mapped[int]      = mapped_column(Integer, nullable=False)
    created_at:        Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
