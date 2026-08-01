// Minimal-pair contrasts for Minimal Pair Drill.
//
// IMPORTANT SCOPE NOTE: Mirror Mirror's scoring is entirely mouth-shape
// based (openness + spread from mouthMetrics.js) — it has no microphone/
// voicing signal. That means any pair that differs ONLY in voicing
// (p/b, t/d, k/g, f/v, s/z, th-unvoiced/th-voiced, ch/j, w/wh) or ONLY in
// a manner distinction that doesn't move the mouth differently (l/n — both
// tongue-tip-up) is NOT included here: the camera would score both sides
// of the pair identically, so a "drill" on it would silently always pass
// and teach nothing. This list is deliberately restricted to pairs whose
// two sounds map to different `shape` targets in soundTaxonomy.js, which
// is the actual population of contrasts this camera-based game can honestly
// referee. Voicing-pair drills belong in an ASR-scored game (Village
// Builder) instead, not here.
//
// `common` marks the handful of contrasts that show up most often in real
// caseloads (place-of-articulation errors like fronting/backing, and the
// classic s/sh, l/w, l/r substitution patterns) — used to rank the default
// suggestion when a kid has no attempt history yet to derive weak sounds from.
export const MINIMAL_PAIRS = [
  { a: 's', b: 'sh', label: 's / sh', note: 'Sibilant place contrast — a common lisp/distortion pair.', common: true },
  { a: 't', b: 'k', label: 't / k', note: 'Alveolar vs velar — classic fronting/backing pattern.', common: true },
  { a: 'l', b: 'w', label: 'l / w', note: 'Liquid vs glide — common gliding substitution.', common: true },
  { a: 'l', b: 'r', label: 'l / r', note: 'The two liquids — frequently confused with each other.', common: true },
  { a: 'p', b: 't', label: 'p / t', note: 'Bilabial vs alveolar plosive.', common: false },
  { a: 'p', b: 'k', label: 'p / k', note: 'Bilabial vs velar plosive.', common: false },
  { a: 's', b: 'th-unvoiced', label: 's / th', note: 'Alveolar fricative vs interdental — frontal lisp pair.', common: true },
  { a: 't', b: 'th-unvoiced', label: 't / th', note: 'Stop vs interdental fricative.', common: false },
  { a: 'f', b: 'th-unvoiced', label: 'f / th', note: 'Labiodental vs interdental fricative.', common: false },
  { a: 's', b: 'f', label: 's / f', note: 'Alveolar vs labiodental fricative place contrast.', common: false },
  { a: 'ch', b: 't', label: 'ch / t', note: 'Affricate vs plosive — de-affrication pattern.', common: false },
  { a: 'r', b: 'w', label: 'r / w', note: 'Rhotic vs glide — common gliding substitution.', common: true },
  // Note: k/g, p/b, t/d, f/v, s/z are deliberately NOT here — each pair
  // shares one shape target in soundTaxonomy.js (voicing-only contrast),
  // which this camera-based scorer cannot tell apart. See file header.
]

// sound_id -> the SOUNDS entry it should be looked up against is done by the
// caller (soundTaxonomy.js), this file only defines which ids pair up.

export function findPairForSound(soundId) {
  return MINIMAL_PAIRS.find((p) => p.a === soundId || p.b === soundId) || null
}

export function defaultPair() {
  return MINIMAL_PAIRS.find((p) => p.common) || MINIMAL_PAIRS[0]
}
