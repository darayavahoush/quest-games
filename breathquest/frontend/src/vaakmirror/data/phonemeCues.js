// "If the kid can't do it" fallback cues — the kind of concrete,
// low-tech tactile/kinesthetic prompt an SLP reaches for when a purely
// visual or verbal instruction ("put your tongue up") isn't landing.
// These are standard articulation-therapy cueing techniques (placement
// cues, tactile cues, phonetic placement using household objects), not
// anything game-specific — the same thing you'd find in an artic therapy
// handbook. Kept short and parent/kid-readable rather than clinical.
//
// Keyed by BASE phoneme (the ~29 distinct articulations in the taxonomy).
// Every one of the 89 ids in soundTaxonomy.js resolves to one of these
// through BASE_PHONEME below, so every sound in every game has a cue.

export const PHONEME_CUES = {
  p: {
    label: 'p',
    tip: 'Hold a strip of tissue paper an inch from the lips and pop it with a puff of air.',
    tool: 'tissue strip',
  },
  b: {
    label: 'b',
    tip: 'Press lips together and hum before releasing — feel the buzz, then let the lips pop open.',
    tool: 'fingertip on lips (feel the buzz)',
  },
  m: {
    label: 'm',
    tip: 'Close the lips and hum with a closed mouth, feeling the vibration with a fingertip on the lips.',
    tool: 'fingertip on lips (feel the buzz)',
  },
  f: {
    label: 'f',
    tip: 'Rest the top teeth gently on the bottom lip, then blow — hold a cotton ball in front of the mouth so it visibly moves.',
    tool: 'cotton ball',
  },
  v: {
    label: 'v',
    tip: 'Same lip-teeth position as f, but hum instead of blowing — feel the buzz on the bottom lip.',
    tool: 'fingertip on lip (feel the buzz)',
  },
  s: {
    label: 's',
    tip: 'Smile with teeth close together and blow a thin, steady stream — hold a hand a few inches away to feel the air.',
    tool: 'palm to feel airstream',
  },
  z: {
    label: 'z',
    tip: 'Same tongue position as s, but hum through it instead of just blowing — like a buzzing bee.',
    tool: 'fingertip on throat (feel the buzz)',
  },
  t: {
    label: 't',
    tip: 'Use a clean spoon handle or tongue depressor to gently touch the bumpy ridge behind the top front teeth — that\u2019s where the tongue tip taps.',
    tool: 'spoon handle / tongue depressor',
  },
  d: {
    label: 'd',
    tip: 'Same spot as t (the ridge behind the top teeth) — touch it with a spoon handle first, then have the tongue tap the same spot with a hum.',
    tool: 'spoon handle / tongue depressor',
  },
  n: {
    label: 'n',
    tip: 'Rest the tongue tip on the ridge behind the top teeth and hum through the nose — pinch the nose gently to show them where the sound is coming from.',
    tool: 'spoon handle for placement, pinch nose to feel airflow',
  },
  l: {
    label: 'l',
    tip: 'Touch a spoon handle to the ridge behind the top teeth, then have them lift just the tongue tip to that spot while keeping the sides of the tongue down.',
    tool: 'spoon handle',
  },
  r: {
    label: 'r',
    tip: 'Two options if the tongue-tip-up version doesn\u2019t click: try "bunched r" (back of tongue humps up, tip stays low, like growling) or have them bite a straw lightly to keep the jaw from over-opening.',
    tool: 'straw (bite gently to steady the jaw)',
  },
  sh: {
    label: 'sh',
    tip: 'Round the lips forward like blowing a kiss, then blow — a straw held just past the lips gives them a visual target to aim the air stream past.',
    tool: 'straw as an aiming target',
  },
  ch: {
    label: 'ch',
    tip: 'Same rounded-lips shape as sh, but start with the tongue tip touching the ridge (like a quick t) before releasing into the sh sound.',
    tool: 'spoon handle to mark starting tongue spot',
  },
  j: {
    label: 'j',
    tip: 'Same as ch, but hum through it — tongue taps the ridge, then releases with voice on.',
    tool: 'fingertip on throat (feel the buzz)',
  },
  k: {
    label: 'k',
    tip: 'Tip the head back slightly and use a clean tongue depressor to press down gently on the front of the tongue — this encourages the back of the tongue to lift on its own.',
    tool: 'tongue depressor (press front of tongue down)',
  },
  g: {
    label: 'g',
    tip: 'Same back-of-tongue lift as k, but with a hum — try having them cough gently first to feel where the back of the tongue touches.',
    tool: 'tongue depressor, or a gentle cough to locate the spot',
  },
  'th-unvoiced': {
    label: 'th (think)',
    tip: 'Stick the tongue tip out just past the front teeth and blow gently — a mirror helps them see the tongue is actually visible, not tucked behind the teeth.',
    tool: 'mirror',
  },
  'th-voiced': {
    label: 'th (this)',
    tip: 'Same tongue-between-teeth position as th (think), but hum instead of just blowing air.',
    tool: 'mirror, fingertip on throat for the buzz',
  },
  w: {
    label: 'w',
    tip: 'Round the lips into a tight circle like blowing out birthday candles, then relax into the vowel that follows.',
    tool: 'mirror to check lip rounding',
  },
  wh: {
    label: 'wh',
    tip: 'Same rounded lips as w, but with a soft breathy puff before the voice starts — like blowing out a candle right before speaking.',
    tool: 'mirror to check lip rounding',
  },
  y: {
    label: 'y',
    tip: 'Start in a wide smile with the tongue high and forward (like starting to say "ee"), then glide into the next sound.',
    tool: 'mirror to check the smile-wide starting shape',
  },
  qu: {
    label: 'qu',
    tip: 'Round the lips first (like w), then add a quick k at the back of the tongue right before releasing — two motions back to back.',
    tool: 'tongue depressor if the k part needs help',
  },
  h: {
    label: 'h',
    tip: 'Relax the mouth in a loose, neutral shape and just breathe out with a little voice — a tissue held near the mouth shows the breath is there.',
    tool: 'tissue strip',
  },
  ng: {
    label: 'ng',
    tip: 'Lift the back of the tongue like for g, but hum through the nose instead of releasing — pinching the nose gently should stop the sound.',
    tool: 'pinch nose gently to confirm nasal airflow',
  },
  ah: {
    label: 'ah',
    tip: 'Open the mouth wide, like at the doctor\u2019s office — a tongue depressor resting lightly on the tongue can help them keep it low and relaxed.',
    tool: 'tongue depressor (optional, to keep tongue low)',
  },
  ee: {
    label: 'ee',
    tip: 'Smile wide with teeth close together, tongue high and forward — think of the shape right before a big grin.',
    tool: 'mirror',
  },
  oo: {
    label: 'oo',
    tip: 'Round and push the lips forward into a small circle, like blowing through a straw.',
    tool: 'straw',
  },
  vowel: {
    label: 'vowel',
    tip: 'Relax the jaw and let it drop slightly open — a mirror side-by-side with the therapist\u2019s or parent\u2019s mouth helps them copy the shape rather than guess at it.',
    tool: 'mirror, side-by-side modeling',
  },
}

export const DEFAULT_PHONEME_CUE = {
  label: 'this sound',
  tip: 'Try slowing it down and watching your mouth in a mirror while your therapist or parent models the shape beside you.',
  tool: 'mirror, side-by-side modeling',
}

// Maps every id in soundTaxonomy.SOUNDS to one of the base keys above.
// CV syllables and word-final forms reuse their onset/coda consonant's
// cue (same articulator position regardless of what vowel is attached);
// blends use the onset consonant, matching how SHAPE_TARGETS already
// treats them.
const BASE_PHONEME = {
  // primary consonants / vowels — identity mapping
  p: 'p', b: 'b', m: 'm', f: 'f', v: 'v', s: 's', z: 'z', t: 't', d: 'd',
  n: 'n', l: 'l', r: 'r', sh: 'sh', ch: 'ch', j: 'j', k: 'k', g: 'g',
  'th-unvoiced': 'th-unvoiced', 'th-voiced': 'th-voiced',
  w: 'w', wh: 'wh', y: 'y', qu: 'qu', h: 'h', ng: 'ng',
  ah: 'ah', ee: 'ee', oo: 'oo',

  // CV syllables — onset consonant
  ta: 't', da: 'd', na: 'n', pa: 'p', ba: 'b', ma: 'm', fa: 'f', va: 'v',
  sa: 's', za: 'z', la: 'l', ra: 'r', sha: 'sh', cha: 'ch', ja: 'j',
  ka: 'k', ga: 'g', wa: 'w', ya: 'y',

  // blends — onset consonant
  bl: 'b', br: 'b', pl: 'p', pr: 'p', fl: 'f', fr: 'f', dr: 'd', tr: 't',
  tw: 't', sk: 's', sl: 's', sm: 's', sn: 's', sp: 's', st: 's', sw: 's',
  cl: 'k', cr: 'k', gl: 'g', gr: 'g',

  // word-final forms — coda consonant
  ap: 'p', ab: 'b', am: 'm', af: 'f', av: 'v', as: 's', az: 'z', at: 't',
  ad: 'd', an: 'n', al: 'l', ar: 'r', ash: 'sh', ach: 'ch', aj: 'j',
  ak: 'k', ag: 'g', ang: 'ng',

  // lax vowels — no individual cue, just the generic vowel one
  ae: 'vowel', eh: 'vowel', ih: 'vowel', uh: 'vowel',
}

export function getPhonemeCue(soundId) {
  const base = BASE_PHONEME[soundId]
  return PHONEME_CUES[base] ?? DEFAULT_PHONEME_CUE
}
