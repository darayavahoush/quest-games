import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronLeft, ChevronRight, LogOut, Wind } from 'lucide-react'

// Role-aware collapsible sidebar for authenticated pages (therapist +
// parent). Background is the SAME vertical gradient as the landing page
// (Landing.jsx's `background:` style) — deliberately not a role-specific
// bg color, so the sidebar reads as "the app's chrome" rather than a
// disconnected panel bolted onto whichever dashboard it's in. Role
// identity still comes through clearly via the accent color (teal for
// therapist, coral for parent) on the logo glow, active nav item, and
// hover states.
const LANDING_GRADIENT = 'linear-gradient(180deg, #12142E 0%, #241F49 38%, #6B4A8A 78%, #9A5F72 100%)'

const THEMES = {
  therapist: {
    glow: 'bg-brand-teal/15 border-brand-teal/25 text-brand-teal',
    accentBar: 'bg-brand-teal',
    activeBg: 'bg-white/10 border-white/10 text-white',
    inactiveText: 'text-white/55 hover:text-white hover:bg-white/[0.06]',
    subtitleText: 'text-white/40',
    nameText: 'text-white',
    divider: 'bg-white/10',
  },
  parent: {
    glow: 'bg-coral/20 border-coral/30 text-coral-light',
    accentBar: 'bg-coral',
    activeBg: 'bg-white/10 border-white/10 text-paper',
    inactiveText: 'text-paper/55 hover:text-paper hover:bg-white/[0.06]',
    subtitleText: 'text-paper/40',
    nameText: 'text-paper',
    divider: 'bg-white/10',
  },
  // Ember/dusk palette matching GameNavbar (the top bar this replaces),
  // so swapping in the sidebar doesn't change kid-facing pages' established
  // visual identity, just the layout shape.
  kid: {
    glow: 'bg-[#FF9B54]/15 border-[#FF9B54]/25 text-[#FF9B54]',
    accentBar: 'bg-[#FF9B54]',
    activeBg: 'bg-white/10 border-white/10 text-white',
    inactiveText: 'text-white/55 hover:text-white hover:bg-white/[0.06]',
    subtitleText: 'text-white/40',
    nameText: 'text-white',
    divider: 'bg-white/10',
  },
}

function NavItem({ label, Icon, active, collapsed, t, to, onClick }) {
  const [hovered, setHovered] = useState(false)
  const cls = `group relative flex items-center gap-3 pl-3 pr-3 py-2.5 rounded-xl border border-transparent
                transition-all duration-150 ${active ? t.activeBg : t.inactiveText}
                ${!active ? 'hover:translate-x-0.5' : ''}`

  const inner = (
    <>
      {/* Active-route accent bar, replacing a flat background tint as the
          primary "you are here" signal — reads faster at a glance and
          survives the busier gradient backdrop better than a subtle bg
          shift alone would. */}
      <span
        className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-full transition-all duration-150
                    ${active ? `h-5 ${t.accentBar}` : 'h-0'}`}
      />
      <Icon size={18} className="shrink-0" />
      {!collapsed && <span className="text-sm font-medium truncate">{label}</span>}
    </>
  )

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {to ? (
        <Link to={to} className={cls}>{inner}</Link>
      ) : (
        <button onClick={onClick} className={cls + ' w-full text-left'}>{inner}</button>
      )}
      {/* Floating tooltip when collapsed — native `title` attrs are slow
          to appear and look inconsistent across browsers; this shows
          instantly and matches the app's own visual language. */}
      {collapsed && hovered && (
        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1.5 rounded-lg
                         bg-[#12142E] border border-white/10 shadow-lg text-xs font-medium text-white
                         whitespace-nowrap z-50 pointer-events-none">
          {label}
        </div>
      )}
    </div>
  )
}

export default function Sidebar({
  role = 'therapist',   // 'therapist' | 'parent'
  items = [],            // [{ label, icon: LucideIcon, to?, onClick? }]
  name,
  subtitle,
  onLogout,
}) {
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()
  const t = THEMES[role] || THEMES.therapist

  return (
    <aside
      style={{ background: LANDING_GRADIENT }}
      className={`sticky top-0 h-screen shrink-0 flex flex-col border-r border-white/[0.08]
                  shadow-[4px_0_24px_-8px_rgba(0,0,0,0.5)]
                  transition-[width] duration-200 ${collapsed ? 'w-[72px]' : 'w-64'}`}
    >
      <div className="flex items-center gap-3 px-4 py-5">
        <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${t.glow}`}>
          <Wind size={18} />
        </div>
        {!collapsed && (
          <span className="font-display text-lg font-bold text-white truncate">
            Vaak<span className="text-brand-green">Games</span>
          </span>
        )}
      </div>

      <div className={`h-px mx-4 ${t.divider}`} />

      <nav className="flex-1 px-3 py-4 flex flex-col gap-1 overflow-y-auto overflow-x-visible">
        {items.map(({ label, icon: Icon, to, onClick }) => (
          <NavItem
            key={label}
            label={label}
            Icon={Icon}
            active={!!to && location.pathname === to}
            collapsed={collapsed}
            t={t}
            to={to}
            onClick={onClick}
          />
        ))}
      </nav>

      <div className={`h-px mx-4 ${t.divider}`} />

      <div className="px-3 py-4 flex flex-col gap-3">
        {!collapsed && (name || subtitle) && (
          <div className="px-3">
            {name && <p className={`text-sm font-medium leading-tight truncate ${t.nameText}`}>{name}</p>}
            {subtitle && <p className={`text-xs leading-tight truncate ${t.subtitleText}`}>{subtitle}</p>}
          </div>
        )}
        <NavItem label="Log out" Icon={LogOut} collapsed={collapsed} t={t} onClick={onLogout} />
        <button
          onClick={() => setCollapsed((c) => !c)}
          className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl transition-colors ${t.inactiveText}`}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          {!collapsed && <span className="text-xs">Collapse</span>}
        </button>
      </div>
    </aside>
  )
}
