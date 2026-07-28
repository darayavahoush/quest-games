"""
Synthetic student/child performance simulator, for training the DRL agent
before real session logs exist. Deliberately simple (IRT-flavored) — the
point is to have *something* to train and iterate the agent against early,
not to be a faithful model of a real child. Swap in real logs (offline RL
fine-tuning) once available; see the project doc's Section 3 training strategy.
"""

import random
from dataclasses import dataclass, field


@dataclass
class SimulatedChild:
    skill_level: float = 0.5          # 0-1, true underlying ability, hidden from the agent
    learning_rate: float = 0.02       # how fast skill improves per successful attempt
    frustration_sensitivity: float = 0.5  # how quickly repeated failure causes disengagement
    frustration: float = 0.0          # 0-1, current state, resets somewhat each session
    history: list = field(default_factory=list)

    def attempt(self, difficulty: float) -> dict:
        """
        difficulty: 0-1, how hard the current threshold/level is relative to
        the child's skill. Returns an attempt record the agent's state can
        be built from — mirrors the fields available in a real SessionEvent.
        """
        success_prob = max(0.02, min(0.98, self.skill_level - difficulty + 0.5))
        success = random.random() < success_prob

        if success:
            self.skill_level = min(1.0, self.skill_level + self.learning_rate)
            self.frustration = max(0.0, self.frustration - 0.1)
        else:
            self.frustration = min(1.0, self.frustration + 0.1 * self.frustration_sensitivity)

        quit_now = random.random() < (self.frustration ** 2) * 0.3

        record = {"success": success, "difficulty": difficulty,
                  "frustration": self.frustration, "quit": quit_now}
        self.history.append(record)
        return record


def make_random_child(ranges=None) -> SimulatedChild:
    """
    Sample a child with varied ability/frustration profile, for training diversity.

    ranges: optional CalibratedRanges (see retraining/simulator_calibration.py).
    When provided, sampling bounds come from real session data instead of the
    original hand-picked guesses below. Defaults preserved for backward
    compatibility with existing training scripts.
    """
    if ranges is not None:
        return SimulatedChild(
            skill_level=random.uniform(ranges.skill_level_min, ranges.skill_level_max),
            learning_rate=random.uniform(ranges.learning_rate_min, ranges.learning_rate_max),
            frustration_sensitivity=random.uniform(
                ranges.frustration_sensitivity_min, ranges.frustration_sensitivity_max
            ),
        )
    return SimulatedChild(
        skill_level=random.uniform(0.2, 0.6),
        learning_rate=random.uniform(0.01, 0.04),
        frustration_sensitivity=random.uniform(0.2, 0.9),
    )
