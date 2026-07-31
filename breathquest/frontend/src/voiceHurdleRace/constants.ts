/**
 * Voice Hurdle Race
 *
 * LOUDNESS = running speed
 * PITCH    = jump height
 */

export const GAME_CONFIG = {
  // ---------------------------------------------------------
  // GAME
  // ---------------------------------------------------------

  GAME_DURATION: 30,

  // ---------------------------------------------------------
  // LOUDNESS -> SPEED
  // ---------------------------------------------------------

  // Below this = silence
  MIN_SOUND_THRESHOLD: -70,

  // Used for the HUD / accuracy calculation
  TARGET_LOUDNESS: -42,
  LOUDNESS_TOLERANCE: 12,

  // Loudness bands
  LOUDNESS_QUIET: -58,
  LOUDNESS_MEDIUM: -48,
  LOUDNESS_LOUD: -38,

  // World movement in pixels / second
  PUPPY_SPEED_STOPPED: 0,
  PUPPY_SPEED_SLOW: 100,
  PUPPY_SPEED_NORMAL: 180,
  PUPPY_SPEED_FAST: 270,

  // Kept for compatibility with existing level config
  PUPPY_SPEED_TIRED: 270,

  // ---------------------------------------------------------
  // PITCH -> JUMP
  // ---------------------------------------------------------

  MIN_PITCH: 120,
  MAX_PITCH: 600,

  TARGET_PITCH: 220,
  PITCH_TOLERANCE: 50,

  // Pitch must reach this before a jump begins
  JUMP_TRIGGER_PITCH: 190,

  // Pitch used for maximum jump
  MAX_JUMP_PITCH: 400,

  MIN_JUMP_HEIGHT: 80,
  MAX_JUMP_HEIGHT: 180,

  JUMP_RISE_SPEED: 520,
  JUMP_FALL_SPEED: 430,

  // ---------------------------------------------------------
  // HURDLES
  // ---------------------------------------------------------

  NUM_HURDLES: 3,

  // milliseconds
  HURDLE_SPACING: 4500,

  HURDLE_WIDTH: 54,
  HURDLE_HEIGHT: 70,

  // ---------------------------------------------------------
  // SCORING
  // ---------------------------------------------------------

  POINTS_PER_HURDLE: 100,
  POINTS_PER_SECOND_LOUDNESS: 1,
  POINTS_PER_SECOND_PITCH: 1,
  PENALTY_HIT_HURDLE: -25,

  // ---------------------------------------------------------
  // AUDIO
  // ---------------------------------------------------------

  UPDATE_INTERVAL: 50,
  SMOOTHING_FACTOR: 0.3,
} as const;


export const PITCH_RANGES = {
  LOW: GAME_CONFIG.MIN_PITCH,
  HIGH: GAME_CONFIG.MAX_PITCH,
} as const;


export const LOUDNESS_RANGES = {
  LOW: GAME_CONFIG.MIN_SOUND_THRESHOLD,
  HIGH: -25,
} as const;