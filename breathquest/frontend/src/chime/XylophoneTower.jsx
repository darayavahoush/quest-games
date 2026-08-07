import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Settings, Volume2 } from 'lucide-react'
import { logEvent, getAgentDecision } from './lib/api'
import { getNextLevelRoute } from './lib/levelProgress'
import { useSpokenInstruction } from '../lib/speech'

const LEVEL_ID = 'ee'
const AGENT_POLICY = 'tabular_q'
const MIN_VOICING_FRAMES = 3 // ~50ms at 60fps; filters out single-frame noise blips

// ============================================================
// Pure scoring/state logic — ported 1:1 from Rocket Launch's loudness +
// duration-boost "climb" mechanic. A long, bright "eeee" maps naturally to
// a steady climb the same way a sustained "aaa" maps to altitude, so the
// engine is reused rather than reinvented.
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

const SCORE_THRESHOLD = 0.22
const RISE_RATE = 0.34          // fraction of tower climbed per second at full voice
const FALL_RATE = 0.14          // fraction lost per second when voicing stops
// Rewards holding the "eeee" rather than short bursts: climb speed ramps up
// the longer the sound is sustained without a break, capping at
// DURATION_BOOST_MAX once DURATION_BOOST_SECONDS is reached.
const DURATION_BOOST_MAX = 0.7
const DURATION_BOOST_SECONDS = 2.2

const N_BARS = 6
// Ascending pentatonic scale (C major pentatonic, one octave+) — bright,
// consonant, sounds "right" in any order, so each bar ringing always sounds
// pleasant rather than needing to land on an exact note.
const BAR_NOTES = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5]
const BAR_COLORS = ['#F87171', '#FB923C', '#FACC15', '#4ADE80', '#60A5FA', '#C084FC']

const DIFFICULTY_AGENT = {
  SAFE_RANGE: [1.5, 5],
  STEP: 0.5,
  FAST_S: 6,
  SLOW_S: 20,
  decide(timeToTopSeconds) {
    if (timeToTopSeconds < this.FAST_S) return { action: 'harder', message: "Amazing climb! Let's make the tower a little taller next time 🔔" }
    if (timeToTopSeconds > this.SLOW_S) return { action: 'easier', message: 'Great sustain! A shorter tower next time so it feels achievable 🌟' }
    return { action: 'hold', message: 'Beautiful and bright! Keeping this the same for now 💛' }
  },
  apply(requiredSeconds, decision) {
    let next = requiredSeconds
    if (decision.action === 'harder') next += this.STEP
    if (decision.action === 'easier') next -= this.STEP
    return Math.max(this.SAFE_RANGE[0], Math.min(this.SAFE_RANGE[1], next))
  },
}

export default function XylophoneTower() {
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
    height: 0, barsRung: 0, sustainedSeconds: 0, hasFinished: false,
    particles: [], notes: [], birds: [], stars: [],
    attemptStartTime: 0, attemptNumber: 0,
    requiredSustainSeconds: 3,
    inVoicing: false, voicingScores: [],
    W: 0, H: 0, DPR: 1,
  })

  const reduceMotionRef = useRef(reduceMotion)
  const mutedRef = useRef(muted)
  useEffect(() => { reduceMotionRef.current = reduceMotion; localStorage.setItem('chime_reduce_motion', reduceMotion) }, [reduceMotion])
  useEffect(() => { mutedRef.current = muted; localStorage.setItem('chime_muted', muted) }, [muted])

  const replayInstruction = useSpokenInstruction(
    'Hold a long, bright eeee to ring the bells and climb all the way to the top!',
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
    s.stars = Array.from({ length: 40 }, () => ({
      x: Math.random() * s.W, y: Math.random() * s.H * 0.55, r: Math.random() * 1.6 + 0.4, phase: Math.random() * Math.PI * 2,
    }))
    s.birds = Array.from({ length: 3 }, (_, i) => ({
      x: s.W * 0.15 + i * 60, y: s.H * 0.16 + (i % 2) * 20, phase: Math.random() * Math.PI * 2,
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

  function playBarNote(barIndex) {
    const s = stateRef.current
    if (mutedRef.current || !s.audioCtx) return
    const a = s.audioCtx
    const osc = a.createOscillator(), gain = a.createGain()
    osc.type = 'triangle'
    osc.frequency.value = BAR_NOTES[barIndex]
    gain.gain.setValueAtTime(0, a.currentTime)
    gain.gain.linearRampToValueAtTime(0.06, a.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.7)
    osc.connect(gain).connect(a.destination)
    osc.start(); osc.stop(a.currentTime + 0.75)
  }

  function playSuccessChime() {
    const s = stateRef.current
    BAR_NOTES.forEach((f, i) => setTimeout(() => {
      if (mutedRef.current || !s.audioCtx) return
      const a = s.audioCtx
      const osc = a.createOscillator(), gain = a.createGain()
      osc.type = 'triangle'; osc.frequency.value = f * 2
      gain.gain.setValueAtTime(0, a.currentTime)
      gain.gain.linearRampToValueAtTime(0.05, a.currentTime + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.45)
      osc.connect(gain).connect(a.destination)
      osc.start(); osc.stop(a.currentTime + 0.5)
    }, i * 90))
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
        ? 'Please allow microphone access so the tower can hear your "eeee".'
        : 'Something went wrong reaching the microphone. Please try again.')
      setScreen('micError')
    }
  }

  function runCalibration() {
    setScreen('calibrate')
    const QUIET_MS = 1200
    const LOUD_MS = 2000
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
      setCalibLabel({ title: 'Now a long, bright "eeee"!', subtitle: 'Hold it steady, like a smile in your voice', emoji: '🔔' })
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
    s.height = 0; s.barsRung = 0; s.hasFinished = false; s.sustainedSeconds = 0
    s.lastFrameTime = performance.now()
    s.attemptStartTime = performance.now()
    setAriaMsg('Ready! Take a breath and let out a long, bright "eeee" to climb the tower.')
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

  async function updateDifficultyFromAttempt(timeToTopSeconds) {
    const s = stateRef.current
    let decision = null
    try {
      decision = await getAgentDecision(LEVEL_ID, AGENT_POLICY)
    } catch (err) {
      console.warn('Trained-agent endpoint unavailable, falling back to local rule-based agent:', err)
    }
    if (!decision) decision = DIFFICULTY_AGENT.decide(timeToTopSeconds)
    s.requiredSustainSeconds = DIFFICULTY_AGENT.apply(s.requiredSustainSeconds, decision)
    setAgentFeedback(decision.message)
  }

  function ringBar(barIndex) {
    const s = stateRef.current
    playBarNote(barIndex)
    const count = reduceMotionRef.current ? 4 : 14
    for (let i = 0; i < count; i++) {
      s.notes.push({
        x: s.W * 0.5 + (Math.random() - 0.5) * 60, y: s.H * (0.85 - (barIndex / N_BARS) * 0.6),
        vx: (Math.random() - 0.5) * 1.5, vy: -Math.random() * 2 - 1,
        life: 1, color: BAR_COLORS[barIndex], glyph: Math.random() > 0.5 ? '♪' : '♫',
      })
    }
  }

  function gameLoop(now) {
    const s = stateRef.current
    const dt = Math.min(0.1, (now - s.lastFrameTime) / 1000)
    s.lastFrameTime = now

    const rms = readCurrentRMS()
    const rawScore = computeLoudnessScore(rms, s.noiseFloor, s.maxExpectedRms)
    s.smoothedScore = s.smoothedScore * 0.7 + rawScore * 0.3

    const voicing = s.smoothedScore >= SCORE_THRESHOLD
    if (voicing) {
      s.sustainedSeconds += dt
      const boost = Math.min(1, s.sustainedSeconds / DURATION_BOOST_SECONDS) * DURATION_BOOST_MAX
      const climbRate = (RISE_RATE + boost) / s.requiredSustainSeconds * 3
      s.height = Math.min(1, s.height + climbRate * dt)
    } else {
      s.sustainedSeconds = 0
      s.height = Math.max(0, s.height - FALL_RATE * dt)
    }

    // Ring any bar the tower has newly climbed past.
    const barsPassed = Math.floor(s.height * N_BARS)
    if (barsPassed > s.barsRung) {
      for (let b = s.barsRung; b < barsPassed; b++) ringBar(b)
      s.barsRung = barsPassed
    }

    // Track sustained voicing segments for real per-attempt logging.
    if (rawScore > 0.1) {
      s.inVoicing = true
      s.voicingScores.push(s.smoothedScore)
    } else if (s.inVoicing) {
      logVoicingAttempt(s.voicingScores)
      s.inVoicing = false
      s.voicingScores = []
    }

    for (const b of s.birds) b.phase += dt * 1.5
    for (const st of s.stars) st.phase += dt
    for (const n of s.notes) { n.x += n.vx * dt * 40; n.y += n.vy * dt * 40; n.vy += 0.3 * dt * 40 * -0.02; n.life -= dt * 0.7 }
    s.notes = s.notes.filter(n => n.life > 0)
    for (const p of s.particles) { p.x += p.vx * dt * 60; p.y += p.vy * dt * 60; p.vy += 0.12; p.life -= dt * 1.1 }
    s.particles = s.particles.filter(p => p.life > 0)

    if (rawScore < 0.08) s.quietStreak += dt; else s.quietStreak = 0
    setEncourageVisible(s.quietStreak > 3 && s.barsRung < 1)

    render()

    if (s.height >= 0.999 && !s.hasFinished) {
      s.hasFinished = true
      onTowerComplete()
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

  function onTowerComplete() {
    const s = stateRef.current
    logLevelComplete()
    if (s.inVoicing) {
      logVoicingAttempt(s.voicingScores)
      s.inVoicing = false
      s.voicingScores = []
    }
    if (s.barsRung < N_BARS) ringBar(N_BARS - 1)
    playSuccessChime()
    setAriaMsg('The tower is fully lit — every bell rang! Wonderful, bright "eeee"!')
    const count = reduceMotionRef.current ? 20 : 60
    for (let i = 0; i < count; i++) {
      s.particles.push({
        x: s.W * 0.5, y: s.H * 0.25,
        vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6 - 1.5,
        life: 1, color: BAR_COLORS[i % BAR_COLORS.length], r: Math.random() * 3 + 2,
      })
    }
    const timeToTopSeconds = (performance.now() - s.attemptStartTime) / 1000
    updateDifficultyFromAttempt(timeToTopSeconds)
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

    // Dusk-to-night sky, deepening as the tower climbs
    const duskT = Math.min(1, s.height * 1.2)
    const sky = ctx.createLinearGradient(0, 0, 0, s.H)
    sky.addColorStop(0, blend('#2A2158', '#0B0B2A', duskT))
    sky.addColorStop(0.55, blend('#6B4A9E', '#1A1440', duskT))
    sky.addColorStop(1, blend('#3A2E6E', '#12122A', duskT))
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, s.W, s.H)

    // Stars fade in as it gets darker/higher
    ctx.fillStyle = `rgba(255,255,255,${0.15 + duskT * 0.7})`
    for (const st of s.stars) {
      const tw = 0.5 + Math.sin(st.phase * 2) * 0.5
      ctx.globalAlpha = (0.15 + duskT * 0.7) * tw
      ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2); ctx.fill()
    }
    ctx.globalAlpha = 1

    // Birds
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'
    ctx.lineWidth = 2
    for (const b of s.birds) {
      const flap = Math.sin(b.phase * 3) * 5
      ctx.beginPath()
      ctx.moveTo(b.x - 7, b.y); ctx.quadraticCurveTo(b.x - 2, b.y - flap, b.x, b.y)
      ctx.quadraticCurveTo(b.x + 2, b.y - flap, b.x + 7, b.y)
      ctx.stroke()
    }

    drawTower(ctx, s)

    // Floating notes
    for (const n of s.notes) {
      ctx.globalAlpha = Math.max(0, n.life)
      ctx.fillStyle = n.color
      ctx.font = '24px sans-serif'
      ctx.fillText(n.glyph, n.x, n.y)
      ctx.globalAlpha = 1
    }

    // Celebration particles
    for (const p of s.particles) {
      ctx.globalAlpha = Math.max(0, p.life)
      ctx.fillStyle = p.color
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill()
      ctx.globalAlpha = 1
    }

    // HUD — bell progress dots
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.beginPath(); ctx.roundRect(s.W / 2 - 130, 58, 260, 40, 10); ctx.fill()
    for (let i = 0; i < N_BARS; i++) {
      const px = s.W / 2 - (N_BARS - 1) * 16 + i * 32
      ctx.fillStyle = i < s.barsRung ? BAR_COLORS[i] : 'rgba(255,255,255,0.25)'
      ctx.beginPath(); ctx.arc(px, 78, 7, 0, Math.PI * 2); ctx.fill()
    }
  }

  function drawTower(ctx, s) {
    const towerX = s.W * 0.5
    const groundY = s.H * 0.92
    const towerTop = s.H * 0.15
    const towerWidth = 70

    // Stone tower shaft
    const shaft = ctx.createLinearGradient(towerX - towerWidth / 2, 0, towerX + towerWidth / 2, 0)
    shaft.addColorStop(0, '#5B4A6E')
    shaft.addColorStop(0.5, '#7A6A94')
    shaft.addColorStop(1, '#4A3A5E')
    ctx.fillStyle = shaft
    ctx.fillRect(towerX - towerWidth / 2, towerTop, towerWidth, groundY - towerTop)

    // Roof
    ctx.fillStyle = '#3A2E56'
    ctx.beginPath()
    ctx.moveTo(towerX - towerWidth / 2 - 14, towerTop)
    ctx.lineTo(towerX, towerTop - 46)
    ctx.lineTo(towerX + towerWidth / 2 + 14, towerTop)
    ctx.closePath(); ctx.fill()

    // Bells/bars stacked up the tower, one per pentatonic note. Bar i lights
    // up once the climb has passed i/N_BARS of the tower height.
    for (let i = 0; i < N_BARS; i++) {
      const barY = groundY - 40 - i * ((groundY - towerTop - 60) / N_BARS)
      const lit = i < s.barsRung
      const justRung = lit && i === s.barsRung - 1
      const pulse = justRung ? 1 + Math.max(0, 1 - (performance.now() % 700) / 700) * 0.15 : 1

      ctx.save()
      ctx.translate(towerX, barY)
      ctx.scale(pulse, pulse)
      ctx.fillStyle = lit ? BAR_COLORS[i] : 'rgba(255,255,255,0.15)'
      if (lit) { ctx.shadowColor = BAR_COLORS[i]; ctx.shadowBlur = 18 }
      ctx.beginPath()
      ctx.roundRect(-38, -7, 76, 14, 7)
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.restore()
    }

    // Rising climb-indicator glow inside the tower shaft
    const climbY = groundY - (groundY - towerTop) * s.height
    const glow = ctx.createLinearGradient(0, groundY, 0, climbY)
    glow.addColorStop(0, 'rgba(250,199,117,0.55)')
    glow.addColorStop(1, 'rgba(250,199,117,0)')
    ctx.fillStyle = glow
    ctx.fillRect(towerX - towerWidth / 2 + 6, climbY, towerWidth - 12, groundY - climbY)

    // Ground / mist
    const ground = ctx.createLinearGradient(0, groundY - 10, 0, s.H)
    ground.addColorStop(0, 'rgba(20,15,40,0.9)')
    ground.addColorStop(1, 'rgba(10,10,25,1)')
    ctx.fillStyle = ground
    ctx.fillRect(0, groundY - 10, s.W, s.H - groundY + 10)
  }

  function handlePlayAgain() {
    const s = stateRef.current
    setSuccessVisible(false)
    s.height = 0; s.barsRung = 0; s.hasFinished = false; s.sustainedSeconds = 0
    s.particles = []; s.notes = []
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
    <div className="fixed inset-0 bg-[#12122A] text-[#FFF8EC] overflow-hidden select-none" style={{ fontFamily: "'Quicksand', sans-serif" }}>
      <canvas ref={canvasRef} className="fixed inset-0 w-full h-full block" aria-hidden="true" />

      <button
        onClick={() => navigate('/play/chime')}
        className="fixed top-4 left-4 z-30 flex items-center gap-2 text-white/50 hover:text-white/80 text-sm transition-colors bg-black/20 rounded-full px-3 py-2"
      >
        <ArrowLeft size={16} /> Back
      </button>

      {screen === 'start' && (
        <div className="fixed inset-0 flex flex-col items-center justify-center text-center px-6 z-10">
          <div className="bg-[rgba(30,24,60,0.65)] border border-white/10 rounded-[28px_28px_40px_28px] p-10 max-w-md w-full backdrop-blur-md shadow-2xl">
            <div className="text-6xl mb-3">🔔</div>
            <h1 className="text-4xl font-extrabold mb-2">Xylophone Tower</h1>
            <p className="text-lg font-bold text-[#FACC15] mb-7 leading-relaxed flex items-center justify-center gap-2 flex-wrap">
              Hold a long, bright "eeee" to ring the bells and climb all the way to the top!
              <button onClick={replayInstruction} className="text-[#FACC15]/60 hover:text-[#FACC15] transition-colors" aria-label="Hear this again">
                <Volume2 size={18} />
              </button>
            </p>
            <button
              onClick={requestMicAndCalibrate}
              className="font-bold text-xl rounded-full px-10 py-4 text-[#12122A] bg-[#FACC15] shadow-[0_6px_0_#C99A2E] hover:-translate-y-0.5 transition-transform"
            >
              Let's Play!
            </button>
          </div>
        </div>
      )}

      {screen === 'micError' && (
        <div className="fixed inset-0 flex flex-col items-center justify-center text-center px-6 z-10">
          <div className="bg-[rgba(30,24,60,0.65)] border border-white/10 rounded-[28px_28px_40px_28px] p-10 max-w-md w-full backdrop-blur-md shadow-2xl">
            <div className="text-6xl mb-3">🎤</div>
            <h1 className="text-2xl font-extrabold mb-2">We need to hear you!</h1>
            <p className="text-sm text-[#FFD3D3] mb-5">{micErrorMsg}</p>
            <button onClick={requestMicAndCalibrate} className="font-bold text-xl rounded-full px-10 py-4 text-[#12122A] bg-[#FACC15] shadow-[0_6px_0_#C99A2E]">
              Try Again
            </button>
          </div>
        </div>
      )}

      {screen === 'calibrate' && (
        <div className="fixed inset-0 flex flex-col items-center justify-center text-center px-6 z-10">
          <div className="bg-[rgba(30,24,60,0.65)] border border-white/10 rounded-[28px_28px_40px_28px] p-10 max-w-md w-full backdrop-blur-md shadow-2xl">
            <div className="relative w-[150px] h-[150px] mx-auto mb-5">
              <svg width="150" height="150" className="-rotate-90">
                <circle cx="75" cy="75" r="60" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="10" />
                <circle cx="75" cy="75" r="60" fill="none" stroke="#FACC15" strokeWidth="10" strokeLinecap="round"
                  strokeDasharray={circ} strokeDashoffset={circ * (1 - calibProgress)} style={{ transition: 'stroke-dashoffset 0.1s linear' }} />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-3xl">{calibLabel.emoji}</div>
            </div>
            <h1 className="text-2xl font-extrabold mb-2">{calibLabel.title}</h1>
            <p className="text-lg font-bold text-[#FACC15]">{calibLabel.subtitle}</p>
          </div>
        </div>
      )}

      {hudVisible && (
        <div className="fixed top-0 left-0 right-0 flex justify-between items-start px-5 py-4 z-20">
          <div
            className={`font-bold text-lg bg-[rgba(30,24,60,0.65)] border border-white/10 rounded-full px-6 py-2.5 backdrop-blur-md max-w-[70vw] transition-opacity ${encourageVisible ? 'opacity-100' : 'opacity-0'}`}
          >
            Take a breath and hold a long "eeee"!
          </div>
          <button
            onClick={() => setSettingsOpen(v => !v)}
            className="w-[46px] h-[46px] rounded-full bg-[rgba(30,24,60,0.65)] border border-white/10 flex items-center justify-center backdrop-blur-md shadow-lg"
            aria-label="Settings"
          >
            <Settings size={20} />
          </button>
        </div>
      )}

      {settingsOpen && (
        <div className="fixed top-[74px] right-[18px] bg-[rgba(30,24,60,0.65)] border border-white/10 rounded-[20px_20px_28px_20px] p-5 z-30 w-[240px] text-left backdrop-blur-md shadow-2xl">
          <h3 className="font-extrabold mb-3">Settings</h3>
          <label className="flex items-center justify-between mb-3 font-bold text-sm cursor-pointer">
            <span>Reduce motion</span>
            <input type="checkbox" checked={reduceMotion} onChange={e => setReduceMotion(e.target.checked)} className="accent-[#FACC15]" />
          </label>
          <label className="flex items-center justify-between mb-3 font-bold text-sm cursor-pointer">
            <span>Mute sounds</span>
            <input type="checkbox" checked={muted} onChange={e => setMuted(e.target.checked)} className="accent-[#FACC15]" />
          </label>
          <button onClick={handleRecalibrate} className="w-full mt-1 text-sm border border-white/20 rounded-full px-4 py-2.5">
            Recalibrate mic
          </button>
        </div>
      )}

      {successVisible && (
        <div className="fixed inset-0 flex items-center justify-center z-40 bg-[rgba(18,18,42,0.5)]">
          <div className="bg-[rgba(30,24,60,0.65)] border border-white/10 rounded-[28px_28px_40px_28px] p-10 max-w-md w-full text-center backdrop-blur-md shadow-2xl">
            <div className="text-6xl mb-3">🔔</div>
            <h1 className="text-3xl font-extrabold mb-2">Ding! You reached the top!</h1>
            <p className="text-lg font-bold text-[#FACC15] mb-1">Every bell in the tower is ringing!</p>
            {agentFeedback && <p className="text-sm opacity-85 mb-5">{agentFeedback}</p>}
            {getNextLevelRoute(LEVEL_ID) && (
              <button onClick={() => navigate(getNextLevelRoute(LEVEL_ID))} className="font-bold text-xl rounded-full px-10 py-4 text-[#12122A] bg-[#FACC15] shadow-[0_6px_0_#C99A2E] mb-3">
                Next Level →
              </button>
            )}
            <button onClick={handlePlayAgain} className="font-bold text-xl rounded-full px-10 py-4 text-[#12122A] bg-[#FACC15] shadow-[0_6px_0_#C99A2E]">
              Play Again!
            </button>
          </div>
        </div>
      )}

      <div className="sr-only" aria-live="polite">{ariaMsg}</div>
    </div>
  )
}

function blend(hexA, hexB, t) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB)
  const r = Math.round(a.r + (b.r - a.r) * t)
  const g = Math.round(a.g + (b.g - a.g) * t)
  const bl = Math.round(a.b + (b.b - a.b) * t)
  return `rgb(${r},${g},${bl})`
}
function hexToRgb(hex) {
  const v = hex.replace('#', '')
  return { r: parseInt(v.slice(0, 2), 16), g: parseInt(v.slice(2, 4), 16), b: parseInt(v.slice(4, 6), 16) }
}
