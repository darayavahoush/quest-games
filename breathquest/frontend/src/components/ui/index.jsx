// Shared UI primitives
import { Creature, CREATURE_ACCENTS } from './Creatures'

export function Button({ children, variant = 'primary', size = 'md', className = '', ...props }) {
  const base = 'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed'
  const variants = {
    primary: 'bg-brand-green text-brand-dark hover:bg-opacity-90',
    ghost:   'border border-white/20 text-white hover:bg-white/10',
    danger:  'bg-brand-coral text-white hover:bg-opacity-90',
    teal:    'bg-brand-teal text-white hover:bg-opacity-90',
  }
  const sizes = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-sm',
    lg: 'px-8 py-4 text-base',
  }
  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
      {children}
    </button>
  )
}

export function Card({ children, className = '', as: Tag = 'div', ...props }) {
  return (
    <Tag
      className={`bg-gradient-to-b from-white/[0.045] to-white/[0.015] border border-white/[0.08]
        rounded-2xl p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_4px_20px_-6px_rgba(0,0,0,0.4)]
        ${className}`}
      {...props}
    >
      {children}
    </Tag>
  )
}

export function Input({ label, error, icon: Icon, rightElement, className = '', ...props }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-sm font-medium text-white/70">{label}</label>}
      <div className="relative">
        {Icon && (
          <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
        )}
        <input
          className={`w-full bg-white/5 border ${error ? 'border-brand-coral' : 'border-white/15'}
            rounded-xl px-4 py-3 ${Icon ? 'pl-10' : ''} ${rightElement ? 'pr-10' : ''} text-white placeholder-white/30
            focus:outline-none focus:border-brand-green transition-colors ${className}`}
          {...props}
        />
        {rightElement && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
            {rightElement}
          </div>
        )}
      </div>
      {error && <span className="text-xs text-brand-coral">{error}</span>}
    </div>
  )
}

export function Badge({ children, color = 'green' }) {
  const colors = {
    green:  'bg-brand-green/15 text-brand-green border-brand-green/25',
    amber:  'bg-brand-amber/15 text-brand-amber border-brand-amber/25',
    coral:  'bg-brand-coral/15 text-brand-coral border-brand-coral/25',
    purple: 'bg-brand-purple/15 text-purple-300 border-brand-purple/25',
    gray:   'bg-white/[0.06] text-white/60 border-white/10',
  }
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${colors[color]}`}>
      {children}
    </span>
  )
}

export function Spinner({ size = 'md' }) {
  const sizes = { sm: 'w-4 h-4', md: 'w-8 h-8', lg: 'w-12 h-12' }
  return (
    <div className={`${sizes[size]} border-2 border-white/20 border-t-brand-green rounded-full animate-spin`} />
  )
}

export function StarRating({ stars = 0, max = 3, size = 'md' }) {
  const sizes = { sm: 'text-lg', md: 'text-2xl', lg: 'text-3xl' }
  return (
    <span className={sizes[size]}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < stars ? 'text-brand-amber' : 'text-white/20'}>★</span>
      ))}
    </span>
  )
}

export function Avatar({ avatar = 'chick', size = 'md', name = '' }) {
  const sizes = {
    sm:  'w-8 h-8',
    md:  'w-12 h-12',
    lg:  'w-16 h-16',
    xl:  'w-24 h-24',
  }
  const accent = CREATURE_ACCENTS[avatar] || CREATURE_ACCENTS.chick
  return (
    <div
      className={`${sizes[size]} rounded-full flex items-center justify-center flex-shrink-0 p-1`}
      style={{ background: `linear-gradient(160deg, ${accent.from}33, ${accent.to}22)` }}
      title={name}
    >
      <Creature species={avatar} className="w-full h-full" />
    </div>
  )
}

export function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Spinner size="lg" />
        <p className="text-white/50 text-sm">Loading…</p>
      </div>
    </div>
  )
}

// Real lucide icon in a colored badge + a big, tight-tracked number —
// replaces the bare Card+emoji+number pattern dashboards otherwise
// reach for independently.
export function StatCard({ icon: Icon, value, label, accent = '#2FB8A6' }) {
  return (
    <Card className="flex flex-col gap-3">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center"
        style={{ backgroundColor: `${accent}1f`, border: `1px solid ${accent}33` }}
      >
        <Icon size={18} style={{ color: accent }} />
      </div>
      <div>
        <p className="font-display text-2xl font-bold text-white tracking-tight leading-none">{value}</p>
        <p className="text-white/40 text-xs mt-1.5">{label}</p>
      </div>
    </Card>
  )
}
export { default as Sidebar } from './Sidebar'
export { default as AmbientGlow } from './AmbientGlow'
