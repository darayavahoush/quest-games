import { useNavigate } from 'react-router-dom'

// A handful of drifting embers rising past the flame — fixed positions so
// they don't jump around on re-render, staggered delays/durations so they
// don't move in visible lockstep.
const EMBERS = [
  { left: '22%', delay: '0s',    duration: '11s', size: 5 },
  { left: '68%', delay: '2.5s',  duration: '13s', size: 4 },
  { left: '45%', delay: '5s',    duration: '10s', size: 3 },
  { left: '78%', delay: '1s',    duration: '14s', size: 5 },
  { left: '12%', delay: '7s',    duration: '12s', size: 4 },
  { left: '58%', delay: '4s',    duration: '15s', size: 3 },
]

export default function Landing() {
  const navigate = useNavigate()

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 py-16 relative overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, #12142E 0%, #241F49 38%, #6B4A8A 78%, #9A5F72 100%)',
      }}
    >
      {/* Drifting embers — the one signature motion on this page */}
      <div className="absolute inset-0 pointer-events-none motion-reduce:hidden" aria-hidden="true">
        {EMBERS.map((e, i) => (
          <span
            key={i}
            className="absolute bottom-[30%] rounded-full bg-ember-glow animate-drift-ember"
            style={{
              left: e.left,
              width: e.size,
              height: e.size,
              animationDelay: e.delay,
              animationDuration: e.duration,
              boxShadow: '0 0 6px 2px rgba(255,208,138,0.5)',
            }}
          />
        ))}
      </div>

      {/* Flame — the visual thesis: breath is what moves through every game here */}
      <div className="relative z-10 mb-6 motion-safe:animate-flicker" style={{ transformOrigin: 'bottom center' }}>
        <svg width="52" height="70" viewBox="0 0 52 70" fill="none">
          <path
            d="M26 2C26 2 8 22 8 40C8 54 16 64 26 64C36 64 44 54 44 40C44 22 26 2 26 2Z"
            fill="url(#flameOuter)"
          />
          <path
            d="M26 20C26 20 17 32 17 42C17 50 21 56 26 56C31 56 35 50 35 42C35 32 26 20 26 20Z"
            fill="url(#flameInner)"
          />
          <defs>
            <linearGradient id="flameOuter" x1="26" y1="2" x2="26" y2="64" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FF9B54" />
              <stop offset="1" stopColor="#FF6B4A" />
            </linearGradient>
            <linearGradient id="flameInner" x1="26" y1="20" x2="26" y2="56" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FFD08A" />
              <stop offset="1" stopColor="#FF9B54" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Headline */}
      <div className="text-center mb-3 relative z-10 max-w-lg">
        <h1 className="font-vm-display text-4xl sm:text-5xl font-bold text-paper leading-tight text-balance">
          Blow, speak, and watch the world move.
        </h1>
        <p className="text-paper/60 text-lg mt-4 max-w-md mx-auto">
          Three small worlds built around one big idea — a real breath, a real word,
          moving something real on screen.
        </p>
      </div>

      {/* World chips */}
      <div className="flex flex-wrap items-center justify-center gap-2 mt-8 mb-14 relative z-10">
        <span className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-ember/15 text-ember-glow border border-ember/25">
          🐉 BreathQuest
        </span>
        <span className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-mint/15 text-mint-light border border-mint/25">
          🪞 VaakMirror
        </span>
        <span className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-coral/15 text-coral-light border border-coral/25">
          🔔 Chime
        </span>
      </div>

      {/* Two portals */}
      <div className="flex flex-col sm:flex-row gap-5 w-full max-w-lg relative z-10">
        <button
          onClick={() => navigate('/play')}
          className="flex-1 group relative overflow-hidden rounded-3xl p-8 text-center
                     bg-dusk-mid/40 backdrop-blur-sm border border-ember/20
                     hover:border-ember/50 hover:bg-dusk-mid/60
                     transition-all duration-300"
        >
          <div className="text-5xl mb-3">🐣</div>
          <h2 className="font-vm-display text-xl font-bold text-ember-glow mb-1">I'm a Kid!</h2>
          <p className="text-paper/50 text-sm">Pick a game and play</p>
        </button>

        <button
          onClick={() => navigate('/therapist/login')}
          className="flex-1 group relative overflow-hidden rounded-3xl p-8 text-center
                     bg-dusk-mid/40 backdrop-blur-sm border border-mint/20
                     hover:border-mint/50 hover:bg-dusk-mid/60
                     transition-all duration-300"
        >
          <div className="text-5xl mb-3">🩺</div>
          <h2 className="font-vm-display text-xl font-bold text-mint-light mb-1">Therapist</h2>
          <p className="text-paper/50 text-sm">View dashboard</p>
        </button>
      </div>

      <p className="mt-14 text-paper/25 text-xs relative z-10">Quest Games © 2026</p>
    </div>
  )
}
