"""
main.py — BreathQuest + VaakMirror FastAPI application (merged).
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import get_settings
from database import create_tables
from routers import auth, patients, sessions, dashboard, chime, voicehurdlerace, parent, kid_progress, breath_agent, verify, billing
try:
    from vaakmirror.routers import sessions as vm_sessions, dashboard as vm_dashboard, exercises as vm_exercises, game_settings as vm_game_settings
    _VAAKMIRROR_IMPORT_ERROR = None
except Exception as e:
    # vaakmirror is a large, independently-evolving package bundled into this
    # same deploy. A single bug anywhere in its import chain should not be able
    # to take down patients/sessions/dashboard/chime — degrade to vaakmirror's
    # routes being unavailable rather than the whole app failing to boot.
    vm_sessions = vm_dashboard = vm_exercises = vm_game_settings = None
    _VAAKMIRROR_IMPORT_ERROR = str(e)
    import logging
    logging.getLogger(__name__).error(f"vaakmirror routers failed to import, its endpoints will be unavailable: {e}")

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup — creates tables for both BreathQuest's Base and VaakMirror's
    # Base (two separate metadata registries, one shared database — see
    # vaakmirror/models.py for why they're kept separate).
    await create_tables()
    yield
    # Shutdown (nothing needed for now)


app = FastAPI(
    title="BreathQuest API",
    description="Backend for BreathQuest + VaakMirror — breath-training and speech-mirroring games for kids and therapists.",
    version="1.0.0",
    lifespan=lifespan,
)
# CORS — allow the React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# BreathQuest routers
app.include_router(auth.router,      prefix="/api/v1")
app.include_router(patients.router,  prefix="/api/v1")
app.include_router(sessions.router,  prefix="/api/v1")
app.include_router(dashboard.router, prefix="/api/v1")
app.include_router(chime.router,     prefix="/api/v1")
app.include_router(breath_agent.router, prefix="/api/v1")
app.include_router(voicehurdlerace.router, prefix="/api/v1")
app.include_router(parent.router,     prefix="/api/v1")
app.include_router(kid_progress.router, prefix="/api/v1")
app.include_router(verify.router,       prefix="/api/v1")
app.include_router(billing.router,      prefix="/api/v1")

# VaakMirror routers — namespaced so nothing collides with BreathQuest's
# own /sessions, /dashboard routes above (both had prefix-less "/sessions"
# etc. originally).
VM_PREFIX = "/api/v1/vaakmirror"
if vm_sessions is not None:
    app.include_router(vm_sessions.router,   prefix=VM_PREFIX)
    app.include_router(vm_dashboard.router,  prefix=VM_PREFIX)
    app.include_router(vm_exercises.router,  prefix=VM_PREFIX)
    app.include_router(vm_game_settings.router, prefix=VM_PREFIX)
else:
    import logging
    logging.getLogger(__name__).error(
        f"Skipping vaakmirror route registration — import failed: {_VAAKMIRROR_IMPORT_ERROR}"
    )


@app.get("/health")
async def health():
    return {"status": "ok", "app": settings.APP_NAME}


# ============================================================
# Serve the built React frontend (present only in the HF Space
# Docker image — local dev still uses `npm run dev` on its own
# port, this directory won't exist then, so it's a no-op there).
# Registered LAST so it never shadows the /api/v1/* or /health
# routes above — Starlette matches routes in registration order.
# ============================================================
import os
from pathlib import Path
from fastapi import HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

FRONTEND_DIR = Path(__file__).resolve().parent / "static"

if FRONTEND_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIR / "assets")), name="frontend-assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        if full_path.startswith("api/") or full_path == "health":
            raise HTTPException(status_code=404)
        candidate = FRONTEND_DIR / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIR / "index.html")
