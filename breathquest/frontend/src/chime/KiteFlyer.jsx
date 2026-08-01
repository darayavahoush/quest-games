import usePhonemeAttempt from './lib/usePhonemeAttempt'
import PhonemeGameShell from './lib/PhonemeGameShell'

const LEVEL_ID = 'ee'

export default function KiteFlyer() {
  const attempt = usePhonemeAttempt(LEVEL_ID)
  const { status, result } = attempt
  const lift = status === 'result' && result ? result.score * 90 : 0

  return (
    <PhonemeGameShell
      gameName="Kite Flyer"
      accentClass="text-mint"
      bgAccentClass="bg-mint"
      passLabel="Look at it fly! 🪁"
      tryAgainLabel='Try a long, high "eeee"'
      promptText='Say a long, bright "eeee" to lift the kite'
      visual={
        <div className="h-40 flex items-end justify-center overflow-hidden">
          <span
            className="text-6xl transition-transform duration-700 ease-out"
            style={{ transform: `translateY(-${lift}px)` }}
          >
            🪁
          </span>
        </div>
      }
      {...attempt}
    />
  )
}
