// MediaPipe's face mesh tracks lips and the outer face, but not the tongue
// itself — there's no landmark for it. This is a lightweight, honestly
// approximate substitute: while the mouth is open, sample pixels inside the
// mouth region and look for tongue-colored (pink/red) ones. From that we
// estimate two things:
//   - visibility: how much of the open-mouth area is tongue-colored
//   - elevation:  how high up in that area the tongue-colored pixels sit
// Lighting, skin tone, and camera quality all affect accuracy — this is
// meant to give directional feedback (higher/lower, more/less visible),
// not a precise measurement.

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
  let ySum = 0
  let brightnessSum = 0
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
        ySum += py
      }
    }
  }

  const visibility = count / total
  const elevation = count > total * MIN_TONGUE_PIXELS_RATIO ? 1 - ySum / count / SAMPLE_H : null
  const brightness = brightnessSum / total // 0-255, useful for a lighting warning

  return { visibility, elevation, brightness }
}

function inRangeDist(value, [lo, hi]) {
  if (value >= lo && value <= hi) return 0
  return Math.min(Math.abs(value - lo), Math.abs(value - hi))
}

export function scoreTongueMove(metrics, target) {
  if (!metrics) return { score: 0, tier: 'red' }

  const visDist = inRangeDist(metrics.visibility, target.visibility)
  const needsElevation = target.elevation[0] > 0 || target.elevation[1] < 1
  const elevDist =
    metrics.elevation == null ? (needsElevation ? 0.3 : 0) : inRangeDist(metrics.elevation, target.elevation)

  const distance = visDist + elevDist
  const score = Math.max(0, 1 - distance * 1.5)

  let tier = 'red'
  if (score > 0.76) tier = 'green'
  else if (score > 0.4) tier = 'yellow'

  return { score, tier }
}
