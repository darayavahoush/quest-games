import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, CameraOff, RefreshCw, Shuffle, Volume2, Lightbulb } from 'lucide-react'
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import { SOUNDS, SHAPE_TARGETS } from './data/soundTaxonomy.js'
import { getPhonemeCue } from './data/phonemeCues.js'
import { MINIMAL_PAIRS, findPairForSound, defaultPair } from './data/minimalPairs.js'
import { computeMouthMetrics, scoreAgainstTarget } from './lib/mouthMetrics.js'
import { drawMouthOutline, drawFaceFilter } from './lib/faceOverlay.js'
import { emaUpdateObject, createTierStabilizer } from './lib/signalSmoothing.js'
import { playChime, playFanfare, speakSound } from './lib/sound.js'
import { createGameSession, logAttempt, endGameSession, getWeakSounds } from './lib/api.js'
import { useEndSessionOnLeave } from './lib/useEndSessionOnLeave.js'
import CelebrationOverlay from './components/CelebrationOverlay.jsx'
import CharacterFilterPicker, { FILTERS } from './components/CharacterFilterPicker.jsx'
import ProgressRing from './components/ProgressRing.jsx'
import MouthShapeGuide from './components/MouthShapeGuide.jsx'

const ROUND_SIZE = 10 // 5 reps of each side of the pair
const HOLD_MS = 3000
const CALIB_MS = 1100
// Same threshold as Mirror Mirror — how long a kid can sit outside the
// green tier on one side of the pair before we offer a concrete tip.
const STRUGGLE_MS = 7000
// Same cap as Mirror Mirror — after this many struggle windows on one
// side of the pair, log it honestly as missed and move on rather than
// leaving a kid stuck with no forward progress.
const MAX_ATTEMPTS = 3
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'

const soundById = Object.fromEntries(SOUNDS.map((s) => [s.id, s]))

// Alternates a/b in shuffled pairs-of-two, e.g. [a,b, b,a, a,b, b,a, a,b] in
// some random order of blocks — never truly random, so a kid never gets 3+
// of the same side in a row (which would let them stop actually
// discriminating and just repeat the last shape from muscle memory).
function pickRound(pair, size) {
  const blocks = []
  for (let i = 0; i < Math.ceil(size / 2); i++) {
    blocks.push(Math.random() < 0.5 ? [pair.a, pair.b] : [pair.b, pair.a])
  }
  return blocks.flat().slice(0, size).map((id) => soundById[id]).filter(Boolean)
}

const TIER_STYLES = {
  green: { ring: '#2FB8A6', text: 'Great match — hold it!' },
  yellow: { ring: '#F4B942', text: 'Getting close…' },
  red: { ring: '#F0604A', text: 'Try adjusting your mouth' },
}

export default function MinimalPairDrill() {
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
  const [pair, setPair] = useState(defaultPair())
  const [pairSource, setPairSource] = useState('default') // 'default' | 'weak' | 'manual'
  const [round, setRound] = useState(() => pickRound(defaultPair(), ROUND_SIZE))
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

  // Auto-pick a pair from the kid's own weak sounds, weakest-first, the
  // first time this mounts — falls back silently to the curated default if
  // the fetch fails or nothing in their history matches a known pair (e.g.
  // brand-new player with no attempts yet).
  useEffect(() => {
    let cancelled = false
    getWeakSounds()
      .then((weak) => {
        if (cancelled || !weak?.length) return
        for (const w of weak) {
          const match = findPairForSound(w.sound_id)
          if (match) {
            setPair(match)
            setPairSource('weak')
            setRound(pickRound(match, ROUND_SIZE))
            return
          }
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  function choosePair(next) {
    setPair(next)
    setPairSource('manual')
    restartWith(next)
  }

  // Speak whichever of the pair is currently up — arguably more valuable
  // here than in Mirror Mirror, since discrimination drills are partly an
  // ear-training exercise, not just mouth-shape production.
  useEffect(() => {
    if (!baselineSpread || complete || !current) return
    speakSound(current.label)
  }, [current, baselineSpread, complete])

  const advance = useCallback((opts = {}) => {
    const { skipped = false } = opts
    const isLast = roundIndex + 1 >= ROUND_SIZE
    if (!skipped) setStars((s) => Math.min(ROUND_SIZE, s + 1))
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
  }, [roundIndex])

  useEffect(() => {
    if (!celebrate) return
    const t = setTimeout(() => setCelebrate(false), 1100)
    return () => clearTimeout(t)
  }, [celebrate])

  // Set up camera + face landmarker — identical to Mirror Mirror.
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
        // Logged under the same 'mirror_mirror' game — same shape-scoring
        // engine, same sound_id/place/manner/voicing columns the dashboard
        // already rolls up by, so no schema/enum change is needed to tell
        // these attempts apart from regular Mirror Mirror play.
        createGameSession('mirror_mirror')
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

  // Detection loop — identical scoring path to Mirror Mirror.
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

          if (t !== 'green' && performance.now() - soundStartRef.current >= STRUGGLE_MS) {
            setShowCue(true)
          }

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

  function restartWith(nextPair) {
    setRound(pickRound(nextPair, ROUND_SIZE))
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

  function restart() {
    restartWith(pair)
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
  const otherPairs = useMemo(() => MINIMAL_PAIRS.filter((p) => p !== pair), [pair])

  return (
    <div className="bg-ink min-h-[calc(100vh-4rem)]">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <Link to="/play/vaakmirror" className="inline-flex items-center gap-1.5 text-paper/50 hover:text-paper text-sm mb-6">
          <ArrowLeft size={15} /> All games
        </Link>

        <div className="flex items-center justify-between mb-3 flex-wrap gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-mint mb-1">Minimal Pair Drill</p>
            <h1 className="font-display text-3xl font-bold text-paper">{pair.label}</h1>
          </div>
          <ProgressRing stars={stars} total={ROUND_SIZE} />
        </div>

        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <p className="text-paper/45 text-xs">
            {pairSource === 'weak'
              ? 'Auto-picked from this kid\u2019s own weak sounds.'
              : pairSource === 'manual'
              ? 'Manually selected.'
              : 'Default starter pair \u2014 no attempt history yet.'}
          </p>
          <div className="relative group">
            <button className="text-xs text-paper/50 hover:text-paper flex items-center gap-1 px-2 py-1 rounded-full border border-white/10">
              <Shuffle size={11} /> Change pair
            </button>
            <div className="absolute z-10 hidden group-hover:block group-focus-within:block top-full left-0 mt-1 bg-ink-light border border-white/10 rounded-xl p-1.5 w-48 max-h-64 overflow-y-auto">
              {otherPairs.map((p) => (
                <button
                  key={p.label}
                  onClick={() => choosePair(p)}
                  className="w-full text-left px-3 py-1.5 rounded-lg text-sm text-paper/70 hover:bg-white/5 hover:text-paper"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
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
                        Camera access was denied. Enable it in your browser settings to play.
                      </p>
                    </>
                  )}
                  {status === 'error' && (
                    <>
                      <CameraOff size={22} />
                      <p className="text-sm">
                        Couldn't start the camera or face-tracking model. Check your connection and reload.
                      </p>
                    </>
                  )}
                </div>
              )}

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
                <p className="font-display text-xl font-bold text-paper mb-3">Getting your resting mouth shape…</p>
                <p className="text-paper/55 text-sm leading-relaxed mb-6">
                  Just relax your face for a second — this lets the game match shapes to your own
                  face instead of a generic one.
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
                <div className="flex items-center gap-3 mb-6">
                  {[pair.a, pair.b].map((id) => {
                    const s = soundById[id]
                    const isCurrent = current.id === id
                    return (
                      <div
                        key={id}
                        className={`flex-1 rounded-2xl border p-4 text-center transition-colors ${
                          isCurrent ? 'bg-coral/15 border-coral/40' : 'bg-ink border-white/10 opacity-40'
                        }`}
                      >
                        <span className={`font-display text-2xl font-bold ${isCurrent ? 'text-coral' : 'text-paper'}`}>
                          {s?.label}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <div className="w-28 h-28 mx-auto mb-6 rounded-2xl bg-ink border border-white/10 flex items-center justify-center p-3">
                  <MouthShapeGuide shape={current.shape} manner={current.manner} tier={tier} className="w-full h-full" />
                </div>
                <p className="text-paper text-lg font-medium mb-2 text-center flex items-center justify-center gap-2">
                  {target.label}
                  <button
                    onClick={() => speakSound(current.label)}
                    className="text-paper/40 hover:text-coral transition-colors"
                    title="Hear it again"
                  >
                    <Volume2 size={16} />
                  </button>
                </p>
                <p className="text-paper/45 text-sm leading-relaxed mb-6 text-center">
                  {current.place} &middot; {current.manner} &middot; {current.voicing}
                </p>
                <div className="h-px bg-white/10 mb-6" />
                <p className="text-paper/50 text-xs leading-relaxed text-center">
                  Watch which sound is highlighted — it switches between the two. Hold the green
                  outline for two seconds to move on.
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
                <p className="text-paper/50 text-sm mb-6">
                  You practiced {pair.label} {ROUND_SIZE} times.
                </p>
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
