import { useState, useEffect } from 'react'
import { Rocket, Waves, Sparkles, Wind, Droplets, Bell, PawPrint, Mic } from 'lucide-react'
import ChimeGameCard from './ChimeGameCard.jsx'
import { Sidebar } from '../components/ui'
import { KID_SIDEBAR_ITEMS } from '../lib/kidSidebarItems'
import { useAuth } from '../context/AuthContext'
import { getPassedLevels, getUnlockedLevels, LEVEL_ORDER, LEVEL_ROUTES } from './lib/levelProgress'
import { getEvents } from './lib/api'
import './chime-home.css'

const GAMES = [
  { levelId: 'aa', to: LEVEL_ROUTES.aa, title: 'Rocket Launch',
    blurb: 'Say a big loud "aaa" to launch your rocket as high as you can.',
    accent: '#FF9B54', icon: Rocket },
  { levelId: 'oo', to: LEVEL_ROUTES.oo, title: 'Submarine Dive',
    blurb: 'A long, low "oooo" sends your submarine deeper.',
    accent: '#2FB8A6', icon: Waves },
  { levelId: 'ma', to: LEVEL_ROUTES.ma, title: 'Firefly Jar',
    blurb: 'Say "ma-ma-ma" to catch fireflies and fill your jar.',
    accent: '#F4B942', icon: Sparkles },
  { levelId: 'fa', to: LEVEL_ROUTES.fa, title: 'Wind Chime Garden',
    blurb: 'A long, breathy "ffff" stirs the chimes in the breeze.',
    accent: '#1D9E75', icon: Wind },
  { levelId: 'ha', to: LEVEL_ROUTES.ha, title: 'Bubble Wrap Pop',
    blurb: 'A sharp "ha!" pops the bubbles one by one.',
    accent: '#7850DC', icon: Droplets },
  { levelId: 'ee', to: LEVEL_ROUTES.ee, title: 'Xylophone Tower',
    blurb: 'A long, bright "eeee" rings the bells and climbs you to the top.',
    accent: '#FACC15', icon: Bell },
  { levelId: 'r', to: LEVEL_ROUTES.r, title: "Lion's Roar",
    blurb: 'A strong, growly "rrrr" makes your lion roar louder.',
    accent: '#F0604A', icon: PawPrint },
  { levelId: 'village-builder', to: LEVEL_ROUTES['village-builder'], title: 'Village Builder',
    blurb: 'Say the word shown on screen. The closer your pronunciation, the bigger the building you earn.',
    accent: '#F472B6', icon: Mic },
]

export default function ChimeHome() {
  const [passed, setPassed]     = useState(null) // null = still loading
  const [unlocked, setUnlocked] = useState(null)
  const [plays, setPlays]       = useState({})

  useEffect(() => {
    let cancelled = false
    getPassedLevels()
      .then(p => {
        if (cancelled) return
        setPassed(p)
        setUnlocked(getUnlockedLevels(p))
      })
      .catch(() => { if (!cancelled) { setPassed({}); setUnlocked({ aa: true }) } }) // fail-safe: first game only

    // Play counts — same events list getPassedLevels already fetches, just
    // tallied per level instead of reduced to pass/fail, so cards can show
    // "N plays" the way BreathQuest's stars card shows a play count.
    getEvents()
      .then(events => {
        if (cancelled) return
        const counts = {}
        for (const e of events) {
          if (!e.is_valid_attempt) continue
          counts[e.level_id] = (counts[e.level_id] || 0) + 1
        }
        setPlays(counts)
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [])

  const passedCount = passed ? LEVEL_ORDER.filter(id => passed[id]).length : 0
  const totalCount = LEVEL_ORDER.length

  const { patient, logout } = useAuth()

  return (
    <div className="flex min-h-screen">
      <Sidebar role="kid" items={KID_SIDEBAR_ITEMS} name={patient?.first_name} onLogout={logout} />
      <section className="relative flex-1 bg-ink overflow-hidden overflow-y-auto">
      {/* Progress strip — same mechanic as BreathQuest's total-stars bar,
          just counting games passed instead of a 0-3 star sum, since
          Chime's own data is pass/fail rather than graded. */}
      <div className="relative flex items-center justify-center gap-2 px-6 py-2.5 border-b border-white/10">
        <span className="text-coral font-bold text-sm">🔔 {passedCount} / {totalCount} games passed</span>
        {passedCount === totalCount && passed && (
          <span className="text-xs bg-coral/20 text-coral px-2 py-0.5 rounded-full font-bold">Perfect!</span>
        )}
      </div>
      {/* ambient color life behind the grid — quiet, blurred, just enough
          to say "these games are colorful" before you even reach a card */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.14]">
        {GAMES.map((g, i) => (
          <div
            key={g.levelId}
            className="absolute w-72 h-72 rounded-full blur-[100px]"
            style={{
              backgroundColor: g.accent,
              left: `${(i * 37) % 100}%`,
              top: `${(i * 53) % 90}%`,
            }}
          />
        ))}
      </div>

      <div className="relative max-w-6xl mx-auto px-6 py-20">
        <p className="font-vm-mono text-xs uppercase tracking-widest text-mint mb-3">
          Sound Practice
        </p>
        <h1 className="chime-display text-4xl md:text-5xl font-extrabold mb-4">
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: 'linear-gradient(90deg, #FF9B54, #2FB8A6, #7850DC, #F472B6)' }}
          >
            Practice a sound,
          </span>
          <br />
          <span className="text-paper">unlock the next game.</span>
        </h1>
        <p className="text-paper/60 max-w-lg mb-12">
          Each game practices a different sound. One passing attempt
          unlocks the next game.
        </p>

        <div className="grid md:grid-cols-3 gap-5">
          {GAMES.map((g, i) => (
            <ChimeGameCard
              key={g.levelId}
              to={g.to}
              eyebrow={`Game ${i + 1}`}
              title={g.title}
              blurb={g.blurb}
              accent={g.accent}
              icon={g.icon}
              live={unlocked ? !!unlocked[g.levelId] : g.levelId === 'aa'}
              passed={passed ? !!passed[g.levelId] : false}
              plays={plays[g.levelId] || 0}
              lockedReason={i > 0 ? `Complete ${GAMES[i - 1].title} first` : undefined}
            />
          ))}
        </div>

        {/* All complete! */}
        {passed && passedCount === totalCount && (
          <div className="mt-8 p-6 rounded-2xl text-center border border-coral/30 bg-coral/5">
            <div className="text-4xl mb-2">🏆</div>
            <p className="chime-display text-xl font-bold text-coral">All games passed!</p>
            <p className="text-paper/50 text-sm mt-1">Every sound, unlocked. Nice work!</p>
          </div>
        )}
      </div>
      </section>
    </div>
  )
}
