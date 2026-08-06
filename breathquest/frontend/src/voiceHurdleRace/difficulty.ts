/**
 * difficulty.ts — VoiceHurdleRace's own copy of the same 0..1 difficulty
 * scaling + local-storage persistence pattern BreathQuest's
 * game/lib/difficulty.js uses. Intentionally duplicated rather than
 * imported across the JS/TS module boundary between the two game trees —
 * small enough that keeping it local outweighs the cross-import.
 *
 * VoiceHurdleRace's knobs are pitchTolerance/loudnessTolerance (narrower =
 * harder) rather than BreathQuest's single float-per-level, so scaling
 * happens per-field via scaleByDifficulty on a shallow copy of the level
 * config — see VoiceHurdleRace.tsx's applyDifficultyToLevel.
 */

export const DEFAULT_DIFFICULTY = 0.5;

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function scaleByDifficulty(
  difficulty: number,
  easierValue: number,
  baseValue: number,
  harderValue: number
): number {
  const d = clamp01(difficulty ?? DEFAULT_DIFFICULTY);
  if (d < 0.5) return easierValue + (baseValue - easierValue) * (d / 0.5);
  return baseValue + (harderValue - baseValue) * ((d - 0.5) / 0.5);
}

const STEP = 0.08;
const SAFE_RANGE: [number, number] = [0.15, 0.85];

export function applyAction(difficulty: number, action: string): number {
  let next = clamp01(difficulty ?? DEFAULT_DIFFICULTY);
  if (action === 'raise') next += STEP;
  if (action === 'lower') next -= STEP;
  return Math.max(SAFE_RANGE[0], Math.min(SAFE_RANGE[1], next));
}

export function loadStoredDifficulty(levelId: number): number {
  const raw = localStorage.getItem(`vhr_difficulty_${levelId}`);
  const parsed = raw !== null ? parseFloat(raw) : NaN;
  return Number.isFinite(parsed) ? clamp01(parsed) : DEFAULT_DIFFICULTY;
}

export function saveStoredDifficulty(levelId: number, difficulty: number): void {
  localStorage.setItem(`vhr_difficulty_${levelId}`, String(clamp01(difficulty)));
}
