"""
Gymnasium environment wrapping the student simulator, so both the tabular/
bandit baselines and a future PPO agent can be trained against the same
interface. See the project doc, Section 3.5, for the baseline ladder this
supports: rule-based -> contextual bandit -> tabular Q -> deep policy.

Reward: Absolute Learning Progress (doc Section 3.6). Rather than rewarding
proximity to a fixed target success rate, this rewards the *magnitude of
change* in the child's underlying skill level over a recent window versus
the window before it — regardless of direction. The intuition: a session
where the child isn't changing (mastered the level, or it's too hard to
make any headway) carries no learning signal either way, while genuine
movement — up or down — means the current difficulty is actually
informative.

skill_level stays hidden from the agent's observation (see
DifficultyEnv.observation_space) — this is reward shaping using privileged
simulator state, not something the trained policy gets to see directly,
same as a real deployment which can only ever observe outcomes
(success/frustration), never a child's true internal skill.

ALP_SCALE is an untuned starting point, not a calibrated constant — retune
by inspecting reward curves in agent/evaluate.py after a real training run
(the smoke-test timestep counts in agent/train_ppo.py won't reveal whether
this scale is right).
"""

import numpy as np
import gymnasium as gym
from gymnasium import spaces

from simulator.student_model import make_random_child
from agent.reward_constants import TARGETED_SOUND_BONUS

WINDOW = 5
ALP_SCALE = 20.0  # untuned — see module docstring


class DifficultyEnv(gym.Env):
    def __init__(self, episode_length: int = 50, calibrated_ranges=None):
        super().__init__()
        self.episode_length = episode_length
        self.calibrated_ranges = calibrated_ranges  # None = original hand-picked defaults
        # state: [recent success rate, current difficulty, frustration proxy,
        #         diagnostic severity, is this a targeted-sound episode]
        self.observation_space = spaces.Box(low=0.0, high=1.0, shape=(5,), dtype=np.float32)
        # actions: lower difficulty, hold, raise difficulty
        self.action_space = spaces.Discrete(3)
        self.child = None
        self.difficulty = 0.5
        self.recent = []
        self.skill_history = []
        self.step_count = 0

    def reset(self, seed=None, options=None):
        super().reset(seed=seed)
        self.child = make_random_child(self.calibrated_ranges)
        self.difficulty = 0.5
        self.recent = []
        self.skill_history = [self.child.skill_level]
        self.step_count = 0
        return self._obs(), {}

    def step(self, action):
        from agent.safety import apply_frustration_mask
        action = apply_frustration_mask(self.child.frustration, action)
        self.difficulty = float(np.clip(self.difficulty + [-0.05, 0.0, 0.05][action], 0.0, 1.0))
        record = self.child.attempt(self.difficulty)
        self.recent.append(record["success"])
        self.recent = self.recent[-WINDOW:]

        self.skill_history.append(self.child.skill_level)
        self.skill_history = self.skill_history[-(2 * WINDOW):]

        # Broken into named components (rather than one accumulated scalar)
        # so evaluate.py can report per-component magnitudes — needed to
        # actually calibrate ALP_SCALE/TARGETED_SOUND_BONUS against the
        # frustration/quit penalties from real numbers instead of guessing.
        alp_component = ALP_SCALE * self._absolute_learning_progress()
        frustration_penalty = -record["frustration"] * 0.5
        targeted_bonus = TARGETED_SOUND_BONUS if self.child.is_targeted else 0.0
        quit_penalty = -1.0 if record["quit"] else 0.0
        reward = alp_component + frustration_penalty + targeted_bonus + quit_penalty

        self.step_count += 1
        terminated = record["quit"]
        truncated = self.step_count >= self.episode_length
        info = {
            "alp_component": alp_component,
            "frustration_penalty": frustration_penalty,
            "targeted_bonus": targeted_bonus,
            "quit_penalty": quit_penalty,
        }
        return self._obs(), reward, terminated, truncated, info

    def _absolute_learning_progress(self) -> float:
        """Magnitude of change between the mean skill_level over the most
        recent WINDOW steps and the WINDOW before that. Zero until there's
        enough history for both windows (cold start, mirrors how _obs()
        also defaults before self.recent fills up)."""
        if len(self.skill_history) < 2 * WINDOW:
            return 0.0
        recent_window = self.skill_history[-WINDOW:]
        prior_window = self.skill_history[-2 * WINDOW:-WINDOW]
        return abs(float(np.mean(recent_window)) - float(np.mean(prior_window)))

    def _obs(self):
        success_rate = float(np.mean(self.recent)) if self.recent else 0.5
        return np.array([
            success_rate, self.difficulty, self.child.frustration,
            self.child.severity, float(self.child.is_targeted),
        ], dtype=np.float32)
