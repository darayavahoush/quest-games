"""
Chime backend — the first real server for the project, replacing the
frontend-only prototype stage. Wires directly into the already-built,
already-tested Python pieces rather than duplicating them:

  - retraining/data_store.py   -> session event logging
  - agent/baselines.py         -> difficulty decisions (rule-based, for now)
  - word_level/asr_match.py    -> word-matching for Village Builder

Run locally with:
    uvicorn backend.main:app --reload --port 8001

CORS is wide open (allow_origins=["*"]) because the frontend games are
static files served from a different origin/port during development. Lock
this down to specific origins before any real deployment.
"""

import asyncio
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Optional

import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from retraining import data_store
from word_level.asr_match import score_word_attempt

app = FastAPI(title="Chime Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Module-level so tests can override it (e.g. `main.DB_PATH = tmp_path`)
# without needing a real database file.
DB_PATH = data_store.DEFAULT_DB_PATH


# ============================================================
# Schemas
# ============================================================
class EventIn(BaseModel):
    child_id: str
    level_id: str
    attempt_number: int
    score: float
    is_valid_attempt: bool
    threshold_at_time: Optional[float] = None
    action: Optional[str] = None
    quit_flag: bool = False
    raw_features: dict = {}


class EventOut(BaseModel):
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


class WordScoreIn(BaseModel):
    transcript: str
    target_word: str
    asr_confidence: float = 1.0


class WordScoreOut(BaseModel):
    transcript: str
    confidence: float
    match_score: float
    is_valid_attempt: bool


class TranscribeOut(BaseModel):
    transcript: str
    confidence: float


class AgentDecisionOut(BaseModel):
    policy: str
    action: Literal["raise", "lower", "hold"]
    n_events_considered: int
    message: str


# ============================================================
# Health
# ============================================================
@app.get("/health")
def health():
    return {"status": "ok", "time": datetime.now(timezone.utc).isoformat()}


# ============================================================
# Session events
# ============================================================
@app.post("/events", response_model=EventOut)
def log_event(event: EventIn):
    data_store.add_event(
        child_id=event.child_id,
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

    # Completes any transition /agent/decide started for this child+level —
    # see _maybe_update_tabular_q_from_new_event() below. No-ops if no
    # decide() call preceded this event (e.g. Village Builder, which
    # doesn't call /agent/decide yet, or the very first event ever).
    _maybe_update_tabular_q_from_new_event(event.child_id, event.level_id, event.quit_flag)

    events = data_store.get_events(child_id=event.child_id, db_path=DB_PATH)
    latest = events[-1]
    return EventOut(**latest)


@app.get("/events/{child_id}", response_model=list[EventOut])
def get_events(child_id: str, level_id: Optional[str] = None):
    events = data_store.get_events(child_id=child_id, db_path=DB_PATH)
    if level_id:
        events = [e for e in events if e["level_id"] == level_id]
    return [EventOut(**e) for e in events]


# ============================================================
# Difficulty decisions — server-authoritative version of the client-side
# RuleBasedAgent JS ports. Looks at a child's real recent event history for
# a level rather than a single attempt's timing, which the frontend agents
# currently use as a proxy. Bounded action set (raise/lower/hold) so any
# frontend can interpret the delta at its own scale.
# ============================================================
RECENT_WINDOW = 10


@app.get("/difficulty/{child_id}/{level_id}", response_model=DifficultyDecision)
def get_difficulty(child_id: str, level_id: str):
    events = data_store.get_events(child_id=child_id, db_path=DB_PATH)
    level_events = [e for e in events if e["level_id"] == level_id]
    recent = level_events[-RECENT_WINDOW:]

    if len(recent) < 3:
        return DifficultyDecision(
            action="hold",
            message="Not enough recent attempts yet — holding difficulty steady.",
            n_events_considered=len(recent),
        )

    valid = [e for e in recent if e["is_valid_attempt"]]
    success_rate = sum(1 for e in valid if e["score"] >= 0.6) / len(recent)
    quit_rate = sum(1 for e in recent if e["quit_flag"]) / len(recent)

    if quit_rate > 0.3:
        return DifficultyDecision(
            action="lower",
            message="A few tough attempts recently — let's make it a bit easier.",
            n_events_considered=len(recent),
        )
    if success_rate > 0.8:
        return DifficultyDecision(
            action="raise",
            message="Doing great! Let's raise the challenge a little.",
            n_events_considered=len(recent),
        )
    if success_rate < 0.4:
        return DifficultyDecision(
            action="lower",
            message="Let's ease up a bit so this feels achievable.",
            n_events_considered=len(recent),
        )
    return DifficultyDecision(
        action="hold",
        message="Good steady progress — holding difficulty steady.",
        n_events_considered=len(recent),
    )


# ============================================================
# Village Builder word matching
# ============================================================
@app.post("/village-builder/score-word", response_model=WordScoreOut)
def score_word(payload: WordScoreIn):
    result = score_word_attempt(payload.transcript, payload.target_word, payload.asr_confidence)
    return WordScoreOut(
        transcript=result.transcript,
        confidence=result.confidence,
        match_score=result.match_score,
        is_valid_attempt=result.is_valid_attempt,
    )


# ============================================================
# Village Builder transcription — replaces the old browser-side
# SpeechRecognition flow. The frontend now records real audio (MediaRecorder)
# and posts it here; faster-whisper runs server-side and returns a
# transcript, which the frontend then sends to /village-builder/score-word
# as before. Model is lazy-loaded once per server process (first request
# pays the download/load cost) and reused for every subsequent request.
# ============================================================
_whisper_model = None
WHISPER_MODEL_SIZE = os.environ.get("CHIME_WHISPER_MODEL", "base")


def get_whisper_model():
    global _whisper_model
    if _whisper_model is None:
        from faster_whisper import WhisperModel
        _whisper_model = WhisperModel(WHISPER_MODEL_SIZE, device="cpu", compute_type="int8")
    return _whisper_model


@app.post("/village-builder/transcribe", response_model=TranscribeOut)
async def transcribe_audio(audio: UploadFile = File(...)):
    audio_bytes = await audio.read()
    if not audio_bytes:
        return TranscribeOut(transcript="", confidence=0.0)

    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        # Whisper inference is CPU-bound and blocking — running it directly
        # inside this async endpoint freezes the whole event loop for its
        # full duration, stalling every other concurrent request (other
        # games' /agent/decide and /events calls included). asyncio.to_thread
        # runs it on a worker thread instead, so one child's transcription
        # doesn't stall everyone else's gameplay.
        def _run_transcription():
            model = get_whisper_model()
            # vad_filter trims silence/non-speech before transcription —
            # console data showed clips running 1.7-2.8s for single words
            # (mostly padding), with Whisper hallucinating short common
            # words ("bye" for "ball") on that padded, ambiguous audio.
            # Filtering to just the actual speech segment fixes that.
            segments, _info = model.transcribe(
                tmp_path, language="en", beam_size=1, vad_filter=True,
            )
            return list(segments)

        segments = await asyncio.to_thread(_run_transcription)
        transcript = " ".join(s.text for s in segments).strip()
        if segments:
            avg_logprob = sum(s.avg_logprob for s in segments) / len(segments)
            # avg_logprob is typically ~[-1, 0] for confident speech and
            # drops lower for garbled/uncertain audio — rough 0-1 mapping.
            # Not calibrated against real child speech samples yet (see
            # README's "Not yet built, by design" list).
            confidence = max(0.0, min(1.0, 1.0 + avg_logprob / 2.0))
        else:
            confidence = 0.0
        return TranscribeOut(transcript=transcript, confidence=confidence)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {exc}") from exc
    finally:
        Path(tmp_path).unlink(missing_ok=True)


# ============================================================
# Trained-agent decisions — real Q-learning/PPO/recurrent-PPO policies,
# not just the rule-based heuristic /difficulty above. Builds the same
# [success_rate, difficulty, frustration] observation DifficultyEnv trains
# on, from real logged events.
#
# Honest gap: real gameplay doesn't log a frustration signal yet (that's
# the "wire retraining/child_q_store into live play" item in the README's
# "Not yet built" list) — approximated here from recent quit-rate until
# that's wired in properly.
# ============================================================
AGENT_MODELS_DIR = Path(__file__).resolve().parent.parent / "agent" / "models"
ACTION_LABELS = ["lower", "hold", "raise"]  # matches DifficultyEnv's action_space order

_ppo_model = None
_recurrent_ppo_model = None
_shared_bandit_agent = None
# Recurrent PPO needs its LSTM hidden state carried between calls (that's
# the entire point of the recurrent policy) — kept per-child in memory.
# Real limitation, stated not hidden: this resets on server restart, unlike
# the tabular Q-tables which persist to disk via agent/child_q_store.py.
_recurrent_states: dict = {}

# Online learning for the tabular-Q rung: /agent/decide records the
# (obs, action) it handed out for policy=tabular_q here; the *next* /events
# POST for that same (child_id, level_id) is treated as the outcome of that
# action, and triggers a real Bellman update via
# agent/child_q_store.update_child_agent_from_transition(). This is what
# "every kid gets their own model, updated live" actually means at runtime.
# Only tabular_q is updated online this way — PPO/recurrent-PPO are
# retrained in batches via retraining/scheduler.py instead (see that
# module's docstring for why).
_pending_transitions: dict = {}


# Live analogue of agent/env.py's Absolute Learning Progress reward. The
# simulator can reward change in a child's *true* skill_level because it's
# privileged simulator state; real gameplay only exposes observed outcomes,
# so this proxies "learning progress" with the change in rolling
# success_rate between the state /agent/decide saw and the state after the
# resulting event — coarser than the simulator's windowed skill delta, but
# the closest honest analogue available from real event data alone.
# Untuned, same caveat as agent/env.py's ALP_SCALE — and deliberately a
# separate constant, not a reuse of that one: the two operate on different
# quantities (skill_level deltas vs. success_rate deltas) with different
# natural magnitudes, so sharing a scale would be coincidental, not correct.
LIVE_ALP_SCALE = 4.0


def _compute_reward(obs, next_obs, quit_flag: bool) -> float:
    old_success_rate = float(obs[0])
    new_success_rate = float(next_obs[0])
    frustration = float(next_obs[2])
    reward = LIVE_ALP_SCALE * abs(new_success_rate - old_success_rate)
    reward -= frustration * 0.5
    if quit_flag:
        reward -= 1.0
    return float(reward)


def _maybe_update_tabular_q_from_new_event(child_id: str, level_id: str, quit_flag: bool):
    key = (child_id, level_id)
    pending = _pending_transitions.pop(key, None)
    if pending is None:
        return  # no decide() call preceded this event for this child+level — nothing to learn from yet

    from agent.child_q_store import update_child_agent_from_transition
    next_obs, _n = _build_obs(child_id, level_id)
    reward = _compute_reward(pending["obs"], next_obs, quit_flag)
    update_child_agent_from_transition(
        child_id, pending["obs"], pending["action"], reward, next_obs, quit_flag,
    )


def _action_message(action: str) -> str:
    return {
        "raise": "Doing great! Let's raise the challenge a little.",
        "lower": "Let's ease up a bit so this feels achievable.",
        "hold": "Good steady progress — holding difficulty steady.",
    }[action]


def _build_obs(child_id: str, level_id: str):
    events = data_store.get_events(child_id=child_id, db_path=DB_PATH)
    level_events = [e for e in events if e["level_id"] == level_id]
    recent = level_events[-RECENT_WINDOW:]

    if not recent:
        return np.array([0.5, 0.5, 0.0], dtype=np.float32), 0

    valid = [e for e in recent if e["is_valid_attempt"]]
    success_rate = (sum(1 for e in valid if e["score"] >= 0.6) / len(recent)) if recent else 0.0
    last_threshold = recent[-1].get("threshold_at_time")
    difficulty = last_threshold if last_threshold is not None else 0.5
    frustration = sum(1 for e in recent if e["quit_flag"]) / len(recent)  # proxy, see note above

    return np.array([success_rate, difficulty, frustration], dtype=np.float32), len(recent)


def _get_ppo_model():
    global _ppo_model
    if _ppo_model is None:
        from stable_baselines3 import PPO
        _ppo_model = PPO.load(str(AGENT_MODELS_DIR / "ppo_difficulty.zip"))
    return _ppo_model


def _get_recurrent_ppo_model():
    global _recurrent_ppo_model
    if _recurrent_ppo_model is None:
        from sb3_contrib import RecurrentPPO
        _recurrent_ppo_model = RecurrentPPO.load(str(AGENT_MODELS_DIR / "recurrent_ppo_difficulty.zip"))
    return _recurrent_ppo_model


def _get_shared_bandit():
    # Not persisted per-child (no store exists for the bandit rung, unlike
    # tabular Q) — one shared in-memory table for the server's lifetime.
    # Fine for a baseline-comparison rung; documented, not hidden.
    global _shared_bandit_agent
    if _shared_bandit_agent is None:
        from agent.baselines import EpsilonGreedyBanditAgent
        _shared_bandit_agent = EpsilonGreedyBanditAgent()
    return _shared_bandit_agent


@app.get("/agent/decide/{child_id}/{level_id}", response_model=AgentDecisionOut)
def agent_decide(
    child_id: str,
    level_id: str,
    policy: Literal["rule_based", "bandit", "tabular_q", "ppo", "recurrent_ppo"] = "tabular_q",
):
    obs, n_events = _build_obs(child_id, level_id)

    if n_events < 3:
        return AgentDecisionOut(
            policy=policy,
            action="hold",
            n_events_considered=n_events,
            message="Not enough recent attempts yet — holding difficulty steady.",
        )

    if policy == "rule_based":
        from agent.baselines import RuleBasedAgent
        action_idx = RuleBasedAgent().act(obs)

    elif policy == "bandit":
        action_idx = _get_shared_bandit().act(obs)

    elif policy == "tabular_q":
        from agent.child_q_store import load_child_agent
        action_idx = load_child_agent(child_id).act(obs)
        # Record this (obs, action) so the next /events POST for this child
        # + level completes the transition and triggers a real online
        # update — see _maybe_update_tabular_q_from_new_event() above.
        _pending_transitions[(child_id, level_id)] = {"obs": obs, "action": action_idx}

    elif policy == "ppo":
        try:
            model = _get_ppo_model()
        except FileNotFoundError as exc:
            raise HTTPException(status_code=503, detail=f"PPO model not found: {exc}") from exc
        action_idx, _ = model.predict(obs, deterministic=True)
        action_idx = int(action_idx)

    elif policy == "recurrent_ppo":
        try:
            model = _get_recurrent_ppo_model()
        except FileNotFoundError as exc:
            raise HTTPException(status_code=503, detail=f"Recurrent PPO model not found: {exc}") from exc
        lstm_state = _recurrent_states.get(child_id)
        episode_start = np.array([child_id not in _recurrent_states])
        action_arr, lstm_state = model.predict(
            obs.reshape(1, -1), state=lstm_state, episode_start=episode_start, deterministic=True,
        )
        _recurrent_states[child_id] = lstm_state
        action_idx = int(action_arr[0])

    else:
        raise HTTPException(status_code=400, detail=f"Unknown policy: {policy}")

    action = ACTION_LABELS[action_idx]
    return AgentDecisionOut(
        policy=policy,
        action=action,
        n_events_considered=n_events,
        message=_action_message(action),
    )
