import usePhonemeAttempt from './lib/usePhonemeAttempt'
import PhonemeGameShell from './lib/PhonemeGameShell'

const LEVEL_ID = 'oo'

export default function SubmarineDive() {
  const attempt = usePhonemeAttempt(LEVEL_ID)
  const { status, result } = attempt
  const depth = status === 'result' && result ? Math.round(result.score * 120) : 0

  return (
    <PhonemeGameShell
      gameName="Submarine Dive"
      accentClass="text-mint"
      bgAccentClass="bg-mint"
      passLabel="Nice deep dive! 🌊"
      tryAgainLabel='Try a longer, smoother "oooo"'
      promptText='Say a long, low "oooo" to dive deeper'
      visual={
        <div className="relative h-40 flex flex-col items-center overflow-hidden rounded-2xl bg-mint/5">
          <span
            className="text-6xl transition-transform duration-700 ease-out mt-2"
            style={{ transform: `translateY(${depth}px)` }}
          >
            🐳
          </span>
        </div>
      }
      {...attempt}
    />
  )
}
