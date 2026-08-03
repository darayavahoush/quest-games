// Maps the adaptive-difficulty agent's 0..1 difficulty value onto a level's
// own constants (a puff threshold, a target-zone width, a goal amount...).
// 0.5 is always the original hand-tuned baseline; 0 and 1 are the safe
// outer bounds a level author picks per-knob. Same idea as chime's
// RocketLaunch.jsx local DIFFICULTY_AGENT.apply(), generalized so every
// BreathQuest level can use one small helper instead of its own copy.

export const DEFAULT_DIFFICULTY = 0.5

export function scaleByDifficulty(difficulty, easierValue, baseValue, harderValue) {
  const d = clamp01(difficulty ?? DEFAULT_DIFFICULTY)
  if (d < 0.5) return easierValue + (baseValue - easierValue) * (d / 0.5)
  return baseValue + (harderValue - baseValue) * ((d - 0.5) / 0.5)
}

export function clamp01(v) {
  return Math.max(0, Math.min(1, v))
}

// Safe-range local nudge, used before a level starts (server round trip)
// and as a fallback if the backend is unreachable — mirrors chime's
// RocketLaunch.jsx DIFFICULTY_AGENT.apply(), generalized to any level.
const STEP = 0.08
const SAFE_RANGE = [0.15, 0.85]

export function applyAction(difficulty, action) {
  let next = clamp01(difficulty ?? DEFAULT_DIFFICULTY)
  if (action === 'raise') next += STEP
  if (action === 'lower') next -= STEP
  return Math.max(SAFE_RANGE[0], Math.min(SAFE_RANGE[1], next))
}

export function loadStoredDifficulty(levelId) {
  const raw = localStorage.getItem(`bq_difficulty_${levelId}`)
  const parsed = raw !== null ? parseFloat(raw) : NaN
  return Number.isFinite(parsed) ? clamp01(parsed) : DEFAULT_DIFFICULTY
}

export function saveStoredDifficulty(levelId, difficulty) {
  localStorage.setItem(`bq_difficulty_${levelId}`, String(clamp01(difficulty)))
}

export function loadAttemptNumber(levelId) {
  const raw = localStorage.getItem(`bq_attempt_${levelId}`)
  const parsed = raw !== null ? parseInt(raw, 10) : NaN
  return Number.isFinite(parsed) ? parsed : 0
}

export function saveAttemptNumber(levelId, n) {
  localStorage.setItem(`bq_attempt_${levelId}`, String(n))
}
