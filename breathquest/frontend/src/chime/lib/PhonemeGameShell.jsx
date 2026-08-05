import { useNavigate } from 'react-router-dom'
import { Mic, Square, ArrowLeft, Volume2 } from 'lucide-react'
import { useSpokenInstruction } from '../../lib/speech'

// Common chrome shared by all 5 phoneme mini-games. `visual` is the
// bespoke centerpiece each game renders (rocket, submarine, drum, etc);
// everything else — back nav, mic button states, result card, difficulty
// hint — stays identical across games so the UX feels like one app.
export default function PhonemeGameShell({
  gameName, accentClass, bgAccentClass, passLabel, tryAgainLabel,
  status, result, error, difficultyMsg, startRecording, stopRecording, reset,
  passed, visual, promptText, nextLevelPath,
}) {
  const navigate = useNavigate()
  // Auto-speak the prompt once when a level's promptText shows up (matches
  // the auto-speak-once pattern VaakMirror's games already use), plus a
  // small replay button next to it — held off while the mic is mid-attempt
  // so it doesn't talk over a recording.
  const replay = useSpokenInstruction(promptText, { enabled: status === 'idle' })

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
          <p className={`font-vm-mono text-xs uppercase tracking-widest ${accentClass} mb-2`}>
            {gameName}
          </p>
          {visual}
          <p className="text-paper/50 text-sm mt-4 flex items-center justify-center gap-1.5">
            {promptText}
            <button
              onClick={replay}
              className="text-paper/30 hover:text-paper/60 transition-colors"
              aria-label="Hear the instructions again"
            >
              <Volume2 size={15} />
            </button>
          </p>
        </div>

        <div className="flex justify-center mb-6">
          {status === 'idle' && (
            <button
              onClick={startRecording}
              className={`w-20 h-20 rounded-full ${bgAccentClass} flex items-center justify-center hover:opacity-90 transition-opacity`}
            >
              <Mic size={28} className="text-paper" />
            </button>
          )}
          {status === 'recording' && (
            <button
              onClick={stopRecording}
              className={`w-20 h-20 rounded-full bg-white/10 border-2 ${accentClass.replace('text-', 'border-')} flex items-center justify-center animate-pulse`}
            >
              <Square size={24} className={accentClass} />
            </button>
          )}
          {status === 'scoring' && (
            <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center">
              <span className="text-paper/40 text-xs">Listening…</span>
            </div>
          )}
        </div>

        {error && <p className="text-center text-coral text-sm mb-4">{error}</p>}

        {status === 'result' && result && (
          <div className="rounded-2xl border border-white/10 bg-ink-light p-6 text-center mb-4">
            {passed ? (
              <p className={`${accentClass} font-semibold`}>{passLabel}</p>
            ) : (
              <p className="text-paper/50">{tryAgainLabel}</p>
            )}
            {passed && nextLevelPath ? (
              <div className="flex flex-col items-center gap-3 mt-5">
                <button
                  onClick={() => navigate(nextLevelPath)}
                  className={`px-6 py-2.5 rounded-full ${bgAccentClass} text-ink-deep font-semibold hover:opacity-90 transition-opacity`}
                >
                  Next Level →
                </button>
                <button onClick={reset} className="text-paper/40 hover:text-paper/70 text-sm underline underline-offset-4">
                  Play again
                </button>
              </div>
            ) : (
              <button
                onClick={reset}
                className={`mt-5 px-6 py-2.5 rounded-full ${bgAccentClass} text-ink-deep font-semibold hover:opacity-90 transition-opacity`}
              >
                Try again →
              </button>
            )}
          </div>
        )}

        {difficultyMsg && (
          <p className="text-center text-paper/30 text-xs mt-2">{difficultyMsg}</p>
        )}
      </div>
    </div>
  )
}
