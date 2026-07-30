import { GAME_CONFIG } from '../constants';
import { LevelConfig } from '../levels';

export type SpeedLevel = 'stopped' | 'slow' | 'normal' | 'fast';

export type GameEventType =
  | 'none'
  | 'hurdle-hit'
  | 'hurdle-cleared';

export interface Hurdle {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;

  isCleared: boolean;
  isHit: boolean;

  // Used for the falling-hurdle animation
  hitTime: number | null;
  clearedTime: number | null;
}

export interface GameState {
  isRunning: boolean;
  isPaused: boolean;

  timeRemaining: number;
  score: number;

  puppyX: number;
  puppyY: number;
  puppySpeed: number;

  isJumping: boolean;
  jumpHeight: number;

  hurdles: Hurdle[];

  currentPitch: number | null;
  currentLoudness: number | null;

  pitchAccuracy: number;
  loudnessAccuracy: number;

  hurdlesCleared: number;
  hurdlesHit: number;

  distanceTravelled: number;

  speedLevel: SpeedLevel;

  // Visual/game feedback
  eventType: GameEventType;
  eventStartedAt: number;

  isStumbling: boolean;
  stumbleStartedAt: number;
}

export class GameEngine {
  private state: GameState;

  private canvasWidth: number;
  private canvasHeight: number;

  private lastUpdateTime = 0;

  private hurdleTimer = 0;
  private hurdlesCreated = 0;

  private pitchSuccessFrames = 0;
  private loudnessSuccessFrames = 0;

  private pitchFrames = 0;
  private loudnessFrames = 0;

  private currentLevel: LevelConfig | null = null;

  constructor(
    canvasWidth: number,
    canvasHeight: number
  ) {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;

    this.state = this.createInitialState();
  }

  setLevelConfig(level: LevelConfig): void {
    this.currentLevel = level;
  }

  private createInitialState(): GameState {
    const groundY = this.canvasHeight - 105;

    return {
      isRunning: false,
      isPaused: false,

      timeRemaining:
        this.currentLevel?.duration ??
        GAME_CONFIG.GAME_DURATION,

      score: 0,

      // Dog stays toward the left.
      puppyX: 150,
      puppyY: groundY,

      puppySpeed: 0,

      isJumping: false,
      jumpHeight: 0,

      hurdles: [],

      currentPitch: null,
      currentLoudness: null,

      pitchAccuracy: 0,
      loudnessAccuracy: 0,

      hurdlesCleared: 0,
      hurdlesHit: 0,

      distanceTravelled: 0,

      speedLevel: 'stopped',

      eventType: 'none',
      eventStartedAt: 0,

      isStumbling: false,
      stumbleStartedAt: 0,
    };
  }

  start(): void {
    this.state = this.createInitialState();

    this.state.isRunning = true;

    this.lastUpdateTime = performance.now();

    this.hurdleTimer = 0;
    this.hurdlesCreated = 0;

    this.pitchSuccessFrames = 0;
    this.loudnessSuccessFrames = 0;

    this.pitchFrames = 0;
    this.loudnessFrames = 0;
  }

  pause(): void {
    this.state.isPaused = true;
  }

  resume(): void {
    this.state.isPaused = false;
    this.lastUpdateTime = performance.now();
  }

  stop(): void {
    this.state.isRunning = false;
  }

  update(
    currentTime: number,
    pitch: number | null,
    loudness: number | null
  ): void {
    if (
      !this.state.isRunning ||
      this.state.isPaused
    ) {
      return;
    }

    let deltaTime =
      (currentTime - this.lastUpdateTime) / 1000;

    this.lastUpdateTime = currentTime;

    deltaTime = Math.min(deltaTime, 0.1);

    this.state.timeRemaining -= deltaTime;

    if (this.state.timeRemaining <= 0) {
      this.state.timeRemaining = 0;
      this.stop();
      return;
    }

    this.state.currentPitch = pitch;
    this.state.currentLoudness = loudness;

    this.updateTemporaryEffects(currentTime);

    this.updateSpeed(loudness);

    this.updateJump(
      deltaTime,
      pitch
    );

    this.state.distanceTravelled +=
      this.state.puppySpeed * deltaTime;

    this.spawnHurdles(deltaTime);

    this.moveHurdles(deltaTime);

    this.checkHurdleCollisions(currentTime);

    this.updateAccuracy(
      pitch,
      loudness
    );
  }

  /* ========================================================
     LOUDNESS -> SPEED
  ======================================================== */

  private updateSpeed(
    loudness: number | null
  ): void {
    // During stumble, puppy temporarily slows down.
    if (this.state.isStumbling) {
      this.state.puppySpeed =
        GAME_CONFIG.PUPPY_SPEED_SLOW;

      this.state.speedLevel = 'slow';

      return;
    }

    if (
      loudness === null ||
      loudness < GAME_CONFIG.MIN_SOUND_THRESHOLD
    ) {
      this.state.puppySpeed =
        GAME_CONFIG.PUPPY_SPEED_STOPPED;

      this.state.speedLevel = 'stopped';

      return;
    }

    if (
      loudness < GAME_CONFIG.LOUDNESS_MEDIUM
    ) {
      this.state.puppySpeed =
        this.currentLevel?.puppySpeedSlow
          ? this.currentLevel.puppySpeedSlow * 90
          : GAME_CONFIG.PUPPY_SPEED_SLOW;

      this.state.speedLevel = 'slow';

      return;
    }

    if (
      loudness < GAME_CONFIG.LOUDNESS_LOUD
    ) {
      this.state.puppySpeed =
        this.currentLevel?.puppySpeedNormal
          ? this.currentLevel.puppySpeedNormal * 90
          : GAME_CONFIG.PUPPY_SPEED_NORMAL;

      this.state.speedLevel = 'normal';

      return;
    }

    this.state.puppySpeed =
      this.currentLevel?.puppySpeedFast
        ? this.currentLevel.puppySpeedFast * 90
        : GAME_CONFIG.PUPPY_SPEED_FAST;

    this.state.speedLevel = 'fast';
  }

  /* ========================================================
     PITCH -> JUMP
  ======================================================== */

  private updateJump(
    deltaTime: number,
    pitch: number | null
  ): void {
    const triggerPitch =
      this.currentLevel?.targetPitch ??
      GAME_CONFIG.JUMP_TRIGGER_PITCH;

    const wantsToJump =
      pitch !== null &&
      pitch >= triggerPitch;

    if (
      wantsToJump &&
      !this.state.isJumping &&
      !this.state.isStumbling
    ) {
      this.state.isJumping = true;
    }

    if (
      this.state.isJumping &&
      wantsToJump
    ) {
      const normalisedPitch = this.normalize(
        pitch ?? triggerPitch,
        triggerPitch,
        GAME_CONFIG.MAX_JUMP_PITCH
      );

      const targetHeight = this.lerp(
        GAME_CONFIG.MIN_JUMP_HEIGHT,
        GAME_CONFIG.MAX_JUMP_HEIGHT,
        normalisedPitch
      );

      if (
        this.state.jumpHeight <
        targetHeight
      ) {
        this.state.jumpHeight +=
          GAME_CONFIG.JUMP_RISE_SPEED *
          deltaTime;

        this.state.jumpHeight = Math.min(
          this.state.jumpHeight,
          targetHeight
        );
      }
    }

    if (
      this.state.isJumping &&
      !wantsToJump
    ) {
      this.state.jumpHeight -=
        GAME_CONFIG.JUMP_FALL_SPEED *
        deltaTime;

      if (this.state.jumpHeight <= 0) {
        this.state.jumpHeight = 0;
        this.state.isJumping = false;
      }
    }

    this.state.jumpHeight = Math.min(
      this.state.jumpHeight,
      GAME_CONFIG.MAX_JUMP_HEIGHT
    );

    const groundY =
      this.canvasHeight - 105;

    this.state.puppyY =
      groundY -
      this.state.jumpHeight;
  }

  /* ========================================================
     HURDLES
  ======================================================== */

  private spawnHurdles(
    deltaTime: number
  ): void {
    const total =
      this.currentLevel?.numHurdles ??
      GAME_CONFIG.NUM_HURDLES;

    if (this.hurdlesCreated >= total) {
      return;
    }

    // Don't spawn until the child starts running.
    if (this.state.puppySpeed === 0) {
      return;
    }

    this.hurdleTimer +=
      deltaTime * 1000;

    const spacing =
      this.currentLevel?.hurdleSpacing ??
      GAME_CONFIG.HURDLE_SPACING;

    if (this.hurdleTimer < spacing) {
      return;
    }

    this.hurdleTimer = 0;

    const hurdleHeight =
      this.currentLevel?.hurdleHeight ??
      GAME_CONFIG.HURDLE_HEIGHT;

    this.state.hurdles.push({
      id: this.hurdlesCreated,

      x: this.canvasWidth + 100,

      y: this.canvasHeight - 82,

      width: GAME_CONFIG.HURDLE_WIDTH,

      height: hurdleHeight,

      isCleared: false,
      isHit: false,

      hitTime: null,
      clearedTime: null,
    });

    this.hurdlesCreated++;
  }

  private moveHurdles(
    deltaTime: number
  ): void {
    const worldSpeed =
      this.state.puppySpeed;

    this.state.hurdles.forEach(
      (hurdle) => {
        hurdle.x -=
          worldSpeed * deltaTime;
      }
    );

    this.state.hurdles =
      this.state.hurdles.filter(
        (hurdle) =>
          hurdle.x >
          -hurdle.width - 160
      );
  }

  /* ========================================================
     COLLISION
  ======================================================== */

  private checkHurdleCollisions(
    currentTime: number
  ): void {
    const puppyLeft =
      this.state.puppyX + 30;

    const puppyRight =
      this.state.puppyX + 100;

    for (const hurdle of this.state.hurdles) {
      if (
        hurdle.isCleared ||
        hurdle.isHit
      ) {
        continue;
      }

      const hurdleLeft = hurdle.x;

      const hurdleRight =
        hurdle.x + hurdle.width;

      const overlapping =
        puppyRight > hurdleLeft &&
        puppyLeft < hurdleRight;

      if (overlapping) {
        const requiredHeight =
          hurdle.height * 0.72;

        if (
          this.state.jumpHeight >=
          requiredHeight
        ) {
          this.clearHurdle(
            hurdle,
            currentTime
          );
        } else {
          this.hitHurdle(
            hurdle,
            currentTime
          );
        }

        continue;
      }

      // Safety for very large frame movement.
      if (hurdleRight < puppyLeft) {
        if (
          this.state.jumpHeight >=
          hurdle.height * 0.55
        ) {
          this.clearHurdle(
            hurdle,
            currentTime
          );
        } else {
          this.hitHurdle(
            hurdle,
            currentTime
          );
        }
      }
    }
  }

  private clearHurdle(
    hurdle: Hurdle,
    currentTime: number
  ): void {
    hurdle.isCleared = true;
    hurdle.clearedTime = currentTime;

    this.state.hurdlesCleared++;

    this.state.score +=
      GAME_CONFIG.POINTS_PER_HURDLE;

    this.state.eventType =
      'hurdle-cleared';

    this.state.eventStartedAt =
      currentTime;
  }

  private hitHurdle(
    hurdle: Hurdle,
    currentTime: number
  ): void {
    hurdle.isHit = true;
    hurdle.hitTime = currentTime;

    this.state.hurdlesHit++;

    this.state.score = Math.max(
      0,
      this.state.score +
        GAME_CONFIG.PENALTY_HIT_HURDLE
    );

    // Trigger visible collision.
    this.state.eventType =
      'hurdle-hit';

    this.state.eventStartedAt =
      currentTime;

    this.state.isStumbling = true;

    this.state.stumbleStartedAt =
      currentTime;

    // Drop dog back towards the ground.
    this.state.isJumping = false;
    this.state.jumpHeight = 0;

    this.state.puppyY =
      this.canvasHeight - 105;
  }

  /* ========================================================
     EFFECT TIMERS
  ======================================================== */

  private updateTemporaryEffects(
    currentTime: number
  ): void {
    // Feedback message lasts 1.1 seconds.
    if (
      this.state.eventType !== 'none' &&
      currentTime -
        this.state.eventStartedAt >
        1100
    ) {
      this.state.eventType = 'none';
    }

    // Puppy stumble lasts 650 ms.
    if (
      this.state.isStumbling &&
      currentTime -
        this.state.stumbleStartedAt >
        650
    ) {
      this.state.isStumbling = false;
    }
  }

  /* ========================================================
     ACCURACY
  ======================================================== */

  private updateAccuracy(
    pitch: number | null,
    loudness: number | null
  ): void {
    if (pitch !== null) {
      this.pitchFrames++;

      const target =
        this.currentLevel?.targetPitch ??
        GAME_CONFIG.JUMP_TRIGGER_PITCH;

      if (pitch >= target) {
        this.pitchSuccessFrames++;
      }
    }

    if (loudness !== null) {
      this.loudnessFrames++;

      if (
        loudness >=
        GAME_CONFIG.MIN_SOUND_THRESHOLD
      ) {
        this.loudnessSuccessFrames++;
      }
    }

    this.state.pitchAccuracy =
      this.pitchFrames > 0
        ? (
            this.pitchSuccessFrames /
            this.pitchFrames
          ) * 100
        : 0;

    this.state.loudnessAccuracy =
      this.loudnessFrames > 0
        ? (
            this.loudnessSuccessFrames /
            this.loudnessFrames
          ) * 100
        : 0;
  }

  private normalize(
    value: number,
    min: number,
    max: number
  ): number {
    if (max === min) {
      return 0;
    }

    return Math.min(
      1,
      Math.max(
        0,
        (value - min) /
          (max - min)
      )
    );
  }

  private lerp(
    min: number,
    max: number,
    amount: number
  ): number {
    return min + (max - min) * amount;
  }

  getState(): GameState {
    return {
      ...this.state,

      hurdles:
        this.state.hurdles.map(
          (hurdle) => ({
            ...hurdle,
          })
        ),
    };
  }

  isGameOver(): boolean {
    return !this.state.isRunning;
  }
}