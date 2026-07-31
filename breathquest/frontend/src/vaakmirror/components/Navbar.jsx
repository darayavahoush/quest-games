import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { Sparkles, LogOut } from 'lucide-react'
import { getAuth, clearAuth } from '../lib/auth.js'

export default function Navbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const auth = getAuth()

  const links =
    auth?.kind === 'therapist'
      ? [
          { to: '/patients', label: 'Patients' },
          { to: '/dashboard', label: 'Dashboard' },
          { to: '/exercises', label: 'Exercises' },
        ]
      : [{ to: '/', label: 'Games', end: true }]

  function handleLogout() {
    clearAuth()
    navigate('/login')
  }

  return (
    <header className="sticky top-0 z-50 bg-ink/95 backdrop-blur border-b border-white/10">
      <nav className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <NavLink to="/" className="flex items-center gap-2 text-paper">
          <span className="w-8 h-8 rounded-blob bg-coral flex items-center justify-center shrink-0">
            <Sparkles size={16} className="text-paper" />
          </span>
          <span className="font-display text-xl font-bold tracking-tight">Orpheus</span>
        </NavLink>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) =>
                  `px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    isActive ? 'bg-mint text-ink-deep' : 'text-paper/70 hover:text-paper hover:bg-white/5'
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </div>
          {auth ? (
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium text-paper/50 hover:text-paper hover:bg-white/5 transition-colors"
              title={`Signed in as ${auth.name}`}
            >
              <LogOut size={13} /> {auth.name}
            </button>
          ) : (
            location.pathname !== '/login' && (
              <NavLink
                to="/login"
                className="px-4 py-2 rounded-full text-sm font-semibold bg-coral text-paper"
              >
                Sign in
              </NavLink>
            )
          )}
        </div>
      </nav>
    </header>
  )
}
