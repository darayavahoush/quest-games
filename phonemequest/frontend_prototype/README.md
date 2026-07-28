# Frontend Prototype

All six PhonemeQuest levels are playable end-to-end, plus a level-select hub:

| File | Level | Audio technique | Mechanic |
|---|---|---|---|
| `index.html` | — | — | Level-select hub (start here) |
| `rocket_launch.html` | aa | RMS loudness + pitch (autocorrelation) | Rocket Launch |
| `submarine_dive.html` | oo | LPC formants blended with loudness (loudness primary, formant match a bonus) | Submarine Dive |
| `drum_island.html` | ma | Burst detection (same proven approach as Bubble Wrap Pop) | **Firefly Jar** |
| `wind_chime_garden.html` | fa | Spectral centroid (fricative detection) | **Bubble Garden** |
| `bubble_wrap_pop.html` | ha | Burst/rise-time detection | Bubble Wrap Pop |
| `village_builder.html` | word | Browser SpeechRecognition API + backend word-scoring | **Village Builder** |

Village Builder is the newest level and the first one actually wired to the real backend
(`backend/main.py`) rather than being purely client-side — see the top-level README's
"Moving past the prototype stage" section.

Three renames worth flagging — underlying files/logic modules kept their original names
(`drum_island.html`, `wind_chime_garden.html`, `chime_garden_logic.js`) since renaming those
would ripple through the doc, schemas, and READMEs for no real benefit. Only mechanics and
on-screen branding changed:
- `ma` displays as **Firefly Jar** (previously Totem Tower, then Island Hopper)
- `fa` displays as **Bubble Garden** (previously a spinning wind-chime mechanic)

## Running any of them

Browsers block microphone access on `file://` pages (not a "secure context"). Serve over
localhost:

```bash
cd frontend_prototype
python3 -m http.server 8000
```

Then open **`http://localhost:8000/index.html`**. Allow microphone access when prompted.
Chrome/Edge/Firefox all work; Safari can be pickier about mic permissions, and Village
Builder's SpeechRecognition API specifically needs Chrome or Edge (see below).

For Village Builder to persist attempts and use the real backend for word-scoring:
```bash
pip install -r requirements-backend.txt
uvicorn backend.main:app --reload --port 8001
```
It works without the backend running too — falls back to an equivalent local JS
implementation — it just won't log anything.

## The `ma` level's real history — three iterations, worth reading honestly

1. **Totem Tower** — a rhythm-gated mechanic requiring each "ma" to land within ~±97ms of a
   target beat to register at all. Real bug: tighter than natural rhythm variability,
   especially for kids with speech-motor differences — exactly this game's target
   population. Most genuine attempts silently failed to register.
2. **Island Hopper** — removed the rhythm gate (any onset advances progress), reused a crab-
   hopping visual. Still not reliable: calibration set the burst-detection threshold based on
   the single loudest moment during calibration, not a typical attempt. Since most real
   bursts are quieter than one loud outlier, ordinary gameplay attempts often fell short.
3. **Firefly Jar** (current) — dropped rhythm/onset-detector logic entirely in favor of the
   exact same burst-tracking approach `bubble_wrap_pop.html` uses (enter/exit-burst state
   machine + `scoreBurst`), which hadn't had reliability complaints. Every clear "ma" catches
   one firefly in a jar; no rhythm timing involved at all. Also added a "How to make the
   sound" instructional panel (lips together → pop open with voice → repeat), since the
   original instructions were too thin to be useful on their own.

## Submarine Dive — also took two real fixes

- **Formant-only scoring was unresponsive.** The score required both F1 and F2 cleanly
  resolved every frame with a tight tolerance (280Hz) — fine against a clean synthetic test
  signal, too fragile against a real, messier voice; peak-picking was also stricter than
  needed (2 neighbors per side, not 1), sometimes finding zero peaks on real input.
- **Fix wasn't just loosening tolerance — it was changing what drives the score.** Formant
  matching alone, even loosened, isn't reliable enough client-side to be the sole signal.
  `computeDiveScore()` now blends a robust loudness component (always detectable) as the
  primary driver (60% weight) with formant match as a bonus (up to 40% more) — the sub now
  responds to sustained voicing even if LPC formant tracking fails on a given frame entirely,
  with better vowel shaping still rewarded as a bonus, not a requirement.
- **Ocean upgrade**: a school of small fish, swaying seaweed and coral, faint light rays from
  the surface, and a sea turtle buddy that swims in from off-screen whenever the
  encouragement message appears — so encouragement now visibly comes from a character rather
  than a plain floating caption.

## Bubble Garden — visual overhaul

Richer iridescent bubbles (shimmering hue drift, two highlight glints instead of one flat
one, roughly doubled in size), fireflies, a crescent moon, a garden-silhouette horizon, and a
proper wand shape (handle + glowing loop + soap-film shimmer) replacing the old plain ellipse
outline. Same tested `updateChimeRotation` accumulator math underneath, entirely reworked
rendering.

## Village Builder — the word level

Uses the browser's native `SpeechRecognition` API (Chrome/Edge) rather than a client-side
audio feature, since word recognition genuinely needs ASR, not a hand-built signal-processing
extractor. Says a target word, listens, compares the transcript against it via the backend's
`/village-builder/score-word` endpoint (falls back to an equivalent local Levenshtein-distance
match if the backend isn't running), and builds one house in a village skyline per correct
word. Every attempt is also logged to `/events` — this is the first level with a real, working
connection to the backend and to `retraining/data_store.py`.

**Fixed after real testing surfaced it wasn't working:**
- **Recognition locale was `en-US`, now `en-IN`.** A US-English phonetic model applied to
  Indian-accented English can badly garble otherwise-correct pronunciation — which looks
  exactly like "the game doesn't work" from the child's side, even though nothing was
  actually broken in the scoring logic.
- **Added a "hear the word" button** (🔊) using `SpeechSynthesisUtterance`, preferring an
  `en-IN` voice if the browser/OS exposes one (voice availability varies by platform — this
  degrades gracefully to the default voice if no Indian English voice is found, rather than
  failing).
- **Added manual text input** as a parallel path alongside voice — types the word, submits,
  goes through the exact same scoring/logging flow as a spoken attempt. This is useful for
  two different reasons: accessibility (works when voice input doesn't), and diagnosis (lets
  you isolate whether a problem is in speech recognition specifically or somewhere else in
  the game logic).
- **Removed the blocking "browser unsupported" screen.** Firefox and older Safari don't
  support `SpeechRecognition` — previously this fully blocked the game. Now it just skips
  starting recognition and relies on manual input, so the game works everywhere, voice input
  just isn't available on unsupported browsers.
- **Set-the-trigger-word input** (Settings panel) — types a word, it becomes the current
  target/prompt word directly. Distinct from the manual *answer* input above: one sets what
  the child is asked to say, the other is what they typed as their attempt.
- **Live mic level meter**, next to the listening indicator. `SpeechRecognition` gives zero
  visibility into whether the mic is picking up sound at all, which makes "it's not
  identifying words" undiagnosable — is the mic not hearing anything (meter stays flat), or
  is it hearing you but transcribing wrong (meter moves, words still miss)? Taps a *separate*
  `getUserMedia` stream purely for visualization, since the browser's SpeechRecognition API
  doesn't accept a custom audio source — it can't be used to actually improve recognition,
  only to diagnose what's happening.
- **`maxAlternatives` raised to 5, with the closest match to the target word picked instead
  of just the top-ranked one.** The browser's top-ranked transcript isn't always the best
  match — a correct-but-lower-confidence alternative is common on accented speech. Verified
  with a standalone logic test: given `['cot', 'cart', 'cat']` ranked by confidence against
  a target of "cat", the old code would've used "cot" (the top-ranked guess); the fix
  correctly picks "cat" from further down the list.
- **Real platform limitation, not fixable client-side**: the Web Speech API has no
  sensitivity/gain control exposed to JS — it just uses whatever the OS mic input is. If the
  meter shows the mic barely moving even when speaking normally, that's an OS/hardware input
  gain issue, not something any of the above changes can fix from inside the page.

## What's shared across all six games

- **Two-phase calibration** (aa/oo/ma/fa/ha) — 2s quiet baseline, then ~2.5s of the actual
  target sound at real effort, used to personalize each level's scoring range to that
  specific child and mic setup.
- **No-fail design.** Quiet, weak, or mismatched attempts just don't progress that attempt —
  no failure state, no red X, ever shown.
- **The agent gives feedback between attempts.** A rule-based difficulty agent (JS port of
  `agent/baselines.py`'s `RuleBasedAgent`) adjusts each level's difficulty knob between
  attempts, bounded to a safe range so it can never swing to an extreme.
- **Settings**: reduce motion, mute sounds, recalibrate mic (where applicable).
- **Synthesized sound effects** (oscillators), not external audio files.

Rocket Launch has one extra thing the others don't: speed also scales with pitch
(autocorrelation-based, unit tested against known-frequency tones), visualized as a cyan
sparkle trail separate from the loudness-driven flame — pure client-side game-feel, only the
loudness score is what would actually get logged/feed the DRL agent.

## `level_logic/` — the tested math behind each game

Every extractor's core math is unit tested in isolation before being embedded in its HTML
game (`rocket_logic.js` lives one level up, the rest are here):

- **`submarine_logic.js`** — LPC formant estimation plus `computeDiveScore()`'s
  loudness-primary blend. Tested against a synthesized formant-like signal, and includes a
  regression test proving loud, sustained voicing scores well above the real gameplay
  threshold even with zero formants detected — the actual "not working" bug, now covered.
- **`drum_logic.js`** — still has the onset-detector/rhythm-scoring functions, tested, but
  **no longer used by the shipped game** (see the `ma` history above) — kept for potential
  future use, not dead code removed silently.
- **`chime_garden_logic.js`** — spectral centroid plus `personalizeCentroidRange()`. Includes
  a regression test for a real bug: an earlier version ignored the calibrated noise floor
  and used a hardcoded constant instead.
- **`bubble_wrap_logic.js`** — peak-RMS + duration-based burst scoring, plus
  `personalizeBurstRange()`. This is the pattern Firefly Jar's detection now reuses directly.

## Agent feedback — what's real here vs. what's a stand-in

Every level's live difficulty feedback is the **rule-based agent (rung 1)**, ported to plain
JS so it runs with no backend. Tabular Q-learning and PPO/recurrent PPO are real, trained,
and evaluated (`agent/evaluate.py`) but Python-side. The backend's
`GET /difficulty/{child_id}/{level_id}` endpoint is a step toward a server-authoritative
version — currently its own simple rule-based logic over real event history, not yet the
trained models.

## Known gaps before any of these are "done"

- Submarine Dive's formant tracking is still the least proven technique even after the
  robustness fixes — only tested with synthetic signals and manual browser testing
- Only Village Builder writes to the backend/`retraining/data_store.py` — the other five
  games would need the same `logEventToBackend` pattern added to actually persist attempts
- No auth — child IDs are a random string in `localStorage`, not real accounts
- Sound effects are synthesized tones, not designed audio
- `ctx.roundRect` is used with a manual fallback (`ctx.rect`) for older browsers
