import { useEffect, useRef, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, CameraOff, RefreshCw, Volume2, Lightbulb } from 'lucide-react'
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import { SOUNDS, SHAPE_TARGETS } from './data/soundTaxonomy.js'
import { getPhonemeCue } from './data/phonemeCues.js'
import { computeMouthMetrics, scoreAgainstTarget } from './lib/mouthMetrics.js'
import { drawMouthOutline, drawFaceFilter } from './lib/faceOverlay.js'
import { emaUpdateObject, createTierStabilizer } from './lib/signalSmoothing.js'
import { playChime, playFanfare, speakSound } from './lib/sound.js'
import { createGameSession, logAttempt, endGameSession, getGameSettings } from './lib/api.js'
import { useEndSessionOnLeave } from './lib/useEndSessionOnLeave.js'
import { useAuth } from '../context/AuthContext'
import CelebrationOverlay from './components/CelebrationOverlay.jsx'
import CharacterFilterPicker, { FILTERS } from './components/CharacterFilterPicker.jsx'
import ProgressRing from './components/ProgressRing.jsx'
import MouthShapeGuide from './components/MouthShapeGuide.jsx'

const DEFAULT_ROUND_SIZE = 8
const HOLD_MS = 3000
const CALIB_MS = 1100
// How long a kid can sit outside the green tier on one sound before we
// offer a concrete "here's what to try" tip instead of just the passive
// mouth-shape outline. Long enough that it doesn't fire on kids who are
// just taking a breath between tries, short enough that it shows up
// before frustration does.
const STRUGGLE_MS = 7000
// Cap on how many STRUGGLE_MS windows we let a kid sit on one sound
// before moving on for them. Mirrors LipSyncHero's existing 3-tries-then-
// advance pattern (MAX_ATTEMPTS there) — without this, a genuinely
// difficult sound could leave a kid stuck indefinitely with no forward
// progress and no path back to it later.
const MAX_ATTEMPTS = 3
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'

// Takes the round size as a parameter rather than closing over a module-level
// constant, since a therapist can now set a per-patient round size (fetched
// async after mount) — this needs to be re-callable with whatever size is
// current at the time, not a fixed value baked in at module load.
function pickRound(size) {
  const shuffled = [...SOUNDS].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, size)
}

const TIER_STYLES = {
  green: { ring: '#2FB8A6', text: 'Great match — hold it!' },
  yellow: { ring: '#F4B942', text: 'Getting close…' },
  red: { ring: '#F0604A', text: 'Try adjusting your mouth' },
}

export default function MirrorMirror() {
  const { patient } = useAuth()
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const landmarkerRef = useRef(null)
  const rafRef = useRef(null)
  const holdStartRef = useRef(null)
  const smoothedRef = useRef(null)
  const tierStabilizerRef = useRef(createTierStabilizer(4))
  const sessionIdRef = useRef(null)
  useEndSessionOnLeave(sessionIdRef)

  const [status, setStatus] = useState('loading') // loading | ready | denied | error
  const [roundSize, setRoundSize] = useState(DEFAULT_ROUND_SIZE)
  const [round, setRound] = useState(() => pickRound(DEFAULT_ROUND_SIZE))
  const [roundIndex, setRoundIndex] = useState(0)
  const [tier, setTier] = useState('red')
  const [holdProgress, setHoldProgress] = useState(0)
  const [stars, setStars] = useState(0)
  const [filter, setFilter] = useState('none')
  const [complete, setComplete] = useState(false)
  const [celebrate, setCelebrate] = useState(false)
  const [baselineSpread, setBaselineSpread] = useState(null)
  const [calibProgress, setCalibProgress] = useState(0)
  const calibSamplesRef = useRef([])
  const calibStartRef = useRef(null)
  const soundStartRef = useRef(null)
  const [showCue, setShowCue] = useState(false)

  const current = round[roundIndex]
  const target = current ? SHAPE_TARGETS[current.shape] : null

  // Fetch a therapist-set round size, if one exists, and rebuild the round
  // to match. Runs once patient identity is available; falls back silently
  // to DEFAULT_ROUND_SIZE (already in state) on any error or if unset.
  useEffect(() => {
    if (!patient?.patient_id) return
    let cancelled = false
    getGameSettings(patient.patient_id, 'mirror_mirror')
      .then((settings) => {
        if (cancelled || !settings.round_size) return
        setRoundSize(settings.round_size)
        setRound(pickRound(settings.round_size))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [patient?.patient_id])

  // Speak the target sound aloud each time a new round item comes up —
  // same pattern LipSyncHero already established (speakSound on note
  // change, gated on calibration being done so it doesn't talk over the
  // "relax your mouth" setup step).
  useEffect(() => {
    if (!baselineSpread || complete || !current) return
    speakSound(current.label)
  }, [current, baselineSpread, complete])

  const advance = useCallback((opts = {}) => {
    const { skipped = false } = opts
    const isLast = roundIndex + 1 >= roundSize
    if (!skipped) setStars((s) => Math.min(roundSize, s + 1))
    holdStartRef.current = null
    setHoldProgress(0)
    smoothedRef.current = null
    tierStabilizerRef.current.reset()
    soundStartRef.current = null
    setShowCue(false)

    if (isLast) {
      playFanfare()
      setComplete(true)
      if (sessionIdRef.current) endGameSession(sessionIdRef.current).catch(() => {})
    } else {
      if (!skipped) playChime()
      setCelebrate(!skipped)
      setRoundIndex((i) => i + 1)
    }
  }, [roundIndex, roundSize])

  // Clear the celebration overlay a moment after it appears
  useEffect(() => {
    if (!celebrate) return
    const t = setTimeout(() => setCelebrate(false), 1100)
    return () => clearTimeout(t)
  }, [celebrate])

  // Set up camera + face landmarker
  useEffect(() => {
    let stream
    let cancelled = false

    async function setup() {
      try {
        const fileset = await FilesetResolver.forVisionTasks(WASM_URL)
        landmarkerRef.current = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numFaces: 1,
        })

        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 360 } })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
          if (canvasRef.current) {
            canvasRef.current.width = videoRef.current.videoWidth
            canvasRef.current.height = videoRef.current.videoHeight
          }
        }
        setStatus('ready')
        createGameSession('mirror_mirror')
          .then((s) => {
            sessionIdRef.current = s.id
          })
          .catch(() => {
            // Backend not reachable — the game still works locally, it just
            // won't feed the dashboard this session's data.
          })
      } catch (err) {
        console.error(err)
        setStatus(err?.name === 'NotAllowedError' ? 'denied' : 'error')
      }
    }

    setup()

    return () => {
      cancelled = true
      if (stream) stream.getTracks().forEach((t) => t.stop())
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      landmarkerRef.current?.close?.()
    }
  }, [])

  // Detection loop
  useEffect(() => {
    if (status !== 'ready') return

    function loop() {
      const video = videoRef.current
      const landmarker = landmarkerRef.current
      const canvas = canvasRef.current
      if (video && landmarker && video.readyState >= 2) {
        const result = landmarker.detectForVideo(video, performance.now())
        const landmarks = result?.faceLandmarks?.[0]
        const metrics = computeMouthMetrics(landmarks)

        let frameTier = 'red'

        if (!baselineSpread) {
          // Calibration phase: sample resting mouth width before scoring
          // against any target, since face proportions vary enough between
          // players that a fixed cutoff either demands an exaggerated
          // shape from some players or barely registers for others.
          if (metrics) {
            if (!calibStartRef.current) calibStartRef.current = performance.now()
            calibSamplesRef.current.push(metrics.spread)
            const elapsed = performance.now() - calibStartRef.current
            setCalibProgress(Math.min(1, elapsed / CALIB_MS))
            if (elapsed >= CALIB_MS && calibSamplesRef.current.length >= 6) {
              const sorted = [...calibSamplesRef.current].sort((a, b) => a - b)
              setBaselineSpread(sorted[Math.floor(sorted.length / 2)])
            }
          }
        } else if (metrics && target) {
          if (!soundStartRef.current) soundStartRef.current = performance.now()
          smoothedRef.current = emaUpdateObject(smoothedRef.current, metrics, ['openness', 'spread'], 0.3)
          const { score, tier: rawTier } = scoreAgainstTarget(smoothedRef.current, target, baselineSpread)
          const t = tierStabilizerRef.current.update(rawTier)
          frameTier = t
          setTier(t)

          // Same shape not landing after a while — surface a concrete,
          // hands-on tip instead of leaving them stuck on the passive
          // outline alone.
          if (t !== 'green' && performance.now() - soundStartRef.current >= STRUGGLE_MS) {
            setShowCue(true)
          }

          // Still not landing after MAX_ATTEMPTS full struggle windows —
          // log it honestly as missed (not a silent skip) and move on,
          // rather than leaving a kid stuck on one sound with no forward
          // progress for the rest of the session.
          if (t !== 'green' && performance.now() - soundStartRef.current >= STRUGGLE_MS * MAX_ATTEMPTS) {
            if (sessionIdRef.current && current) {
              logAttempt(sessionIdRef.current, {
                sound_id: current.id,
                place: current.place,
                manner: current.manner,
                voicing: current.voicing,
                outcome: 'missed',
                score: 0,
              }).catch(() => {})
            }
            advance({ skipped: true })
          }

          if (t === 'green') {
            setShowCue(false)
            if (!holdStartRef.current) holdStartRef.current = performance.now()
            const elapsed = performance.now() - holdStartRef.current
            setHoldProgress(Math.min(1, elapsed / HOLD_MS))
            if (elapsed >= HOLD_MS) {
              if (sessionIdRef.current && current) {
                logAttempt(sessionIdRef.current, {
                  sound_id: current.id,
                  place: current.place,
                  manner: current.manner,
                  voicing: current.voicing,
                  outcome: 'passed',
                  score,
                }).catch(() => {})
              }
              advance()
            }
          } else {
            holdStartRef.current = null
            setHoldProgress(0)
          }
        }

        if (canvas) {
          const ctx = canvas.getContext('2d')
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          if (landmarks) {
            drawFaceFilter(ctx, landmarks, canvas.width, canvas.height, filter)
            drawMouthOutline(
              ctx,
              landmarks,
              canvas.width,
              canvas.height,
              baselineSpread ? TIER_STYLES[frameTier].ring : '#2FB8A6',
            )
          }
        }
      }
      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => rafRef.current && cancelAnimationFrame(rafRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, target, advance, filter, baselineSpread])

  function restart() {
    setRound(pickRound(roundSize))
    setRoundIndex(0)
    setStars(0)
    setComplete(false)
    setTier('red')
    setHoldProgress(0)
    holdStartRef.current = null
    smoothedRef.current = null
    tierStabilizerRef.current.reset()
    setCelebrate(false)
    soundStartRef.current = null
    setShowCue(false)
  }

  function recalibrate() {
    setBaselineSpread(null)
    setCalibProgress(0)
    calibSamplesRef.current = []
    calibStartRef.current = null
    holdStartRef.current = null
    setHoldProgress(0)
    smoothedRef.current = null
    tierStabilizerRef.current.reset()
    soundStartRef.current = null
    setShowCue(false)
  }

  const activeFilter = FILTERS.find((f) => f.id === filter)
  const tierStyle = TIER_STYLES[tier]

  return (
    <div className="bg-ink min-h-[calc(100vh-4rem)]">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <Link to="/play/vaakmirror" className="inline-flex items-center gap-1.5 text-paper/50 hover:text-paper text-sm mb-6">
          <ArrowLeft size={15} /> All games
        </Link>

        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-mint mb-1">Game 1</p>
            <h1 className="font-display text-3xl font-bold text-paper">Mirror Mirror</h1>
          </div>
          <ProgressRing stars={stars} total={roundSize} />
        </div>

        <div className="grid md:grid-cols-[3fr,2fr] gap-6 items-start">
          {/* Camera panel */}
          <div className="relative">
            <div
              className="relative aspect-[4/3] rounded-3xl overflow-hidden bg-ink-light border-4 transition-[border-color,box-shadow] duration-200"
              style={{
                borderColor: activeFilter?.frameColor ?? 'rgba(255,255,255,0.12)',
                boxShadow:
                  status === 'ready'
                    ? `0 0 0 5px ${tierStyle.ring}66, 0 0 28px 6px ${tierStyle.ring}40`
                    : undefined,
              }}
            >
              <video
                ref={videoRef}
                className="w-full h-full object-cover scale-x-[-1]"
                playsInline
                muted
              />
              <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full object-cover scale-x-[-1] pointer-events-none"
              />

              {status !== 'ready' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ink-light text-paper/70 px-8 text-center">
                  {status === 'loading' && (
                    <>
                      <RefreshCw className="animate-spin" size={22} />
                      <p className="text-sm">Setting up your camera…</p>
                    </>
                  )}
                  {status === 'denied' && (
                    <>
                      <CameraOff size={22} />
                      <p className="text-sm">
                        Camera access was denied. Enable it in your browser settings to
                        play Mirror Mirror.
                      </p>
                    </>
                  )}
                  {status === 'error' && (
                    <>
                      <CameraOff size={22} />
                      <p className="text-sm">
                        Couldn't start the camera or face-tracking model. Check your
                        connection and reload.
                      </p>
                    </>
                  )}
                </div>
              )}

              {/* Progress bar — calibration first, then hold-to-pass */}
              {status === 'ready' && (
                <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/30">
                  <div
                    className="h-full transition-[width] duration-75"
                    style={{
                      width: `${(baselineSpread ? holdProgress : calibProgress) * 100}%`,
                      backgroundColor: baselineSpread ? tierStyle.ring : '#2FB8A6',
                    }}
                  />
                </div>
              )}
              <CelebrationOverlay show={celebrate} />
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <CharacterFilterPicker value={filter} onChange={setFilter} />
              {status === 'ready' && baselineSpread && (
                <button
                  onClick={recalibrate}
                  className="text-xs text-paper/40 hover:text-paper/70 shrink-0 flex items-center gap-1"
                  title="Redo calibration"
                >
                  <RefreshCw size={12} /> Recalibrate
                </button>
              )}
            </div>
            {status === 'ready' && (
              <p className="mt-2 text-sm font-medium" style={{ color: baselineSpread ? tierStyle.ring : '#2FB8A6' }}>
                {baselineSpread ? tierStyle.text : 'Calibrating — relax your mouth for a second…'}
              </p>
            )}
          </div>

          {/* Target panel */}
          <div className="rounded-3xl bg-ink-light border border-white/10 p-8">
            {status === 'ready' && !baselineSpread ? (
              <div className="py-6">
                <p className="font-mono text-xs uppercase tracking-widest text-mint mb-3">One-time setup</p>
                <p className="font-display text-xl font-bold text-paper mb-3">
                  Getting your resting mouth shape…
                </p>
                <p className="text-paper/55 text-sm leading-relaxed mb-6">
                  Just relax your face for a second — this lets the game match
                  shapes to your own face instead of a generic one, so you don't
                  have to over-exaggerate any shape to pass.
                </p>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-mint transition-[width] duration-75"
                    style={{ width: `${calibProgress * 100}%` }}
                  />
                </div>
              </div>
            ) : !complete && current ? (
              <>
                <p className="font-mono text-xs uppercase tracking-widest text-paper/40 mb-3">
                  Sound {roundIndex + 1} of {roundSize}
                </p>
                <div className="flex items-center gap-5 mb-6">
                  <div className="w-36 h-36 shrink-0 rounded-2xl bg-ink border border-white/10 flex items-center justify-center p-4">
                    <MouthShapeGuide shape={current.shape} manner={current.manner} tier={tier} className="w-full h-full" />
                  </div>
                  <div className="w-16 h-16 shrink-0 rounded-2xl bg-coral/15 border border-coral/30 flex items-center justify-center">
                    <span className="font-display text-2xl font-bold text-coral">{current.label}</span>
                  </div>
                </div>
                <p className="text-paper text-lg font-medium mb-2 flex items-center gap-2">
                  {target.label}
                  <button
                    onClick={() => speakSound(current.label)}
                    className="text-paper/40 hover:text-coral transition-colors"
                    title="Hear it again"
                  >
                    <Volume2 size={16} />
                  </button>
                </p>
                <p className="text-paper/45 text-sm leading-relaxed mb-6">
                  {current.place} &middot; {current.manner} &middot; {current.voicing}
                </p>
                <div className="h-px bg-white/10 mb-6" />
                <p className="text-paper/50 text-xs leading-relaxed">
                  Hold the green outline for two seconds to move to the next sound. No
                  score is shown — just keep going at your own pace.
                </p>

                {showCue && (
                  <div className="mt-5 rounded-2xl bg-mint/10 border border-mint/25 p-4 flex gap-3">
                    <Lightbulb size={18} className="text-mint shrink-0 mt-0.5" />
                    <div>
                      <p className="text-mint text-xs font-semibold uppercase tracking-wide mb-1">
                        Try this
                      </p>
                      <p className="text-paper/80 text-sm leading-relaxed">
                        {getPhonemeCue(current.id).tip}
                      </p>
                      <p className="text-paper/40 text-xs mt-1.5">
                        Helpful tool: {getPhonemeCue(current.id).tool}
                      </p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-6">
                <p className="font-display text-2xl font-bold text-paper mb-2">Round complete! ✨</p>
                <p className="text-paper/50 text-sm mb-6">You matched all {roundSize} shapes.</p>
                <ProgressRing stars={stars} total={roundSize} />
                <button
                  onClick={restart}
                  className="mt-8 px-6 py-3 rounded-full bg-coral text-paper font-semibold hover:bg-coral-dark transition-colors inline-flex items-center gap-2"
                >
                  <RefreshCw size={15} /> Play again
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
