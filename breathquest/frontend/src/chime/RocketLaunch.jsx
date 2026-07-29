import usePhonemeAttempt from './lib/usePhonemeAttempt'
import PhonemeGameShell from './lib/PhonemeGameShell'

const LEVEL_ID = 'aa'

export default function RocketLaunch() {
  const attempt = usePhonemeAttempt(LEVEL_ID)
  const { status, result } = attempt
  const height = status === 'result' && result ? Math.round(result.score * 140) : 0

  return (
    <PhonemeGameShell
      gameName="Rocket Launch"
      accentClass="text-ember"
      bgAccentClass="bg-ember"
      passLabel="Blast off! 🚀"
      tryAgainLabel="Almost — give it more power!"
      promptText='Say a big, loud "aaa" to launch the rocket'
      visual={
        <div className="relative h-40 flex items-end justify-center">
          <div className="w-1 h-24 bg-white/10 rounded-full" />
          <span
            className="absolute text-6xl transition-transform duration-700 ease-out"
            style={{ transform: `translateY(-${height}px)` }}
          >
            🚀
          </span>
        </div>
      }
      {...attempt}
    />
  )
}
