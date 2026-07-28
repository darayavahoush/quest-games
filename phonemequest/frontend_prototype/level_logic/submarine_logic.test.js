const assert = require('assert');
const {
  findFormants, computeVowelQualityScore, updateDepth, personalizeFormantTarget, TARGET_F1, TARGET_F2,
} = require('./submarine_logic.js');

const SR = 16000;

// Synthesize a formant-like test signal: white noise through two resonant
// bandpass filters, mimicking a source-filter vowel model. This is what
// findFormants is actually meant to detect — pure sine waves wouldn't
// exercise the LPC envelope estimation the way a real vowel's resonances do.
function biquadBandpass(input, sampleRate, freq, Q) {
  const w0 = (2 * Math.PI * freq) / sampleRate;
  const alpha = Math.sin(w0) / (2 * Q);
  const b0 = alpha, b1 = 0, b2 = -alpha;
  const a0 = 1 + alpha, a1 = -2 * Math.cos(w0), a2 = 1 - alpha;
  const out = new Float64Array(input.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x0 = input[i];
    const y0 = (b0 / a0) * x0 + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2;
    out[i] = y0;
    x2 = x1; x1 = x0; y2 = y1; y1 = y0;
  }
  return out;
}

function synthesizeFormantLike(f1, f2, sampleRate, durationS, seed = 42) {
  const n = Math.floor(sampleRate * durationS);
  let s = seed;
  const rand = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return (s / 0x7fffffff) - 0.5; };
  const noise = new Float64Array(n);
  for (let i = 0; i < n; i++) noise[i] = rand() * 2;

  // Real voice has natural low-frequency-heavy spectral tilt from the glottal
  // source (which pre-emphasis in findFormants is specifically designed to
  // compensate for) — flat white noise doesn't, so pre-emphasis would distort
  // rather than correct it. A simple single-pole low-pass here gives the test
  // signal that same natural tilt, matching what LPC on real voice expects.
  const tilted = new Float64Array(n);
  let prev = 0;
  for (let i = 0; i < n; i++) { tilted[i] = 0.85 * prev + 0.15 * noise[i]; prev = tilted[i]; }

  const r1 = biquadBandpass(tilted, sampleRate, f1, 10);
  const r2 = biquadBandpass(tilted, sampleRate, f2, 10);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = 0.6 * r1[i] + 0.4 * r2[i];
  let maxAbs = 0;
  for (let i = 0; i < n; i++) maxAbs = Math.max(maxAbs, Math.abs(out[i]));
  if (maxAbs > 0) for (let i = 0; i < n; i++) out[i] = (out[i] / maxAbs) * 0.5;
  return Array.from(out);
}

// --- findFormants ---
const testSignal = synthesizeFormantLike(500, 1500, SR, 0.05);
const { f1, f2 } = findFormants(testSignal, SR);
console.log(`Detected f1=${f1.toFixed(1)}Hz (target ~500Hz), f2=${f2.toFixed(1)}Hz (target ~1500Hz)`);
assert.ok(Math.abs(f1 - 500) < 200, `f1 should be near 500Hz, got ${f1}`);
assert.ok(Math.abs(f2 - 1500) < 300, `f2 should be near 1500Hz, got ${f2}`);

// silence should not produce confident formants
const silentFormants = findFormants(new Array(800).fill(0), SR);
assert.strictEqual(silentFormants.f1, 0, 'silence should give f1=0');

// --- computeVowelQualityScore ---
assert.strictEqual(computeVowelQualityScore(0, 0), 0, 'no detected formants should score 0');
const perfectScore = computeVowelQualityScore(TARGET_F1, TARGET_F2);
assert.ok(perfectScore > 0.95, `exact target formants should score near 1, got ${perfectScore}`);
const farScore = computeVowelQualityScore(TARGET_F1 + 1000, TARGET_F2 + 1000);
assert.ok(farScore < 0.3, `far-off formants should score low, got ${farScore}`);
assert.ok(perfectScore > farScore, 'closer formants should always score higher');

// --- updateDepth ---
const config = { sinkRate: 0.5, riseRate: 0.2, scoreThreshold: 0.4 };
let depth = 0;
for (let i = 0; i < 50; i++) depth = updateDepth(depth, 0.9, 0.1, config);
assert.strictEqual(depth, 1, `sustained good quality should reach max depth, got ${depth}`);

let depth2 = 1;
for (let i = 0; i < 50; i++) depth2 = updateDepth(depth2, 0.0, 0.1, config);
assert.strictEqual(depth2, 0, `losing quality should float back to surface, got ${depth2}`);

console.log('All submarine_logic tests passed.');

// --- computeVowelQualityScore with personalized targets ---
const customPerfect = computeVowelQualityScore(600, 1200, 600, 1200, 280);
assert.ok(customPerfect > 0.95, `exact custom target match should score near 1, got ${customPerfect}`);
const genericScoreForSameInput = computeVowelQualityScore(600, 1200); // vs default adult target 300/870
assert.ok(customPerfect > genericScoreForSameInput, 'a personalized target should score a child\'s own formants higher than the generic adult default would');

// --- personalizeFormantTarget ---
const goodReadings = [{ f1: 480, f2: 1100 }, { f1: 500, f2: 1150 }, { f1: 0, f2: 0 }, { f1: 510, f2: 1120 }, { f1: 495, f2: 1130 }];
const personalized = personalizeFormantTarget(goodReadings);
assert.strictEqual(personalized.usedFallback, false);
assert.ok(Math.abs(personalized.targetF1 - 496) < 15, `expected averaged f1 near 496, got ${personalized.targetF1}`);
assert.ok(Math.abs(personalized.targetF2 - 1125) < 15, `expected averaged f2 near 1125, got ${personalized.targetF2}`);

const tooFewReadings = [{ f1: 500, f2: 1100 }, { f1: 0, f2: 0 }, { f1: 0, f2: 0 }];
const fallbackResult = personalizeFormantTarget(tooFewReadings);
assert.strictEqual(fallbackResult.usedFallback, true, 'too few valid readings should fall back to generic defaults');
assert.strictEqual(fallbackResult.targetF1, TARGET_F1);

console.log('All submarine_logic calibration tests passed.');

// --- partial credit when only f1 is resolved (real-voice robustness fix) ---
const onlyF1Score = computeVowelQualityScore(TARGET_F1, 0);
assert.ok(onlyF1Score > 0, 'a good f1 match with no f2 detected should still give some credit, not zero');
assert.ok(onlyF1Score < computeVowelQualityScore(TARGET_F1, TARGET_F2), 'partial credit should be less than a full two-formant match');

const nothingDetected = computeVowelQualityScore(0, 0);
assert.strictEqual(nothingDetected, 0, 'truly nothing detected should still score 0');

console.log('All submarine_logic robustness tests passed.');

// --- computeDiveScore: the actual "not working" fix ---
const { computeLoudnessComponent, computeDiveScore } = require('./submarine_logic.js');

// Regression test: loud, sustained voicing with formants totally undetected
// (LPC failure) must still score well above a typical threshold (~0.28) —
// this is exactly the "not working" bug: previously, if LPC failed, the
// score was 0 no matter how loud/sustained the attempt was.
const loudButNoFormants = computeDiveScore(0.25, 0, 0, 0.01, 0.3);
assert.ok(loudButNoFormants >= 0.28, // 0.28 is the actual BASE_DEPTH_CONFIG.scoreThreshold used in the game
  `sustained loud voicing should clear the real gameplay threshold even with zero formant detection, got ${loudButNoFormants}`);

// silence should still score 0 regardless of formants (no voicing = no credit, correctly)
const silentScore = computeDiveScore(0.005, TARGET_F1, TARGET_F2, 0.01, 0.3);
assert.strictEqual(silentScore, 0, 'silence should score 0 even with perfect formant targets passed in');

// good formants on top of good loudness should score higher than loudness alone
const loudWithGoodFormants = computeDiveScore(0.25, TARGET_F1, TARGET_F2, 0.01, 0.3);
assert.ok(loudWithGoodFormants > loudButNoFormants, 'good formant match should still add a bonus on top of loudness alone');

console.log('All computeDiveScore tests passed.');
