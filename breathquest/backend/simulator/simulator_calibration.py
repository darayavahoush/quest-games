"""
Recalibrates the synthetic student simulator's parameter ranges using real
session data, rather than the hand-picked guesses originally in
student_model.py.

This is a heuristic, method-of-moments-style fit — a documented
simplification, not a hidden one. A proper Bayesian Knowledge Tracing or IRT
fit would be a legitimate future extension if more rigor is needed; this is
scoped to be buildable and defensible for now, not maximally correct.

Important design point: this is *how* real data actually improves the
shared PPO/recurrent-PPO policy. PPO is on-policy and doesn't naturally
consume replayed logs the way offline-RL algorithms do, so instead of
feeding raw logged transitions into training directly, real data recalibrates
the *environment* (this file) that PPO then trains against. The per-child
tabular Q-agent is different — it learns directly from real transitions
online, no simulator involved (see agent/child_q_store.py).
"""

import statistics
from dataclasses import dataclass


@dataclass
class CalibratedRanges:
    skill_level_min: float
    skill_level_max: float
    learning_rate_min: float
    learning_rate_max: float
    frustration_sensitivity_min: float
    frustration_sensitivity_max: float
    n_events_used: int


DEFAULT_RANGES = CalibratedRanges(
    skill_level_min=0.2, skill_level_max=0.6,
    learning_rate_min=0.01, learning_rate_max=0.04,
    frustration_sensitivity_min=0.2, frustration_sensitivity_max=0.9,
    n_events_used=0,
)

# Below this many real events, there's not enough signal to trust a
# recalibration over the original hand-picked defaults.
MIN_EVENTS_FOR_CALIBRATION = 30


def _spread(values, floor, ceil, pad):
    lo = max(floor, min(values) - pad)
    hi = min(ceil, max(values) + pad)
    if hi <= lo:
        hi = min(ceil, lo + pad)
    return lo, hi


def calibrate_from_events(events: list) -> CalibratedRanges:
    """
    events: list of dicts shaped like retraining/data_store.py rows —
    each needs child_id, attempt_number, score, is_valid_attempt, quit_flag.
    """
    if len(events) < MIN_EVENTS_FOR_CALIBRATION:
        return DEFAULT_RANGES

    by_child = {}
    for e in events:
        by_child.setdefault(e["child_id"], []).append(e)

    skill_estimates = []
    learning_rate_estimates = []
    frustration_estimates = []

    for child_id, child_events in by_child.items():
        child_events.sort(key=lambda e: e["attempt_number"])
        scores = [e["score"] for e in child_events if e["is_valid_attempt"]]
        if len(scores) < 3:
            continue

        # crude "skill" proxy: mean score across this child's valid attempts
        skill_estimates.append(statistics.mean(scores))

        # crude "learning rate" proxy: improvement from first half to second
        # half of attempts, normalized by how many attempts it took
        half = len(scores) // 2
        if half > 0:
            early = statistics.mean(scores[:half])
            late = statistics.mean(scores[half:])
            improvement = max(0.0, (late - early) / max(1, len(scores)))
            learning_rate_estimates.append(improvement)

        # crude "frustration sensitivity" proxy: how often this child's
        # attempts were flagged as a quit/abandon event
        quit_rate = sum(1 for e in child_events if e["quit_flag"]) / len(child_events)
        frustration_estimates.append(quit_rate)

    if not skill_estimates:
        return DEFAULT_RANGES

    skill_lo, skill_hi = _spread(skill_estimates, 0.05, 0.95, pad=0.1)
    lr_lo, lr_hi = _spread(learning_rate_estimates or [0.02], 0.005, 0.08, pad=0.01)
    frust_lo, frust_hi = _spread(frustration_estimates or [0.5], 0.05, 0.95, pad=0.1)

    return CalibratedRanges(
        skill_level_min=skill_lo, skill_level_max=skill_hi,
        learning_rate_min=lr_lo, learning_rate_max=lr_hi,
        frustration_sensitivity_min=frust_lo, frustration_sensitivity_max=frust_hi,
        n_events_used=len(events),
    )
