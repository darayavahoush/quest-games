// Shared record -> upload -> score -> log loop for the 5 phoneme
// mini-games (Rocket Launch, Submarine Dive, Drum Island, Wind Chime
// Garden, Bubble Wrap Pop). Each screen owns its own visuals; this
// hook owns the mic + API plumbing so it isn't duplicated 5x.
import { useState, useRef, useCallback } from 'react'
import { scorePhoneme, logEvent, getDifficulty } from './api'

export default function usePhonemeAttempt(levelId, passThreshold = 0.6) {
  const [status, setStatus] = useState('idle') // idle | recording | scoring | result
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [difficultyMsg, setDifficultyMsg] = useState(null)

  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const attemptRef = useRef(0)

  const handleRecordingComplete = useCallback(async (blob) => {
    attemptRef.current += 1
    try {
      const scored = await scorePhoneme(levelId, blob)
      setResult(scored)

      await logEvent({
        level_id: levelId,
        attempt_number: attemptRef.current,
        score: scored.score,
        is_valid_attempt: scored.is_valid_attempt,
        raw_features: scored.raw_features,
      })

      if (attemptRef.current % 3 === 0) {
        const diff = await getDifficulty(levelId)
        setDifficultyMsg(diff.message)
      }

      setStatus('result')
    } catch (err) {
      console.error('Phoneme attempt scoring failed:', err)
      setError("Something went wrong scoring that attempt — want to try again?")
      setStatus('idle')
    }
  }, [levelId])

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
      console.error('Microphone access failed:', err)
      setError("Couldn't access the microphone — check permissions and try again.")
    }
  }, [handleRecordingComplete])

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop()
    setStatus('scoring')
  }, [])

  const reset = useCallback(() => {
    setResult(null)
    setStatus('idle')
  }, [])

  const passed = !!(result && result.is_valid_attempt && result.score >= passThreshold)

  return { status, result, error, difficultyMsg, startRecording, stopRecording, reset, passed }
}
