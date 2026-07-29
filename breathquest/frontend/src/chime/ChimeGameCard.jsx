import { Link } from 'react-router-dom'
import { ArrowUpRight, Lock } from 'lucide-react'

/**
 * Chime's own game-picker card.
 *
 * Deliberately NOT the vaakmirror GameCard: that one is a flat, minimal,
 * dark-SaaS card built for a different product's tone. Chime's actual
 * games (Rocket Launch, Submarine Dive, Drum Island, Wind Chime Garden,
 * Bubble Wrap Pop) all use a glowing-particle, Baloo 2, per-phoneme-color
 * language. This card carries that same language onto the picker so the
 * homepage doesn't feel like a different, deader app than the games it
 * links to.
 */
export default function ChimeGameCard({ to, eyebrow, title, blurb, accent, icon: Icon, live = true }) {
  const content = (
    <div
      className={`chime-card group relative h-full rounded-[28px] p-7 overflow-hidden transition-all duration-300 ${
        live ? 'chime-card--live hover:-translate-y-1.5' : 'chime-card--locked'
      }`}
      style={{ '--accent': accent }}
    >
      {/* ambient glow wash, only alive on unlocked cards */}
      {live && (
        <div
          className="pointer-events-none absolute -top-10 -right-10 w-40 h-40 rounded-full blur-3xl opacity-25 group-hover:opacity-40 transition-opacity duration-300"
          style={{ backgroundColor: accent }}
        />
      )}

      <div
        className={`relative w-14 h-14 rounded-2xl flex items-center justify-center mb-6 transition-transform duration-300 ${
          live ? 'group-hover:scale-110' : 'grayscale opacity-50'
        }`}
        style={{
          backgroundColor: live ? accent : '#3a3a44',
          boxShadow: live ? `0 0 0 6px ${accent}22, 0 8px 24px -6px ${accent}88` : 'none',
        }}
      >
        <Icon size={24} className="text-ink-deep" strokeWidth={2.4} />
        {/* breathing ring, echoes the audio/voicing feel of the games themselves */}
        {live && (
          <span
            className="absolute inset-0 rounded-2xl animate-chime-pulse"
            style={{ boxShadow: `0 0 0 0 ${accent}66` }}
          />
        )}
      </div>

      <p className="font-vm-mono text-[11px] uppercase tracking-widest mb-2" style={{ color: live ? accent : '#6b6b76' }}>
        {eyebrow}
      </p>
      <h3 className="chime-display text-[26px] leading-tight font-bold text-paper mb-2">
        {title}
      </h3>
      <p className="text-paper/55 text-sm leading-relaxed mb-8">{blurb}</p>

      <div className="absolute bottom-7 right-7">
        {live ? (
          <span
            className="w-10 h-10 rounded-full flex items-center justify-center transition-colors"
            style={{ backgroundColor: `${accent}1A`, border: `1px solid ${accent}55` }}
          >
            <ArrowUpRight size={17} style={{ color: accent }} />
          </span>
        ) : (
          <span className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center">
            <Lock size={14} className="text-paper/35" />
          </span>
        )}
      </div>
    </div>
  )

  return live ? (
    <Link to={to} className="block h-full">
      {content}
    </Link>
  ) : (
    <div className="h-full cursor-not-allowed" title="Unlock this game by passing the one before it">
      {content}
    </div>
  )
}
