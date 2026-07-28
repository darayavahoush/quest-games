import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Avatar } from '../../components/ui'

const APPS = [
  {
    id: 'breathquest',
    name: 'BreathQuest',
    emoji: '🐉',
    desc: 'Breath-controlled adventures — 6 levels',
    path: '/play/levels',
    accent: '#FF9B54',
    accentSoft: 'rgba(255,155,84,0.12)',
    motif: 'flame',
  },
  {
    id: 'vaakmirror',
    name: 'VaakMirror',
    emoji: '🪞',
    desc: 'Mouth & tongue mirror games — 3 games',
    path: '/play/vaakmirror',
    accent: '#2FB8A6',
    accentSoft: 'rgba(47,184,166,0.12)',
    motif: 'ripple',
  },
  {
    id: 'chime',
    name: 'Chime',
    emoji: '🔔',
    desc: 'Say the word, build a village',
    path: '/play/chime',
    accent: '#F0604A',
    accentSoft: 'rgba(240,96,74,0.12)',
    motif: 'pulse',
  },
]

function CardMotif({ motif, accent }) {
  // A quiet, world-specific animated detail — only moves on hover, so the
  // page at rest stays calm and the motion reads as intentional, not noisy.
  if (motif === 'flame') {
    return (
      <div className="absolute top-6 right-6 w-8 h-8 opacity-0 group-hover:opacity-100 transition-opacity duration-300 group-hover:animate-flicker" style={{ transformOrigin: 'bottom center' }}>
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M12 1C12 1 4 10 4 18C4 23 8 27 12 27C16 27 20 23 20 18C20 10 12 1 12 1Z" fill={accent} />
        </svg>
      </div>
    )
  }
  if (motif === 'ripple') {
    return (
      <div className="absolute top-6 right-6 w-8 h-8 rounded-full border-2 opacity-0 group-hover:opacity-100 group-hover:scale-150 transition-all duration-500" style={{ borderColor: accent }} />
    )
  }
  return (
    <div className="absolute top-6 right-6 w-3 h-3 rounded-full opacity-0 group-hover:opacity-100 group-hover:animate-pulse-slow transition-opacity duration-300" style={{ backgroundColor: accent }} />
  )
}

export default function GamePicker() {
  const { patient, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div
      className="min-h-screen"
      style={{ background: 'linear-gradient(180deg, #12142E 0%, #1E1E3F 100%)' }}
    >
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <Avatar avatar={patient?.avatar} size="sm" />
          <div>
            <span className="font-display font-bold text-white">{patient?.first_name}</span>
            <span className="text-white/30 text-xs ml-2">#{patient?.player_code}</span>
          </div>
        </div>
        <button onClick={logout} className="text-white/30 hover:text-white/60 text-sm transition-colors">
          Switch player
        </button>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-14">
        <div className="text-center mb-12">
          <h1 className="font-vm-display text-4xl font-bold text-white">
            Pick a world to play in
          </h1>
          <p className="text-white/40 mt-3">Each one starts the same way — take a breath 🌬️</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {APPS.map((app) => (
            <button
              key={app.id}
              onClick={() => navigate(app.path)}
              className="group relative text-left rounded-3xl overflow-hidden transition-all duration-300 hover:-translate-y-1"
            >
              <div
                className="relative h-full rounded-3xl p-7 border transition-colors duration-300"
                style={{
                  background: `linear-gradient(160deg, ${app.accentSoft} 0%, rgba(30,30,63,0.6) 60%)`,
                  borderColor: 'rgba(255,255,255,0.08)',
                }}
              >
                <CardMotif motif={app.motif} accent={app.accent} />
                <div className="text-5xl mb-4">{app.emoji}</div>
                <h3 className="font-vm-display font-bold text-white text-lg mb-1.5">{app.name}</h3>
                <p className="text-white/45 text-xs leading-relaxed mb-6">{app.desc}</p>
                <span className="text-xs font-semibold" style={{ color: app.accent }}>
                  Play now →
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
