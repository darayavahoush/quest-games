// Four movements. Originally only two (up/back) — a third "in-between"
// vertical position (e.g. behind the teeth) was avoided because it'd look
// nearly identical to "up" using only the elevation metric. Lateral
// left/right moves sidestep that problem: they're discriminated on a
// genuinely independent axis (horizontal tongue-color centroid, see
// computeTongueMetrics in lib/tongueTracking.js), not a finer slice of the
// same vertical measurement.
//
// 'tongue-back' had the same problem in a subtler form: it was originally
// scored on low elevation only, which is really just "any low, visible
// tongue" — not genuinely distinct from a tongue that's simply resting,
// unpulled. It now also requires cavityDarkness (a proxy for retraction —
// see lib/tongueTracking.js), a third, independent axis, the same fix
// lateral was for left/right.
//
// 'left'/'right' below were previously swapped: the lateral scoring range
// and the arrow direction both pointed at the anatomically-wrong cheek.
// Landmark names (61/291) are always subject-relative, not image-relative
// (Google's own Landmark docs are explicit about this), and a front-facing
// camera puts the subject's own left side on the RIGHT half of the raw
// frame — so landmark 61 ("subject's left corner") sits at the larger raw
// x, not the smaller one the old code assumed. That's now corrected here
// and in lib/tongueTracking.js and lib/faceOverlay.js's drawTongueArrow, so
// the visual cue and the scoring target still can't drift apart from each
// other, and both now point at the correct side once the mirrored
// (scaleX(-1)) display is accounted for. Still worth a real-camera sanity
// check (e.g. a colored sticker on one cheek) before trusting it fully —
// same as the cavityDarkness range on tongue-back below, which is a
// separate, still-unverified approximation.
export const TONGUE_MOVES = [
  {
    id: 'tongue-up',
    label: 'Tongue tip to the roof',
    instruction: 'Lift your tongue tip to touch the ridge behind your top teeth.',
    arrow: 'up',
    target: { visibility: [0.06, 1], elevation: [0.52, 1] },
    place: 'Alveolar',
  },
  {
    id: 'tongue-back',
    label: 'Tongue tip back',
    instruction: 'Pull your tongue tip back and let it rest low, away from your teeth.',
    arrow: 'back',
    // Elevation range only used to require "low" (not raised toward the
    // roof, which would instead score well on tongue-up). cavityDarkness
    // is what actually distinguishes a retracted tongue from one that's
    // just resting low near the teeth — see the cavityDarkness comment in
    // lib/tongueTracking.js. Before this axis existed, tongue-back was
    // scored on elevation alone and was indistinguishable from "any low,
    // visible tongue" — this range needs checking against real kids
    // before it's trusted, same caveat as every other target here.
    target: { visibility: [0.04, 1], elevation: [0, 0.42], cavityDarkness: [0.28, 1] },
    place: 'Velar',
  },
  {
    id: 'tongue-left',
    label: 'Tongue tip to the left',
    instruction: 'Push your tongue tip toward your left cheek.',
    arrow: 'left',
    // Elevation left unconstrained ([0, 1]) — laterality is the only thing
    // this move is actually scored on.
    // lateral high (near 1) = toward landmark 61 = the subject's own LEFT
    // corner (see the lateral-scale explanation in lib/tongueTracking.js —
    // this was previously [0, 0.38], which actually scored the RIGHT
    // cheek, swapped with tongue-right below).
    target: { visibility: [0.04, 1], elevation: [0, 1], lateral: [0.62, 1] },
    // Lateral tongue mobility, not tied to one phoneme the way up/back are —
    // supports /l/ production and general oral-motor control.
    place: 'Alveolar',
  },
  {
    id: 'tongue-right',
    label: 'Tongue tip to the right',
    instruction: 'Push your tongue tip toward your right cheek.',
    arrow: 'right',
    // lateral low (near 0) = toward landmark 291 = the subject's own RIGHT
    // corner (previously [0.62, 1], swapped with tongue-left above).
    target: { visibility: [0.04, 1], elevation: [0, 1], lateral: [0, 0.38] },
    place: 'Alveolar',
  },
]
