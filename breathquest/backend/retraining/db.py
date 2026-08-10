"""
retraining/db.py -- Sync Postgres engine for the RL training event store.

Deliberately separate from database.py's async engine: data_store.py's
functions (add_event, get_events, count_events, etc.) are called from
both sync def endpoints (routers/breath_agent.py's log_breath_event) and
from async endpoints via asyncio.to_thread (routers/dashboard.py) -- see
the 2026-08-10 SQLite-to-Postgres migration note in data_store.py itself.
Keeping this sync (psycopg2, not asyncpg) means every existing call site
keeps working unchanged: sync callers call it directly, async callers
keep their existing asyncio.to_thread wrapping, since a sync engine call
would otherwise block the event loop if called directly from async code.

Same DATABASE_URL as the app's main engine (database.py) -- one Postgres
database, just two different drivers/engines pointed at it, since asyncpg
and psycopg2 can't share a connection pool.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from core.config import get_settings

settings = get_settings()

# Mirrors database.py's asyncpg normalization, but for psycopg2 (sync).
# Render gives postgres:// -- psycopg2 accepts that directly, but we
# normalize to the explicit +psycopg2 form for clarity/consistency with
# the async engine's explicit +asyncpg form.
_db_url = settings.DATABASE_URL
if _db_url.startswith("postgres://"):
    _db_url = _db_url.replace("postgres://", "postgresql+psycopg2://", 1)
elif _db_url.startswith("postgresql://") and "+psycopg2" not in _db_url:
    _db_url = _db_url.replace("postgresql://", "postgresql+psycopg2://", 1)
elif "+asyncpg" in _db_url:
    # Settings default is postgresql+asyncpg://... -- swap driver for sync use.
    _db_url = _db_url.replace("+asyncpg", "+psycopg2")

engine = create_engine(_db_url, pool_pre_ping=True, pool_size=5, max_overflow=10)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)

# Table creation now happens via database.py's create_tables() (async),
# using the shared Base -- see retraining/models.py's 2026-08-10 note.
# This engine/SessionLocal is only for runtime sync queries against
# those already-created tables, not schema creation.
