from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import children, dashboard, exercises, sessions

app = FastAPI(title="VaakMirror API", version="0.1.0")

# Wildcard origins by design: every request requires a valid BreathQuest-
# issued JWT (see app/auth.py), which is the real protection layer. An
# origin allowlist on top would mostly just add local-dev friction
# (different ports, localhost vs 127.0.0.1) without meaningfully improving
# security, since a valid token is required regardless of origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(children.router)
app.include_router(sessions.router)
app.include_router(dashboard.router)
app.include_router(exercises.router)


@app.get("/health")
def health():
    return {"status": "ok"}
