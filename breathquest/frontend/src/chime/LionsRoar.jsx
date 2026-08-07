import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Settings, Volume2 } from 'lucide-react'
import { logEvent, getAgentDecision } from './lib/api'
import { getNextLevelRoute } from './lib/levelProgress'
import { useSpokenInstruction } from '../lib/speech'

const LEVEL_ID = 'r'
const AGENT_POLICY = 'tabular_q'
const MIN_VOICING_FRAMES = 3 // ~50ms at 60fps; filters out single-frame noise blips

// ============================================================
// Pure scoring/state logic. A strong "rrrr" is a loud, sustained burst —
// scored the same way Rocket Launch scores "aaa" (loudness against a
// per-kid calibrated range), reused rather than inventing a new metric a
// growly consonant doesn't need.
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

const ROAR_THRESHOLD = 0.35
// A roar only "counts" once it's been held above threshold for a moment —
// filters out a single loud blip (a cough, a door slam) from registering as
// a full lion roar. Ported 1:1 from the puff-cooldown idea in BreathQuest's
// candle level, adapted to a hold-then-release trigger instead of a puff.
const MIN_ROAR_HOLD_SECONDS = 0.35
const ROAR_COOLDOWN_SECONDS = 0.5

// Rewards sticking with the roar, not just clearing threshold for an instant:
// a longer sustained "rrrr" produces a bigger shockwave and sends the birds
// further, capping at DURATION_BOOST_MAX once DURATION_BOOST_SECONDS of
// unbroken loud voicing is reached. Ported 1:1 from Rocket Launch / Wind
// Chime Garden's duration-boost mechanic.
const DURATION_BOOST_MAX = 0.6
const DURATION_BOOST_SECONDS = 1.6

const TARGET_ROARS_DEFAULT = 4

const DIFFICULTY_AGENT = {
  SAFE_RANGE: [3, 8],
  STEP: 1,
  FAST_S: 5,
  SLOW_S: 16,
  decide(timeToWinSeconds) {
    if (timeToWinSeconds < this.FAST_S) return { action: 'more', message: "What a roar! Let's ask for a few more next time 🦁" }
    if (timeToWinSeconds > this.SLOW_S) return { action: 'fewer', message: "Great effort! Let's ask for a few less next time 🌟" }
    return { action: 'hold', message: 'Nice and strong! Keeping this the same for now 💛' }
  },
  apply(targetRoars, decision) {
    let next = targetRoars
    if (decision.action === 'more') next += this.STEP
    if (decision.action === 'fewer') next -= this.STEP
    return Math.max(this.SAFE_RANGE[0], Math.min(this.SAFE_RANGE[1], next))
  },
}

export default function LionsRoar() {
  const navigate = useNavigate()
  const canvasRef = useRef(null)
  const rafRef = useRef(null)

  const [screen, setScreen] = useState('start')
  const [micErrorMsg, setMicErrorMsg] = useState('')
  const [calibLabel, setCalibLabel] = useState({ title: "Let's find quiet...", subtitle: 'Stay nice and quiet for a moment', emoji: '🤫' })
  const [calibProgress, setCalibProgress] = useState(0)
  const [hudVisible, setHudVisible] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [reduceMotion, setReduceMotion] = useState(() => localStorage.getItem('chime_reduce_motion') === 'true')
  const [muted, setMuted] = useState(() => localStorage.getItem('chime_muted') === 'true')
  const [encourageVisible, setEncourageVisible] = useState(false)
  const [successVisible, setSuccessVisible] = useState(false)
  const [agentFeedback, setAgentFeedback] = useState('')
  const [ariaMsg, setAriaMsg] = useState('')

  const stateRef = useRef({
    audioCtx: null, analyser: null, timeDomainData: null, mediaStream: null,
    noiseFloor: 0.01, maxExpectedRms: 0.3,
    smoothedScore: 0, lastFrameTime: 0, quietStreak: 0,
    roarsDone: 0, targetRoars: TARGET_ROARS_DEFAULT,
    holdSeconds: 0, sustainedSeconds: 0, cooldown: 0, inRoar: false,
    hasFinished: false, particles: [], shockwaves: [], birds: [], dust: [],
    mouthOpen: 0, maneShake: 0,
    attemptStartTime: 0, attemptNumber: 0,
    inVoicing: false, voicingScores: [],
    W: 0, H: 0, DPR: 1,
  })

  const reduceMotionRef = useRef(reduceMotion)
  const mutedRef = useRef(muted)
  useEffect(() => { reduceMotionRef.current = reduceMotion; localStorage.setItem('chime_reduce_motion', reduceMotion) }, [reduceMotion])
  useEffect(() => { mutedRef.current = muted; localStorage.setItem('chime_muted', muted) }, [muted])

  const replayInstruction = useSpokenInstruction(
    'Give a strong, growly rrrr to make the lion roar and gather the pride!',
    { enabled: screen === 'start' && !muted },
  )

  useEffect(() => {
    const state = stateRef.current
    return () => {
      cancelAnimationFrame(rafRef.current)
      if (state.audioCtx) state.audioCtx.close().catch(() => {})
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
    initScene()
  }, [])

  function initScene() {
    const s = stateRef.current
    s.birds = Array.from({ length: 6 }, (_, i) => ({
      x: s.W * 0.2 + i * 40, y: s.H * 0.18 + (i % 3) * 18, homeX: s.W * 0.2 + i * 40,
      fleeX: 0, phase: Math.random() * Math.PI * 2,
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

  function playRoarTone(strength) {
    const s = stateRef.current
    if (mutedRef.current || !s.audioCtx) return
    const a = s.audioCtx
    const osc = a.createOscillator(), gain = a.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(110, a.currentTime)
    osc.frequency.exponentialRampToValueAtTime(70, a.currentTime + 0.4)
    gain.gain.setValueAtTime(0, a.currentTime)
    gain.gain.linearRampToValueAtTime(0.05 * (0.6 + strength * 0.4), a.currentTime + 0.05)
    gain.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.55)
    osc.connect(gain).connect(a.destination)
    osc.start(); osc.stop(a.currentTime + 0.6)
  }

  function playSuccessChime() {
    const s = stateRef.current
    ;[392.0, 493.88, 587.33, 783.99].forEach((f, i) => setTimeout(() => {
      if (mutedRef.current || !s.audioCtx) return
      const a = s.audioCtx
      const osc = a.createOscillator(), gain = a.createGain()
      osc.type = 'triangle'; osc.frequency.value = f
      gain.gain.setValueAtTime(0, a.currentTime)
      gain.gain.linearRampToValueAtTime(0.05, a.currentTime + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.5)
      osc.connect(gain).connect(a.destination)
      osc.start(); osc.stop(a.currentTime + 0.55)
    }, i * 110))
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
        ? 'Please allow microphone access so the savanna can hear your roar.'
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
      setCalibLabel({ title: 'Now give a big "RRRR"!', subtitle: 'A strong, growly roar like a lion', emoji: '🦁' })
      setCalibProgress(0)
      const loudStart = performance.now()
      function loudStep(now) {
        const elapsed = now - loudStart
        loudSamples.push(readCurrentRMS())
        setCalibProgress(Math.min(1, elapsed / LOUD_MS))
        if (elapsed < LOUD_MS) {
          requestAnimationFrame(loudStep)
        } else {
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
    s.roarsDone = 0; s.hasFinished = false; s.sustainedSeconds = 0; s.holdSeconds = 0
    s.cooldown = 0; s.inRoar = false; s.shockwaves = []
    s.lastFrameTime = performance.now()
    s.attemptStartTime = performance.now()
    setAriaMsg('Ready! Give a big, growly "rrrr" to make the lion roar.')
    rafRef.current = requestAnimationFrame(gameLoop)
  }

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

  async function updateDifficultyFromAttempt(timeToWinSeconds) {
    const s = stateRef.current
    let decision = null
    try {
      decision = await getAgentDecision(LEVEL_ID, AGENT_POLICY)
    } catch (err) {
      console.warn('Trained-agent endpoint unavailable, falling back to local rule-based agent:', err)
    }
    if (!decision) decision = DIFFICULTY_AGENT.decide(timeToWinSeconds)
    s.targetRoars = DIFFICULTY_AGENT.apply(s.targetRoars, decision)
    setAgentFeedback(decision.message)
  }

  function spawnShockwave(boost) {
    const s = stateRef.current
    s.shockwaves.push({ r: 20, maxR: 260 + boost * 220, life: 1, x: s.W * 0.32, y: s.H * 0.72 })
  }

  function spawnDust(boost) {
    const s = stateRef.current
    if (reduceMotionRef.current) return
    const count = Math.round(8 + boost * 14)
    for (let i = 0; i < count; i++) {
      s.dust.push({
        x: s.W * 0.32 + (Math.random() - 0.5) * 60, y: s.H * 0.78,
        vx: (Math.random() - 0.5) * 90, vy: -Math.random() * 40 - 10,
        life: 1, r: Math.random() * 3 + 1.5,
      })
    }
  }

  function scareOffBirds(boost) {
    const s = stateRef.current
    for (const b of s.birds) b.fleeX = Math.max(b.fleeX, 120 + boost * 260)
  }

  function completeRoar(peakScore, holdSeconds) {
    const s = stateRef.current
    const boost = Math.min(1, holdSeconds / DURATION_BOOST_SECONDS) * DURATION_BOOST_MAX * (0.5 + peakScore * 0.5)
    s.mouthOpen = 1
    s.maneShake = 1
    playRoarTone(peakScore)
    spawnShockwave(boost)
    spawnDust(boost)
    scareOffBirds(boost)
    s.roarsDone++
    s.cooldown = ROAR_COOLDOWN_SECONDS
  }

  function gameLoop(now) {
    const s = stateRef.current
    const dt = Math.min(0.1, (now - s.lastFrameTime) / 1000)
    s.lastFrameTime = now

    const rms = readCurrentRMS()
    const rawScore = computeLoudnessScore(rms, s.noiseFloor, s.maxExpectedRms)
    s.smoothedScore = s.smoothedScore * 0.7 + rawScore * 0.3

    if (s.cooldown > 0) s.cooldown -= dt

    const above = s.smoothedScore >= ROAR_THRESHOLD
    if (above && s.cooldown <= 0) {
      s.holdSeconds += dt
      s.sustainedSeconds += dt
      s.inRoar = true
    } else {
      if (s.inRoar && s.holdSeconds >= MIN_ROAR_HOLD_SECONDS && s.roarsDone < s.targetRoars) {
        completeRoar(s.smoothedScore, s.holdSeconds)
      }
      s.holdSeconds = 0
      s.sustainedSeconds = 0
      s.inRoar = false
    }

    // Track sustained voicing segments for real per-attempt logging,
    // independent of the roar-trigger debounce above.
    if (rawScore > 0.1) {
      s.inVoicing = true
      s.voicingScores.push(s.smoothedScore)
    } else if (s.inVoicing) {
      logVoicingAttempt(s.voicingScores)
      s.inVoicing = false
      s.voicingScores = []
    }

    s.mouthOpen = Math.max(0, s.mouthOpen - dt * 1.4)
    s.maneShake = Math.max(0, s.maneShake - dt * 2.2)

    for (const b of s.birds) {
      b.phase += dt * 2
      b.fleeX = Math.max(0, b.fleeX - dt * 40)
    }
    for (const w of s.shockwaves) { w.r += (w.maxR - w.r) * dt * 3; w.life -= dt * 1.1 }
    s.shockwaves = s.shockwaves.filter(w => w.life > 0)
    for (const p of s.dust) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 60 * dt; p.life -= dt * 0.9 }
    s.dust = s.dust.filter(p => p.life > 0)
    for (const p of s.particles) { p.x += p.vx * dt * 60; p.y += p.vy * dt * 60; p.vy += 0.15; p.life -= dt * 1.2 }
    s.particles = s.particles.filter(p => p.life > 0)

    if (rawScore < 0.08) s.quietStreak += dt; else s.quietStreak = 0
    setEncourageVisible(s.quietStreak > 3 && s.roarsDone < 1)

    render()

    if (s.roarsDone >= s.targetRoars && !s.hasFinished) {
      s.hasFinished = true
      onPrideSuccess()
    }
    if (!s.hasFinished) rafRef.current = requestAnimationFrame(gameLoop)
  }

  async function logLevelComplete() {
    const s = stateRef.current
    try {
      await logEvent({ level_id: LEVEL_ID, attempt_number: s.attemptNumber, score: 1, is_valid_attempt: true, action: 'level_complete' })
    } catch (err) {
      console.warn('Backend event logging unavailable:', err)
    }
  }

  function onPrideSuccess() {
    const s = stateRef.current
    logLevelComplete()
    if (s.inVoicing) {
      logVoicingAttempt(s.voicingScores)
      s.inVoicing = false
      s.voicingScores = []
    }
    playSuccessChime()
    setAriaMsg('The lion let out a mighty roar and gathered the whole pride!')
    const count = reduceMotionRef.current ? 16 : 50
    for (let i = 0; i < count; i++) {
      s.particles.push({
        x: s.W * 0.32, y: s.H * 0.55,
        vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6 - 1.5,
        life: 1, color: ['#F0604A', '#FAC775', '#FFE066', '#F97316'][i % 4], r: Math.random() * 3 + 2,
      })
    }
    const timeToWinSeconds = (performance.now() - s.attemptStartTime) / 1000
    updateDifficultyFromAttempt(timeToWinSeconds)
    let frames = 0
    function celebrateLoop() {
      render()
      frames++
      if (frames < 90) requestAnimationFrame(celebrateLoop)
    }
    requestAnimationFrame(celebrateLoop)
    setTimeout(() => setSuccessVisible(true), 500)
  }

  function render() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const s = stateRef.current
    if (!s.W || !s.H) return

    // Golden-hour savanna sky
    const sky = ctx.createLinearGradient(0, 0, 0, s.H * 0.7)
    sky.addColorStop(0, '#7A4A9E')
    sky.addColorStop(0.5, '#E2703A')
    sky.addColorStop(1, '#F7C873')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, s.W, s.H * 0.7)

    // Sun
    ctx.fillStyle = 'rgba(255,235,190,0.9)'
    ctx.beginPath(); ctx.arc(s.W * 0.78, s.H * 0.32, 46, 0, Math.PI * 2); ctx.fill()

    // Distant acacia silhouettes
    ctx.fillStyle = 'rgba(60,30,20,0.55)'
    ;[0.12, 0.55, 0.88].forEach((fx, i) => {
      const tx = s.W * fx, ty = s.H * 0.62
      ctx.fillRect(tx - 3, ty - 40 - i * 4, 6, 40 + i * 4)
      ctx.beginPath(); ctx.ellipse(tx, ty - 44 - i * 4, 34, 14, 0, 0, Math.PI * 2); ctx.fill()
    })

    // Ground
    const ground = ctx.createLinearGradient(0, s.H * 0.68, 0, s.H)
    ground.addColorStop(0, '#B98A4A')
    ground.addColorStop(1, '#7A5A2E')
    ctx.fillStyle = ground
    ctx.fillRect(0, s.H * 0.68, s.W, s.H * 0.32)

    // Birds fleeing
    ctx.strokeStyle = 'rgba(40,20,15,0.8)'
    ctx.lineWidth = 2
    for (const b of s.birds) {
      const bx = b.x + b.fleeX
      const by = b.y + Math.sin(b.phase) * 6
      const flap = Math.sin(b.phase * 4) * 6
      ctx.beginPath()
      ctx.moveTo(bx - 8, by); ctx.quadraticCurveTo(bx - 3, by - flap, bx, by)
      ctx.quadraticCurveTo(bx + 3, by - flap, bx + 8, by)
      ctx.stroke()
    }

    // Rock the cub sits on
    const rockX = s.W * 0.32, rockY = s.H * 0.78
    ctx.fillStyle = '#8B7355'
    ctx.beginPath(); ctx.ellipse(rockX, rockY, 90, 34, 0, 0, Math.PI * 2); ctx.fill()

    // Shockwaves (drawn behind the cub so they read as radiating outward)
    for (const w of s.shockwaves) {
      ctx.strokeStyle = `rgba(240,96,74,${Math.max(0, w.life) * 0.5})`
      ctx.lineWidth = 4
      ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2); ctx.stroke()
    }

    // Dust
    for (const p of s.dust) {
      ctx.fillStyle = `rgba(180,140,90,${Math.max(0, p.life) * 0.5})`
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill()
    }

    drawLionCub(ctx, rockX, rockY - 30, s)

    // Celebration particles
    for (const p of s.particles) {
      ctx.globalAlpha = Math.max(0, p.life)
      ctx.fillStyle = p.color
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill()
      ctx.globalAlpha = 1
    }

    // HUD — roar counter as paw prints
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.beginPath(); ctx.roundRect(s.W / 2 - 120, 58, 240, 40, 10); ctx.fill()
    for (let i = 0; i < s.targetRoars; i++) {
      const px = s.W / 2 - (s.targetRoars - 1) * 15 + i * 30
      ctx.fillStyle = i < s.roarsDone ? '#FAC775' : 'rgba(255,255,255,0.25)'
      ctx.beginPath(); ctx.arc(px, 78, 8, 0, Math.PI * 2); ctx.fill()
    }
  }

  function drawLionCub(ctx, cx, cy, s) {
    const shake = s.maneShake * (Math.random() - 0.5) * 4
    ctx.save()
    ctx.translate(cx + shake, cy)

    // Mane
    const maneScale = 1 + s.maneShake * 0.12
    ctx.save(); ctx.scale(maneScale, maneScale)
    ctx.fillStyle = '#C97B2E'
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2
      ctx.beginPath()
      ctx.ellipse(Math.cos(a) * 46, Math.sin(a) * 46, 20, 12, a, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()

    // Head
    ctx.fillStyle = '#E8A853'
    ctx.beginPath(); ctx.arc(0, 0, 40, 0, Math.PI * 2); ctx.fill()

    // Muzzle
    ctx.fillStyle = '#F4D9A8'
    ctx.beginPath(); ctx.ellipse(0, 16, 22, 16, 0, 0, Math.PI * 2); ctx.fill()

    // Mouth — opens with mouthOpen (0..1)
    const openAmt = s.mouthOpen
    ctx.fillStyle = '#7A1F1F'
    ctx.beginPath()
    ctx.moveTo(-16, 18)
    ctx.quadraticCurveTo(0, 18 + openAmt * 34, 16, 18)
    ctx.quadraticCurveTo(0, 22 + openAmt * 6, -16, 18)
    ctx.fill()
    if (openAmt > 0.15) {
      ctx.fillStyle = '#FFF'
      ctx.beginPath(); ctx.moveTo(-13, 18); ctx.lineTo(-8, 18 + 6); ctx.lineTo(-3, 18); ctx.fill()
      ctx.beginPath(); ctx.moveTo(3, 18); ctx.lineTo(8, 18 + 6); ctx.lineTo(13, 18); ctx.fill()
    }

    // Nose
    ctx.fillStyle = '#3A2418'
    ctx.beginPath(); ctx.ellipse(0, 8, 6, 4, 0, 0, Math.PI * 2); ctx.fill()

    // Eyes
    ctx.fillStyle = '#2A1A10'
    ctx.beginPath(); ctx.arc(-14, -4, 4, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(14, -4, 4, 0, Math.PI * 2); ctx.fill()

    // Ears
    ctx.fillStyle = '#C97B2E'
    ctx.beginPath(); ctx.arc(-30, -30, 10, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(30, -30, 10, 0, Math.PI * 2); ctx.fill()

    ctx.restore()
  }

  function handlePlayAgain() {
    const s = stateRef.current
    setSuccessVisible(false)
    s.roarsDone = 0; s.hasFinished = false; s.sustainedSeconds = 0; s.holdSeconds = 0
    s.cooldown = 0; s.inRoar = false; s.shockwaves = []; s.particles = []
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
    <div className="fixed inset-0 bg-[#2A1A3E] text-[#FFF8EC] overflow-hidden select-none" style={{ fontFamily: "'Quicksand', sans-serif" }}>
      <canvas ref={canvasRef} className="fixed inset-0 w-full h-full block" aria-hidden="true" />

      <button
        onClick={() => navigate('/play/chime')}
        className="fixed top-4 left-4 z-30 flex items-center gap-2 text-white/50 hover:text-white/80 text-sm transition-colors bg-black/20 rounded-full px-3 py-2"
      >
        <ArrowLeft size={16} /> Back
      </button>

      {screen === 'start' && (
        <div className="fixed inset-0 flex flex-col items-center justify-center text-center px-6 z-10">
          <div className="bg-[rgba(42,26,62,0.65)] border border-white/10 rounded-[28px_28px_40px_28px] p-10 max-w-md w-full backdrop-blur-md shadow-2xl">
            <div className="text-6xl mb-3">🦁</div>
            <h1 className="text-4xl font-extrabold mb-2">Lion's Roar</h1>
            <p className="text-lg font-bold text-[#F0604A] mb-7 leading-relaxed flex items-center justify-center gap-2 flex-wrap">
              Give a strong, growly "rrrr" to make the lion roar and gather the pride!
              <button onClick={replayInstruction} className="text-[#F0604A]/60 hover:text-[#F0604A] transition-colors" aria-label="Hear this again">
                <Volume2 size={18} />
              </button>
            </p>
            <button
              onClick={requestMicAndCalibrate}
              className="font-bold text-xl rounded-full px-10 py-4 text-[#2A1A3E] bg-[#F0604A] shadow-[0_6px_0_#B23F2E] hover:-translate-y-0.5 transition-transform"
            >
              Let's Play!
            </button>
          </div>
        </div>
      )}

      {screen === 'micError' && (
        <div className="fixed inset-0 flex flex-col items-center justify-center text-center px-6 z-10">
          <div className="bg-[rgba(42,26,62,0.65)] border border-white/10 rounded-[28px_28px_40px_28px] p-10 max-w-md w-full backdrop-blur-md shadow-2xl">
            <div className="text-6xl mb-3">🎤</div>
            <h1 className="text-2xl font-extrabold mb-2">We need to hear you!</h1>
            <p className="text-sm text-[#FFD3D3] mb-5">{micErrorMsg}</p>
            <button onClick={requestMicAndCalibrate} className="font-bold text-xl rounded-full px-10 py-4 text-[#2A1A3E] bg-[#F0604A] shadow-[0_6px_0_#B23F2E]">
              Try Again
            </button>
          </div>
        </div>
      )}

      {screen === 'calibrate' && (
        <div className="fixed inset-0 flex flex-col items-center justify-center text-center px-6 z-10">
          <div className="bg-[rgba(42,26,62,0.65)] border border-white/10 rounded-[28px_28px_40px_28px] p-10 max-w-md w-full backdrop-blur-md shadow-2xl">
            <div className="relative w-[150px] h-[150px] mx-auto mb-5">
              <svg width="150" height="150" className="-rotate-90">
                <circle cx="75" cy="75" r="60" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="10" />
                <circle cx="75" cy="75" r="60" fill="none" stroke="#F0604A" strokeWidth="10" strokeLinecap="round"
                  strokeDasharray={circ} strokeDashoffset={circ * (1 - calibProgress)} style={{ transition: 'stroke-dashoffset 0.1s linear' }} />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-3xl">{calibLabel.emoji}</div>
            </div>
            <h1 className="text-2xl font-extrabold mb-2">{calibLabel.title}</h1>
            <p className="text-lg font-bold text-[#F0604A]">{calibLabel.subtitle}</p>
          </div>
        </div>
      )}

      {hudVisible && (
        <div className="fixed top-0 left-0 right-0 flex justify-between items-start px-5 py-4 z-20">
          <div
            className={`font-bold text-lg bg-[rgba(42,26,62,0.65)] border border-white/10 rounded-full px-6 py-2.5 backdrop-blur-md max-w-[70vw] transition-opacity ${encourageVisible ? 'opacity-100' : 'opacity-0'}`}
          >
            Try a strong, growly "rrrr" like a lion!
          </div>
          <button
            onClick={() => setSettingsOpen(v => !v)}
            className="w-[46px] h-[46px] rounded-full bg-[rgba(42,26,62,0.65)] border border-white/10 flex items-center justify-center backdrop-blur-md shadow-lg"
            aria-label="Settings"
          >
            <Settings size={20} />
          </button>
        </div>
      )}

      {settingsOpen && (
        <div className="fixed top-[74px] right-[18px] bg-[rgba(42,26,62,0.65)] border border-white/10 rounded-[20px_20px_28px_20px] p-5 z-30 w-[240px] text-left backdrop-blur-md shadow-2xl">
          <h3 className="font-extrabold mb-3">Settings</h3>
          <label className="flex items-center justify-between mb-3 font-bold text-sm cursor-pointer">
            <span>Reduce motion</span>
            <input type="checkbox" checked={reduceMotion} onChange={e => setReduceMotion(e.target.checked)} className="accent-[#F0604A]" />
          </label>
          <label className="flex items-center justify-between mb-3 font-bold text-sm cursor-pointer">
            <span>Mute sounds</span>
            <input type="checkbox" checked={muted} onChange={e => setMuted(e.target.checked)} className="accent-[#F0604A]" />
          </label>
          <button onClick={handleRecalibrate} className="w-full mt-1 text-sm border border-white/20 rounded-full px-4 py-2.5">
            Recalibrate mic
          </button>
        </div>
      )}

      {successVisible && (
        <div className="fixed inset-0 flex items-center justify-center z-40 bg-[rgba(42,26,62,0.4)]">
          <div className="bg-[rgba(42,26,62,0.65)] border border-white/10 rounded-[28px_28px_40px_28px] p-10 max-w-md w-full text-center backdrop-blur-md shadow-2xl">
            <div className="text-6xl mb-3">🦁</div>
            <h1 className="text-3xl font-extrabold mb-2">RAWR! What a roar!</h1>
            <p className="text-lg font-bold text-[#F0604A] mb-1">You gathered the whole pride!</p>
            {agentFeedback && <p className="text-sm opacity-85 mb-5">{agentFeedback}</p>}
            {getNextLevelRoute(LEVEL_ID) && (
              <button onClick={() => navigate(getNextLevelRoute(LEVEL_ID))} className="font-bold text-xl rounded-full px-10 py-4 text-[#2A1A3E] bg-[#F0604A] shadow-[0_6px_0_#B23F2E] mb-3">
                Next Level →
              </button>
            )}
            <button onClick={handlePlayAgain} className="font-bold text-xl rounded-full px-10 py-4 text-[#2A1A3E] bg-[#F0604A] shadow-[0_6px_0_#B23F2E]">
              Play Again!
            </button>
          </div>
        </div>
      )}

      <div className="sr-only" aria-live="polite">{ariaMsg}</div>
    </div>
  )
}
