const assert = require('assert');
const { computeRMS, computeLoudnessScore, updateAltitude, detectPitch, pitchToBoost } = require('./rocket_logic.js');

// --- computeRMS ---
assert.strictEqual(computeRMS([0, 0, 0, 0]), 0, 'silence should give RMS 0');

// Full-scale sine wave: RMS should be amplitude / sqrt(2)
const sineSamples = [];
for (let i = 0; i < 1000; i++) sineSamples.push(0.5 * Math.sin((i / 1000) * 2 * Math.PI * 20));
const sineRMS = computeRMS(sineSamples);
assert.ok(Math.abs(sineRMS - 0.5 / Math.sqrt(2)) < 0.01, `sine RMS should be ~0.354, got ${sineRMS}`);

// --- computeLoudnessScore ---
assert.strictEqual(computeLoudnessScore(0.005, 0.01, 0.3), 0, 'below noise floor should score 0');
assert.strictEqual(computeLoudnessScore(0.3, 0.01, 0.3), 1, 'at max expected should score 1');
assert.strictEqual(computeLoudnessScore(0.5, 0.01, 0.3), 1, 'above max expected should clamp to 1');
const midScore = computeLoudnessScore(0.155, 0.01, 0.3);
assert.ok(midScore > 0.4 && midScore < 0.6, `midpoint rms should give ~0.5 score, got ${midScore}`);

// --- updateAltitude ---
const config = { riseRate: 0.5, fallRate: 0.2, scoreThreshold: 0.4 };

// Sustained loud score should climb toward 1 over repeated steps and clamp there
let alt = 0;
for (let i = 0; i < 50; i++) alt = updateAltitude(alt, 0.9, 0.1, config);
assert.strictEqual(alt, 1, `sustained loud score should reach and clamp at altitude 1, got ${alt}`);

// Sustained quiet score should fall toward 0 and clamp there, never go negative
let alt2 = 1;
for (let i = 0; i < 50; i++) alt2 = updateAltitude(alt2, 0.0, 0.1, config);
assert.strictEqual(alt2, 0, `sustained quiet score should fall and clamp at altitude 0, got ${alt2}`);

// A single loud frame should raise altitude, a single quiet frame should lower it
const afterLoud = updateAltitude(0.5, 0.9, 0.1, config);
assert.ok(afterLoud > 0.5, 'one loud step should raise altitude');
const afterQuiet = updateAltitude(0.5, 0.0, 0.1, config);
assert.ok(afterQuiet < 0.5, 'one quiet step should lower altitude');

console.log('All rocket_logic tests passed.');

// --- detectPitch ---
const SR = 16000;
function sineAt(freq, durationS, amplitude = 0.4) {
  const n = Math.floor(SR * durationS);
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = amplitude * Math.sin((i / SR) * 2 * Math.PI * freq);
  return out;
}

const pitch220 = detectPitch(sineAt(220, 0.05), SR);
assert.ok(Math.abs(pitch220.frequency - 220) < 5, `expected ~220Hz, got ${pitch220.frequency}`);
assert.ok(pitch220.confidence > 0.9, `expected high confidence for clean tone, got ${pitch220.confidence}`);

const pitch440 = detectPitch(sineAt(440, 0.05), SR);
assert.ok(Math.abs(pitch440.frequency - 440) < 8, `expected ~440Hz, got ${pitch440.frequency}`);

const silentPitch = detectPitch(new Array(800).fill(0), SR);
assert.strictEqual(silentPitch.confidence, 0, 'silence should give zero pitch confidence');

// noisy/random signal shouldn't produce a confident pitch reading
const noise = Array.from({ length: 800 }, () => (Math.random() - 0.5) * 0.3);
const noisyPitch = detectPitch(noise, SR);
assert.ok(noisyPitch.confidence < 0.85, `random noise shouldn't be high-confidence pitch, got ${noisyPitch.confidence}`);

// --- pitchToBoost ---
assert.strictEqual(pitchToBoost({ frequency: 220, confidence: 0.95 }, 220, 500), 0, 'at boostMinHz should give 0 boost');
assert.strictEqual(pitchToBoost({ frequency: 500, confidence: 0.95 }, 220, 500), 1, 'at boostMaxHz should give full boost');
assert.strictEqual(pitchToBoost({ frequency: 400, confidence: 0.5 }, 220, 500), 0, 'low confidence should give zero boost regardless of frequency');
assert.strictEqual(pitchToBoost({ frequency: 0, confidence: 0 }, 220, 500), 0, 'no detected pitch should give zero boost');

// --- updateAltitude with pitch boost ---
const configPB = { riseRate: 0.5, fallRate: 0.2, scoreThreshold: 0.4 };
const noBoostAlt = updateAltitude(0.3, 0.9, 0.1, configPB, 0);
const fullBoostAlt = updateAltitude(0.3, 0.9, 0.1, configPB, 1);
assert.ok(fullBoostAlt > noBoostAlt, 'full pitch boost should climb faster than no boost at same loudness');

console.log('All pitch detection tests passed.');
