# VaakMirror API

FastAPI + PostgreSQL backend for VaakMirror. Stores game session results
tagged by the phonetics taxonomy (place/manner/voicing), and turns them into
the therapist/parent dashboard (category accuracy, flagged gaps, weekly
progress) and the oromotor exercise assignment system.

**This now shares BreathQuest's database and auth system rather than
standing up its own.** There's no VaakMirror login, registration, or
patient-management UI — a therapist logs into BreathQuest, a kid logs in
with their BreathQuest player_code + PIN, and that same token is used to
call VaakMirror's API too.

## How the integration actually works

- **Shared database.** VaakMirror points `DATABASE_URL` at BreathQuest's
  own Postgres database (`breathquest`, not a separate `vaakmirror` one).
  VaakMirror's tables (`vaakmirror_sessions`, `attempts`,
  `exercise_templates`, `exercise_assignments`) live alongside
  BreathQuest's (`therapists`, `patients`, `game_sessions`, etc.) in that
  same database.
- **Shared identity, not a shared table.** VaakMirror has no `Child`/
  `Patient` model of its own anymore — it references BreathQuest's
  `patients.id` (a string/UUID) directly via `ForeignKey("patients.id")`.
  This means **BreathQuest must be run/initialized first**, so its
  `patients`/`therapists` tables exist before `python -m app.seed` tries to
  create VaakMirror's tables with foreign keys pointing at them.
- **Shared auth, not shared login code.** `app/auth.py` verifies JWTs using
  the exact same `SECRET_KEY`/`ALGORITHM`/claim shape
  (`{"sub", "exp", "type": "therapist" | "patient"}`) that BreathQuest's
  `core/security.py` issues them with. VaakMirror never creates a token,
  only checks one — so `.env`'s `SECRET_KEY` here must be copied verbatim
  from BreathQuest's `.env`. If they drift apart, every request here starts
  returning 401 with no obvious cause.
- **A table name that would've collided.** BreathQuest already has a table
  called `game_sessions` (breath-strength/puffs/level data, nothing like
  VaakMirror's). VaakMirror's equivalent table is named
  `vaakmirror_sessions` specifically to avoid that collision.

## Setup

**1. Run BreathQuest first**, so `therapists`/`patients` exist in the
shared database. (Whatever BreathQuest's own setup docs say — this repo
doesn't duplicate that.)

**2. Python environment:**
```
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

**3. Environment file:**
```
cp .env.example .env
```
Then edit `.env`: set `DATABASE_URL` to match whatever BreathQuest actually
uses (check BreathQuest's own `.env`), and copy BreathQuest's `SECRET_KEY`
value in verbatim.

**4. Create VaakMirror's tables + seed the exercise library:**
```
python -m app.seed
```
If this fails mentioning a missing `patients` table, BreathQuest hasn't
been run yet — go do that first.

**5. Run the API:**
```
uvicorn app.main:app --reload --port 8000
```
If BreathQuest is *also* running on port 8000 locally, run VaakMirror on a
different port (e.g. `--port 8010`) and point the frontend's
`VITE_API_URL` at it.

## Auth model

- **Therapist token** (`type: "therapist"`) — required for the dashboard
  and for assigning exercises. `assert_therapist_owns_patient()` checks the
  patient's `therapist_id` matches before allowing access.
- **Patient token** (`type: "patient"`) — required for creating game
  sessions and logging attempts; a patient can only ever act on their own
  `patient_id` (taken from the token, never from the request).
- **Either token** — for viewing/updating a patient's assigned exercises,
  since both the therapist and the kid themself have a legitimate reason to
  see/update that list.

## Known gaps in this integration

- **Self-registered kids with no therapist** (`patients.therapist_id IS
  NULL`, from BreathQuest's `/auth/kid-register` flow) currently pass the
  ownership check for *any* therapist, since there's no owner to check
  against. This needs a real "claim this patient" step before it's safe —
  right now it's a gap, not a design decision.
- **No Alembic migrations** (unchanged from before) — schema changes mean
  re-running `Base.metadata.create_all`, which won't alter existing tables.
- **No token refresh handling on VaakMirror's side** — if a therapist's
  24-hour token or a kid's 30-day token expires mid-use, VaakMirror just
  returns 401s; there's no refresh flow, that's on the frontend to handle
  (re-prompt login).
