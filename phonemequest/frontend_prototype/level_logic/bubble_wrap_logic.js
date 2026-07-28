// ha level — breath support / aspiration burst.
// Same burst-shape idea as the Python aspiration_burst.py extractor (peak
// RMS + rise time), but event-based for a grid of bubbles instead of a
// single continuous altitude value.

function computeRMS(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

const MIN_PEAK_RMS_DEFAULT = 0.05;
const MAX_EXPECTED_PEAK_RMS_DEFAULT = 0.4;
const MAX_BURST_DURATION_S = 0.5; // longer than this looks more like sustained "fa" than a "ha" burst

// Call once per completed burst window (from onset to when RMS drops back
// below threshold) with the RMS envelope samples across that window.
function scoreBurst(rmsEnvelope, durationS, minPeakRms = MIN_PEAK_RMS_DEFAULT, maxExpectedPeakRms = MAX_EXPECTED_PEAK_RMS_DEFAULT) {
  if (!rmsEnvelope.length) return { score: 0, isValidAttempt: false };
  const peakRms = Math.max(...rmsEnvelope);
  if (peakRms < minPeakRms) return { score: 0, isValidAttempt: false, peakRms };

  const peakIdx = rmsEnvelope.indexOf(peakRms);
  const riseTimeS = (peakIdx / rmsEnvelope.length) * durationS;

  const durationPenalty = durationS <= MAX_BURST_DURATION_S
    ? 1.0
    : Math.max(0, 1.0 - (durationS - MAX_BURST_DURATION_S));
  const magnitudeScore = Math.max(0, Math.min(1, (peakRms - minPeakRms) / (maxExpectedPeakRms - minPeakRms)));

  return { score: magnitudeScore * durationPenalty, isValidAttempt: true, peakRms, riseTimeS };
}

// Averages peak-RMS readings from bursts made during the calibration
// "say HA!" phase into a personalized min/max scale, so onset detection and
// magnitude scoring are always coordinated against the same calibrated
// range — this fixes a real bug where they used to be scored on two
// different, uncoordinated absolute scales.
function personalizeBurstRange(peakRmsReadings, noiseFloor, fallbackMax = MAX_EXPECTED_PEAK_RMS_DEFAULT) {
  const valid = peakRmsReadings.filter(p => p > 0);
  const minPeakRms = Math.max(0.01, noiseFloor * 2); // just above ambient, not the old fixed 0.05
  if (valid.length < 2) return { minPeakRms, maxExpectedPeakRms: fallbackMax, usedFallback: true };
  const maxObserved = Math.max(...valid);
  const maxExpectedPeakRms = Math.max(minPeakRms + 0.05, maxObserved);
  return { minPeakRms, maxExpectedPeakRms, usedFallback: false };
}

// Bubble sheet state: an NxN grid, each good burst pops the next unpopped
// bubble in reading order (no fail state — a weak burst just doesn't pop
// anything that attempt, sheet never un-pops).
function popNextBubble(poppedFlags, burstScore, popThreshold = 0.3) {
  if (burstScore < popThreshold) return { poppedFlags, justPopped: -1 };
  const nextIndex = poppedFlags.indexOf(false);
  if (nextIndex === -1) return { poppedFlags, justPopped: -1 }; // sheet already full
  const next = poppedFlags.slice();
  next[nextIndex] = true;
  return { poppedFlags: next, justPopped: nextIndex };
}

if (typeof module !== 'undefined') {
  module.exports = {
    computeRMS, scoreBurst, popNextBubble, personalizeBurstRange,
    MIN_PEAK_RMS_DEFAULT, MAX_EXPECTED_PEAK_RMS_DEFAULT,
  };
}
