"""
main.py — BreathQuest + VaakMirror FastAPI application (merged).
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import get_settings
from database import create_tables
from routers import auth, patients, sessions, dashboard, chime
from vaakmirror.routers import sessions as vm_sessions, dashboard as vm_dashboard, exercises as vm_exercises

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

# VaakMirror routers — namespaced so nothing collides with BreathQuest's
# own /sessions, /dashboard routes above (both had prefix-less "/sessions"
# etc. originally).
VM_PREFIX = "/api/v1/vaakmirror"
app.include_router(vm_sessions.router,   prefix=VM_PREFIX)
app.include_router(vm_dashboard.router,  prefix=VM_PREFIX)
app.include_router(vm_exercises.router,  prefix=VM_PREFIX)


@app.get("/health")
async def health():
    return {"status": "ok", "app": settings.APP_NAME}
