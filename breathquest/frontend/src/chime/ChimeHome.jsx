import { useState, useEffect } from 'react'
import { Rocket, Waves, Music2, Wind, Droplets, Mic } from 'lucide-react'
import GameCard from '../vaakmirror/components/GameCard.jsx'
import { getPassedLevels, getUnlockedLevels } from './lib/levelProgress'

const GAMES = [
  { levelId: 'aa', to: '/play/chime/rocket-launch', title: 'Rocket Launch',
    blurb: 'Say a big loud "aaa" to launch your rocket as high as you can.',
    accent: '#FF9B54', icon: Rocket },
  { levelId: 'oo', to: '/play/chime/submarine-dive', title: 'Submarine Dive',
    blurb: 'A long, low "oooo" sends your submarine deeper.',
    accent: '#2FB8A6', icon: Waves },
  { levelId: 'ma', to: '/play/chime/drum-island', title: 'Drum Island',
    blurb: 'Keep a steady "ma-ma-ma" beat on the drums.',
    accent: '#F4B942', icon: Music2 },
  { levelId: 'fa', to: '/play/chime/wind-chime-garden', title: 'Wind Chime Garden',
    blurb: 'A long, breathy "ffff" stirs the chimes in the breeze.',
    accent: '#1D9E75', icon: Wind },
  { levelId: 'ha', to: '/play/chime/bubble-wrap-pop', title: 'Bubble Wrap Pop',
    blurb: 'A sharp "ha!" pops the bubbles one by one.',
    accent: '#7850DC', icon: Droplets },
  { levelId: 'village-builder', to: '/play/chime/village-builder', title: 'Village Builder',
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
    <section className="min-h-screen bg-ink">
      <div className="max-w-6xl mx-auto px-6 py-20">
        <p className="font-vm-mono text-xs uppercase tracking-widest text-mint mb-3">
          Sound Practice
        </p>
        <h1 className="font-vm-display text-4xl md:text-5xl font-bold text-paper mb-4">
          Practice a sound, unlock the next game.
        </h1>
        <p className="text-paper/60 max-w-lg mb-12">
          Each game practices a different sound. One passing attempt
          unlocks the next game.
        </p>

        <div className="grid md:grid-cols-3 gap-5">
          {GAMES.map((g, i) => (
            <GameCard
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
