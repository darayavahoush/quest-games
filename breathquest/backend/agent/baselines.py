"""
Baselines for the comparison ladder in the project doc (Section 3.5):
  1. rule-based        <- this file
  2. contextual bandit  <- this file
  3. tabular Q-learning  <- this file
  4. deep policy (PPO)   <- train_ppo.py

Keep these simple on purpose — the point of the ladder is that the report
shows the deep policy earning its complexity against these, not that every
baseline is heavily engineered.
"""

import random
import numpy as np


class RuleBasedAgent:
    """Fixed heuristic: raise difficulty on a streak of successes, lower on a
    streak of failures. No learning, no memory beyond the recent window."""

    def act(self, obs: np.ndarray) -> int:
        success_rate, difficulty, frustration = obs
        if frustration > 0.6:
            return 0  # lower difficulty
        if success_rate > 0.85:
            return 2  # raise difficulty
        if success_rate < 0.6:
            return 0  # lower difficulty
        return 1  # hold


class EpsilonGreedyBanditAgent:
    """Contextual bandit over a coarse discretization of (success_rate bucket,
    frustration bucket) -> action. Simple table, no bootstrapping across
    states beyond the current one."""

    def __init__(self, epsilon: float = 0.1, lr: float = 0.1, n_buckets: int = 5):
        self.epsilon = epsilon
        self.lr = lr
        self.n_buckets = n_buckets
        self.q_table = {}  # (success_bucket, frustration_bucket) -> [q_a0, q_a1, q_a2]

    def _bucket(self, obs: np.ndarray):
        success_rate, difficulty, frustration = obs
        sb = min(self.n_buckets - 1, int(success_rate * self.n_buckets))
        fb = min(self.n_buckets - 1, int(frustration * self.n_buckets))
        return (sb, fb)

    def act(self, obs: np.ndarray) -> int:
        key = self._bucket(obs)
        if key not in self.q_table:
            self.q_table[key] = [0.0, 0.0, 0.0]
        if random.random() < self.epsilon:
            return random.randint(0, 2)
        return int(np.argmax(self.q_table[key]))

    def update(self, obs: np.ndarray, action: int, reward: float):
        key = self._bucket(obs)
        if key not in self.q_table:
            self.q_table[key] = [0.0, 0.0, 0.0]
        q = self.q_table[key][action]
        self.q_table[key][action] = q + self.lr * (reward - q)


class TabularQAgent:
    """Rung 3: proper Q-learning with a Bellman update (bootstraps off the next
    state's max Q-value), unlike the bandit above which treats each state as a
    one-shot decision. This is what actually earns "learning across a horizon"
    rather than just "learning a per-state average reward" — the two look
    similar in code but are meaningfully different algorithms, which is worth
    calling out explicitly in the report."""

    def __init__(self, epsilon: float = 0.15, lr: float = 0.1, gamma: float = 0.95, n_buckets: int = 5):
        self.epsilon = epsilon
        self.lr = lr
        self.gamma = gamma
        self.n_buckets = n_buckets
        self.q_table = {}

    def _bucket(self, obs: np.ndarray):
        success_rate, difficulty, frustration = obs
        sb = min(self.n_buckets - 1, int(success_rate * self.n_buckets))
        db = min(self.n_buckets - 1, int(difficulty * self.n_buckets))
        fb = min(self.n_buckets - 1, int(frustration * self.n_buckets))
        return (sb, db, fb)  # includes difficulty in state, unlike the bandit's coarser key

    def _ensure(self, key):
        if key not in self.q_table:
            self.q_table[key] = [0.0, 0.0, 0.0]

    def act(self, obs: np.ndarray) -> int:
        key = self._bucket(obs)
        self._ensure(key)
        if random.random() < self.epsilon:
            return random.randint(0, 2)
        return int(np.argmax(self.q_table[key]))

    def update(self, obs: np.ndarray, action: int, reward: float, next_obs: np.ndarray, done: bool):
        key = self._bucket(obs)
        next_key = self._bucket(next_obs)
        self._ensure(key)
        self._ensure(next_key)
        target = reward if done else reward + self.gamma * max(self.q_table[next_key])
        q = self.q_table[key][action]
        self.q_table[key][action] = q + self.lr * (target - q)
