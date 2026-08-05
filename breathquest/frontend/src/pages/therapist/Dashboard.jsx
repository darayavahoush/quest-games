import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { dashboardAPI } from '../../api/client'
import { Button, Card, Badge, Avatar, PageLoader } from '../../components/ui'
import AddPatientModal from '../../components/therapist/AddPatientModal'
import {
  Wind, Users, UserCheck, Gamepad2, Star, AlertTriangle, Clock,
  Search, ArrowUpDown, Sparkles, UserPlus, ChevronRight,
} from 'lucide-react'

function relativeDate(iso) {
  if (!iso) return 'Never played'
  const days = Math.floor((Date.now() - new Date(iso)) / 86400000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

const TITLES = /^(dr|mr|mrs|ms|prof|miss)\.?$/i
function firstName(fullName) {
  if (!fullName) return ''
  const parts = fullName.trim().split(/\s+/)
  return (TITLES.test(parts[0]) ? parts[1] : parts[0]) || fullName
}

const SORTS = {
  attention: { label: 'Needs attention first', fn: (a, b, alerts) => (alerts[b.id] ? 1 : 0) - (alerts[a.id] ? 1 : 0) },
  recent:    { label: 'Most recently active',  fn: (a, b) => new Date(b.last_session_at || 0) - new Date(a.last_session_at || 0) },
  name:      { label: 'Name (A–Z)',            fn: (a, b) => a.first_name.localeCompare(b.first_name) },
}

export default function TherapistDashboard() {
  const { therapist, logout } = useAuth()
  const navigate = useNavigate()
  const [summary, setSummary]       = useState(null)
  const [alerts,  setAlerts]        = useState([])
  const [loading, setLoading]       = useState(true)
  const [showAdd, setShowAdd]       = useState(false)
  const [search,  setSearch]        = useState('')
  const [sortBy,  setSortBy]        = useState('attention')

  const load = async () => {
    try {
      const [{ data: summaryData }, { data: alertsData }] = await Promise.all([
        dashboardAPI.summary(),
        dashboardAPI.listAlerts(),
      ])
      setSummary(summaryData)
      setAlerts(alertsData.filter(a => a.flag !== 'ok'))
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const alertsByPatient = useMemo(() => Object.fromEntries(alerts.map(a => [a.patient_id, a])), [alerts])

  const patients = useMemo(() => {
    const list = (summary?.patients || []).filter(p =>
      p.first_name.toLowerCase().includes(search.toLowerCase())
    )
    return [...list].sort((a, b) => SORTS[sortBy].fn(a, b, alertsByPatient))
  }, [summary, search, sortBy, alertsByPatient])

  if (loading) return <PageLoader />

  const today = new Date().toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div className="min-h-screen bg-brand-dark relative">
      {/* Soft glow accents behind the header — same idea as the login screen's
          radial panel, so landing here right after signing in doesn't feel
          like a completely different, flatter app. */}
      <div className="absolute top-0 left-0 w-full h-72 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-brand-teal/10 blur-3xl" />
        <div className="absolute -top-32 right-0 w-96 h-96 rounded-full bg-brand-green/5 blur-3xl" />
      </div>

      {/* Top nav */}
      <nav className="relative border-b border-white/10 px-6 py-4 flex items-center justify-between sticky top-0 bg-brand-dark/90 backdrop-blur z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-teal/15 border border-brand-teal/25 flex items-center justify-center">
            <Wind size={18} className="text-brand-teal" />
          </div>
          <span className="font-display text-xl font-bold text-white">
            Breath<span className="text-brand-green">Quest</span>
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-white text-sm font-medium leading-tight">{therapist?.full_name}</p>
            {therapist?.clinic_name && (
              <p className="text-white/35 text-xs leading-tight">{therapist.clinic_name}</p>
            )}
          </div>
          <div className="w-px h-8 bg-white/10" />
          <Button variant="ghost" size="sm" onClick={logout}>Sign out</Button>
        </div>
      </nav>

      <div className="relative max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-white/35 text-xs font-medium uppercase tracking-wide mb-1">{today}</p>
            <h1 className="font-display text-3xl font-bold text-white">
              Welcome back, {firstName(therapist?.full_name)}
            </h1>
          </div>
          <Button onClick={() => setShowAdd(true)}>
            <UserPlus size={16} className="mr-1.5 inline -mt-0.5" /> Add Patient
          </Button>
        </div>

        {/* Needs attention — multi-child alerts, previously computed by the
            backend but never surfaced anywhere in this dashboard. */}
        {alerts.length > 0 && (
          <div className="rounded-2xl border border-brand-amber/30 bg-brand-amber/5 p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={16} className="text-brand-amber" />
              <p className="text-brand-amber text-sm font-semibold">
                {alerts.length} patient{alerts.length !== 1 ? 's' : ''} need{alerts.length === 1 ? 's' : ''} attention
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {alerts.map(a => (
                <button key={a.patient_id} onClick={() => navigate(`/therapist/patients/${a.patient_id}`)}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full
                             bg-brand-amber/10 text-brand-amber/90 border border-brand-amber/20
                             hover:bg-brand-amber/20 transition-colors">
                  {a.flag === 'inactive' ? <Clock size={12} /> : <AlertTriangle size={12} />}
                  {a.first_name}
                  {a.flag === 'inactive'
                    ? ` — ${a.days_since_last_session == null ? 'never played' : `${a.days_since_last_session}d inactive`}`
                    : ` — ${a.overdue_assignments} overdue`}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Most improved — DashboardSummary.most_improved_patient was already
            computed by the backend but had no frontend consumer at all. */}
        {summary?.most_improved_patient && (
          <div className="flex items-center gap-2.5 rounded-xl border border-brand-green/20 bg-brand-green/5 px-4 py-3 mb-6">
            <Sparkles size={16} className="text-brand-green shrink-0" />
            <p className="text-sm">
              <span className="text-white font-medium">{summary.most_improved_patient}</span>
              <span className="text-white/40"> made the biggest jump in stars this week.</span>
            </p>
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Patients',     value: summary?.total_patients    ?? 0, Icon: Users,
              bar: 'bg-brand-green',  chip: 'bg-brand-green/15',  text: 'text-brand-green' },
            { label: 'Active Patients',    value: summary?.active_patients   ?? 0, Icon: UserCheck,
              bar: 'bg-brand-teal',   chip: 'bg-brand-teal/15',   text: 'text-brand-teal' },
            { label: 'Sessions This Week', value: summary?.sessions_this_week ?? 0, Icon: Gamepad2,
              bar: 'bg-brand-amber',  chip: 'bg-brand-amber/15',  text: 'text-brand-amber' },
            { label: 'Avg Stars / Session',value: summary?.avg_stars_this_week != null
                ? summary.avg_stars_this_week.toFixed(1) : '—',                       Icon: Star,
              bar: 'bg-yellow-400',   chip: 'bg-yellow-400/15',   text: 'text-yellow-400' },
          ].map(({ label, value, Icon, bar, chip, text }) => (
            <Card key={label} className="relative overflow-hidden">
              <div className={`absolute top-0 left-0 w-full h-0.5 ${bar}`} />
              <div className={`w-9 h-9 rounded-lg ${chip} flex items-center justify-center mb-3`}>
                <Icon size={17} className={text} />
              </div>
              <p className="text-2xl font-bold font-display text-white leading-tight">{value}</p>
              <p className="text-white/40 text-xs mt-0.5">{label}</p>
            </Card>
          ))}
        </div>

        {/* Patient list */}
        <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
          <h2 className="text-lg font-semibold text-white">
            Patients <span className="text-white/30 font-normal">({patients.length})</span>
          </h2>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                className="input w-56 py-2 pl-9 text-sm"
                placeholder="Search patients…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="relative">
              <ArrowUpDown size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
              <select
                className="input w-48 py-2 pl-8 text-sm appearance-none cursor-pointer"
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
              >
                {Object.entries(SORTS).map(([key, { label }]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {patients.length === 0 ? (
          <Card className="text-center py-16">
            <div className="w-14 h-14 rounded-2xl bg-brand-green/10 flex items-center justify-center mx-auto mb-4">
              <UserPlus size={24} className="text-brand-green" />
            </div>
            <p className="text-white/50">
              {search ? 'No patients match your search.' : 'No patients yet — add your first one!'}
            </p>
            {!search && <Button className="mt-4" onClick={() => setShowAdd(true)}>Add Patient</Button>}
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {patients.map(p => (
              <PatientCard key={p.id} patient={p} alert={alertsByPatient[p.id]}
                           onClick={() => navigate(`/therapist/patients/${p.id}`)} />
            ))}
          </div>
        )}
      </div>

      {showAdd && (
        <AddPatientModal
          onClose={() => setShowAdd(false)}
          onAdded={() => { setShowAdd(false); load() }}
        />
      )}
    </div>
  )
}

function PatientCard({ patient, alert, onClick }) {
  const starsColor = patient.total_stars >= 12 ? 'text-brand-green'
                   : patient.total_stars >= 6  ? 'text-yellow-400'
                   : 'text-white/50'
  return (
    <button onClick={onClick}
      className={`card text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg group w-full
                 ${alert ? 'border-brand-amber/30 hover:border-brand-amber/50 hover:bg-brand-amber/5 hover:shadow-brand-amber/5'
                         : 'hover:border-brand-green/40 hover:bg-brand-green/5 hover:shadow-brand-green/5'}`}>
      <div className="flex items-center gap-3 mb-4">
        <Avatar avatar={patient.avatar} size="md" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white truncate">{patient.first_name}</p>
          {patient.age && <p className="text-white/40 text-xs">Age {patient.age}</p>}
        </div>
        {alert ? (
          <Badge color="amber">
            {alert.flag === 'inactive' ? 'Inactive' : 'Overdue'}
          </Badge>
        ) : (
          <Badge color={patient.is_active ? 'green' : 'gray'}>
            {patient.is_active ? 'Active' : 'Inactive'}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-lg font-bold text-brand-amber">{patient.total_sessions}</p>
          <p className="text-white/30 text-xs">sessions</p>
        </div>
        <div>
          <p className={`text-lg font-bold ${starsColor}`}>{patient.total_stars}</p>
          <p className="text-white/30 text-xs">stars</p>
        </div>
        <div>
          <p className="text-lg font-bold text-brand-green leading-tight">{relativeDate(patient.last_session_at)}</p>
          <p className="text-white/30 text-xs">last session</p>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
        <span className="text-white/30 text-xs">View progress</span>
        <ChevronRight size={14} className="text-brand-green group-hover:translate-x-1 transition-transform" />
      </div>
    </button>
  )
}
