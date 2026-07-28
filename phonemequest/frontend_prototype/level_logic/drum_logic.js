// ma level — syllable repetition / rhythm (diadochokinetic rate).
// Energy-based onset detection: track the RMS envelope, flag a rise above a
// threshold following a quiet gap as one "hit" (one "ma"), then score how
// evenly spaced those hits are against a target tempo.

function computeRMS(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

// Call this once per short frame (e.g. every 50ms) with that frame's RMS and
// the running time; it maintains onset-detection state internally and
// returns whether *this* frame is a new onset.
function makeOnsetDetector({ riseThreshold = 0.04, refractoryMs = 180 } = {}) {
  let lastOnsetTime = -Infinity;
  let wasBelowThreshold = true;

  return function detectOnset(rms, timeMs) {
    let isOnset = false;
    if (rms >= riseThreshold) {
      if (wasBelowThreshold && (timeMs - lastOnsetTime) >= refractoryMs) {
        isOnset = true;
        lastOnsetTime = timeMs;
      }
      wasBelowThreshold = false;
    } else {
      wasBelowThreshold = true;
    }
    return isOnset;
  };
}

// Scores a list of onset timestamps (ms) against a target tempo — mirrors
// the Python syllable_rhythm.py's approach: each inter-onset interval scored
// against the target, tolerance-based falloff, averaged.
function scoreRhythm(onsetTimesMs, targetIntervalMs = 400, toleranceMs = 150) {
  if (onsetTimesMs.length < 2) return { score: 0, numOnsets: onsetTimesMs.length };
  const intervals = [];
  for (let i = 1; i < onsetTimesMs.length; i++) intervals.push(onsetTimesMs[i] - onsetTimesMs[i - 1]);
  const scores = intervals.map(iv => Math.max(0, Math.min(1, 1 - Math.abs(iv - targetIntervalMs) / toleranceMs)));
  const score = scores.reduce((a, b) => a + b, 0) / scores.length;
  return { score, numOnsets: onsetTimesMs.length, meanIntervalMs: intervals.reduce((a, b) => a + b, 0) / intervals.length };
}

// Calibration helper: given raw RMS samples and their timestamps from the
// "say ma-ma-ma quickly!" calibration phase, (a) finds a burst threshold
// that's actually reachable for this child (a fraction of the way between
// ambient noise and their own peak loudness, not just a flat multiple of
// noise floor), and (b) if enough real onsets came through, seeds the
// starting target rhythm from the child's own natural repetition rate
// instead of a generic default.
function calibrateFromLoudPhase(rmsSamples, timestampsMs, noiseFloor, fallbackIntervalMs = 450) {
  // Calibrate against a TYPICAL burst level (median of above-ambient samples),
  // not the single loudest spike — using the peak made the threshold too
  // strict for ordinary attempts, since by definition most real "ma" bursts
  // are quieter than the one loudest moment. Real play-testing surfaced this
  // as "not sensitive enough."
  const burstSamples = rmsSamples.filter(r => r > noiseFloor * 1.3);
  let typicalBurstLevel;
  if (burstSamples.length >= 3) {
    const sorted = [...burstSamples].sort((a, b) => a - b);
    typicalBurstLevel = sorted[Math.floor(sorted.length * 0.5)];
  } else {
    typicalBurstLevel = Math.max(...rmsSamples, noiseFloor * 2);
  }
  const riseThreshold = noiseFloor + 0.2 * (typicalBurstLevel - noiseFloor);

  const detector = makeOnsetDetector({ riseThreshold, refractoryMs: 180 });
  const onsets = [];
  for (let i = 0; i < rmsSamples.length; i++) {
    if (detector(rmsSamples[i], timestampsMs[i])) onsets.push(timestampsMs[i]);
  }

  if (onsets.length < 3) {
    return { riseThreshold, targetIntervalMs: fallbackIntervalMs, usedFallbackInterval: true, numOnsetsFound: onsets.length };
  }
  const { meanIntervalMs } = scoreRhythm(onsets, fallbackIntervalMs, 1e9); // huge tolerance, just want meanIntervalMs out
  const targetIntervalMs = Math.max(280, Math.min(700, meanIntervalMs));
  return { riseThreshold, targetIntervalMs, usedFallbackInterval: false, numOnsetsFound: onsets.length };
}

// Drum fill state — each good-timing onset adds a chunk of "fill"; fill
// gently drains over time so the child has to keep a steady rhythm going
// rather than banking one good hit indefinitely.
function updateDrumFill(currentFill, onsetJustHappened, lastOnsetQuality, dt, config) {
  const { fillPerHit, drainRate } = config;
  let next = currentFill - drainRate * dt;
  if (onsetJustHappened) next += fillPerHit * lastOnsetQuality;
  return Math.max(0, Math.min(1, next));
}

if (typeof module !== 'undefined') {
  module.exports = { computeRMS, makeOnsetDetector, scoreRhythm, updateDrumFill, calibrateFromLoudPhase };
}
