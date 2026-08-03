import { Link } from 'react-router-dom'
import { useState } from 'react'
import { Lock } from 'lucide-react'

/**
 * Chime's own game-picker card.
 *
 * Deliberately NOT the vaakmirror GameCard: that one is a flat, minimal,
 * dark-SaaS card built for a different product's tone. Chime's actual
 * games (Rocket Launch, Submarine Dive, Firefly Jar, Bubble Garden,
 * Bubble Wrap Pop) all use a glowing-particle, Baloo 2, per-phoneme-color
 * language. This card carries that same language onto the picker so the
 * homepage doesn't feel like a different, deader app than the games it
 * links to.
 *
 * `passed`/`plays`/`lockedReason` bring in BreathQuest LevelSelect's
 * mechanics (what's actually locked and why, play-again vs play-now,
 * a visible play count) without adopting BreathQuest's own card visuals —
 * see the note above on why this card intentionally looks different.
 */
export default function ChimeGameCard({
  to, eyebrow, title, blurb, accent, icon: Icon, live = true,
  passed = false, plays = 0, lockedReason,
}) {
  const [hover, setHover] = useState(false)

  const content = (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`chime-card group relative h-full rounded-[28px] p-7 overflow-hidden transition-all duration-300 ${
        live ? 'chime-card--live hover:-translate-y-1.5' : 'chime-card--locked'
      }`}
      style={{ '--accent': accent }}
    >
      {/* Locked overlay — states WHY, same as BreathQuest's "Complete X
          first" rather than just a padlock with a hover tooltip. */}
      {!live && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 bg-ink/80 z-10">
          <span className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center mb-3">
            <Lock size={14} className="text-paper/40" />
          </span>
          <p className="text-paper/45 text-xs leading-relaxed">{lockedReason || 'Complete the game before this one first'}</p>
        </div>
      )}

      {/* ambient glow wash, only alive on unlocked cards */}
      {live && (
        <div
          className="pointer-events-none absolute -top-10 -right-10 w-40 h-40 rounded-full blur-3xl opacity-25 group-hover:opacity-40 transition-opacity duration-300"
          style={{ backgroundColor: accent }}
        />
      )}

      <div className="relative flex items-start justify-between mb-6">
        <div
          className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-transform duration-300 ${
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

        {/* Passed check + play count — same info BreathQuest's card shows
            via stars/plays, just without fabricating a partial 0-3 star
            score Chime's binary pass/fail data doesn't actually have. */}
        {live && (
          <div className="flex flex-col items-end gap-1">
            {passed && (
              <span
                className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: `${accent}25`, color: accent }}
              >
                ✓ Passed
              </span>
            )}
            {plays > 0 && <span className="text-[11px] text-paper/25">{plays} plays</span>}
          </div>
        )}
      </div>

      <p className="font-vm-mono text-[11px] uppercase tracking-widest mb-2" style={{ color: live ? accent : '#6b6b76' }}>
        {eyebrow}
      </p>
      <h3 className="chime-display text-[26px] leading-tight font-bold text-paper mb-2">
        {title}
      </h3>
      <p className="text-paper/55 text-sm leading-relaxed mb-8">{blurb}</p>

      {live && (
        <div className="absolute bottom-7 left-7 right-7 flex items-center justify-end">
          <span
            className="text-xs font-semibold transition-colors duration-200"
            style={{ color: hover ? accent : 'rgba(251,247,238,0.35)' }}
          >
            {passed ? 'Play again →' : 'Play now →'}
          </span>
        </div>
      )}
    </div>
  )

  return live ? (
    <Link to={to} className="block h-full">
      {content}
    </Link>
  ) : (
    <div className="h-full cursor-not-allowed">
      {content}
    </div>
  )
}
