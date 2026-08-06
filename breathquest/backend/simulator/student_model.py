"""
Synthetic student/child performance simulator, for training the DRL agent
before real session logs exist. Deliberately simple (IRT-flavored) — the
point is to have *something* to train and iterate the agent against early,
not to be a faithful model of a real child. Swap in real logs (offline RL
fine-tuning) once available; see the project doc's Section 3 training strategy.
"""

import math
import random
from dataclasses import dataclass, field


@dataclass
class SimulatedChild:
    skill_level: float = 0.5          # 0-1, true underlying ability, hidden from the agent
    learning_rate: float = 0.02       # how fast skill improves per successful attempt
    frustration_sensitivity: float = 0.5  # how quickly repeated failure causes disengagement
    frustration: float = 0.0          # 0-1, current state, resets somewhat each session
    severity: float = 0.0             # 0-1, diagnostic severity proxy — observable to the agent
    is_targeted: bool = False         # whether this episode is on a targeted-sound quest
    history: list = field(default_factory=list)

    def attempt(self, difficulty: float) -> dict:
        """
        difficulty: 0-1, how hard the current threshold/level is relative to
        the child's skill. Returns an attempt record the agent's state can
        be built from — mirrors the fields available in a real SessionEvent.
        """
        # Logistic (2PL-style IRT) curve instead of a raw linear clip — gives
        # a smooth S-shaped probability transition around the skill/difficulty
        # boundary rather than a flat linear ramp, closer to what the module
        # docstring already claims ("IRT-flavored"). STEEPNESS controls how
        # sharply probability transitions near skill == difficulty; 4.0 gives
        # a reasonably sharp but not knife-edge curve over the 0-1 domain.
        STEEPNESS = 4.0
        success_prob = 1.0 / (1.0 + math.exp(-STEEPNESS * (self.skill_level - difficulty)))
        success = random.random() < success_prob

        if success:
            self.skill_level = min(1.0, self.skill_level + self.learning_rate)
            self.frustration = max(0.0, self.frustration - 0.1)
        else:
            self.frustration = min(1.0, self.frustration + 0.1 * self.frustration_sensitivity)
            # Skill can regress on failure, not just plateau — real kids
            # backslide under sustained struggle, and without this, Absolute
            # Learning Progress (which rewards |change| regardless of
            # direction) never actually sees a negative-direction case to
            # learn from. Scaled by frustration_sensitivity (more frustration-
            # prone kids backslide more under failure) and deliberately
            # smaller than learning_rate — losing ground is modeled as harder
            # than gaining it, not symmetric.
            regression = self.learning_rate * 0.3 * self.frustration_sensitivity
            self.skill_level = max(0.0, self.skill_level - regression)

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

    severity and is_targeted are sampled independently of `ranges` (which
    has no severity-related fields yet — a natural follow-up once real
    diagnostic data is available to calibrate against). learning_rate and
    frustration_sensitivity are then deliberately *correlated* with severity
    — a soft skew of the sampling range, not a hard function, so real
    variance is preserved — rather than sampled fully independently as
    before. Once severity becomes an observable input to the policy
    (see agent/env.py's observation space), training against children whose
    severity is statistically meaningless relative to their other traits
    would teach the policy nothing useful from that dimension.
    """
    severity = random.uniform(0.0, 1.0)
    is_targeted = random.random() < 0.4  # ~40% of synthetic episodes are on a targeted sound

    if ranges is not None:
        skill_level = random.uniform(ranges.skill_level_min, ranges.skill_level_max)
        lr_min, lr_max = ranges.learning_rate_min, ranges.learning_rate_max
        fs_min, fs_max = ranges.frustration_sensitivity_min, ranges.frustration_sensitivity_max
    else:
        skill_level = random.uniform(0.2, 0.6)
        lr_min, lr_max = 0.01, 0.04
        fs_min, fs_max = 0.2, 0.9

    # More severe -> lower learning_rate ceiling (learns a bit slower)
    lr_span = lr_max - lr_min
    lr_ceiling = max(lr_min, lr_max - severity * lr_span * 0.5)
    learning_rate = random.uniform(lr_min, lr_ceiling)

    # More severe -> higher frustration_sensitivity floor (frustrates a bit more easily)
    fs_span = fs_max - fs_min
    fs_floor = min(fs_max, fs_min + severity * fs_span * 0.5)
    frustration_sensitivity = random.uniform(fs_floor, fs_max)

    return SimulatedChild(
        skill_level=skill_level,
        learning_rate=learning_rate,
        frustration_sensitivity=frustration_sensitivity,
        severity=severity,
        is_targeted=is_targeted,
    )
