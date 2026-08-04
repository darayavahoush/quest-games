"""
vaakmirror/agent_bridge.py — connects VaakMirror's three games (Mirror
Mirror, Tongue Tamer, Lip Sync Hero) to the same adaptive-difficulty agent
Chime and BreathQuest already use (agent.service.AgentService), pointed at
the same events DB and per-child Q-store. A kid's tabular-Q agent keeps
learning from every app they play, not just one.

VaakMirror's own difficulty knob is GameSettings.round_size (how many
sounds/attempts appear per session) rather than a 0..1 float the way
BreathQuest's levels use, so this module just translates one to the other.

Design choice: the agent's decision is surfaced to the therapist as a
*suggestion* (routers/game_settings.py's GET .../suggestion endpoint) rather
than silently overwriting GameSettings.round_size. A therapist explicitly
accepting a suggestion goes through the normal PATCH endpoint — same as if
they'd typed the number in themselves — so `updated_by` always reflects a
human decision, never "agent". Session results still get logged to the
agent on every play (routers/sessions.py) so it keeps learning either way.
"""
from agent.service import AgentService
from retraining import data_store

DB_PATH = data_store.DEFAULT_DB_PATH
agent_service = AgentService(db_path=DB_PATH, recent_window=10)

ROUND_SIZE_MIN = 4
ROUND_SIZE_MAX = 20
ROUND_SIZE_DEFAULT = 8
ROUND_SIZE_STEP = 2


def round_size_to_difficulty(round_size: int | None) -> float:
    rs = round_size if round_size is not None else ROUND_SIZE_DEFAULT
    rs = max(ROUND_SIZE_MIN, min(ROUND_SIZE_MAX, rs))
    return (rs - ROUND_SIZE_MIN) / (ROUND_SIZE_MAX - ROUND_SIZE_MIN)


def apply_action_to_round_size(round_size: int | None, action: str) -> int:
    rs = round_size if round_size is not None else ROUND_SIZE_DEFAULT
    if action == "raise":
        rs += ROUND_SIZE_STEP
    elif action == "lower":
        rs -= ROUND_SIZE_STEP
    return max(ROUND_SIZE_MIN, min(ROUND_SIZE_MAX, rs))
