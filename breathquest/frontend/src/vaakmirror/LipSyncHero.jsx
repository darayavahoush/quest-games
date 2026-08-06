import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, CameraOff, RefreshCw, Volume2, Lightbulb } from 'lucide-react'
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import { SOUNDS, SHAPE_TARGETS } from './data/soundTaxonomy.js'
import { getPhonemeCue } from './data/phonemeCues.js'
import { computeMouthMetrics, scoreAgainstTarget } from './lib/mouthMetrics.js'
import { drawMouthOutline, drawFaceFilter } from './lib/faceOverlay.js'
import { emaUpdateObject, createTierStabilizer } from './lib/signalSmoothing.js'
import { playChime, playFanfare, playMiss, speakSound } from './lib/sound.js'
import { createGameSession, logAttempt, endGameSession } from './lib/api.js'
import { useEndSessionOnLeave } from './lib/useEndSessionOnLeave.js'
import CharacterFilterPicker, { FILTERS } from './components/CharacterFilterPicker.jsx'
import ProgressRing from './components/ProgressRing.jsx'
import MouthShapeGuide from './components/MouthShapeGuide.jsx'
import CelebrationOverlay from './components/CelebrationOverlay.jsx'

const ROUND_SIZE = 10
const MAX_ATTEMPTS = 3 // 3 tries per note before moving on
const TRAVEL_MS = 3000
const CATCH_WINDOW_START = 0.68 // last ~32% of travel is the catchable window
const CALIB_MS = 1100
const RESOLVE_DELAY_MS = 900
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'

function pickRound() {
  const shuffled = [...SOUNDS].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, ROUND_SIZE)
}

const TIER_STYLES = {
  green: { ring: '#2FB8A6', text: 'Great match!' },
  yellow: { ring: '#F4B942', text: 'Getting close…' },
  red: { ring: '#F0604A', text: 'Make the shape' },
}

export default function LipSyncHero() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const landmarkerRef = useRef(null)
  const rafRef = useRef(null)
  const noteStartRef = useRef(null)
  const resolvedRef = useRef(false)
  const smoothedRef = useRef(null)
  const restMetricsRef = useRef(null)  // first frame of the round — the child's resting mouth
  const hasMovedRef = useRef(false)    // becomes true once the child's mouth actually moves from rest
  const movementStreakRef = useRef(0)  // consecutive frames past the movement gate — avoids a single jittery frame flipping hasMovedRef
  const tierStabilizerRef = useRef(createTierStabilizer(4))
  const sessionIdRef = useRef(null)
  useEndSessionOnLeave(sessionIdRef)
  const calibSamplesRef = useRef([])
  const calibStartRef = useRef(null)
  const currentRef = useRef(null)

  const [status, setStatus] = useState('loading') // loading | ready | denied | error
  const [round, setRound] = useState(() => pickRound())
  const [roundIndex, setRoundIndex] = useState(0)
  const [tier, setTier] = useState('red')
  const [progress, setProgress] = useState(0)
  const [outcome, setOutcome] = useState(null) // null | 'caught' | 'missed'
  const [stars, setStars] = useState(0)
  const [filter, setFilter] = useState('none')
  const [complete, setComplete] = useState(false)
  const [celebrate, setCelebrate] = useState(false)
  const [baselineSpread, setBaselineSpread] = useState(null)
  const [calibProgress, setCalibProgress] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [retryCount, setRetryCount] = useState(0)

  const current = round[roundIndex]
  const target = current ? SHAPE_TARGETS[current.shape] : null
  currentRef.current = current

  // (Re)start the timer/audio for whichever note is current, whenever
  // `attempt` bumps — from calibration finishing, advancing, or replaying.
  useEffect(() => {
    if (!baselineSpread || complete) return
    const sound = currentRef.current
    if (!sound) return
    noteStartRef.current = performance.now()
    resolvedRef.current = false
    setOutcome(null)
    setProgress(0)
    smoothedRef.current = null
    restMetricsRef.current = null
    hasMovedRef.current = false
    movementStreakRef.current = 0
    tierStabilizerRef.current.reset()
    speakSound(sound.label)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, baselineSpread, complete])

  // Once a note resolves (caught or missed), pause briefly then either
  // retry the same note (up to MAX_ATTEMPTS) or move on.
  useEffect(() => {
    if (!outcome) return
    const t = setTimeout(() => {
      const shouldRetry = outcome === 'missed' && retryCount + 1 < MAX_ATTEMPTS
      if (shouldRetry) {
        setRetryCount((c) => c + 1)
        setAttempt((a) => a + 1) // restarts the timer/audio for the same note
        return
      }
      setRetryCount(0)
      const isLast = roundIndex + 1 >= ROUND_SIZE
      if (isLast) {
        playFanfare()
        setComplete(true)
        if (sessionIdRef.current) endGameSession(sessionIdRef.current).catch(() => {})
      } else {
        setRoundIndex((i) => i + 1)
        setAttempt((a) => a + 1)
      }
    }, RESOLVE_DELAY_MS)
    return () => clearTimeout(t)
  }, [outcome, roundIndex, retryCount])

  // Clear the celebration overlay a moment after it appears — without this,
  // it stays visible indefinitely after the first catch since nothing else
  // resets it before the next note starts.
  useEffect(() => {
    if (!celebrate) return
    const t = setTimeout(() => setCelebrate(false), 1100)
    return () => clearTimeout(t)
  }, [celebrate])

  // Camera + face landmarker
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
        createGameSession('lip_sync_hero')
          .then((s) => {
            sessionIdRef.current = s.id
          })
          .catch(() => {})
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
      window.speechSynthesis?.cancel?.()
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
          // Same calibration approach as Mirror Mirror — capture resting
          // mouth width once before scoring against any target.
          if (metrics) {
            if (!calibStartRef.current) calibStartRef.current = performance.now()
            calibSamplesRef.current.push(metrics.spread)
            const elapsed = performance.now() - calibStartRef.current
            setCalibProgress(Math.min(1, elapsed / CALIB_MS))
            if (elapsed >= CALIB_MS && calibSamplesRef.current.length >= 6) {
              const sorted = [...calibSamplesRef.current].sort((a, b) => a - b)
              setBaselineSpread(sorted[Math.floor(sorted.length / 2)])
              setAttempt((a) => a + 1)
            }
          }
        } else if (target && !resolvedRef.current && noteStartRef.current) {
          const elapsed = performance.now() - noteStartRef.current
          const p = Math.min(1, elapsed / TRAVEL_MS)
          setProgress(p)

          if (metrics) {
            if (!restMetricsRef.current) {
              // First frame of the round establishes the resting baseline —
              // don't score against it, just capture it.
              restMetricsRef.current = metrics
            } else if (!hasMovedRef.current) {
              const movement =
                Math.abs(metrics.openness - restMetricsRef.current.openness) +
                Math.abs(metrics.spread - restMetricsRef.current.spread)
              // Tune here if kids with subtle articulation are being missed,
              // or if idle jitter is triggering false movement. Closed-lip
              // targets (p/b/m) sit right on top of a resting mouth
              // geometrically, so they need a higher bar than other shapes
              // to avoid scoring "did nothing" as a match.
              const movementGate = target?.spread === null && target?.openness?.[1] <= 0.16 ? 0.09 : 0.045
              const REQUIRED_MOVEMENT_FRAMES = 3
              if (movement > movementGate) {
                movementStreakRef.current += 1
                if (movementStreakRef.current >= REQUIRED_MOVEMENT_FRAMES) hasMovedRef.current = true
              } else {
                movementStreakRef.current = 0
              }
            }

            smoothedRef.current = emaUpdateObject(smoothedRef.current, metrics, ['openness', 'spread'], 0.3)
            const { score, tier: rawTier } = scoreAgainstTarget(smoothedRef.current, target, baselineSpread)
            // Require actual movement from rest before a match can register —
            // a resting mouth that geometrically overlaps a closed-lip target
            // (m/p/b) shouldn't score as a correct attempt on its own.
            const gatedTier = hasMovedRef.current ? rawTier : 'red'
            const t = tierStabilizerRef.current.update(gatedTier)
            frameTier = t
            setTier(t)

            if (p >= CATCH_WINDOW_START && t === 'green' && !resolvedRef.current) {
              resolvedRef.current = true
              playChime()
              setCelebrate(true)
              setStars((s) => Math.min(ROUND_SIZE, s + 1))
              setOutcome('caught')
              if (sessionIdRef.current && current) {
                logAttempt(sessionIdRef.current, {
                  sound_id: current.id,
                  place: current.place,
                  manner: current.manner,
                  voicing: current.voicing,
                  outcome: 'caught',
                  score,
                }).catch(() => {})
              }
            }
          }

          if (!resolvedRef.current && p >= 1) {
            resolvedRef.current = true
            playMiss()
            setOutcome('missed')
            if (sessionIdRef.current && current) {
              logAttempt(sessionIdRef.current, {
                sound_id: current.id,
                place: current.place,
                manner: current.manner,
                voicing: current.voicing,
                outcome: 'missed',
              }).catch(() => {})
            }
          }
        }

        if (canvas) {
          const ctx = canvas.getContext('2d')
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          if (landmarks) {
            drawFaceFilter(ctx, landmarks, canvas.width, canvas.height, filter)
            drawMouthOutline(ctx, landmarks, canvas.width, canvas.height, TIER_STYLES[frameTier].ring)
          }
        }
      }
      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => rafRef.current && cancelAnimationFrame(rafRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, target, filter, baselineSpread])

  function restart() {
    setRound(pickRound())
    setRoundIndex(0)
    setStars(0)
    setComplete(false)
    setTier('red')
    setProgress(0)
    setOutcome(null)
    setCelebrate(false)
    resolvedRef.current = false
    smoothedRef.current = null
    tierStabilizerRef.current.reset()
    setAttempt((a) => a + 1)
  }

  function recalibrate() {
    setBaselineSpread(null)
    setCalibProgress(0)
    calibSamplesRef.current = []
    calibStartRef.current = null
    noteStartRef.current = null
    resolvedRef.current = false
    setOutcome(null)
    setProgress(0)
  }

  const activeFilter = FILTERS.find((f) => f.id === filter)
  const tierStyle = TIER_STYLES[tier]
  const inCatchWindow = progress >= CATCH_WINDOW_START

  return (
    <div className="bg-ink min-h-[calc(100vh-4rem)]">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <Link to="/play/vaakmirror" className="inline-flex items-center gap-1.5 text-paper/50 hover:text-paper text-sm mb-6">
          <ArrowLeft size={15} /> All games
        </Link>

        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-mint mb-1">Game 3</p>
            <h1 className="font-display text-3xl font-bold text-paper">Lip Sync Hero</h1>
          </div>
          <ProgressRing stars={stars} total={ROUND_SIZE} />
        </div>

        <div className="mb-6 rounded-2xl border border-mint/25 bg-mint/10 px-4 py-3 flex items-start gap-2.5">
          <Volume2 size={16} className="text-mint shrink-0 mt-0.5" />
          <p className="text-xs text-paper/60 leading-relaxed">
            Sounds are read aloud by your browser's built-in voice, not real
            phoneme recordings — for single letters it usually says the letter
            name (e.g. "ess" for s) rather than the isolated sound, so treat it
            as a cue tied to the target shown, not a pronunciation guide.
          </p>
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
              <video ref={videoRef} className="w-full h-full object-cover scale-x-[-1]" playsInline muted />
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
                        play Lip Sync Hero.
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
                  Relax your face for a second so the game matches shapes to your
                  own face.
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
                  Note {roundIndex + 1} of {ROUND_SIZE}
                </p>
                <div className="flex items-center gap-5 mb-6">
                  <div className="w-36 h-36 shrink-0 rounded-2xl bg-ink border border-white/10 flex items-center justify-center p-4">
                    <MouthShapeGuide shape={current.shape} manner={current.manner} tier={tier} className="w-full h-full" />
                  </div>
                  <button
                    onClick={() => speakSound(current.label)}
                    className="w-16 h-16 shrink-0 rounded-2xl bg-coral/15 border border-coral/30 flex items-center justify-center hover:bg-coral/25 transition-colors"
                    aria-label="Hear this sound again"
                  >
                    <span className="font-display text-2xl font-bold text-coral">{current.label}</span>
                  </button>
                </div>
                <p className="text-paper text-lg font-medium mb-2">{target.label}</p>
                <p className="text-paper/45 text-sm mb-6">
                  {current.place} &middot; {current.manner} &middot; {current.voicing}
                </p>

                {/* Travel track — the note slides toward the marker */}
                <div className="relative h-3 rounded-full bg-white/10 overflow-hidden mb-2">
                  <div
                    className="absolute inset-y-0 right-0 bg-mint/25"
                    style={{ width: `${(1 - CATCH_WINDOW_START) * 100}%` }}
                  />
                  <div
                    className="absolute inset-y-0 w-3 rounded-full transition-[left] duration-75"
                    style={{
                      left: `calc(${progress * 100}% - 6px)`,
                      backgroundColor: inCatchWindow ? tierStyle.ring : '#FBF7EE99',
                    }}
                  />
                </div>
                <p className="text-paper/40 text-xs mb-6">
                  {outcome === 'caught'
                    ? 'Caught it! 🎉'
                    : outcome === 'missed'
                      ? retryCount + 1 < MAX_ATTEMPTS
                        ? `Missed that one — try ${retryCount + 2} of ${MAX_ATTEMPTS}, here it comes again.`
                        : 'Missed that one — next one\u2019s coming up.'
                      : `Hold the shape as the note reaches the marker on the right.${retryCount > 0 ? ` (Attempt ${retryCount + 1} of ${MAX_ATTEMPTS})` : ''}`}
                </p>
                <div className="h-px bg-white/10 mb-6" />
                <p className="text-paper/50 text-xs leading-relaxed">
                  No pressure if you miss one — there's always a next note, and
                  stars only ever add up, never subtract.
                </p>

                {retryCount > 0 && (
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
                <p className="text-paper/50 text-sm mb-6">You caught {stars} of {ROUND_SIZE} notes.</p>
                <ProgressRing stars={stars} total={ROUND_SIZE} />
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
