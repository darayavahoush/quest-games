"""
agent/service.py — the adaptive-difficulty agent, factored out of
routers/chime.py so it isn't Chime-specific anymore.

This is the exact rule-based -> contextual-bandit -> tabular-Q ->
PPO/RecurrentPPO ladder chime's `/chime/agent/decide/{level_id}` already
used, wrapped in a class so a second caller (routers/breath_agent.py, for
BreathQuest's own breathing levels) can reuse it instead of re-implementing
it. Both callers point at the same data_store DB and the same per-child
Q-store (agent/child_q_store.py keys tables by child_id only, not by
child_id+game) — so a child's tabular-Q agent genuinely generalizes across
Chime's phoneme levels and BreathQuest's breath levels, the same one
"skill" of knowing when to raise/hold/lower difficulty for that kid.

level_id strings must stay unique across games for _build_obs's per-level
windowing to make sense (they already do: Chime uses ids like
"rocket_launch"/"wind_chime_garden"/... and BreathQuest uses
"balloon"/"candle"/"dandelion"/"dragon"/"float_rider"/"pinwheel").
"""

from pathlib import Path
from typing import Literal, Optional

import numpy as np

from retraining import data_store

ACTION_LABELS = ["lower", "hold", "raise"]
AGENT_MODELS_DIR = Path(__file__).resolve().parent / "models"


def action_message(action: str) -> str:
    return {
        "raise": "Doing great! Let's raise the challenge a little.",
        "lower": "Let's ease up a bit so this feels achievable.",
        "hold": "Good steady progress — holding difficulty steady.",
    }[action]


class AgentService:
    """One instance per (db_path) is enough — state below is all keyed by
    (child_id, level_id) or child_id, so a single shared instance is safe
    to use across every game that calls into it."""

    def __init__(self, db_path=None, recent_window: int = 10, live_alp_scale: float = 4.0):
        self.db_path = db_path or data_store.DEFAULT_DB_PATH
        self.recent_window = recent_window
        self.live_alp_scale = live_alp_scale

        self._ppo_model = None
        self._recurrent_ppo_model = None
        self._shared_bandit_agent = None
        self._recurrent_states: dict = {}
        self._pending_transitions: dict = {}

    # ------------------------------------------------------------------
    # Observation / reward
    # ------------------------------------------------------------------
    def build_obs(self, child_id: str, level_id: str):
        events = data_store.get_events(child_id=child_id, db_path=self.db_path)
        level_events = [e for e in events if e["level_id"] == level_id]
        recent = level_events[-self.recent_window:]

        if not recent:
            return np.array([0.5, 0.5, 0.0], dtype=np.float32), 0

        valid = [e for e in recent if e["is_valid_attempt"]]
        success_rate = (sum(1 for e in valid if e["score"] >= 0.6) / len(recent)) if recent else 0.0
        last_threshold = recent[-1].get("threshold_at_time")
        difficulty = last_threshold if last_threshold is not None else 0.5
        frustration = sum(1 for e in recent if e["quit_flag"]) / len(recent)

        return np.array([success_rate, difficulty, frustration], dtype=np.float32), len(recent)

    def compute_reward(self, obs, next_obs, quit_flag: bool) -> float:
        old_success_rate = float(obs[0])
        new_success_rate = float(next_obs[0])
        frustration = float(next_obs[2])
        reward = self.live_alp_scale * abs(new_success_rate - old_success_rate)
        reward -= frustration * 0.5
        if quit_flag:
            reward -= 1.0
        return float(reward)

    def simple_difficulty_heuristic(self, child_id: str, level_id: str):
        """Non-learning fallback — same thresholds chime's `/difficulty/{level_id}`
        used, available to any caller without needing 3+ events for the
        trained ladder."""
        events = data_store.get_events(child_id=child_id, db_path=self.db_path)
        level_events = [e for e in events if e["level_id"] == level_id]
        recent = level_events[-self.recent_window:]

        if len(recent) < 3:
            return {"action": "hold", "message": "Not enough recent attempts yet — holding difficulty steady.",
                    "n_events_considered": len(recent)}

        valid = [e for e in recent if e["is_valid_attempt"]]
        success_rate = sum(1 for e in valid if e["score"] >= 0.6) / len(recent)
        quit_rate = sum(1 for e in recent if e["quit_flag"]) / len(recent)

        if quit_rate > 0.3:
            action, message = "lower", "A few tough attempts recently — let's make it a bit easier."
        elif success_rate > 0.8:
            action, message = "raise", "Doing great! Let's raise the challenge a little."
        elif success_rate < 0.4:
            action, message = "lower", "Let's ease up a bit so this feels achievable."
        else:
            action, message = "hold", "Good steady progress — holding difficulty steady."

        return {"action": action, "message": message, "n_events_considered": len(recent)}

    # ------------------------------------------------------------------
    # Online tabular-Q update
    # ------------------------------------------------------------------
    def maybe_update_tabular_q_from_new_event(self, child_id: str, level_id: str, quit_flag: bool):
        key = (child_id, level_id)
        pending = self._pending_transitions.pop(key, None)
        if pending is None:
            return

        from agent.child_q_store import update_child_agent_from_transition
        next_obs, _n = self.build_obs(child_id, level_id)
        reward = self.compute_reward(pending["obs"], next_obs, quit_flag)
        update_child_agent_from_transition(
            child_id, pending["obs"], pending["action"], reward, next_obs, quit_flag,
        )

    # ------------------------------------------------------------------
    # Model loaders (lazy, cached on the instance)
    # ------------------------------------------------------------------
    def _get_ppo_model(self):
        if self._ppo_model is None:
            from stable_baselines3 import PPO
            self._ppo_model = PPO.load(str(AGENT_MODELS_DIR / "ppo_difficulty.zip"))
        return self._ppo_model

    def _get_recurrent_ppo_model(self):
        if self._recurrent_ppo_model is None:
            from sb3_contrib import RecurrentPPO
            self._recurrent_ppo_model = RecurrentPPO.load(str(AGENT_MODELS_DIR / "recurrent_ppo_difficulty.zip"))
        return self._recurrent_ppo_model

    def _get_shared_bandit(self):
        if self._shared_bandit_agent is None:
            from agent.baselines import EpsilonGreedyBanditAgent
            self._shared_bandit_agent = EpsilonGreedyBanditAgent()
        return self._shared_bandit_agent

    # ------------------------------------------------------------------
    # Main entry point — mirrors chime.py's old agent_decide handler
    # ------------------------------------------------------------------
    def decide(self, child_id: str, level_id: str,
               policy: Literal["rule_based", "bandit", "tabular_q", "ppo", "recurrent_ppo"] = "tabular_q"):
        obs, n_events = self.build_obs(child_id, level_id)

        if n_events < 3:
            return {
                "policy": policy, "action": "hold", "n_events_considered": n_events,
                "message": "Not enough recent attempts yet — holding difficulty steady.",
            }

        if policy == "rule_based":
            from agent.baselines import RuleBasedAgent
            action_idx = RuleBasedAgent().act(obs)

        elif policy == "bandit":
            action_idx = self._get_shared_bandit().act(obs)

        elif policy == "tabular_q":
            from agent.child_q_store import load_child_agent
            action_idx = load_child_agent(child_id).act(obs)
            self._pending_transitions[(child_id, level_id)] = {"obs": obs, "action": action_idx}

        elif policy == "ppo":
            model = self._get_ppo_model()
            action_idx, _ = model.predict(obs, deterministic=True)
            action_idx = int(action_idx)

        elif policy == "recurrent_ppo":
            model = self._get_recurrent_ppo_model()
            lstm_state = self._recurrent_states.get(child_id)
            episode_start = np.array([child_id not in self._recurrent_states])
            action_arr, lstm_state = model.predict(
                obs.reshape(1, -1), state=lstm_state, episode_start=episode_start, deterministic=True,
            )
            self._recurrent_states[child_id] = lstm_state
            action_idx = int(action_arr[0])

        else:
            raise ValueError(f"Unknown policy: {policy}")

        action = ACTION_LABELS[action_idx]
        return {
            "policy": policy, "action": action, "n_events_considered": n_events,
            "message": action_message(action),
        }
