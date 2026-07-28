// Placeholder data shaping the dashboard UI until the real backend/DB is wired in.
// Structure mirrors what the diagnostic layer is meant to produce: category-level
// accuracy rollups by place / manner / voicing, not raw per-sound logs.

export const child = {
  name: 'Aarav',
  age: 6,
  sessionsThisMonth: 14,
  streakDays: 5,
}

export const mannerAccuracy = [
  { category: 'Plosive', accuracy: 78 },
  { category: 'Fricative', accuracy: 41 },
  { category: 'Affricate', accuracy: 52 },
  { category: 'Nasal', accuracy: 88 },
  { category: 'Approximant', accuracy: 65 },
  { category: 'Lateral', accuracy: 60 },
]

export const placeAccuracy = [
  { category: 'Bilabial', accuracy: 90 },
  { category: 'Labiodental', accuracy: 72 },
  { category: 'Dental', accuracy: 55 },
  { category: 'Alveolar', accuracy: 48 },
  { category: 'Post-alveolar', accuracy: 44 },
  { category: 'Velar', accuracy: 81 },
]

export const voicingAccuracy = [
  { category: 'Voiced', accuracy: 74 },
  { category: 'Unvoiced', accuracy: 46 },
]

export const progressOverTime = [
  { week: 'Wk 1', fricative: 22, alveolar: 20 },
  { week: 'Wk 2', fricative: 28, alveolar: 26 },
  { week: 'Wk 3', fricative: 31, alveolar: 33 },
  { week: 'Wk 4', fricative: 41, alveolar: 48 },
]

export const flaggedGaps = [
  {
    id: 'gap-fricative',
    title: 'Fricatives across all placements',
    detail: 'Consistently under 45% match on friction-based sounds regardless of where they\u2019re made \u2014 points to airflow control, not one specific sound.',
    severity: 'high',
    assignedExercise: 'Breath-stream & lip-friction drills',
  },
  {
    id: 'gap-alveolar',
    title: 'Alveolar tongue-tip precision',
    detail: 'Tongue Tamer tracking shows the tongue reaches only partway to the alveolar ridge \u2014 a motor range issue rather than a coordination one.',
    severity: 'medium',
    assignedExercise: 'Tongue-tip elevation & alveolar tapping',
  },
  {
    id: 'gap-voicing',
    title: 'Voiced sounds lag their unvoiced pairs',
    detail: 'Unvoiced sounds score well above their voiced counterparts (e.g. \u2018s\u2019 vs \u2018z\u2019) \u2014 suggests a vocal cord engagement gap.',
    severity: 'low',
    assignedExercise: 'Humming & voiced-hum-to-sound bridge',
  },
]

export const exerciseLibrary = [
  {
    id: 'ex-1',
    title: 'Breath-stream & Lip-friction Drills',
    targets: ['Fricative'],
    duration: '4 min',
    description: 'Guided breath control and lip-shaping drills to build the airflow precision fricative sounds need.',
    status: 'assigned',
  },
  {
    id: 'ex-2',
    title: 'Tongue-tip Elevation & Alveolar Tapping',
    targets: ['Alveolar', 'Plosive'],
    duration: '5 min',
    description: 'Tongue-tip lift and tapping practice against the alveolar ridge, building range for t/d/s/z/n/l sounds.',
    status: 'assigned',
  },
  {
    id: 'ex-3',
    title: 'Humming to Voiced-sound Bridge',
    targets: ['Voiced'],
    duration: '3 min',
    description: 'Hums transition into voiced consonants to build vocal cord engagement for voiced sound pairs.',
    status: 'in-progress',
  },
  {
    id: 'ex-4',
    title: 'Cheek & Jaw Warm-up Massage',
    targets: ['General'],
    duration: '3 min',
    description: 'A gentle warm-up massage sequence for cheeks and jaw, used at the start of any session.',
    status: 'completed',
  },
  {
    id: 'ex-5',
    title: 'Lip Rounding for Sh / Ch / J',
    targets: ['Post-alveolar', 'Affricate'],
    duration: '4 min',
    description: 'Practice rounding and forward lip projection needed for post-alveolar sounds.',
    status: 'not-started',
  },
]
