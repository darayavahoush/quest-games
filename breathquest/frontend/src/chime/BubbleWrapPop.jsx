import usePhonemeAttempt from './lib/usePhonemeAttempt'
import PhonemeGameShell from './lib/PhonemeGameShell'

const LEVEL_ID = 'ha'

export default function BubbleWrapPop() {
  const attempt = usePhonemeAttempt(LEVEL_ID)
  const { status, result } = attempt
  const popped = status === 'result' && result ? Math.round(result.score * 5) : 0

  return (
    <PhonemeGameShell
      gameName="Bubble Wrap Pop"
      accentClass="text-brand-purple"
      bgAccentClass="bg-brand-purple"
      passLabel="Pop pop pop! 🫧"
      tryAgainLabel='Try a sharp, breathy "ha!"'
      promptText='Say a sharp "ha!" to pop the bubbles'
      visual={
        <div className="h-40 flex items-center justify-center gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <span
              key={i}
              className="text-4xl transition-opacity duration-500"
              style={{ opacity: i < popped ? 0.15 : 1 }}
            >
              🫧
            </span>
          ))}
        </div>
      }
      {...attempt}
    />
  )
}
