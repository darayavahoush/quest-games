/**
 * PitchDetector - Implements YIN algorithm for pitch detection
 * Lightweight pitch detection suitable for real-time audio processing
 */

import { GAME_CONFIG } from '../constants';

export class PitchDetector {
  private threshold = 0.15;
  private sampleRate: number;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  /**
   * Detect pitch from audio buffer using YIN algorithm
   * @param buffer - Audio time domain data
   * @returns Pitch in Hz or null if no pitch detected
   */
  detectPitch(buffer: Float32Array): number | null {
    const bufferSize = buffer.length;
    const yinBuffer = new Float32Array(bufferSize / 2);
    let probability = 0;
    let tau;

    // Step 1: Difference function
    for (let t = 0; t < bufferSize / 2; t++) {
      yinBuffer[t] = 0;
      for (let i = 0; i < bufferSize / 2; i++) {
        const delta = buffer[i] - buffer[i + t];
        yinBuffer[t] += delta * delta;
      }
    }

    // Step 2: Cumulative mean normalized difference
    yinBuffer[0] = 1;
    let runningSum = 0;
    for (let t = 1; t < bufferSize / 2; t++) {
      runningSum += yinBuffer[t];
      yinBuffer[t] *= t / runningSum;
    }

    // Step 3: Absolute threshold
    for (tau = 2; tau < bufferSize / 2; tau++) {
      if (yinBuffer[tau] < this.threshold) {
        while (tau + 1 < bufferSize / 2 && yinBuffer[tau + 1] < yinBuffer[tau]) {
          tau++;
        }
        probability = 1 - yinBuffer[tau];
        break;
      }
    }

    if (tau === bufferSize / 2 || yinBuffer[tau] >= this.threshold) {
      return null; // No pitch found
    }

    // Step 4: Parabolic interpolation for better precision
    const betterTau = this.parabolicInterpolation(yinBuffer, tau);

    // Convert to frequency
    const pitch = this.sampleRate / betterTau;

    // Validate pitch range
    if (pitch < GAME_CONFIG.MIN_PITCH || pitch > GAME_CONFIG.MAX_PITCH) {
      return null;
    }

    return pitch;
  }

  /**
   * Parabolic interpolation for sub-sample accuracy
   */
  private parabolicInterpolation(yinBuffer: Float32Array, tau: number): number {
    const x0 = tau < 1 ? tau : tau - 1;
    const x2 = tau + 1 < yinBuffer.length ? tau + 1 : tau;

    if (x0 === tau) {
      return tau;
    }

    const y0 = yinBuffer[x0];
    const y1 = yinBuffer[tau];
    const y2 = yinBuffer[x2];

    const denominator = 2 * y0 - 4 * y1 + 2 * y2;

    if (denominator === 0) {
      return tau;
    }

    return tau + (y0 - y2) / denominator;
  }

  /**
   * Check if pitch is within target range
   */
  isPitchInTarget(pitch: number): boolean {
    const { TARGET_PITCH, PITCH_TOLERANCE } = GAME_CONFIG;
    return pitch >= TARGET_PITCH - PITCH_TOLERANCE && 
           pitch <= TARGET_PITCH + PITCH_TOLERANCE;
  }

  /**
   * Get pitch deviation from target (positive = too high, negative = too low)
   */
  getPitchDeviation(pitch: number): number {
    return pitch - GAME_CONFIG.TARGET_PITCH;
  }
}
