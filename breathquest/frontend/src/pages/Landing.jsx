import { useNavigate, useSearchParams } from 'react-router-dom'
import { Stethoscope, Heart, Sparkles, ArrowRight, Volume2 } from 'lucide-react'
import { Avatar } from '../components/ui'
import { speak } from '../lib/speech'

const EMBERS = [
  { left: '22%', delay: '0s',    duration: '11s', size: 5 },
  { left: '68%', delay: '2.5s',  duration: '13s', size: 4 },
  { left: '45%', delay: '5s',    duration: '10s', size: 3 },
  { left: '78%', delay: '1s',    duration: '14s', size: 5 },
  { left: '12%', delay: '7s',    duration: '12s', size: 4 },
  { left: '58%', delay: '4s',    duration: '15s', size: 3 },
]

function BreathBuddy() {
  return (
    <div className="relative w-28 h-28 mx-auto motion-safe:animate-float">
      <div className="absolute inset-2 rounded-full bg-ember/25 blur-2xl motion-safe:animate-pulse-slow" />
      <svg viewBox="0 0 120 120" className="relative w-full h-full">
        <defs>
          <linearGradient id="buddyBody" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFD08A" />
            <stop offset="100%" stopColor="#FF9B54" />
          </linearGradient>
        </defs>
        <path d="M58 8c5-7 13-8 13-2 0 4-4 6-7 7" stroke="#FFD08A" strokeWidth="3"
              strokeLinecap="round" fill="none" opacity="0.8" />
        <path d="M60 18c24 0 40 20 40 44 0 26-18 42-40 42S20 88 20 62c0-24 16-44 40-44Z"
              fill="url(#buddyBody)" />
        <circle cx="42" cy="70" r="7" fill="#FF6B4A" opacity="0.45" />
        <circle cx="78" cy="70" r="7" fill="#FF6B4A" opacity="0.45" />
        <path d="M40 58q6-7 12 0" stroke="#7A3B1E" strokeWidth="4" strokeLinecap="round" fill="none" />
        <path d="M68 58q6-7 12 0" stroke="#7A3B1E" strokeWidth="4" strokeLinecap="round" fill="none" />
        <path d="M49 78q11 9 22 0" stroke="#7A3B1E" strokeWidth="4" strokeLinecap="round" fill="none" />
      </svg>
    </div>
  )
}

export default function Landing() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // Reached via "Sign in" (already-registered users) -- skip the email
  // verification hop and go straight to the role's real login page.
  // Reached via "Start Assessment" (default) -- go through /verify first.
  const isSignIn = searchParams.get('mode') === 'signin'
  const routeFor = (dest) => isSignIn ? dest : `/verify?dest=${dest}`
  // Manual tap-to-hear only, no auto-play — see Play.jsx for why nav/menu
  // screens don't auto-speak while the actual games still do.
  const replayTagline = () => speak(
    'Blow, speak, and watch the world move. Are you a kid ready to play, a therapist, or a parent?',
  )

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 py-16 relative overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, #12142E 0%, #241F49 38%, #6B4A8A 78%, #9A5F72 100%)',
      }}
    >
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

      <BreathBuddy />

      <div className="text-center mt-6 mb-3 relative z-10 max-w-lg">
        <h1 className="font-vm-display text-4xl sm:text-5xl font-bold text-paper leading-tight text-balance">
          Blow, speak, and watch the world move.
        </h1>
        <p className="text-paper/60 text-lg mt-4 max-w-md mx-auto flex items-center justify-center gap-2 flex-wrap">
          <span>Three small worlds built around one big idea — a real breath, a real word,
          moving something real on screen.</span>
          <button onClick={replayTagline} className="text-paper/30 hover:text-paper/60 transition-colors" aria-label="Hear this again">
            <Volume2 className="w-4 h-4" />
          </button>
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 mt-8 mb-14 relative z-10">
        <span className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-ember/15 text-ember-glow border border-ember/25">
          🐉 BreathQuest
        </span>
        <span className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-mint/15 text-mint-light border border-mint/25">
          🪞 Orpheus
        </span>
        <span className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-coral/15 text-coral-light border border-coral/25">
          🔔 Chime
        </span>
      </div>

      <div className="flex flex-col sm:flex-row gap-5 w-full max-w-3xl relative z-10">
        <button
          onClick={() => navigate(routeFor('/play'))}
          className="flex-1 group relative overflow-hidden rounded-[2rem] p-8 text-center
                     bg-gradient-to-br from-ember/20 to-dusk-mid/50 backdrop-blur-sm border-2 border-ember/25
                     hover:border-ember/60 hover:-translate-y-1 hover:shadow-2xl hover:shadow-ember/20
                     transition-all duration-300"
        >
          <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-ember/10 blur-2xl
                          group-hover:bg-ember/20 transition-colors duration-300" />
          <div className="relative">
            <div className="text-5xl mb-3 group-hover:scale-110 transition-transform duration-300">🐣</div>
            <h2 className="font-vm-display text-xl font-bold text-ember-glow mb-1">I'm a Kid!</h2>
            <p className="text-paper/50 text-sm mb-4">Pick a game and play</p>
            <div className="flex items-center justify-center -space-x-2 mb-2">
              <Avatar avatar="chick" size="sm" />
              <Avatar avatar="dragon" size="sm" />
              <Avatar avatar="fox" size="sm" />
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-ember-glow">
              Let's go <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </span>
          </div>
        </button>

        <button
          onClick={() => navigate(routeFor('/therapist/login'))}
          className="flex-1 group relative overflow-hidden rounded-[2rem] p-8 text-center
                     bg-gradient-to-br from-mint/15 to-dusk-mid/50 backdrop-blur-sm border-2 border-mint/25
                     hover:border-mint/60 hover:-translate-y-1 hover:shadow-2xl hover:shadow-mint/20
                     transition-all duration-300"
        >
          <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-mint/10 blur-2xl
                          group-hover:bg-mint/20 transition-colors duration-300" />
          <div className="relative">
            <div className="w-14 h-14 rounded-2xl bg-mint/15 border border-mint/25 flex items-center
                            justify-center mx-auto mb-3">
              <Stethoscope className="w-7 h-7 text-mint-light" />
            </div>
            <h2 className="font-vm-display text-xl font-bold text-mint-light mb-1">Therapist/Teacher</h2>
            <p className="text-paper/50 text-sm mb-4">View dashboard &amp; progress</p>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-mint-light">
              Sign in <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </span>
          </div>
        </button>

        <button
          onClick={() => navigate(routeFor('/parent/login'))}
          className="flex-1 group relative overflow-hidden rounded-[2rem] p-8 text-center
                     bg-gradient-to-br from-coral/15 to-dusk-mid/50 backdrop-blur-sm border-2 border-coral/25
                     hover:border-coral/60 hover:-translate-y-1 hover:shadow-2xl hover:shadow-coral/20
                     transition-all duration-300"
        >
          <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-coral/10 blur-2xl
                          group-hover:bg-coral/20 transition-colors duration-300" />
          <div className="relative">
            <div className="w-14 h-14 rounded-2xl bg-coral/15 border border-coral/25 flex items-center
                            justify-center mx-auto mb-3">
              <Heart className="w-7 h-7 text-coral-light" />
            </div>
            <h2 className="font-vm-display text-xl font-bold text-coral-light mb-1">Parent</h2>
            <p className="text-paper/50 text-sm mb-4">Follow along at home</p>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-coral-light">
              Sign in <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </span>
          </div>
        </button>
      </div>

      <p className="mt-14 text-paper/25 text-xs relative z-10 flex items-center gap-1.5">
        <Sparkles className="w-3 h-3" /> Quest Games © 2026
      </p>
    </div>
  )
}
