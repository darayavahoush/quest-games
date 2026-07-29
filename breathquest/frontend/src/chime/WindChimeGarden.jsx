import usePhonemeAttempt from './lib/usePhonemeAttempt'
import PhonemeGameShell from './lib/PhonemeGameShell'

const LEVEL_ID = 'fa'

export default function WindChimeGarden() {
  const attempt = usePhonemeAttempt(LEVEL_ID)
  const { status, result } = attempt
  const sway = status === 'result' && result ? Math.round(result.score * 30) : 0

  return (
    <PhonemeGameShell
      gameName="Wind Chime Garden"
      accentClass="text-brand-teal"
      bgAccentClass="bg-brand-teal"
      passLabel="Beautiful breeze! 🎐"
      tryAgainLabel='Try a longer, breathy "ffff"'
      promptText='Say a long, breathy "ffff" to stir the chimes'
      visual={
        <div className="h-40 flex items-center justify-center">
          <span
            className="text-6xl inline-block transition-transform duration-700 ease-out"
            style={{ transform: `rotate(${sway}deg)` }}
          >
            🎐
          </span>
        </div>
      }
      {...attempt}
    />
  )
}
