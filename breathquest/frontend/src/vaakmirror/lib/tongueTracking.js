// MediaPipe's face mesh tracks lips and the outer face, but not the tongue
// itself — there's no landmark for it. This is a lightweight, honestly
// approximate substitute: while the mouth is open, sample pixels inside the
// mouth region and look for tongue-colored (pink/red) ones. From that we
// estimate three things:
//   - visibility:     how much of the open-mouth area is tongue-colored
//   - elevation:       how high up in that area the tongue-colored pixels sit
//   - cavityDarkness:  how much of the REST of the area (non-tongue-colored)
//                       is dark open cavity rather than bright teeth/lips —
//                       a rough proxy for retraction, since a pulled-back
//                       tongue doesn't present a lit surface to the camera
// Lighting, skin tone, and camera quality all affect accuracy — this is
// meant to give directional feedback (higher/lower, more/less visible,
// pulled back or not), not a precise measurement.

const SAMPLE_W = 48
const SAMPLE_H = 32
const MIN_TONGUE_PIXELS_RATIO = 0.012 // below this, treat elevation as unknown rather than guess

function rgbToHsv(r, g, b) {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  const s = max === 0 ? 0 : d / max
  const v = max
  return [h, s, v]
}

// Pink/red hue band, moderate-plus saturation, mid brightness — excludes
// white/cream teeth (low saturation) and dark cavity shadow (low value).
function isTongueColor(r, g, b) {
  const [h, s, v] = rgbToHsv(r, g, b)
  const hueMatch = h >= 330 || h <= 30
  return hueMatch && s > 0.22 && v > 0.18 && v < 0.98
}

// Dark, low-saturation pixels — the open oral cavity behind a retracted
// tongue reads this way (no tongue surface facing the camera to catch
// light, and not bright enough to be teeth). Deliberately excludes
// anything already classified as tongue-colored above, even if it happens
// to be dim, so the two categories can't double-count the same pixel.
function isDarkCavity(r, g, b) {
  const [, s, v] = rgbToHsv(r, g, b)
  return v < 0.22 && s < 0.4
}

function px(landmarks, i, w, h) {
  const p = landmarks[i]
  return { x: p.x * w, y: p.y * h }
}

// scratchCanvas is an offscreen (never-displayed) canvas reused across
// frames purely as a scratchpad for cropping + downsampling the mouth
// region before reading its pixels.
export function computeTongueMetrics(video, landmarks, scratchCanvas, w, h) {
  if (!landmarks || !scratchCanvas) return null

  const left = px(landmarks, 61, w, h)
  const right = px(landmarks, 291, w, h)
  const upper = px(landmarks, 13, w, h)
  const lower = px(landmarks, 14, w, h)

  const xMin = Math.min(left.x, right.x)
  const xMax = Math.max(left.x, right.x)
  const yMin = Math.min(upper.y, lower.y)
  const yMax = Math.max(upper.y, lower.y)
  const boxW = xMax - xMin
  const boxH = yMax - yMin
  if (boxW < 6 || boxH < 6) return null

  // Shrink inward so lip color doesn't leak into the sample.
  const padX = boxW * 0.14
  const padY = boxH * 0.08
  const sx = xMin + padX
  const sy = yMin + padY
  const sw = Math.max(2, boxW - padX * 2)
  const sh = Math.max(2, boxH - padY * 2)

  scratchCanvas.width = SAMPLE_W
  scratchCanvas.height = SAMPLE_H
  const ctx = scratchCanvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, SAMPLE_W, SAMPLE_H)

  let data
  try {
    data = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data
  } catch {
    return null
  }

  let count = 0
  let xSum = 0
  let ySum = 0
  let brightnessSum = 0
  let darkCavityCount = 0
  const total = SAMPLE_W * SAMPLE_H

  for (let py = 0; py < SAMPLE_H; py++) {
    for (let pxi = 0; pxi < SAMPLE_W; pxi++) {
      const idx = (py * SAMPLE_W + pxi) * 4
      const r = data[idx]
      const g = data[idx + 1]
      const b = data[idx + 2]
      brightnessSum += (r + g + b) / 3
      if (isTongueColor(r, g, b)) {
        count++
        xSum += pxi
        ySum += py
      } else if (isDarkCavity(r, g, b)) {
        darkCavityCount++
      }
    }
  }

  const visibility = count / total
  const enoughPixels = count > total * MIN_TONGUE_PIXELS_RATIO
  const elevation = enoughPixels ? 1 - ySum / count / SAMPLE_H : null
  // Lateral: horizontal centroid of tongue-colored pixels within the crop,
  // which spans [min(61.x, 291.x), max(61.x, 291.x)] in raw (un-mirrored)
  // camera-space pixels.
  //
  // IMPORTANT — this used to be commented (and scored, in tongueMoves.js) as
  // "0 = toward landmark 61, 1 = toward landmark 291", i.e. 0 = subject's-
  // left. That was backwards. Google's face-landmark naming convention
  // ("left"/"right" are always relative to the SUBJECT, not the image —
  // see e.g. the ML Kit Landmark docs) means landmark 61 is the subject's
  // OWN left mouth corner. But a front-facing camera captures a subject's
  // left side on the RIGHT half of the raw frame (stand facing the camera
  // and raise your left hand — it lands on the raw frame's right side,
  // same reason old non-mirrored webcam apps feel "backwards"). So in raw
  // pixel terms landmark 61 (subject's-left) sits at the LARGER x, and
  // landmark 291 (subject's-right) sits at the SMALLER x — the opposite of
  // what the old comment assumed. That means, in this 0..1 crop-relative
  // scale:
  //   0 = toward the crop's raw-left edge = toward landmark 291 = the
  //       subject's own RIGHT mouth corner
  //   1 = toward the crop's raw-right edge = toward landmark 61 = the
  //       subject's own LEFT mouth corner
  // tongueMoves.js and faceOverlay.js's drawTongueArrow have been updated
  // to match this. This resolves the direction from the documented landmark
  // convention + camera geometry rather than guessing — but a real-camera
  // sanity check (e.g. a colored sticker on one cheek) before trusting it
  // clinically is still worthwhile, the same as any of this file's other
  // approximations.
  const lateral = enoughPixels ? xSum / count / SAMPLE_W : null
  const brightness = brightnessSum / total // 0-255, useful for a lighting warning

  // Retraction proxy: with a single 2D camera there's no real depth signal,
  // so "tongue pulled back" is approximated as "the visible mouth opening
  // reads as dark open cavity rather than tongue surface or teeth" — a
  // retracted tongue doesn't present a lit surface toward the camera the
  // way a protruded or raised one does. This is independent of elevation
  // (which measures WHERE tongue-colored pixels sit, when there are any)
  // and independent of visibility (how MUCH of the sample is tongue-
  // colored) — cavityDarkness measures a third thing: how much of the
  // non-tongue-colored remainder is dark cavity versus bright teeth/lips.
  // Same honesty caveat as the rest of this file: approximate, lighting-
  // and skin-tone-sensitive, meant for directional feedback only — needs
  // checking against real kids before the ranges in tongueMoves.js are
  // trusted.
  const cavityDarkness = darkCavityCount / total

  return { visibility, elevation, lateral, brightness, cavityDarkness }
}

function inRangeDist(value, [lo, hi]) {
  if (value >= lo && value <= hi) return 0
  return Math.min(Math.abs(value - lo), Math.abs(value - hi))
}

// The pixel-color tongue heuristic drifts per kid with skin tone, lighting,
// and camera angle (see the module comment above) — targets tuned against
// one face won't necessarily fit another. ASSUMED_DEFAULT_BASELINE_ELEVATION
// is roughly where a relaxed, resting tongue sits in these units for an
// "average" calibration-less setup; a calibrated child's own resting
// elevation is compared against that assumption to get a per-kid offset,
// which then shifts both movement targets by the same amount.
const ASSUMED_DEFAULT_BASELINE_ELEVATION = 0.45
// A relaxed, centered tongue should sit near the horizontal middle of the
// sample — unlike elevation, 0.5 is the natural "no offset" assumption.
const ASSUMED_DEFAULT_BASELINE_LATERAL = 0.5

// A relaxed, resting mouth (tongue neither strongly protruded nor visibly
// retracted) should show a modest amount of cavity shadow — same
// per-kid-offset philosophy as elevation/lateral above: a calibrated
// child's own resting cavityDarkness is compared against this assumption.
const ASSUMED_DEFAULT_BASELINE_CAVITY_DARKNESS = 0.15

export function computeElevationOffset(baselineElevation) {
  if (baselineElevation == null) return 0
  return baselineElevation - ASSUMED_DEFAULT_BASELINE_ELEVATION
}

export function computeLateralOffset(baselineLateral) {
  if (baselineLateral == null) return 0
  return baselineLateral - ASSUMED_DEFAULT_BASELINE_LATERAL
}

export function computeCavityDarknessOffset(baselineCavityDarkness) {
  if (baselineCavityDarkness == null) return 0
  return baselineCavityDarkness - ASSUMED_DEFAULT_BASELINE_CAVITY_DARKNESS
}

// target.lateral is optional — omitting it (as tongue-up/tongue-back do)
// means lateral position isn't scored at all, so those existing moves are
// completely unaffected by this parameter.
export function scoreTongueMove(metrics, target, elevationOffset = 0, lateralOffset = 0, cavityOffset = 0) {
  if (!metrics) return { score: 0, tier: 'red' }

  const visDist = inRangeDist(metrics.visibility, target.visibility)
  const needsElevation = target.elevation[0] > 0 || target.elevation[1] < 1
  const adjustedElevation = needsElevation
    ? [
        Math.max(0, Math.min(1, target.elevation[0] + elevationOffset)),
        Math.max(0, Math.min(1, target.elevation[1] + elevationOffset)),
      ]
    : target.elevation
  const elevDist =
    metrics.elevation == null ? (needsElevation ? 0.3 : 0) : inRangeDist(metrics.elevation, adjustedElevation)

  let lateralDist = 0
  if (target.lateral) {
    const adjustedLateral = [
      Math.max(0, Math.min(1, target.lateral[0] + lateralOffset)),
      Math.max(0, Math.min(1, target.lateral[1] + lateralOffset)),
    ]
    lateralDist = metrics.lateral == null ? 0.3 : inRangeDist(metrics.lateral, adjustedLateral)
  }

  // target.cavityDarkness is optional, same pattern as target.lateral —
  // omitting it means retraction isn't scored at all, so every existing
  // move (which doesn't set it) is completely unaffected by this axis.
  let cavityDist = 0
  if (target.cavityDarkness) {
    const adjustedCavity = [
      Math.max(0, Math.min(1, target.cavityDarkness[0] + cavityOffset)),
      Math.max(0, Math.min(1, target.cavityDarkness[1] + cavityOffset)),
    ]
    cavityDist =
      metrics.cavityDarkness == null ? 0.3 : inRangeDist(metrics.cavityDarkness, adjustedCavity)
  }

  const distance = visDist + elevDist + lateralDist + cavityDist
  const score = Math.max(0, 1 - distance * 1.5)

  let tier = 'red'
  if (score > 0.76) tier = 'green'
  else if (score > 0.4) tier = 'yellow'

  return { score, tier }
}
