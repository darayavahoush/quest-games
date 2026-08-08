export const LETTER_NAME_GUIDES = {
  ay: {
    svg: "front_mid",
    anatomy: "Jaw half open · Lips gently spread · Tongue moves from mid-front to high-front",
    steps: [
      "Begin with the tongue at mid height near the front of the mouth",
      "Keep the jaw comfortably open and the lips gently spread",
      "Glide the tongue upward and forward to finish with a short 'ee' sound",
      "Keep the voice on throughout the smooth glide",
    ],
  },
  ee: {
    svg: "front_high",
    anatomy: "Tongue high + front · Lips spread · Jaw nearly closed",
    steps: [
      "Raise the front of the tongue close to the roof of the mouth",
      "Spread the lips gently as if smiling",
      "Keep a small gap between the teeth",
      "Hold the clear 'ee' sound with the voice on",
    ],
  },
  eh: {
    svg: "front_mid",
    anatomy: "Tongue mid + front · Lips relaxed · Jaw half open",
    steps: [
      "Start with a short 'eh' sound",
      "Keep the tongue at mid height toward the front",
      "Keep the lips relaxed and the jaw half open",
      "Move cleanly into the final consonant without adding another vowel",
    ],
  },
  eye: {
    svg: "front_open",
    anatomy: "Jaw opens then closes · Tongue moves low-central to high-front · Lips relaxed",
    steps: [
      "Open the jaw for a short 'ah' sound",
      "Start with the tongue low and relaxed",
      "Glide the tongue upward and forward while the jaw closes slightly",
      "Finish with a light 'ee' sound and keep the voice on",
    ],
  },
  oh: {
    svg: "back_low",
    anatomy: "Lips rounded · Tongue mid-back then high-back · Jaw partly open",
    steps: [
      "Round the lips into a medium circle",
      "Begin with the tongue at mid height toward the back",
      "Glide the tongue slightly upward and let the lips narrow",
      "Keep the voice on for the full 'oh' sound",
    ],
  },
  you: {
    svg: "back_high",
    anatomy: "Tongue starts high-front then moves high-back · Lips become rounded",
    steps: [
      "Start with the tongue high and toward the front for a quick 'y' glide",
      "Move the tongue toward the back of the mouth",
      "Round the lips into a small circle",
      "Hold the final 'oo' sound with the voice on",
    ],
  },
  ar: {
    svg: "retroflex",
    anatomy: "Jaw open · Tongue low for 'aa', then tip curls slightly back for Indian-English 'r'",
    steps: [
      "Open the mouth and begin with a clear 'aa' sound",
      "Keep the tongue low and relaxed at the start",
      "Curl the tongue tip slightly upward and back without pressing hard",
      "Keep the voice on as you finish the letter name",
    ],
  },
  doubleYou: {
    svg: "back_high",
    anatomy: "Three-part name · Lips alternate relaxed and rounded · Tongue finishes high-back",
    steps: [
      "Say 'double' clearly with light, even stress",
      "For the final part, begin with a quick 'y' glide",
      "Move the tongue high and back while rounding the lips",
      "Finish by holding the 'oo' sound briefly",
    ],
  },
};

export const ALPHABET_SOUNDS = {
  A: { ipa: "/eɪ/", spoken: "ay", guide: "ay", transition: "Begin directly with the 'ay' glide." },
  B: { ipa: "/biː/", spoken: "bee", guide: "ee", transition: "Press both lips together for /b/, release them, then continue into long 'ee'." },
  C: { ipa: "/siː/", spoken: "see", guide: "ee", transition: "Start with a narrow, voiceless /s/ hiss, then continue into long 'ee'." },
  D: { ipa: "/diː/", spoken: "dee", guide: "ee", transition: "Touch the tongue tip behind the top teeth for /d/, release it, then say long 'ee'." },
  E: { ipa: "/iː/", spoken: "ee", guide: "ee", transition: "Begin directly with the long 'ee' vowel." },
  F: { ipa: "/ɛf/", spoken: "eff", guide: "eh", transition: "Say short 'eh', then touch the top teeth to the lower lip and blow air for /f/." },
  G: { ipa: "/dʒiː/", spoken: "gee", guide: "ee", transition: "Start with voiced /j/ as in 'jam', then continue into long 'ee'." },
  H: { ipa: "/eɪtʃ/", spoken: "aitch", guide: "ay", transition: "Say 'ay', then finish with a quick /t/ release flowing into 'sh'." },
  I: { ipa: "/aɪ/", spoken: "eye", guide: "eye", transition: "Begin directly with the 'eye' glide." },
  J: { ipa: "/dʒeɪ/", spoken: "jay", guide: "ay", transition: "Start with voiced /j/ as in 'jam', then glide smoothly into 'ay'." },
  K: { ipa: "/keɪ/", spoken: "kay", guide: "ay", transition: "Release /k/ from the back of the tongue, then glide smoothly into 'ay'." },
  L: { ipa: "/ɛl/", spoken: "ell", guide: "eh", transition: "Say short 'eh', then place the tongue tip behind the top teeth to finish /l/." },
  M: { ipa: "/ɛm/", spoken: "em", guide: "eh", transition: "Say short 'eh', then close both lips and hum to finish /m/." },
  N: { ipa: "/ɛn/", spoken: "en", guide: "eh", transition: "Say short 'eh', then touch the tongue tip behind the top teeth and hum through the nose." },
  O: { ipa: "/oʊ/", spoken: "oh", guide: "oh", transition: "Begin directly with the rounded 'oh' glide." },
  P: { ipa: "/piː/", spoken: "pee", guide: "ee", transition: "Press both lips together and release a puff for /p/, then continue into long 'ee'." },
  Q: { ipa: "/kjuː/", spoken: "cue", guide: "you", transition: "Release /k/ at the back of the tongue, then say 'you' with rounded lips." },
  R: { ipa: "/ɑːr/", spoken: "are", guide: "ar", transition: "Begin with open 'aa', then finish with the light retroflex /r/ common in Indian English." },
  S: { ipa: "/ɛs/", spoken: "ess", guide: "eh", transition: "Say short 'eh', then bring the tongue near the ridge and finish with a voiceless hiss." },
  T: { ipa: "/tiː/", spoken: "tee", guide: "ee", transition: "Touch the tongue tip behind the top teeth for /t/, release it, then say long 'ee'." },
  U: { ipa: "/juː/", spoken: "you", guide: "you", transition: "Begin directly with 'you': a quick /y/ glide followed by rounded 'oo'." },
  V: { ipa: "/viː/", spoken: "vee", guide: "ee", transition: "Touch the top teeth to the lower lip with voice for /v/, then continue into long 'ee'." },
  W: { ipa: "/ˈdʌbəljuː/", spoken: "double you", guide: "doubleYou", transition: "Say all three parts clearly: 'dub' + 'uhl' + 'you'. Stress the first part." },
  X: { ipa: "/ɛks/", spoken: "ex", guide: "eh", transition: "Say short 'eh', release /k/ at the back, then finish immediately with an /s/ hiss." },
  Y: { ipa: "/waɪ/", spoken: "why", guide: "eye", transition: "Round the lips briefly for /w/, then open and glide through the 'eye' sound." },
  Z: { ipa: "/zɛd/", spoken: "zed", guide: "eh", transition: "Use voiced /z/, say short 'eh', then touch the tongue behind the top teeth to finish /d/." },
};

export const KEYBOARD_ROWS = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["Z", "X", "C", "V", "B", "N", "M"],
];