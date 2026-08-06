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
from agent.reward_constants import TARGETED_SOUND_BONUS

ACTION_LABELS = ["lower", "hold", "raise"]
AGENT_MODELS_DIR = Path(__file__).resolve().parent / "models"

# Data-sufficiency thresholds for the learned rungs of the ladder. Below
# these, decide() silently downgrades to rule_based rather than letting a
# barely-seeded model (or a model that's never seen this child at all) drive
# a real difficulty decision — see decide()'s docstring for the full reasoning.
TABULAR_MIN_CHILD_EVENTS = 20  # this child's own logged events, any level


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
        # Bounded LRU-ish cache: recurrent_ppo LSTM state per child. Without
        # a cap this grows one entry per distinct child_id for the lifetime
        # of the process (server never restarts between kids), which is a
        # slow memory leak on a long-running deployment. Evicting the
        # least-recently-used entry when full is a minor correctness cost
        # (that child's next recurrent_ppo call gets episode_start=True
        # again, same as their very first call) versus unbounded growth.
        self._recurrent_states: dict = {}
        self._RECURRENT_STATES_MAX = 500
        self._pending_transitions: dict = {}

    # ------------------------------------------------------------------
    # Observation / reward
    # ------------------------------------------------------------------
    def build_obs(self, child_id: str, level_id: str):
        events = data_store.get_events(child_id=child_id, db_path=self.db_path)
        level_events = [e for e in events if e["level_id"] == level_id]
        recent = level_events[-self.recent_window:]

        if not recent:
            return np.array([0.5, 0.5, 0.0, 0.0, 0.0], dtype=np.float32), 0

        valid = [e for e in recent if e["is_valid_attempt"]]
        success_rate = (sum(1 for e in valid if e["score"] >= 0.6) / len(recent)) if recent else 0.0
        last_threshold = recent[-1].get("threshold_at_time")
        difficulty = last_threshold if last_threshold is not None else 0.5
        frustration = sum(1 for e in recent if e["quit_flag"]) / len(recent)
        # severity_numeric / is_targeted_sound are flattened onto each event
        # row at logging time (see agent/diagnostic_client.py and
        # routers/chime.py|breath_agent.py) rather than fetched live here —
        # build_obs stays a pure function of already-logged data, no
        # cross-service HTTP call on this hot path. `.get(...)` with a
        # fallback covers rows logged before this migration ran.
        severity_numeric = recent[-1].get("severity_numeric") or 0.0
        is_targeted_sound = 1.0 if recent[-1].get("is_targeted_sound") else 0.0

        return np.array(
            [success_rate, difficulty, frustration, severity_numeric, is_targeted_sound],
            dtype=np.float32,
        ), len(recent)

    def compute_reward(self, obs, next_obs, quit_flag: bool) -> float:
        old_success_rate = float(obs[0])
        new_success_rate = float(next_obs[0])
        frustration = float(next_obs[2])
        is_targeted_sound = float(next_obs[4]) if len(next_obs) > 4 else 0.0
        reward = self.live_alp_scale * abs(new_success_rate - old_success_rate)
        reward -= frustration * 0.5
        if is_targeted_sound:
            # Mirrors agent/env.py's simulated bonus so live and simulated
            # reward stay consistent — see agent/reward_constants.py.
            reward += TARGETED_SOUND_BONUS
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
    # Data-sufficiency gate — decides whether the *requested* policy is
    # actually safe to run yet, separately from whether there's enough
    # recent history to make any decision at all (that's the n_events < 3
    # check in decide() below, which applies to every policy including
    # rule_based).
    # ------------------------------------------------------------------
    def _downgrade_reason(self, child_id: str, policy: str) -> Optional[str]:
        """None if `policy` is safe to run as requested; otherwise a
        human-readable reason it's being downgraded to rule_based instead."""
        if policy == "bandit":
            return (
                "bandit is retired from production selection: eval showed it "
                "underperforming rule_based on ALP, frustration, and quit rate "
                "despite 300 training episodes (35.55 vs. 47.42) — a stateless "
                "contextual bandit is a structural mismatch for this reward "
                "(ALP is path-dependent, frustration accumulates across steps), "
                "not a tuning problem, so it stays out of the servable set"
            )

        if policy == "tabular_q":
            from agent.child_q_store import Q_TABLES_DIR
            child_events = data_store.count_events(child_id=child_id, db_path=self.db_path)
            has_own_table = (Q_TABLES_DIR / f"{child_id}.json").exists()
            if child_events < TABULAR_MIN_CHILD_EVENTS or not has_own_table:
                return (
                    f"tabular_q needs {TABULAR_MIN_CHILD_EVENTS}+ of this child's own logged "
                    f"events and their own persisted Q-table before it's trusted over the "
                    f"simulator-seeded prior (this child has {child_events} events and "
                    f"{'does' if has_own_table else 'does not'} have their own table yet)"
                )
            return None

        if policy in ("ppo", "recurrent_ppo"):
            checkpoint = data_store.get_checkpoint("global", db_path=self.db_path)
            if checkpoint is None:
                return (
                    f"{policy} has never been retrained against real (calibrated) data — "
                    "only the initial simulator-only model exists — so it isn't trusted yet"
                )
            return None

        return None

    # ------------------------------------------------------------------
    # Main entry point — mirrors chime.py's old agent_decide handler
    # ------------------------------------------------------------------
    def decide(self, child_id: str, level_id: str,
               policy: Literal["rule_based", "bandit", "tabular_q", "ppo", "recurrent_ppo"] = "tabular_q"):
        obs, n_events = self.build_obs(child_id, level_id)

        if n_events < 3:
            return {
                "policy": "rule_based", "requested_policy": policy, "action": "hold",
                "n_events_considered": n_events,
                "message": "Not enough recent attempts yet — holding difficulty steady.",
                "downgrade_reason": (
                    None if policy == "rule_based"
                    else "fewer than 3 recent attempts for this level — holding steady regardless of policy"
                ),
            }

        effective_policy = policy
        downgrade_reason = self._downgrade_reason(child_id, policy) if policy != "rule_based" else None
        if downgrade_reason is not None:
            effective_policy = "rule_based"

        if effective_policy == "rule_based":
            from agent.baselines import RuleBasedAgent
            action_idx = RuleBasedAgent().act(obs)

            if policy == "tabular_q":
                # Downgraded — but still track this as a tabular_q transition
                # so the child's own Q-table keeps warming up online from
                # real events even while decisions are served via
                # rule_based. Without this, a child with no persisted table
                # yet could never accumulate one: _downgrade_reason above
                # requires a persisted table to trust tabular_q, but that
                # table is only ever written from a pending transition set
                # in this function — so a strictly-gated branch would lock
                # every new child out of tabular_q permanently instead of
                # just until they're warmed up.
                from agent.child_q_store import load_child_agent
                tabular_action_idx = load_child_agent(child_id).act(obs)
                self._pending_transitions[(child_id, level_id)] = {"obs": obs, "action": tabular_action_idx}

        elif effective_policy == "bandit":
            action_idx = self._get_shared_bandit().act(obs)

        elif effective_policy == "tabular_q":
            from agent.child_q_store import load_child_agent
            action_idx = load_child_agent(child_id).act(obs)
            self._pending_transitions[(child_id, level_id)] = {"obs": obs, "action": action_idx}

        elif effective_policy == "ppo":
            model = self._get_ppo_model()
            action_idx, _ = model.predict(obs, deterministic=True)
            action_idx = int(action_idx)

        elif effective_policy == "recurrent_ppo":
            model = self._get_recurrent_ppo_model()
            lstm_state = self._recurrent_states.get(child_id)
            episode_start = np.array([child_id not in self._recurrent_states])
            action_arr, lstm_state = model.predict(
                obs.reshape(1, -1), state=lstm_state, episode_start=episode_start, deterministic=True,
            )
            # Evict oldest entry before inserting if at capacity. dict
            # preserves insertion order in Python 3.7+; re-inserting on
            # every hit (pop+set) would make this a true LRU, but plain
            # insertion-order eviction is enough here — recurrent_ppo is
            # the least-used rung (see _downgrade_reason), so pathological
            # access patterns are unlikely.
            if child_id not in self._recurrent_states and len(self._recurrent_states) >= self._RECURRENT_STATES_MAX:
                oldest_child_id = next(iter(self._recurrent_states))
                del self._recurrent_states[oldest_child_id]
            self._recurrent_states[child_id] = lstm_state
            action_idx = int(action_arr[0])

        else:
            raise ValueError(f"Unknown policy: {policy}")

        from agent.safety import apply_frustration_mask
        action_idx = apply_frustration_mask(obs[2], action_idx)

        action = ACTION_LABELS[action_idx]
        return {
            "policy": effective_policy, "requested_policy": policy, "action": action,
            "n_events_considered": n_events, "message": action_message(action),
            "downgrade_reason": downgrade_reason,
        }
