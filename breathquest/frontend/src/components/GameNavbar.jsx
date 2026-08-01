import { useNavigate } from 'react-router-dom'
import { Flame, Home, Wind, Waves, Bell, Rabbit } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { Avatar } from './ui'

// Shared kid-facing top bar for every game hub/home page (BreathQuest,
// Chime, Orpheus, Voice Hurdle Race). Before this, each hub built its own
// bespoke header (or had none at all — ChimeHome and VaakMirrorHome had no
// header whatsoever), so a kid mid-Chime-session had no way to jump to
// Orpheus or back to the app picker without logging out and back in.
// One shared component = one place to fix header bugs, and a kid can now
// hop between all 4 apps from anywhere.
//
// Visual identity deliberately borrows the "dusk + ember" palette already
// established on the game-picker landing page (Landing.jsx / GamePicker) —
// that page is the one surface that already belongs to all four games at
// once, so re-using its palette here (instead of a generic dark/black
// glass bar) makes this read as the same cross-app layer, not a fifth
// unrelated style.
const APPS = [
  { id: 'breathquest', label: 'BreathQuest', to: '/play/levels',        icon: Wind,   accent: '#FF9B54' },
  { id: 'vaakmirror',  label: 'Orpheus',     to: '/play/vaakmirror',    icon: Waves,  accent: '#2FB8A6' },
  { id: 'chime',       label: 'Chime',       to: '/play/chime',         icon: Bell,   accent: '#F0604A' },
  { id: 'voicehurdle', label: 'Voice Hurdle', to: '/play/voice-hurdle-race', icon: Rabbit, accent: '#60A5FA' },
]

export default function GameNavbar({ activeApp }) {
  const { patient, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <header className="sticky top-0 z-50 bg-gradient-to-b from-dusk-deep/95 to-dusk-mid/85 backdrop-blur border-b border-ember/20 shadow-[0_1px_0_0_rgba(255,155,84,0.08)]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-2 sm:gap-4">
        {/* Wordmark — the one constant across all four games */}
        <div className="flex items-center gap-1.5 pr-2 sm:pr-3 mr-1 border-r border-white/10 shrink-0">
          <Flame size={17} className="text-ember" fill="currentColor" fillOpacity={0.25} />
          <span className="hidden sm:inline font-display font-bold text-white text-sm tracking-tight">
            Quest
          </span>
        </div>

        <button
          onClick={() => navigate('/play')}
          className="flex items-center gap-1.5 text-white/50 hover:text-white transition-colors shrink-0"
          title="All games"
        >
          <Home size={17} />
          <span className="hidden md:inline text-sm font-medium">All games</span>
        </button>

        <nav className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto">
          {APPS.map((app) => {
            const Icon = app.icon
            const isActive = app.id === activeApp
            return (
              <button
                key={app.id}
                onClick={() => navigate(app.to)}
                title={app.label}
                className="relative flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-full text-xs sm:text-sm font-medium transition-colors shrink-0"
                style={{
                  color: isActive ? app.accent : 'rgba(255,255,255,0.5)',
                  backgroundColor: isActive ? `${app.accent}1f` : 'transparent',
                }}
              >
                <Icon size={15} />
                <span className="hidden md:inline">{app.label}</span>
                {isActive && (
                  <span
                    className="absolute -bottom-[1px] left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full animate-pulse-slow"
                    style={{ backgroundColor: app.accent, boxShadow: `0 0 6px 1px ${app.accent}` }}
                  />
                )}
              </button>
            )
          })}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <Avatar avatar={patient?.avatar} size="sm" />
          <div className="hidden sm:block leading-tight">
            <div className="text-white text-sm font-display font-bold">{patient?.first_name}</div>
            <button onClick={logout} className="text-white/30 hover:text-white/60 text-[11px] transition-colors">
              Switch player
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
