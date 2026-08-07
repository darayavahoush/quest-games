import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Settings, Volume2 } from 'lucide-react'
import { logEvent, getAgentDecision } from './lib/api'
import { getNextLevelRoute } from './lib/levelProgress'
import { useSpokenInstruction } from '../lib/speech'

const TARGET_F1_DEFAULT = 300.0
const TARGET_F2_DEFAULT = 870.0
const FORMANT_TOLERANCE_HZ = 450.0
const NOISE_FLOOR_RMS_DEFAULT = 0.01
const BASE_DEPTH_CONFIG = { sinkRate: 0.5, riseRate: 0.2, scoreThreshold: 0.08 }
// Sustained "oooo" should sink faster than the same quality delivered in short
// bursts — rewards breath duration, not just momentary vowel quality. Mirrors
// the RocketLaunch duration-boost mechanic 1:1: dt accumulates while voiced,
// resets to 0 the instant voicing drops, caps at DURATION_BOOST_SECONDS.
const DURATION_BOOST_SECONDS = 2.5
const DURATION_BOOST_MAX = 0.6
const LEVEL_ID = 'oo'
const AGENT_POLICY = 'tabular_q'
const FISH_COLORS = ['#FF8C69', '#FFD166', '#A6E8FF', '#FF6B9D', '#7FE8C0']

function computeRMS(floatSamples) {
  let s = 0
  for (let i = 0; i < floatSamples.length; i++) s += floatSamples[i] * floatSamples[i]
  return Math.sqrt(s / floatSamples.length)
}

function hammingWindow(N) {
  const w = new Float64Array(N)
  for (let i = 0; i < N; i++) w[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (N - 1))
  return w
}
function autocorrelate(x, maxLag) {
  const N = x.length
  const r = new Float64Array(maxLag + 1)
  for (let lag = 0; lag <= maxLag; lag++) {
    let sum = 0
    for (let i = 0; i < N - lag; i++) sum += x[i] * x[i + lag]
    r[lag] = sum
  }
  return r
}
function levinsonDurbin(r, order) {
  let a = new Float64Array(order + 1)
  a[0] = 1
  let e = r[0]
  if (e === 0) return { a, error: 0 }
  for (let i = 1; i <= order; i++) {
    let acc = r[i]
    for (let j = 1; j < i; j++) acc += a[j] * r[i - j]
    const k = -acc / e
    const newA = a.slice()
    newA[i] = k
    for (let j = 1; j < i; j++) newA[j] = a[j] + k * a[i - j]
    a = newA
    e *= (1 - k * k)
    if (e <= 0) break
  }
  return { a, error: e }
}
function lpcMagnitudeSpectrum(a, sampleRate, numPoints, maxFreq) {
  const mags = new Float64Array(numPoints)
  for (let i = 0; i < numPoints; i++) {
    const freq = (i / numPoints) * maxFreq
    const omega = (2 * Math.PI * freq) / sampleRate
    let real = 0, imag = 0
    for (let k = 0; k < a.length; k++) {
      real += a[k] * Math.cos(-omega * k)
      imag += a[k] * Math.sin(-omega * k)
    }
    const denom = Math.sqrt(real * real + imag * imag)
    mags[i] = denom > 1e-9 ? 1 / denom : 0
  }
  return mags
}
function findFormants(samples, sampleRate, order = 12, numPoints = 512, maxFreq = 4000) {
  const N = samples.length
  const win = hammingWindow(N)
  const windowed = new Float64Array(N)
  for (let i = 0; i < N; i++) windowed[i] = samples[i] * win[i]
  const pre = new Float64Array(N)
  pre[0] = windowed[0]
  for (let i = 1; i < N; i++) pre[i] = windowed[i] - 0.97 * windowed[i - 1]
  const r = autocorrelate(pre, order)
  if (r[0] === 0) return { f1: 0, f2: 0 }
  const { a } = levinsonDurbin(r, order)
  const mags = lpcMagnitudeSpectrum(a, sampleRate, numPoints, maxFreq)
  const peaks = []
  for (let i = 1; i < numPoints - 1; i++) {
    if (mags[i] > mags[i - 1] && mags[i] > mags[i + 1]) {
      peaks.push({ freq: (i / numPoints) * maxFreq, mag: mags[i] })
    }
  }
  peaks.sort((p1, p2) => p1.freq - p2.freq)
  return { f1: peaks.length > 0 ? peaks[0].freq : 0, f2: peaks.length > 1 ? peaks[1].freq : 0 }
}
function computeVowelQualityScore(f1, f2, targetF1, targetF2, tolerance = FORMANT_TOLERANCE_HZ) {
  if (f1 <= 0 && f2 <= 0) return 0
  if (f2 <= 0) {
    const f1Dist = Math.abs(f1 - targetF1)
    return Math.max(0, 1 - f1Dist / tolerance) * 0.6
  }
  const f1Dist = Math.abs(f1 - targetF1), f2Dist = Math.abs(f2 - targetF2)
  return Math.max(0, 1 - (f1Dist + f2Dist) / (2 * tolerance))
}
function computeLoudnessComponent(rms, noiseFloor, maxExpectedRms) {
  if (rms <= noiseFloor * 1.3) return 0
  return Math.max(0, Math.min(1, (rms - noiseFloor) / (maxExpectedRms - noiseFloor)))
}
function computeDiveScore(rms, f1, f2, noiseFloor, maxExpectedRms, targetF1, targetF2, tolerance) {
  const loudness = computeLoudnessComponent(rms, noiseFloor, maxExpectedRms)
  if (loudness <= 0) return 0
  const formant = computeVowelQualityScore(f1, f2, targetF1, targetF2, tolerance)
  return loudness * (0.6 + 0.4 * formant)
}
function personalizeFormantTarget(formantReadings, fallbackF1 = TARGET_F1_DEFAULT, fallbackF2 = TARGET_F2_DEFAULT) {
  const valid = formantReadings.filter(r => r.f1 > 0 && r.f2 > 0)
  if (valid.length < 3) return { targetF1: fallbackF1, targetF2: fallbackF2, usedFallback: true }
  const targetF1 = valid.reduce((s, r) => s + r.f1, 0) / valid.length
  const targetF2 = valid.reduce((s, r) => s + r.f2, 0) / valid.length
  return { targetF1, targetF2, usedFallback: false }
}
function updateDepth(currentDepth, qualityScore, dt, config, sustainedSeconds = 0) {
  const { sinkRate, riseRate, scoreThreshold } = config
  if (qualityScore >= scoreThreshold) {
    const intensity = (qualityScore - scoreThreshold) / (1 - scoreThreshold)
    const durationMultiplier = 1 + DURATION_BOOST_MAX * Math.min(1, sustainedSeconds / DURATION_BOOST_SECONDS)
    return Math.max(0, Math.min(1, currentDepth + sinkRate * (0.4 + 0.6 * intensity) * durationMultiplier * dt))
  }
  return Math.max(0, Math.min(1, currentDepth - riseRate * dt))
}

const DIFFICULTY_AGENT = {
  SAFE_RANGE: [0.08, 0.55],
  STEP: 0.05,
  FAST_S: 5,
  SLOW_S: 14,
  decide(timeToDiveSeconds) {
    if (timeToDiveSeconds < this.FAST_S) return { action: 'raise', message: "That was smooth! Let's make the next dive a bit trickier 🌊" }
    if (timeToDiveSeconds > this.SLOW_S) return { action: 'lower', message: "Great effort! Let's make the next dive a little easier 🐚" }
    return { action: 'hold', message: "Nice steady diving! Let's keep this level for now 💙" }
  },
  apply(config, decision) {
    const next = { ...config }
    if (decision.action === 'raise') next.scoreThreshold += this.STEP
    if (decision.action === 'lower') next.scoreThreshold -= this.STEP
    next.scoreThreshold = Math.max(this.SAFE_RANGE[0], Math.min(this.SAFE_RANGE[1], next.scoreThreshold))
    return next
  },
}

export default function SubmarineDive() {
  const navigate = useNavigate()
  const canvasRef = useRef(null)
  const rafRef = useRef(null)

  const [screen, setScreen] = useState('start')
  const [micErrorMsg, setMicErrorMsg] = useState('')
  const [calibLabel, setCalibLabel] = useState({ title: "Let's find quiet...", subtitle: 'Stay nice and quiet for a moment', emoji: '🤫' })
  const [calibProgress, setCalibProgress] = useState(0)
  const [hudVisible, setHudVisible] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [reduceMotion, setReduceMotion] = useState(() => localStorage.getItem('sub_reduce_motion') === 'true')
  const [muted, setMuted] = useState(() => localStorage.getItem('sub_muted') === 'true')
  const [encourageVisible, setEncourageVisible] = useState(false)
  const [successVisible, setSuccessVisible] = useState(false)
  const [agentFeedback, setAgentFeedback] = useState('')
  const [ariaMsg, setAriaMsg] = useState('')

  const stateRef = useRef({
    audioCtx: null, analyser: null, timeDomainData: null, mediaStream: null,
    noiseFloor: NOISE_FLOOR_RMS_DEFAULT, maxExpectedRms: 0.3,
    depth: 0, smoothedQuality: 0,
    lastFrameTime: 0, frameCount: 0,
    hasFinished: false, quietStreak: 0,
    bubbles: [], particles: [],
    difficultyConfig: { ...BASE_DEPTH_CONFIG },
    attemptStartTime: 0,
    targetF1: TARGET_F1_DEFAULT, targetF2: TARGET_F2_DEFAULT,
    fish: [], seaweed: [], corals: [],
    buddyAppear: 0,
    attemptNumber: 0,
    inVoicing: false, voicingScores: [], sustainedSeconds: 0,
    W: 0, H: 0, DPR: 1,
  })

  const reduceMotionRef = useRef(reduceMotion)
  const mutedRef = useRef(muted)
  useEffect(() => { reduceMotionRef.current = reduceMotion; localStorage.setItem('sub_reduce_motion', reduceMotion) }, [reduceMotion])
  useEffect(() => { mutedRef.current = muted; localStorage.setItem('sub_muted', muted) }, [muted])

  const replayInstruction = useSpokenInstruction(
    'Say a long, round OOOO to dive your submarine deep!',
    { enabled: screen === 'start' && !muted },
  )

  useEffect(() => {
    const state = stateRef.current
    return () => {
      cancelAnimationFrame(rafRef.current)
      if (state.audioCtx) state.audioCtx.close().catch(() => {})
      // See RocketLaunch.jsx's cleanup for why this is separate from
      // audioCtx.close() — the mic stream isn't released by that call.
      if (state.mediaStream) state.mediaStream.getTracks().forEach(t => t.stop())
    }
  }, [])

  function initBubbles() {
    const s = stateRef.current
    const count = Math.floor((s.W * s.H) / 22000)
    s.bubbles = Array.from({ length: count }, () => ({
      x: Math.random() * s.W, y: Math.random() * s.H, r: Math.random() * 3 + 1.5,
      speed: Math.random() * 0.4 + 0.2, drift: Math.random() * 0.6 - 0.3,
    }))
  }

  function initOceanLife() {
    const s = stateRef.current
    const fishCount = Math.floor((s.W * s.H) / 45000) + 4
    s.fish = Array.from({ length: fishCount }, () => ({
      x: Math.random() * s.W, y: s.H * 0.2 + Math.random() * s.H * 0.7,
      size: Math.random() * 10 + 8,
      speed: (Math.random() * 0.5 + 0.3) * (Math.random() < 0.5 ? 1 : -1),
      bobPhase: Math.random() * Math.PI * 2,
      color: FISH_COLORS[Math.floor(Math.random() * FISH_COLORS.length)],
    }))
    const seaweedCount = Math.floor(s.W / 90) + 3
    s.seaweed = Array.from({ length: seaweedCount }, (_, i) => ({
      x: (i + 0.5) * (s.W / seaweedCount) + (Math.random() - 0.5) * 30,
      height: Math.random() * 50 + 40,
      swayPhase: Math.random() * Math.PI * 2,
      swaySpeed: Math.random() * 0.4 + 0.3,
      hueShift: Math.random() * 20,
    }))
    const coralCount = Math.floor(s.W / 220) + 2
    s.corals = Array.from({ length: coralCount }, () => ({
      x: Math.random() * s.W,
      scale: Math.random() * 0.5 + 0.7,
      hue: Math.random() < 0.5 ? '#FF6B6B' : '#FFD166',
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
    initBubbles()
    initOceanLife()
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

  function playTone(freq, duration, type = 'sine', gainPeak = 0.05) {
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
    [392, 493.88, 587.33, 783.99].forEach((f, i) => setTimeout(() => playTone(f, 0.5, 'sine', 0.045), i * 120))
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
        ? 'Please allow microphone access so your submarine can hear your voice.'
        : 'Something went wrong reaching the microphone. Please try again.')
      setScreen('micError')
    }
  }

  function runCalibration() {
    setScreen('calibrate')
    const QUIET_MS = 1200
    const LOUD_MS = 1800
    let quietSamples = []
    let formantReadings = []

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
      setCalibLabel({ title: 'Now say "oooo"!', subtitle: 'Like the middle of the word "boo" — nice and round', emoji: '🗣️' })
      setCalibProgress(0)
      const s = stateRef.current
      const loudStart = performance.now()
      let loudRmsSamples = []
      function loudStep(now) {
        const elapsed = now - loudStart
        const rms = readCurrentRMS()
        loudRmsSamples.push(rms)
        if (rms > s.noiseFloor * 1.5) {
          s.analyser.getFloatTimeDomainData(s.timeDomainData)
          formantReadings.push(findFormants(s.timeDomainData, s.audioCtx.sampleRate))
        }
        setCalibProgress(Math.min(1, elapsed / LOUD_MS))
        if (elapsed < LOUD_MS) {
          requestAnimationFrame(loudStep)
        } else {
          const { targetF1, targetF2 } = personalizeFormantTarget(formantReadings)
          s.targetF1 = targetF1
          s.targetF2 = targetF2
          const sortedLoud = [...loudRmsSamples].sort((a, b) => a - b)
          const loudSustained = sortedLoud[Math.floor(sortedLoud.length * 0.55)] || 0.2
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
    s.depth = 0
    s.hasFinished = false
    s.particles = []
    s.buddyAppear = 0
    s.quietStreak = 0
    s.sustainedSeconds = 0
    s.lastFrameTime = performance.now()
    s.attemptStartTime = performance.now()
    setAriaMsg('Ready! Say a long "oooo" to dive.')
    rafRef.current = requestAnimationFrame(gameLoop)
  }

  // "oo" is sustained, not discrete bursts, so there's no natural single instant to
  // score. Instead we treat each continuous stretch of voicing (rms above the noise
  // gate) as one attempt, and log it once it ends, scored on the real average audio
  // quality (loudness + formant match) measured during that stretch — never on how
  // long the whole dive took.
  const MIN_VOICING_FRAMES = 3 // ~50ms at 60fps; filters out single-frame noise blips

  async function logVoicingAttempt(scores) {
    const s = stateRef.current
    const isValidAttempt = scores.length >= MIN_VOICING_FRAMES
    if (!isValidAttempt) return
    const attemptScore = Math.max(...scores) // peak of the stretch, not the average — matches burst-game scoring
    s.attemptNumber++
    try {
      await logEvent({ level_id: LEVEL_ID, attempt_number: s.attemptNumber, score: attemptScore, is_valid_attempt: isValidAttempt })
    } catch (err) {
      console.warn('Backend event logging unavailable:', err)
    }
  }

  // Dive-completion pacing only: asks the difficulty agent whether to make the next
  // dive's sink/rise config easier or harder. timeToDiveSeconds is a local signal
  // only — never sent to the backend as "score".
  async function updateDifficultyFromAttempt(timeToDiveSeconds) {
    const s = stateRef.current

    let decision = null
    try {
      decision = await getAgentDecision(LEVEL_ID, AGENT_POLICY)
    } catch (err) {
      console.warn('Trained-agent endpoint unavailable, falling back to local rule-based agent:', err)
    }
    if (!decision) decision = DIFFICULTY_AGENT.decide(timeToDiveSeconds)

    s.difficultyConfig = DIFFICULTY_AGENT.apply(s.difficultyConfig, decision)
    setAgentFeedback(decision.message)
  }

  // Marks the level as passed independent of any single attempt's score — depth
  // fills up continuously from any nonzero-quality attempt with no hard gate, so
  // no individual logged attempt may ever clear PASS_THRESHOLD even when the sub
  // genuinely reaches the ocean floor. levelProgress.js treats this as a pass.
  async function logLevelComplete() {
    const s = stateRef.current
    try {
      await logEvent({ level_id: LEVEL_ID, attempt_number: s.attemptNumber, score: 1, is_valid_attempt: true, action: 'level_complete' })
    } catch (err) {
      console.warn('Backend event logging unavailable:', err)
    }
  }

  function onDiveSuccess() {
    const s = stateRef.current
    logLevelComplete()
    if (s.inVoicing) {
      logVoicingAttempt(s.voicingScores)
      s.inVoicing = false
      s.voicingScores = []
    }
    playSuccessChime()
    setAriaMsg('You reached the ocean floor!')
    spawnCelebrationParticles()
    const timeToDiveSeconds = (performance.now() - s.attemptStartTime) / 1000
    updateDifficultyFromAttempt(timeToDiveSeconds)
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
    for (let i = 0; i < count; i++) {
      s.particles.push({
        x: s.W / 2, y: s.H * 0.85,
        vx: (Math.random() - 0.5) * 5, vy: -Math.random() * 3 - 1,
        life: 1, color: ['#4ECDC4', '#FFD166', '#FF6B6B', '#FFF8EC'][i % 4],
        r: Math.random() * 3 + 2,
      })
    }
  }

  function gameLoop(now) {
    const s = stateRef.current
    const dt = Math.min(0.1, (now - s.lastFrameTime) / 1000)
    s.lastFrameTime = now
    s.frameCount++

    const rms = readCurrentRMS()
    let f1 = 0, f2 = 0
    const isVoiced = rms > s.noiseFloor * 1.5
    if (isVoiced) {
      s.analyser.getFloatTimeDomainData(s.timeDomainData)
      const formants = findFormants(s.timeDomainData, s.audioCtx.sampleRate)
      f1 = formants.f1; f2 = formants.f2
    }
    const qualityScore = computeDiveScore(rms, f1, f2, s.noiseFloor, s.maxExpectedRms, s.targetF1, s.targetF2, FORMANT_TOLERANCE_HZ)
    s.smoothedQuality = s.smoothedQuality * 0.7 + qualityScore * 0.3

    // Duration tracking mirrors RocketLaunch: accumulates on raw voicing (not
    // the smoothed/gated score), resets the instant voicing stops, so bursty
    // loud-quiet-loud "oooo"s don't accumulate the bonus.
    if (isVoiced) {
      s.sustainedSeconds += dt
    } else {
      s.sustainedSeconds = 0
    }

    s.depth = updateDepth(s.depth, s.smoothedQuality, dt, s.difficultyConfig, s.sustainedSeconds)

    if (isVoiced) {
      if (!s.inVoicing) s.inVoicing = true
      s.voicingScores.push(qualityScore)
    } else if (s.inVoicing) {
      logVoicingAttempt(s.voicingScores)
      s.inVoicing = false
      s.voicingScores = []
    }

    if (qualityScore < 0.15) s.quietStreak += dt; else s.quietStreak = 0
    const showEncouragement = s.quietStreak > 3 && s.depth < 0.15
    setEncourageVisible(showEncouragement)
    s.buddyAppear = showEncouragement
      ? Math.min(1, s.buddyAppear + dt * 1.5)
      : Math.max(0, s.buddyAppear - dt * 1.5)

    render()

    if (s.depth >= 0.999 && !s.hasFinished) {
      s.hasFinished = true
      onDiveSuccess()
    }
    if (!s.hasFinished) rafRef.current = requestAnimationFrame(gameLoop)
  }

  function render() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const s = stateRef.current
    const grad = ctx.createLinearGradient(0, 0, 0, s.H)
    grad.addColorStop(0, '#1E5F8C'); grad.addColorStop(0.5, '#0A2A45'); grad.addColorStop(1, '#061A2E')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, s.W, s.H)
    drawLightRays(ctx)
    drawBubbles(ctx)
    drawFish(ctx)
    drawParticles(ctx)
    drawOceanFloor(ctx)
    drawSeaweed(ctx)
    drawCorals(ctx)
    drawSubmarine(ctx)
    drawBuddyTurtle(ctx)
  }

  const rayTimeRef = useRef(0)
  function drawLightRays(ctx) {
    const s = stateRef.current
    if (!reduceMotionRef.current) rayTimeRef.current += 0.005
    ctx.save()
    ctx.globalAlpha = 0.06
    ctx.fillStyle = '#EAF9FF'
    for (let i = 0; i < 5; i++) {
      const baseX = (i / 5) * s.W + Math.sin(rayTimeRef.current + i) * 30
      ctx.beginPath()
      ctx.moveTo(baseX - 40, 0)
      ctx.lineTo(baseX + 40, 0)
      ctx.lineTo(baseX + 90, s.H * 0.75)
      ctx.lineTo(baseX - 90, s.H * 0.75)
      ctx.closePath()
      ctx.fill()
    }
    ctx.restore()
  }

  const fishTimeRef = useRef(0)
  function drawFish(ctx) {
    const s = stateRef.current
    if (!reduceMotionRef.current) fishTimeRef.current += 0.02
    ctx.save()
    for (const f of s.fish) {
      if (!reduceMotionRef.current) {
        f.x += f.speed
        if (f.x < -20) f.x = s.W + 20
        if (f.x > s.W + 20) f.x = -20
      }
      const bob = Math.sin(fishTimeRef.current + f.bobPhase) * 4
      const facingRight = f.speed > 0
      ctx.save()
      ctx.translate(f.x, f.y + bob)
      ctx.scale(facingRight ? 1 : -1, 1)
      ctx.globalAlpha = 0.85
      ctx.fillStyle = f.color
      ctx.beginPath()
      ctx.moveTo(-f.size * 0.9, 0)
      ctx.lineTo(-f.size * 1.6, -f.size * 0.5)
      ctx.lineTo(-f.size * 1.6, f.size * 0.5)
      ctx.closePath()
      ctx.fill()
      ctx.beginPath()
      ctx.ellipse(0, 0, f.size, f.size * 0.6, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#1E1B14'
      ctx.beginPath(); ctx.arc(f.size * 0.4, -f.size * 0.1, f.size * 0.1, 0, Math.PI * 2); ctx.fill()
      ctx.restore()
    }
    ctx.restore()
  }

  function drawSeaweed(ctx) {
    const s = stateRef.current
    ctx.save()
    for (const sw of s.seaweed) {
      if (!reduceMotionRef.current) sw.swayPhase += 0.02 * sw.swaySpeed
      const baseY = s.H - 34
      ctx.strokeStyle = `hsl(${150 + sw.hueShift}, 45%, 32%)`
      ctx.lineWidth = 6
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(sw.x, baseY)
      const segments = 4
      for (let seg = 1; seg <= segments; seg++) {
        const t = seg / segments
        const sway = Math.sin(sw.swayPhase + t * 2) * 14 * t
        ctx.lineTo(sw.x + sway, baseY - sw.height * t)
      }
      ctx.stroke()
    }
    ctx.restore()
  }

  function drawCorals(ctx) {
    const s = stateRef.current
    ctx.save()
    for (const c of s.corals) {
      const baseY = s.H - 30
      ctx.save()
      ctx.translate(c.x, baseY)
      ctx.scale(c.scale, c.scale)
      ctx.fillStyle = c.hue
      ctx.globalAlpha = 0.85
      for (const [dx, h, w] of [[-14, 26, 10], [0, 34, 12], [14, 22, 9]]) {
        ctx.beginPath()
        ctx.ellipse(dx, -h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }
    ctx.restore()
  }

  function drawBubbles(ctx) {
    const s = stateRef.current
    ctx.save()
    for (const b of s.bubbles) {
      if (!reduceMotionRef.current) { b.y -= b.speed; b.x += Math.sin(b.y * 0.02) * b.drift * 0.1 }
      if (b.y < -10) b.y = s.H + 10
      ctx.globalAlpha = 0.35
      ctx.strokeStyle = '#B8F2FF'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke()
    }
    ctx.restore()
  }

  function drawParticles(ctx) {
    const s = stateRef.current
    ctx.save()
    s.particles = s.particles.filter(p => p.life > 0)
    for (const p of s.particles) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.03; p.life -= 0.014
      ctx.globalAlpha = Math.max(0, p.life)
      ctx.fillStyle = p.color
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill()
    }
    ctx.restore()
  }

  function drawBuddyTurtle(ctx) {
    const s = stateRef.current
    if (s.buddyAppear <= 0.01) return
    const targetX = s.W * 0.22, targetY = s.H * 0.22
    const startX = -60
    const t = s.buddyAppear
    const x = startX + (targetX - startX) * t
    const y = targetY + Math.sin(performance.now() * 0.003) * 6
    ctx.save()
    ctx.globalAlpha = t
    ctx.translate(x, y)
    const flipperPhase = Math.sin(performance.now() * 0.006)

    ctx.fillStyle = '#3F8F63'
    ctx.beginPath(); ctx.ellipse(-14, 8 + flipperPhase * 3, 9, 5, 0.4, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.ellipse(14, 8 - flipperPhase * 3, 9, 5, -0.4, 0, Math.PI * 2); ctx.fill()

    const shellGrad = ctx.createRadialGradient(-6, -6, 3, 0, 0, 22)
    shellGrad.addColorStop(0, '#7FE8C0'); shellGrad.addColorStop(1, '#2E7D5B')
    ctx.fillStyle = shellGrad
    ctx.beginPath(); ctx.ellipse(0, 0, 20, 16, 0, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.ellipse(0, 0, 12, 9, 0, 0, Math.PI * 2); ctx.stroke()

    ctx.fillStyle = '#8FE0B8'
    ctx.beginPath(); ctx.ellipse(22, -2, 8, 6, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#1E1B14'
    ctx.beginPath(); ctx.arc(25, -4, 1.6, 0, Math.PI * 2); ctx.fill()

    ctx.restore()
  }

  function drawOceanFloor(ctx) {
    const s = stateRef.current
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    ctx.beginPath()
    ctx.moveTo(0, s.H); ctx.lineTo(0, s.H - 30)
    for (let x = 0; x <= s.W; x += 40) ctx.lineTo(x, s.H - 30 - Math.sin(x * 0.02) * 10)
    ctx.lineTo(s.W, s.H); ctx.closePath(); ctx.fill()
  }

  function drawSubmarine(ctx) {
    const s = stateRef.current
    const surfaceY = s.H * 0.14, floorY = s.H - 60
    const subY = surfaceY + (floorY - surfaceY) * s.depth
    const subX = s.W / 2

    const bubbleIntensity = s.smoothedQuality
    if (bubbleIntensity > 0.05 && Math.random() < bubbleIntensity * 0.4) {
      s.particles.push({ x: subX - 26, y: subY, vx: -0.5 - Math.random(), vy: -1 - Math.random(), life: 0.7, color: '#B8F2FF', r: Math.random() * 2 + 1 })
    }

    ctx.save()
    ctx.translate(subX, subY)

    ctx.globalAlpha = 0.15 * s.depth
    ctx.fillStyle = '#000'
    ctx.beginPath(); ctx.ellipse(0, floorY - subY + 10, 30, 6, 0, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 1

    const hullGrad = ctx.createLinearGradient(0, -14, 0, 14)
    hullGrad.addColorStop(0, '#6EE7DE'); hullGrad.addColorStop(0.5, '#4ECDC4'); hullGrad.addColorStop(1, '#2FA89F')
    ctx.fillStyle = hullGrad
    ctx.beginPath()
    ctx.moveTo(-34, 0)
    ctx.quadraticCurveTo(-34, -14, -14, -14)
    ctx.lineTo(20, -14)
    ctx.quadraticCurveTo(36, -14, 36, 0)
    ctx.quadraticCurveTo(36, 14, 20, 14)
    ctx.lineTo(-14, 14)
    ctx.quadraticCurveTo(-34, 14, -34, 0)
    ctx.closePath()
    ctx.fill()

    for (const px of [-10, 8, 22]) {
      ctx.fillStyle = '#1B3A52'
      ctx.beginPath(); ctx.arc(px, 0, 5.5, 0, Math.PI * 2); ctx.fill()
      const glassGrad = ctx.createRadialGradient(px - 1, -1, 0.5, px, 0, 4)
      glassGrad.addColorStop(0, '#EAF9FF'); glassGrad.addColorStop(1, '#6C5CE7')
      ctx.fillStyle = glassGrad
      ctx.beginPath(); ctx.arc(px, 0, 4, 0, Math.PI * 2); ctx.fill()
    }

    ctx.fillStyle = '#2FA89F'
    ctx.beginPath()
    ctx.moveTo(-6, -14); ctx.lineTo(10, -14); ctx.lineTo(8, -26); ctx.lineTo(-4, -26); ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#FFD166'
    ctx.fillRect(-3, -25, 8, 3)

    const propSpin = performance.now() * 0.01 * (0.3 + s.smoothedQuality)
    ctx.save()
    ctx.translate(-34, 0)
    ctx.rotate(propSpin)
    ctx.strokeStyle = '#1B3A52'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.moveTo(0, -6); ctx.lineTo(0, 6); ctx.stroke()
    ctx.restore()

    ctx.restore()
  }

  function handlePlayAgain() {
    setSuccessVisible(false)
    const s = stateRef.current
    s.depth = 0
    s.hasFinished = false
    s.particles = []
    s.buddyAppear = 0
    s.quietStreak = 0
    s.sustainedSeconds = 0
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
    <div className="sdv-root">
      <canvas ref={canvasRef} className="sdv-canvas" aria-hidden="true" />

      {screen === 'start' && (
        <div className="sdv-screen">
          <div className="sdv-panel">
            <div className="sdv-mic-icon">🤿</div>
            <h1 className="sdv-title">Submarine Dive</h1>
            <p className="sdv-subtitle">
              Say a long, round "OOOO" to dive your submarine deep!{' '}
              <button onClick={replayInstruction} aria-label="Hear this again"
                style={{ display: 'inline-flex', verticalAlign: 'middle', opacity: 0.6, background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
                <Volume2 size={16} />
              </button>
            </p>
            <button className="sdv-btn" onClick={requestMicAndCalibrate}>Let's Play!</button>
          </div>
        </div>
      )}

      {screen === 'micError' && (
        <div className="sdv-screen">
          <div className="sdv-panel">
            <div className="sdv-mic-icon">🎤</div>
            <h1 className="sdv-title" style={{ fontSize: '1.6rem' }}>We need to hear you!</h1>
            <p className="sdv-error-text">{micErrorMsg}</p>
            <button className="sdv-btn" onClick={requestMicAndCalibrate}>Try Again</button>
          </div>
        </div>
      )}

      {screen === 'calibrate' && (
        <div className="sdv-screen">
          <div className="sdv-panel">
            <div className="sdv-ring-wrap">
              <svg width="150" height="150">
                <circle className="sdv-ring-bg" cx="75" cy="75" r="60" />
                <circle
                  className="sdv-ring-fg" cx="75" cy="75" r="60"
                  strokeDasharray={2 * Math.PI * 60}
                  strokeDashoffset={2 * Math.PI * 60 * (1 - calibProgress)}
                />
              </svg>
              <div className="sdv-ring-label">{calibLabel.emoji}</div>
            </div>
            <h1 className="sdv-title" style={{ fontSize: '1.6rem' }}>{calibLabel.title}</h1>
            <p className="sdv-subtitle">{calibLabel.subtitle}</p>
          </div>
        </div>
      )}

      {hudVisible && (
        <div className="sdv-hud">
          <button className="sdv-icon-btn" onClick={() => navigate('/play/chime')} aria-label="Back to Chime">
            <ArrowLeft size={20} />
          </button>
          <div className={`sdv-encourage ${encourageVisible ? 'visible' : ''}`}>
            🐢 Try a long, round "oooo" like you're saying "boo"!
          </div>
          <button className="sdv-icon-btn" onClick={() => setSettingsOpen(o => !o)} aria-label="Settings">
            <Settings size={20} />
          </button>
        </div>
      )}

      {settingsOpen && (
        <div className="sdv-settings-panel">
          <h3>Settings</h3>
          <div className="sdv-toggle-row">
            <span>Reduce motion</span>
            <label className="sdv-switch">
              <input type="checkbox" checked={reduceMotion} onChange={e => setReduceMotion(e.target.checked)} />
              <span className="sdv-switch-track" />
            </label>
          </div>
          <div className="sdv-toggle-row">
            <span>Mute sounds</span>
            <label className="sdv-switch">
              <input type="checkbox" checked={muted} onChange={e => setMuted(e.target.checked)} />
              <span className="sdv-switch-track" />
            </label>
          </div>
          <button className="sdv-btn sdv-btn-secondary" onClick={handleRecalibrate}>Recalibrate mic</button>
        </div>
      )}

      {successVisible && (
        <div className="sdv-success-overlay">
          <div className="sdv-panel">
            <div className="sdv-mic-icon">🐚</div>
            <h1 className="sdv-title">You reached the deep!</h1>
            <p className="sdv-subtitle">Your submarine found the ocean floor!</p>
            <p style={{ fontSize: '0.95rem', opacity: 0.85, margin: '-14px 0 20px' }}>{agentFeedback}</p>
            {getNextLevelRoute(LEVEL_ID) && (
              <button className="sdv-btn" onClick={() => navigate(getNextLevelRoute(LEVEL_ID))}>Next Level →</button>
            )}
            <button className="sdv-btn sdv-btn-secondary" onClick={handlePlayAgain}>Dive Again!</button>
          </div>
        </div>
      )}

      <div className="sdv-visually-hidden" aria-live="polite">{ariaMsg}</div>

      <style>{`
        .sdv-root {
          --sea-abyss: #061A2E; --sub-teal: #4ECDC4; --sub-teal-dark: #2FA89F;
          --gold: #FFD166; --cloud-white: #FFF8EC;
          --panel-bg: rgba(10, 42, 69, 0.65); --panel-border: rgba(255, 248, 236, 0.14);
          position: fixed; inset: 0; overflow: hidden; background: var(--sea-abyss);
          font-family: 'Quicksand', sans-serif; color: var(--cloud-white);
        }
        .sdv-canvas { position: fixed; inset: 0; width: 100%; height: 100%; display: block; }
        .sdv-screen { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 24px; z-index: 10; }
        .sdv-panel { background: var(--panel-bg); border: 1px solid var(--panel-border); border-radius: 28px 28px 40px 28px; padding: 40px 36px; max-width: 460px; width: 100%; backdrop-filter: blur(10px); box-shadow: 0 24px 60px rgba(0,0,0,0.45); }
        .sdv-title { font-family: 'Baloo 2', sans-serif; font-weight: 800; font-size: clamp(2rem, 6vw, 2.8rem); margin: 0 0 8px; color: var(--cloud-white); text-shadow: 0 4px 0 rgba(0,0,0,0.15); }
        .sdv-subtitle { font-size: clamp(1rem, 3vw, 1.2rem); font-weight: 700; margin: 0 0 28px; color: var(--sub-teal); line-height: 1.5; }
        .sdv-btn { font-family: 'Baloo 2', sans-serif; font-weight: 700; font-size: 1.3rem; border: none; border-radius: 999px; padding: 16px 40px; cursor: pointer; color: var(--sea-abyss); background: var(--sub-teal); box-shadow: 0 6px 0 var(--sub-teal-dark), 0 10px 24px rgba(0,0,0,0.25); transition: transform 0.18s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.18s ease; }
        .sdv-btn:hover { transform: translateY(-3px) scale(1.02); box-shadow: 0 9px 0 var(--sub-teal-dark), 0 16px 32px rgba(0,0,0,0.32); }
        .sdv-btn:active { transform: translateY(3px) scale(1); box-shadow: 0 3px 0 var(--sub-teal-dark), 0 6px 14px rgba(0,0,0,0.25); }
        .sdv-btn-secondary { background: transparent; color: var(--cloud-white); box-shadow: none; border: 2px solid var(--panel-border); font-size: 1rem; padding: 10px 22px; margin-top: 14px; width: 100%; }
        .sdv-mic-icon { font-size: 3.4rem; margin-bottom: 12px; display: inline-block; }
        .sdv-error-text { font-size: 0.95rem; color: #FFD3D3; margin-top: 14px; line-height: 1.5; }
        .sdv-ring-wrap { position: relative; width: 150px; height: 150px; margin: 0 auto 22px; }
        .sdv-ring-wrap svg { transform: rotate(-90deg); }
        .sdv-ring-bg { fill: none; stroke: rgba(255,255,255,0.12); stroke-width: 10; }
        .sdv-ring-fg { fill: none; stroke: var(--sub-teal); stroke-width: 10; stroke-linecap: round; transition: stroke-dashoffset 0.1s linear; }
        .sdv-ring-label { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 2rem; }
        .sdv-hud { position: fixed; top: 0; left: 0; right: 0; display: flex; justify-content: space-between; align-items: flex-start; padding: 18px 20px; z-index: 20; pointer-events: none; }
        .sdv-hud > * { pointer-events: auto; }
        .sdv-encourage { font-family: 'Baloo 2', sans-serif; font-weight: 700; font-size: clamp(1rem, 3.5vw, 1.4rem); background: var(--panel-bg); border: 1px solid var(--panel-border); border-radius: 999px; padding: 10px 22px; opacity: 0; transition: opacity 0.4s ease; max-width: 60vw; }
        .sdv-encourage.visible { opacity: 1; }
        .sdv-icon-btn { background: var(--panel-bg); border: 1px solid var(--panel-border); border-radius: 999px; width: 46px; height: 46px; display: flex; align-items: center; justify-content: center; box-shadow: 0 8px 20px rgba(0,0,0,0.25); padding: 0; color: var(--cloud-white); backdrop-filter: blur(8px); transition: transform 0.15s ease, box-shadow 0.15s ease; cursor: pointer; }
        .sdv-icon-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 26px rgba(0,0,0,0.3); }
        .sdv-icon-btn:active { transform: translateY(1px); }
        .sdv-settings-panel { position: fixed; top: 74px; right: 18px; background: var(--panel-bg); border: 1px solid var(--panel-border); border-radius: 20px 20px 28px 20px; padding: 18px 20px; z-index: 30; width: 240px; text-align: left; backdrop-filter: blur(10px); box-shadow: 0 16px 40px rgba(0,0,0,0.3); }
        .sdv-settings-panel h3 { font-family: 'Baloo 2', sans-serif; margin: 0 0 12px; font-size: 1.1rem; }
        .sdv-toggle-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; font-weight: 700; font-size: 0.95rem; }
        .sdv-switch { position: relative; width: 46px; height: 26px; flex-shrink: 0; display: inline-block; }
        .sdv-switch input { opacity: 0; width: 0; height: 0; }
        .sdv-switch-track { position: absolute; inset: 0; background: rgba(255,255,255,0.2); border-radius: 999px; transition: background 0.2s ease; cursor: pointer; }
        .sdv-switch-track::before { content: ""; position: absolute; width: 20px; height: 20px; left: 3px; top: 3px; background: var(--cloud-white); border-radius: 50%; transition: transform 0.2s ease; }
        .sdv-switch input:checked + .sdv-switch-track { background: var(--sub-teal); }
        .sdv-switch input:checked + .sdv-switch-track::before { transform: translateX(20px); }
        .sdv-success-overlay { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 40; background: rgba(6, 26, 46, 0.4); }
        .sdv-visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
      `}</style>
    </div>
  )
}
