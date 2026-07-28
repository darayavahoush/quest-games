// Pure logic, no DOM/Web Audio dependencies, so it can be unit tested directly
// in Node before being embedded in the game's <script> block.

function computeRMS(floatSamples) {
  let sumSquares = 0;
  for (let i = 0; i < floatSamples.length; i++) {
    sumSquares += floatSamples[i] * floatSamples[i];
  }
  return Math.sqrt(sumSquares / floatSamples.length);
}

function computeLoudnessScore(rms, noiseFloor, maxExpected) {
  if (rms <= noiseFloor) return 0;
  const score = (rms - noiseFloor) / (maxExpected - noiseFloor);
  return Math.max(0, Math.min(1, score));
}

// Altitude state machine: sustained loud score raises altitude smoothly,
// low score lowers it gently — never abruptly, so there's no "crash" feeling.
// pitchBoost (0-1, optional) adds extra speed on top of the loudness-driven
// base rate — purely a game-feel multiplier, not part of the scored/logged
// loudness value itself.
function updateAltitude(currentAltitude, score, dt, config, pitchBoost = 0) {
  const { riseRate, fallRate, scoreThreshold } = config;
  let next;
  if (score >= scoreThreshold) {
    const intensity = (score - scoreThreshold) / (1 - scoreThreshold); // 0..1
    const loudnessMultiplier = 0.4 + 1.4 * intensity; // wider range: barely-passing to very loud feels dramatically different
    const pitchMultiplier = 1 + 0.5 * pitchBoost; // up to +50% extra on top
    next = currentAltitude + riseRate * loudnessMultiplier * pitchMultiplier * dt;
  } else {
    next = currentAltitude - fallRate * dt;
  }
  return Math.max(0, Math.min(1, next));
}

// Pitch detection via autocorrelation (classic technique — same approach as the
// well-known Chris Wilson "pitchdetect" example). Returns {frequency, confidence}.
// confidence is the normalized autocorrelation peak (0-1) — low confidence means
// "don't trust this," used to avoid false pitch boosts from silence/noise.
function detectPitch(floatSamples, sampleRate, minHz = 80, maxHz = 600) {
  const SIZE = floatSamples.length;
  const maxLag = Math.floor(sampleRate / minHz);
  const minLag = Math.floor(sampleRate / maxHz);

  // quick RMS gate — no point autocorrelating silence
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += floatSamples[i] * floatSamples[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return { frequency: 0, confidence: 0 };

  const correlations = [];
  for (let lag = minLag; lag <= maxLag && lag < SIZE; lag++) {
    let correlation = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < SIZE - lag; i++) {
      correlation += floatSamples[i] * floatSamples[i + lag];
      normA += floatSamples[i] * floatSamples[i];
      normB += floatSamples[i + lag] * floatSamples[i + lag];
    }
    const denom = Math.sqrt(normA * normB);
    correlations.push(denom > 0 ? correlation / denom : 0);
  }

  // Take the first strong local peak (shortest lag = highest frequency), not the
  // global max — a clean tone also correlates highly at integer multiples of its
  // true period (octave/subharmonic error), and boundary effects can make a longer
  // lag win narrowly. The fundamental is always the first one, so stop there.
  const PEAK_THRESHOLD = 0.85;
  let bestIndex = -1;
  for (let i = 1; i < correlations.length - 1; i++) {
    if (correlations[i] > PEAK_THRESHOLD &&
        correlations[i] >= correlations[i - 1] &&
        correlations[i] >= correlations[i + 1]) {
      bestIndex = i;
      break;
    }
  }
  if (bestIndex === -1) {
    // no clean local peak crossed the threshold — fall back to whatever's highest,
    // but this case should generally produce a low, honestly-uncertain confidence
    let bestVal = -1;
    for (let i = 0; i < correlations.length; i++) {
      if (correlations[i] > bestVal) { bestVal = correlations[i]; bestIndex = i; }
    }
  }

  if (bestIndex === -1) return { frequency: 0, confidence: 0 };
  const bestLag = minLag + bestIndex;
  const bestCorrelation = correlations[bestIndex];
  if (bestCorrelation <= 0) return { frequency: 0, confidence: 0 };
  const frequency = sampleRate / bestLag;
  return { frequency, confidence: Math.max(0, Math.min(1, bestCorrelation)) };
}

// Maps a detected pitch to a 0-1 "boost" amount for game-feel speed only.
// This is deliberately generous/loose (game feel, not clinical pitch analysis) —
// anything from a relaxed to an excited/high vocal pitch gives some boost,
// full boost above BOOST_MAX_HZ. Low-confidence detections give zero boost
// so background noise never causes a random speed spike.
function pitchToBoost(pitchResult, boostMinHz = 220, boostMaxHz = 500, minConfidence = 0.85) {
  if (pitchResult.confidence < minConfidence || pitchResult.frequency <= 0) return 0;
  const t = (pitchResult.frequency - boostMinHz) / (boostMaxHz - boostMinHz);
  return Math.max(0, Math.min(1, t));
}

module.exports = { computeRMS, computeLoudnessScore, updateAltitude, detectPitch, pitchToBoost };
