"""
retraining/models.py -- Postgres models for the RL training event store.

Replaces retraining/data_store.py's SQLite tables (session_events,
retrain_checkpoints) -- see that file's original docstring: "Swap for a
proper Postgres table once there's a real backend to write to." That
backend now exists.

Deliberately NOT the same table as models.models.SessionEvent -- that one
is FK'd to GameSession and stores generic real-time gameplay telemetry
(breath_value, event_type, event_data JSON) for session detail views.
This table is a purpose-built RL training log (score, severity_numeric,
policy_used, downgrade_reason, etc.) written by BreathQuest, Chime, and
VaakMirror alike, and read by retraining/scheduler.py to train the shared
PPO/RecurrentPPO policy. Different shape, different consumer, different
lifecycle -- kept separate rather than overloading one table with two
purposes.

child_id is a real FK to patients.id here, not just a same-value
convention like it was in SQLite (see data_store.py's old
count_events_since docstring) -- Postgres gives us real enforcement.
"""

from datetime import datetime, timezone
from sqlalchemy import String, Integer, Float, Boolean, DateTime, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

# Uses the app's shared Base (database.py), not a separate declarative
# base -- these tables have a real FK to patients.id, and SQLAlchemy can
# only resolve ForeignKey("patients.id") against tables registered in the
# same metadata registry as Patient itself. A separate base here caused
# NoReferencedTableError at startup (2026-08-10) -- see main.py's
# create_tables() call, which now creates these tables too via
# Base.metadata.create_all.
from database import Base


def utcnow():
    return datetime.now(timezone.utc)


class RLTrainingEvent(Base):
    """One row per real gameplay attempt, across BreathQuest/Chime/
    VaakMirror -- the pooled pool of events retraining/scheduler.py trains
    the shared policy on. Kept as an auto-incrementing integer id (not a
    UUID like the rest of the app) to preserve the old SQLite table's
    "ORDER BY id ASC" == chronological-by-insertion behavior that
    get_events()/count_events_since() rely on."""
    __tablename__ = "rl_training_events"

    id:                 Mapped[int]           = mapped_column(Integer, primary_key=True, autoincrement=True)
    child_id:           Mapped[str]           = mapped_column(ForeignKey("patients.id"), nullable=False, index=True)
    timestamp:          Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    level_id:            Mapped[str]           = mapped_column(String, nullable=False)
    attempt_number:      Mapped[int]           = mapped_column(Integer, nullable=False)
    score:                Mapped[float]         = mapped_column(Float, nullable=False)
    is_valid_attempt:     Mapped[bool]          = mapped_column(Boolean, nullable=False)
    threshold_at_time:    Mapped[float | None]  = mapped_column(Float, nullable=True)
    action:               Mapped[str | None]    = mapped_column(String, nullable=True)
    quit_flag:            Mapped[bool]          = mapped_column(Boolean, default=False)
    raw_features:         Mapped[dict | None]   = mapped_column(JSON, nullable=True)
    severity_numeric:     Mapped[float]         = mapped_column(Float, default=0.0)
    is_targeted_sound:    Mapped[bool]          = mapped_column(Boolean, default=False)
    policy_used:          Mapped[str | None]    = mapped_column(String, nullable=True)
    downgrade_reason:     Mapped[str | None]    = mapped_column(String, nullable=True)


class RetrainCheckpoint(Base):
    """Tracks when the shared policy was last retrained and on how many
    events -- one row per scope (currently only "global" is used, per
    scheduler.py). scope is the primary key, matching the old SQLite
    table's ON CONFLICT(scope) DO UPDATE upsert behavior."""
    __tablename__ = "retrain_checkpoints"

    scope:                     Mapped[str]      = mapped_column(String, primary_key=True)
    last_retrained_at:         Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    event_count_at_checkpoint: Mapped[int]      = mapped_column(Integer, nullable=False)
