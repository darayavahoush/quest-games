// Draws directly onto a canvas overlaid on the video, using the same
// MediaPipe landmarks already computed for scoring. Everything here is
// positioned from real landmark coordinates, not fixed screen coordinates,
// so it tracks the child's face and moves/rotates with them.

const LEFT_FACE = 234
const RIGHT_FACE = 454
const LEFT_EYE_OUTER = 33
const RIGHT_EYE_OUTER = 263

// Outer lip contour, in order around the mouth — traces the true lip
// boundary instead of approximating it with an ellipse.
const OUTER_LIPS = [
  61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146,
]

function px(landmarks, i, w, h) {
  const p = landmarks[i]
  return { x: p.x * w, y: p.y * h }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// Radial gradient helper for a bit of dimensionality on ears/noses/bolts —
// light offset toward the top-left to fake a single light source.
function orb(ctx, cx, cy, r, colorLight, colorDark) {
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r)
  g.addColorStop(0, colorLight)
  g.addColorStop(1, colorDark)
  return g
}

// A soft offset dark ellipse drawn *before* a shape gives it a grounded
// drop-shadow look. We use a hand-drawn duplicate rather than
// ctx.shadowBlur here because shadow blur radius isn't reliably scaled by
// the surrounding ctx.scale() transform across browsers (notably Safari),
// which made the same code look right in one browser and flat in another.
// Two overlapping layers at different sizes/opacities give a softer,
// less "cardboard cutout" falloff than a single flat ellipse.
function shadowDot(ctx, cx, cy, rx, ry, rot = 0) {
  ctx.beginPath()
  ctx.fillStyle = 'rgba(8, 26, 28, 0.12)'
  ctx.ellipse(cx + rx * 0.2, cy + ry * 0.26, rx * 1.18, ry * 1.18, rot, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.fillStyle = 'rgba(8, 26, 28, 0.18)'
  ctx.ellipse(cx + rx * 0.15, cy + ry * 0.2, rx * 1.0, ry * 1.0, rot, 0, Math.PI * 2)
  ctx.fill()
}

// Deterministic pseudo-random value in [-1, 1] from an integer seed — used
// to give repeated elements (mane petals, fur tufts) slightly different
// sizes/angles so they read as organic rather than a uniform stamped
// pattern. Deterministic (not Math.random()) so it doesn't flicker frame
// to frame.
function seeded(i) {
  const x = Math.sin(i * 12.9898) * 43758.5453
  return (x - Math.floor(x)) * 2 - 1
}

// A gentle idle sway so accessories feel alive rather than pasted on,
// independent of head movement — small enough not to fight the real
// landmark-driven tracking.
function idleSway(phase = 0) {
  return Math.sin(performance.now() / 900 + phase) * 0.025
}

// Short strokes radiating outward from a point — turns a flat-filled blob
// into something that reads as fur rather than a solid cartoon shape.
// Stable per-call via `seed` so it doesn't shimmer frame to frame.
function furTexture(ctx, cx, cy, radius, count, seed, color, spread = Math.PI * 2, baseAngle = 0) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = radius * 0.05
  ctx.lineCap = 'round'
  for (let i = 0; i < count; i++) {
    const a = baseAngle + seeded(seed + i) * spread * 0.5
    const len = radius * (0.35 + Math.abs(seeded(seed + i + 50)) * 0.35)
    const startR = radius * 0.35
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(a) * startR, cy + Math.sin(a) * startR)
    ctx.lineTo(cx + Math.cos(a) * (startR + len), cy + Math.sin(a) * (startR + len))
    ctx.stroke()
  }
  ctx.restore()
}

// A soft glow built from layered, increasingly transparent circles —
// avoids ctx.shadowBlur for the same cross-browser-scaling reason as the
// shadow helper above.
function glow(ctx, cx, cy, r, color) {
  ;[1.8, 1.4, 1.0].forEach((mult, i) => {
    ctx.beginPath()
    ctx.fillStyle = color
    ctx.globalAlpha = [0.06, 0.1, 0.16][i]
    ctx.arc(cx, cy, r * mult, 0, Math.PI * 2)
    ctx.fill()
  })
  ctx.globalAlpha = 1
}

// A small bright highlight for a glossier, more polished "toy" finish.
function gloss(ctx, cx, cy, rx, ry, rot = 0) {
  ctx.beginPath()
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.ellipse(cx - rx * 0.32, cy - ry * 0.38, rx * 0.32, ry * 0.24, rot, 0, Math.PI * 2)
  ctx.fill()
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

// Smooth closed curve through a ring of points — the curve passes through
// each midpoint with the source point as control, which rounds off the
// path instead of a faceted polygon while still hugging the real contour.
function smoothClosedPath(ctx, pts) {
  const start = midpoint(pts[pts.length - 1], pts[0])
  ctx.beginPath()
  ctx.moveTo(start.x, start.y)
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const next = pts[(i + 1) % pts.length]
    const mid = midpoint(p, next)
    ctx.quadraticCurveTo(p.x, p.y, mid.x, mid.y)
  }
  ctx.closePath()
}

// A live outline traced through the child's real lip landmarks — this is
// the "green outline" that shows match quality fitted to their actual
// mouth, not a generic shape placed over it.
export function drawMouthOutline(ctx, landmarks, w, h, color) {
  if (!landmarks) return
  const pts = OUTER_LIPS.map((i) => px(landmarks, i, w, h))

  ctx.save()
  smoothClosedPath(ctx, pts)
  ctx.fillStyle = `${color}26`
  ctx.fill()

  const leftCorner = px(landmarks, 61, w, h)
  const rightCorner = px(landmarks, 291, w, h)
  const mouthWidth = Math.hypot(rightCorner.x - leftCorner.x, rightCorner.y - leftCorner.y)

  ctx.lineWidth = Math.max(2.5, mouthWidth * 0.06)
  ctx.strokeStyle = color
  ctx.shadowColor = color
  ctx.shadowBlur = 12
  ctx.stroke()
  ctx.restore()
}

function faceBasis(landmarks, w, h) {
  const l = px(landmarks, LEFT_FACE, w, h)
  const r = px(landmarks, RIGHT_FACE, w, h)
  const leftEye = px(landmarks, LEFT_EYE_OUTER, w, h)
  const rightEye = px(landmarks, RIGHT_EYE_OUTER, w, h)
  return {
    cx: (leftEye.x + rightEye.x) / 2,
    cy: (leftEye.y + rightEye.y) / 2,
    scale: Math.hypot(r.x - l.x, r.y - l.y),
    angle: Math.atan2(r.y - l.y, r.x - l.x),
  }
}

const DRAWERS = {
  lion: drawLion,
  robot: drawRobot,
  hero: drawHero,
  bunny: drawBunny,
  cat: drawCat,
  unicorn: drawUnicorn,
}

// Snapchat-style accessory, stamped using the face's live position, scale,
// and tilt so it rides along with head movement. Drawing happens in a unit
// space where 1.0 == current face width.
export function drawFaceFilter(ctx, landmarks, w, h, filterId) {
  const drawer = DRAWERS[filterId]
  if (!landmarks || !drawer) return
  const { cx, cy, scale, angle } = faceBasis(landmarks, w, h)

  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(angle)
  ctx.scale(scale, scale)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  drawer(ctx)

  ctx.restore()
}

// A directional cue drawn just above the child's own mouth — "up" for
// tongue-to-roof, "back" for retract — colored by live match quality, the
// same way the lion/robot/hero accessories are anchored to real landmarks.
export function drawTongueArrow(ctx, landmarks, w, h, direction, color) {
  if (!landmarks) return
  const upper = px(landmarks, 13, w, h)
  const left = px(landmarks, 61, w, h)
  const right = px(landmarks, 291, w, h)
  const cx = (left.x + right.x) / 2
  const mouthWidth = Math.hypot(right.x - left.x, right.y - left.y)
  const size = mouthWidth * 0.55

  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(3, mouthWidth * 0.07)
  ctx.shadowColor = color
  ctx.shadowBlur = 10
  ctx.beginPath()

  if (direction === 'up') {
    const cy = upper.y - size * 1.15
    ctx.moveTo(cx, cy + size * 0.6)
    ctx.lineTo(cx, cy - size * 0.5)
    ctx.moveTo(cx - size * 0.35, cy - size * 0.1)
    ctx.lineTo(cx, cy - size * 0.5)
    ctx.lineTo(cx + size * 0.35, cy - size * 0.1)
  } else if (direction === 'back') {
    const cy = upper.y - size * 0.3
    const x0 = cx - size * 0.5
    const x1 = cx + size * 0.5
    ctx.moveTo(x0, cy)
    ctx.lineTo(x1, cy)
    ctx.moveTo(x1 - size * 0.35, cy - size * 0.3)
    ctx.lineTo(x1, cy)
    ctx.lineTo(x1 - size * 0.35, cy + size * 0.3)
  } else if (direction === 'left' || direction === 'right') {
    // Points toward the same landmark the scoring target in tongueMoves.js
    // is defined against, and drawn at a different height than 'back' so
    // the two don't visually overlap. dirSign follows raw camera-space x:
    // landmark 61 (subject's own LEFT corner) sits at the LARGER raw x
    // (see the lateral-scale note in lib/tongueTracking.js), so 'left'
    // points toward +x here, not -x — this was previously inverted.
    const cy = upper.y + size * 0.15
    const dirSign = direction === 'left' ? 1 : -1
    const x0 = cx
    const x1 = cx + dirSign * size * 0.55
    ctx.moveTo(x0, cy)
    ctx.lineTo(x1, cy)
    ctx.moveTo(x1 - dirSign * size * 0.3, cy - size * 0.28)
    ctx.lineTo(x1, cy)
    ctx.lineTo(x1 - dirSign * size * 0.3, cy + size * 0.28)
  }

  ctx.stroke()
  ctx.restore()
}

function drawLion(ctx) {
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.25)'
  ctx.shadowBlur = 0.02
  const sway = idleSway()

  // Furry crown, arcing over the top of the head only — each petal's size
  // and angle gets a small stable jitter so the mane reads as fur rather
  // than a row of identically stamped ellipses.
  const petals = 13
  for (let i = 0; i < petals; i++) {
    const jitter = seeded(i)
    const a = Math.PI + (i / (petals - 1)) * Math.PI + jitter * 0.08 + sway
    const reach = 0.95 + jitter * 0.08
    const x = Math.cos(a) * reach
    const y = Math.sin(a) * (0.85 + jitter * 0.06) - 0.15
    const rx = 0.22 + jitter * 0.05
    const ry = 0.15 + jitter * 0.03
    ctx.beginPath()
    ctx.fillStyle = orb(ctx, x, y, rx, '#FCD87E', i % 2 ? '#D9861F' : '#C9741A')
    ctx.ellipse(x, y, rx, ry, a, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(140,74,47,0.35)'
    ctx.lineWidth = 0.006
    ctx.stroke()
    furTexture(ctx, x, y, rx * 1.3, 4, i * 4, 'rgba(140,74,47,0.4)', Math.PI * 2, a)
  }

  // Ears
  ;[-0.55, 0.55].forEach((ex, i) => {
    const ey = -0.92 + idleSway(i * Math.PI) * 0.6
    shadowDot(ctx, ex, ey, 0.19, 0.21)
    ctx.beginPath()
    ctx.fillStyle = orb(ctx, ex, ey, 0.2, '#FCD87E', '#D9861F')
    ctx.ellipse(ex, ey, 0.19, 0.21, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.fillStyle = orb(ctx, ex, ey + 0.04, 0.1, '#F2C79A', '#C9741A')
    ctx.ellipse(ex, ey + 0.04, 0.09, 0.1, 0, 0, Math.PI * 2)
    ctx.fill()
    furTexture(ctx, ex, ey, 0.24, 6, i * 20, 'rgba(140,74,47,0.3)')
    gloss(ctx, ex, ey, 0.19, 0.21)
  })

  // Sideburn tufts along the jaw
  ;[-1, 1].forEach((side) => {
    ;[0.15, 0.45, 0.72].forEach((yy, i) => {
      const j = seeded(i + (side > 0 ? 10 : 0))
      const x = side * (0.78 - i * 0.05 + j * 0.03)
      const cy = yy + j * 0.03
      ctx.beginPath()
      ctx.fillStyle = orb(ctx, x, cy, 0.15, '#FCD87E', i % 2 ? '#D9861F' : '#C9741A')
      ctx.ellipse(x, cy, 0.16 + j * 0.02, 0.12, side * 0.3, 0, Math.PI * 2)
      ctx.fill()
      furTexture(ctx, x, cy, 0.18, 3, i + (side > 0 ? 30 : 60), 'rgba(140,74,47,0.3)')
    })
  })
  ctx.restore()

  // Muzzle patch — light, so the live match outline stays legible on top
  ctx.beginPath()
  const muzzle = ctx.createRadialGradient(0, 0.3, 0.05, 0, 0.4, 0.44)
  muzzle.addColorStop(0, 'rgba(255, 236, 190, 0.55)')
  muzzle.addColorStop(1, 'rgba(252, 216, 126, 0.28)')
  ctx.fillStyle = muzzle
  ctx.ellipse(0, 0.4, 0.42, 0.4, 0, 0, Math.PI * 2)
  ctx.fill()

  // Nose with a soft highlight
  shadowDot(ctx, 0, 0.2, 0.1, 0.1)
  ctx.beginPath()
  ctx.fillStyle = orb(ctx, 0, 0.2, 0.1, '#B0674A', '#7A3D24')
  ctx.moveTo(-0.1, 0.14)
  ctx.quadraticCurveTo(0, 0.1, 0.1, 0.14)
  ctx.quadraticCurveTo(0.1, 0.24, 0, 0.29)
  ctx.quadraticCurveTo(-0.1, 0.24, -0.1, 0.14)
  ctx.closePath()
  ctx.fill()
  gloss(ctx, 0, 0.2, 0.09, 0.08)

  // Whiskers
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'
  ctx.lineWidth = 0.015
  ;[-1, 1].forEach((side) => {
    ;[0.28, 0.38, 0.48].forEach((yy) => {
      ctx.beginPath()
      ctx.moveTo(side * 0.14, yy)
      ctx.lineTo(side * 0.62, yy - 0.03)
      ctx.stroke()
    })
  })
}

function drawRobot(ctx) {
  const vw = 1.15
  const vh = 0.32
  shadowDot(ctx, 0, -0.08, vw * 0.5, vh * 0.6)
  const grad = ctx.createLinearGradient(-vw / 2, -0.24, vw / 2, 0.08)
  grad.addColorStop(0, 'rgba(20,110,100,0.9)')
  grad.addColorStop(0.5, 'rgba(47,184,166,0.88)')
  grad.addColorStop(1, 'rgba(20,110,100,0.9)')
  roundRect(ctx, -vw / 2, -0.24, vw, vh, 0.08)
  ctx.fillStyle = grad
  ctx.fill()
  ctx.strokeStyle = '#8FE0D4'
  ctx.lineWidth = 0.02
  ctx.stroke()

  // Glossy highlight streak
  ctx.save()
  roundRect(ctx, -vw / 2, -0.24, vw, vh, 0.08)
  ctx.clip()
  ctx.beginPath()
  ctx.fillStyle = 'rgba(255,255,255,0.22)'
  ctx.moveTo(-vw / 2, -0.24)
  ctx.lineTo(-vw / 2 + 0.22, -0.24)
  ctx.lineTo(-vw / 2 + 0.05, 0.08)
  ctx.lineTo(-vw / 2 - 0.13, 0.08)
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  ctx.strokeStyle = 'rgba(251,247,238,0.35)'
  ctx.lineWidth = 0.012
  for (let i = 1; i < 4; i++) {
    const y = -0.24 + (vh / 4) * i
    ctx.beginPath()
    ctx.moveTo(-vw / 2 + 0.04, y)
    ctx.lineTo(vw / 2 - 0.04, y)
    ctx.stroke()
  }

  // Antenna
  ctx.beginPath()
  ctx.strokeStyle = '#2FB8A6'
  ctx.lineWidth = 0.03
  ctx.moveTo(0, -0.92)
  ctx.lineTo(0, -1.22)
  ctx.stroke()
  ctx.beginPath()
  ctx.fillStyle = orb(ctx, 0, -1.25, 0.07, '#FCD87E', '#D9861F')
  ctx.arc(0, -1.25, 0.06, 0, Math.PI * 2)
  ctx.fill()

  // Metallic jaw plate, kept light in the middle so the mouth outline reads
  const jw = 0.95
  shadowDot(ctx, 0, 0.41, jw * 0.5, 0.25)
  const jawGrad = ctx.createLinearGradient(0, 0.16, 0, 0.66)
  jawGrad.addColorStop(0, 'rgba(35,90,88,0.5)')
  jawGrad.addColorStop(1, 'rgba(15,50,49,0.5)')
  roundRect(ctx, -jw / 2, 0.16, jw, 0.5, 0.1)
  ctx.fillStyle = jawGrad
  ctx.fill()
  ctx.strokeStyle = 'rgba(143,224,212,0.6)'
  ctx.lineWidth = 0.018
  ctx.stroke()
  ;[0.3, 0.44, 0.58].forEach((yy) => {
    ctx.beginPath()
    ctx.strokeStyle = 'rgba(143,224,212,0.35)'
    ctx.lineWidth = 0.012
    ctx.moveTo(-jw / 2 + 0.06, yy)
    ctx.lineTo(jw / 2 - 0.06, yy)
    ctx.stroke()
  })

  // Cheek bolts + tiny status LEDs that blink over real time, not statically
  const blink = Math.sin(performance.now() / 260) > 0.3
  ;[-0.72, 0.72].forEach((bx, i) => {
    ctx.beginPath()
    ctx.fillStyle = orb(ctx, bx, 0.1, 0.07, '#3A6E6A', '#16403F')
    ctx.arc(bx, 0.1, 0.06, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.strokeStyle = '#8FE0D4'
    ctx.lineWidth = 0.012
    ctx.arc(bx, 0.1, 0.06, 0, Math.PI * 2)
    ctx.stroke()
    const ledOn = i === 0 ? blink : !blink
    ctx.beginPath()
    ctx.fillStyle = ledOn ? (i === 0 ? '#F0604A' : '#F4B942') : 'rgba(255,255,255,0.15)'
    ctx.arc(bx, -0.14, 0.025, 0, Math.PI * 2)
    ctx.fill()
  })
}

function drawHero(ctx) {
  shadowDot(ctx, 0, -0.02, 0.68, 0.22)
  const grad = ctx.createLinearGradient(-0.65, -0.12, 0.65, 0.02)
  grad.addColorStop(0, '#F0604A')
  grad.addColorStop(0.5, '#FF8A73')
  grad.addColorStop(1, '#D14A36')

  roundRect(ctx, -0.65, -0.12, 1.3, 0.14, 0.06)
  ctx.fillStyle = grad
  ctx.fill()
  ctx.beginPath()
  ctx.fillStyle = 'rgba(255,255,255,0.3)'
  roundRect(ctx, -0.63, -0.115, 1.26, 0.045, 0.02)
  ctx.fill()

  ;[-0.32, 0.32].forEach((ex) => {
    ctx.beginPath()
    ctx.fillStyle = grad
    ctx.ellipse(ex, -0.06, 0.26, 0.19, ex < 0 ? -0.12 : 0.12, 0, Math.PI * 2)
    ctx.fill()
  })
  ctx.strokeStyle = '#F4B942'
  ctx.lineWidth = 0.025
  ;[-0.32, 0.32].forEach((ex) => {
    ctx.beginPath()
    ctx.ellipse(ex, -0.06, 0.26, 0.19, ex < 0 ? -0.12 : 0.12, 0, Math.PI * 2)
    ctx.stroke()
    gloss(ctx, ex, -0.1, 0.2, 0.14, ex < 0 ? -0.12 : 0.12)
  })

  // Temple flares for a bit more comic-book shape
  ;[-0.62, 0.62].forEach((ex) => {
    ctx.beginPath()
    ctx.fillStyle = '#F4B942'
    ctx.moveTo(ex, -0.1)
    ctx.lineTo(ex + (ex < 0 ? -0.14 : 0.14), -0.18)
    ctx.lineTo(ex, -0.02)
    ctx.closePath()
    ctx.fill()
  })
}

function drawBunny(ctx) {
  // Tall floppy-topped ears — a bit of independent sway per ear reads as
  // an actual floppy-ear wobble rather than a static prop.
  ;[-0.32, 0.32].forEach((ex, i) => {
    const rot = (ex < 0 ? -0.08 : 0.08) + idleSway(i * 2.4)
    shadowDot(ctx, ex, -1.0, 0.16, 0.5, rot)
    const outer = ctx.createLinearGradient(0, -1.5, 0, -0.4)
    outer.addColorStop(0, '#FBF7EE')
    outer.addColorStop(1, '#F2A6C7')
    ctx.beginPath()
    ctx.fillStyle = outer
    ctx.ellipse(ex, -1.0, 0.16, 0.5, rot, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.fillStyle = '#F2A6C7'
    ctx.ellipse(ex, -0.98, 0.08, 0.36, rot, 0, Math.PI * 2)
    ctx.fill()
    furTexture(ctx, ex, -0.6, 0.16, 4, i * 15, 'rgba(242,166,199,0.4)', Math.PI, rot + Math.PI / 2)
    gloss(ctx, ex, -1.25, 0.14, 0.22, rot)
  })

  // Cheeks
  ;[-0.55, 0.55].forEach((ex) => {
    ctx.beginPath()
    ctx.fillStyle = 'rgba(242,166,199,0.4)'
    ctx.ellipse(ex, 0.32, 0.16, 0.13, 0, 0, Math.PI * 2)
    ctx.fill()
  })

  // Nose + muzzle
  shadowDot(ctx, 0, 0.16, 0.08, 0.08)
  ctx.beginPath()
  ctx.fillStyle = orb(ctx, 0, 0.16, 0.08, '#FBD1E0', '#F2A6C7')
  ctx.moveTo(-0.08, 0.12)
  ctx.quadraticCurveTo(0, 0.06, 0.08, 0.12)
  ctx.quadraticCurveTo(0.06, 0.2, 0, 0.22)
  ctx.quadraticCurveTo(-0.06, 0.2, -0.08, 0.12)
  ctx.closePath()
  ctx.fill()

  // Buck teeth hint
  ctx.beginPath()
  ctx.fillStyle = '#FBF7EE'
  roundRect(ctx, -0.055, 0.32, 0.05, 0.09, 0.015)
  ctx.fill()
  ctx.beginPath()
  roundRect(ctx, 0.005, 0.32, 0.05, 0.09, 0.015)
  ctx.fillStyle = '#FBF7EE'
  ctx.fill()

  // Whiskers
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'
  ctx.lineWidth = 0.013
  ;[-1, 1].forEach((side) => {
    ;[0.16, 0.24].forEach((yy) => {
      ctx.beginPath()
      ctx.moveTo(side * 0.1, yy)
      ctx.lineTo(side * 0.5, yy - 0.02)
      ctx.stroke()
    })
  })
}

function drawCat(ctx) {
  // Pointed ears with slightly rounded tips for a softer silhouette
  ;[-0.5, 0.5].forEach((ex, i) => {
    const dir = ex < 0 ? -1 : 1
    const bob = idleSway(i * 1.8) * 0.5
    ctx.save()
    ctx.translate(0, bob)
    shadowDot(ctx, ex, -0.85, 0.24, 0.28)
    ctx.beginPath()
    ctx.fillStyle = orb(ctx, ex, -0.85, 0.28, '#F3B37A', '#D9861F')
    ctx.moveTo(ex - 0.2 * dir, -0.62)
    ctx.quadraticCurveTo(ex + 0.05 * dir, -1.18, ex + 0.05 * dir, -1.15)
    ctx.quadraticCurveTo(ex + 0.06 * dir, -1.12, ex + 0.24 * dir, -0.6)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.fillStyle = '#F2A6C7'
    ctx.moveTo(ex - 0.1 * dir, -0.68)
    ctx.quadraticCurveTo(ex + 0.04 * dir, -1.0, ex + 0.04 * dir, -0.98)
    ctx.quadraticCurveTo(ex + 0.05 * dir, -0.96, ex + 0.14 * dir, -0.66)
    ctx.closePath()
    ctx.fill()
    furTexture(ctx, ex, -0.68, 0.2, 5, i * 25, 'rgba(217,134,31,0.35)', Math.PI * 0.8, -Math.PI / 2)
    gloss(ctx, ex, -0.9, 0.22, 0.22, dir * 0.3)
    ctx.restore()
  })

  // Eyeliner flicks
  ctx.strokeStyle = '#16403F'
  ctx.lineWidth = 0.025
  ;[-1, 1].forEach((side) => {
    ctx.beginPath()
    ctx.moveTo(side * 0.42, -0.05)
    ctx.lineTo(side * 0.56, -0.14)
    ctx.stroke()
  })

  // Nose
  shadowDot(ctx, 0, 0.17, 0.06, 0.06)
  ctx.beginPath()
  ctx.fillStyle = orb(ctx, 0, 0.16, 0.06, '#FBD1E0', '#F2A6C7')
  ctx.moveTo(-0.06, 0.13)
  ctx.quadraticCurveTo(0, 0.11, 0.06, 0.13)
  ctx.quadraticCurveTo(0.04, 0.19, 0, 0.22)
  ctx.quadraticCurveTo(-0.04, 0.19, -0.06, 0.13)
  ctx.closePath()
  ctx.fill()

  // Whiskers, both sides
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'
  ctx.lineWidth = 0.015
  ;[-1, 1].forEach((side) => {
    ;[0.2, 0.28, 0.36].forEach((yy, i) => {
      ctx.beginPath()
      ctx.moveTo(side * 0.12, yy)
      ctx.lineTo(side * (0.55 - i * 0.03), yy - 0.04)
      ctx.stroke()
    })
  })
}

function drawUnicorn(ctx) {
  // Spiral horn
  ctx.save()
  ctx.translate(0, -0.98)
  ctx.rotate(idleSway() * 0.4)
  shadowDot(ctx, 0, -0.2, 0.13, 0.35)
  glow(ctx, 0, -0.4, 0.22, '#FCD87E')
  ctx.beginPath()
  const hornGrad = ctx.createLinearGradient(0, -0.55, 0, 0.05)
  hornGrad.addColorStop(0, '#FCD87E')
  hornGrad.addColorStop(0.5, '#F2A6C7')
  hornGrad.addColorStop(1, '#8FE0D4')
  ctx.fillStyle = hornGrad
  ctx.moveTo(-0.1, 0.05)
  ctx.lineTo(0.1, 0.05)
  ctx.lineTo(0, -0.55)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'
  ctx.lineWidth = 0.015
  for (let i = 1; i < 5; i++) {
    const yy = 0.05 - i * 0.11
    const half = 0.1 - i * 0.019
    ctx.beginPath()
    ctx.moveTo(-half, yy)
    ctx.lineTo(half, yy)
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.moveTo(-0.03, 0.03)
  ctx.lineTo(0.01, 0.03)
  ctx.lineTo(-0.01, -0.48)
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  // Small ears
  ;[-0.5, 0.5].forEach((ex) => {
    shadowDot(ctx, ex, -0.78, 0.13, 0.17, ex < 0 ? -0.15 : 0.15)
    ctx.beginPath()
    ctx.fillStyle = orb(ctx, ex, -0.78, 0.15, '#FBF7EE', '#F2A6C7')
    ctx.ellipse(ex, -0.78, 0.13, 0.17, ex < 0 ? -0.15 : 0.15, 0, Math.PI * 2)
    ctx.fill()
  })

  // Rainbow mane strands along one side
  const maneColors = ['#F2A6C7', '#FCD87E', '#8FE0D4', '#F0604A']
  ctx.lineCap = 'round'
  maneColors.forEach((c, i) => {
    ctx.beginPath()
    ctx.strokeStyle = c
    ctx.lineWidth = 0.045
    const yStart = -0.75 + i * 0.1
    ctx.moveTo(0.5, yStart)
    ctx.quadraticCurveTo(0.85, yStart + 0.25, 0.65, yStart + 0.6)
    ctx.stroke()
  })

  // Sparkle cheeks
  ;[-0.55, 0.55].forEach((ex) => {
    ctx.beginPath()
    ctx.fillStyle = 'rgba(242,166,199,0.35)'
    ctx.ellipse(ex, 0.32, 0.14, 0.11, 0, 0, Math.PI * 2)
    ctx.fill()
  })
}
