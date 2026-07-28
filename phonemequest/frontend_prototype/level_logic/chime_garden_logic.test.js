const assert = require('assert');
const { computeSpectralCentroid, computeFricationScore, updateChimeRotation, personalizeCentroidRange } = require('./chime_garden_logic.js');

const SR = 44100;
const FFT_SIZE = 2048;
const NUM_BINS = FFT_SIZE / 2;
const SILENCE_DB = -100;

function makeSpectrum(peakHz, spreadBins = 3) {
  const binHz = SR / FFT_SIZE;
  const peakBin = Math.round(peakHz / binHz);
  const mags = new Array(NUM_BINS).fill(SILENCE_DB);
  for (let i = Math.max(0, peakBin - spreadBins); i < Math.min(NUM_BINS, peakBin + spreadBins); i++) {
    mags[i] = -10; // loud relative to silence floor
  }
  return mags;
}

// --- computeSpectralCentroid ---
const lowSpectrum = makeSpectrum(500);
const lowCentroid = computeSpectralCentroid(lowSpectrum, SR, FFT_SIZE);
assert.ok(Math.abs(lowCentroid - 500) < 100, `centroid of energy at 500Hz should be near 500Hz, got ${lowCentroid}`);

const highSpectrum = makeSpectrum(4000);
const highCentroid = computeSpectralCentroid(highSpectrum, SR, FFT_SIZE);
assert.ok(Math.abs(highCentroid - 4000) < 150, `centroid of energy at 4000Hz should be near 4000Hz, got ${highCentroid}`);

const silentSpectrum = new Array(NUM_BINS).fill(SILENCE_DB);
const silentCentroid = computeSpectralCentroid(silentSpectrum, SR, FFT_SIZE);
assert.ok(silentCentroid >= 0, 'silence should not produce a negative or NaN centroid');

// --- computeFricationScore ---
const quiet = computeFricationScore(0.005, 3000);
assert.strictEqual(quiet.isValidAttempt, false, 'below noise floor should be an invalid attempt regardless of centroid');

const lowToneNotFricative = computeFricationScore(0.1, 500);
assert.ok(lowToneNotFricative.score < 0.2, 'loud but low-centroid sound (not fricative-shaped) should score low');
assert.strictEqual(lowToneNotFricative.isValidAttempt, true, 'but still counts as a valid attempt for engagement purposes');

const goodFricative = computeFricationScore(0.1, 5000);
assert.ok(goodFricative.score > 0.7, `high centroid should score well, got ${goodFricative.score}`);
assert.ok(goodFricative.score > lowToneNotFricative.score, 'fricative-shaped sound should score higher than non-fricative sound at same volume');

// --- updateChimeRotation ---
const config = { maxSpeed: 4, spinUpRate: 8, decayRate: 3 };
let state = { angle: 0, speed: 0 };
let totalChimes = 0;
for (let i = 0; i < 100; i++) {
  state = updateChimeRotation(state.angle, state.speed, 0.9, 0.05, config);
  totalChimes += state.chimesRung;
}
assert.ok(totalChimes > 0, `sustained high frication should eventually ring at least one chime, got ${totalChimes}`);
assert.ok(state.speed > 0, 'speed should be positive while sustaining good frication');

// speed should decay toward zero once frication stops
let decayState = { angle: 0, speed: 3 };
for (let i = 0; i < 50; i++) decayState = updateChimeRotation(decayState.angle, decayState.speed, 0, 0.05, config);
assert.ok(decayState.speed < 0.5, `speed should decay toward 0 once frication stops, got ${decayState.speed}`);

console.log('All chime_garden_logic tests passed.');

// --- computeFricationScore actually respects a passed-in calibrated noise floor ---
// (regression test for a real bug: an earlier version ignored the calibrated
// value and used a hardcoded constant instead)
const highCalibratedFloor = computeFricationScore(0.03, 5000, 0.05); // rms below this child's calibrated floor
assert.strictEqual(highCalibratedFloor.isValidAttempt, false, 'a rms below the passed-in calibrated noise floor should be invalid, even if it would pass the old default');

const passesCalibratedFloor = computeFricationScore(0.03, 5000, 0.01); // same rms, lower calibrated floor
assert.strictEqual(passesCalibratedFloor.isValidAttempt, true, 'the same rms should be valid once the calibrated floor is lower than it');

// --- personalizeCentroidRange ---
const readings = [3000, 3200, 0, 2900, 3100, 3050];
const personalized = personalizeCentroidRange(readings);
assert.strictEqual(personalized.usedFallback, false);
assert.ok(personalized.minCentroid < 3050 && personalized.maxCentroid > 3050, 'personalized range should bracket the child\'s actual observed centroid');

const tooFew = personalizeCentroidRange([3000, 0, 0]);
assert.strictEqual(tooFew.usedFallback, true, 'too few valid readings should fall back to defaults');

console.log('All chime_garden_logic calibration tests passed.');
