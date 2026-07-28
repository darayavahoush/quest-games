# Chime

Speech-sound practice game module for VaakSiddhi, designed to merge into **BreathQuest**
as a second "world" once both are ready. This repo is deliberately structured so that
merge is a matter of dropping folders in and renaming a few fields — not a rewrite.

## Setup

```bash
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install --upgrade pip
pip install -r requirements.txt   # audio feature work — fast, no torch
pytest tests/ -v                  # confirm the skeleton runs
```

Only install the DRL stack once you're ready to train the agent (pulls in torch,
sizeable download):

```bash
pip install -r requirements-drl.txt
```

## Structure

```
audio_features/       five phoneme-specific extractors (aa, oo, ma, fa, ha)
word_level/           ASR-based word matching (used by the backend's word-scoring endpoint)
schemas/              the integration contract — see below
simulator/            synthetic child model for training the DRL agent before real data exists
agent/                baseline agents (rule-based, bandit, tabular Q) + PPO training + evaluation
retraining/           real-data pipeline: event storage, simulator recalibration, retrain trigger
backend/              FastAPI server — the first real backend, see below
frontend_prototype/   six playable HTML games + a level-select hub
tests/                sanity tests against synthetic audio and the retraining pipeline
```

## Moving past the prototype stage: the backend

`backend/main.py` is a real, tested FastAPI server — not another prototype layer. It wires
directly into the already-built Python pieces rather than duplicating them:

| Endpoint | Wraps |
|---|---|
| `POST /events` | `retraining/data_store.py` — logs a real session event |
| `GET /events/{child_id}` | same, for retrieval (therapist dashboard groundwork) |
| `GET /difficulty/{child_id}/{level_id}` | a server-authoritative difficulty decision from a child's real recent event history — not the single-attempt-timing proxy the client-side JS agents currently use |
| `POST /village-builder/score-word` | `word_level/asr_match.py` — word-matching for Village Builder |

Run it locally:
```bash
pip install -r requirements-backend.txt
uvicorn backend.main:app --reload --port 8001
```

**`frontend_prototype/village_builder.html` is the first level actually wired to it** —
it logs every attempt to `/events` and scores each word via `/village-builder/score-word`,
falling back to an equivalent local JS implementation if the backend isn't running (so the
game still works standalone, it just doesn't persist anything). CORS is wide open
(`allow_origins=["*"]`) for local development — lock this down before any real deployment.

**Honest scope of "backend" right now**: this is a working MVP, not a production system.
No auth (child IDs are a random string stored in `localStorage`, not real accounts), no
deployment config, SQLite not Postgres, CORS wide open. It's the real foundation the other
five games can be wired to next (each would need the same `logEventToBackend`/backend-call
pattern `village_builder.html` uses), not a finished product.

## Relationship to BreathQuest

Chime and BreathQuest are **two separate games**, each with their own levels and
mechanics, that will live on **one shared site** — same auth, same database, same
deployment. They don't reuse each other's game engines or visuals.

**Chime's own levels:**

| Level | Extractor | Mechanic |
|---|---|---|
| aa | `audio_features/vowel_loudness.py` | Rocket Launch — sustained loud "aaa" powers a rocket up |
| oo | `audio_features/vowel_quality.py` | Submarine Dive — held, rounded "oo" dives deeper |
| ma | `audio_features/syllable_rhythm.py` | Drum Island — each clear "ma" hits a drum on the beat |
| fa | `audio_features/frication.py` | Wind Chime Garden — continuous "ffff" spins a garden of chimes, ringing notes |
| ha | `audio_features/aspiration_burst.py` | Bubble Wrap Pop — a "ha" burst pops a bubble on a filling sheet |
| word | `word_level/asr_match.py` | Village Builder — correct pronunciation places a building piece |

**Every extractor returns the same `FeatureResult` shape** (`audio_features/common.py`):
`score` (0-1, drives the on-screen mechanic directly), `is_valid_attempt`, `raw_features`
(diagnostics for the DRL agent + therapist dashboard) — a shared contract within
Chime itself, independent of BreathQuest.

## Integration guide (for whoever merges this into the shared site)

**`schemas/session_event.py`** defines the exact shape Chime needs written into
the shared `session_events` table (`skill_type: "phoneme"`, plus a `PhonemePayload`),
alongside BreathQuest's own rows (`skill_type: "breath"`). Do not create a second events
table — add the `skill_type` field to the existing schema and store `PhonemePayload` as
a JSON/JSONB column alongside it. Same pattern for auth/patients/sessions — one shared
identity and session model across both games, not two.

**Full baseline ladder implemented and evaluated** (`agent/baselines.py`, `agent/train_ppo.py`,
`agent/evaluate.py`): rule-based → contextual bandit → tabular Q-learning → PPO / recurrent
PPO (LSTM). Run `python -m agent.evaluate` for a real mean-reward comparison table across all
four rungs. Note: the shipped PPO/recurrent-PPO models are smoke-test trained (2000
timesteps) — see `agent/train_ppo.py --timesteps` to scale up for real results; at smoke-test
scale, the simpler baselines currently hold their own, which is itself an honest, reportable
finding about how much training the deep policy actually needs.

The `frontend_prototype/rocket_launch.html` game currently drives its live difficulty
feedback with a JS port of the rule-based agent (rung 1) — see that folder's README for why,
and what connecting the trained Q-learning/PPO models would take.

## Personalization: per-child vs. shared models

Hybrid, not one-or-the-other:
- **Tabular Q-learning is genuinely per-child** (`agent/child_q_store.py`). Q-tables are
  tiny, so every child gets their own, updated online from that child's real transitions
  with no batch retraining involved. New children cold-start by seeding from a shared
  "prior" table (`agent/models/q_prior.json`, built by calling `save_prior_from_agent()`
  after training against the simulator) rather than starting from nothing.
- **PPO / recurrent PPO is one shared model, not per-child.** A full neural policy needs far
  more data than any single child will realistically generate — a separate network per child
  would be badly overfit or permanently stuck at cold start. Personalization for the deep
  policy comes from the *state* it's conditioned on (that child's own rolling success rate,
  frustration signal), not from separate weights per child.

## Retraining on real data

`retraining/` implements the "recalibrate + retrain when enough new data exists" pipeline:

- `retraining/data_store.py` — local SQLite store for real session events (no backend exists
  yet for Chime, so this is dependency-free and local; swap for the real Postgres
  `session_events` table, already shaped in `schemas/session_event.py`, once one exists).
- `simulator/simulator_calibration.py` — recalibrates the simulator's sampling ranges
  (skill level, learning rate, frustration sensitivity) from real logged events, replacing
  the original hand-picked guesses. Below `MIN_EVENTS_FOR_CALIBRATION` (30), falls back to
  the defaults rather than overfitting to too little data.
- `retraining/scheduler.py` — `maybe_retrain_shared_policy()` checks accumulated real events
  against a threshold (`GLOBAL_RETRAIN_THRESHOLD = 200`, pooled across all children) and, once
  crossed, recalibrates the simulator and retrains the shared PPO/recurrent-PPO policy against
  it. **Important**: PPO is on-policy and doesn't consume replayed logs directly — real data
  improves the shared policy by making the *simulator it trains against* more realistic, not
  by being fed into PPO's training loop directly. A rigorous alternative (proper offline RL —
  CQL, IQL, etc.) is a legitimate future extension, scoped out here deliberately.
- Currently retrains from scratch each time rather than warm-starting from the previous
  checkpoint — noted as a real limitation, not hidden.

**Not yet built, by design:**
- Absolute Learning Progress reward (see `agent/env.py`, marked with a TODO) — currently
  using the simpler target-success-rate reward
- Real audio calibration — all thresholds in the extractors are starting points, not
  calibrated against real child voice samples yet
- A backend endpoint serving the trained Q-learning/PPO agent's live decisions to the
  frontend (currently only the rule-based agent runs client-side)
- The frontend doesn't yet call `retraining/data_store.add_event()` or
  `agent/child_q_store.update_child_agent_from_transition()` — those exist and are tested,
  but wiring real gameplay into them needs a backend in between
