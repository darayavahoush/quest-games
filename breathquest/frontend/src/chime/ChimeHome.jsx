import { Mic } from 'lucide-react'
import GameCard from '../vaakmirror/components/GameCard.jsx'

export default function ChimeHome() {
  return (
    <section className="min-h-screen bg-ink">
      <div className="max-w-6xl mx-auto px-6 py-20">
        <p className="font-vm-mono text-xs uppercase tracking-widest text-mint mb-3">
          Sound Practice
        </p>
        <h1 className="font-vm-display text-4xl md:text-5xl font-bold text-paper mb-4">
          Say the word, build the village.
        </h1>
        <p className="text-paper/60 max-w-lg mb-12">
          Say each word out loud into the mic. Get it close enough and a new
          building pops up in your village.
        </p>

        <div className="grid md:grid-cols-3 gap-5">
          <GameCard
            to="/play/chime/village-builder"
            eyebrow="Game 1"
            title="Village Builder"
            blurb="Say the word shown on screen. The closer your pronunciation, the bigger the building you earn."
            accent="#F472B6"
            icon={Mic}
            live={true}
          />
        </div>
      </div>
    </section>
  )
}
