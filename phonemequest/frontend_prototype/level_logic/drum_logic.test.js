const assert = require('assert');
const { computeRMS, makeOnsetDetector, scoreRhythm, updateDrumFill, calibrateFromLoudPhase } = require('./drum_logic.js');

// --- computeRMS ---
assert.strictEqual(computeRMS([0, 0, 0]), 0, 'silence should give RMS 0');
assert.ok(computeRMS([0.5, -0.5, 0.5, -0.5]) > 0.4, 'constant-amplitude signal should give high RMS');

// --- makeOnsetDetector ---
// simulate a 2000ms stream of 50ms frames: silence, then 4 clean "hits"
// spaced 400ms apart (roughly 8 frames of gap between hits at 50ms/frame)
const detector = makeOnsetDetector({ riseThreshold: 0.1, refractoryMs: 180 });
const onsets = [];
const FRAME_MS = 50;
const hitFrames = new Set([10, 18, 26, 34]); // roughly every 400ms = 8 frames apart
for (let frame = 0; frame < 45; frame++) {
  const timeMs = frame * FRAME_MS;
  const rms = hitFrames.has(frame) ? 0.3 : 0.01;
  if (detector(rms, timeMs)) onsets.push(timeMs);
}
assert.strictEqual(onsets.length, 4, `expected 4 onsets detected, got ${onsets.length}: ${onsets}`);

// refractory period should suppress a second trigger from the same sustained hit
const detector2 = makeOnsetDetector({ riseThreshold: 0.1, refractoryMs: 180 });
const onsets2 = [];
for (let frame = 0; frame < 10; frame++) {
  // frames 2-6 are all loud (one sustained hit, not 5 separate hits)
  const rms = (frame >= 2 && frame <= 6) ? 0.3 : 0.01;
  if (detector2(rms, frame * FRAME_MS)) onsets2.push(frame * FRAME_MS);
}
assert.strictEqual(onsets2.length, 1, `a single sustained loud period should register as one onset, got ${onsets2.length}`);

// --- scoreRhythm ---
const perfectTiming = scoreRhythm([0, 400, 800, 1200], 400, 150);
assert.ok(perfectTiming.score > 0.95, `perfectly even 400ms spacing should score near 1, got ${perfectTiming.score}`);

const sloppyTiming = scoreRhythm([0, 200, 900, 1000], 400, 150);
assert.ok(sloppyTiming.score < perfectTiming.score, 'uneven spacing should score lower than even spacing');

const tooFewOnsets = scoreRhythm([0], 400, 150);
assert.strictEqual(tooFewOnsets.score, 0, 'a single onset has no interval to score, should be 0');

// --- updateDrumFill ---
const config = { fillPerHit: 0.2, drainRate: 0.05 };
let fill = 0;
fill = updateDrumFill(fill, true, 1.0, 0.1, config); // one good hit
assert.ok(fill > 0.15, `a good hit should raise fill noticeably, got ${fill}`);

let drainedFill = 0.5;
for (let i = 0; i < 150; i++) drainedFill = updateDrumFill(drainedFill, false, 0, 0.1, config); // 150 * 0.05 * 0.1 = 0.75 total drain, more than enough from 0.5
assert.strictEqual(drainedFill, 0, `fill should drain to 0 with no hits, got ${drainedFill}`);

console.log('All drum_logic tests passed.');

// --- calibrateFromLoudPhase ---
// simulate a child whose real "ma-ma-ma" attempts hit ~0.15 peak RMS, with
// noise floor at 0.01 — old fixed noiseFloor*3 = 0.03 would actually still
// work here, but the point is proving the personalized threshold sits
// sensibly between ambient and the child's real peak, not just trusting it.
const rmsTrack = [];
const timeTrack = [];
const FRAME = 50;
const hitFrames2 = [8, 16, 24, 32, 40]; // ~400ms apart at 50ms/frame
for (let frame = 0; frame < 50; frame++) {
  timeTrack.push(frame * FRAME);
  rmsTrack.push(hitFrames2.includes(frame) ? 0.15 : 0.01);
}
const calibResult = calibrateFromLoudPhase(rmsTrack, timeTrack, 0.01);
assert.ok(calibResult.riseThreshold > 0.01 && calibResult.riseThreshold < 0.15,
  `personalized threshold should sit between ambient and peak, got ${calibResult.riseThreshold}`);
assert.strictEqual(calibResult.usedFallbackInterval, false, 'enough real onsets should mean no fallback needed');
assert.ok(Math.abs(calibResult.targetIntervalMs - 400) < 60,
  `seeded target interval should be near this child's actual ~400ms rate, got ${calibResult.targetIntervalMs}`);

// too little real signal during calibration should fall back gracefully, not crash
const sparseResult = calibrateFromLoudPhase([0.01, 0.01, 0.01], [0, 50, 100], 0.01);
assert.strictEqual(sparseResult.usedFallbackInterval, true, 'too few onsets should fall back to the default interval');

// --- regression test for the "not sensitive enough" bug ---
// Realistic scenario: one unusually loud burst plus several typical, quieter
// ones. The OLD calibration (0.35 * single peak) would set a threshold based
// on the loud outlier, high enough that the quieter typical bursts wouldn't
// cross it during actual gameplay. The fix calibrates against the median
// burst level instead, so ordinary attempts should reliably cross it.
const rmsTrack2 = [], timeTrack2 = [];
const typicalBurstFrames = [8, 16, 32, 40]; // quieter, typical "ma" attempts
const oneLoudOutlierFrame = 24; // one unusually loud moment
for (let frame = 0; frame < 50; frame++) {
  timeTrack2.push(frame * FRAME);
  if (frame === oneLoudOutlierFrame) rmsTrack2.push(0.35);
  else if (typicalBurstFrames.includes(frame)) rmsTrack2.push(0.08);
  else rmsTrack2.push(0.01);
}
const sensitivityResult = calibrateFromLoudPhase(rmsTrack2, timeTrack2, 0.01);
// the threshold must sit low enough that a typical 0.08 burst still crosses it
assert.ok(sensitivityResult.riseThreshold < 0.08,
  `threshold should be crossable by a typical burst (0.08), got ${sensitivityResult.riseThreshold} — ` +
  `calibrating against the single loud outlier (0.35) instead of typical bursts would fail this`);

console.log('All drum_logic calibration tests passed.');
