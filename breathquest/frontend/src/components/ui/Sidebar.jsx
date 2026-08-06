import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronLeft, ChevronRight, LogOut, Wind } from 'lucide-react'

// Role-aware collapsible sidebar for authenticated pages (therapist +
// parent). Matches the existing brand-teal/brand-green/brand-dark
// (therapist) and coral/mint/ink (parent) accent pairs already used on
// Dashboard.jsx / PatientDetail.jsx / ParentDashboard.jsx.
const THEMES = {
  therapist: {
    bg: 'bg-brand-dark/95',
    border: 'border-white/10',
    glow: 'bg-brand-teal/15 border-brand-teal/25 text-brand-teal',
    activeBg: 'bg-brand-teal/10 border-brand-teal/30 text-white',
    inactiveText: 'text-white/50 hover:text-white hover:bg-white/5',
    subtitleText: 'text-white/35',
    nameText: 'text-white',
    divider: 'bg-white/10',
  },
  parent: {
    bg: 'bg-ink/95',
    border: 'border-white/[0.08]',
    glow: 'bg-coral/15 border-coral/25 text-coral-light',
    activeBg: 'bg-coral/10 border-coral/30 text-paper',
    inactiveText: 'text-paper/50 hover:text-paper hover:bg-white/5',
    subtitleText: 'text-paper/35',
    nameText: 'text-paper',
    divider: 'bg-white/[0.08]',
  },
}

export default function Sidebar({
  role = 'therapist',   // 'therapist' | 'parent'
  items = [],           // [{ label, icon: LucideIcon, to?, onClick? }]
  name,
  subtitle,
  onLogout,
}) {
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()
  const t = THEMES[role] || THEMES.therapist

  return (
    <aside
      className={`sticky top-0 h-screen shrink-0 flex flex-col ${t.bg} backdrop-blur-xl border-r ${t.border}
                  transition-all duration-200 ${collapsed ? 'w-[72px]' : 'w-64'}`}
    >
      <div className="flex items-center gap-3 px-4 py-5">
        <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${t.glow}`}>
          <Wind size={18} />
        </div>
        {!collapsed && (
          <span className={`font-display text-lg font-bold ${t.nameText} truncate`}>
            Vaak<span className="text-brand-green">Games</span>
          </span>
        )}
      </div>

      <div className={`h-px mx-4 ${t.divider}`} />

      <nav className="flex-1 px-3 py-4 flex flex-col gap-1 overflow-y-auto">
        {items.map(({ label, icon: Icon, to, onClick }) => {
          const active = to && location.pathname === to
          const cls = `flex items-center gap-3 px-3 py-2.5 rounded-xl border border-transparent
                        transition-colors ${active ? t.activeBg : t.inactiveText}`
          const content = (
            <>
              <Icon size={18} className="shrink-0" />
              {!collapsed && <span className="text-sm font-medium truncate">{label}</span>}
            </>
          )
          return to ? (
            <Link key={label} to={to} className={cls} title={collapsed ? label : undefined}>
              {content}
            </Link>
          ) : (
            <button key={label} onClick={onClick} className={cls} title={collapsed ? label : undefined}>
              {content}
            </button>
          )
        })}
      </nav>

      <div className={`h-px mx-4 ${t.divider}`} />

      <div className="px-3 py-4 flex flex-col gap-3">
        {!collapsed && (name || subtitle) && (
          <div className="px-3">
            {name && <p className={`text-sm font-medium leading-tight truncate ${t.nameText}`}>{name}</p>}
            {subtitle && <p className={`text-xs leading-tight truncate ${t.subtitleText}`}>{subtitle}</p>}
          </div>
        )}
        <button
          onClick={onLogout}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${t.inactiveText}`}
          title={collapsed ? 'Log out' : undefined}
        >
          <LogOut size={16} className="shrink-0" />
          {!collapsed && <span className="text-sm font-medium">Log out</span>}
        </button>
        <button
          onClick={() => setCollapsed(c => !c)}
          className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl transition-colors ${t.inactiveText}`}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          {!collapsed && <span className="text-xs">Collapse</span>}
        </button>
      </div>
    </aside>
  )
}
