// Phonetics classification used across games, the diagnostic layer, and the
// therapist dashboard. Every practice sound is tagged by place, manner, and
// voicing so results can be rolled up into categories, not just per-sound.

export const PLACE = {
  BILABIAL: 'Bilabial',
  LABIODENTAL: 'Labiodental',
  DENTAL: 'Dental',
  ALVEOLAR: 'Alveolar',
  POST_ALVEOLAR: 'Post-alveolar',
  PALATAL: 'Palatal',
  VELAR: 'Velar',
  LABIOVELAR: 'Labio-velar',
  GLOTTAL: 'Glottal',
}

export const MANNER = {
  PLOSIVE: 'Plosive',
  FRICATIVE: 'Fricative',
  AFFRICATE: 'Affricate',
  NASAL: 'Nasal',
  APPROXIMANT: 'Approximant',
  LATERAL: 'Lateral Approximant',
}

export const VOICING = {
  VOICED: 'Voiced',
  UNVOICED: 'Unvoiced',
}

// id, display label, target mouth shape hint (used by Mirror Mirror to score
// camera landmarks), plus the three taxonomy tags.
export const SOUNDS = [
  { id: 'p', label: 'p', place: PLACE.BILABIAL, manner: MANNER.PLOSIVE, voicing: VOICING.UNVOICED, shape: 'lips-closed' },
  { id: 'b', label: 'b', place: PLACE.BILABIAL, manner: MANNER.PLOSIVE, voicing: VOICING.VOICED, shape: 'lips-closed' },
  { id: 'm', label: 'm', place: PLACE.BILABIAL, manner: MANNER.NASAL, voicing: VOICING.VOICED, shape: 'lips-closed' },
  { id: 'f', label: 'f', place: PLACE.LABIODENTAL, manner: MANNER.FRICATIVE, voicing: VOICING.UNVOICED, shape: 'lip-teeth' },
  { id: 'v', label: 'v', place: PLACE.LABIODENTAL, manner: MANNER.FRICATIVE, voicing: VOICING.VOICED, shape: 'lip-teeth' },
  { id: 's', label: 's', place: PLACE.ALVEOLAR, manner: MANNER.FRICATIVE, voicing: VOICING.UNVOICED, shape: 'wide-narrow' },
  { id: 'z', label: 'z', place: PLACE.ALVEOLAR, manner: MANNER.FRICATIVE, voicing: VOICING.VOICED, shape: 'wide-narrow' },
  { id: 't', label: 't', place: PLACE.ALVEOLAR, manner: MANNER.PLOSIVE, voicing: VOICING.UNVOICED, shape: 'tongue-tip-up' },
  { id: 'd', label: 'd', place: PLACE.ALVEOLAR, manner: MANNER.PLOSIVE, voicing: VOICING.VOICED, shape: 'tongue-tip-up' },
  { id: 'n', label: 'n', place: PLACE.ALVEOLAR, manner: MANNER.NASAL, voicing: VOICING.VOICED, shape: 'tongue-tip-up' },
  { id: 'l', label: 'l', place: PLACE.ALVEOLAR, manner: MANNER.LATERAL, voicing: VOICING.VOICED, shape: 'tongue-tip-up' },
  { id: 'r', label: 'r', place: PLACE.POST_ALVEOLAR, manner: MANNER.APPROXIMANT, voicing: VOICING.VOICED, shape: 'wide-narrow' },
  { id: 'sh', label: 'sh', place: PLACE.POST_ALVEOLAR, manner: MANNER.FRICATIVE, voicing: VOICING.UNVOICED, shape: 'round-forward' },
  { id: 'ch', label: 'ch', place: PLACE.POST_ALVEOLAR, manner: MANNER.AFFRICATE, voicing: VOICING.UNVOICED, shape: 'round-forward' },
  { id: 'j', label: 'j', place: PLACE.POST_ALVEOLAR, manner: MANNER.AFFRICATE, voicing: VOICING.VOICED, shape: 'round-forward' },
  { id: 'k', label: 'k', place: PLACE.VELAR, manner: MANNER.PLOSIVE, voicing: VOICING.UNVOICED, shape: 'open-wide' },
  { id: 'g', label: 'g', place: PLACE.VELAR, manner: MANNER.PLOSIVE, voicing: VOICING.VOICED, shape: 'open-wide' },
  { id: 'ta', label: 'ta', place: PLACE.ALVEOLAR, manner: MANNER.PLOSIVE, voicing: VOICING.UNVOICED, shape: 'tongue-tip-up' },
  { id: 'da', label: 'da', place: PLACE.ALVEOLAR, manner: MANNER.PLOSIVE, voicing: VOICING.VOICED, shape: 'tongue-tip-up' },
  { id: 'na', label: 'na', place: PLACE.ALVEOLAR, manner: MANNER.NASAL, voicing: VOICING.VOICED, shape: 'tongue-tip-up' },
]

// Human-friendly shape targets Mirror Mirror scores against, described in
// terms of the landmark metrics computed in lib/mouthMetrics.js.
//
// `spread` is 'narrow' | 'wide' | null. Rather than a fixed absolute cutoff,
// these are resolved at score time against the player's own calibrated
// resting mouth width (see resolveSpreadRange in mouthMetrics.js) — face
// proportions vary enough between people that a fixed number either demands
// an exaggerated pucker from some players or barely registers for others.
// `null` means spread isn't a discriminator for that shape.
export const SHAPE_TARGETS = {
  'lips-closed': { openness: [0, 0.16], spread: null, label: 'Close your lips gently' },
  'lip-teeth': { openness: [0.05, 0.32], spread: null, label: 'Bottom lip touches your top teeth' },
  'wide-narrow': { openness: [0.08, 0.44], spread: 'wide', label: 'Smile wide, teeth close together' },
  'tongue-tip-up': { openness: [0.15, 0.58], spread: null, label: 'Tongue tip behind your top teeth' },
  'round-forward': { openness: [0.14, 0.6], spread: 'narrow', label: 'Round your lips and push forward' },
  'open-wide': { openness: [0.46, 1], spread: null, label: 'Open your mouth wide' },
}
