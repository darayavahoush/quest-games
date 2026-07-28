const assert = require('assert');
const { computeRMS, scoreBurst, popNextBubble, personalizeBurstRange, MIN_PEAK_RMS_DEFAULT } = require('./bubble_wrap_logic.js');

// --- computeRMS ---
assert.strictEqual(computeRMS([0, 0, 0]), 0);

// --- scoreBurst ---
const quietBurst = scoreBurst([0.01, 0.02, 0.01], 0.1);
assert.strictEqual(quietBurst.isValidAttempt, false, 'below MIN_PEAK_RMS should be invalid');

const strongFastBurst = scoreBurst([0.05, 0.35, 0.1], 0.15);
assert.ok(strongFastBurst.score > 0.5, `strong fast burst should score well, got ${strongFastBurst.score}`);
assert.strictEqual(strongFastBurst.isValidAttempt, true);

const strongButLongBurst = scoreBurst([0.05, 0.35, 0.3, 0.3, 0.3], 1.2); // loud but drawn out, more like sustained "fa"
assert.ok(strongButLongBurst.score < strongFastBurst.score, 'an overly long burst should score lower than a clean fast one at the same peak volume');

const emptyBurst = scoreBurst([], 0);
assert.strictEqual(emptyBurst.isValidAttempt, false, 'empty envelope should not crash, should be invalid');

// --- popNextBubble ---
let sheet = new Array(9).fill(false);
const result1 = popNextBubble(sheet, 0.8);
assert.strictEqual(result1.justPopped, 0, 'first good burst should pop bubble index 0');
sheet = result1.poppedFlags;

const result2 = popNextBubble(sheet, 0.1); // weak burst, below threshold
assert.strictEqual(result2.justPopped, -1, 'a weak burst should not pop anything');
assert.deepStrictEqual(result2.poppedFlags, sheet, 'sheet should be unchanged after a weak burst — no fail state, just no progress');

const result3 = popNextBubble(sheet, 0.9);
assert.strictEqual(result3.justPopped, 1, 'next good burst should pop the next unpopped bubble, index 1');

// full sheet should not error or wrap around
let fullSheet = new Array(3).fill(true);
const resultFull = popNextBubble(fullSheet, 0.9);
assert.strictEqual(resultFull.justPopped, -1, 'a full sheet should report nothing left to pop, not crash or wrap');

console.log('All bubble_wrap_logic tests passed.');

// --- personalizeBurstRange fixes the onset/scoring coordination bug ---
// A quiet child+mic setup: calibrated noise floor is low, and their actual
// "ha!" bursts only reach ~0.03-0.04 peak RMS — well below the old fixed
// MIN_PEAK_RMS_DEFAULT of 0.05. Before the fix, the onset detector (which
// used the calibrated floor) would trigger on this burst, but scoreBurst
// (which used the fixed 0.05 constant) would then reject it as invalid —
// the two were never coordinated. After personalization, they should agree.
const quietChildNoiseFloor = 0.008;
const quietChildBursts = [0.035, 0.04, 0.038];
const range = personalizeBurstRange(quietChildBursts, quietChildNoiseFloor);
assert.ok(range.minPeakRms < 0.035, `personalized min should be below this child's actual burst level, got ${range.minPeakRms}`);

const thisChildsBurst = scoreBurst([0.01, 0.036, 0.02], 0.15, range.minPeakRms, range.maxExpectedPeakRms);
assert.strictEqual(thisChildsBurst.isValidAttempt, true, 'a burst at this child\'s own calibrated level should now score as valid');

// same burst against the OLD fixed default would have failed — demonstrates the bug that was fixed
const wouldHaveFailedBefore = scoreBurst([0.01, 0.036, 0.02], 0.15, MIN_PEAK_RMS_DEFAULT, 0.4);
assert.strictEqual(wouldHaveFailedBefore.isValidAttempt, false, 'confirms the old fixed-default behavior really was the bug being fixed');

console.log('All bubble_wrap_logic calibration tests passed.');
