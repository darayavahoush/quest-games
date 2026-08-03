"""
routers/breath_agent.py — extends the adaptive-difficulty agent that was
previously only wired into Chime (routers/chime.py, phoneme mini-games) so
BreathQuest's own six breathing levels (balloon/candle/dandelion/dragon/
float_rider/pinwheel) get the same rule-based -> bandit -> tabular-Q ->
PPO/RecurrentPPO ladder.

Deliberately reuses agent.service.AgentService pointed at the *same* events
DB chime.py uses (data_store.DEFAULT_DB_PATH) rather than standing up a
second store: agent/child_q_store.py's per-child Q-tables are keyed by
child_id alone, not by child_id+game, so a child's tabular-Q agent already
generalizes its "when to raise/hold/lower" judgement across both Chime and
BreathQuest levels once both log into the same place. level_id strings for
BreathQuest's levels ("balloon", "candle", ...) don't collide with Chime's
("rocket_launch", "wind_chime_garden", ...), so per-level windowing in
AgentService.build_obs still isolates each level's own recent history.

The frontend calls into this the same way Chime's RocketLaunch.jsx etc. call
into chime.py — see breathquest/frontend/src/game/lib/api.js.
"""

from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from models.models import Patient
from core.deps import get_current_patient
from retraining import data_store
from agent.service import AgentService

router = APIRouter(prefix="/breath", tags=["breath-agent"])

# Same DB the chime router writes to — see module docstring for why.
DB_PATH = data_store.DEFAULT_DB_PATH
RECENT_WINDOW = 10

_agent_service = AgentService(db_path=DB_PATH, recent_window=RECENT_WINDOW)


# ============================================================
# Schemas — same shape as chime.py's EventIn/EventOut/AgentDecisionOut,
# so the two games' event rows stay interchangeable in the shared table.
# ============================================================
class BreathEventIn(BaseModel):
    level_id: str
    attempt_number: int
    score: float
    is_valid_attempt: bool = True
    threshold_at_time: Optional[float] = None
    action: Optional[str] = None
    quit_flag: bool = False
    raw_features: dict = {}


class BreathEventOut(BaseModel):
    id: int
    child_id: str
    timestamp: str
    level_id: str
    attempt_number: int
    score: float
    is_valid_attempt: bool
    threshold_at_time: Optional[float]
    action: Optional[str]
    quit_flag: bool


class DifficultyDecision(BaseModel):
    action: Literal["raise", "lower", "hold"]
    message: str
    n_events_considered: int


class AgentDecisionOut(BaseModel):
    policy: str
    action: Literal["raise", "lower", "hold"]
    n_events_considered: int
    message: str


# ============================================================
# Events
# ============================================================
@router.post("/events", response_model=BreathEventOut)
def log_breath_event(event: BreathEventIn, patient: Patient = Depends(get_current_patient)):
    data_store.add_event(
        child_id=patient.id,
        level_id=event.level_id,
        attempt_number=event.attempt_number,
        score=event.score,
        is_valid_attempt=event.is_valid_attempt,
        threshold_at_time=event.threshold_at_time,
        action=event.action,
        quit_flag=event.quit_flag,
        raw_features=event.raw_features,
        db_path=DB_PATH,
    )

    _agent_service.maybe_update_tabular_q_from_new_event(patient.id, event.level_id, event.quit_flag)

    events = data_store.get_events(child_id=patient.id, db_path=DB_PATH)
    latest = events[-1]
    return BreathEventOut(**latest)


@router.get("/events", response_model=list[BreathEventOut])
def get_breath_events(level_id: Optional[str] = None, patient: Patient = Depends(get_current_patient)):
    events = data_store.get_events(child_id=patient.id, db_path=DB_PATH)
    if level_id:
        events = [e for e in events if e["level_id"] == level_id]
    return [BreathEventOut(**e) for e in events]


# ============================================================
# Difficulty decisions — non-learning fallback, matches chime's
# GET /chime/difficulty/{level_id}
# ============================================================
@router.get("/difficulty/{level_id}", response_model=DifficultyDecision)
def get_breath_difficulty(level_id: str, patient: Patient = Depends(get_current_patient)):
    return DifficultyDecision(**_agent_service.simple_difficulty_heuristic(patient.id, level_id))


# ============================================================
# Trained-agent decisions — full ladder, matches chime's
# GET /chime/agent/decide/{level_id}
# ============================================================
@router.get("/agent/decide/{level_id}", response_model=AgentDecisionOut)
def breath_agent_decide(
    level_id: str,
    policy: Literal["rule_based", "bandit", "tabular_q", "ppo", "recurrent_ppo"] = "tabular_q",
    patient: Patient = Depends(get_current_patient),
):
    try:
        result = _agent_service.decide(patient.id, level_id, policy)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=f"Model not found: {exc}") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return AgentDecisionOut(**result)
