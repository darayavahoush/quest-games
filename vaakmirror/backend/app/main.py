from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import create_tables
from app.routers import dashboard, exercises, sessions


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Only creates VaakMirror's own tables (Base.metadata here doesn't know
    # about BreathQuest's patients/therapists) — those must already exist,
    # same requirement seed.py documents. Safe to call every startup:
    # create_all is a no-op for tables that already exist.
    await create_tables()
    yield


app = FastAPI(title="VaakMirror API", version="0.1.0", lifespan=lifespan)

# Restricted to CORS_ORIGINS from .env — a valid BreathQuest-issued JWT is
# still the real gate on every route (see app/auth.py), but there's no
# reason to leave this wide open now that the env var is actually wired up.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Prefixed as a group so nothing collides with BreathQuest once both are
# mounted on one app — the prefix-less routers (sessions/dashboard/
# exercises) all get it, composed automatically by FastAPI on top of
# whatever prefix each router already declares. Patient/child creation
# lives in BreathQuest's own /patients endpoints (routers/patients.py) —
# VaakMirror never owned that data, so there's no equivalent route here.
API_PREFIX = "/api/v1/vaakmirror"
app.include_router(sessions.router, prefix=API_PREFIX)
app.include_router(dashboard.router, prefix=API_PREFIX)
app.include_router(exercises.router, prefix=API_PREFIX)


@app.get("/health")
def health():
    return {"status": "ok"}
