import usePhonemeAttempt from './lib/usePhonemeAttempt'
import PhonemeGameShell from './lib/PhonemeGameShell'

const LEVEL_ID = 'ma'

export default function DrumIsland() {
  const attempt = usePhonemeAttempt(LEVEL_ID)
  const { status, result } = attempt
  const bounce = status === 'result' && result ? 1 + result.score * 0.6 : 1

  return (
    <PhonemeGameShell
      gameName="Drum Island"
      accentClass="text-gold"
      bgAccentClass="bg-gold"
      passLabel="Great rhythm! 🥁"
      tryAgainLabel='Try a steady "ma-ma-ma"'
      promptText='Say "ma-ma-ma" with a steady beat'
      visual={
        <div className="h-40 flex items-center justify-center">
          <span
            className="text-6xl transition-transform duration-500 ease-out"
            style={{ transform: `scale(${bounce})` }}
          >
            🥁
          </span>
        </div>
      }
      {...attempt}
    />
  )
}
