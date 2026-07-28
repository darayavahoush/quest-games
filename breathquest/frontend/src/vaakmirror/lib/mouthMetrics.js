// Turns raw MediaPipe FaceLandmarker points into two normalized metrics
// (openness, spread) that the games score shapes against. Landmark indices
// below follow the standard 478-point MediaPipe Face Mesh topology.
//
// NOTE: an earlier version derived a "roundness" metric as
// mouthWidth / (mouthOpen + 0.01). That divides by a near-zero number for
// any closed-lip target (p, b, m), so the value blows up and gets clamped
// to 0 — outside every closed-lip target range, so those sounds could never
// score a match no matter how correctly the child closed their lips.
// `spread` below replaces it with a metric computed independently of
// openness, so closed-lip and open-mouth shapes can both be scored.

const UPPER_LIP = 13
const LOWER_LIP = 14
const LEFT_MOUTH_CORNER = 61
const RIGHT_MOUTH_CORNER = 291
const LEFT_FACE = 234
const RIGHT_FACE = 454
const TOP_FACE = 10
const BOTTOM_FACE = 152

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function computeMouthMetrics(landmarks) {
  if (!landmarks || landmarks.length < 468) return null

  const faceWidth = dist(landmarks[LEFT_FACE], landmarks[RIGHT_FACE])
  const faceHeight = dist(landmarks[TOP_FACE], landmarks[BOTTOM_FACE])
  const scale = (faceWidth + faceHeight) / 2 || 1

  const mouthOpen = dist(landmarks[UPPER_LIP], landmarks[LOWER_LIP]) / scale
  const mouthWidth = dist(landmarks[LEFT_MOUTH_CORNER], landmarks[RIGHT_MOUTH_CORNER]) / scale

  // Openness: vertical lip gap normalized to face scale. 0.18 is roughly a
  // wide-open mouth in these units — tune here if matches feel too strict
  // or too loose across the board.
  const openness = Math.max(0, Math.min(1, mouthOpen / 0.18))

  // Spread: horizontal mouth width normalized to face scale, independent of
  // opening. A pursed/rounded mouth ('oo', 'sh') narrows this; a smile or
  // neutral rest widens it. Unlike the old roundness metric, this never
  // divides by the (possibly near-zero) opening value.
  const spread = mouthWidth / scale

  return { openness, spread }
}

function inRangeDist(value, [lo, hi]) {
  if (value >= lo && value <= hi) return 0
  return Math.min(Math.abs(value - lo), Math.abs(value - hi))
}

// Fallback ranges used until a player has a calibrated baseline (or if
// calibration was skipped) — roughly tuned to an average adult/child face,
// same purpose the old fixed constants served.
const SPREAD_FALLBACK = { narrow: [0, 0.42], wide: [0.46, 1] }

// Resolves a target's relative spread tag ('narrow' | 'wide' | null) into a
// concrete [lo, hi] range. When a baseline is available, narrow/wide are
// expressed as a percentage of *this player's own* resting mouth width
// instead of a fixed number — so someone with a naturally wider or
// narrower mouth doesn't have to over- or under-shoot a generic target.
export function resolveSpreadRange(tag, baselineSpread) {
  if (!tag) return [0, 1]
  if (!baselineSpread) return SPREAD_FALLBACK[tag] ?? [0, 1]
  if (tag === 'narrow') return [0, baselineSpread * 0.86]
  if (tag === 'wide') return [baselineSpread * 1.08, 1]
  return [0, 1]
}

export function scoreAgainstTarget(metrics, target, baselineSpread) {
  if (!metrics || !target) return { score: 0, tier: 'red' }

  const spreadRange = resolveSpreadRange(target.spread, baselineSpread)
  const opennessDist = inRangeDist(metrics.openness, target.openness)
  const spreadDist = inRangeDist(metrics.spread, spreadRange)

  const distance = opennessDist + spreadDist
  const score = Math.max(0, 1 - distance * 1.7)

  let tier = 'red'
  if (score > 0.78) tier = 'green'
  else if (score > 0.42) tier = 'yellow'

  return { score, tier }
}
