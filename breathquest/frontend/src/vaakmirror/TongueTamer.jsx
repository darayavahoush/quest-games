import { useEffect, useRef, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, CameraOff, RefreshCw, ArrowUpCircle, Volume2 } from 'lucide-react'
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import { TONGUE_MOVES } from './data/tongueMoves.js'
import { computeMouthMetrics } from './lib/mouthMetrics.js'
import { computeTongueMetrics, scoreTongueMove, computeElevationOffset, computeLateralOffset, computeCavityDarknessOffset } from './lib/tongueTracking.js'
import { drawMouthOutline, drawFaceFilter, drawTongueArrow } from './lib/faceOverlay.js'
import { emaUpdate, emaUpdateObject, createTierStabilizer } from './lib/signalSmoothing.js'
import { playChime, playFanfare, speakSound } from './lib/sound.js'
import { createGameSession, logAttempt, endGameSession } from './lib/api.js'
import { useEndSessionOnLeave } from './lib/useEndSessionOnLeave.js'
import CharacterFilterPicker, { FILTERS } from './components/CharacterFilterPicker.jsx'
import ProgressRing from './components/ProgressRing.jsx'
import TongueShapeGuide from './components/TongueShapeGuide.jsx'
import CelebrationOverlay from './components/CelebrationOverlay.jsx'

const ROUND_SIZE = 10
const HOLD_MS = 2500
const OPEN_THRESHOLD = 0.22
const CALIB_MS = 1400
// After this long stuck on one move without landing it, log it honestly
// as missed and move on — same cap Mirror Mirror / Minimal Pair Drill use,
// so no move can leave a kid stuck with no forward progress.
const STRUGGLE_MS = 7000
const MAX_ATTEMPTS = 3
const MIN_CALIB_SAMPLES = 6
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'

function pickRound() {
  const seq = []
  let last = null
  for (let i = 0; i < ROUND_SIZE; i++) {
    let choice
    do {
      choice = TONGUE_MOVES[Math.floor(Math.random() * TONGUE_MOVES.length)]
    } while (TONGUE_MOVES.length > 1 && choice.id === last)
    seq.push(choice)
    last = choice.id
  }
  return seq
}

const TIER_STYLES = {
  green: { ring: '#2FB8A6', text: 'Great — hold it!' },
  yellow: { ring: '#F4B942', text: 'Getting close…' },
  red: { ring: '#F0604A', text: 'Keep adjusting' },
}

export default function TongueTamer() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const analysisCanvasRef = useRef(null)
  const landmarkerRef = useRef(null)
  const rafRef = useRef(null)
  const holdStartRef = useRef(null)
  const smoothedOpenRef = useRef(null)
  const smoothedTongueRef = useRef(null)
  const tierStabilizerRef = useRef(createTierStabilizer(4))
  const sessionIdRef = useRef(null)
  useEndSessionOnLeave(sessionIdRef)
  const elevationOffsetRef = useRef(0)
  const lateralOffsetRef = useRef(0)
  const cavityOffsetRef = useRef(0)
  const calibSamplesRef = useRef([])
  const calibLateralSamplesRef = useRef([])
  const calibCavitySamplesRef = useRef([])
  const calibStartRef = useRef(null)
  const moveStartRef = useRef(null)

  const [status, setStatus] = useState('loading') // loading | ready | denied | error
  const [calibrated, setCalibrated] = useState(false)
  const [calibProgress, setCalibProgress] = useState(0)
  const [round, setRound] = useState(() => pickRound())
  const [roundIndex, setRoundIndex] = useState(0)
  const [tier, setTier] = useState('red')
  const [holdProgress, setHoldProgress] = useState(0)
  const [stars, setStars] = useState(0)
  const [filter, setFilter] = useState('none')
  const [complete, setComplete] = useState(false)
  const [celebrate, setCelebrate] = useState(false)
  const [mouthOpenEnough, setMouthOpenEnough] = useState(false)
  const [lowLight, setLowLight] = useState(false)

  const current = round[roundIndex]

  // Speaks the move's own instruction text (e.g. "Lift your tongue tip to
  // touch the ridge behind your top teeth") rather than a phoneme label —
  // tongue moves aren't sounds, so the useful thing to hear here is the
  // verbal cue, not a spoken letter name.
  useEffect(() => {
    if (!calibrated || complete || !current) return
    speakSound(current.instruction)
  }, [current, calibrated, complete])

  const advance = useCallback((opts = {}) => {
    const { skipped = false } = opts
    const isLast = roundIndex + 1 >= ROUND_SIZE
    if (!skipped) setStars((s) => Math.min(ROUND_SIZE, s + 1))
    holdStartRef.current = null
    setHoldProgress(0)
    smoothedTongueRef.current = null
    tierStabilizerRef.current.reset()
    moveStartRef.current = null

    if (isLast) {
      playFanfare()
      setComplete(true)
      if (sessionIdRef.current) endGameSession(sessionIdRef.current).catch(() => {})
    } else {
      if (!skipped) playChime()
      setCelebrate(!skipped)
      setRoundIndex((i) => i + 1)
    }
  }, [roundIndex])

  // Clear the celebration overlay a moment after it appears
  useEffect(() => {
    if (!celebrate) return
    const t = setTimeout(() => setCelebrate(false), 1100)
    return () => clearTimeout(t)
  }, [celebrate])

  // Camera + face landmarker + offscreen analysis canvas
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
        analysisCanvasRef.current = document.createElement('canvas')
        setStatus('ready')
        createGameSession('tongue_tamer')
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
        const mouth = computeMouthMetrics(landmarks)
        smoothedOpenRef.current = emaUpdate(smoothedOpenRef.current, mouth?.openness ?? null, 0.3)
        const openEnough = smoothedOpenRef.current != null && smoothedOpenRef.current >= OPEN_THRESHOLD
        setMouthOpenEnough(openEnough)

        let frameTier = 'red'

        if (openEnough && landmarks && !calibrated) {
          const calibMetrics = computeTongueMetrics(
            video, landmarks, analysisCanvasRef.current, canvas.width, canvas.height,
          )
          if (calibMetrics && calibMetrics.elevation != null) {
            if (!calibStartRef.current) calibStartRef.current = performance.now()
            calibSamplesRef.current.push(calibMetrics.elevation)
            if (calibMetrics.lateral != null) calibLateralSamplesRef.current.push(calibMetrics.lateral)
            calibCavitySamplesRef.current.push(calibMetrics.cavityDarkness)
            const elapsed = performance.now() - calibStartRef.current
            setCalibProgress(Math.min(1, elapsed / CALIB_MS))
            if (elapsed >= CALIB_MS && calibSamplesRef.current.length >= MIN_CALIB_SAMPLES) {
              const sorted = [...calibSamplesRef.current].sort((a, b) => a - b)
              elevationOffsetRef.current = computeElevationOffset(sorted[Math.floor(sorted.length / 2)])
              if (calibLateralSamplesRef.current.length >= MIN_CALIB_SAMPLES) {
                const sortedLat = [...calibLateralSamplesRef.current].sort((a, b) => a - b)
                lateralOffsetRef.current = computeLateralOffset(sortedLat[Math.floor(sortedLat.length / 2)])
              }
              if (calibCavitySamplesRef.current.length >= MIN_CALIB_SAMPLES) {
                const sortedCav = [...calibCavitySamplesRef.current].sort((a, b) => a - b)
                cavityOffsetRef.current = computeCavityDarknessOffset(sortedCav[Math.floor(sortedCav.length / 2)])
              }
              setCalibrated(true)
            }
          }
        } else if (openEnough && landmarks && current) {
          const tongueMetrics = computeTongueMetrics(
            video,
            landmarks,
            analysisCanvasRef.current,
            canvas.width,
            canvas.height,
          )
          if (tongueMetrics) {
            setLowLight(tongueMetrics.brightness < 55)
            smoothedTongueRef.current = emaUpdateObject(
              smoothedTongueRef.current,
              tongueMetrics,
              ['visibility', 'elevation', 'lateral', 'cavityDarkness'],
              0.3,
            )
            const { score, tier: rawTier } = scoreTongueMove(smoothedTongueRef.current, current.target, elevationOffsetRef.current, lateralOffsetRef.current, cavityOffsetRef.current)
            const t = tierStabilizerRef.current.update(rawTier)
            frameTier = t
            setTier(t)

            if (!moveStartRef.current) moveStartRef.current = performance.now()

            if (t !== 'green' && performance.now() - moveStartRef.current >= STRUGGLE_MS * MAX_ATTEMPTS) {
              if (sessionIdRef.current && current) {
                logAttempt(sessionIdRef.current, {
                  sound_id: current.id,
                  place: current.place,
                  outcome: 'missed',
                  score: 0,
                }).catch(() => {})
              }
              advance({ skipped: true })
            }

            if (t === 'green') {
              if (!holdStartRef.current) holdStartRef.current = performance.now()
              const elapsed = performance.now() - holdStartRef.current
              setHoldProgress(Math.min(1, elapsed / HOLD_MS))
              if (elapsed >= HOLD_MS) {
                if (sessionIdRef.current && current) {
                  logAttempt(sessionIdRef.current, {
                    sound_id: current.id,
                    place: current.place,
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
        } else {
          holdStartRef.current = null
          setHoldProgress(0)
        }

        if (canvas) {
          const ctx = canvas.getContext('2d')
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          if (landmarks) {
            drawFaceFilter(ctx, landmarks, canvas.width, canvas.height, filter)
            drawMouthOutline(ctx, landmarks, canvas.width, canvas.height, TIER_STYLES[frameTier].ring)
            if (openEnough && current) {
              drawTongueArrow(ctx, landmarks, canvas.width, canvas.height, current.arrow, TIER_STYLES[frameTier].ring)
            }
          }
        }
      }
      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => rafRef.current && cancelAnimationFrame(rafRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, current, advance, filter])

  function restart() {
    setCalibrated(false)
    setCalibProgress(0)
    calibSamplesRef.current = []
    calibLateralSamplesRef.current = []
    calibCavitySamplesRef.current = []
    calibStartRef.current = null
    elevationOffsetRef.current = 0
    lateralOffsetRef.current = 0
    cavityOffsetRef.current = 0
    setRound(pickRound())
    setRoundIndex(0)
    setStars(0)
    setComplete(false)
    setTier('red')
    setHoldProgress(0)
    holdStartRef.current = null
    smoothedTongueRef.current = null
    tierStabilizerRef.current.reset()
    setCelebrate(false)
    moveStartRef.current = null
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
            <p className="font-mono text-xs uppercase tracking-widest text-mint mb-1">Game 2</p>
            <h1 className="font-display text-3xl font-bold text-paper">Tongue Tamer</h1>
          </div>
          <ProgressRing stars={stars} total={ROUND_SIZE} />
        </div>

        <div className="mb-6 rounded-2xl border border-mint/25 bg-mint/10 px-4 py-3 flex items-start gap-2.5">
          <ArrowUpCircle size={16} className="text-mint shrink-0 mt-0.5" />
          <p className="text-xs text-paper/60 leading-relaxed">
            Tongue position is estimated from color, not a dedicated tongue tracker —
            treat the arrow as a helpful guide rather than a precise measurement, and
            keep an eye on lighting for best results.
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
                        play Tongue Tamer.
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

              {status === 'ready' && !mouthOpenEnough && (
                <div className="absolute inset-x-0 bottom-0 bg-ink-deep/85 text-paper text-center text-sm py-2.5 px-4">
                  Open your mouth a little wider so the camera can see in
                </div>
              )}

              {status === 'ready' && mouthOpenEnough && !calibrated && (
                <div className="absolute inset-x-0 bottom-0 bg-ink-deep/85 text-paper text-center text-sm py-2.5 px-4">
                  Relax your tongue for a second so we can match this to your own mouth… {Math.round(calibProgress * 100)}%
                </div>
              )}

              {status === 'ready' && mouthOpenEnough && (
                <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/30">
                  <div
                    className="h-full transition-[width] duration-75"
                    style={{ width: `${holdProgress * 100}%`, backgroundColor: tierStyle.ring }}
                  />
                </div>
              )}
              <CelebrationOverlay show={celebrate} />
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <CharacterFilterPicker value={filter} onChange={setFilter} />
              {status === 'ready' && (
                <p className="text-sm font-medium" style={{ color: mouthOpenEnough ? tierStyle.ring : '#F4B942' }}>
                  {mouthOpenEnough ? tierStyle.text : 'Mouth not open enough yet'}
                </p>
              )}
            </div>
            {lowLight && status === 'ready' && (
              <p className="mt-2 text-xs text-gold/80">
                Lighting looks a little low — try facing a light source for more
                reliable tracking.
              </p>
            )}
          </div>

          {/* Target panel */}
          <div className="rounded-3xl bg-ink-light border border-white/10 p-8">
            {!complete && current ? (
              <>
                <p className="font-mono text-xs uppercase tracking-widest text-paper/40 mb-3">
                  Move {roundIndex + 1} of {ROUND_SIZE}
                </p>
                <div className="w-36 h-36 rounded-2xl bg-ink border border-white/10 flex items-center justify-center p-4 mb-6">
                  <TongueShapeGuide move={current.id} tier={tier} className="w-full h-full" />
                </div>
                <p className="text-paper text-lg font-medium mb-2">{current.label}</p>
                <p className="text-paper/55 text-sm leading-relaxed mb-6 flex items-start gap-2">
                  <span>{current.instruction}</span>
                  <button
                    onClick={() => speakSound(current.instruction)}
                    className="text-paper/40 hover:text-coral transition-colors shrink-0 mt-0.5"
                    title="Hear it again"
                  >
                    <Volume2 size={16} />
                  </button>
                </p>
                <div className="h-px bg-white/10 mb-6" />
                <p className="text-paper/50 text-xs leading-relaxed">
                  Hold the shown position for a couple of seconds to move to the next
                  one. No score is shown — just keep going at your own pace.
                </p>
              </>
            ) : (
              <div className="text-center py-6">
                <p className="font-display text-2xl font-bold text-paper mb-2">Round complete! ✨</p>
                <p className="text-paper/50 text-sm mb-6">You matched all {ROUND_SIZE} moves.</p>
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
