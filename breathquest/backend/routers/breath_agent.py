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

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models.models import Patient, Therapist
from core.deps import get_current_patient, get_current_therapist
from retraining import data_store
from retraining.scheduler import run_retrain_if_due
from agent.diagnostic_client import get_diagnostic_context
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
class AgentStatusObs(BaseModel):
    success_rate: float
    difficulty: float
    frustration: float
    severity_numeric: float
    is_targeted_sound: bool


class AgentStatusOut(BaseModel):
    policy: str
    requested_policy: str
    n_events_considered: int
    downgrade_reason: Optional[str]
    obs: AgentStatusObs


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
    requested_policy: Optional[str] = None
    action: Literal["raise", "lower", "hold"]
    n_events_considered: int
    message: str
    downgrade_reason: Optional[str] = None


# ============================================================
# Events
# ============================================================
@router.post("/events", response_model=BreathEventOut)
def log_breath_event(event: BreathEventIn, background_tasks: BackgroundTasks,
                      patient: Patient = Depends(get_current_patient)):
    severity_numeric, targeted_quests = get_diagnostic_context(patient.id)
    is_targeted_sound = event.level_id in targeted_quests

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
        severity_numeric=severity_numeric,
        is_targeted_sound=is_targeted_sound,
        db_path=DB_PATH,
    )

    _agent_service.maybe_update_tabular_q_from_new_event(patient.id, event.level_id, event.quit_flag)
    # BreathQuest's own levels used to log real events without ever
    # triggering the shared-policy retrain check — only Chime did. This is
    # the fix: same shared, thread-safe trigger Chime uses.
    background_tasks.add_task(run_retrain_if_due, DB_PATH)

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


# ============================================================
# Therapist-facing, read-only agent status — GET /breath/agent/status,
# not GET /breath/agent/decide. Deliberately calls AgentService.get_status,
# never .decide(): decide() writes to _pending_transitions for tabular_q
# as a side effect (used to update that child's Q-table from a real game
# action), so a therapist "peek" view must never call decide() or it could
# corrupt an in-progress session's training data. Ownership check matches
# the pattern in routers/dashboard.py / voicehurdlerace.py — 404 (not 403)
# so this doesn't leak which patient IDs exist to a therapist probing at
# random.
# ============================================================
@router.get("/agent/status/{patient_id}", response_model=AgentStatusOut)
async def breath_agent_status(
    patient_id: str,
    level_id: str,
    policy: Literal["rule_based", "bandit", "tabular_q", "ppo", "recurrent_ppo"] = "tabular_q",
    therapist: Therapist = Depends(get_current_therapist),
    db: AsyncSession = Depends(get_db),
):
    patient_result = await db.execute(
        select(Patient).where(Patient.id == patient_id, Patient.therapist_id == therapist.id)
    )
    if not patient_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Patient not found")

    result = _agent_service.get_status(patient_id, level_id, policy)
    return AgentStatusOut(**result)
