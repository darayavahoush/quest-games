/**
 * Level Configurations for Voice Hurdle Race
 *
 * LOUDNESS -> puppy running speed
 * PITCH    -> hurdle jumping
 */

export interface LevelConfig {
  id: number;
  name: string;
  description: string;

  // Game
  duration: number;
  numHurdles: number;
  hurdleSpacing: number;
  hurdleHeight: number;

  // Pitch -> jump
  targetPitch: number;
  pitchTolerance: number;
  minPitch: number;
  maxPitch: number;

  // Loudness -> speed
  targetLoudness: number;
  loudnessTolerance: number;

  // Puppy speed multipliers
  puppySpeedSlow: number;
  puppySpeedNormal: number;
  puppySpeedFast: number;
}


/* ============================================================
   LEVEL CONFIGURATION
============================================================ */

export const LEVELS: LevelConfig[] = [
  {
    id: 1,

    name: 'Level 1: Puppy Practice',

    description:
      'Use your voice to run and raise your pitch to jump over 3 hurdles.',

    // Game
    duration: 30,
    numHurdles: 3,
    hurdleSpacing: 5000,
    hurdleHeight: 65,

    // Pitch -> jump
    targetPitch: 200,
    pitchTolerance: 50,
    minPitch: 120,
    maxPitch: 600,

    // Loudness -> speed
    targetLoudness: -45,
    loudnessTolerance: 15,

    // Speed
    puppySpeedSlow: 1,
    puppySpeedNormal: 2,
    puppySpeedFast: 3,
  },

  {
    id: 2,

    name: 'Level 2: Getting Warmer',

    description:
      'Use stronger voice control to clear 5 hurdles.',

    duration: 35,
    numHurdles: 5,
    hurdleSpacing: 4500,
    hurdleHeight: 65,

    targetPitch: 200,
    pitchTolerance: 45,
    minPitch: 120,
    maxPitch: 600,

    targetLoudness: -45,
    loudnessTolerance: 12,

    puppySpeedSlow: 1,
    puppySpeedNormal: 2,
    puppySpeedFast: 3,
  },

  {
    id: 3,

    name: 'Level 3: Higher Hurdles',

    description:
      'Raise your pitch higher to clear taller hurdles.',

    duration: 40,
    numHurdles: 5,
    hurdleSpacing: 4500,
    hurdleHeight: 80,

    targetPitch: 220,
    pitchTolerance: 40,
    minPitch: 120,
    maxPitch: 600,

    targetLoudness: -45,
    loudnessTolerance: 10,

    puppySpeedSlow: 1,
    puppySpeedNormal: 2,
    puppySpeedFast: 3,
  },

  {
    id: 4,

    name: 'Level 4: Speed Challenge',

    description:
      'Control your loudness carefully while jumping over hurdles.',

    duration: 40,
    numHurdles: 6,
    hurdleSpacing: 4000,
    hurdleHeight: 70,

    targetPitch: 210,
    pitchTolerance: 35,
    minPitch: 110,
    maxPitch: 600,

    targetLoudness: -43,
    loudnessTolerance: 10,

    puppySpeedSlow: 1.2,
    puppySpeedNormal: 2.2,
    puppySpeedFast: 3.2,
  },

  {
    id: 5,

    name: 'Level 5: Puppy Champion',

    description:
      'Master loudness and pitch to complete the final race.',

    duration: 45,
    numHurdles: 7,
    hurdleSpacing: 3800,
    hurdleHeight: 80,

    targetPitch: 220,
    pitchTolerance: 30,
    minPitch: 110,
    maxPitch: 600,

    targetLoudness: -42,
    loudnessTolerance: 8,

    puppySpeedSlow: 1.5,
    puppySpeedNormal: 2.5,
    puppySpeedFast: 3.5,
  },
];


/* ============================================================
   LEVEL PROGRESS
============================================================ */

export interface LevelProgress {
  levelId: number;
  stars: number;
  unlocked: boolean;
  completed: boolean;
}


/**
 * Get progress for ALL levels.
 *
 * IMPORTANT:
 * LevelSelection.tsx expects this function to return
 * LevelProgress[].
 */
export const getLevelProgress = (): LevelProgress[] => {
  try {
    const saved = localStorage.getItem(
      'voiceHurdleRace_progress'
    );

    if (saved) {
      const parsed: LevelProgress[] =
        JSON.parse(saved);

      /*
       * Make sure saved progress still matches
       * the current LEVELS configuration.
       */
      return LEVELS.map((level, index) => {
        const existing = parsed.find(
          (progress) =>
            progress.levelId === level.id
        );

        if (existing) {
          return existing;
        }

        return {
          levelId: level.id,
          stars: 0,
          unlocked: index === 0,
          completed: false,
        };
      });
    }
  } catch (error) {
    console.warn(
      'Could not load Voice Hurdle Race progress:',
      error
    );
  }


  /*
   * No saved progress.
   * Level 1 starts unlocked.
   */

  return LEVELS.map((level, index) => ({
    levelId: level.id,
    stars: 0,
    unlocked: index === 0,
    completed: false,
  }));
};


/* ============================================================
   SAVE PROGRESS
============================================================ */

export const saveLevelProgress = (
  progress: LevelProgress[]
): void => {
  try {
    localStorage.setItem(
      'voiceHurdleRace_progress',
      JSON.stringify(progress)
    );
  } catch (error) {
    console.warn(
      'Could not save Voice Hurdle Race progress:',
      error
    );
  }
};


/* ============================================================
   UPDATE PROGRESS
============================================================ */

export const updateLevelProgress = (
  levelId: number,
  stars: number
): void => {
  const progress =
    getLevelProgress();


  const levelIndex =
    progress.findIndex(
      (item) =>
        item.levelId === levelId
    );


  if (levelIndex === -1) {
    return;
  }


  /*
   * Keep the best star result.
   */

  progress[levelIndex].stars =
    Math.max(
      progress[levelIndex].stars,
      stars
    );


  progress[levelIndex].completed =
    true;


  /*
   * Unlock next level.
   */

  const nextLevelIndex =
    levelIndex + 1;


  if (
    nextLevelIndex <
    progress.length
  ) {
    progress[nextLevelIndex].unlocked =
      true;
  }


  saveLevelProgress(progress);
};


/* ============================================================
   STAR CALCULATION
============================================================ */

export const calculateStars = (
  score: number,
  accuracy: number,
  timeRemaining: number
): number => {
  /*
   * 3 stars
   * Strong accuracy and good score.
   */

  if (
    accuracy >= 80 &&
    score >= 250
  ) {
    return 3;
  }


  /*
   * 2 stars
   */

  if (
    accuracy >= 60 &&
    score >= 150
  ) {
    return 2;
  }


  /*
   * 1 star for participating/completing.
   */

  if (
    score > 0 ||
    timeRemaining >= 0
  ) {
    return 1;
  }


  return 0;
};