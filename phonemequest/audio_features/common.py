"""
Shared contract for all phoneme feature extractors.

Every extractor returns the same shape regardless of the underlying signal
processing, so the game-loop code that consumes it (whatever drives the
Rocket/Submarine/Kite/etc. visuals) doesn't need level-specific branching.
"""

from dataclasses import dataclass, field


@dataclass
class FeatureResult:
    """
    score: 0.0-1.0 normalized value that drives the on-screen mechanic directly
           (rocket height, submarine depth, kite altitude, etc, depending on level).
    is_valid_attempt: whether this frame counts as a genuine attempt at the
           target sound at all (helps the game distinguish silence/noise from
           an actual attempt that just scored low).
    raw_features: diagnostic values specific to this phoneme, not used by the
           game mechanic directly but consumed by the DRL agent's state and
           useful for therapist-facing analytics.
    """
    score: float
    is_valid_attempt: bool
    raw_features: dict = field(default_factory=dict)
