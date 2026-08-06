"""Shared safety constraints applied regardless of which policy chose
the action. Kept separate from any single policy/env file so training
(env.py) and serving (service.py) can't silently drift out of sync.
"""

# Threshold above which a child's frustration is considered high enough
# that increasing difficulty is never an acceptable action, no matter
# what any policy (rule-based, bandit, tabular Q, PPO, recurrent PPO)
# would otherwise choose. Tunable like ALP_SCALE/TARGETED_SOUND_BONUS —
# not yet calibrated against real data, start conservative.
FRUSTRATION_MASK_THRESHOLD = 0.7

# Action index for "increase difficulty" per ACTION_LABELS / the
# [-0.05, 0.0, 0.05] delta table in env.py's step().
INCREASE_DIFFICULTY_ACTION = 2
HOLD_ACTION = 1


def apply_frustration_mask(frustration: float, action: int) -> int:
    """If frustration is at/above threshold and the chosen action would
    increase difficulty, remap to hold instead. Applied identically at
    training time (env.py.step) and serving time (service.py), so every
    policy is bound by the same floor regardless of what it would have
    picked on its own."""
    if frustration >= FRUSTRATION_MASK_THRESHOLD and action == INCREASE_DIFFICULTY_ACTION:
        return HOLD_ACTION
    return action
