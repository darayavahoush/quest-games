import { Smile, Wand2, Music, Users, Blend } from 'lucide-react'
import { Link } from 'react-router-dom'
import GameCard from './components/GameCard.jsx'
import MouthMotif from './components/MouthMotif.jsx'
import { Sidebar } from '../components/ui'
import { KID_SIDEBAR_ITEMS } from '../lib/kidSidebarItems'
import { useAuth } from '../context/AuthContext'

export default function Landing() {
  const { patient, logout } = useAuth()

  return (
    <div className="flex min-h-screen">
      <Sidebar role="kid" items={KID_SIDEBAR_ITEMS} name={patient?.first_name} onLogout={logout} />
      <div className="flex-1 overflow-y-auto">
      {/* Hero */}
      <section className="bg-ink relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-6 pt-20 pb-24 grid md:grid-cols-2 gap-12 items-center relative z-10">
          <div>
            <p className="font-vm-mono text-xs uppercase tracking-widest text-mint mb-5">
              Module 02 — Face &amp; Mouth Biofeedback
            </p>
            <h1 className="font-vm-display text-5xl md:text-6xl font-bold text-paper leading-[1.05] text-balance mb-6">
              Practice makes the shape stick.
            </h1>
            <p className="text-paper/65 text-lg leading-relaxed mb-9 max-w-md">
              A camera shows children their own mouth next to the shape they're aiming
              for, and gently guides them there — no reading required, no pressure to
              perform.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/play/vaakmirror/mirror-mirror"
                className="px-6 py-3.5 rounded-full bg-coral text-paper font-semibold hover:bg-coral-dark transition-colors"
              >
                Start Mirror Mirror
              </Link>
            </div>
          </div>
          <div className="relative">
            <div className="aspect-[4/3] rounded-[2.5rem] bg-ink-light border border-white/10 flex items-center justify-center p-10">
              <MouthMotif className="w-full max-w-xs" />
            </div>
            <div className="absolute -bottom-4 -left-4 bg-paper text-ink px-5 py-3 rounded-2xl shadow-xl">
              <p className="font-vm-mono text-[10px] uppercase tracking-widest text-mint-dark">Live match</p>
              <p className="font-vm-display font-bold text-lg">Alveolar &middot; 82%</p>
            </div>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-[36rem] h-[36rem] rounded-full bg-mint/10 blur-3xl -translate-y-1/3 translate-x-1/3" />
      </section>

      {/* Who it's for */}
      <section className="bg-ink border-t border-white/10">
        <div className="max-w-6xl mx-auto px-6 py-6 flex flex-wrap items-center gap-x-8 gap-y-2 text-paper/50 text-sm">
          <span className="flex items-center gap-2">
            <Users size={14} /> Articulation disorders
          </span>
          <span>&middot;</span>
          <span>Thick tongue from medication</span>
          <span>&middot;</span>
          <span>Autism &amp; face awareness</span>
        </div>
      </section>

      {/* Games grid */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="flex items-end justify-between mb-10 flex-wrap gap-4">
          <div>
            <h2 className="font-vm-display text-3xl font-bold text-ink mb-2">Four ways to practice</h2>
            <p className="text-ink/55 max-w-lg">
              Each game targets a different skill — shape matching, tongue positioning,
              sound-to-shape timing, and telling two similar sounds apart.
            </p>
          </div>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
          <GameCard
            to="/play/vaakmirror/mirror-mirror"
            eyebrow="Game 1"
            title="Mirror Mirror"
            blurb="Match the mouth shape the animated character shows you. Hold it for two seconds to pass."
            accent="#F4B942"
            icon={Smile}
          />
          <GameCard
            to="/play/vaakmirror/tongue-tamer"
            eyebrow="Game 2"
            title="Tongue Tamer"
            blurb="Follow the animated tongue to the roof of your mouth, behind your teeth, and back."
            accent="#2FB8A6"
            icon={Wand2}
            live={true}
          />
          <GameCard
            to="/play/vaakmirror/lip-sync-hero"
            eyebrow="Game 3"
            title="Lip Sync Hero"
            blurb="Catch each sound as it reaches you by shaping your mouth in time."
            accent="#F0604A"
            icon={Music}
            live={true}
          />
          <GameCard
            to="/play/vaakmirror/minimal-pair-drill"
            eyebrow="Game 4"
            title="Minimal Pair Drill"
            blurb="Practice two easily-confused sounds back to back — like s/sh or l/r — picked from what this kid actually struggles with."
            accent="#8B7FD6"
            icon={Blend}
            live={true}
          />
        </div>
      </section>

      {/* Taxonomy strip */}
      <section className="bg-ink-deep">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <p className="font-vm-mono text-xs uppercase tracking-widest text-mint mb-3">Under the hood</p>
          <h2 className="font-vm-display text-2xl md:text-3xl font-bold text-paper mb-8 max-w-2xl text-balance">
            Every sound is tagged by where, how, and whether it's voiced — so
            feedback points to a pattern, not just a missed sound.
          </h2>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { label: 'Place', example: 'Bilabial, Alveolar, Velar…', color: '#F4B942' },
              { label: 'Manner', example: 'Plosive, Fricative, Nasal…', color: '#2FB8A6' },
              { label: 'Voicing', example: 'Voiced or unvoiced', color: '#F0604A' },
            ].map((t) => (
              <div key={t.label} className="rounded-2xl border border-white/10 p-6">
                <span
                  className="inline-block w-2 h-2 rounded-full mb-4"
                  style={{ backgroundColor: t.color }}
                />
                <p className="font-vm-display text-xl font-bold text-paper mb-1">{t.label}</p>
                <p className="text-paper/50 text-sm">{t.example}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      </div>
    </div>
  )
}
