import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mic, Square, ArrowLeft } from 'lucide-react'
import { transcribeAudio, scoreWord, logEvent, getDifficulty } from './lib/api'

// Simple fixed word list for now — matches the level_id="village-builder"
// used when logging events, so /chime/difficulty and /chime/agent/decide
// can look at this level's history specifically.
const WORDS = ['ball', 'cat', 'sun', 'tree', 'fish', 'star', 'moon', 'dog']
const LEVEL_ID = 'village-builder'
const PASS_THRESHOLD = 0.6

export default function VillageBuilder() {
  const navigate = useNavigate()
  const [wordIndex, setWordIndex] = useState(0)
  const [status, setStatus] = useState('idle') // idle | recording | scoring | result
  const [result, setResult] = useState(null)
  const [buildings, setBuildings] = useState(0)
  const [difficultyMsg, setDifficultyMsg] = useState(null)
  const [error, setError] = useState(null)

  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const attemptRef = useRef(0)

  const targetWord = WORDS[wordIndex % WORDS.length]

  const startRecording = useCallback(async () => {
    setError(null)
    setResult(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        await handleRecordingComplete(blob)
      }

      mediaRecorderRef.current = recorder
      recorder.start()
      setStatus('recording')
    } catch (err) {
      setError("Couldn't access the microphone — check permissions and try again.")
    }
  }, [targetWord])

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop()
    setStatus('scoring')
  }, [])

  const handleRecordingComplete = async (blob) => {
    attemptRef.current += 1
    try {
      const { transcript, confidence } = await transcribeAudio(blob)
      const scored = await scoreWord(transcript, targetWord, confidence)

      setResult(scored)
      if (scored.is_valid_attempt && scored.match_score >= PASS_THRESHOLD) {
        setBuildings(b => b + 1)
      }

      await logEvent({
        level_id: LEVEL_ID,
        attempt_number: attemptRef.current,
        score: scored.match_score,
        is_valid_attempt: scored.is_valid_attempt,
      })

      // Every few attempts, check whether the backend thinks difficulty
      // should shift — surfaced as a quiet message, not a hard gate.
      if (attemptRef.current % 3 === 0) {
        const diff = await getDifficulty(LEVEL_ID)
        setDifficultyMsg(diff.message)
      }

      setStatus('result')
    } catch (err) {
      setError('Something went wrong scoring that attempt — want to try again?')
      setStatus('idle')
    }
  }

  const nextWord = () => {
    setWordIndex(i => i + 1)
    setResult(null)
    setStatus('idle')
  }

  return (
    <div className="min-h-screen bg-ink flex flex-col items-center px-6 py-10">
      <div className="w-full max-w-md">
        <button
          onClick={() => navigate('/play/chime')}
          className="flex items-center gap-2 text-paper/40 hover:text-paper/70 text-sm mb-8 transition-colors"
        >
          <ArrowLeft size={16} /> Back to Chime
        </button>

        <div className="text-center mb-8">
          <p className="font-vm-mono text-xs uppercase tracking-widest text-mint mb-2">
            Village Builder
          </p>
          <p className="text-paper/50 text-sm mb-6">🏘️ {buildings} buildings built</p>
          <h1 className="font-vm-display text-5xl font-bold text-paper mb-2">
            {targetWord}
          </h1>
          <p className="text-paper/50 text-sm">Say this word out loud</p>
        </div>

        <div className="flex justify-center mb-6">
          {status === 'idle' && (
            <button
              onClick={startRecording}
              className="w-20 h-20 rounded-full bg-coral flex items-center justify-center hover:bg-coral-dark transition-colors"
            >
              <Mic size={28} className="text-paper" />
            </button>
          )}
          {status === 'recording' && (
            <button
              onClick={stopRecording}
              className="w-20 h-20 rounded-full bg-white/10 border-2 border-coral flex items-center justify-center animate-pulse"
            >
              <Square size={24} className="text-coral" />
            </button>
          )}
          {status === 'scoring' && (
            <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center">
              <span className="text-paper/40 text-xs">Listening…</span>
            </div>
          )}
        </div>

        {error && (
          <p className="text-center text-coral text-sm mb-4">{error}</p>
        )}

        {status === 'result' && result && (
          <div className="rounded-2xl border border-white/10 bg-ink-light p-6 text-center mb-4">
            <p className="text-paper/50 text-xs mb-1">You said</p>
            <p className="font-vm-display text-xl font-bold text-paper mb-4">
              "{result.transcript || '—'}"
            </p>
            {result.match_score >= PASS_THRESHOLD ? (
              <p className="text-mint font-semibold">Nice! New building unlocked 🏗️</p>
            ) : (
              <p className="text-paper/50">Close — give it another try!</p>
            )}
            <button
              onClick={nextWord}
              className="mt-5 px-6 py-2.5 rounded-full bg-mint text-ink-deep font-semibold hover:opacity-90 transition-opacity"
            >
              Next word →
            </button>
          </div>
        )}

        {difficultyMsg && (
          <p className="text-center text-paper/30 text-xs mt-2">{difficultyMsg}</p>
        )}
      </div>
    </div>
  )
}
