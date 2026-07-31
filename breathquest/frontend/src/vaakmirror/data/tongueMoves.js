// Four movements. Originally only two (up/back) — a third "in-between"
// vertical position (e.g. behind the teeth) was avoided because it'd look
// nearly identical to "up" using only the elevation metric. Lateral
// left/right moves sidestep that problem: they're discriminated on a
// genuinely independent axis (horizontal tongue-color centroid, see
// computeTongueMetrics in lib/tongueTracking.js), not a finer slice of the
// same vertical measurement.
//
// IMPORTANT — verify before trusting clinically: 'left'/'right' below are
// defined in raw camera-space (landmark 61 = left corner, landmark 291 =
// right corner, same convention as mouthMetrics.js), and the on-screen
// arrow points at that same landmark, so the visual cue and the scoring
// target can't drift apart from each other. But whether that lines up with
// the child's own left/right on the mirrored (scaleX(-1)) display has not
// been confirmed with a real camera — check this with an actual child
// before relying on it for real feedback.
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
    target: { visibility: [0.04, 1], elevation: [0, 0.42] },
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
