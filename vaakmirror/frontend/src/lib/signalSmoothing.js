// Raw per-frame landmark/pixel readings are noisy — small landmark jitter
// or a stray pixel or two flips the score around even when someone holds
// perfectly still. Two layers fix that:
//
// 1. EMA smoothing on the underlying metrics themselves, so scoring works
//    off a settled value instead of this frame's noise.
// 2. Tier hysteresis: upgrading (red -> yellow -> green) happens instantly
//    so correct positioning still feels responsive, but downgrading needs
//    a short streak of consecutively-worse frames first, so a single noisy
//    frame can't drop a genuinely-held shape back down.

export function emaUpdate(prevSmoothed, raw, alpha = 0.3) {
  if (raw == null) return prevSmoothed
  if (prevSmoothed == null) return raw
  return prevSmoothed + (raw - prevSmoothed) * alpha
}

export function emaUpdateObject(prevSmoothed, raw, keys, alpha = 0.3) {
  const next = { ...(prevSmoothed || {}) }
  for (const k of keys) {
    next[k] = emaUpdate(prevSmoothed ? prevSmoothed[k] : null, raw ? raw[k] : null, alpha)
  }
  return next
}

const TIER_ORDER = { red: 0, yellow: 1, green: 2 }

export function createTierStabilizer(requiredFrames = 4) {
  let confirmed = 'red'
  let candidate = null
  let candidateCount = 0

  return {
    update(rawTier) {
      if (TIER_ORDER[rawTier] >= TIER_ORDER[confirmed]) {
        confirmed = rawTier
        candidate = null
        candidateCount = 0
        return confirmed
      }
      if (candidate === rawTier) {
        candidateCount += 1
      } else {
        candidate = rawTier
        candidateCount = 1
      }
      if (candidateCount >= requiredFrames) {
        confirmed = rawTier
        candidate = null
        candidateCount = 0
      }
      return confirmed
    },
    reset() {
      confirmed = 'red'
      candidate = null
      candidateCount = 0
    },
  }
}
