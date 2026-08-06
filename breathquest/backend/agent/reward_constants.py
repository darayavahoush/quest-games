"""
Shared reward-shaping constants for the targeted-sound bonus, used by both
agent/env.py (simulated training) and agent/service.py (live reward
computation) so the two stay numerically consistent.
"""

# UNTUNED — set a real value via agent/evaluate.py after a real training run.
TARGETED_SOUND_BONUS = 0.3
