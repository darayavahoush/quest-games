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
// IMPORTANT — verify before trusting clinically: 'left'/'right' below are
// defined in raw camera-space (landmark 61 = left corner, landmark 291 =
// right corner, same convention as mouthMetrics.js), and the on-screen
// arrow points at that same landmark, so the visual cue and the scoring
// target can't drift apart from each other. But whether that lines up with
// the child's own left/right on the mirrored (scaleX(-1)) display has not
// been confirmed with a real camera — check this with an actual child
// before relying on it for real feedback. Same goes for the cavityDarkness
// range on tongue-back below — untested against real kids.
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
    target: { visibility: [0.04, 1], elevation: [0, 1], lateral: [0, 0.38] },
    // Lateral tongue mobility, not tied to one phoneme the way up/back are —
    // supports /l/ production and general oral-motor control.
    place: 'Alveolar',
  },
  {
    id: 'tongue-right',
    label: 'Tongue tip to the right',
    instruction: 'Push your tongue tip toward your right cheek.',
    arrow: 'right',
    target: { visibility: [0.04, 1], elevation: [0, 1], lateral: [0.62, 1] },
    place: 'Alveolar',
  },
]
