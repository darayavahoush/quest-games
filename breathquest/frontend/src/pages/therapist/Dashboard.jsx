import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { dashboardAPI } from '../../api/client'
import { Button, Card, Badge, Avatar, StatCard, PageLoader, Sidebar, AmbientGlow } from '../../components/ui'
import AddPatientModal from '../../components/therapist/AddPatientModal'
import {
  Users, UserCheck, Gamepad2, Star, AlertTriangle, Clock,
  Search, ArrowUpDown, Sparkles, UserPlus, ChevronRight, LayoutDashboard, CreditCard,
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
    <div className="min-h-screen relative flex"
         style={{ background: 'radial-gradient(ellipse 1400px 800px at 15% -10%, #1D9E75 0%, #16332D 35%, #12122A 70%)' }}>
      {/* A real gradient now, not just a couple of faint blur blobs on a flat
          fill — same idea as the login screen's radial panel, in the
          brand.teal/brand.dark this page (and PatientDetail) already use. */}
      <AmbientGlow />

      <Sidebar
        role="therapist"
        items={[
          { label: 'Dashboard', icon: LayoutDashboard, to: '/therapist/dashboard' },
          { label: 'Billing', icon: CreditCard, to: '/therapist/billing' },
        ]}
        name={therapist?.full_name}
        subtitle={therapist?.clinic_name}
        onLogout={logout}
      />

      <div className="relative flex-1 min-w-0 max-w-6xl mx-auto px-6 py-8">
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
                  {a.flag === 'plateau'
                    ? ' — plateaued despite easier difficulty'
                    : a.flag === 'frustration_rising'
                    ? ' — frustration rising session over session'
                    : a.flag === 'inactive'
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
          <StatCard icon={Users} accent="#A8FF6F" value={summary?.total_patients ?? 0} label="Total Patients" />
          <StatCard icon={UserCheck} accent="#1D9E75" value={summary?.active_patients ?? 0} label="Active Patients" />
          <StatCard icon={Gamepad2} accent="#FAC775" value={summary?.sessions_this_week ?? 0} label="Sessions This Week" />
          <StatCard icon={Star} accent="#FACC15"
            value={summary?.avg_stars_this_week != null ? summary.avg_stars_this_week.toFixed(1) : '—'}
            label="Avg Stars / Session" />
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
    <Card as="button" onClick={onClick}
      className={`text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg group w-full
                 ${alert ? 'hover:border-brand-amber/40 hover:bg-brand-amber/5'
                         : 'hover:border-brand-green/30 hover:bg-brand-green/5'}`}>
      <div className="flex items-center gap-3 mb-4">
        <Avatar avatar={patient.avatar} size="md" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white truncate">{patient.first_name}</p>
          {patient.age && <p className="text-white/40 text-xs">Age {patient.age}</p>}
        </div>
        {alert ? (
          <Badge color="amber">
            {alert.flag === 'plateau' ? 'Plateau'
              : alert.flag === 'frustration_rising' ? 'Frustration rising'
              : alert.flag === 'inactive' ? 'Inactive'
              : 'Overdue'}
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
    </Card>
  )
}
