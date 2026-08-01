import { useState, useEffect } from 'react'
import { Rocket, Waves, Sparkles, Wind, Droplets, Feather, PawPrint, Mic } from 'lucide-react'
import ChimeGameCard from './ChimeGameCard.jsx'
import GameNavbar from '../components/GameNavbar.jsx'
import { getPassedLevels, getUnlockedLevels, LEVEL_ROUTES } from './lib/levelProgress'
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
  { levelId: 'ee', to: LEVEL_ROUTES.ee, title: 'Kite Flyer',
    blurb: 'A long, bright "eeee" lifts your kite higher into the sky.',
    accent: '#2FB8A6', icon: Feather },
  { levelId: 'r', to: LEVEL_ROUTES.r, title: "Lion's Roar",
    blurb: 'A strong, growly "rrrr" makes your lion roar louder.',
    accent: '#F0604A', icon: PawPrint },
  { levelId: 'village-builder', to: LEVEL_ROUTES['village-builder'], title: 'Village Builder',
    blurb: 'Say the word shown on screen. The closer your pronunciation, the bigger the building you earn.',
    accent: '#F472B6', icon: Mic },
]

export default function ChimeHome() {
  const [unlocked, setUnlocked] = useState(null) // null = still loading

  useEffect(() => {
    let cancelled = false
    getPassedLevels()
      .then(passed => { if (!cancelled) setUnlocked(getUnlockedLevels(passed)) })
      .catch(() => { if (!cancelled) setUnlocked({ aa: true }) }) // fail-safe: first game only
    return () => { cancelled = true }
  }, [])

  return (
    <section className="relative min-h-screen bg-ink overflow-hidden">
      <GameNavbar activeApp="chime" />
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
            />
          ))}
        </div>
      </div>
    </section>
  )
}
