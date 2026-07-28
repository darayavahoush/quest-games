import { useEffect, useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts'
import { AlertTriangle, CalendarDays, RefreshCw, ServerCrash, Gamepad2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { getDashboard } from '../lib/api.js'
import { getActivePatientId } from '../lib/auth.js'

const SEVERITY_STYLE = {
  high: { bg: 'bg-coral/10', border: 'border-coral/30', text: 'text-coral-dark', label: 'Needs attention' },
  medium: { bg: 'bg-gold/10', border: 'border-gold/30', text: 'text-ink', label: 'Building' },
  low: { bg: 'bg-mint/10', border: 'border-mint/30', text: 'text-mint-dark', label: 'Minor' },
}

function AccuracyChart({ title, data }) {
  return (
    <div className="rounded-2xl border border-ink/10 bg-white p-6">
      <p className="font-display font-bold text-ink mb-4">{title}</p>
      {data.length === 0 ? (
        <p className="text-ink/40 text-sm py-16 text-center">Not enough attempts logged yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#0E2A2E14" />
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#0E2A2E80' }} />
            <YAxis type="category" dataKey="category" width={100} tick={{ fontSize: 12, fill: '#0E2A2E' }} />
            <Tooltip
              formatter={(v, _n, item) => [`${v}% (${item.payload.attempts} attempts)`, 'Accuracy']}
              contentStyle={{ borderRadius: 12, border: '1px solid #0E2A2E20', fontSize: 12 }}
            />
            <Bar dataKey="accuracy" radius={[0, 6, 6, 0]} fill="#2FB8A6" />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | error
  const navigate = useNavigate()
  const patientId = getActivePatientId()

  function load() {
    if (!patientId) {
      navigate('/patients')
      return
    }
    setStatus('loading')
    getDashboard(patientId)
      .then((d) => {
        setData(d)
        setStatus('ready')
      })
      .catch(() => setStatus('error'))
  }

  useEffect(load, [])

  if (status === 'loading') {
    return (
      <div className="max-w-6xl mx-auto px-6 py-24 flex flex-col items-center gap-3 text-ink/50">
        <RefreshCw className="animate-spin" size={22} />
        <p className="text-sm">Loading dashboard…</p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="max-w-lg mx-auto px-6 py-24 text-center">
        <ServerCrash size={28} className="mx-auto text-ink/30 mb-4" />
        <p className="font-display text-xl font-bold text-ink mb-2">Couldn't reach the API</p>
        <p className="text-ink/55 text-sm leading-relaxed mb-6">
          The dashboard reads from the VaakMirror backend, which doesn't seem
          to be running (or isn't reachable at the configured URL). Start it
          with <code className="text-xs bg-ink/5 px-1.5 py-0.5 rounded">uvicorn app.main:app --reload --port 8000</code>{' '}
          from the backend folder, then try again.
        </p>
        <button
          onClick={load}
          className="px-5 py-2.5 rounded-full bg-ink text-paper text-sm font-semibold inline-flex items-center gap-2"
        >
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    )
  }

  const hasData = data.sessions_count > 0

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between flex-wrap gap-4 mb-10">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-mint-dark mb-1">
            Therapist &amp; parent view
          </p>
          <h1 className="font-display text-3xl font-bold text-ink">{data.patient.first_name}'s progress</h1>
        </div>
        <div className="flex items-center gap-2 text-ink/60 text-sm">
          <CalendarDays size={16} />
          {data.sessions_count} session{data.sessions_count === 1 ? '' : 's'} logged
        </div>
      </div>

      {!hasData ? (
        <div className="rounded-2xl border border-ink/10 bg-white p-12 text-center">
          <Gamepad2 size={28} className="mx-auto text-ink/25 mb-4" />
          <p className="font-display text-lg font-bold text-ink mb-2">No sessions yet</p>
          <p className="text-ink/50 text-sm max-w-sm mx-auto">
            Play a round of any game and this dashboard will start filling in
            with real accuracy data, broken down by sound category.
          </p>
        </div>
      ) : (
        <>
          {/* Flagged gaps */}
          {data.flagged_gaps.length > 0 && (
            <div className="mb-12">
              <h2 className="font-display text-xl font-bold text-ink mb-4">Flagged patterns</h2>
              <div className="grid md:grid-cols-3 gap-4">
                {data.flagged_gaps.map((g) => {
                  const s = SEVERITY_STYLE[g.severity]
                  return (
                    <div key={g.id} className={`rounded-2xl border ${s.border} ${s.bg} p-5`}>
                      <div className="flex items-center gap-2 mb-3">
                        <AlertTriangle size={14} className={s.text} />
                        <span className={`text-xs font-semibold uppercase tracking-wide ${s.text}`}>{s.label}</span>
                      </div>
                      <p className="font-display font-bold text-ink mb-2">{g.title}</p>
                      <p className="text-ink/60 text-sm leading-relaxed mb-4">{g.detail}</p>
                      {g.assigned_exercise && (
                        <p className="text-xs text-ink/50">
                          Assigned exercise: <span className="font-medium text-ink/80">{g.assigned_exercise}</span>
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Category accuracy */}
          <div className="mb-12">
            <h2 className="font-display text-xl font-bold text-ink mb-4">Accuracy by category</h2>
            <div className="grid md:grid-cols-3 gap-5">
              <AccuracyChart title="By manner" data={data.manner_accuracy} />
              <AccuracyChart title="By place" data={data.place_accuracy} />
              <AccuracyChart title="By voicing" data={data.voicing_accuracy} />
            </div>
          </div>

          {/* Progress over time */}
          <div>
            <h2 className="font-display text-xl font-bold text-ink mb-4">Progress over time</h2>
            <div className="rounded-2xl border border-ink/10 bg-white p-6">
              {data.progress_over_time.length < 2 ? (
                <p className="text-ink/40 text-sm py-16 text-center">
                  Play across a couple more sessions to see a trend line here.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={data.progress_over_time} margin={{ left: -10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#0E2A2E14" />
                    <XAxis dataKey="week" tick={{ fontSize: 12, fill: '#0E2A2E80' }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#0E2A2E80' }} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #0E2A2E20', fontSize: 12 }} />
                    <Line
                      type="monotone"
                      dataKey="accuracy"
                      name="Overall accuracy"
                      stroke="#2FB8A6"
                      strokeWidth={2.5}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
