// Real instructional content for the seeded exercise library, keyed by
// exact title (matching app/seed.py on the backend). If a future exercise
// gets added to the backend without a matching entry here, DEFAULT covers
// it rather than the page breaking.

export const EXERCISE_CONTENT = {
  'Breath-stream & Lip-friction Drills': {
    demo: 'breath',
    steps: [
      'Take a slow breath in through the nose.',
      'Purse your lips into a narrow opening, like blowing out a candle.',
      'Blow a steady, gentle stream of air for 3\u20134 seconds.',
      'Repeat 5 times, resting between each one.',
    ],
  },
  'Tongue-tip Elevation & Alveolar Tapping': {
    demo: 'tongue',
    steps: [
      'Open your mouth slightly and relax your tongue.',
      'Lift just the tip of your tongue to touch the ridge behind your top front teeth.',
      'Tap that spot gently 10 times, keeping the rest of your tongue still.',
      'Rest, then repeat for 2 more sets.',
    ],
  },
  'Humming to Voiced-sound Bridge': {
    demo: 'hum',
    steps: [
      'Close your lips gently and hum a single low note.',
      'Feel the buzz in your lips and nose as you hum.',
      'Slowly open your mouth partway while keeping the hum going, letting it turn into an \u201cahh\u201d.',
      'Repeat 5 times, keeping the sound smooth and steady.',
    ],
  },
  'Cheek & Jaw Warm-up Massage': {
    demo: 'massage',
    steps: [
      'Using clean fingers, gently press into the cheek in small circles.',
      'Work from the corner of the mouth up toward the ear on one side.',
      'Repeat on the other cheek.',
      'Finish by gently massaging the jaw muscles just in front of the ears.',
    ],
  },
  'Lip Rounding for Sh / Ch / J': {
    demo: 'round',
    steps: [
      'Start with lips relaxed and slightly open.',
      'Round your lips forward into an \u201coo\u201d shape, like blowing a kiss.',
      'Hold the rounded shape for 3 seconds.',
      'Relax and repeat 8 times.',
    ],
  },
}

export const DEFAULT_EXERCISE_CONTENT = {
  demo: 'round',
  steps: ['Follow along with your therapist or parent\u2019s guidance for this one.'],
}

export function getExerciseContent(title) {
  return EXERCISE_CONTENT[title] ?? DEFAULT_EXERCISE_CONTENT
}
