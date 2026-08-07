import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Settings, Volume2 } from 'lucide-react'
import { logEvent, getAgentDecision } from './lib/api'
import { getNextLevelRoute } from './lib/levelProgress'
import { useSpokenInstruction } from '../lib/speech'

const MIN_PEAK_RMS_DEFAULT = 0.05
const MAX_EXPECTED_PEAK_RMS_DEFAULT = 0.4
const MAX_BURST_DURATION_S = 0.5
const MIN_TARGET_POPS = 6
const MAX_TARGET_POPS = 20
const BASE_POP_THRESHOLD = 0.1
const LEVEL_ID = 'ha'
const AGENT_POLICY = 'tabular_q'

function scoreBurst(rmsEnvelope, durationS, minPeakRms = MIN_PEAK_RMS_DEFAULT, maxExpectedPeakRms = MAX_EXPECTED_PEAK_RMS_DEFAULT) {
  if (!rmsEnvelope.length) return { score: 0, isValidAttempt: false }
  const peakRms = Math.max(...rmsEnvelope)
  if (peakRms < minPeakRms) return { score: 0, isValidAttempt: false, peakRms }
  const durationPenalty = durationS <= MAX_BURST_DURATION_S ? 1.0 : Math.max(0, 1.0 - (durationS - MAX_BURST_DURATION_S))
  const magnitudeScore = Math.max(0, Math.min(1, (peakRms - minPeakRms) / (maxExpectedPeakRms - minPeakRms)))
  return { score: magnitudeScore * durationPenalty, isValidAttempt: true, peakRms }
}

function personalizeBurstRange(peakRmsReadings, noiseFloor, fallbackMax = MAX_EXPECTED_PEAK_RMS_DEFAULT) {
  const valid = peakRmsReadings.filter(p => p > 0)
  const minPeakRms = Math.max(0.01, noiseFloor * 2)
  if (valid.length < 2) return { minPeakRms, maxExpectedPeakRms: fallbackMax, usedFallback: true }
  const maxObserved = Math.max(...valid)
  const maxExpectedPeakRms = Math.max(minPeakRms + 0.05, maxObserved)
  return { minPeakRms, maxExpectedPeakRms, usedFallback: false }
}

function popNextBubble(poppedFlags, burstScore, popThreshold = 0.3) {
  if (burstScore < popThreshold) return { poppedFlags, justPopped: -1 }
  const nextIndex = poppedFlags.indexOf(false)
  if (nextIndex === -1) return { poppedFlags, justPopped: -1 }
  const next = poppedFlags.slice()
  next[nextIndex] = true
  return { poppedFlags: next, justPopped: nextIndex }
}

// "ha!" is a discrete burst, not a sustained tone, so there's no continuous
// voicing to reward the way Rocket Launch/Submarine Dive/Wind Chime Garden
// do. Same burst-appropriate streak-boost as Firefly Jar: a quick run of
// pops in a row (rapid "ha-ha-ha") pops extra bubbles per hit; a slow lone
// "ha" or a burst that misses the threshold resets the streak to 0.
const STREAK_GAP_S = 1.2
const STREAK_LENGTH_FOR_MAX = 4
const STREAK_BONUS_MAX = 1

function computeStreakBonus(streakCount) {
  return Math.min(STREAK_BONUS_MAX, Math.floor(STREAK_BONUS_MAX * streakCount / STREAK_LENGTH_FOR_MAX))
}

function computeGridForTargetPops(targetPops) {
  const cols = Math.min(6, Math.max(2, Math.round(Math.sqrt(targetPops * 1.3))))
  const rows = Math.ceil(targetPops / cols)
  return { cols, rows }
}

const DIFFICULTY_AGENT = {
  SAFE_RANGE: [MIN_TARGET_POPS, MAX_TARGET_POPS],
  STEP: 2,
  FAST_S: 8,
  SLOW_S: 22,
  decide(timeToFillSeconds) {
    if (timeToFillSeconds < this.FAST_S) return { action: 'raise', message: "Great strong bursts! Let's add a couple more bubbles next time 🫧" }
    if (timeToFillSeconds > this.SLOW_S) return { action: 'lower', message: "Nice effort! Let's make the next sheet a little smaller 💛" }
    return { action: 'hold', message: "Great steady bursts! Let's keep this sheet size for now 🌟" }
  },
  apply(targetPops, decision) {
    let next = targetPops
    if (decision.action === 'raise') next += this.STEP
    if (decision.action === 'lower') next -= this.STEP
    return Math.max(this.SAFE_RANGE[0], Math.min(this.SAFE_RANGE[1], next))
  },
}

export default function BubbleWrapPop() {
  const navigate = useNavigate()
  const canvasRef = useRef(null)
  const rafRef = useRef(null)

  const [screen, setScreen] = useState('start')
  const [micErrorMsg, setMicErrorMsg] = useState('')
  const [calibLabel, setCalibLabel] = useState({ title: "Let's find quiet...", subtitle: 'Stay nice and quiet for a moment', emoji: '🤫' })
  const [calibProgress, setCalibProgress] = useState(0)
  const [hudVisible, setHudVisible] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [reduceMotion, setReduceMotion] = useState(() => localStorage.getItem('bubble_reduce_motion') === 'true')
  const [muted, setMuted] = useState(() => localStorage.getItem('bubble_muted') === 'true')
  const [encourageVisible, setEncourageVisible] = useState(false)
  const [successVisible, setSuccessVisible] = useState(false)
  const [agentFeedback, setAgentFeedback] = useState('')
  const [ariaMsg, setAriaMsg] = useState('')

  const stateRef = useRef({
    audioCtx: null, analyser: null, timeDomainData: null, mediaStream: null,
    noiseFloor: 0.01,
    targetPops: MIN_TARGET_POPS,
    gridCols: 3, gridRows: 2,
    poppedFlags: [], popPulse: [],
    popThreshold: BASE_POP_THRESHOLD,
    burstEnvelope: [], inBurst: false, burstStartTime: 0,
    popStreak: 0, lastPopTime: -1,
    minPeakRms: MIN_PEAK_RMS_DEFAULT,
    maxExpectedPeakRms: MAX_EXPECTED_PEAK_RMS_DEFAULT,
    lastFrameTime: 0, quietStreak: 0,
    hasFinished: false, particles: [],
    attemptStartTime: 0,
    attemptNumber: 0,
    W: 0, H: 0, DPR: 1,
  })

  const reduceMotionRef = useRef(reduceMotion)
  const mutedRef = useRef(muted)
  useEffect(() => { reduceMotionRef.current = reduceMotion; localStorage.setItem('bubble_reduce_motion', reduceMotion) }, [reduceMotion])
  useEffect(() => { mutedRef.current = muted; localStorage.setItem('bubble_muted', muted) }, [muted])

  const replayInstruction = useSpokenInstruction(
    'Say a quick HA burst to pop a bubble on the sheet!',
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
  }, [])

  useEffect(() => {
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)
    return () => window.removeEventListener('resize', resizeCanvas)
  }, [resizeCanvas])

  function readCurrentRMS() {
    const s = stateRef.current
    s.analyser.getFloatTimeDomainData(s.timeDomainData)
    let sum = 0
    for (let i = 0; i < s.timeDomainData.length; i++) sum += s.timeDomainData[i] * s.timeDomainData[i]
    return Math.sqrt(sum / s.timeDomainData.length)
  }

  function playPopSound() {
    const s = stateRef.current
    if (mutedRef.current || !s.audioCtx) return
    const a = s.audioCtx
    const osc = a.createOscillator(), gain = a.createGain()
    osc.type = 'square'
    osc.frequency.setValueAtTime(280, a.currentTime)
    osc.frequency.exponentialRampToValueAtTime(90, a.currentTime + 0.08)
    gain.gain.setValueAtTime(0.09, a.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.1)
    osc.connect(gain).connect(a.destination)
    osc.start(); osc.stop(a.currentTime + 0.12)
  }

  function playSuccessChime() {
    const s = stateRef.current
    ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => setTimeout(() => {
      if (mutedRef.current || !s.audioCtx) return
      const a = s.audioCtx
      const osc = a.createOscillator(), gain = a.createGain()
      osc.type = 'triangle'; osc.frequency.value = f
      gain.gain.setValueAtTime(0, a.currentTime)
      gain.gain.linearRampToValueAtTime(0.045, a.currentTime + 0.03)
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
        ? 'Please allow microphone access so we can hear your burst.'
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
      setCalibLabel({ title: 'Now say "HA!"', subtitle: 'A few quick, strong bursts', emoji: '💥' })
      setCalibProgress(0)
      const loudStart = performance.now()
      let inBurst = false, currentBurstPeak = 0
      const burstGate = stateRef.current.noiseFloor * 2
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

  function startNewSheet() {
    const s = stateRef.current
    const grid = computeGridForTargetPops(s.targetPops)
    s.gridCols = grid.cols
    s.gridRows = grid.rows
    s.poppedFlags = new Array(s.gridCols * s.gridRows).fill(false)
    s.popPulse = new Array(s.gridCols * s.gridRows).fill(0)
    s.hasFinished = false
    s.particles = []
    s.popStreak = 0
    s.lastPopTime = -1
    s.lastFrameTime = performance.now()
    s.attemptStartTime = performance.now()
  }

  function finishCalibration() {
    setScreen('playing')
    setHudVisible(true)
    startNewSheet()
    setAriaMsg('Ready! Say a quick "ha!" to pop a bubble.')
    rafRef.current = requestAnimationFrame(gameLoop)
  }

  // Logs one real, per-burst event to the backend the same way the scorePhoneme-based
  // games do: one attempt = one detected sound, score = actual audio-quality score for
  // that burst (from scoreBurst), not anything derived from overall completion time.
  async function logBurstAttempt(score, isValidAttempt) {
    const s = stateRef.current
    s.attemptNumber++
    try {
      await logEvent({
        level_id: LEVEL_ID,
        attempt_number: s.attemptNumber,
        score,
        is_valid_attempt: isValidAttempt,
      })
    } catch (err) {
      console.warn('Backend event logging unavailable:', err)
    }
  }

  // Sheet-completion pacing only: asks the difficulty agent whether to grow/shrink the
  // next sheet. timeToFillSeconds is used purely as the local input signal (and as the
  // fallback heuristic if the trained-agent endpoint is unavailable) — it is never sent
  // to the backend as a "score", since that field means per-attempt audio quality
  // everywhere else in the app.
  async function updateDifficultyFromAttempt(timeToFillSeconds) {
    const s = stateRef.current

    let decision = null
    try {
      decision = await getAgentDecision(LEVEL_ID, AGENT_POLICY)
    } catch (err) {
      console.warn('Trained-agent endpoint unavailable, falling back to local rule-based agent:', err)
    }
    if (!decision) decision = DIFFICULTY_AGENT.decide(timeToFillSeconds)

    s.targetPops = DIFFICULTY_AGENT.apply(s.targetPops, decision)
    setAgentFeedback(decision.message)
  }

  // Marks the level as passed independent of any single pop's score — the
  // in-game pop threshold (BASE_POP_THRESHOLD) is intentionally forgiving,
  // so no individual logged pop may ever clear PASS_THRESHOLD even when the
  // kid genuinely clears the sheet. levelProgress.js treats this as a pass.
  async function logLevelComplete() {
    const s = stateRef.current
    try {
      await logEvent({ level_id: LEVEL_ID, attempt_number: s.attemptNumber, score: 1, is_valid_attempt: true, action: 'level_complete' })
    } catch (err) {
      console.warn('Backend event logging unavailable:', err)
    }
  }

  function onSheetSuccess() {
    const s = stateRef.current
    logLevelComplete()
    playSuccessChime()
    setAriaMsg('You popped every bubble on the sheet!')
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
    for (let i = 0; i < count; i++) {
      s.particles.push({
        x: s.W / 2, y: s.H / 2,
        vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6 - 1,
        life: 1, color: ['#FFD166', '#6BCB77', '#FF6B6B', '#FFF8EC'][i % 4],
        r: Math.random() * 3 + 2,
      })
    }
  }

  function gameLoop(now) {
    const s = stateRef.current
    const dt = Math.min(0.1, (now - s.lastFrameTime) / 1000)
    s.lastFrameTime = now

    const rms = readCurrentRMS()
    const burstThreshold = s.noiseFloor * 2.5

    if (rms >= burstThreshold) {
      if (!s.inBurst) { s.inBurst = true; s.burstStartTime = now; s.burstEnvelope = [] }
      s.burstEnvelope.push(rms)
    } else if (s.inBurst) {
      const durationS = (now - s.burstStartTime) / 1000
      const { score, isValidAttempt } = scoreBurst(s.burstEnvelope, durationS, s.minPeakRms, s.maxExpectedPeakRms)
      if (isValidAttempt) {
        const result = popNextBubble(s.poppedFlags, score, s.popThreshold)
        if (result.justPopped >= 0) {
          const gapS = s.lastPopTime >= 0 ? (now - s.lastPopTime) / 1000 : Infinity
          s.popStreak = gapS <= STREAK_GAP_S ? s.popStreak + 1 : 1
          s.lastPopTime = now
          const bonus = computeStreakBonus(s.popStreak)

          let flags = result.poppedFlags
          s.popPulse[result.justPopped] = 1
          for (let i = 0; i < bonus; i++) {
            const extra = popNextBubble(flags, score, s.popThreshold)
            if (extra.justPopped < 0) break
            flags = extra.poppedFlags
            s.popPulse[extra.justPopped] = 1
          }
          s.poppedFlags = flags
          playPopSound()
        } else {
          // A real attempt that didn't pop a bubble breaks the streak, same
          // as it would if this were a sustain mechanic losing voicing quality.
          s.popStreak = 0
        }
      }
      // One backend event per detected burst, scored on real audio quality — matches
      // how every other level logs one event per phoneme attempt.
      logBurstAttempt(score, isValidAttempt)
      s.inBurst = false
      s.burstEnvelope = []
    }

    for (let i = 0; i < s.popPulse.length; i++) if (s.popPulse[i] > 0) s.popPulse[i] = Math.max(0, s.popPulse[i] - dt * 2.5)

    const numPopped = s.poppedFlags.filter(Boolean).length
    if (rms < s.noiseFloor * 1.5) s.quietStreak += dt; else s.quietStreak = 0
    setEncourageVisible(s.quietStreak > 4 && numPopped === 0)

    render()

    if (numPopped >= s.targetPops && !s.hasFinished) {
      s.hasFinished = true
      onSheetSuccess()
    }
    if (!s.hasFinished) rafRef.current = requestAnimationFrame(gameLoop)
  }

  function render() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const s = stateRef.current
    const grad = ctx.createLinearGradient(0, 0, 0, s.H)
    grad.addColorStop(0, '#FFDDE1'); grad.addColorStop(1, '#C97B8B')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, s.W, s.H)
    drawParticles(ctx)
    drawBubbleSheet(ctx)
  }

  function drawParticles(ctx) {
    const s = stateRef.current
    ctx.save()
    s.particles = s.particles.filter(p => p.life > 0)
    for (const p of s.particles) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.06; p.life -= 0.014
      ctx.globalAlpha = Math.max(0, p.life)
      ctx.fillStyle = p.color
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill()
    }
    ctx.restore()
  }

  function drawBubbleSheet(ctx) {
    const s = stateRef.current
    const cellSize = Math.min((s.W * 0.8) / s.gridCols, (s.H * 0.6) / s.gridRows)
    const sheetW = cellSize * s.gridCols, sheetH = cellSize * s.gridRows
    const originX = (s.W - sheetW) / 2, originY = (s.H - sheetH) / 2

    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    ctx.beginPath()
    const pad = cellSize * 0.15
    if (ctx.roundRect) ctx.roundRect(originX - pad, originY - pad, sheetW + pad * 2, sheetH + pad * 2, 20)
    else ctx.rect(originX - pad, originY - pad, sheetW + pad * 2, sheetH + pad * 2)
    ctx.fill()

    for (let row = 0; row < s.gridRows; row++) {
      for (let col = 0; col < s.gridCols; col++) {
        const idx = row * s.gridCols + col
        const cx = originX + col * cellSize + cellSize / 2
        const cy = originY + row * cellSize + cellSize / 2
        const r = cellSize * 0.38
        const popped = s.poppedFlags[idx]
        const pulse = s.popPulse[idx]

        if (popped && pulse <= 0.01) {
          ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1.5
          ctx.beginPath(); ctx.arc(cx, cy, r * 0.85, 0, Math.PI * 2); ctx.stroke()
          continue
        }

        const scale = popped ? (1 + pulse * 0.6) : 1
        const alpha = popped ? Math.max(0, 1 - pulse) : 1

        ctx.save()
        ctx.globalAlpha = alpha
        const bubbleGrad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r * scale)
        bubbleGrad.addColorStop(0, 'rgba(255,255,255,0.9)')
        bubbleGrad.addColorStop(0.5, 'rgba(255,255,255,0.55)')
        bubbleGrad.addColorStop(1, 'rgba(255,255,255,0.25)')
        ctx.fillStyle = bubbleGrad
        ctx.beginPath(); ctx.arc(cx, cy, r * scale, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.fillStyle = 'rgba(255,255,255,0.8)'
        ctx.beginPath(); ctx.ellipse(cx - r * 0.35, cy - r * 0.35, r * 0.22, r * 0.14, -0.5, 0, Math.PI * 2); ctx.fill()
        ctx.restore()
      }
    }
  }

  function handlePlayAgain() {
    setSuccessVisible(false)
    startNewSheet()
    rafRef.current = requestAnimationFrame(gameLoop)
  }

  function handleRecalibrate() {
    setSettingsOpen(false)
    setHudVisible(false)
    cancelAnimationFrame(rafRef.current)
    runCalibration()
  }

  return (
    <div className="bwp-root">
      <canvas ref={canvasRef} className="bwp-canvas" aria-hidden="true" />

      {screen === 'start' && (
        <div className="bwp-screen">
          <div className="bwp-panel">
            <div className="bwp-mic-icon">🫧</div>
            <h1 className="bwp-title">Bubble Wrap Pop</h1>
            <p className="bwp-subtitle">
              Say a quick "HA!" burst to pop a bubble on the sheet!{' '}
              <button onClick={replayInstruction} aria-label="Hear this again"
                style={{ display: 'inline-flex', verticalAlign: 'middle', opacity: 0.6, background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
                <Volume2 size={16} />
              </button>
            </p>
            <button className="bwp-btn" onClick={requestMicAndCalibrate}>Let's Play!</button>
          </div>
        </div>
      )}

      {screen === 'micError' && (
        <div className="bwp-screen">
          <div className="bwp-panel">
            <div className="bwp-mic-icon">🎤</div>
            <h1 className="bwp-title" style={{ fontSize: '1.6rem' }}>We need to hear you!</h1>
            <p className="bwp-error-text">{micErrorMsg}</p>
            <button className="bwp-btn" onClick={requestMicAndCalibrate}>Try Again</button>
          </div>
        </div>
      )}

      {screen === 'calibrate' && (
        <div className="bwp-screen">
          <div className="bwp-panel">
            <div className="bwp-ring-wrap">
              <svg width="150" height="150">
                <circle className="bwp-ring-bg" cx="75" cy="75" r="60" />
                <circle
                  className="bwp-ring-fg" cx="75" cy="75" r="60"
                  strokeDasharray={2 * Math.PI * 60}
                  strokeDashoffset={2 * Math.PI * 60 * (1 - calibProgress)}
                />
              </svg>
              <div className="bwp-ring-label">{calibLabel.emoji}</div>
            </div>
            <h1 className="bwp-title" style={{ fontSize: '1.6rem' }}>{calibLabel.title}</h1>
            <p className="bwp-subtitle">{calibLabel.subtitle}</p>
          </div>
        </div>
      )}

      {hudVisible && (
        <div className="bwp-hud">
          <button className="bwp-icon-btn" onClick={() => navigate('/play/chime')} aria-label="Back to Chime">
            <ArrowLeft size={20} />
          </button>
          <div className={`bwp-encourage ${encourageVisible ? 'visible' : ''}`}>
            Try a quick, strong "HA!" burst!
          </div>
          <button className="bwp-icon-btn" onClick={() => setSettingsOpen(o => !o)} aria-label="Settings">
            <Settings size={20} />
          </button>
        </div>
      )}

      {settingsOpen && (
        <div className="bwp-settings-panel">
          <h3>Settings</h3>
          <div className="bwp-toggle-row">
            <span>Reduce motion</span>
            <label className="bwp-switch">
              <input type="checkbox" checked={reduceMotion} onChange={e => setReduceMotion(e.target.checked)} />
              <span className="bwp-switch-track" />
            </label>
          </div>
          <div className="bwp-toggle-row">
            <span>Mute sounds</span>
            <label className="bwp-switch">
              <input type="checkbox" checked={muted} onChange={e => setMuted(e.target.checked)} />
              <span className="bwp-switch-track" />
            </label>
          </div>
          <button className="bwp-btn bwp-btn-secondary" onClick={handleRecalibrate}>Recalibrate mic</button>
        </div>
      )}

      {successVisible && (
        <div className="bwp-success-overlay">
          <div className="bwp-panel">
            <div className="bwp-mic-icon">🎉</div>
            <h1 className="bwp-title">Sheet complete!</h1>
            <p className="bwp-subtitle">You popped every bubble!</p>
            <p style={{ fontSize: '0.95rem', opacity: 0.85, margin: '-14px 0 20px' }}>{agentFeedback}</p>
            {getNextLevelRoute(LEVEL_ID) && (
              <button className="bwp-btn" onClick={() => navigate(getNextLevelRoute(LEVEL_ID))}>Next Level →</button>
            )}
            <button className="bwp-btn" onClick={handlePlayAgain}>New Sheet!</button>
          </div>
        </div>
      )}

      <div className="bwp-visually-hidden" aria-live="polite">{ariaMsg}</div>

      <style>{`
        .bwp-root {
          --cozy-deep: #C97B8B; --gold: #FFD166; --mint: #6BCB77; --cloud-white: #FFF8EC;
          --panel-bg: rgba(201, 123, 139, 0.6); --panel-border: rgba(255, 248, 236, 0.2);
          position: fixed; inset: 0; overflow: hidden; background: var(--cozy-deep);
          font-family: 'Quicksand', sans-serif; color: var(--cloud-white);
        }
        .bwp-canvas { position: fixed; inset: 0; width: 100%; height: 100%; display: block; }
        .bwp-screen { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 24px; z-index: 10; }
        .bwp-panel { background: var(--panel-bg); border: 1px solid var(--panel-border); border-radius: 28px 28px 40px 28px; padding: 40px 36px; max-width: 460px; width: 100%; backdrop-filter: blur(10px); box-shadow: 0 24px 60px rgba(0,0,0,0.35); }
        .bwp-title { font-family: 'Baloo 2', sans-serif; font-weight: 800; font-size: clamp(2rem, 6vw, 2.8rem); margin: 0 0 8px; color: var(--cloud-white); text-shadow: 0 4px 0 rgba(0,0,0,0.1); }
        .bwp-subtitle { font-size: clamp(1rem, 3vw, 1.2rem); font-weight: 700; margin: 0 0 28px; color: var(--gold); line-height: 1.5; }
        .bwp-btn { font-family: 'Baloo 2', sans-serif; font-weight: 700; font-size: 1.3rem; border: none; border-radius: 999px; padding: 16px 40px; cursor: pointer; color: var(--cozy-deep); background: var(--cloud-white); box-shadow: 0 6px 0 #D9B99C, 0 10px 24px rgba(0,0,0,0.2); transition: transform 0.18s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.18s ease; }
        .bwp-btn:hover { transform: translateY(-3px) scale(1.02); box-shadow: 0 9px 0 #D9B99C, 0 16px 32px rgba(0,0,0,0.28); }
        .bwp-btn:active { transform: translateY(3px) scale(1); box-shadow: 0 3px 0 #D9B99C, 0 6px 14px rgba(0,0,0,0.2); }
        .bwp-btn-secondary { background: transparent; color: var(--cloud-white); box-shadow: none; border: 2px solid var(--panel-border); font-size: 1rem; padding: 10px 22px; margin-top: 14px; width: 100%; }
        .bwp-mic-icon { font-size: 3.4rem; margin-bottom: 12px; display: inline-block; }
        .bwp-error-text { font-size: 0.95rem; color: #FFF0F0; margin-top: 14px; line-height: 1.5; }
        .bwp-ring-wrap { position: relative; width: 150px; height: 150px; margin: 0 auto 22px; }
        .bwp-ring-wrap svg { transform: rotate(-90deg); }
        .bwp-ring-bg { fill: none; stroke: rgba(255,255,255,0.18); stroke-width: 10; }
        .bwp-ring-fg { fill: none; stroke: var(--cloud-white); stroke-width: 10; stroke-linecap: round; transition: stroke-dashoffset 0.1s linear; }
        .bwp-ring-label { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 2rem; }
        .bwp-hud { position: fixed; top: 0; left: 0; right: 0; display: flex; justify-content: space-between; align-items: flex-start; padding: 18px 20px; z-index: 20; pointer-events: none; }
        .bwp-hud > * { pointer-events: auto; }
        .bwp-encourage { font-family: 'Baloo 2', sans-serif; font-weight: 700; font-size: clamp(1rem, 3.5vw, 1.4rem); background: var(--panel-bg); border: 1px solid var(--panel-border); border-radius: 999px; padding: 10px 22px; opacity: 0; transition: opacity 0.4s ease; max-width: 60vw; }
        .bwp-encourage.visible { opacity: 1; }
        .bwp-icon-btn { background: var(--panel-bg); border: 1px solid var(--panel-border); border-radius: 999px; width: 46px; height: 46px; display: flex; align-items: center; justify-content: center; box-shadow: 0 8px 20px rgba(0,0,0,0.2); padding: 0; color: var(--cloud-white); backdrop-filter: blur(8px); transition: transform 0.15s ease, box-shadow 0.15s ease; cursor: pointer; }
        .bwp-icon-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 26px rgba(0,0,0,0.25); }
        .bwp-icon-btn:active { transform: translateY(1px); }
        .bwp-settings-panel { position: fixed; top: 74px; right: 18px; background: var(--panel-bg); border: 1px solid var(--panel-border); border-radius: 20px 20px 28px 20px; padding: 18px 20px; z-index: 30; width: 240px; text-align: left; backdrop-filter: blur(10px); box-shadow: 0 16px 40px rgba(0,0,0,0.25); }
        .bwp-settings-panel h3 { font-family: 'Baloo 2', sans-serif; margin: 0 0 12px; font-size: 1.1rem; }
        .bwp-toggle-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; font-weight: 700; font-size: 0.95rem; }
        .bwp-switch { position: relative; width: 46px; height: 26px; flex-shrink: 0; display: inline-block; }
        .bwp-switch input { opacity: 0; width: 0; height: 0; }
        .bwp-switch-track { position: absolute; inset: 0; background: rgba(255,255,255,0.25); border-radius: 999px; transition: background 0.2s ease; cursor: pointer; }
        .bwp-switch-track::before { content: ""; position: absolute; width: 20px; height: 20px; left: 3px; top: 3px; background: var(--cloud-white); border-radius: 50%; transition: transform 0.2s ease; }
        .bwp-switch input:checked + .bwp-switch-track { background: var(--mint); }
        .bwp-switch input:checked + .bwp-switch-track::before { transform: translateX(20px); }
        .bwp-success-overlay { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 40; background: rgba(201, 123, 139, 0.45); }
        .bwp-visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
      `}</style>
    </div>
  )
}
