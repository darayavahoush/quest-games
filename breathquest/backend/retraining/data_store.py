"""
Postgres-backed store for real session data (RL training events).

2026-08-10: migrated from SQLite (chime_sessions.db) to Postgres -- see
retraining/models.py for the schema and rationale. Function signatures
are kept identical to the old SQLite version, including accepting
(and ignoring) the old db_path kwarg, so existing call sites in
routers/breath_agent.py, routers/chime.py, vaakmirror/routers/sessions.py,
routers/dashboard.py, and retraining/scheduler.py keep working unchanged
during this migration. db_path is vestigial now -- safe to remove from
call sites in a later cleanup pass, not required for this one to be
correct.

Deliberately still sync (not async def) -- see retraining/db.py's
docstring: callers are a mix of sync def endpoints and async endpoints
using asyncio.to_thread, and keeping this sync means neither call style
needs to change.
"""

from datetime import datetime, timezone

from sqlalchemy import select, func, insert
from sqlalchemy.dialects.postgresql import insert as pg_insert

from retraining.db import SessionLocal
from retraining.models import RLTrainingEvent, RetrainCheckpoint

# Vestigial -- kept only because routers/breath_agent.py, routers/chime.py,
# routers/dashboard.py, routers/kid_progress.py, and
# vaakmirror/agent_bridge.py all do `DB_PATH = data_store.DEFAULT_DB_PATH`
# at import time and pass it through as db_path=... on every call. All
# data_store functions now ignore db_path entirely (see 2026-08-10
# Postgres migration note above), so this value is never actually used
# for anything -- it exists purely so those import-time references don't
# AttributeError. Safe to remove once those call sites are cleaned up in
# a later pass to stop referencing it.
DEFAULT_DB_PATH = None


def add_event(child_id: str, level_id: str, attempt_number: int, score: float,
              is_valid_attempt: bool, threshold_at_time: float = None, action: str = None,
              quit_flag: bool = False, raw_features: dict = None,
              severity_numeric: float = 0.0, is_targeted_sound: bool = False,
              policy_used: str = None, downgrade_reason: str = None,
              recommended_action: str = None, recommendation_message: str = None,
              db_path=None):
    with SessionLocal() as session:
        event = RLTrainingEvent(
            child_id=child_id,
            timestamp=datetime.now(timezone.utc),
            level_id=level_id,
            attempt_number=attempt_number,
            score=score,
            is_valid_attempt=is_valid_attempt,
            threshold_at_time=threshold_at_time,
            action=action,
            quit_flag=quit_flag,
            raw_features=raw_features or {},
            severity_numeric=severity_numeric,
            is_targeted_sound=is_targeted_sound,
            policy_used=policy_used,
            downgrade_reason=downgrade_reason,
            recommended_action=recommended_action,
            recommendation_message=recommendation_message,
        )
        session.add(event)
        session.commit()


def get_events(child_id: str = None, since_id: int = None, db_path=None):
    with SessionLocal() as session:
        query = select(RLTrainingEvent)
        if child_id is not None:
            query = query.where(RLTrainingEvent.child_id == child_id)
        if since_id is not None:
            query = query.where(RLTrainingEvent.id > since_id)
        query = query.order_by(RLTrainingEvent.id.asc())
        rows = session.execute(query).scalars().all()
        # Old SQLite version returned plain dicts (sqlite3.Row -> dict) --
        # callers (simulator/calibration, dashboard aggregation) expect
        # dict access, not ORM objects. Preserve that contract.
        return [
            {c.name: getattr(r, c.name) for c in RLTrainingEvent.__table__.columns}
            for r in rows
        ]


def get_latest_decision(child_id: str, db_path=None):
    """Most recent persisted recommendation for this child, across all
    levels -- for dashboard display (see routers/dashboard.py's
    get_patient_progress). Distinct from agent/service.py's
    get_last_decision(), which is in-memory, per-(child,level), and lost on
    restart; this reads the durable copy written by routers/breath_agent.py
    and routers/chime.py's log_event handlers (see 2026-08-10
    recommended_action/recommendation_message addition to RLTrainingEvent).
    Returns None if this child has no event with a recorded recommendation
    yet (e.g. fewer than 3 events so far -- decide() holds at rule_based
    with no policy recommendation to persist)."""
    with SessionLocal() as session:
        query = (
            select(RLTrainingEvent)
            .where(RLTrainingEvent.child_id == child_id)
            .where(RLTrainingEvent.recommended_action.isnot(None))
            .order_by(RLTrainingEvent.id.desc())
            .limit(1)
        )
        row = session.execute(query).scalars().first()
        if row is None:
            return None
        return {c.name: getattr(row, c.name) for c in RLTrainingEvent.__table__.columns}


def count_events(child_id: str = None, db_path=None) -> int:
    with SessionLocal() as session:
        query = select(func.count()).select_from(RLTrainingEvent)
        if child_id is not None:
            query = query.where(RLTrainingEvent.child_id == child_id)
        return session.execute(query).scalar_one()


def count_events_since(child_ids: list[str], since_iso: str, db_path=None) -> int:
    """Count events for any of the given child_ids at/after since_iso.
    child_ids should be Patient.id values -- now a real FK (see
    models.py), not just a same-value convention across a storage
    boundary like it was with SQLite."""
    if not child_ids:
        return 0
    since_dt = datetime.fromisoformat(since_iso)
    with SessionLocal() as session:
        query = select(func.count()).select_from(RLTrainingEvent).where(
            RLTrainingEvent.timestamp >= since_dt,
            RLTrainingEvent.child_id.in_(child_ids),
        )
        return session.execute(query).scalar_one()


def last_event_time(child_id: str, db_path=None):
    """Most recent event timestamp for this child, or None if they've
    never played. Used by the multi-child inactivity alert view."""
    with SessionLocal() as session:
        query = select(func.max(RLTrainingEvent.timestamp)).where(
            RLTrainingEvent.child_id == child_id
        )
        result = session.execute(query).scalar_one_or_none()
        if result is None:
            return None
        return result if result.tzinfo else result.replace(tzinfo=timezone.utc)


def get_checkpoint(scope: str, db_path=None):
    with SessionLocal() as session:
        query = select(RetrainCheckpoint).where(RetrainCheckpoint.scope == scope)
        row = session.execute(query).scalar_one_or_none()
        if row is None:
            return None
        return {
            "scope": row.scope,
            "last_retrained_at": row.last_retrained_at.isoformat(),
            "event_count_at_checkpoint": row.event_count_at_checkpoint,
        }


def set_checkpoint(scope: str, event_count: int, db_path=None):
    with SessionLocal() as session:
        stmt = pg_insert(RetrainCheckpoint).values(
            scope=scope,
            last_retrained_at=datetime.now(timezone.utc),
            event_count_at_checkpoint=event_count,
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["scope"],
            set_={
                "last_retrained_at": stmt.excluded.last_retrained_at,
                "event_count_at_checkpoint": stmt.excluded.event_count_at_checkpoint,
            },
        )
        session.execute(stmt)
        session.commit()
