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

  // --- Added: previously-missing consonants and glides ---
  // th (unvoiced/voiced) needs its own shape — tongue visibly between the
  // teeth, distinct from tongue-tip-up's "behind the teeth, not visible" shape.
  { id: 'th-unvoiced', label: 'th (think)', place: PLACE.DENTAL, manner: MANNER.FRICATIVE, voicing: VOICING.UNVOICED, shape: 'tongue-between-teeth' },
  { id: 'th-voiced', label: 'th (this)', place: PLACE.DENTAL, manner: MANNER.FRICATIVE, voicing: VOICING.VOICED, shape: 'tongue-between-teeth' },
  // w: lips rounded and pushed forward — genuinely well-matched by the
  // existing round-forward shape, not just a fallback reuse.
  { id: 'w', label: 'w', place: PLACE.LABIOVELAR, manner: MANNER.APPROXIMANT, voicing: VOICING.VOICED, shape: 'round-forward' },
  // wh: same rounded-lips shape as w; the voiceless/voiced distinction from
  // w isn't visually scoreable by mouth-shape alone, tagged unvoiced for
  // dashboard/taxonomy accuracy only.
  { id: 'wh', label: 'wh', place: PLACE.LABIOVELAR, manner: MANNER.APPROXIMANT, voicing: VOICING.UNVOICED, shape: 'round-forward' },
  // y: tongue high and front, lips spread — closest existing visual match
  // is wide-narrow (smile-like spread), though this is an approximation;
  // y's real distinguishing feature is tongue height, which this camera
  // heuristic can't measure independent of a full tongue tracker.
  { id: 'y', label: 'y', place: PLACE.PALATAL, manner: MANNER.APPROXIMANT, voicing: VOICING.VOICED, shape: 'wide-narrow' },
  // qu (kw digraph): same rounded shape as w — the k-onset itself isn't
  // separately visible.
  { id: 'qu', label: 'qu', place: PLACE.LABIOVELAR, manner: MANNER.PLOSIVE, voicing: VOICING.UNVOICED, shape: 'round-forward' },
  // h and ng: included for taxonomy/dashboard completeness and for
  // Village Builder (ASR-scored, not shape-scored), but neither has a
  // strong, distinct mouth shape a camera can reliably read — h is mostly
  // breath with a neutral, relaxed-open mouth; ng is a tongue-back
  // constriction with only mild jaw opening. `neutral-open` is a real but
  // deliberately loose target for both, honestly looser than the other
  // shapes here rather than pretending to precision that doesn't exist.
  { id: 'h', label: 'h', place: PLACE.GLOTTAL, manner: MANNER.FRICATIVE, voicing: VOICING.UNVOICED, shape: 'neutral-open' },
  { id: 'ng', label: 'ng', place: PLACE.VELAR, manner: MANNER.NASAL, voicing: VOICING.VOICED, shape: 'neutral-open' },

  // --- Added: vowels whose mouth shape genuinely matches an existing target ---
  { id: 'ah', label: 'ah', place: PLACE.GLOTTAL, manner: MANNER.APPROXIMANT, voicing: VOICING.VOICED, shape: 'open-wide' },
  { id: 'ee', label: 'ee', place: PLACE.PALATAL, manner: MANNER.APPROXIMANT, voicing: VOICING.VOICED, shape: 'wide-narrow' },
  { id: 'oo', label: 'oo', place: PLACE.LABIOVELAR, manner: MANNER.APPROXIMANT, voicing: VOICING.VOICED, shape: 'round-forward' },
  // Diphthongs (ay, eye, oh, ow) deliberately left out of this shape-scored
  // list — they move through more than one mouth shape as they're said, so
  // a single static target would misrepresent them. They still work fine
  // as Village Builder target words (ASR-scored, not shape-scored).

  // --- Added: CV syllables, following the existing ta/da/na pattern of
  // reusing the onset consonant's own shape as the held target ---
  { id: 'pa', label: 'pa', place: PLACE.BILABIAL, manner: MANNER.PLOSIVE, voicing: VOICING.UNVOICED, shape: 'lips-closed' },
  { id: 'ba', label: 'ba', place: PLACE.BILABIAL, manner: MANNER.PLOSIVE, voicing: VOICING.VOICED, shape: 'lips-closed' },
  { id: 'ma', label: 'ma', place: PLACE.BILABIAL, manner: MANNER.NASAL, voicing: VOICING.VOICED, shape: 'lips-closed' },
  { id: 'fa', label: 'fa', place: PLACE.LABIODENTAL, manner: MANNER.FRICATIVE, voicing: VOICING.UNVOICED, shape: 'lip-teeth' },
  { id: 'va', label: 'va', place: PLACE.LABIODENTAL, manner: MANNER.FRICATIVE, voicing: VOICING.VOICED, shape: 'lip-teeth' },
  { id: 'sa', label: 'sa', place: PLACE.ALVEOLAR, manner: MANNER.FRICATIVE, voicing: VOICING.UNVOICED, shape: 'wide-narrow' },
  { id: 'za', label: 'za', place: PLACE.ALVEOLAR, manner: MANNER.FRICATIVE, voicing: VOICING.VOICED, shape: 'wide-narrow' },
  { id: 'la', label: 'la', place: PLACE.ALVEOLAR, manner: MANNER.LATERAL, voicing: VOICING.VOICED, shape: 'tongue-tip-up' },
  { id: 'ra', label: 'ra', place: PLACE.POST_ALVEOLAR, manner: MANNER.APPROXIMANT, voicing: VOICING.VOICED, shape: 'wide-narrow' },
  { id: 'sha', label: 'sha', place: PLACE.POST_ALVEOLAR, manner: MANNER.FRICATIVE, voicing: VOICING.UNVOICED, shape: 'round-forward' },
  { id: 'cha', label: 'cha', place: PLACE.POST_ALVEOLAR, manner: MANNER.AFFRICATE, voicing: VOICING.UNVOICED, shape: 'round-forward' },
  { id: 'ja', label: 'ja', place: PLACE.POST_ALVEOLAR, manner: MANNER.AFFRICATE, voicing: VOICING.VOICED, shape: 'round-forward' },
  { id: 'ka', label: 'ka', place: PLACE.VELAR, manner: MANNER.PLOSIVE, voicing: VOICING.UNVOICED, shape: 'open-wide' },
  { id: 'ga', label: 'ga', place: PLACE.VELAR, manner: MANNER.PLOSIVE, voicing: VOICING.VOICED, shape: 'open-wide' },
  { id: 'wa', label: 'wa', place: PLACE.LABIOVELAR, manner: MANNER.APPROXIMANT, voicing: VOICING.VOICED, shape: 'round-forward' },
  { id: 'ya', label: 'ya', place: PLACE.PALATAL, manner: MANNER.APPROXIMANT, voicing: VOICING.VOICED, shape: 'wide-narrow' },

  // --- Added: word-initial consonant clusters/blends. A blend moves through
  // its two consonants too fast for two separate held shapes, so — same
  // reasoning as ta/da/na and the CV syllables above — the scored target is
  // the ONSET consonant's own shape, held through the blend. `place` here
  // tags the onset consonant specifically (the blend as a whole doesn't
  // have one single place of articulation).
  { id: 'bl', label: 'bl', place: PLACE.BILABIAL, manner: MANNER.PLOSIVE, voicing: VOICING.VOICED, shape: 'lips-closed' },
  { id: 'br', label: 'br', place: PLACE.BILABIAL, manner: MANNER.PLOSIVE, voicing: VOICING.VOICED, shape: 'lips-closed' },
  { id: 'pl', label: 'pl', place: PLACE.BILABIAL, manner: MANNER.PLOSIVE, voicing: VOICING.UNVOICED, shape: 'lips-closed' },
  { id: 'pr', label: 'pr', place: PLACE.BILABIAL, manner: MANNER.PLOSIVE, voicing: VOICING.UNVOICED, shape: 'lips-closed' },
  { id: 'fl', label: 'fl', place: PLACE.LABIODENTAL, manner: MANNER.FRICATIVE, voicing: VOICING.UNVOICED, shape: 'lip-teeth' },
  { id: 'fr', label: 'fr', place: PLACE.LABIODENTAL, manner: MANNER.FRICATIVE, voicing: VOICING.UNVOICED, shape: 'lip-teeth' },
  { id: 'dr', label: 'dr', place: PLACE.ALVEOLAR, manner: MANNER.PLOSIVE, voicing: VOICING.VOICED, shape: 'tongue-tip-up' },
  { id: 'tr', label: 'tr', place: PLACE.ALVEOLAR, manner: MANNER.PLOSIVE, voicing: VOICING.UNVOICED, shape: 'tongue-tip-up' },
  { id: 'tw', label: 'tw', place: PLACE.ALVEOLAR, manner: MANNER.PLOSIVE, voicing: VOICING.UNVOICED, shape: 'tongue-tip-up' },
  { id: 'sk', label: 'sk', place: PLACE.ALVEOLAR, manner: MANNER.FRICATIVE, voicing: VOICING.UNVOICED, shape: 'wide-narrow' },
  { id: 'sl', label: 'sl', place: PLACE.ALVEOLAR, manner: MANNER.FRICATIVE, voicing: VOICING.UNVOICED, shape: 'wide-narrow' },
  { id: 'sm', label: 'sm', place: PLACE.ALVEOLAR, manner: MANNER.FRICATIVE, voicing: VOICING.UNVOICED, shape: 'wide-narrow' },
  { id: 'sn', label: 'sn', place: PLACE.ALVEOLAR, manner: MANNER.FRICATIVE, voicing: VOICING.UNVOICED, shape: 'wide-narrow' },
  { id: 'sp', label: 'sp', place: PLACE.ALVEOLAR, manner: MANNER.FRICATIVE, voicing: VOICING.UNVOICED, shape: 'wide-narrow' },
  { id: 'st', label: 'st', place: PLACE.ALVEOLAR, manner: MANNER.FRICATIVE, voicing: VOICING.UNVOICED, shape: 'wide-narrow' },
  { id: 'sw', label: 'sw', place: PLACE.ALVEOLAR, manner: MANNER.FRICATIVE, voicing: VOICING.UNVOICED, shape: 'wide-narrow' },
  { id: 'cl', label: 'cl', place: PLACE.VELAR, manner: MANNER.PLOSIVE, voicing: VOICING.UNVOICED, shape: 'open-wide' },
  { id: 'cr', label: 'cr', place: PLACE.VELAR, manner: MANNER.PLOSIVE, voicing: VOICING.UNVOICED, shape: 'open-wide' },
  { id: 'gl', label: 'gl', place: PLACE.VELAR, manner: MANNER.PLOSIVE, voicing: VOICING.VOICED, shape: 'open-wide' },
  { id: 'gr', label: 'gr', place: PLACE.VELAR, manner: MANNER.PLOSIVE, voicing: VOICING.VOICED, shape: 'open-wide' },

  // --- Added: word-final forms of the consonants that actually occur
  // word-finally in English (no w/y/h/qu — see the notes on those above).
  // Same shape as the word-initial/CV form of the same consonant: it's the
  // same articulator position whichever end of the syllable it's on, and
  // the connecting vowel itself isn't part of what's scored.
  { id: 'ap', label: 'ap', place: PLACE.BILABIAL, manner: MANNER.PLOSIVE, voicing: VOICING.UNVOICED, shape: 'lips-closed' },
  { id: 'ab', label: 'ab', place: PLACE.BILABIAL, manner: MANNER.PLOSIVE, voicing: VOICING.VOICED, shape: 'lips-closed' },
  { id: 'am', label: 'am', place: PLACE.BILABIAL, manner: MANNER.NASAL, voicing: VOICING.VOICED, shape: 'lips-closed' },
  { id: 'af', label: 'af', place: PLACE.LABIODENTAL, manner: MANNER.FRICATIVE, voicing: VOICING.UNVOICED, shape: 'lip-teeth' },
  { id: 'av', label: 'av', place: PLACE.LABIODENTAL, manner: MANNER.FRICATIVE, voicing: VOICING.VOICED, shape: 'lip-teeth' },
  { id: 'as', label: 'as', place: PLACE.ALVEOLAR, manner: MANNER.FRICATIVE, voicing: VOICING.UNVOICED, shape: 'wide-narrow' },
  { id: 'az', label: 'az', place: PLACE.ALVEOLAR, manner: MANNER.FRICATIVE, voicing: VOICING.VOICED, shape: 'wide-narrow' },
  { id: 'at', label: 'at', place: PLACE.ALVEOLAR, manner: MANNER.PLOSIVE, voicing: VOICING.UNVOICED, shape: 'tongue-tip-up' },
  { id: 'ad', label: 'ad', place: PLACE.ALVEOLAR, manner: MANNER.PLOSIVE, voicing: VOICING.VOICED, shape: 'tongue-tip-up' },
  { id: 'an', label: 'an', place: PLACE.ALVEOLAR, manner: MANNER.NASAL, voicing: VOICING.VOICED, shape: 'tongue-tip-up' },
  { id: 'al', label: 'al', place: PLACE.ALVEOLAR, manner: MANNER.LATERAL, voicing: VOICING.VOICED, shape: 'tongue-tip-up' },
  { id: 'ar', label: 'ar', place: PLACE.POST_ALVEOLAR, manner: MANNER.APPROXIMANT, voicing: VOICING.VOICED, shape: 'wide-narrow' },
  { id: 'ash', label: 'ash', place: PLACE.POST_ALVEOLAR, manner: MANNER.FRICATIVE, voicing: VOICING.UNVOICED, shape: 'round-forward' },
  { id: 'ach', label: 'ach', place: PLACE.POST_ALVEOLAR, manner: MANNER.AFFRICATE, voicing: VOICING.UNVOICED, shape: 'round-forward' },
  { id: 'aj', label: 'aj', place: PLACE.POST_ALVEOLAR, manner: MANNER.AFFRICATE, voicing: VOICING.VOICED, shape: 'round-forward' },
  { id: 'ak', label: 'ak', place: PLACE.VELAR, manner: MANNER.PLOSIVE, voicing: VOICING.UNVOICED, shape: 'open-wide' },
  { id: 'ag', label: 'ag', place: PLACE.VELAR, manner: MANNER.PLOSIVE, voicing: VOICING.VOICED, shape: 'open-wide' },
  { id: 'ang', label: 'ang', place: PLACE.VELAR, manner: MANNER.NASAL, voicing: VOICING.VOICED, shape: 'neutral-open' },

  // --- Added: short/lax vowels (cat, bed, sit, cup). Deliberately grouped
  // under the same loose 'neutral-open' target used for h/ng, NOT given
  // individual shapes — mouthMetrics.js only measures openness + lip
  // spread, and these four vowels don't differ enough on either axis to
  // be honestly told apart from each other (or from 'ah') with that metric
  // set alone; telling them apart really needs tongue height/backness,
  // which isn't tracked. Included per explicit sign-off to add them anyway
  // as an approximate target rather than leaving them out entirely — but
  // flagged here so it's clear these will all score identically to each
  // other and shouldn't be trusted for fine vowel-quality feedback.
  { id: 'ae', label: 'a (cat)', place: PLACE.GLOTTAL, manner: MANNER.APPROXIMANT, voicing: VOICING.VOICED, shape: 'neutral-open' },
  { id: 'eh', label: 'e (bed)', place: PLACE.GLOTTAL, manner: MANNER.APPROXIMANT, voicing: VOICING.VOICED, shape: 'neutral-open' },
  { id: 'ih', label: 'i (sit)', place: PLACE.GLOTTAL, manner: MANNER.APPROXIMANT, voicing: VOICING.VOICED, shape: 'neutral-open' },
  { id: 'uh', label: 'u (cup)', place: PLACE.GLOTTAL, manner: MANNER.APPROXIMANT, voicing: VOICING.VOICED, shape: 'neutral-open' },
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
  // New: tongue visibly between the teeth (th), distinct from tongue-tip-up
  // where the tip stays behind the teeth, not protruding through them.
  'tongue-between-teeth': { openness: [0.14, 0.34], spread: null, label: 'Stick your tongue tip out gently between your teeth' },
  // New: a deliberately loose target for h/ng, which don't have a strong
  // visual mouth shape — wide range on purpose, not a precision target.
  'neutral-open': { openness: [0.12, 0.5], spread: null, label: 'Relax your mouth, just slightly open' },
}
