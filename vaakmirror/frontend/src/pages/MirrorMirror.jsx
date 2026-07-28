import { useEffect, useRef, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, CameraOff, RefreshCw } from 'lucide-react'
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import { SOUNDS, SHAPE_TARGETS } from '../data/soundTaxonomy.js'
import { computeMouthMetrics, scoreAgainstTarget } from '../lib/mouthMetrics.js'
import { drawMouthOutline, drawFaceFilter } from '../lib/faceOverlay.js'
import { emaUpdateObject, createTierStabilizer } from '../lib/signalSmoothing.js'
import { playChime, playFanfare } from '../lib/sound.js'
import { createGameSession, logAttempt, endGameSession } from '../lib/api.js'
import CelebrationOverlay from '../components/CelebrationOverlay.jsx'
import CharacterFilterPicker, { FILTERS } from '../components/CharacterFilterPicker.jsx'
import ProgressRing from '../components/ProgressRing.jsx'
import MouthShapeGuide from '../components/MouthShapeGuide.jsx'

const ROUND_SIZE = 5
const HOLD_MS = 2000
const CALIB_MS = 1100
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'

function pickRound() {
  const shuffled = [...SOUNDS].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, ROUND_SIZE)
}

const TIER_STYLES = {
  green: { ring: '#2FB8A6', text: 'Great match — hold it!' },
  yellow: { ring: '#F4B942', text: 'Getting close…' },
  red: { ring: '#F0604A', text: 'Try adjusting your mouth' },
}

export default function MirrorMirror() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const landmarkerRef = useRef(null)
  const rafRef = useRef(null)
  const holdStartRef = useRef(null)
  const smoothedRef = useRef(null)
  const tierStabilizerRef = useRef(createTierStabilizer(4))
  const sessionIdRef = useRef(null)

  const [status, setStatus] = useState('loading') // loading | ready | denied | error
  const [round, setRound] = useState(() => pickRound())
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

  const current = round[roundIndex]
  const target = current ? SHAPE_TARGETS[current.shape] : null

  const advance = useCallback(() => {
    const isLast = roundIndex + 1 >= ROUND_SIZE
    setStars((s) => Math.min(ROUND_SIZE, s + 1))
    holdStartRef.current = null
    setHoldProgress(0)
    smoothedRef.current = null
    tierStabilizerRef.current.reset()

    if (isLast) {
      playFanfare()
      setComplete(true)
      if (sessionIdRef.current) endGameSession(sessionIdRef.current).catch(() => {})
    } else {
      playChime()
      setCelebrate(true)
      setRoundIndex((i) => i + 1)
    }
  }, [roundIndex])

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
          smoothedRef.current = emaUpdateObject(smoothedRef.current, metrics, ['openness', 'spread'], 0.3)
          const { score, tier: rawTier } = scoreAgainstTarget(smoothedRef.current, target, baselineSpread)
          const t = tierStabilizerRef.current.update(rawTier)
          frameTier = t
          setTier(t)

          if (t === 'green') {
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
    setRound(pickRound())
    setRoundIndex(0)
    setStars(0)
    setComplete(false)
    setTier('red')
    setHoldProgress(0)
    holdStartRef.current = null
    smoothedRef.current = null
    tierStabilizerRef.current.reset()
    setCelebrate(false)
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
  }

  const activeFilter = FILTERS.find((f) => f.id === filter)
  const tierStyle = TIER_STYLES[tier]

  return (
    <div className="bg-ink min-h-[calc(100vh-4rem)]">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <Link to="/" className="inline-flex items-center gap-1.5 text-paper/50 hover:text-paper text-sm mb-6">
          <ArrowLeft size={15} /> All games
        </Link>

        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-mint mb-1">Game 1</p>
            <h1 className="font-display text-3xl font-bold text-paper">Mirror Mirror</h1>
          </div>
          <ProgressRing stars={stars} total={ROUND_SIZE} />
        </div>

        <div className="grid md:grid-cols-[1fr,1fr] gap-6 items-start">
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
                  Sound {roundIndex + 1} of {ROUND_SIZE}
                </p>
                <div className="flex items-center gap-5 mb-6">
                  <div className="w-20 h-20 shrink-0 rounded-2xl bg-ink border border-white/10 flex items-center justify-center p-3">
                    <MouthShapeGuide shape={current.shape} manner={current.manner} tier={tier} className="w-full h-full" />
                  </div>
                  <div className="w-16 h-16 shrink-0 rounded-2xl bg-coral/15 border border-coral/30 flex items-center justify-center">
                    <span className="font-display text-2xl font-bold text-coral">{current.label}</span>
                  </div>
                </div>
                <p className="text-paper text-lg font-medium mb-2">{target.label}</p>
                <p className="text-paper/45 text-sm leading-relaxed mb-6">
                  {current.place} &middot; {current.manner} &middot; {current.voicing}
                </p>
                <div className="h-px bg-white/10 mb-6" />
                <p className="text-paper/50 text-xs leading-relaxed">
                  Hold the green outline for two seconds to move to the next sound. No
                  score is shown — just keep going at your own pace.
                </p>
              </>
            ) : (
              <div className="text-center py-6">
                <p className="font-display text-2xl font-bold text-paper mb-2">Round complete! ✨</p>
                <p className="text-paper/50 text-sm mb-6">You matched all {ROUND_SIZE} shapes.</p>
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
