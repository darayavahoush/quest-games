import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Settings, Volume2 } from 'lucide-react'
import { scoreWord, transcribeAudio, logEvent, getAgentDecision } from './lib/api'
import { sampleWordList } from './data/wordBank.js'
import { useSpokenInstruction } from '../lib/speech'

// Canonical short code — LEVEL_ORDER in lib/levelProgress.js expects
// 'village-builder', not the prototype's original 'word_village'. Same
// class of bug as the other five games: get this wrong and the level
// never registers as "passed" no matter how well the child plays.
const LEVEL_ID = 'village-builder'
const AGENT_POLICY = 'tabular_q'

// Session size — how many houses/words per round. Previously this WAS
// the word content too (a fixed 8-word DEFAULT_WORD_LIST that never
// varied). Now it's just the round size; the actual words are randomly
// sampled from data/wordBank.js's much larger, phoneme-tagged bank each
// time startGame() runs, so replaying doesn't mean the same 8 words.
const ROUND_SIZE = 8
const HOUSE_COLORS = ['#C4487A', '#4ECDC4', '#D9713C', '#B983FF', '#FF8C69', '#4F9E5C', '#E8A33D', '#5EC8D8']

const RMS_SPEECH_THRESHOLD = 0.015
const SILENCE_MS = 400
const MAX_RECORD_MS = 4000
const MIN_RECORD_MS = 400

// Local pacing agent — same shape as the other five games: SAFE_RANGE is
// the safety envelope the threshold can never leave, applied whether the
// decision came from the real trained agent or this offline fallback.
const WORD_DIFFICULTY_AGENT = {
  SAFE_RANGE: [0.45, 0.75],
  STEP: 0.05,
  decide(lastMatchScore) {
    if (lastMatchScore >= 0.85) return { action: 'raise', message: "Great listening! Let's tune in a little closer next time." }
    if (lastMatchScore < 0.4) return { action: 'lower', message: "Let's make the next word a bit more forgiving." }
    return { action: 'hold', message: 'Nice and steady!' }
  },
  apply(threshold, decision) {
    let next = threshold
    if (decision.action === 'raise') next += this.STEP
    if (decision.action === 'lower') next -= this.STEP
    return Math.max(this.SAFE_RANGE[0], Math.min(this.SAFE_RANGE[1], next))
  },
}

// Offline fallback matching backend/word_level/asr_match.py's logic —
// only used if the backend is unreachable, so the game still works.
const MIN_CONFIDENCE_FOR_VALID = 0.4 // below this, ASR itself wasn't sure enough to trust

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)])
  for (let j = 0; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[a.length][b.length]
}
function tokenSimilarity(a, b) {
  const dist = levenshtein(a, b)
  const maxLen = Math.max(a.length, b.length)
  return maxLen > 0 ? 1 - dist / maxLen : 1
}
function localWordMatch(transcript, targetWord, confidence) {
  if (!transcript || !transcript.trim()) return { transcript: '', confidence: 0, match_score: 0, is_valid_attempt: false }
  const target = targetWord.trim().toLowerCase()
  const tokens = transcript.trim().toLowerCase().split(/\s+/)
  // Compare the target against each word individually and take the best
  // match, so "the dog" scores the same as "dog" for target "dog" — a
  // fuller, grammatically normal sentence shouldn't be penalized just for
  // being longer than a bare target word.
  const match_score = Math.max(...tokens.map((tok) => tokenSimilarity(tok, target)))
  // A low-confidence transcription — hallucinated from silence/noise, not
  // just mis-heard — shouldn't count as a genuine valid attempt even if it
  // happens to string-match the target.
  const is_valid_attempt = confidence >= MIN_CONFIDENCE_FOR_VALID
  return { transcript, confidence, match_score, is_valid_attempt }
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function lerpColor(hexA, hexB, t) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB)
  const r = Math.round(a[0] + (b[0] - a[0]) * t)
  const g = Math.round(a[1] + (b[1] - a[1]) * t)
  const bl = Math.round(a[2] + (b[2] - a[2]) * t)
  return `rgb(${r},${g},${bl})`
}
function buildWordListFromInput(rawInput) {
  const words = rawInput.split(',').map(w => w.trim().toLowerCase()).filter(Boolean)
  if (words.length === 0) return null
  const list = []
  for (let i = 0; i < ROUND_SIZE; i++) list.push(words[i % words.length])
  return list
}

export default function VillageBuilder() {
  const navigate = useNavigate()

  // One random sample per mount — computed once here (not inside each
  // useState initializer separately) so wordList/targetWord/houseGrowPulse
  // all agree on the same set instead of each independently resampling.
  const initialWordList = useState(() => sampleWordList(ROUND_SIZE))[0]

  const [phase, setPhase] = useState('start') // start | micError | playing
  const [wordList, setWordList] = useState(initialWordList)
  const [customInput, setCustomInput] = useState('')
  const [targetWord, setTargetWord] = useState(initialWordList[0])
  const [housesBuilt, setHousesBuilt] = useState(0)
  const [listeningLabel, setListeningLabel] = useState('🎙️ Listening...')
  const [recentAttempt, setRecentAttempt] = useState({ text: '', visible: false })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [reduceMotion, setReduceMotion] = useState(() => localStorage.getItem('village_reduce_motion') === 'true')
  const [muted, setMuted] = useState(() => localStorage.getItem('village_muted') === 'true')
  const [finished, setFinished] = useState(false)
  const [difficultyMsg, setDifficultyMsg] = useState(null)
  const [micErrorDetail, setMicErrorDetail] = useState('Please allow microphone access so your village can hear your words.')

  const canvasRef = useRef(null)
  const meterFillRef = useRef(null)
  const audioCtxRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const analyserRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const vadIntervalRef = useRef(null)
  const animFrameCountRef = useRef(0)
  const rafIdRef = useRef(null)
  const wordListRef = useRef(initialWordList)
  const reduceMotionRef = useRef(reduceMotion)
  const mutedRef = useRef(muted)

  const s = useRef({
    currentRms: 0,
    matchThreshold: 0.45,
    currentWordIndex: 0,
    housesBuilt: 0,
    houseGrowPulse: new Array(initialWordList.length).fill(0),
    attemptNumber: 0,
    hasFinished: false,
    particles: [],
    clouds: [],
    listening: false,
    W: 0, H: 0, DPR: Math.min(window.devicePixelRatio || 1, 2),
  }).current

  useEffect(() => { reduceMotionRef.current = reduceMotion; localStorage.setItem('village_reduce_motion', reduceMotion) }, [reduceMotion])
  useEffect(() => { mutedRef.current = muted; localStorage.setItem('village_muted', muted) }, [muted])
  useEffect(() => { wordListRef.current = wordList }, [wordList])

  // ---- audio ----
  const playTone = useCallback((freq, duration, type = 'sine', gainPeak = 0.06) => {
    if (mutedRef.current || !audioCtxRef.current) return
    const a = audioCtxRef.current
    const osc = a.createOscillator(), gain = a.createGain()
    osc.type = type; osc.frequency.value = freq
    gain.gain.setValueAtTime(0, a.currentTime)
    gain.gain.linearRampToValueAtTime(gainPeak, a.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + duration)
    osc.connect(gain).connect(a.destination)
    osc.start(); osc.stop(a.currentTime + duration + 0.05)
  }, [])
  const playBuildSound = useCallback(() => { [440, 660].forEach((f, i) => setTimeout(() => playTone(f, 0.15, 'sine', 0.07), i * 60)) }, [playTone])
  const playSuccessChime = useCallback(() => { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => setTimeout(() => playTone(f, 0.5, 'triangle', 0.05), i * 110)) }, [playTone])

  // Start-screen instruction, auto-spoken once per (re-)entry.
  const replayStartInstruction = useSpokenInstruction(
    'Say the word to bring a new house to life — watch your village wake up as you go!',
    { enabled: phase === 'start' && !muted },
  )

  // Each new target word is auto-spoken once — useSpokenInstruction's
  // "text changed while enabled" branch fires again every time targetWord
  // moves on to the next word in the round, not just the very first one.
  // Its returned function also doubles as the manual "hear the word"
  // replay button below, so there's one source of truth for how this
  // game speaks a word instead of two separate copies.
  const speakTargetWord = useSpokenInstruction(targetWord, { enabled: phase === 'playing' && !muted, rate: 0.85 })

  // ---- canvas sizing ----
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    s.W = window.innerWidth; s.H = window.innerHeight
    canvas.width = s.W * s.DPR; canvas.height = s.H * s.DPR
    canvas.style.width = s.W + 'px'; canvas.style.height = s.H + 'px'
    const ctx = canvas.getContext('2d')
    ctx.setTransform(s.DPR, 0, 0, s.DPR, 0, 0)
    s.clouds = Array.from({ length: 4 }, () => ({
      x: Math.random() * s.W, y: Math.random() * s.H * 0.3, speed: Math.random() * 0.15 + 0.05, scale: Math.random() * 0.5 + 0.7,
    }))
  }, [s])

  // ---- drawing ----
  const drawHills = useCallback((ctx, progress) => {
    const baseY = s.H * 0.74
    ctx.save()
    ctx.fillStyle = lerpColor('#2E5940', '#3B7A45', progress)
    ctx.globalAlpha = 0.55
    ctx.beginPath()
    ctx.moveTo(0, baseY)
    ctx.bezierCurveTo(s.W * 0.2, baseY - s.H * 0.09, s.W * 0.35, baseY - s.H * 0.02, s.W * 0.55, baseY - s.H * 0.07)
    ctx.bezierCurveTo(s.W * 0.75, baseY - s.H * 0.12, s.W * 0.9, baseY - s.H * 0.03, s.W, baseY - s.H * 0.06)
    ctx.lineTo(s.W, baseY + 20); ctx.lineTo(0, baseY + 20)
    ctx.closePath(); ctx.fill()

    ctx.fillStyle = lerpColor('#245038', '#2F6538', progress)
    ctx.globalAlpha = 0.7
    ctx.beginPath()
    ctx.moveTo(0, baseY + 8)
    ctx.bezierCurveTo(s.W * 0.15, baseY - s.H * 0.04, s.W * 0.4, baseY + s.H * 0.03, s.W * 0.6, baseY - s.H * 0.02)
    ctx.bezierCurveTo(s.W * 0.8, baseY - s.H * 0.06, s.W * 0.9, baseY + s.H * 0.02, s.W, baseY - s.H * 0.01)
    ctx.lineTo(s.W, baseY + 30); ctx.lineTo(0, baseY + 30)
    ctx.closePath(); ctx.fill()
    ctx.restore()
  }, [s])

  const drawSun = useCallback((ctx, progress) => {
    const sunX = s.W * 0.82
    const sunY = (s.H * 0.7) - progress * (s.H * 0.48)
    ctx.save()
    const glow = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 46)
    glow.addColorStop(0, 'rgba(255, 231, 184, 0.9)')
    glow.addColorStop(1, 'rgba(255, 231, 184, 0)')
    ctx.fillStyle = glow
    ctx.beginPath(); ctx.arc(sunX, sunY, 46, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#FFE7B8'
    ctx.beginPath(); ctx.arc(sunX, sunY, 18, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  }, [s])

  const drawClouds = useCallback((ctx) => {
    ctx.save()
    for (const c of s.clouds) {
      if (!reduceMotionRef.current) { c.x += c.speed; if (c.x > s.W + 60) c.x = -60 }
      ctx.globalAlpha = 0.8
      ctx.fillStyle = '#FFFFFF'
      ctx.save()
      ctx.translate(c.x, c.y)
      ctx.scale(c.scale, c.scale)
      ctx.beginPath()
      ctx.ellipse(0, 0, 26, 14, 0, 0, Math.PI * 2)
      ctx.ellipse(20, -6, 18, 12, 0, 0, Math.PI * 2)
      ctx.ellipse(-20, -4, 16, 11, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
    ctx.restore()
  }, [s])

  const drawParticles = useCallback((ctx) => {
    ctx.save()
    s.particles = s.particles.filter(p => p.life > 0)
    for (const p of s.particles) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.06; p.life -= 0.014
      ctx.globalAlpha = Math.max(0, p.life)
      ctx.fillStyle = p.color
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill()
    }
    ctx.restore()
  }, [s])

  const drawChimneyStack = (ctx, x, y) => { ctx.fillStyle = '#6B6B6B'; ctx.fillRect(x - 4, y, 8, 14) }
  const drawFlowerBox = (ctx, index) => {
    ctx.save()
    ctx.fillStyle = '#7A4327'
    ctx.fillRect(4, -14, 14, 5)
    const flowerColors = ['#FF6B6B', '#FFD166', '#EAF9FF']
    for (let f = 0; f < 3; f++) {
      ctx.fillStyle = flowerColors[(f + index) % flowerColors.length]
      ctx.beginPath(); ctx.arc(6 + f * 5, -16, 2, 0, Math.PI * 2); ctx.fill()
    }
    ctx.restore()
  }
  const drawCottage = (ctx, color) => {
    ctx.fillStyle = color; ctx.fillRect(-22, -40, 44, 40)
    ctx.fillStyle = '#7A4327'
    ctx.beginPath(); ctx.moveTo(-28, -40); ctx.lineTo(0, -64); ctx.lineTo(28, -40); ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#5A3820'; ctx.fillRect(-8, -20, 16, 20)
    ctx.fillStyle = '#EAF9FF'; ctx.fillRect(8, -32, 10, 10)
    drawChimneyStack(ctx, 16, -58)
  }
  const drawCabin = (ctx, color) => {
    ctx.fillStyle = color; ctx.fillRect(-24, -34, 48, 34)
    ctx.fillStyle = '#5A3820'
    ctx.beginPath(); ctx.moveTo(-30, -34); ctx.lineTo(0, -66); ctx.lineTo(30, -34); ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#3E2A16'
    ctx.beginPath(); ctx.moveTo(-7, -34); ctx.lineTo(0, -50); ctx.lineTo(7, -34); ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#5A3820'; ctx.fillRect(-8, -18, 16, 18)
    drawChimneyStack(ctx, -20, -58)
  }
  const drawTower = (ctx, color) => {
    ctx.fillStyle = color; ctx.fillRect(-18, -56, 36, 56)
    ctx.fillStyle = '#7A4327'
    ctx.beginPath(); ctx.moveTo(-22, -56); ctx.lineTo(0, -76); ctx.lineTo(22, -56); ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#5A3820'; ctx.fillRect(-7, -18, 14, 18)
    ctx.fillStyle = '#EAF9FF'
    ctx.fillRect(-12, -46, 8, 8); ctx.fillRect(4, -46, 8, 8); ctx.fillRect(-4, -30, 8, 8)
    drawChimneyStack(ctx, 12, -70)
  }
  const drawDomeHut = (ctx, color) => {
    ctx.fillStyle = color; ctx.fillRect(-20, -30, 40, 30)
    ctx.beginPath(); ctx.arc(0, -30, 20, Math.PI, 0); ctx.fill()
    ctx.fillStyle = '#5A3820'; ctx.fillRect(-8, -18, 16, 18)
    ctx.fillStyle = '#EAF9FF'
    ctx.beginPath(); ctx.arc(11, -24, 5, 0, Math.PI * 2); ctx.fill()
    drawChimneyStack(ctx, -14, -44)
  }
  const drawChimneySmoke = useCallback((ctx, houseX, groundY, archetype, index) => {
    const chimneyOffsets = [[16, -58], [-20, -58], [12, -70], [-14, -44]]
    const [ox, oy] = chimneyOffsets[archetype]
    const baseX = houseX + ox, baseY = groundY + oy
    const animFrame = animFrameCountRef.current
    for (let p = 0; p < 3; p++) {
      const t = ((animFrame * 0.6 + p * 20 + index * 7) % 60) / 60
      const puffX = baseX + Math.sin((animFrame * 0.05) + p + index) * 4
      const puffY = baseY - t * 26
      const alpha = 0.35 * (1 - t)
      const r = 3 + t * 5
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.fillStyle = '#FFF8EC'
      ctx.beginPath(); ctx.arc(puffX, puffY, r, 0, Math.PI * 2); ctx.fill()
      ctx.restore()
    }
  }, [])
  const drawShrub = (ctx, x, groundY, seed) => {
    const wobble = Math.sin(seed * 3.7) * 6
    ctx.save()
    ctx.translate(x + wobble, groundY)
    ctx.fillStyle = '#3B7A45'
    ctx.beginPath()
    ctx.arc(0, -8, 7, 0, Math.PI * 2); ctx.arc(-6, -4, 5, 0, Math.PI * 2); ctx.arc(6, -4, 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  const drawHouse = useCallback((ctx, x, groundY, color, pulse, index) => {
    const scale = 1 + pulse * 0.2
    const archetype = index % 4
    ctx.save()
    ctx.translate(x, groundY)
    ctx.scale(scale, scale)
    if (archetype === 0) drawCottage(ctx, color)
    else if (archetype === 1) drawCabin(ctx, color)
    else if (archetype === 2) drawTower(ctx, color)
    else drawDomeHut(ctx, color)
    drawFlowerBox(ctx, index)
    ctx.restore()
    if (!reduceMotionRef.current) drawChimneySmoke(ctx, x, groundY, archetype, index)
  }, [drawChimneySmoke])

  const drawVillage = useCallback((ctx) => {
    const numHouses = wordListRef.current.length
    const groundY = s.H * 0.78
    const spacing = Math.min(120, (s.W - 80) / numHouses)
    const startX = s.W / 2 - (spacing * (numHouses - 1)) / 2

    ctx.save()
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    for (let px = startX - spacing * 0.5; px < startX + spacing * (numHouses - 0.5); px += 14) {
      const wob = Math.sin(px * 0.15) * 3
      ctx.beginPath(); ctx.arc(px, groundY + 14 + wob, 3, 0, Math.PI * 2); ctx.fill()
    }
    ctx.restore()

    for (let i = 0; i < numHouses; i++) {
      const x = startX + i * spacing
      const built = i < s.housesBuilt
      const pulse = s.houseGrowPulse[i]
      drawShrub(ctx, x - spacing / 2 + 14, groundY, i)
      if (!built && pulse <= 0.01) {
        ctx.save()
        ctx.globalAlpha = 0.2
        ctx.strokeStyle = '#2E4A2E'; ctx.lineWidth = 2
        ctx.strokeRect(x - 22, groundY - 40, 44, 40)
        ctx.restore()
        continue
      }
      drawHouse(ctx, x, groundY, HOUSE_COLORS[i % HOUSE_COLORS.length], pulse, i)
    }
  }, [s, drawHouse])

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const numHouses = wordListRef.current.length
    const progress = numHouses > 0 ? s.housesBuilt / numHouses : 0
    const grad = ctx.createLinearGradient(0, 0, 0, s.H)
    grad.addColorStop(0, lerpColor('#342B5C', '#8FD3F4', progress))
    grad.addColorStop(1, lerpColor('#C97B84', '#FFE7B8', progress))
    ctx.fillStyle = grad; ctx.fillRect(0, 0, s.W, s.H * 0.75)
    drawHills(ctx, progress)
    ctx.fillStyle = lerpColor('#3B7A45', '#4F9E5C', progress)
    ctx.fillRect(0, s.H * 0.72, s.W, s.H * 0.28)
    drawSun(ctx, progress)
    drawClouds(ctx)
    drawParticles(ctx)
    drawVillage(ctx)
  }, [s, drawHills, drawSun, drawClouds, drawParticles, drawVillage])

  const spawnCelebrationParticles = useCallback(() => {
    const count = reduceMotionRef.current ? 16 : 50
    for (let i = 0; i < count; i++) {
      s.particles.push({ x: s.W / 2, y: s.H * 0.6, vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6 - 2, life: 1, color: ['#FFD166', '#FF6B6B', '#6FBF73', '#FFF8EC'][i % 4], r: Math.random() * 3 + 2 })
    }
  }, [s])

  // main animation loop
  useEffect(() => {
    if (phase !== 'playing') return
    let active = true
    function loop() {
      if (!active) return
      animFrameCountRef.current++
      for (let i = 0; i < s.houseGrowPulse.length; i++) {
        if (s.houseGrowPulse[i] > 0) s.houseGrowPulse[i] = Math.max(0, s.houseGrowPulse[i] - 0.02)
      }
      render()
      if (!s.hasFinished) rafIdRef.current = requestAnimationFrame(loop)
    }
    rafIdRef.current = requestAnimationFrame(loop)
    return () => { active = false; if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current) }
  }, [phase, render, s])

  useEffect(() => {
    window.addEventListener('resize', resizeCanvas)
    return () => window.removeEventListener('resize', resizeCanvas)
  }, [resizeCanvas])

  // ---- mic + VAD + recording cycle ----
  const startMeterLoop = useCallback(() => {
    const analyser = analyserRef.current
    if (!analyser) return
    const data = new Float32Array(analyser.fftSize)
    function tick() {
      if (!analyserRef.current) return
      analyserRef.current.getFloatTimeDomainData(data)
      let sum = 0
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i]
      const rms = Math.sqrt(sum / data.length)
      s.currentRms = rms
      if (meterFillRef.current) {
        const pct = Math.min(100, rms * 600)
        meterFillRef.current.style.width = pct + '%'
        meterFillRef.current.style.background = pct > 60 ? '#FF6B6B' : pct > 8 ? '#6FBF73' : '#B0B0B0'
      }
      requestAnimationFrame(tick)
    }
    tick()
  }, [s])

  const initMic = useCallback(async () => {
    if (mediaStreamRef.current) return true
    try {
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      console.error('Microphone access failed:', err)
      setMicErrorDetail('Please allow microphone access so your village can hear your words.')
      setPhase('micError')
      return false
    }
    const source = audioCtxRef.current.createMediaStreamSource(mediaStreamRef.current)
    const analyser = audioCtxRef.current.createAnalyser()
    analyser.fftSize = 1024
    source.connect(analyser)
    analyserRef.current = analyser
    startMeterLoop()
    return true
  }, [startMeterLoop])

  const setTargetWordIndex = useCallback((index) => {
    s.currentWordIndex = index
    setTargetWord(wordListRef.current[index])
  }, [s])

  const showRecentAttempt = (transcript, matched) => {
    setRecentAttempt({ text: matched ? `✅ Heard "${transcript}" — great job!` : `Heard "${transcript}" — try again!`, visible: true })
    setTimeout(() => setRecentAttempt(r => ({ ...r, visible: false })), 1800)
  }

  const buildHouse = (index) => { s.houseGrowPulse[index] = 1 }

  const onVillageComplete = useCallback(() => {
    playSuccessChime()
    spawnCelebrationParticles()
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop() } catch { /* already stopped */ }
    }
    setTimeout(() => setFinished(true), 500)
  }, [playSuccessChime, spawnCelebrationParticles])

  const handleAttempt = useCallback(async (transcript, confidence) => {
    s.attemptNumber++
    const target = wordListRef.current[s.currentWordIndex]
    let result
    try {
      result = await scoreWord(transcript, target, confidence)
    } catch (err) {
      console.warn('Backend word-scoring unavailable, using local match:', err)
      result = localWordMatch(transcript, target, confidence)
    }
    const passedThreshold = result.match_score >= s.matchThreshold

    try {
      await logEvent({
        level_id: LEVEL_ID,
        attempt_number: s.attemptNumber,
        score: result.match_score,
        is_valid_attempt: result.is_valid_attempt,
      })
    } catch (err) {
      console.warn('Backend event logging unavailable:', err)
    }

    // Pacing only — never sent to the backend as score.
    getAgentDecision(LEVEL_ID, AGENT_POLICY)
      .then(decision => {
        s.matchThreshold = WORD_DIFFICULTY_AGENT.apply(s.matchThreshold, decision)
        if (decision.message) setDifficultyMsg(decision.message)
      })
      .catch(() => {
        const decision = WORD_DIFFICULTY_AGENT.decide(result.match_score)
        s.matchThreshold = WORD_DIFFICULTY_AGENT.apply(s.matchThreshold, decision)
        setDifficultyMsg(decision.message)
      })

    showRecentAttempt(transcript, passedThreshold)

    const numHouses = wordListRef.current.length
    if (result.is_valid_attempt && passedThreshold && s.housesBuilt < numHouses) {
      buildHouse(s.housesBuilt)
      s.housesBuilt++
      setHousesBuilt(s.housesBuilt)
      playBuildSound()
      if (s.housesBuilt < numHouses) setTargetWordIndex(s.housesBuilt)
    }

    if (s.housesBuilt >= numHouses && !s.hasFinished) {
      s.hasFinished = true
      onVillageComplete()
      return
    }

    setListeningLabel('🎙️ Listening...')
    setTimeout(() => startListenCycle(), 150)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, playBuildSound, onVillageComplete, setTargetWordIndex])

  const startListenCycle = useCallback(() => {
    if (s.hasFinished || s.listening || !mediaStreamRef.current) return
    s.listening = true
    setListeningLabel('🎙️ Listening...')

    const chunks = []
    let recorder
    try {
      recorder = new MediaRecorder(mediaStreamRef.current, { mimeType: 'audio/webm;codecs=opus' })
    } catch (err) {
      console.error('MediaRecorder unavailable:', err)
      s.listening = false
      setListeningLabel("😕 Voice input isn't available in this browser.")
      return
    }
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }

    const startTime = performance.now()
    let speechStarted = false
    let lastAboveThreshold = startTime

    const vadInterval = setInterval(() => {
      const now = performance.now()
      if (s.currentRms > RMS_SPEECH_THRESHOLD) { speechStarted = true; lastAboveThreshold = now }
      const elapsed = now - startTime
      if (elapsed > MAX_RECORD_MS) { finish(); return }
      if (speechStarted && (now - lastAboveThreshold) > SILENCE_MS && elapsed > MIN_RECORD_MS) finish()
    }, 100)
    vadIntervalRef.current = vadInterval

    function finish() {
      clearInterval(vadInterval)
      if (recorder.state !== 'inactive') recorder.stop()
    }

    recorder.onstop = async () => {
      clearInterval(vadInterval)
      s.listening = false
      if (s.hasFinished) return
      if (!speechStarted || chunks.length === 0) {
        setListeningLabel('🔁 Trying again...')
        setTimeout(() => { if (!s.hasFinished) startListenCycle() }, 150)
        return
      }
      setListeningLabel('⏳ Checking...')
      const blob = new Blob(chunks, { type: 'audio/webm;codecs=opus' })
      let transcript = null, confidence = 0
      try {
        const res = await transcribeAudio(blob)
        transcript = res.transcript; confidence = res.confidence
      } catch (err) {
        console.warn('Backend transcription unavailable:', err)
      }
      if (transcript === null) {
        setListeningLabel('🔁 Having trouble connecting — trying again...')
        setTimeout(() => { if (!s.hasFinished) startListenCycle() }, 1500)
        return
      }
      await handleAttempt(transcript, confidence)
    }

    recorder.start()
    mediaRecorderRef.current = recorder
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, handleAttempt])

  const startGame = useCallback(async () => {
    const customList = buildWordListFromInput(customInput)
    const finalList = customList || sampleWordList(ROUND_SIZE)
    setWordList(finalList)
    wordListRef.current = finalList
    s.houseGrowPulse = new Array(finalList.length).fill(0)

    if (!audioCtxRef.current) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext
      audioCtxRef.current = new AudioContextClass()
    }
    const micOk = await initMic()
    if (!micOk) return

    setPhase('playing')
    setTargetWordIndex(0)
    resizeCanvas()
    setTimeout(() => startListenCycle(), 0)
  }, [customInput, initMic, s, setTargetWordIndex, resizeCanvas, startListenCycle])

  const playAgain = () => {
    setFinished(false)
    s.housesBuilt = 0
    s.houseGrowPulse = new Array(wordListRef.current.length).fill(0)
    s.hasFinished = false
    s.particles = []
    setHousesBuilt(0)
    setTargetWordIndex(0)
    setTimeout(() => startListenCycle(), 0)
  }

  useEffect(() => {
    return () => {
      if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach(t => t.stop())
      if (vadIntervalRef.current) clearInterval(vadIntervalRef.current)
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current)
    }
  }, [])

  const numHouses = wordList.length

  return (
    <div className="fixed inset-0 overflow-hidden select-none" style={{ fontFamily: "'Quicksand', sans-serif", background: '#3B7A45' }}>
      <canvas ref={canvasRef} className="fixed inset-0 w-full h-full block" aria-hidden="true" />

      <button
        onClick={() => navigate('/play/chime')}
        className="fixed top-4 left-4 z-20 flex items-center gap-2 text-white/70 hover:text-white text-sm bg-black/15 backdrop-blur-sm rounded-full px-4 py-2 transition-colors"
      >
        <ArrowLeft size={16} /> Back to Chime
      </button>

      {phase === 'start' && (
        <div className="fixed inset-0 z-10 flex flex-col items-center justify-center text-center px-6">
          <div className="bg-white/95 rounded-[28px_28px_40px_28px] p-9 max-w-md w-full shadow-2xl" style={{ color: '#2E4A2E' }}>
            <div className="text-6xl mb-3">🏘️</div>
            <h1 className="villb-title text-4xl font-extrabold mb-2">Village Builder</h1>
            <p className="font-semibold mb-7 leading-relaxed flex items-center justify-center gap-2 flex-wrap" style={{ color: '#B5502E' }}>
              Say the word to bring a new house to life — watch your village wake up as you go!
              <button onClick={replayStartInstruction} style={{ opacity: 0.6, background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', display: 'inline-flex' }} aria-label="Hear this again">
                <Volume2 size={18} />
              </button>
            </p>
            <div className="text-left mb-5">
              <label className="block font-bold text-sm mb-1.5">Custom words (optional)</label>
              <input
                type="text"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                placeholder="e.g. mango, elephant, umbrella"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck="false"
                className="w-full font-bold text-sm rounded-xl px-3.5 py-2.5 border-2"
                style={{ borderColor: 'rgba(0,0,0,0.15)', color: '#2E4A2E' }}
              />
              <p className="text-xs mt-1" style={{ color: '#7A5C2E' }}>Comma separated. Leave blank to use the default words.</p>
            </div>
            <button onClick={startGame} className="villb-btn">Let's Play!</button>
          </div>
        </div>
      )}

      {phase === 'micError' && (
        <div className="fixed inset-0 z-10 flex flex-col items-center justify-center text-center px-6">
          <div className="bg-white/95 rounded-[28px_28px_40px_28px] p-9 max-w-md w-full shadow-2xl" style={{ color: '#2E4A2E' }}>
            <div className="text-6xl mb-3">🎤</div>
            <h1 className="villb-title text-2xl font-extrabold mb-2">We need to hear you!</h1>
            <p className="text-sm mb-5 leading-relaxed" style={{ color: '#C94C4C' }}>{micErrorDetail}</p>
            <button onClick={startGame} className="villb-btn">Try Again</button>
          </div>
        </div>
      )}

      {phase === 'playing' && (
        <>
          <div className="fixed top-0 left-0 right-0 z-20 flex justify-between items-start px-5 pt-16 md:pt-5">
            <div>
              <div className="bg-white/92 rounded-3xl px-8 py-3.5 flex items-center gap-2 shadow-lg">
                <span className="villb-title text-2xl md:text-3xl" style={{ color: '#2E4A2E' }}>{targetWord}</span>
                <button onClick={speakTargetWord} className="villb-icon-btn" style={{ width: 36, height: 36, fontSize: '1.1rem' }} aria-label="Hear the word">
                  <Volume2 size={16} />
                </button>
              </div>
              <div className="villb-listening mt-2 inline-block">{listeningLabel}</div>
              <div className="mt-2 w-36 h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.15)' }}>
                <div ref={meterFillRef} className="h-full rounded-full" style={{ width: '0%', background: '#6FBF73', transition: 'width 0.06s linear, background 0.1s linear' }} />
              </div>
              <p className="text-white/85 text-xs font-bold mt-2">🏘️ {housesBuilt} / {numHouses} houses built</p>
            </div>
            <button onClick={() => setSettingsOpen(v => !v)} className="villb-icon-btn" aria-label="Settings">
              <Settings size={18} />
            </button>
          </div>

          {settingsOpen && (
            <div className="fixed z-30 bg-white/92 rounded-2xl px-5 py-4 w-60 text-left" style={{ top: 150, right: 18, color: '#2E4A2E' }}>
              <h3 className="villb-title text-base mb-3">Settings</h3>
              <div className="flex items-center justify-between font-bold text-sm mb-3">
                <span>Reduce motion</span>
                <input type="checkbox" checked={reduceMotion} onChange={(e) => setReduceMotion(e.target.checked)} />
              </div>
              <div className="flex items-center justify-between font-bold text-sm">
                <span>Mute sounds</span>
                <input type="checkbox" checked={muted} onChange={(e) => setMuted(e.target.checked)} />
              </div>
            </div>
          )}

          {recentAttempt.visible && (
            <div className="fixed bottom-7 left-1/2 -translate-x-1/2 z-20 bg-white/92 rounded-full px-6 py-2.5 font-bold text-sm" style={{ color: '#2E4A2E' }}>
              {recentAttempt.text}
            </div>
          )}

          {difficultyMsg && (
            <p className="fixed bottom-2 left-1/2 -translate-x-1/2 z-20 text-white/50 text-xs">{difficultyMsg}</p>
          )}

          {finished && (
            <div className="fixed inset-0 z-40 flex items-center justify-center" style={{ background: 'rgba(79, 158, 84, 0.4)' }}>
              <div className="bg-white/95 rounded-[28px_28px_40px_28px] p-9 max-w-md w-full text-center shadow-2xl" style={{ color: '#2E4A2E' }}>
                <div className="text-6xl mb-3">🎉</div>
                <h1 className="villb-title text-3xl mb-2">Village complete!</h1>
                <p className="font-semibold mb-2" style={{ color: '#B5502E' }}>You built every house!</p>
                <p className="font-semibold mb-6" style={{ color: '#2E4A2E' }}>You've finished every Chime game! 🌟</p>
                <button onClick={() => navigate('/play/chime')} className="villb-btn">Back to Chime</button>
                <button onClick={playAgain} className="villb-btn" style={{ marginTop: '10px', opacity: 0.7 }}>Build Again!</button>
              </div>
            </div>
          )}
        </>
      )}

      <style>{`
        .villb-title { font-family: 'Baloo 2', sans-serif; font-weight: 800; }
        .villb-btn {
          font-family: 'Baloo 2', sans-serif; font-weight: 700; font-size: 1.3rem;
          border: none; border-radius: 999px; padding: 16px 40px; cursor: pointer;
          color: #2E4A2E; background: #D9713C;
          box-shadow: 0 6px 0 #A8502A, 0 10px 24px rgba(0,0,0,0.15);
          transition: transform 0.1s ease, box-shadow 0.1s ease;
        }
        .villb-btn:hover { transform: translateY(-2px); }
        .villb-btn:active { transform: translateY(3px); box-shadow: 0 3px 0 #A8502A, 0 6px 14px rgba(0,0,0,0.15); }
        .villb-icon-btn {
          background: rgba(255,255,255,0.85); border: 1px solid rgba(0,0,0,0.08); border-radius: 999px;
          width: 46px; height: 46px; display: flex; align-items: center; justify-content: center;
          color: #2E4A2E; padding: 0;
        }
        .villb-listening {
          font-family: 'Baloo 2', sans-serif; font-weight: 700; font-size: 0.9rem;
          background: rgba(255,255,255,0.85); border-radius: 999px; padding: 5px 16px; color: #4F9E54;
        }
        @media (prefers-reduced-motion: reduce) { .villb-btn:hover { transform: none; } }
      `}</style>
    </div>
  )
}
