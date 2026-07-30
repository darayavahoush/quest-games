/**
 * LoudnessDetector - Calculates RMS and dB from audio data
 */

import { GAME_CONFIG } from '../constants';

export class LoudnessDetector {
  private smoothingFactor = GAME_CONFIG.SMOOTHING_FACTOR;
  private smoothedLoudness = 0;
  private noiseFloor = -80; // Initial noise floor estimate
  private noiseFloorSamples: number[] = [];
  private readonly NOISE_FLOOR_SAMPLES = 100; // Number of samples to calibrate noise floor
  private readonly NOISE_GATE_THRESHOLD = 30; // dB above noise floor to consider as signal (further increased to filter fan noise)

  /**
   * Calculate RMS (Root Mean Square) from audio buffer
   */
  private calculateRMS(buffer: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      sum += buffer[i] * buffer[i];
    }
    return Math.sqrt(sum / buffer.length);
  }

  /**
   * Convert RMS to decibels
   */
  private rmsToDb(rms: number): number {
    // Reference value for full scale digital audio
    const reference = 1.0;
    // Avoid log(0)
    const safeRms = Math.max(rms, 1e-10);
    return 20 * Math.log10(safeRms / reference);
  }

  /**
   * Update noise floor estimate (background noise like ceiling fan)
   */
  private updateNoiseFloor(loudness: number): void {
    this.noiseFloorSamples.push(loudness);
    if (this.noiseFloorSamples.length > this.NOISE_FLOOR_SAMPLES) {
      this.noiseFloorSamples.shift();
    }
    
    // Calculate median of noise samples for robust noise floor estimate
    const sorted = [...this.noiseFloorSamples].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    this.noiseFloor = sorted.length % 2 === 0 
      ? (sorted[mid - 1] + sorted[mid]) / 2 
      : sorted[mid];
  }

  /**
   * Get loudness in dB with smoothing and noise gate
   */
  getLoudness(buffer: Float32Array): number {
    const rms = this.calculateRMS(buffer);
    const db = this.rmsToDb(rms);

    // Update noise floor estimate
    this.updateNoiseFloor(db);

    // Apply noise gate: only consider sounds significantly above noise floor
    const noiseGatedDb = db > this.noiseFloor + this.NOISE_GATE_THRESHOLD ? db : this.noiseFloor;

    // Apply smoothing to reduce jitter
    this.smoothedLoudness = this.smoothingFactor * noiseGatedDb + 
                           (1 - this.smoothingFactor) * this.smoothedLoudness;

    return this.smoothedLoudness;
  }

  /**
   * Check if loudness is within target range
   */
  isLoudnessInTarget(loudness: number): boolean {
    const { TARGET_LOUDNESS, LOUDNESS_TOLERANCE } = GAME_CONFIG;
    return loudness >= TARGET_LOUDNESS - LOUDNESS_TOLERANCE && 
           loudness <= TARGET_LOUDNESS + LOUDNESS_TOLERANCE;
  }

  /**
   * Get loudness deviation from target (positive = too loud, negative = too quiet)
   */
  getLoudnessDeviation(loudness: number): number {
    return loudness - GAME_CONFIG.TARGET_LOUDNESS;
  }

  /**
   * Reset smoothing state
   */
  reset(): void {
    this.smoothedLoudness = 0;
  }
}
