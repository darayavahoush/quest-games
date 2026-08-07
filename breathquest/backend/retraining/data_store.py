"""
Local store for real session data.

SQLite, not Postgres: Chime doesn't have its own backend yet (it's meant to
eventually share BreathQuest's, per the project doc's Section 0), so this is
a dependency-free local store for development and early real-data
collection. Swap for a proper Postgres table once there's a real backend to
write to — schemas/session_event.py already defines that shape; this file's
row format is intentionally close to it, but flattened for SQLite.
"""

import sqlite3
import json
from pathlib import Path
from datetime import datetime, timezone
from contextlib import contextmanager

DEFAULT_DB_PATH = Path(__file__).parent / "chime_sessions.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS session_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    child_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    level_id TEXT NOT NULL,
    attempt_number INTEGER NOT NULL,
    score REAL NOT NULL,
    is_valid_attempt INTEGER NOT NULL,
    threshold_at_time REAL,
    action TEXT,
    quit_flag INTEGER DEFAULT 0,
    raw_features_json TEXT,
    severity_numeric REAL DEFAULT 0.0,
    is_targeted_sound INTEGER DEFAULT 0,
    policy_used TEXT,
    downgrade_reason TEXT
);

CREATE TABLE IF NOT EXISTS retrain_checkpoints (
    scope TEXT PRIMARY KEY,
    last_retrained_at TEXT NOT NULL,
    event_count_at_checkpoint INTEGER NOT NULL
);
"""


def _ensure_new_columns(conn):
    """Migration for chime_sessions.db files created before
    severity_numeric/is_targeted_sound/policy_used/downgrade_reason existed."""
    existing_cols = {row[1] for row in conn.execute("PRAGMA table_info(session_events)").fetchall()}
    if "severity_numeric" not in existing_cols:
        conn.execute("ALTER TABLE session_events ADD COLUMN severity_numeric REAL DEFAULT 0.0")
    if "is_targeted_sound" not in existing_cols:
        conn.execute("ALTER TABLE session_events ADD COLUMN is_targeted_sound INTEGER DEFAULT 0")
    if "policy_used" not in existing_cols:
        conn.execute("ALTER TABLE session_events ADD COLUMN policy_used TEXT")
    if "downgrade_reason" not in existing_cols:
        conn.execute("ALTER TABLE session_events ADD COLUMN downgrade_reason TEXT")


@contextmanager
def get_connection(db_path: Path = DEFAULT_DB_PATH):
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    try:
        conn.executescript(SCHEMA)
        _ensure_new_columns(conn)
        yield conn
        conn.commit()
    finally:
        conn.close()


def add_event(child_id: str, level_id: str, attempt_number: int, score: float,
              is_valid_attempt: bool, threshold_at_time: float = None, action: str = None,
              quit_flag: bool = False, raw_features: dict = None,
              severity_numeric: float = 0.0, is_targeted_sound: bool = False,
              policy_used: str = None, downgrade_reason: str = None,
              db_path: Path = DEFAULT_DB_PATH):
    with get_connection(db_path) as conn:
        conn.execute(
            """INSERT INTO session_events
               (child_id, timestamp, level_id, attempt_number, score, is_valid_attempt,
                threshold_at_time, action, quit_flag, raw_features_json,
                severity_numeric, is_targeted_sound, policy_used, downgrade_reason)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (child_id, datetime.now(timezone.utc).isoformat(), level_id, attempt_number,
             score, int(is_valid_attempt), threshold_at_time, action, int(quit_flag),
             json.dumps(raw_features or {}), severity_numeric, int(is_targeted_sound),
             policy_used, downgrade_reason),
        )


def get_events(child_id: str = None, since_id: int = None, db_path: Path = DEFAULT_DB_PATH):
    query = "SELECT * FROM session_events WHERE 1=1"
    params = []
    if child_id is not None:
        query += " AND child_id = ?"
        params.append(child_id)
    if since_id is not None:
        query += " AND id > ?"
        params.append(since_id)
    query += " ORDER BY id ASC"
    with get_connection(db_path) as conn:
        rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]


def count_events(child_id: str = None, db_path: Path = DEFAULT_DB_PATH) -> int:
    query = "SELECT COUNT(*) as c FROM session_events WHERE 1=1"
    params = []
    if child_id is not None:
        query += " AND child_id = ?"
        params.append(child_id)
    with get_connection(db_path) as conn:
        return conn.execute(query, params).fetchone()["c"]


def count_events_since(child_ids: list[str], since_iso: str, db_path: Path = DEFAULT_DB_PATH) -> int:
    """Count events for any of the given child_ids at/after since_iso.

    Used by the therapist dashboard to fold Chime activity into the
    cross-game "sessions this week" count. child_ids should be Patient.id
    values — Chime's child_id column stores those directly (see
    routers/chime.py, which authenticates via get_current_patient and
    writes patient.id as child_id), so this is a safe join by value across
    the SQLite/Postgres boundary, not a guess.
    """
    if not child_ids:
        return 0
    if not Path(db_path).exists():
        return 0
    placeholders = ",".join("?" for _ in child_ids)
    query = f"SELECT COUNT(*) as c FROM session_events WHERE timestamp >= ? AND child_id IN ({placeholders})"
    with get_connection(db_path) as conn:
        return conn.execute(query, [since_iso, *child_ids]).fetchone()["c"]


def last_event_time(child_id: str, db_path: Path = DEFAULT_DB_PATH):
    """Most recent event timestamp (as a timezone-aware datetime) for this
    child, or None if they've never played Chime. Used by the multi-child
    inactivity alert view so a kid who only plays Chime isn't wrongly
    flagged as inactive just because BreathQuest/VaakMirror have no rows
    for them."""
    if not Path(db_path).exists():
        return None
    with get_connection(db_path) as conn:
        row = conn.execute(
            "SELECT MAX(timestamp) as t FROM session_events WHERE child_id = ?",
            [child_id],
        ).fetchone()
    if not row or not row["t"]:
        return None
    from datetime import datetime, timezone
    ts = row["t"]
    dt = datetime.fromisoformat(ts)
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def get_checkpoint(scope: str, db_path: Path = DEFAULT_DB_PATH):
    with get_connection(db_path) as conn:
        row = conn.execute("SELECT * FROM retrain_checkpoints WHERE scope = ?", (scope,)).fetchone()
        return dict(row) if row else None


def set_checkpoint(scope: str, event_count: int, db_path: Path = DEFAULT_DB_PATH):
    with get_connection(db_path) as conn:
        conn.execute(
            """INSERT INTO retrain_checkpoints (scope, last_retrained_at, event_count_at_checkpoint)
               VALUES (?, ?, ?)
               ON CONFLICT(scope) DO UPDATE SET
                 last_retrained_at = excluded.last_retrained_at,
                 event_count_at_checkpoint = excluded.event_count_at_checkpoint""",
            (scope, datetime.now(timezone.utc).isoformat(), event_count),
        )
