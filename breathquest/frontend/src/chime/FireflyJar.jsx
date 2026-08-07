import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Settings, Volume2 } from 'lucide-react'
import { logEvent, getAgentDecision } from './lib/api'
import { getNextLevelRoute } from './lib/levelProgress'
import { useSpokenInstruction } from '../lib/speech'


const MIN_PEAK_RMS_DEFAULT = 0.05
const MAX_EXPECTED_PEAK_RMS_DEFAULT = 0.4
const MAX_BURST_DURATION_S = 0.6
const NUM_FIREFLIES = 8
const CATCH_THRESHOLD_DEFAULT = 0.10
const LEVEL_ID = 'ma'
const AGENT_POLICY = 'tabular_q'

function computeRMS(samples) {
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
  return Math.sqrt(sum / samples.length)
}

function scoreBurst(rmsEnvelope, durationS, minPeakRms = MIN_PEAK_RMS_DEFAULT, maxExpectedPeakRms = MAX_EXPECTED_PEAK_RMS_DEFAULT) {
  if (!rmsEnvelope.length) return { score: 0, isValidAttempt: false }
  const peakRms = Math.max(...rmsEnvelope)
  if (peakRms < minPeakRms) return { score: 0, isValidAttempt: false, peakRms }
  const durationPenalty = durationS <= MAX_BURST_DURATION_S ? 1.0 : Math.max(0, 1.0 - (durationS - MAX_BURST_DURATION_S))
  const magnitudeScore = Math.max(0, Math.min(1, (peakRms - minPeakRms) / (maxExpectedPeakRms - minPeakRms)))
  return { score: magnitudeScore * durationPenalty, isValidAttempt: true, peakRms }
}

// "ma" is a discrete burst, not a sustained tone, so there's no continuous
// voicing to reward the way Rocket Launch/Submarine Dive/Wind Chime Garden
// do. The burst-appropriate equivalent: reward a quick, clean *streak* of
// catches in a row (rapid "ma-ma-ma", not one lone "ma" then a long pause).
// Each catch inside STREAK_GAP_S of the previous one extends the streak;
// a catch after a longer gap, or a burst that fails to catch, resets it to
// 0 — same "resets the instant it breaks" behavior as the sustain games,
// just measured burst-to-burst instead of frame-to-frame.
const STREAK_GAP_S = 1.2
const STREAK_LENGTH_FOR_MAX = 4  // 4 quick catches in a row = max bonus
const STREAK_BONUS_MAX = 1       // +1 extra firefly per catch at max streak

function computeStreakBonus(streakCount) {
  return Math.min(STREAK_BONUS_MAX, Math.floor(STREAK_BONUS_MAX * streakCount / STREAK_LENGTH_FOR_MAX))
}

function personalizeBurstRange(peakRmsReadings, noiseFloor, fallbackMax = MAX_EXPECTED_PEAK_RMS_DEFAULT) {
  const valid = peakRmsReadings.filter(p => p > 0)
  const minPeakRms = Math.max(0.01, noiseFloor * 1.8)
  if (valid.length < 2) return { minPeakRms, maxExpectedPeakRms: fallbackMax, usedFallback: true }
  const maxObserved = Math.max(...valid)
  const maxExpectedPeakRms = Math.max(minPeakRms + 0.05, maxObserved)
  return { minPeakRms, maxExpectedPeakRms, usedFallback: false }
}

const DIFFICULTY_AGENT = {
  SAFE_RANGE: [0.10, 0.4],
  STEP: 0.03,
  FAST_S: 6,
  SLOW_S: 18,
  decide(timeToFillSeconds) {
    if (timeToFillSeconds < this.FAST_S) return { action: 'raise', message: "Great strong sounds! Let's ask for a bit more next time 🦟" }
    if (timeToFillSeconds > this.SLOW_S) return { action: 'lower', message: "Nice effort! Let's make the next jar a little easier 💛" }
    return { action: 'hold', message: "Great steady sounds! Let's keep this the same for now 🌟" }
  },
  apply(threshold, decision) {
    let next = threshold
    if (decision.action === 'raise') next += this.STEP
    if (decision.action === 'lower') next -= this.STEP
    return Math.max(this.SAFE_RANGE[0], Math.min(this.SAFE_RANGE[1], next))
  },
}

export default function FireflyJar() {
  const navigate = useNavigate()
  const canvasRef = useRef(null)
  const rafRef = useRef(null)

  const [screen, setScreen] = useState('start')
  const [micErrorMsg, setMicErrorMsg] = useState('')
  const [calibLabel, setCalibLabel] = useState({ title: "Let's find quiet...", subtitle: 'Stay nice and quiet for a moment', emoji: '🤫' })
  const [calibProgress, setCalibProgress] = useState(0)
  const [hudVisible, setHudVisible] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [reduceMotion, setReduceMotion] = useState(() => localStorage.getItem('firefly_reduce_motion') === 'true')
  const [muted, setMuted] = useState(() => localStorage.getItem('firefly_muted') === 'true')
  const [encourageVisible, setEncourageVisible] = useState(false)
  const [successVisible, setSuccessVisible] = useState(false)
  const [agentFeedback, setAgentFeedback] = useState('')
  const [ariaMsg, setAriaMsg] = useState('')

  const stateRef = useRef({
    audioCtx: null, analyser: null, timeDomainData: null, mediaStream: null,
    noiseFloor: 0.01,
    firefliesCaught: 0, catchThreshold: CATCH_THRESHOLD_DEFAULT,
    minPeakRms: MIN_PEAK_RMS_DEFAULT, maxExpectedPeakRms: MAX_EXPECTED_PEAK_RMS_DEFAULT,
    burstEnvelope: [], inBurst: false, burstStartTime: 0,
    catchStreak: 0, lastCatchTime: -1,
    freeFireflies: [], jarFireflies: [], caughtPulse: 0,
    lastFrameTime: 0, quietStreak: 0,
    hasFinished: false, particles: [],
    attemptStartTime: 0, treeTime: 0,
    attemptNumber: 0,
    W: 0, H: 0, DPR: 1,
  })

  const reduceMotionRef = useRef(reduceMotion)
  const mutedRef = useRef(muted)
  useEffect(() => { reduceMotionRef.current = reduceMotion; localStorage.setItem('firefly_reduce_motion', reduceMotion) }, [reduceMotion])
  useEffect(() => { mutedRef.current = muted; localStorage.setItem('firefly_muted', muted) }, [muted])

  const replayInstruction = useSpokenInstruction(
    'Say "ma" to catch a firefly and fill the jar! Press your lips together like you\'re humming mmm, then pop your mouth open with your voice on: ma.',
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

  function initFreeFireflies() {
    const s = stateRef.current
    const count = 10
    s.freeFireflies = Array.from({ length: count }, () => ({
      x: Math.random() * s.W, y: s.H * 0.15 + Math.random() * s.H * 0.55,
      phase: Math.random() * Math.PI * 2, driftPhase: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.3 + 0.1,
    }))
  }

  function resizeCanvas() {
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
    initFreeFireflies()
  }

  useEffect(() => {
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)
    return () => window.removeEventListener('resize', resizeCanvas)
  }, [])

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
    gain.gain.linearRampToValueAtTime(gainPeak, a.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + duration)
    osc.connect(gain).connect(a.destination)
    osc.start(); osc.stop(a.currentTime + duration + 0.05)
  }
  function playCatch() { [660, 880].forEach((f, i) => setTimeout(() => playTone(f, 0.15, 'sine', 0.06), i * 50)) }
  function playSuccessChime() { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => setTimeout(() => playTone(f, 0.5, 'triangle', 0.05), i * 110)) }

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
        ? 'Please allow microphone access so we can hear your voice.'
        : 'Something went wrong reaching the microphone. Please try again.')
      setScreen('micError')
    }
  }

  function runCalibration() {
    setScreen('calibrate')
    const QUIET_MS = 1200
    const LOUD_MS = 1800
    let quietSamples = []
    let burstPeaks = []

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
      setCalibLabel({ title: 'Now say "ma-ma-ma"!', subtitle: 'A few clear tries, one after another', emoji: '🦟' })
      setCalibProgress(0)
      const loudStart = performance.now()
      let inBurst = false, currentBurstPeak = 0
      const burstGate = stateRef.current.noiseFloor * 1.8
      function loudStep(now) {
        const elapsed = now - loudStart
        const rms = readCurrentRMS()
        if (rms >= burstGate) {
          inBurst = true
          currentBurstPeak = Math.max(currentBurstPeak, rms)
        } else if (inBurst) {
          burstPeaks.push(currentBurstPeak)
          inBurst = false
          currentBurstPeak = 0
        }
        setCalibProgress(Math.min(1, elapsed / LOUD_MS))
        if (elapsed < LOUD_MS) {
          requestAnimationFrame(loudStep)
        } else {
          if (inBurst) burstPeaks.push(currentBurstPeak)
          const { minPeakRms, maxExpectedPeakRms } = personalizeBurstRange(burstPeaks, stateRef.current.noiseFloor)
          stateRef.current.minPeakRms = minPeakRms
          stateRef.current.maxExpectedPeakRms = maxExpectedPeakRms
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
    s.firefliesCaught = 0
    s.jarFireflies = []
    s.hasFinished = false
    s.particles = []
    s.catchStreak = 0
    s.lastCatchTime = -1
    s.lastFrameTime = performance.now()
    s.attemptStartTime = performance.now()
    setAriaMsg('Ready! Say "ma" to catch a firefly.')
    rafRef.current = requestAnimationFrame(gameLoop)
  }

  // Logs one real, per-burst event to the backend: one attempt = one detected sound,
  // score = actual audio-quality score for that burst, not anything derived from
  // overall jar-fill time.
  async function logBurstAttempt(score, isValidAttempt) {
    const s = stateRef.current
    s.attemptNumber++
    try {
      await logEvent({ level_id: LEVEL_ID, attempt_number: s.attemptNumber, score, is_valid_attempt: isValidAttempt })
    } catch (err) {
      console.warn('Backend event logging unavailable:', err)
    }
  }

  // Jar-completion pacing only: asks the difficulty agent whether to raise/lower the
  // catch threshold. timeToFillSeconds is a local signal only — never sent to the
  // backend as "score".
  async function updateDifficultyFromAttempt(timeToFillSeconds) {
    const s = stateRef.current

    let decision = null
    try {
      decision = await getAgentDecision(LEVEL_ID, AGENT_POLICY)
    } catch (err) {
      console.warn('Trained-agent endpoint unavailable, falling back to local rule-based agent:', err)
    }
    if (!decision) decision = DIFFICULTY_AGENT.decide(timeToFillSeconds)

    s.catchThreshold = DIFFICULTY_AGENT.apply(s.catchThreshold, decision)
    setAgentFeedback(decision.message)
  }

  function spawnJarFirefly() {
    stateRef.current.jarFireflies.push({
      x: (Math.random() - 0.5) * 40, y: (Math.random() - 0.5) * 50,
      phase: Math.random() * Math.PI * 2,
      driftX: Math.random() * Math.PI * 2, driftY: Math.random() * Math.PI * 2,
    })
  }

  // Marks the level as passed independent of any single burst's score — the
  // in-game catch threshold is intentionally forgiving (CATCH_THRESHOLD_DEFAULT),
  // so no individual logged burst may ever clear PASS_THRESHOLD even when the
  // kid genuinely fills the jar. levelProgress.js treats this as a pass.
  async function logLevelComplete() {
    const s = stateRef.current
    try {
      await logEvent({ level_id: LEVEL_ID, attempt_number: s.attemptNumber, score: 1, is_valid_attempt: true, action: 'level_complete' })
    } catch (err) {
      console.warn('Backend event logging unavailable:', err)
    }
  }

  function onJarFull() {
    const s = stateRef.current
    logLevelComplete()
    playSuccessChime()
    setAriaMsg('The jar is full of fireflies!')
    spawnCelebrationParticles()
    const timeToFillSeconds = (performance.now() - s.attemptStartTime) / 1000
    updateDifficultyFromAttempt(timeToFillSeconds)
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
    const count = reduceMotionRef.current ? 16 : 50
    const jarX = s.W / 2, jarY = s.H * 0.62
    for (let i = 0; i < count; i++) {
      s.particles.push({
        x: jarX, y: jarY,
        vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6 - 2,
        life: 1, color: ['#FFE9A0', '#FFD166', '#FFF8EC', '#FFB870'][i % 4],
        r: Math.random() * 3 + 2,
      })
    }
  }

  function gameLoop(now) {
    const s = stateRef.current
    const dt = Math.min(0.1, (now - s.lastFrameTime) / 1000)
    s.lastFrameTime = now

    const rms = readCurrentRMS()
    const burstThreshold = s.noiseFloor * 1.8

    if (rms >= burstThreshold) {
      if (!s.inBurst) { s.inBurst = true; s.burstStartTime = now; s.burstEnvelope = [] }
      s.burstEnvelope.push(rms)
    } else if (s.inBurst) {
      const durationS = (now - s.burstStartTime) / 1000
      const { score, isValidAttempt } = scoreBurst(s.burstEnvelope, durationS, s.minPeakRms, s.maxExpectedPeakRms)
      if (isValidAttempt && score >= s.catchThreshold && s.firefliesCaught < NUM_FIREFLIES) {
        const gapS = s.lastCatchTime >= 0 ? (now - s.lastCatchTime) / 1000 : Infinity
        s.catchStreak = gapS <= STREAK_GAP_S ? s.catchStreak + 1 : 1
        s.lastCatchTime = now
        const bonus = Math.min(computeStreakBonus(s.catchStreak), NUM_FIREFLIES - 1 - s.firefliesCaught)
        const gained = 1 + Math.max(0, bonus)

        for (let i = 0; i < gained && s.firefliesCaught < NUM_FIREFLIES; i++) {
          s.firefliesCaught++
          spawnJarFirefly()
        }
        s.caughtPulse = 1
        s.quietStreak = 0
        playCatch()
      } else if (isValidAttempt) {
        // A real attempt that didn't clear the catch threshold breaks the streak,
        // same as it would if this were a sustain mechanic losing voicing quality.
        s.catchStreak = 0
      }
      // One backend event per detected burst, scored on real audio quality.
      logBurstAttempt(score, isValidAttempt)
      s.inBurst = false
      s.burstEnvelope = []
    }

    s.caughtPulse = Math.max(0, s.caughtPulse - dt * 2)

    s.quietStreak += dt
    setEncourageVisible(s.quietStreak > 4)

    render()

    if (s.firefliesCaught >= NUM_FIREFLIES && !s.hasFinished) {
      s.hasFinished = true
      onJarFull()
    }
    if (!s.hasFinished) rafRef.current = requestAnimationFrame(gameLoop)
  }

  function render() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const s = stateRef.current
    const grad = ctx.createLinearGradient(0, 0, 0, s.H)
    grad.addColorStop(0, '#1B2A4A'); grad.addColorStop(0.6, '#263A63'); grad.addColorStop(1, '#101A30')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, s.W, s.H)
    drawMoon(ctx)
    drawTreeSilhouette(ctx)
    drawFreeFireflies(ctx)
    drawParticles(ctx)
    drawJar(ctx)
  }

  function drawMoon(ctx) {
    const s = stateRef.current
    ctx.save()
    ctx.globalAlpha = 0.85
    ctx.fillStyle = '#FFF3D6'
    ctx.beginPath(); ctx.arc(s.W * 0.82, s.H * 0.14, 32, 0, Math.PI * 2); ctx.fill()
    ctx.globalCompositeOperation = 'destination-out'
    ctx.beginPath(); ctx.arc(s.W * 0.82 - 12, s.H * 0.14 - 5, 28, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  }

  function drawTreeSilhouette(ctx) {
    const s = stateRef.current
    if (!reduceMotionRef.current) s.treeTime += 0.005
    ctx.save()
    ctx.fillStyle = 'rgba(8, 14, 28, 0.85)'
    const baseY = s.H * 0.88
    for (let i = 0; i < 6; i++) {
      const x = (i / 5) * s.W
      const sway = Math.sin(s.treeTime + i) * 4
      const h = 60 + (i % 3) * 25
      ctx.beginPath()
      ctx.moveTo(x - 4, baseY)
      ctx.lineTo(x + sway - 2, baseY - h)
      ctx.quadraticCurveTo(x + sway, baseY - h - 20, x + sway + 22, baseY - h + 6)
      ctx.quadraticCurveTo(x + sway + 4, baseY - h + 14, x + 4, baseY)
      ctx.closePath()
      ctx.fill()
    }
    ctx.fillRect(0, baseY, s.W, s.H - baseY)
    ctx.restore()
  }

  const freeFireflyTimeRef = useRef(0)
  function drawFreeFireflies(ctx) {
    const s = stateRef.current
    if (!reduceMotionRef.current) freeFireflyTimeRef.current += 0.03
    ctx.save()
    for (const f of s.freeFireflies) {
      if (!reduceMotionRef.current) { f.driftPhase += 0.01; f.y -= f.speed * 0.1; if (f.y < s.H * 0.1) f.y = s.H * 0.7 }
      const bx = f.x + Math.sin(f.driftPhase) * 20
      const glow = 0.3 + 0.7 * Math.max(0, Math.sin(freeFireflyTimeRef.current + f.phase))
      const grad = ctx.createRadialGradient(bx, f.y, 0, bx, f.y, 6)
      grad.addColorStop(0, `rgba(255, 233, 160, ${0.8 * glow})`)
      grad.addColorStop(1, 'rgba(255, 233, 160, 0)')
      ctx.fillStyle = grad
      ctx.beginPath(); ctx.arc(bx, f.y, 6, 0, Math.PI * 2); ctx.fill()
    }
    ctx.restore()
  }

  function drawParticles(ctx) {
    const s = stateRef.current
    ctx.save()
    s.particles = s.particles.filter(p => p.life > 0)
    for (const p of s.particles) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.life -= 0.014
      ctx.globalAlpha = Math.max(0, p.life)
      ctx.fillStyle = p.color
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill()
    }
    ctx.restore()
  }

  function drawJar(ctx) {
    const s = stateRef.current
    const jarX = s.W / 2, jarY = s.H * 0.62
    const scale = 1 + s.caughtPulse * 0.08

    ctx.save()
    ctx.globalAlpha = 0.2
    ctx.fillStyle = '#000'
    ctx.beginPath(); ctx.ellipse(jarX, jarY + 92, 60, 12, 0, 0, Math.PI * 2); ctx.fill()
    ctx.restore()

    ctx.save()
    ctx.translate(jarX, jarY)
    ctx.scale(scale, scale)

    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(-45, -60)
    ctx.lineTo(45, -60)
    ctx.lineTo(52, 60)
    ctx.quadraticCurveTo(52, 78, 34, 80)
    ctx.lineTo(-34, 80)
    ctx.quadraticCurveTo(-52, 78, -52, 60)
    ctx.closePath()
    ctx.fill(); ctx.stroke()

    const fillRatio = s.firefliesCaught / NUM_FIREFLIES
    if (fillRatio > 0) {
      ctx.save()
      ctx.clip()
      const glowGrad = ctx.createRadialGradient(0, 20, 5, 0, 20, 70)
      glowGrad.addColorStop(0, `rgba(255, 233, 160, ${0.25 * fillRatio})`)
      glowGrad.addColorStop(1, 'rgba(255, 233, 160, 0)')
      ctx.fillStyle = glowGrad
      ctx.fillRect(-60, -70, 120, 160)
      ctx.restore()
    }

    const jarTime = performance.now() * 0.003
    for (const jf of s.jarFireflies) {
      const jx = jf.x + Math.sin(jarTime + jf.driftX) * 12
      const jy = jf.y + Math.cos(jarTime * 1.3 + jf.driftY) * 10
      const glow = 0.5 + 0.5 * Math.sin(jarTime * 2 + jf.phase)
      const g = ctx.createRadialGradient(jx, jy, 0, jx, jy, 8)
      g.addColorStop(0, `rgba(255, 245, 200, ${0.9 * glow})`)
      g.addColorStop(1, 'rgba(255, 245, 200, 0)')
      ctx.fillStyle = g
      ctx.beginPath(); ctx.arc(jx, jy, 8, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = `rgba(255,255,230,${glow})`
      ctx.beginPath(); ctx.arc(jx, jy, 1.8, 0, Math.PI * 2); ctx.fill()
    }

    ctx.fillStyle = '#B98F4A'
    ctx.fillRect(-30, -74, 60, 16)
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1.5
    ctx.strokeRect(-30, -74, 60, 16)

    ctx.restore()
  }

  function handlePlayAgain() {
    setSuccessVisible(false)
    const s = stateRef.current
    s.firefliesCaught = 0
    s.jarFireflies = []
    s.hasFinished = false
    s.particles = []
    s.catchStreak = 0
    s.lastCatchTime = -1
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

  return (
    <div className="fjar-root">
      <canvas ref={canvasRef} className="fjar-canvas" aria-hidden="true" />

      {screen === 'start' && (
        <div className="fjar-screen">
          <div className="fjar-panel">
            <div className="fjar-mic-icon">🫙</div>
            <h1 className="fjar-title">Firefly Jar</h1>
            <p className="fjar-subtitle">
              Say "ma" to catch a firefly and fill the jar!{' '}
              <button onClick={replayInstruction} aria-label="Hear this again"
                style={{ display: 'inline-flex', verticalAlign: 'middle', opacity: 0.6, background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
                <Volume2 size={16} />
              </button>
            </p>
            <div className="fjar-howto">
              <div className="fjar-howto-title">👄 How to make the sound</div>
              <ol>
                <li>Press your lips together, like you're humming: <strong>"mmm"</strong></li>
                <li>Pop your mouth open with your voice on: <strong>"ma"</strong></li>
                <li>Say it clearly each time you want to catch a firefly!</li>
              </ol>
            </div>
            <button className="fjar-btn" onClick={requestMicAndCalibrate}>Let's Play!</button>
          </div>
        </div>
      )}

      {screen === 'micError' && (
        <div className="fjar-screen">
          <div className="fjar-panel">
            <div className="fjar-mic-icon">🎤</div>
            <h1 className="fjar-title" style={{ fontSize: '1.6rem' }}>We need to hear you!</h1>
            <p className="fjar-error-text">{micErrorMsg}</p>
            <button className="fjar-btn" onClick={requestMicAndCalibrate}>Try Again</button>
          </div>
        </div>
      )}

      {screen === 'calibrate' && (
        <div className="fjar-screen">
          <div className="fjar-panel">
            <div className="fjar-ring-wrap">
              <svg width="150" height="150">
                <circle className="fjar-ring-bg" cx="75" cy="75" r="60" />
                <circle
                  className="fjar-ring-fg" cx="75" cy="75" r="60"
                  strokeDasharray={2 * Math.PI * 60}
                  strokeDashoffset={2 * Math.PI * 60 * (1 - calibProgress)}
                />
              </svg>
              <div className="fjar-ring-label">{calibLabel.emoji}</div>
            </div>
            <h1 className="fjar-title" style={{ fontSize: '1.6rem' }}>{calibLabel.title}</h1>
            <p className="fjar-subtitle">{calibLabel.subtitle}</p>
          </div>
        </div>
      )}

      {hudVisible && (
        <div className="fjar-hud">
          <button className="fjar-icon-btn" onClick={() => navigate('/play/chime')} aria-label="Back to Chime">
            <ArrowLeft size={20} />
          </button>
          <div className={`fjar-encourage ${encourageVisible ? 'visible' : ''}`}>
            🦉 Try saying "ma" clearly to catch a firefly!
          </div>
          <button className="fjar-icon-btn" onClick={() => setSettingsOpen(o => !o)} aria-label="Settings">
            <Settings size={20} />
          </button>
        </div>
      )}

      {settingsOpen && (
        <div className="fjar-settings-panel">
          <h3>Settings</h3>
          <div className="fjar-toggle-row">
            <span>Reduce motion</span>
            <label className="fjar-switch">
              <input type="checkbox" checked={reduceMotion} onChange={e => setReduceMotion(e.target.checked)} />
              <span className="fjar-switch-track" />
            </label>
          </div>
          <div className="fjar-toggle-row">
            <span>Mute sounds</span>
            <label className="fjar-switch">
              <input type="checkbox" checked={muted} onChange={e => setMuted(e.target.checked)} />
              <span className="fjar-switch-track" />
            </label>
          </div>
          <button className="fjar-btn fjar-btn-secondary" onClick={handleRecalibrate}>Recalibrate mic</button>
        </div>
      )}

      {successVisible && (
        <div className="fjar-success-overlay">
          <div className="fjar-panel">
            <div className="fjar-mic-icon">🌟</div>
            <h1 className="fjar-title">Jar is full of light!</h1>
            <p className="fjar-subtitle">You caught every firefly!</p>
            <p style={{ fontSize: '0.95rem', opacity: 0.85, margin: '-14px 0 20px' }}>{agentFeedback}</p>
            {getNextLevelRoute(LEVEL_ID) && (
              <button className="fjar-btn" onClick={() => navigate(getNextLevelRoute(LEVEL_ID))}>Next Level →</button>
            )}
            <button className="fjar-btn" onClick={handlePlayAgain}>Play Again!</button>
          </div>
        </div>
      )}

      <div className="fjar-visually-hidden" aria-live="polite">{ariaMsg}</div>

      <style>{`
        .fjar-root {
          --night-top: #1B2A4A; --night-deep: #101A30; --firefly-glow: #FFE9A0;
          --gold: #FFD166; --cloud-white: #FFF8EC;
          --panel-bg: rgba(27, 42, 74, 0.7); --panel-border: rgba(255, 248, 236, 0.16);
          position: fixed; inset: 0; overflow: hidden; background: var(--night-deep);
          font-family: 'Quicksand', sans-serif; color: var(--cloud-white);
        }
        .fjar-canvas { position: fixed; inset: 0; width: 100%; height: 100%; display: block; }
        .fjar-screen { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 24px; z-index: 10; }
        .fjar-panel { background: var(--panel-bg); border: 1px solid var(--panel-border); border-radius: 28px 28px 40px 28px; padding: 40px 36px; max-width: 460px; width: 100%; backdrop-filter: blur(10px); box-shadow: 0 24px 60px rgba(0,0,0,0.45); }
        .fjar-title { font-family: 'Baloo 2', sans-serif; font-weight: 800; font-size: clamp(2rem, 6vw, 2.8rem); margin: 0 0 8px; color: var(--cloud-white); text-shadow: 0 4px 0 rgba(0,0,0,0.15); }
        .fjar-subtitle { font-size: clamp(1rem, 3vw, 1.2rem); font-weight: 700; margin: 0 0 28px; color: var(--gold); line-height: 1.5; }
        .fjar-btn { font-family: 'Baloo 2', sans-serif; font-weight: 700; font-size: 1.3rem; border: none; border-radius: 999px; padding: 16px 40px; cursor: pointer; color: var(--night-deep); background: var(--gold); box-shadow: 0 6px 0 #C99A2E, 0 10px 24px rgba(0,0,0,0.25); transition: transform 0.18s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.18s ease; }
        .fjar-btn:hover { transform: translateY(-3px) scale(1.02); box-shadow: 0 9px 0 #C99A2E, 0 16px 32px rgba(0,0,0,0.32); }
        .fjar-btn:active { transform: translateY(3px) scale(1); box-shadow: 0 3px 0 #C99A2E, 0 6px 14px rgba(0,0,0,0.25); }
        .fjar-btn-secondary { background: transparent; color: var(--cloud-white); box-shadow: none; border: 2px solid var(--panel-border); font-size: 1rem; padding: 10px 22px; margin-top: 14px; width: 100%; }
        .fjar-mic-icon { font-size: 3.4rem; margin-bottom: 12px; display: inline-block; }
        .fjar-error-text { font-size: 0.95rem; color: #FFD3D3; margin-top: 14px; line-height: 1.5; }
        .fjar-howto { background: rgba(255,255,255,0.1); border: 1px solid var(--panel-border); border-radius: 18px 18px 26px 18px; padding: 16px 18px 16px 34px; margin: 0 0 26px; text-align: left; }
        .fjar-howto-title { font-family: 'Baloo 2', sans-serif; font-weight: 700; font-size: 1rem; margin-bottom: 8px; color: var(--gold); }
        .fjar-howto ol { margin: 0; padding-left: 18px; font-size: 0.9rem; line-height: 1.6; }
        .fjar-howto li { margin-bottom: 4px; }
        .fjar-howto strong { color: var(--gold); }
        .fjar-ring-wrap { position: relative; width: 150px; height: 150px; margin: 0 auto 22px; }
        .fjar-ring-wrap svg { transform: rotate(-90deg); }
        .fjar-ring-bg { fill: none; stroke: rgba(255,255,255,0.12); stroke-width: 10; }
        .fjar-ring-fg { fill: none; stroke: var(--gold); stroke-width: 10; stroke-linecap: round; transition: stroke-dashoffset 0.1s linear; }
        .fjar-ring-label { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 2rem; }
        .fjar-hud { position: fixed; top: 0; left: 0; right: 0; display: flex; justify-content: space-between; align-items: flex-start; padding: 18px 20px; z-index: 20; pointer-events: none; }
        .fjar-hud > * { pointer-events: auto; }
        .fjar-encourage { font-family: 'Baloo 2', sans-serif; font-weight: 700; font-size: clamp(1rem, 3.5vw, 1.4rem); background: var(--panel-bg); border: 1px solid var(--panel-border); border-radius: 999px; padding: 10px 22px; opacity: 0; transition: opacity 0.4s ease; max-width: 60vw; }
        .fjar-encourage.visible { opacity: 1; }
        .fjar-icon-btn { background: var(--panel-bg); border: 1px solid var(--panel-border); border-radius: 999px; width: 46px; height: 46px; display: flex; align-items: center; justify-content: center; box-shadow: 0 8px 20px rgba(0,0,0,0.25); padding: 0; color: var(--cloud-white); backdrop-filter: blur(8px); transition: transform 0.15s ease, box-shadow 0.15s ease; cursor: pointer; }
        .fjar-icon-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 26px rgba(0,0,0,0.3); }
        .fjar-icon-btn:active { transform: translateY(1px); }
        .fjar-settings-panel { position: fixed; top: 74px; right: 18px; background: var(--panel-bg); border: 1px solid var(--panel-border); border-radius: 20px 20px 28px 20px; padding: 18px 20px; z-index: 30; width: 240px; text-align: left; backdrop-filter: blur(10px); box-shadow: 0 16px 40px rgba(0,0,0,0.3); }
        .fjar-settings-panel h3 { font-family: 'Baloo 2', sans-serif; margin: 0 0 12px; font-size: 1.1rem; }
        .fjar-toggle-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; font-weight: 700; font-size: 0.95rem; }
        .fjar-switch { position: relative; width: 46px; height: 26px; flex-shrink: 0; display: inline-block; }
        .fjar-switch input { opacity: 0; width: 0; height: 0; }
        .fjar-switch-track { position: absolute; inset: 0; background: rgba(255,255,255,0.2); border-radius: 999px; transition: background 0.2s ease; cursor: pointer; }
        .fjar-switch-track::before { content: ""; position: absolute; width: 20px; height: 20px; left: 3px; top: 3px; background: var(--cloud-white); border-radius: 50%; transition: transform 0.2s ease; }
        .fjar-switch input:checked + .fjar-switch-track { background: #6BCB77; }
        .fjar-switch input:checked + .fjar-switch-track::before { transform: translateX(20px); }
        .fjar-success-overlay { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 40; background: rgba(16, 26, 48, 0.5); }
        .fjar-visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
      `}</style>
    </div>
  )
}
