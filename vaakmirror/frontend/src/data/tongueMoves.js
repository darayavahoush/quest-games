// Two movements to start with, chosen because they're the most reliably
// distinguishable with a coarse color heuristic — "tongue visible and high"
// vs. "tongue mostly retracted/not visible" are a much safer bet than also
// trying to separate a third in-between position (e.g. "just behind the
// teeth") that would look nearly identical to "roof" in a low-res color
// sample. More movements can be added once real tongue-position tracking
// is available instead of this pixel heuristic.
export const TONGUE_MOVES = [
  {
    id: 'tongue-up',
    label: 'Tongue tip to the roof',
    instruction: 'Lift your tongue tip to touch the ridge behind your top teeth.',
    arrow: 'up',
    target: { visibility: [0.06, 1], elevation: [0.52, 1] },
    // Not a phoneme itself, but this is the motor action alveolar sounds
    // (t, d, s, z, n, l) actually depend on — tagging it lets this feed the
    // same "by place" dashboard chart as Mirror Mirror/Lip Sync Hero data,
    // instead of Tongue Tamer practice being invisible to the dashboard.
    // Manner/voicing are left untagged since no single one applies to a
    // movement the way it does to an actual sound.
    place: 'Alveolar',
  },
  {
    id: 'tongue-back',
    label: 'Tongue tip back',
    instruction: 'Pull your tongue tip back and let it rest low, away from your teeth.',
    arrow: 'back',
    // Earlier version required near-zero visibility for "back", but a
    // retracted tongue often stays just as visible to a webcam sitting
    // below eye level — it just sits lower rather than disappearing. Low
    // elevation (opposite of the "up" target) is a more reliable signal
    // than visibility here.
    target: { visibility: [0.04, 1], elevation: [0, 0.42] },
    // Retraction is the motor action velar sounds (k, g) depend on.
    place: 'Velar',
  },
]
