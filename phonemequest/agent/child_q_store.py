"""
Per-child tabular Q-agent persistence.

This is what "every kid gets their own model" actually means for the tabular
rung: each child gets their own small Q-table, seeded from a shared "prior"
(trained on the simulator) so a brand-new child doesn't start from nothing,
then updated online from that specific child's real transitions as they play.

Contrast with agent/train_ppo.py + retraining/scheduler.py: the deep policy
is NOT per-child (see this repo's README for why) — this file is specifically
the tabular exception.
"""

import json
from pathlib import Path

from .baselines import TabularQAgent

MODELS_DIR = Path(__file__).parent / "models"
Q_TABLES_DIR = MODELS_DIR / "q_tables"
PRIOR_PATH = MODELS_DIR / "q_prior.json"


def _key_to_str(key: tuple) -> str:
    return ",".join(str(x) for x in key)


def _str_to_key(s: str) -> tuple:
    return tuple(int(x) for x in s.split(","))


def save_q_table(q_table: dict, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    serializable = {_key_to_str(k): v for k, v in q_table.items()}
    with open(path, "w") as f:
        json.dump(serializable, f)


def load_q_table(path: Path) -> dict:
    with open(path) as f:
        serializable = json.load(f)
    return {_str_to_key(k): v for k, v in serializable.items()}


def save_prior_from_agent(agent: TabularQAgent):
    """Call this after training a TabularQAgent against the simulator (see
    agent/evaluate.py) to establish the shared cold-start prior."""
    save_q_table(agent.q_table, PRIOR_PATH)


def load_child_agent(child_id: str, **agent_kwargs) -> TabularQAgent:
    child_path = Q_TABLES_DIR / f"{child_id}.json"
    agent = TabularQAgent(**agent_kwargs)

    if child_path.exists():
        agent.q_table = load_q_table(child_path)
    elif PRIOR_PATH.exists():
        # cold start: seed from the shared prior rather than an empty table
        agent.q_table = load_q_table(PRIOR_PATH)

    return agent


def save_child_agent(child_id: str, agent: TabularQAgent):
    child_path = Q_TABLES_DIR / f"{child_id}.json"
    save_q_table(agent.q_table, child_path)


def update_child_agent_from_transition(child_id: str, obs, action: int, reward: float,
                                        next_obs, done: bool) -> TabularQAgent:
    """
    The genuinely-online update path: call this once per real transition (once
    the frontend/backend logs attempts in this shape). No batch retraining
    involved — this is what makes the tabular rung different from the PPO
    rung's threshold-triggered retraining in retraining/scheduler.py.
    """
    agent = load_child_agent(child_id)
    agent.update(obs, action, reward, next_obs, done)
    save_child_agent(child_id, agent)
    return agent
