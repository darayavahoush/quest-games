import { Link } from 'react-router-dom'
import { ArrowUpRight, Lock } from 'lucide-react'

export default function GameCard({ to, eyebrow, title, blurb, accent, icon: Icon, live = true }) {
  const content = (
    <div
      className={`group relative h-full rounded-3xl p-7 border transition-all duration-300 ${
        live
          ? 'bg-ink border-white/10 hover:border-white/25 hover:-translate-y-1'
          : 'bg-ink/40 border-white/5'
      }`}
    >
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center mb-6"
        style={{ backgroundColor: accent }}
      >
        <Icon size={22} className="text-ink-deep" strokeWidth={2.4} />
      </div>
      <p className="font-vm-mono text-xs uppercase tracking-widest text-mint mb-2">{eyebrow}</p>
      <h3 className="font-vm-display text-2xl font-bold text-paper mb-2">{title}</h3>
      <p className="text-paper/60 text-sm leading-relaxed mb-8">{blurb}</p>
      <div className="absolute bottom-7 right-7">
        {live ? (
          <span className="w-9 h-9 rounded-full border border-white/15 flex items-center justify-center group-hover:bg-white/10 transition-colors">
            <ArrowUpRight size={16} className="text-paper" />
          </span>
        ) : (
          <span className="w-9 h-9 rounded-full border border-white/10 flex items-center justify-center">
            <Lock size={14} className="text-paper/40" />
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
    <div className="h-full cursor-not-allowed">{content}</div>
  )
}
