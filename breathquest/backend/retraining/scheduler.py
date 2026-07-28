"""
Retraining trigger for the shared PPO/recurrent-PPO policy.

Deliberately does NOT handle the tabular Q-agent — that one is genuinely
online (see agent/child_q_store.py) and doesn't need a batch trigger like
this at all; every real transition updates that child's table immediately.
This file is specifically for the shared deep policy, which can only
reasonably be retrained in batches.

Current behavior retrains from scratch against a freshly recalibrated
simulator each time the threshold is crossed. Warm-starting from the
previous checkpoint (continuing training rather than restarting) is a
straightforward improvement once this pipeline is validated end to end —
noted here rather than silently assumed.
"""

from . import data_store
from simulator.simulator_calibration import calibrate_from_events

GLOBAL_RETRAIN_THRESHOLD = 200  # pooled real events across all children


def maybe_retrain_shared_policy(db_path=None, timesteps: int = 20000, force: bool = False,
                                 recurrent: bool = False, models_dir: str = "agent/models"):
    kwargs = {"db_path": db_path} if db_path else {}
    checkpoint = data_store.get_checkpoint("global", **kwargs)
    total_events = data_store.count_events(**kwargs)
    events_since = total_events - (checkpoint["event_count_at_checkpoint"] if checkpoint else 0)

    if not force and events_since < GLOBAL_RETRAIN_THRESHOLD:
        return {
            "retrained": False,
            "reason": f"only {events_since} new events since last checkpoint, need {GLOBAL_RETRAIN_THRESHOLD}",
            "events_since_checkpoint": events_since,
        }

    all_events = data_store.get_events(**kwargs)
    ranges = calibrate_from_events(all_events)

    # Imported here, not at module level — checking whether retraining is
    # due shouldn't require torch/sb3 to be installed at all.
    from agent.train_ppo import train_standard_ppo, train_recurrent_ppo

    filename = "recurrent_ppo_difficulty" if recurrent else "ppo_difficulty"
    save_path = f"{models_dir}/{filename}"
    train_fn = train_recurrent_ppo if recurrent else train_standard_ppo
    train_fn(timesteps, save_path, calibrated_ranges=ranges)

    data_store.set_checkpoint("global", total_events, **kwargs)
    return {
        "retrained": True,
        "n_events_used": len(all_events),
        "calibrated_ranges": ranges,
        "model_path": save_path,
    }
