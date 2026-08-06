import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TrendingUp, Volume2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { Avatar } from '../../components/ui'
import { speak } from '../../lib/speech'

const APPS = [
  {
    id: 'breathquest',
    name: 'BreathQuest',
    emoji: '🐉',
    desc: 'Breath-controlled adventures — 6 levels',
    path: '/play/levels',
    accent: '#FF9B54',
    accentSoft: 'rgba(255,155,84,0.14)',
    glow: 'rgba(255,155,84,0.35)',
    motif: 'flame',
  },
  {
    id: 'vaakmirror',
    name: 'Orpheus',
    emoji: '🪞',
    desc: 'Mouth & tongue mirror games — 3 games',
    path: '/play/vaakmirror',
    accent: '#2FB8A6',
    accentSoft: 'rgba(47,184,166,0.14)',
    glow: 'rgba(47,184,166,0.35)',
    motif: 'ripple',
  },
  {
    id: 'chime',
    name: 'Chime',
    emoji: '🔔',
    desc: 'Say the word, build a village',
    path: '/play/chime',
    accent: '#F0604A',
    accentSoft: 'rgba(240,96,74,0.14)',
    glow: 'rgba(240,96,74,0.35)',
    motif: 'pulse',
  },
  {
    id: 'voice-hurdle-race',
    name: 'Voice Hurdle Race',
    emoji: '🐶',
    desc: 'Use your voice to jump hurdles',
    path: '/play/voice-hurdle-race',
    accent: '#60A5FA',
    accentSoft: 'rgba(96,165,250,0.14)',
    glow: 'rgba(96,165,250,0.35)',
    motif: 'ripple',
  },
]

function CardMotif({ motif, accent }) {
  if (motif === 'flame') {
    return (
      <div className="absolute top-6 right-6 w-8 h-8 opacity-60 group-hover:opacity-100 transition-opacity
                      duration-300 motion-safe:animate-flicker" style={{ transformOrigin: 'bottom center' }}>
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M12 1C12 1 4 10 4 18C4 23 8 27 12 27C16 27 20 23 20 18C20 10 12 1 12 1Z" fill={accent} />
        </svg>
      </div>
    )
  }
  if (motif === 'ripple') {
    return (
      <div className="absolute top-6 right-6 w-8 h-8 rounded-full border-2 opacity-50
                      group-hover:opacity-100 group-hover:scale-150 transition-all duration-500"
           style={{ borderColor: accent }} />
    )
  }
  return (
    <div className="absolute top-6 right-6 w-3 h-3 rounded-full opacity-60 group-hover:opacity-100
                    motion-safe:animate-pulse-slow transition-opacity duration-300"
         style={{ backgroundColor: accent }} />
  )
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function GamePicker() {
  const { patient, logout } = useAuth()
  const navigate = useNavigate()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 30)
    return () => clearTimeout(t)
  }, [])

  // Manual tap-to-hear only, no auto-play — see Play.jsx for why nav/menu
  // screens don't auto-speak while the actual games still do.
  const spokenGreeting = patient
    ? `${greeting()}, ${patient.first_name || 'friend'}! Pick a world to play in — each one starts the same way, take a breath.`
    : null
  const replayGreeting = () => { if (spokenGreeting) speak(spokenGreeting) }

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(180deg, #12142E 0%, #1E1E3F 100%)' }}>
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <Avatar avatar={patient?.avatar} size="sm" />
          <div>
            <span className="font-display font-bold text-white">{patient?.first_name}</span>
            <span className="text-white/30 text-xs ml-2">#{patient?.player_code}</span>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <button onClick={() => navigate('/play/progress')} className="flex items-center gap-1.5 text-white/40 hover:text-white text-sm transition-colors">
            <TrendingUp size={15} /> My Progress
          </button>
          <button onClick={logout} className="text-white/30 hover:text-white/60 text-sm transition-colors">
            Switch player
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-14">
        <div className="text-center mb-12">
          <Avatar avatar={patient?.avatar} size="xl" />
          <h1 className="font-vm-display text-4xl font-bold text-white mt-5">
            {greeting()}, {patient?.first_name || 'friend'}!
          </h1>
          <p className="text-white/40 mt-3 flex items-center justify-center gap-1.5">
            Pick a world to play in — each one starts the same way, take a breath 🌬️
            <button onClick={replayGreeting} className="text-white/25 hover:text-white/50 transition-colors" aria-label="Hear this again">
              <Volume2 className="w-3.5 h-3.5" />
            </button>
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {APPS.map((app, i) => (
            <button
              key={app.id}
              onClick={() => navigate(app.path)}
              className={`group relative text-left rounded-3xl overflow-hidden transition-all duration-500
                         hover:-translate-y-1.5 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
              style={{ transitionDelay: mounted ? `${i * 90}ms` : '0ms' }}
            >
              <div
                className="relative h-full rounded-3xl p-7 border-2 transition-all duration-300"
                style={{
                  background: `linear-gradient(160deg, ${app.accentSoft} 0%, rgba(30,30,63,0.7) 65%)`,
                  borderColor: 'rgba(255,255,255,0.08)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = app.accent + '55'
                  e.currentTarget.style.boxShadow = `0 12px 30px -8px ${app.glow}`
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <div className="absolute -bottom-8 -left-8 w-28 h-28 rounded-full blur-2xl opacity-40"
                     style={{ backgroundColor: app.accent }} />
                <CardMotif motif={app.motif} accent={app.accent} />
                <div className="relative">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl mb-4"
                       style={{ backgroundColor: app.accentSoft }}>
                    {app.emoji}
                  </div>
                  <h3 className="font-vm-display font-bold text-white text-lg mb-1.5">{app.name}</h3>
                  <p className="text-white/45 text-xs leading-relaxed mb-6">{app.desc}</p>
                  <span className="text-xs font-semibold" style={{ color: app.accent }}>
                    Play now →
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
