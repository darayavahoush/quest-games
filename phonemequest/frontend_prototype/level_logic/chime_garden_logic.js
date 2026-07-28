// fa level — sustained frication / airflow control.
// Unlike formants, spectral centroid doesn't need a custom FFT — the browser's
// AnalyserNode.getFloatFrequencyData() already gives dB-magnitude bins, so
// this is just a weighted average, same math as librosa.feature.spectral_centroid.

function computeSpectralCentroid(dbMagnitudes, sampleRate, fftSize) {
  const binHz = sampleRate / fftSize;
  let weightedSum = 0;
  let magSum = 0;
  for (let i = 0; i < dbMagnitudes.length; i++) {
    // dB -> linear magnitude; AnalyserNode gives values like -100 (silence) to 0 (max)
    const linearMag = Math.pow(10, dbMagnitudes[i] / 20);
    const freq = i * binHz;
    weightedSum += freq * linearMag;
    magSum += linearMag;
  }
  return magSum > 0 ? weightedSum / magSum : 0;
}

const NOISE_FLOOR_RMS_DEFAULT = 0.01;
const MIN_CENTROID_HZ_DEFAULT = 2500.0;   // fricatives concentrate energy above this range
const MAX_EXPECTED_CENTROID_HZ_DEFAULT = 6000.0;

function computeFricationScore(rms, centroidHz, noiseFloor = NOISE_FLOOR_RMS_DEFAULT,
                                minCentroid = MIN_CENTROID_HZ_DEFAULT, maxCentroid = MAX_EXPECTED_CENTROID_HZ_DEFAULT) {
  if (rms < noiseFloor) return { score: 0, isValidAttempt: false };
  if (centroidHz < minCentroid) return { score: 0.05, isValidAttempt: true }; // present but not fricative-shaped
  const score = Math.max(0, Math.min(1, (centroidHz - minCentroid) / (maxCentroid - minCentroid)));
  return { score, isValidAttempt: true };
}

// Averages centroid readings taken during the calibration "say ffff" phase
// into a personalized range, rather than assuming every child+mic setup
// produces the same generic 2500-6000Hz. Falls back to generic defaults if
// too few valid readings came through.
function personalizeCentroidRange(centroidReadings, fallbackMin = MIN_CENTROID_HZ_DEFAULT, fallbackMax = MAX_EXPECTED_CENTROID_HZ_DEFAULT) {
  const valid = centroidReadings.filter(c => c > 0);
  if (valid.length < 3) return { minCentroid: fallbackMin, maxCentroid: fallbackMax, usedFallback: true };
  const mean = valid.reduce((s, c) => s + c, 0) / valid.length;
  // center a range around what this child actually produced, floored/capped
  // to sane absolute bounds so a fluke reading can't make the level impossible
  const minCentroid = Math.max(1200, mean * 0.6);
  const maxCentroid = Math.min(8000, mean * 1.3);
  return { minCentroid, maxCentroid, usedFallback: false };
}

// Chime rotation state — sustained frication spins the chime garden faster;
// each full rotation (2*PI) rings a note. Rotation decays gently, not abruptly.
function updateChimeRotation(currentAngle, currentSpeed, fricationScore, dt, config) {
  const { maxSpeed, spinUpRate, decayRate } = config;
  const targetSpeed = fricationScore * maxSpeed;
  const nextSpeed = currentSpeed < targetSpeed
    ? Math.min(targetSpeed, currentSpeed + spinUpRate * dt)
    : Math.max(targetSpeed, currentSpeed - decayRate * dt);
  const nextAngle = currentAngle + nextSpeed * dt;
  const fullRotations = Math.floor(nextAngle / (2 * Math.PI)) - Math.floor(currentAngle / (2 * Math.PI));
  return { angle: nextAngle, speed: nextSpeed, chimesRung: fullRotations };
}

if (typeof module !== 'undefined') {
  module.exports = { computeSpectralCentroid, computeFricationScore, updateChimeRotation, personalizeCentroidRange };
}
