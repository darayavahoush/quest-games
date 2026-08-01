import usePhonemeAttempt from './lib/usePhonemeAttempt'
import PhonemeGameShell from './lib/PhonemeGameShell'

const LEVEL_ID = 'r'

export default function LionsRoar() {
  const attempt = usePhonemeAttempt(LEVEL_ID)
  const { status, result } = attempt
  const roar = status === 'result' && result ? 1 + result.score * 0.8 : 1

  return (
    <PhonemeGameShell
      gameName="Lion's Roar"
      accentClass="text-coral"
      bgAccentClass="bg-coral"
      passLabel="RAWR! What a roar! 🦁"
      tryAgainLabel='Try a strong, growly "rrrr"'
      promptText='Say a strong, growly "rrrr" like a lion'
      visual={
        <div className="h-40 flex items-center justify-center">
          <span
            className="text-6xl transition-transform duration-500 ease-out"
            style={{ transform: `scale(${roar})` }}
          >
            🦁
          </span>
        </div>
      }
      {...attempt}
    />
  )
}
