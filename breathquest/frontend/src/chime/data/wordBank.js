// A much larger word bank for Village Builder, replacing the previous
// 8-word DEFAULT_WORD_LIST that never varied between sessions.
//
// Organized the way a real articulation word list is: each entry tags the
// TARGET consonant it's meant to elicit and WHERE in the word it falls
// (initial / medial / final) — the standard structure SLP word lists use,
// since a kid who can say a sound word-initially doesn't always carry
// that over to word-medial or word-final position. Village Builder itself
// is ASR-scored (ASR/edit-distance against the whole word, see
// lib/api.js's scoreWord / the localWordMatch fallback above), so this
// tagging isn't fed into scoring today — it's here so a future per-phoneme
// rollup (matching what VaakMirror's dashboard already does) has real data
// to key off, and so sampleWordList() below can pull a spread of phonemes
// rather than 8 words that happen to share a target.
//
// Only positions that actually occur in common English words are
// included — there's no word-initial /ŋ/ ("ng") in English, no
// word-final /h/, etc., so those combinations are just left out rather
// than padded with unnatural words.
export const WORD_BANK = [
  // --- p ---
  { word: 'pig', phoneme: 'p', position: 'initial' },
  { word: 'pen', phoneme: 'p', position: 'initial' },
  { word: 'pot', phoneme: 'p', position: 'initial' },
  { word: 'park', phoneme: 'p', position: 'initial' },
  { word: 'apple', phoneme: 'p', position: 'medial' },
  { word: 'paper', phoneme: 'p', position: 'medial' },
  { word: 'happy', phoneme: 'p', position: 'medial' },
  { word: 'cup', phoneme: 'p', position: 'final' },
  { word: 'map', phoneme: 'p', position: 'final' },
  { word: 'top', phoneme: 'p', position: 'final' },

  // --- b ---
  { word: 'ball', phoneme: 'b', position: 'initial' },
  { word: 'bed', phoneme: 'b', position: 'initial' },
  { word: 'boy', phoneme: 'b', position: 'initial' },
  { word: 'bus', phoneme: 'b', position: 'initial' },
  { word: 'baby', phoneme: 'b', position: 'medial' },
  { word: 'rabbit', phoneme: 'b', position: 'medial' },
  { word: 'table', phoneme: 'b', position: 'medial' },
  { word: 'cab', phoneme: 'b', position: 'final' },
  { word: 'tub', phoneme: 'b', position: 'final' },
  { word: 'web', phoneme: 'b', position: 'final' },

  // --- t ---
  { word: 'top', phoneme: 't', position: 'initial' },
  { word: 'ten', phoneme: 't', position: 'initial' },
  { word: 'toy', phoneme: 't', position: 'initial' },
  { word: 'tap', phoneme: 't', position: 'initial' },
  { word: 'water', phoneme: 't', position: 'medial' },
  { word: 'butter', phoneme: 't', position: 'medial' },
  { word: 'potato', phoneme: 't', position: 'medial' },
  { word: 'cat', phoneme: 't', position: 'final' },
  { word: 'hat', phoneme: 't', position: 'final' },
  { word: 'boat', phoneme: 't', position: 'final' },
  { word: 'foot', phoneme: 't', position: 'final' },

  // --- d ---
  { word: 'dog', phoneme: 'd', position: 'initial' },
  { word: 'door', phoneme: 'd', position: 'initial' },
  { word: 'duck', phoneme: 'd', position: 'initial' },
  { word: 'doll', phoneme: 'd', position: 'initial' },
  { word: 'ladder', phoneme: 'd', position: 'medial' },
  { word: 'candy', phoneme: 'd', position: 'medial' },
  { word: 'bed', phoneme: 'd', position: 'final' },
  { word: 'red', phoneme: 'd', position: 'final' },
  { word: 'sad', phoneme: 'd', position: 'final' },
  { word: 'mud', phoneme: 'd', position: 'final' },

  // --- k ---
  { word: 'cat', phoneme: 'k', position: 'initial' },
  { word: 'cup', phoneme: 'k', position: 'initial' },
  { word: 'key', phoneme: 'k', position: 'initial' },
  { word: 'kite', phoneme: 'k', position: 'initial' },
  { word: 'cookie', phoneme: 'k', position: 'medial' },
  { word: 'bacon', phoneme: 'k', position: 'medial' },
  { word: 'jacket', phoneme: 'k', position: 'medial' },
  { word: 'book', phoneme: 'k', position: 'final' },
  { word: 'duck', phoneme: 'k', position: 'final' },
  { word: 'milk', phoneme: 'k', position: 'final' },
  { word: 'rock', phoneme: 'k', position: 'final' },

  // --- g ---
  { word: 'go', phoneme: 'g', position: 'initial' },
  { word: 'girl', phoneme: 'g', position: 'initial' },
  { word: 'goat', phoneme: 'g', position: 'initial' },
  { word: 'gate', phoneme: 'g', position: 'initial' },
  { word: 'wagon', phoneme: 'g', position: 'medial' },
  { word: 'tiger', phoneme: 'g', position: 'medial' },
  { word: 'dog', phoneme: 'g', position: 'final' },
  { word: 'bag', phoneme: 'g', position: 'final' },
  { word: 'pig', phoneme: 'g', position: 'final' },
  { word: 'egg', phoneme: 'g', position: 'final' },

  // --- f ---
  { word: 'fish', phoneme: 'f', position: 'initial' },
  { word: 'fan', phoneme: 'f', position: 'initial' },
  { word: 'foot', phoneme: 'f', position: 'initial' },
  { word: 'four', phoneme: 'f', position: 'initial' },
  { word: 'coffee', phoneme: 'f', position: 'medial' },
  { word: 'elephant', phoneme: 'f', position: 'medial' },
  { word: 'muffin', phoneme: 'f', position: 'medial' },
  { word: 'leaf', phoneme: 'f', position: 'final' },
  { word: 'roof', phoneme: 'f', position: 'final' },
  { word: 'laugh', phoneme: 'f', position: 'final' },

  // --- v ---
  { word: 'van', phoneme: 'v', position: 'initial' },
  { word: 'vase', phoneme: 'v', position: 'initial' },
  { word: 'river', phoneme: 'v', position: 'medial' },
  { word: 'oven', phoneme: 'v', position: 'medial' },
  { word: 'seven', phoneme: 'v', position: 'medial' },
  { word: 'give', phoneme: 'v', position: 'final' },
  { word: 'love', phoneme: 'v', position: 'final' },
  { word: 'wave', phoneme: 'v', position: 'final' },

  // --- s ---
  { word: 'sun', phoneme: 's', position: 'initial' },
  { word: 'soap', phoneme: 's', position: 'initial' },
  { word: 'sock', phoneme: 's', position: 'initial' },
  { word: 'seal', phoneme: 's', position: 'initial' },
  { word: 'baseball', phoneme: 's', position: 'medial' },
  { word: 'whistle', phoneme: 's', position: 'medial' },
  { word: 'castle', phoneme: 's', position: 'medial' },
  { word: 'bus', phoneme: 's', position: 'final' },
  { word: 'house', phoneme: 's', position: 'final' },
  { word: 'dress', phoneme: 's', position: 'final' },
  { word: 'kiss', phoneme: 's', position: 'final' },

  // --- z ---
  { word: 'zoo', phoneme: 'z', position: 'initial' },
  { word: 'zip', phoneme: 'z', position: 'initial' },
  { word: 'zebra', phoneme: 'z', position: 'initial' },
  { word: 'lazy', phoneme: 'z', position: 'medial' },
  { word: 'busy', phoneme: 'z', position: 'medial' },
  { word: 'dizzy', phoneme: 'z', position: 'medial' },
  { word: 'buzz', phoneme: 'z', position: 'final' },
  { word: 'cheese', phoneme: 'z', position: 'final' },
  { word: 'nose', phoneme: 'z', position: 'final' },

  // --- sh ---
  { word: 'shoe', phoneme: 'sh', position: 'initial' },
  { word: 'ship', phoneme: 'sh', position: 'initial' },
  { word: 'shop', phoneme: 'sh', position: 'initial' },
  { word: 'sheep', phoneme: 'sh', position: 'initial' },
  { word: 'washing', phoneme: 'sh', position: 'medial' },
  { word: 'dishes', phoneme: 'sh', position: 'medial' },
  { word: 'fish', phoneme: 'sh', position: 'final' },
  { word: 'wash', phoneme: 'sh', position: 'final' },
  { word: 'brush', phoneme: 'sh', position: 'final' },
  { word: 'dish', phoneme: 'sh', position: 'final' },

  // --- ch ---
  { word: 'chair', phoneme: 'ch', position: 'initial' },
  { word: 'cheese', phoneme: 'ch', position: 'initial' },
  { word: 'chin', phoneme: 'ch', position: 'initial' },
  { word: 'chick', phoneme: 'ch', position: 'initial' },
  { word: 'kitchen', phoneme: 'ch', position: 'medial' },
  { word: 'teacher', phoneme: 'ch', position: 'medial' },
  { word: 'watch', phoneme: 'ch', position: 'final' },
  { word: 'lunch', phoneme: 'ch', position: 'final' },
  { word: 'beach', phoneme: 'ch', position: 'final' },
  { word: 'peach', phoneme: 'ch', position: 'final' },

  // --- j ---
  { word: 'jump', phoneme: 'j', position: 'initial' },
  { word: 'juice', phoneme: 'j', position: 'initial' },
  { word: 'jam', phoneme: 'j', position: 'initial' },
  { word: 'jar', phoneme: 'j', position: 'initial' },
  { word: 'magic', phoneme: 'j', position: 'medial' },
  { word: 'pajamas', phoneme: 'j', position: 'medial' },
  { word: 'cage', phoneme: 'j', position: 'final' },
  { word: 'orange', phoneme: 'j', position: 'final' },
  { word: 'bridge', phoneme: 'j', position: 'final' },

  // --- l ---
  { word: 'leg', phoneme: 'l', position: 'initial' },
  { word: 'lion', phoneme: 'l', position: 'initial' },
  { word: 'lamp', phoneme: 'l', position: 'initial' },
  { word: 'log', phoneme: 'l', position: 'initial' },
  { word: 'yellow', phoneme: 'l', position: 'medial' },
  { word: 'balloon', phoneme: 'l', position: 'medial' },
  { word: 'pillow', phoneme: 'l', position: 'medial' },
  { word: 'ball', phoneme: 'l', position: 'final' },
  { word: 'bell', phoneme: 'l', position: 'final' },
  { word: 'doll', phoneme: 'l', position: 'final' },
  { word: 'pool', phoneme: 'l', position: 'final' },

  // --- r ---
  { word: 'rain', phoneme: 'r', position: 'initial' },
  { word: 'red', phoneme: 'r', position: 'initial' },
  { word: 'rabbit', phoneme: 'r', position: 'initial' },
  { word: 'ring', phoneme: 'r', position: 'initial' },
  { word: 'carrot', phoneme: 'r', position: 'medial' },
  { word: 'parrot', phoneme: 'r', position: 'medial' },
  { word: 'mirror', phoneme: 'r', position: 'medial' },
  { word: 'car', phoneme: 'r', position: 'final' },
  { word: 'star', phoneme: 'r', position: 'final' },
  { word: 'door', phoneme: 'r', position: 'final' },
  { word: 'bear', phoneme: 'r', position: 'final' },

  // --- m ---
  { word: 'milk', phoneme: 'm', position: 'initial' },
  { word: 'moon', phoneme: 'm', position: 'initial' },
  { word: 'monkey', phoneme: 'm', position: 'initial' },
  { word: 'mouse', phoneme: 'm', position: 'initial' },
  { word: 'hammer', phoneme: 'm', position: 'medial' },
  { word: 'summer', phoneme: 'm', position: 'medial' },
  { word: 'camera', phoneme: 'm', position: 'medial' },
  { word: 'gum', phoneme: 'm', position: 'final' },
  { word: 'drum', phoneme: 'm', position: 'final' },
  { word: 'room', phoneme: 'm', position: 'final' },
  { word: 'home', phoneme: 'm', position: 'final' },

  // --- n ---
  { word: 'nose', phoneme: 'n', position: 'initial' },
  { word: 'net', phoneme: 'n', position: 'initial' },
  { word: 'nest', phoneme: 'n', position: 'initial' },
  { word: 'nine', phoneme: 'n', position: 'initial' },
  { word: 'banana', phoneme: 'n', position: 'medial' },
  { word: 'honey', phoneme: 'n', position: 'medial' },
  { word: 'funny', phoneme: 'n', position: 'medial' },
  { word: 'sun', phoneme: 'n', position: 'final' },
  { word: 'moon', phoneme: 'n', position: 'final' },
  { word: 'pan', phoneme: 'n', position: 'final' },
  { word: 'ten', phoneme: 'n', position: 'final' },

  // --- th (unvoiced, "think") ---
  { word: 'thumb', phoneme: 'th-unvoiced', position: 'initial' },
  { word: 'think', phoneme: 'th-unvoiced', position: 'initial' },
  { word: 'three', phoneme: 'th-unvoiced', position: 'initial' },
  { word: 'thick', phoneme: 'th-unvoiced', position: 'initial' },
  { word: 'birthday', phoneme: 'th-unvoiced', position: 'medial' },
  { word: 'nothing', phoneme: 'th-unvoiced', position: 'medial' },
  { word: 'bath', phoneme: 'th-unvoiced', position: 'final' },
  { word: 'teeth', phoneme: 'th-unvoiced', position: 'final' },
  { word: 'mouth', phoneme: 'th-unvoiced', position: 'final' },

  // --- th (voiced, "this") ---
  { word: 'this', phoneme: 'th-voiced', position: 'initial' },
  { word: 'that', phoneme: 'th-voiced', position: 'initial' },
  { word: 'they', phoneme: 'th-voiced', position: 'initial' },
  { word: 'mother', phoneme: 'th-voiced', position: 'medial' },
  { word: 'father', phoneme: 'th-voiced', position: 'medial' },
  { word: 'feather', phoneme: 'th-voiced', position: 'medial' },
  { word: 'smooth', phoneme: 'th-voiced', position: 'final' },

  // --- w ---
  { word: 'water', phoneme: 'w', position: 'initial' },
  { word: 'window', phoneme: 'w', position: 'initial' },
  { word: 'wagon', phoneme: 'w', position: 'initial' },
  { word: 'web', phoneme: 'w', position: 'initial' },
  { word: 'away', phoneme: 'w', position: 'medial' },
  { word: 'flower', phoneme: 'w', position: 'medial' },
  { word: 'tower', phoneme: 'w', position: 'medial' },

  // --- y ---
  { word: 'yellow', phoneme: 'y', position: 'initial' },
  { word: 'yarn', phoneme: 'y', position: 'initial' },
  { word: 'yo-yo', phoneme: 'y', position: 'initial' },
  { word: 'yard', phoneme: 'y', position: 'initial' },
  { word: 'backyard', phoneme: 'y', position: 'medial' },

  // --- h (no word-final /h/ in English) ---
  { word: 'house', phoneme: 'h', position: 'initial' },
  { word: 'hat', phoneme: 'h', position: 'initial' },
  { word: 'hand', phoneme: 'h', position: 'initial' },
  { word: 'horse', phoneme: 'h', position: 'initial' },
  { word: 'behind', phoneme: 'h', position: 'medial' },
  { word: 'ahead', phoneme: 'h', position: 'medial' },

  // --- ng (no word-initial /ŋ/ in English) ---
  { word: 'singer', phoneme: 'ng', position: 'medial' },
  { word: 'finger', phoneme: 'ng', position: 'medial' },
  { word: 'hunger', phoneme: 'ng', position: 'medial' },
  { word: 'ring', phoneme: 'ng', position: 'final' },
  { word: 'king', phoneme: 'ng', position: 'final' },
  { word: 'song', phoneme: 'ng', position: 'final' },
  { word: 'swing', phoneme: 'ng', position: 'final' },
]

/** Fisher–Yates, not sort(() => Math.random() - 0.5) — that's the same
 * biased shuffle bug this codebase already avoided elsewhere isn't
 * present here since this is a fresh file, but worth doing right from
 * the start rather than copying the biased pattern used in a couple of
 * older game files (pickRound in MirrorMirror.jsx etc. — out of scope to
 * fix here, but not worth propagating further). */
function shuffled(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Random sample of `size` distinct words from the bank. Dedupes by word
 * text first (a few words like 'dog'/'cat'/'fish' are cross-tagged under
 * more than one target phoneme, e.g. 'dog' is both a d-final and g-final
 * example) so the same word can't appear twice in one round. */
export function sampleWordList(size = 8) {
  const seen = new Set()
  const unique = []
  for (const entry of shuffled(WORD_BANK)) {
    if (seen.has(entry.word)) continue
    seen.add(entry.word)
    unique.push(entry)
    if (unique.length >= size) break
  }
  return unique.map((e) => e.word)
}
