// oo level — vowel duration + lip rounding, via LPC formant estimation.
// Browsers don't give you formants for free (unlike Python's parselmouth),
// so this implements a lightweight LPC (linear predictive coding) formant
// tracker from scratch: autocorrelation -> Levinson-Durbin -> LPC spectral
// envelope -> peak-picking for F1/F2. Standard technique, not novel, but
// worth having tested rather than trusted blind.

function hammingWindow(N) {
  const w = new Float64Array(N);
  for (let i = 0; i < N; i++) w[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (N - 1));
  return w;
}

function autocorrelate(x, maxLag) {
  const N = x.length;
  const r = new Float64Array(maxLag + 1);
  for (let lag = 0; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < N - lag; i++) sum += x[i] * x[i + lag];
    r[lag] = sum;
  }
  return r;
}

function levinsonDurbin(r, order) {
  let a = new Float64Array(order + 1);
  a[0] = 1;
  let e = r[0];
  if (e === 0) return { a, error: 0 };
  for (let i = 1; i <= order; i++) {
    let acc = r[i];
    for (let j = 1; j < i; j++) acc += a[j] * r[i - j];
    const k = -acc / e;
    const newA = a.slice();
    newA[i] = k;
    for (let j = 1; j < i; j++) newA[j] = a[j] + k * a[i - j];
    a = newA;
    e *= (1 - k * k);
    if (e <= 0) break;
  }
  return { a, error: e };
}

function lpcMagnitudeSpectrum(a, sampleRate, numPoints, maxFreq) {
  const mags = new Float64Array(numPoints);
  for (let i = 0; i < numPoints; i++) {
    const freq = (i / numPoints) * maxFreq;
    const omega = (2 * Math.PI * freq) / sampleRate;
    let real = 0, imag = 0;
    for (let k = 0; k < a.length; k++) {
      real += a[k] * Math.cos(-omega * k);
      imag += a[k] * Math.sin(-omega * k);
    }
    const denom = Math.sqrt(real * real + imag * imag);
    mags[i] = denom > 1e-9 ? 1 / denom : 0;
  }
  return mags;
}

// order 12 is a reasonable default for ~16-44kHz speech (roughly 2 poles per
// expected formant up to ~4kHz, plus a couple extra for spectral tilt).
function findFormants(samples, sampleRate, order = 12, numPoints = 512, maxFreq = 4000) {
  const N = samples.length;
  const win = hammingWindow(N);
  const windowed = new Float64Array(N);
  for (let i = 0; i < N; i++) windowed[i] = samples[i] * win[i];

  const pre = new Float64Array(N); // pre-emphasis, standard for LPC on speech
  pre[0] = windowed[0];
  for (let i = 1; i < N; i++) pre[i] = windowed[i] - 0.97 * windowed[i - 1];

  const r = autocorrelate(pre, order);
  if (r[0] === 0) return { f1: 0, f2: 0 };
  const { a } = levinsonDurbin(r, order);
  const mags = lpcMagnitudeSpectrum(a, sampleRate, numPoints, maxFreq);

  // Relaxed to immediate-neighbor peaks (±1, not ±2) — real voice spectra are
  // noisier than the synthetic test signal, and the stricter version was
  // finding zero peaks far too often on messier real input, which silently
  // zeroed the score. Slightly more prone to spurious small peaks, but taking
  // only the lowest two frequencies (formants are the dominant low structure)
  // keeps that in check.
  const peaks = [];
  for (let i = 1; i < numPoints - 1; i++) {
    if (mags[i] > mags[i - 1] && mags[i] > mags[i + 1]) {
      peaks.push({ freq: (i / numPoints) * maxFreq, mag: mags[i] });
    }
  }
  peaks.sort((p1, p2) => p1.freq - p2.freq);
  return { f1: peaks.length > 0 ? peaks[0].freq : 0, f2: peaks.length > 1 ? peaks[1].freq : 0 };
}

// Typical adult "oo" (as in "boot") formant targets — same values as the
// Python vowel_quality.py starting point. Children's formants run higher;
// needs recalibration against real samples, same caveat as the Python side.
const TARGET_F1 = 300.0;
const TARGET_F2 = 870.0;
const FORMANT_TOLERANCE_HZ = 450.0; // widened from 280 — real-voice LPC is noisier than the synthetic test signal suggested

function computeVowelQualityScore(f1, f2, targetF1 = TARGET_F1, targetF2 = TARGET_F2, tolerance = FORMANT_TOLERANCE_HZ) {
  if (f1 <= 0 && f2 <= 0) return 0;
  if (f2 <= 0) {
    // Only one formant resolved this frame — give partial credit rather than
    // zeroing out. All-or-nothing on both formants made the game feel
    // unresponsive whenever LPC didn't cleanly separate two peaks, which
    // happens more often on real voices than the synthetic test signal.
    const f1Dist = Math.abs(f1 - targetF1);
    return Math.max(0, 1 - f1Dist / tolerance) * 0.6;
  }
  const f1Dist = Math.abs(f1 - targetF1);
  const f2Dist = Math.abs(f2 - targetF2);
  return Math.max(0, 1 - (f1Dist + f2Dist) / (2 * tolerance));
}

function computeLoudnessComponent(rms, noiseFloor, maxExpectedRms) {
  if (rms <= noiseFloor * 1.3) return 0;
  return Math.max(0, Math.min(1, (rms - noiseFloor) / (maxExpectedRms - noiseFloor)));
}

// The actual dive score: primarily driven by sustained loudness (robust,
// always detectable), with formant match as a BONUS multiplier rather than a
// gate. Real play-testing showed that gating everything on formant match
// made the game feel broken whenever LPC didn't resolve cleanly — client-side
// LPC on real (especially children's) voices just isn't reliable enough to
// be the sole signal. Loudness alone gets 60% credit; a good "oo" shape adds
// up to another 40% on top, so the game always responds to sustained voicing
// and rewards better vowel shaping without depending on it working perfectly.
function computeDiveScore(rms, f1, f2, noiseFloor, maxExpectedRms, targetF1 = TARGET_F1, targetF2 = TARGET_F2, tolerance = FORMANT_TOLERANCE_HZ) {
  const loudness = computeLoudnessComponent(rms, noiseFloor, maxExpectedRms);
  if (loudness <= 0) return 0;
  const formant = computeVowelQualityScore(f1, f2, targetF1, targetF2, tolerance);
  return loudness * (0.6 + 0.4 * formant);
}

// Depth state machine — same shape as rocket_logic's altitude, sustained
// quality+duration dives deeper, losing it lets the sub float back up gently.
function updateDepth(currentDepth, qualityScore, dt, config) {
  const { sinkRate, riseRate, scoreThreshold } = config;
  if (qualityScore >= scoreThreshold) {
    const intensity = (qualityScore - scoreThreshold) / (1 - scoreThreshold);
    return Math.max(0, Math.min(1, currentDepth + sinkRate * (0.4 + 0.6 * intensity) * dt));
  }
  return Math.max(0, Math.min(1, currentDepth - riseRate * dt));
}

// Averages multiple findFormants() readings taken during the calibration
// "say oooo" phase into a single personalized target, ignoring frames where
// nothing was detected (silence/noise between attempts). Falls back to the
// generic adult defaults if too few valid readings came through.
function personalizeFormantTarget(formantReadings, fallbackF1 = TARGET_F1, fallbackF2 = TARGET_F2) {
  const valid = formantReadings.filter(r => r.f1 > 0 && r.f2 > 0);
  if (valid.length < 3) return { targetF1: fallbackF1, targetF2: fallbackF2, usedFallback: true };
  const targetF1 = valid.reduce((s, r) => s + r.f1, 0) / valid.length;
  const targetF2 = valid.reduce((s, r) => s + r.f2, 0) / valid.length;
  return { targetF1, targetF2, usedFallback: false };
}

if (typeof module !== 'undefined') {
  module.exports = {
    hammingWindow, autocorrelate, levinsonDurbin, lpcMagnitudeSpectrum, findFormants,
    computeVowelQualityScore, computeLoudnessComponent, computeDiveScore, updateDepth,
    personalizeFormantTarget, TARGET_F1, TARGET_F2,
  };
}
