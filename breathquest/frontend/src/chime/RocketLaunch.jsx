import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Settings, Volume2 } from 'lucide-react'
import { logEvent, getAgentDecision } from './lib/api'
import { getNextLevelRoute } from './lib/levelProgress'
import { useSpokenInstruction } from '../lib/speech'

const LEVEL_ID = 'aa'
const AGENT_POLICY = 'tabular_q'
const PITCH_CHECK_EVERY_N_FRAMES = 3
const MIN_VOICING_FRAMES = 3 // ~50ms at 60fps; filters out single-frame noise blips

// ============================================================
// Pure scoring/state logic — ported 1:1 from rocket_launch.html /
// rocket_logic.js. Do not change the math without re-running
// rocket_logic.test.js against an equivalent copy.
// ============================================================
function computeRMS(floatSamples) {
  let sumSquares = 0
  for (let i = 0; i < floatSamples.length; i++) sumSquares += floatSamples[i] * floatSamples[i]
  return Math.sqrt(sumSquares / floatSamples.length)
}

function computeLoudnessScore(rms, noiseFloor, maxExpected) {
  if (rms <= noiseFloor) return 0
  const score = (rms - noiseFloor) / (maxExpected - noiseFloor)
  return Math.max(0, Math.min(1, score))
}

// Rewards sticking with a sound, not just being loud for one frame: rise rate
// ramps up the longer voicing has been continuously held, capping at
// DURATION_BOOST_MAX extra once DURATION_BOOST_SECONDS of unbroken voicing
// is reached. Resets to 0 the instant voicing breaks (see gameLoop).
const DURATION_BOOST_MAX = 0.6 // up to +60% extra rise rate at full sustain
const DURATION_BOOST_SECONDS = 2.5 // seconds of continuous voicing to hit max boost

function updateAltitude(currentAltitude, score, dt, config, pitchBoost = 0, sustainedSeconds = 0) {
  const { riseRate, fallRate, scoreThreshold } = config
  let next
  if (score >= scoreThreshold) {
    const intensity = (score - scoreThreshold) / (1 - scoreThreshold)
    const loudnessMultiplier = 0.4 + 1.4 * intensity
    const pitchMultiplier = 1 + 0.5 * pitchBoost
    const durationMultiplier = 1 + DURATION_BOOST_MAX * Math.min(1, sustainedSeconds / DURATION_BOOST_SECONDS)
    next = currentAltitude + riseRate * loudnessMultiplier * pitchMultiplier * durationMultiplier * dt
  } else {
    next = currentAltitude - fallRate * dt
  }
  return Math.max(0, Math.min(1, next))
}

// Autocorrelation pitch detection — first strong local peak (shortest lag), not
// the global max, to avoid octave errors on clean tones.
function detectPitch(floatSamples, sampleRate, minHz = 80, maxHz = 600) {
  const SIZE = floatSamples.length
  const maxLag = Math.floor(sampleRate / minHz)
  const minLag = Math.floor(sampleRate / maxHz)

  let rms = 0
  for (let i = 0; i < SIZE; i++) rms += floatSamples[i] * floatSamples[i]
  rms = Math.sqrt(rms / SIZE)
  if (rms < 0.01) return { frequency: 0, confidence: 0 }

  const correlations = []
  for (let lag = minLag; lag <= maxLag && lag < SIZE; lag++) {
    let correlation = 0, normA = 0, normB = 0
    for (let i = 0; i < SIZE - lag; i++) {
      correlation += floatSamples[i] * floatSamples[i + lag]
      normA += floatSamples[i] * floatSamples[i]
      normB += floatSamples[i + lag] * floatSamples[i + lag]
    }
    const denom = Math.sqrt(normA * normB)
    correlations.push(denom > 0 ? correlation / denom : 0)
  }

  const PEAK_THRESHOLD = 0.85
  let bestIndex = -1
  for (let i = 1; i < correlations.length - 1; i++) {
    if (correlations[i] > PEAK_THRESHOLD && correlations[i] >= correlations[i - 1] && correlations[i] >= correlations[i + 1]) {
      bestIndex = i
      break
    }
  }
  if (bestIndex === -1) {
    let bestVal = -1
    for (let i = 0; i < correlations.length; i++) {
      if (correlations[i] > bestVal) { bestVal = correlations[i]; bestIndex = i }
    }
  }
  if (bestIndex === -1) return { frequency: 0, confidence: 0 }
  const bestLag = minLag + bestIndex
  const bestCorrelation = correlations[bestIndex]
  if (bestCorrelation <= 0) return { frequency: 0, confidence: 0 }
  return { frequency: sampleRate / bestLag, confidence: Math.max(0, Math.min(1, bestCorrelation)) }
}

function pitchToBoost(pitchResult, boostMinHz = 220, boostMaxHz = 500, minConfidence = 0.85) {
  if (pitchResult.confidence < minConfidence || pitchResult.frequency <= 0) return 0
  const t = (pitchResult.frequency - boostMinHz) / (boostMaxHz - boostMinHz)
  return Math.max(0, Math.min(1, t))
}

const BASE_ALTITUDE_CONFIG = { riseRate: 0.55, fallRate: 0.18, scoreThreshold: 0.20 }

// Local rule-based fallback difficulty agent, used only if the trained-agent
// endpoint is unreachable. Bounded on purpose — scoreThreshold only ever moves
// within SAFE_RANGE, mirroring the safety-envelope principle: a controller
// should only ever nudge within pre-approved bounds, never jump.
const DIFFICULTY_AGENT = {
  SAFE_RANGE: [0.20, 0.55],
  STEP: 0.05,
  FAST_S: 4,
  SLOW_S: 12,
  decide(timeToLaunchSeconds) {
    if (timeToLaunchSeconds < this.FAST_S) return { action: 'raise', message: "That was fast! Let's aim a little higher next time 🚀" }
    if (timeToLaunchSeconds > this.SLOW_S) return { action: 'lower', message: "Great effort! Let's make the next one a little easier 🌟" }
    return { action: 'hold', message: "Nice and steady! Let's keep this level for now 💛" }
  },
  apply(config, decision) {
    const next = { ...config }
    if (decision.action === 'raise') next.scoreThreshold += this.STEP
    if (decision.action === 'lower') next.scoreThreshold -= this.STEP
    next.scoreThreshold = Math.max(this.SAFE_RANGE[0], Math.min(this.SAFE_RANGE[1], next.scoreThreshold))
    return next
  },
}

export default function RocketLaunch() {
  const navigate = useNavigate()
  const canvasRef = useRef(null)
  const rafRef = useRef(null)

  const [screen, setScreen] = useState('start')
  const [micErrorMsg, setMicErrorMsg] = useState('')
  const [calibLabel, setCalibLabel] = useState({ title: "Let's find quiet...", subtitle: 'Stay nice and quiet for a moment', emoji: '🤫' })
  const [calibProgress, setCalibProgress] = useState(0)
  const [hudVisible, setHudVisible] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [reduceMotion, setReduceMotion] = useState(() => localStorage.getItem('pq_reduce_motion') === 'true')
  const [muted, setMuted] = useState(() => localStorage.getItem('pq_muted') === 'true')
  const [encourageVisible, setEncourageVisible] = useState(false)
  const [successVisible, setSuccessVisible] = useState(false)
  const [agentFeedback, setAgentFeedback] = useState('')
  const [ariaMsg, setAriaMsg] = useState('')

  const stateRef = useRef({
    audioCtx: null, analyser: null, timeDomainData: null, mediaStream: null,
    noiseFloor: 0.01, maxExpectedRms: 0.3,
    altitude: 0, smoothedScore: 0, pitchBoost: 0,
    frameCount: 0, lastFrameTime: 0,
    hasLaunched: false, quietStreak: 0,
    stars: [], particles: [], sparkles: [],
    difficultyConfig: { ...BASE_ALTITUDE_CONFIG },
    attemptStartTime: 0, attemptNumber: 0,
    inVoicing: false, voicingScores: [], sustainedSeconds: 0,
    scrollY: 0,
    W: 0, H: 0, DPR: 1,
  })

  const reduceMotionRef = useRef(reduceMotion)
  const mutedRef = useRef(muted)
  useEffect(() => { reduceMotionRef.current = reduceMotion; localStorage.setItem('pq_reduce_motion', reduceMotion) }, [reduceMotion])
  useEffect(() => { mutedRef.current = muted; localStorage.setItem('pq_muted', muted) }, [muted])

  // Speak the start-screen instruction once each time it's (re-)shown —
  // held off if the game's own mute toggle is on, matching how that
  // toggle already gates every other sound in this game.
  const replayInstruction = useSpokenInstruction(
    'Say a big, loud AAAA to blast your rocket into space!',
    { enabled: screen === 'start' && !muted },
  )

  useEffect(() => {
    const state = stateRef.current
    return () => {
      cancelAnimationFrame(rafRef.current)
      if (state.audioCtx) state.audioCtx.close().catch(() => {})
      // audioCtx.close() does NOT stop the underlying getUserMedia
      // tracks — those are a separate object from the AudioContext and
      // stay live (mic indicator on, hardware in use) until stopped
      // explicitly. Found missing here and in 5 other Chime games; the
      // fix pattern matches VillageBuilder.jsx, the one game that
      // already did this correctly.
      if (state.mediaStream) state.mediaStream.getTracks().forEach(t => t.stop())
    }
  }, [])

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const s = stateRef.current
    s.DPR = Math.min(window.devicePixelRatio || 1, 2)
    s.W = window.innerWidth
    s.H = window.innerHeight
    canvas.width = s.W * s.DPR
    canvas.height = s.H * s.DPR
    canvas.style.width = s.W + 'px'
    canvas.style.height = s.H + 'px'
    const ctx = canvas.getContext('2d')
    ctx.setTransform(s.DPR, 0, 0, s.DPR, 0, 0)
    initStars()
  }, [])

  function initStars() {
    const s = stateRef.current
    const count = Math.floor((s.W * s.H) / 9000)
    s.stars = Array.from({ length: count }, () => ({
      x: Math.random() * s.W, y: Math.random() * s.H * 0.8,
      r: Math.random() * 1.6 + 0.6, phase: Math.random() * Math.PI * 2, speed: Math.random() * 0.6 + 0.3,
    }))
  }

  useEffect(() => {
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)
    return () => window.removeEventListener('resize', resizeCanvas)
  }, [resizeCanvas])

  function readCurrentRMS() {
    const s = stateRef.current
    s.analyser.getFloatTimeDomainData(s.timeDomainData)
    return computeRMS(s.timeDomainData)
  }

  function playTone(freq, duration, type = 'sine', gainPeak = 0.06) {
    const s = stateRef.current
    if (mutedRef.current || !s.audioCtx) return
    const a = s.audioCtx
    const osc = a.createOscillator(), gain = a.createGain()
    osc.type = type; osc.frequency.value = freq
    gain.gain.setValueAtTime(0, a.currentTime)
    gain.gain.linearRampToValueAtTime(gainPeak, a.currentTime + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + duration)
    osc.connect(gain).connect(a.destination)
    osc.start(); osc.stop(a.currentTime + duration + 0.05)
  }

  function playSuccessChime() {
    ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => setTimeout(() => playTone(f, 0.5, 'triangle', 0.05), i * 110))
  }

  async function requestMicAndCalibrate() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false } })
      const AudioContextClass = window.AudioContext || window.webkitAudioContext
      const s = stateRef.current
      s.mediaStream = stream
      s.audioCtx = new AudioContextClass()
      const source = s.audioCtx.createMediaStreamSource(stream)
      s.analyser = s.audioCtx.createAnalyser()
      s.analyser.fftSize = 2048
      s.timeDomainData = new Float32Array(s.analyser.fftSize)
      source.connect(s.analyser)
      runCalibration()
    } catch (err) {
      setMicErrorMsg(err.name === 'NotAllowedError'
        ? 'Please allow microphone access so your rocket can hear your voice.'
        : 'Something went wrong reaching the microphone. Please try again.')
      setScreen('micError')
    }
  }

  function runCalibration() {
    setScreen('calibrate')
    const QUIET_MS = 1200
    const LOUD_MS = 1800
    let quietSamples = []
    let loudSamples = []

    setCalibLabel({ title: "Let's find quiet...", subtitle: 'Stay nice and quiet for a moment', emoji: '🤫' })
    setCalibProgress(0)

    const quietStart = performance.now()
    function quietStep(now) {
      const elapsed = now - quietStart
      quietSamples.push(readCurrentRMS())
      setCalibProgress(Math.min(1, elapsed / QUIET_MS))
      if (elapsed < QUIET_MS) {
        requestAnimationFrame(quietStep)
      } else {
        const sorted = [...quietSamples].sort((a, b) => a - b)
        const p90 = sorted[Math.floor(sorted.length * 0.9)] || 0.01
        stateRef.current.noiseFloor = Math.max(0.006, p90 * 1.4)
        startLoudPhase()
      }
    }

    function startLoudPhase() {
      setCalibLabel({ title: 'Now say "AAAA"!', subtitle: 'As loud as you can, for a few seconds', emoji: '📣' })
      setCalibProgress(0)
      const loudStart = performance.now()
      function loudStep(now) {
        const elapsed = now - loudStart
        loudSamples.push(readCurrentRMS())
        setCalibProgress(Math.min(1, elapsed / LOUD_MS))
        if (elapsed < LOUD_MS) {
          requestAnimationFrame(loudStep)
        } else {
          // sustained (p55), not peak — gameplay needs SUSTAINED loud "aaaa",
          // which decays below peak almost immediately.
          const sorted = [...loudSamples].sort((a, b) => a - b)
          const loudSustained = sorted[Math.floor(sorted.length * 0.55)] || 0.2
          const s = stateRef.current
          s.maxExpectedRms = Math.max(s.noiseFloor + 0.05, loudSustained)
          finishCalibration()
        }
      }
      requestAnimationFrame(loudStep)
    }

    requestAnimationFrame(quietStep)
  }

  function finishCalibration() {
    setScreen('playing')
    setHudVisible(true)
    const s = stateRef.current
    s.altitude = 0
    s.hasLaunched = false
    s.lastFrameTime = performance.now()
    s.attemptStartTime = performance.now()
    setAriaMsg('Ready! Say aaa to launch your rocket.')
    rafRef.current = requestAnimationFrame(gameLoop)
  }

  // Logs one real per-attempt event per sustained stretch of loud "aaa" voicing,
  // scored on actual audio quality (loudness + pitch boost), not on how long the
  // whole launch took.
  async function logVoicingAttempt(scores) {
    const s = stateRef.current
    if (scores.length < MIN_VOICING_FRAMES) return
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length
    s.attemptNumber++
    try {
      await logEvent({ level_id: LEVEL_ID, attempt_number: s.attemptNumber, score: avgScore, is_valid_attempt: true })
    } catch (err) {
      console.warn('Backend event logging unavailable:', err)
    }
  }

  // Launch-completion pacing only: asks the difficulty agent whether to
  // raise/lower the score threshold for next launch. timeToLaunchSeconds is a
  // local signal only — never sent to the backend as "score".
  async function updateDifficultyFromAttempt(timeToLaunchSeconds) {
    const s = stateRef.current
    let decision = null
    try {
      decision = await getAgentDecision(LEVEL_ID, AGENT_POLICY)
    } catch (err) {
      console.warn('Trained-agent endpoint unavailable, falling back to local rule-based agent:', err)
    }
    if (!decision) decision = DIFFICULTY_AGENT.decide(timeToLaunchSeconds)

    s.difficultyConfig = DIFFICULTY_AGENT.apply(s.difficultyConfig, decision)
    setAgentFeedback(decision.message)
  }

  // Marks the level as passed independent of any single burst's score — altitude
  // fills up continuously from any nonzero-quality burst with no hard gate, so no
  // individual logged burst may ever clear PASS_THRESHOLD even when the rocket
  // genuinely launches. levelProgress.js treats this as a pass.
  async function logLevelComplete() {
    const s = stateRef.current
    try {
      await logEvent({ level_id: LEVEL_ID, attempt_number: s.attemptNumber, score: 1, is_valid_attempt: true, action: 'level_complete' })
    } catch (err) {
      console.warn('Backend event logging unavailable:', err)
    }
  }

  function onLaunchSuccess() {
    const s = stateRef.current
    logLevelComplete()
    if (s.inVoicing) {
      logVoicingAttempt(s.voicingScores)
      s.inVoicing = false
      s.voicingScores = []
    }
    playSuccessChime()
    setAriaMsg('You did it! Your rocket reached the stars.')
    spawnCelebrationParticles()
    const timeToLaunchSeconds = (performance.now() - s.attemptStartTime) / 1000
    updateDifficultyFromAttempt(timeToLaunchSeconds)
    let frames = 0
    function celebrateLoop() {
      render()
      frames++
      if (frames < 90) requestAnimationFrame(celebrateLoop)
    }
    requestAnimationFrame(celebrateLoop)
    setTimeout(() => setSuccessVisible(true), 500)
  }

  function spawnCelebrationParticles() {
    const s = stateRef.current
    const count = reduceMotionRef.current ? 18 : 60
    for (let i = 0; i < count; i++) {
      s.particles.push({
        x: s.W / 2, y: s.H * 0.18,
        vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6 - 1,
        life: 1, color: ['#FFD166', '#FF6B6B', '#6BCB77', '#FFE066'][i % 4],
        r: Math.random() * 3 + 2,
      })
    }
  }

  function spawnBoostSparkle() {
    const s = stateRef.current
    if (reduceMotionRef.current) return
    const padY = s.H - 90
    const topY = s.H * 0.16
    const rocketY = padY - (padY - topY) * s.altitude
    const rocketX = s.W / 2
    const side = Math.random() < 0.5 ? -1 : 1
    s.sparkles.push({
      x: rocketX + side * (18 + Math.random() * 8), y: rocketY + (Math.random() - 0.5) * 20,
      vx: side * (0.5 + Math.random() * 0.8), vy: -0.4 - Math.random() * 0.6,
      life: 1, r: Math.random() * 2.5 + 1.5,
    })
  }

  function gameLoop(now) {
    const s = stateRef.current
    const dt = Math.min(0.1, (now - s.lastFrameTime) / 1000)
    s.lastFrameTime = now
    s.frameCount++

    const rms = readCurrentRMS()
    const rawScore = computeLoudnessScore(rms, s.noiseFloor, s.maxExpectedRms)
    s.smoothedScore = s.smoothedScore * 0.7 + rawScore * 0.3

    if (rawScore > 0.15 && s.frameCount % PITCH_CHECK_EVERY_N_FRAMES === 0) {
      const pitch = detectPitch(s.timeDomainData, s.audioCtx.sampleRate)
      s.pitchBoost = pitchToBoost(pitch)
    } else if (rawScore <= 0.15) {
      s.pitchBoost = 0
    }

    // Track sustained voicing duration BEFORE computing altitude, so this
    // frame's climb already reflects how long the current burst has run —
    // rewards sticking with it, not just being loud for a single frame.
    if (rawScore > 0.15) {
      s.sustainedSeconds += dt
    } else {
      s.sustainedSeconds = 0
    }

    s.altitude = updateAltitude(s.altitude, s.smoothedScore, dt, s.difficultyConfig, s.pitchBoost, s.sustainedSeconds)

    // Starfield speed mirrors the same duration ramp as altitude, so the sky
    // visibly streams faster the longer a sound is held, and settles back to
    // a slow drift the moment voicing breaks — reinforces "keep going" visually.
    const scrollBoost = 1 + DURATION_BOOST_MAX * Math.min(1, s.sustainedSeconds / DURATION_BOOST_SECONDS)
    const scrollSpeed = (rawScore > 0.15 ? 40 * scrollBoost : 8) // px/sec
    s.scrollY = (s.scrollY + scrollSpeed * dt) % 100000

    if (s.pitchBoost > 0.3 && Math.random() < s.pitchBoost * 0.6) spawnBoostSparkle()

    // Track sustained voicing segments for real per-attempt logging.
    if (rawScore > 0.15) {
      s.inVoicing = true
      s.voicingScores.push(s.smoothedScore)
    } else if (s.inVoicing) {
      logVoicingAttempt(s.voicingScores)
      s.inVoicing = false
      s.voicingScores = []
    }

    if (rawScore < 0.15) s.quietStreak += dt; else s.quietStreak = 0
    setEncourageVisible(s.quietStreak > 3 && s.altitude < 0.15)

    render()

    if (s.altitude >= 0.999 && !s.hasLaunched) {
      s.hasLaunched = true
      onLaunchSuccess()
    }
    if (!s.hasLaunched) rafRef.current = requestAnimationFrame(gameLoop)
  }

  function render() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const s = stateRef.current
    const grad = ctx.createLinearGradient(0, 0, 0, s.H)
    grad.addColorStop(0, '#100C2E')
    grad.addColorStop(1, '#3D2E7C')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, s.W, s.H)
    drawStars(ctx)
    drawParticles(ctx)
    drawSparkles(ctx)
    drawRocket(ctx)
  }

  const starTimeRef = useRef(0)
  function drawStars(ctx) {
    const s = stateRef.current
    if (!reduceMotionRef.current) starTimeRef.current += 0.016
    ctx.save()
    for (const star of s.stars) {
      const twinkle = reduceMotionRef.current ? 0.8 : 0.6 + 0.4 * Math.sin(starTimeRef.current * star.speed + star.phase)
      ctx.globalAlpha = twinkle
      ctx.fillStyle = '#FFF8EC'
      // Stars stream downward (rocket reads as climbing past them); reduceMotion
      // keeps them static since large full-field motion is what that setting exists to avoid.
      const y = reduceMotionRef.current ? star.y : (star.y + s.scrollY) % s.H
      ctx.beginPath(); ctx.arc(star.x, y, star.r, 0, Math.PI * 2); ctx.fill()
    }
    ctx.restore()
  }

  function drawParticles(ctx) {
    const s = stateRef.current
    ctx.save()
    s.particles = s.particles.filter(p => p.life > 0)
    for (const p of s.particles) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.08; p.life -= 0.014
      ctx.globalAlpha = Math.max(0, p.life)
      ctx.fillStyle = p.color
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill()
    }
    ctx.restore()
  }

  function drawStarShape(ctx, cx, cy, r) {
    ctx.beginPath()
    for (let i = 0; i < 4; i++) {
      const angle = (Math.PI / 2) * i
      const outerX = cx + Math.cos(angle) * r
      const outerY = cy + Math.sin(angle) * r
      const midAngle = angle + Math.PI / 4
      const innerX = cx + Math.cos(midAngle) * r * 0.35
      const innerY = cy + Math.sin(midAngle) * r * 0.35
      if (i === 0) ctx.moveTo(outerX, outerY); else ctx.lineTo(outerX, outerY)
      ctx.lineTo(innerX, innerY)
    }
    ctx.closePath(); ctx.fill()
  }

  function drawSparkles(ctx) {
    const s = stateRef.current
    ctx.save()
    s.sparkles = s.sparkles.filter(sp => sp.life > 0)
    for (const sp of s.sparkles) {
      sp.x += sp.vx; sp.y += sp.vy; sp.life -= 0.02
      ctx.globalAlpha = Math.max(0, sp.life)
      ctx.fillStyle = '#B8F2FF'
      drawStarShape(ctx, sp.x, sp.y, sp.r)
    }
    ctx.restore()
  }

  const blinkTimeRef = useRef(0)
  function drawRocket(ctx) {
    const s = stateRef.current
    const padY = s.H - 90
    const topY = s.H * 0.16
    const rocketY = padY - (padY - topY) * s.altitude
    const rocketX = s.W / 2

    ctx.fillStyle = 'rgba(255,255,255,0.08)'
    ctx.fillRect(rocketX - 60, s.H - 40, 120, 10)

    const shadowOpacity = 0.25 * (1 - s.altitude)
    if (shadowOpacity > 0.01) {
      ctx.save()
      ctx.globalAlpha = shadowOpacity
      ctx.fillStyle = '#000000'
      ctx.beginPath(); ctx.ellipse(rocketX, s.H - 34, 34, 7, 0, 0, Math.PI * 2); ctx.fill()
      ctx.restore()
    }

    const flameHeight = 14 + s.smoothedScore * 74
    const flameFlicker = reduceMotionRef.current ? 0 : Math.sin(performance.now() * 0.03) * 4 * s.smoothedScore
    if (s.smoothedScore > 0.03) {
      const flameGrad = ctx.createLinearGradient(0, rocketY + 40, 0, rocketY + 40 + flameHeight)
      flameGrad.addColorStop(0, '#FFE066'); flameGrad.addColorStop(0.5, '#FFA94D'); flameGrad.addColorStop(1, 'rgba(255,107,107,0)')
      ctx.fillStyle = flameGrad
      ctx.beginPath()
      ctx.moveTo(rocketX - 11, rocketY + 40)
      ctx.quadraticCurveTo(rocketX + flameFlicker, rocketY + 40 + flameHeight, rocketX, rocketY + 40 + flameHeight + 6)
      ctx.quadraticCurveTo(rocketX - flameFlicker, rocketY + 40 + flameHeight, rocketX + 11, rocketY + 40)
      ctx.closePath(); ctx.fill()
    }

    ctx.save()
    ctx.translate(rocketX, rocketY)
    if (!reduceMotionRef.current) blinkTimeRef.current += 0.016

    ;[-1, 1].forEach(side => {
      const bx = side * 21
      ctx.save()
      ctx.translate(bx, 0)
      if (s.smoothedScore > 0.05) {
        const bFlameH = 8 + s.smoothedScore * 30
        const bGrad = ctx.createLinearGradient(0, 26, 0, 26 + bFlameH)
        bGrad.addColorStop(0, '#FFE066'); bGrad.addColorStop(1, 'rgba(255,169,77,0)')
        ctx.fillStyle = bGrad
        ctx.beginPath()
        ctx.moveTo(-5, 26)
        ctx.quadraticCurveTo(0, 26 + bFlameH, 0, 26 + bFlameH + 3)
        ctx.quadraticCurveTo(0, 26 + bFlameH, 5, 26)
        ctx.closePath(); ctx.fill()
      }
      const boosterGrad = ctx.createLinearGradient(-7, 0, 7, 0)
      boosterGrad.addColorStop(0, '#C99A2E'); boosterGrad.addColorStop(0.4, '#FFD166'); boosterGrad.addColorStop(1, '#E0A93D')
      ctx.fillStyle = boosterGrad
      ctx.beginPath()
      ctx.moveTo(0, -10)
      ctx.quadraticCurveTo(7, -6, 7, 4)
      ctx.lineTo(7, 22)
      ctx.quadraticCurveTo(7, 26, 0, 26)
      ctx.quadraticCurveTo(-7, 26, -7, 22)
      ctx.lineTo(-7, 4)
      ctx.quadraticCurveTo(-7, -6, 0, -10)
      ctx.closePath(); ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(-7, 10); ctx.lineTo(7, 10); ctx.stroke()
      ctx.restore()
    })

    const bodyGrad = ctx.createLinearGradient(-15, 0, 15, 0)
    bodyGrad.addColorStop(0, '#E64C4C'); bodyGrad.addColorStop(0.35, '#FF8585'); bodyGrad.addColorStop(0.55, '#FF6B6B'); bodyGrad.addColorStop(1, '#D43F3F')
    ctx.beginPath()
    ctx.moveTo(0, -50)
    ctx.quadraticCurveTo(15, -20, 15, -14)
    ctx.lineTo(15, 16)
    ctx.quadraticCurveTo(15, 20, 11, 20)
    ctx.lineTo(-11, 20)
    ctx.quadraticCurveTo(-15, 20, -15, 16)
    ctx.lineTo(-15, -14)
    ctx.quadraticCurveTo(-15, -20, 0, -50)
    ctx.closePath()
    ctx.fillStyle = bodyGrad; ctx.fill()

    ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(-15, 2); ctx.lineTo(15, 2); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(-14, 10); ctx.lineTo(14, 10); ctx.stroke()

    ctx.fillStyle = '#FFD166'
    ctx.beginPath()
    ctx.moveTo(0, -50)
    ctx.quadraticCurveTo(9, -32, 9, -26)
    ctx.lineTo(-9, -26)
    ctx.quadraticCurveTo(-9, -32, 0, -50)
    ctx.closePath(); ctx.fill()

    ctx.strokeStyle = '#FFD166'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(0, -50); ctx.lineTo(0, -60); ctx.stroke()
    const blink = 0.5 + 0.5 * Math.sin(blinkTimeRef.current * 2.2)
    ctx.globalAlpha = 0.5 + 0.5 * blink
    ctx.fillStyle = '#FFE066'
    ctx.beginPath(); ctx.arc(0, -61, 2.2, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 1

    ctx.fillStyle = '#2A2158'
    ctx.beginPath(); ctx.arc(0, -8, 10.5, 0, Math.PI * 2); ctx.fill()
    const glassGrad = ctx.createRadialGradient(-2, -10, 1, 0, -8, 8)
    glassGrad.addColorStop(0, '#EAF9FF'); glassGrad.addColorStop(1, '#6C5CE7')
    ctx.fillStyle = glassGrad
    ctx.beginPath(); ctx.arc(0, -8, 8, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.beginPath(); ctx.ellipse(-2.5, -10.5, 2.6, 1.6, -0.5, 0, Math.PI * 2); ctx.fill()

    ;[-1, 1].forEach(side => {
      ctx.save()
      ctx.scale(side, 1)
      ctx.fillStyle = '#B83A3A'
      ctx.beginPath()
      ctx.moveTo(11, 8); ctx.lineTo(30, 30); ctx.lineTo(16, 26); ctx.lineTo(11, 20)
      ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#E64C4C'
      ctx.beginPath()
      ctx.moveTo(13, 12); ctx.lineTo(24, 26); ctx.lineTo(15, 23)
      ctx.closePath(); ctx.fill()
      ctx.restore()
    })

    ctx.restore()
  }

  function handlePlayAgain() {
    const s = stateRef.current
    setSuccessVisible(false)
    s.altitude = 0
    s.hasLaunched = false
    s.particles = []
    s.sustainedSeconds = 0
    s.scrollY = 0
    s.lastFrameTime = performance.now()
    s.attemptStartTime = performance.now()
    rafRef.current = requestAnimationFrame(gameLoop)
  }

  function handleRecalibrate() {
    setSettingsOpen(false)
    setHudVisible(false)
    cancelAnimationFrame(rafRef.current)
    runCalibration()
  }

  const circ = 2 * Math.PI * 60

  return (
    <div className="fixed inset-0 bg-[#1B1440] text-[#FFF8EC] overflow-hidden select-none" style={{ fontFamily: "'Quicksand', sans-serif" }}>
      <canvas ref={canvasRef} className="fixed inset-0 w-full h-full block" aria-hidden="true" />

      <button
        onClick={() => navigate('/play/chime')}
        className="fixed top-4 left-4 z-30 flex items-center gap-2 text-white/50 hover:text-white/80 text-sm transition-colors bg-black/20 rounded-full px-3 py-2"
      >
        <ArrowLeft size={16} /> Back
      </button>

      {screen === 'start' && (
        <div className="fixed inset-0 flex flex-col items-center justify-center text-center px-6 z-10">
          <div className="bg-[rgba(27,20,64,0.62)] border border-white/10 rounded-[28px_28px_40px_28px] p-10 max-w-md w-full backdrop-blur-md shadow-2xl">
            <div className="text-6xl mb-3">🚀</div>
            <h1 className="text-4xl font-extrabold mb-2">Rocket Launch</h1>
            <p className="text-lg font-bold text-[#FFD166] mb-7 leading-relaxed flex items-center justify-center gap-2 flex-wrap">
              Say a big, loud "AAAA" to blast your rocket into space!
              <button onClick={replayInstruction} className="text-[#FFD166]/60 hover:text-[#FFD166] transition-colors" aria-label="Hear this again">
                <Volume2 size={18} />
              </button>
            </p>
            <button
              onClick={requestMicAndCalibrate}
              className="font-bold text-xl rounded-full px-10 py-4 text-[#1B1440] bg-[#FFD166] shadow-[0_6px_0_#C99A2E] hover:-translate-y-0.5 transition-transform"
            >
              Let's Play!
            </button>
          </div>
        </div>
      )}

      {screen === 'micError' && (
        <div className="fixed inset-0 flex flex-col items-center justify-center text-center px-6 z-10">
          <div className="bg-[rgba(27,20,64,0.62)] border border-white/10 rounded-[28px_28px_40px_28px] p-10 max-w-md w-full backdrop-blur-md shadow-2xl">
            <div className="text-6xl mb-3">🎤</div>
            <h1 className="text-2xl font-extrabold mb-2">We need to hear you!</h1>
            <p className="text-sm text-[#FFD3D3] mb-5">{micErrorMsg}</p>
            <button onClick={requestMicAndCalibrate} className="font-bold text-xl rounded-full px-10 py-4 text-[#1B1440] bg-[#FFD166] shadow-[0_6px_0_#C99A2E]">
              Try Again
            </button>
          </div>
        </div>
      )}

      {screen === 'calibrate' && (
        <div className="fixed inset-0 flex flex-col items-center justify-center text-center px-6 z-10">
          <div className="bg-[rgba(27,20,64,0.62)] border border-white/10 rounded-[28px_28px_40px_28px] p-10 max-w-md w-full backdrop-blur-md shadow-2xl">
            <div className="relative w-[150px] h-[150px] mx-auto mb-5">
              <svg width="150" height="150" className="-rotate-90">
                <circle cx="75" cy="75" r="60" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="10" />
                <circle cx="75" cy="75" r="60" fill="none" stroke="#FFD166" strokeWidth="10" strokeLinecap="round"
                  strokeDasharray={circ} strokeDashoffset={circ * (1 - calibProgress)} style={{ transition: 'stroke-dashoffset 0.1s linear' }} />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-3xl">{calibLabel.emoji}</div>
            </div>
            <h1 className="text-2xl font-extrabold mb-2">{calibLabel.title}</h1>
            <p className="text-lg font-bold text-[#FFD166]">{calibLabel.subtitle}</p>
          </div>
        </div>
      )}

      {hudVisible && (
        <div className="fixed top-0 left-0 right-0 flex justify-between items-start px-5 py-4 z-20">
          <div
            className={`font-bold text-lg bg-[rgba(27,20,64,0.62)] border border-white/10 rounded-full px-6 py-2.5 backdrop-blur-md max-w-[70vw] transition-opacity ${encourageVisible ? 'opacity-100' : 'opacity-0'}`}
          >
            Take a big breath and try a loud "aaaa"!
          </div>
          <button
            onClick={() => setSettingsOpen(v => !v)}
            className="w-[46px] h-[46px] rounded-full bg-[rgba(27,20,64,0.62)] border border-white/10 flex items-center justify-center backdrop-blur-md shadow-lg"
            aria-label="Settings"
          >
            <Settings size={20} />
          </button>
        </div>
      )}

      {settingsOpen && (
        <div className="fixed top-[74px] right-[18px] bg-[rgba(27,20,64,0.62)] border border-white/10 rounded-[20px_20px_28px_20px] p-5 z-30 w-[240px] text-left backdrop-blur-md shadow-2xl">
          <h3 className="font-extrabold mb-3">Settings</h3>
          <label className="flex items-center justify-between mb-3 font-bold text-sm cursor-pointer">
            <span>Reduce motion</span>
            <input type="checkbox" checked={reduceMotion} onChange={e => setReduceMotion(e.target.checked)} className="accent-[#6BCB77]" />
          </label>
          <label className="flex items-center justify-between mb-3 font-bold text-sm cursor-pointer">
            <span>Mute sounds</span>
            <input type="checkbox" checked={muted} onChange={e => setMuted(e.target.checked)} className="accent-[#6BCB77]" />
          </label>
          <button onClick={handleRecalibrate} className="w-full mt-1 text-sm border border-white/20 rounded-full px-4 py-2.5">
            Recalibrate mic
          </button>
        </div>
      )}

      {successVisible && (
        <div className="fixed inset-0 flex items-center justify-center z-40 bg-[rgba(27,20,64,0.35)]">
          <div className="bg-[rgba(27,20,64,0.62)] border border-white/10 rounded-[28px_28px_40px_28px] p-10 max-w-md w-full text-center backdrop-blur-md shadow-2xl">
            <div className="text-6xl mb-3">🌟</div>
            <h1 className="text-3xl font-extrabold mb-2">You did it!</h1>
            <p className="text-lg font-bold text-[#FFD166] mb-1">Your rocket reached the stars!</p>
            {agentFeedback && <p className="text-sm opacity-85 mb-5">{agentFeedback}</p>}
            <div className="flex flex-col gap-3 items-center">
              {getNextLevelRoute(LEVEL_ID) && (
                <button
                  onClick={() => navigate(getNextLevelRoute(LEVEL_ID))}
                  className="font-bold text-xl rounded-full px-10 py-4 text-[#1B1440] bg-[#FFD166] shadow-[0_6px_0_#C99A2E] hover:-translate-y-0.5 transition-transform"
                >
                  Next Level →
                </button>
              )}
              <button onClick={handlePlayAgain} className="font-bold text-sm text-white/70 hover:text-white/90 underline underline-offset-4">
                Launch Again!
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="sr-only" aria-live="polite">{ariaMsg}</div>
    </div>
  )
}
