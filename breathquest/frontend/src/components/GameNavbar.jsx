import { useNavigate } from 'react-router-dom'
import { Home, Wind, Waves, Bell, Rabbit } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { Avatar } from './ui'

// Shared kid-facing top bar for every game hub/home page (BreathQuest,
// Chime, Orpheus, Voice Hurdle Race). Before this, each hub built its own
// bespoke header (or had none at all — ChimeHome and VaakMirrorHome had no
// header whatsoever), so a kid mid-Chime-session had no way to jump to
// Orpheus or back to the app picker without logging out and back in.
// One shared component = one place to fix header bugs, and a kid can now
// hop between all 4 apps from anywhere.
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
    <header className="sticky top-0 z-50 bg-black/40 backdrop-blur border-b border-white/10">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <button
          onClick={() => navigate('/play')}
          className="flex items-center gap-2 text-white/60 hover:text-white transition-colors shrink-0"
          title="All games"
        >
          <Home size={18} />
          <span className="hidden sm:inline text-sm font-medium">All games</span>
        </button>

        <nav className="flex items-center gap-1">
          {APPS.map((app) => {
            const Icon = app.icon
            const isActive = app.id === activeApp
            return (
              <button
                key={app.id}
                onClick={() => navigate(app.to)}
                title={app.label}
                className="relative flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-full text-xs sm:text-sm font-medium transition-colors"
                style={{
                  color: isActive ? app.accent : 'rgba(255,255,255,0.5)',
                  backgroundColor: isActive ? `${app.accent}1f` : 'transparent',
                }}
              >
                <Icon size={15} />
                <span className="hidden md:inline">{app.label}</span>
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
