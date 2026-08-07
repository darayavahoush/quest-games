import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { dashboardAPI, chimeAPI, vaakmirrorAPI } from '../../api/client'
import { voiceHurdleRaceApi } from '../../api/voiceHurdleRaceApi'
import { Card, Badge, Avatar, StarRating, Button, Spinner, PageLoader, Sidebar, AmbientGlow } from '../../components/ui'
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
         BarChart, Bar, XAxis, YAxis, Tooltip, LineChart, Line, Legend } from 'recharts'
import { Download, BarChart3, Gamepad2, Dog, Bell, Waves, HeartPulse, FileText, LayoutDashboard, X, ChevronLeft, ChevronRight, Brain } from 'lucide-react'

const LEVEL_EMOJIS = {
  pinwheel: '🌀', float_rider: '🐥', candle: '🕯️',
  balloon: '🎈', dandelion: '🌼', dragon: '🐉'
}

const VM_GAMES = ['mirror_mirror', 'tongue_tamer', 'lip_sync_hero']
const VM_GAME_LABELS = {
  mirror_mirror: 'Mirror Mirror', tongue_tamer: 'Tongue Tamer', lip_sync_hero: 'Lip Sync Hero',
}

export default function PatientDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { therapist, logout } = useAuth()
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab]         = useState('progress')   // progress | sessions | voicehurdlerace | chime | vaakmirror | care | notes
  const [downloadingReport, setDownloadingReport] = useState(false)
  const [reportError, setReportError] = useState('')
  const [soundProgress, setSoundProgress] = useState(null)
  const [soundProgressLoading, setSoundProgressLoading] = useState(true)
  const [noteText, setNoteText] = useState('')
  const [notes, setNotes]       = useState([])
  const [savingNote, setSavingNote] = useState(false)
  const [vhrSessions, setVhrSessions] = useState([])
  const [vhrLoading, setVhrLoading]   = useState(true)
  const [chimeEvents, setChimeEvents] = useState([])
  const [chimeLoading, setChimeLoading] = useState(true)
  const [chimeError, setChimeError] = useState(false)
  const [vmDashboard, setVmDashboard] = useState(null)
  const [vmLoading, setVmLoading] = useState(true)
  const [vmError, setVmError] = useState(false)
  const [agentSuggestions, setAgentSuggestions] = useState({})
  const [agentLoading, setAgentLoading] = useState(true)
  const [dismissedSuggestions, setDismissedSuggestions] = useState({})
  const [applyingSuggestion, setApplyingSuggestion] = useState(null)

  // Care tab — Assignments / Goals / Messages / Home Practice / Weekly Summary
  const [assignments, setAssignments] = useState([])
  const [goals, setGoals]             = useState([])
  const [messages, setMessages]       = useState([])
  const [homePractice, setHomePractice] = useState([])
  const [careLoading, setCareLoading] = useState(true)
  const [careError, setCareError]     = useState(false)
  const [weekOffset, setWeekOffset]   = useState(0)
  const [weeklySummary, setWeeklySummary] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(true)

  const [newAssignment, setNewAssignment] = useState({ game: 'chime', level_id: '', title: '', instructions: '', due_at: '' })
  const [savingAssignment, setSavingAssignment] = useState(false)
  const [ideaCondition, setIdeaCondition] = useState('')
  const [ideas, setIdeas] = useState([])
  const [ideasLoading, setIdeasLoading] = useState(false)
  const [ideasOpen, setIdeasOpen] = useState(false)
  const [newGoal, setNewGoal] = useState({ target_metric: 'breath_consistency', target_value: '', target_date: '' })
  const [savingGoal, setSavingGoal] = useState(false)
  const [newMessage, setNewMessage] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)
  const [newPractice, setNewPractice] = useState({ practiced_on: new Date().toISOString().slice(0, 10), duration_minutes: '', notes: '' })
  const [savingPractice, setSavingPractice] = useState(false)

  const loadCareData = useCallback(() => {
    setCareLoading(true)
    Promise.all([
      dashboardAPI.listAssignments(id),
      dashboardAPI.listGoals(id),
      dashboardAPI.listMessages(id),
      dashboardAPI.listHomePractice(id),
    ]).then(([a, g, m, h]) => {
      setAssignments(a.data)
      setGoals(g.data)
      setMessages(m.data)
      setHomePractice(h.data)
    }).catch(err => { console.error('Failed to load Care tab data:', err); setCareError(true) })
      .finally(() => setCareLoading(false))
  }, [id])

  useEffect(() => {
    Promise.all([
      dashboardAPI.progress(id),
      dashboardAPI.listNotes(id),
    ]).then(([prog, notesRes]) => {
      setData(prog.data)
      setNotes(notesRes.data)
    }).finally(() => setLoading(false))

    voiceHurdleRaceApi.getVoiceHurdleRaceSessions(id)
      .then(setVhrSessions)
      .catch(err => console.error('Failed to load Voice Hurdle Race sessions:', err))
      .finally(() => setVhrLoading(false))

    chimeAPI.getPatientEvents(id)
      .then(({ data }) => setChimeEvents(data))
      .catch(err => { console.error('Failed to load Chime events:', err); setChimeError(true) })
      .finally(() => setChimeLoading(false))

    vaakmirrorAPI.getPatientDashboard(id)
      .then(({ data }) => setVmDashboard(data))
      .catch(err => { console.error('Failed to load VaakMirror dashboard:', err); setVmError(true) })
      .finally(() => setVmLoading(false))

    dashboardAPI.getSoundProgress(id)
      .then(({ data }) => setSoundProgress(data))
      .catch(err => console.error('Failed to load sound progress:', err))
      .finally(() => setSoundProgressLoading(false))

    // The same adaptive-difficulty agent Chime and BreathQuest use, applied
    // to VaakMirror's round_size knob (see backend vaakmirror/agent_bridge.py).
    // Read-only here — a therapist has to accept a suggestion before it
    // changes anything.
    Promise.all(
      VM_GAMES.map(g =>
        vaakmirrorAPI.getGameSettingsSuggestion(id, g)
          .then(({ data }) => [g, data])
          .catch(() => [g, null])
      )
    ).then(entries => {
      setAgentSuggestions(Object.fromEntries(entries.filter(([, v]) => v)))
    }).finally(() => setAgentLoading(false))

    loadCareData()
  }, [id, loadCareData])

  useEffect(() => {
    setSummaryLoading(true)
    dashboardAPI.weeklySummary(id, weekOffset)
      .then(({ data }) => setWeeklySummary(data))
      .catch(err => console.error('Failed to load weekly summary:', err))
      .finally(() => setSummaryLoading(false))
  }, [id, weekOffset])

  useEffect(() => {
    if (!ideasOpen) return
    setIdeasLoading(true)
    dashboardAPI.listHomePracticeIdeas(ideaCondition || undefined)
      .then(({ data }) => setIdeas(data))
      .catch(err => console.error('Failed to load home practice ideas:', err))
      .finally(() => setIdeasLoading(false))
  }, [ideasOpen, ideaCondition])

  // Accepting a suggestion goes through the normal update endpoint — same
  // as if the therapist had typed the number in themselves — so it's always
  // a human decision on record, never the agent silently changing things.
  const acceptAgentSuggestion = (game) => {
    const suggestion = agentSuggestions[game]
    if (!suggestion) return
    setApplyingSuggestion(game)
    vaakmirrorAPI.updateGameSettings(id, game, { round_size: suggestion.suggested_round_size })
      .then(() => {
        setAgentSuggestions(prev => ({
          ...prev,
          [game]: { ...prev[game], current_round_size: suggestion.suggested_round_size, action: 'hold' },
        }))
      })
      .catch(err => console.error('Failed to apply agent suggestion:', err))
      .finally(() => setApplyingSuggestion(null))
  }

  const dismissAgentSuggestion = (game) => {
    setDismissedSuggestions(prev => ({ ...prev, [game]: true }))
  }

  const handleDownloadReport = async () => {
    setReportError('')
    setDownloadingReport(true)
    try {
      const response = await dashboardAPI.getReport(id)
      const url = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `${data.first_name}_progress_report.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      // responseType: 'blob' means axios hands back a Blob even for error
      // responses — has to be read as text and re-parsed to get the real
      // `detail` message rather than showing "[object Blob]".
      let message = 'Could not generate the report — please try again.'
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text()
          message = JSON.parse(text).detail || message
        } catch { /* fall back to the generic message above */ }
      }
      setReportError(message)
    } finally {
      setDownloadingReport(false)
    }
  }

  const applyIdeaToAssignment = (idea) => {
    setNewAssignment(n => ({ ...n, title: idea.title, instructions: idea.description }))
    setIdeasOpen(false)
  }

  const saveAssignment = async () => {
    if (!newAssignment.title.trim()) return
    setSavingAssignment(true)
    try {
      const payload = {
        ...newAssignment,
        level_id: newAssignment.level_id || null,
        instructions: newAssignment.instructions || null,
        due_at: newAssignment.due_at ? new Date(newAssignment.due_at).toISOString() : null,
      }
      const { data: created } = await dashboardAPI.createAssignment(id, payload)
      setAssignments(a => [created, ...a])
      setNewAssignment({ game: 'chime', level_id: '', title: '', instructions: '', due_at: '' })
    } finally {
      setSavingAssignment(false)
    }
  }

  const toggleAssignmentDone = async (a) => {
    const status = a.status === 'completed' ? 'assigned' : 'completed'
    const { data: updated } = await dashboardAPI.updateAssignment(a.id, { status })
    setAssignments(list => list.map(x => x.id === a.id ? updated : x))
  }

  const removeAssignment = async (assignmentId) => {
    await dashboardAPI.deleteAssignment(assignmentId)
    setAssignments(list => list.filter(a => a.id !== assignmentId))
  }

  const saveGoal = async () => {
    if (!newGoal.target_metric.trim() || !newGoal.target_value) return
    setSavingGoal(true)
    try {
      const payload = {
        target_metric: newGoal.target_metric,
        target_value: parseFloat(newGoal.target_value),
        target_date: newGoal.target_date ? new Date(newGoal.target_date).toISOString() : null,
      }
      const { data: created } = await dashboardAPI.createGoal(id, payload)
      setGoals(g => [created, ...g])
      setNewGoal({ target_metric: 'breath_consistency', target_value: '', target_date: '' })
    } finally {
      setSavingGoal(false)
    }
  }

  const removeGoal = async (goalId) => {
    await dashboardAPI.deleteGoal(goalId)
    setGoals(list => list.filter(g => g.id !== goalId))
  }

  const sendMessage = async () => {
    if (!newMessage.trim()) return
    setSendingMessage(true)
    try {
      const { data: sent } = await dashboardAPI.createMessage(id, { body: newMessage, sender_role: 'therapist' })
      setMessages(m => [...m, sent])
      setNewMessage('')
    } finally {
      setSendingMessage(false)
    }
  }

  const savePracticeLog = async () => {
    setSavingPractice(true)
    try {
      const payload = {
        practiced_on: new Date(newPractice.practiced_on).toISOString(),
        duration_minutes: newPractice.duration_minutes ? parseInt(newPractice.duration_minutes, 10) : null,
        notes: newPractice.notes || null,
      }
      const { data: created } = await dashboardAPI.createHomePractice(id, payload)
      setHomePractice(h => [created, ...h])
      setNewPractice({ practiced_on: new Date().toISOString().slice(0, 10), duration_minutes: '', notes: '' })
    } finally {
      setSavingPractice(false)
    }
  }

  const saveNote = async () => {
    if (!noteText.trim()) return
    setSavingNote(true)
    try {
      const { data: note } = await dashboardAPI.createNote(id, { content: noteText })
      setNotes(n => [note, ...n])
      setNoteText('')
    } finally {
      setSavingNote(false)
    }
  }

  if (loading) return <PageLoader />
  if (!data)   return <div className="p-8 text-white/50">Patient not found</div>

  const radarData = data.level_progress.map(l => ({
    level: LEVEL_EMOJIS[l.level_id] + ' ' + l.level_name.split(' ').slice(-1)[0],
    stars: l.best_stars,
    fullMark: 3,
  }))

  const barData = data.recent_sessions.slice().reverse().map((s, i) => ({
    name: `#${i + 1}`,
    stars: s.stars_earned || 0,
    breath: s.avg_breath_strength ? +(s.avg_breath_strength * 100).toFixed(0) : 0,
  }))

  const trend = data.improvement_trend
  const trendLabel = trend == null ? '—'
                   : trend > 0    ? `+${trend.toFixed(1)} ↑`
                   : trend < 0    ? `${trend.toFixed(1)} ↓`
                   : '→ Stable'
  const trendColor = trend > 0 ? 'text-brand-green' : trend < 0 ? 'text-brand-coral' : 'text-white/50'

  const TABS = [
    ['progress', BarChart3, 'Progress'],
    ['sessions', Gamepad2, 'Sessions'],
    ['voicehurdlerace', Dog, 'Voice Hurdle'],
    ['chime', Bell, 'Chime'],
    ['vaakmirror', Waves, 'Orpheus'],
    ['care', HeartPulse, 'Care'],
    ['notes', FileText, 'Notes'],
  ]

  return (
    <div className="min-h-screen bg-brand-dark relative flex">
      {/* Same ambient glow as the therapist dashboard, so landing on a
          specific patient doesn't feel like a flatter, less-considered
          page than the dashboard just navigated from. */}
      <AmbientGlow />

      <Sidebar
        role="therapist"
        items={[
          { label: 'Dashboard', icon: LayoutDashboard, to: '/therapist/dashboard' },
        ]}
        name={therapist?.full_name}
        subtitle={therapist?.clinic_name}
        onLogout={logout}
      />

      <div className="relative flex-1 min-w-0">
      {/* Nav */}
      <nav className="relative border-b border-white/[0.08] px-6 py-4 flex items-center gap-4
                       sticky top-0 bg-brand-dark/85 backdrop-blur-xl z-10">
        <button onClick={() => navigate('/therapist/dashboard')}
                className="text-white/40 hover:text-white text-sm transition-colors">← Dashboard</button>
        <span className="text-white/20">/</span>
        <span className="text-white font-semibold">{data.first_name}</span>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={() => navigate(`/therapist/patients/${id}/agent`)}>
          <Brain size={14} className="mr-1.5 inline" />
          What the agent sees
        </Button>
        <Button variant="ghost" size="sm" onClick={handleDownloadReport} disabled={downloadingReport}>
          <Download size={14} className="mr-1.5 inline" />
          {downloadingReport ? 'Generating…' : 'Download Report'}
        </Button>
      </nav>
      {reportError && (
        <div className="relative max-w-5xl mx-auto px-6 pt-4">
          <div className="bg-brand-coral/10 border border-brand-coral/30 rounded-xl px-4 py-3 text-brand-coral text-sm">
            {reportError}
          </div>
        </div>
      )}

      <div className="relative max-w-5xl mx-auto px-6 py-8">
        {/* Profile header */}
        <div className="flex items-center gap-6 mb-8">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-brand-green/20 blur-xl" />
            <Avatar avatar={data.avatar} size="xl" />
          </div>
          <div className="flex-1">
            <h1 className="font-display text-3xl font-bold text-white">{data.first_name}</h1>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <Badge color="green">{data.total_sessions} sessions</Badge>
              <Badge color="amber">{data.total_stars} / {data.max_possible_stars} stars</Badge>
              <span className={`text-sm font-semibold ${trendColor}`}>Trend: {trendLabel}</span>
            </div>
          </div>
          <div className="text-right hidden md:block">
            <p className="text-white/30 text-xs mb-1">Completion Rate</p>
            <p className="font-display text-3xl font-bold text-brand-green">
              {(data.completion_rate * 100).toFixed(0)}%
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white/[0.04] border border-white/[0.06] p-1 rounded-xl mb-6 w-fit overflow-x-auto">
          {TABS.map(([t, Icon, label]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap
                ${tab === t ? 'bg-brand-green text-brand-dark shadow-sm' : 'text-white/50 hover:text-white hover:bg-white/[0.04]'}`}>
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {/* Progress tab */}
        {tab === 'progress' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Radar */}
            <Card>
              <h3 className="font-semibold text-white mb-4">Level Mastery</h3>
              <ResponsiveContainer width="100%" height={260}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="rgba(255,255,255,0.1)" />
                  <PolarAngleAxis dataKey="level" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} />
                  <Radar dataKey="stars" stroke="#A8FF6F" fill="#A8FF6F" fillOpacity={0.2} />
                </RadarChart>
              </ResponsiveContainer>
            </Card>

            {/* Level breakdown */}
            <Card>
              <h3 className="font-semibold text-white mb-4">Level Details</h3>
              <div className="flex flex-col gap-3">
                {data.level_progress.map(l => (
                  <div key={l.level_id} className="flex items-center gap-3">
                    <span className="text-xl w-7">{LEVEL_EMOJIS[l.level_id]}</span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-white/70">{l.level_name}</span>
                        <StarRating stars={l.best_stars} size="sm" />
                      </div>
                      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-brand-green rounded-full transition-all"
                             style={{ width: `${(l.best_stars / 3) * 100}%` }} />
                      </div>
                    </div>
                    <span className="text-white/30 text-xs w-14 text-right">{l.attempts} tries</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Session trend bar chart */}
            {barData.length > 0 && (
              <Card className="md:col-span-2">
                <h3 className="font-semibold text-white mb-4">Recent Session Stars</h3>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={barData}>
                    <XAxis dataKey="name" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 3]} ticks={[0,1,2,3]} tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: '#1E1E3F', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                             labelStyle={{ color: 'rgba(255,255,255,0.5)' }} itemStyle={{ color: '#A8FF6F' }} />
                    <Bar dataKey="stars" fill="#A8FF6F" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            )}

            {/* Sound accuracy over time — real data from VaakMirror Attempts +
                Chime session_events. No vocabulary-size or fluency-rate chart
                here since neither is tracked anywhere in this app; showing
                only what's actually measured rather than approximating. */}
            <Card className="md:col-span-2">
              <h3 className="font-semibold text-white mb-1">Sound Accuracy Over Time</h3>
              <p className="text-white/30 text-xs mb-4">
                Weekly accuracy per sound, from VaakMirror + Chime attempts (last 8 weeks)
              </p>
              {soundProgressLoading ? (
                <div className="h-40 flex items-center justify-center"><Spinner /></div>
              ) : !soundProgress || Object.keys(soundProgress.sounds).length === 0 ? (
                <p className="text-white/30 text-sm py-8 text-center">
                  Not enough sound-level practice data yet — this fills in as {data.first_name} plays
                  VaakMirror or Chime.
                </p>
              ) : (() => {
                const COLORS = ['#A8FF6F', '#FAC775', '#6EC6E8', '#E24B4A', '#B08CE0']
                const topSounds = Object.entries(soundProgress.sounds)
                  .sort((a, b) => b[1].reduce((s, p) => s + p.attempts, 0) - a[1].reduce((s, p) => s + p.attempts, 0))
                  .slice(0, 5)
                  .map(([sound]) => sound)
                const weekSet = new Set()
                topSounds.forEach(s => soundProgress.sounds[s].forEach(p => weekSet.add(p.week)))
                const weeks = [...weekSet].sort()
                const chartData = weeks.map(week => {
                  const row = { week: week.split('-W')[1] ? `W${week.split('-W')[1]}` : week }
                  topSounds.forEach(sound => {
                    const point = soundProgress.sounds[sound].find(p => p.week === week)
                    row[sound] = point ? Math.round(point.accuracy * 100) : null
                  })
                  return row
                })
                return (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={chartData}>
                      <XAxis dataKey="week" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ background: '#1E1E3F', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                               labelStyle={{ color: 'rgba(255,255,255,0.5)' }} formatter={(v) => v == null ? 'no data' : `${v}%`} />
                      <Legend wrapperStyle={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }} />
                      {topSounds.map((sound, i) => (
                        <Line key={sound} type="monotone" dataKey={sound} stroke={COLORS[i % COLORS.length]}
                              strokeWidth={2} dot={{ r: 3 }} connectNulls />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                )
              })()}
            </Card>
          </div>
        )}

        {/* Sessions tab */}
        {tab === 'sessions' && (
          <div className="flex flex-col gap-3">
            {data.recent_sessions.length === 0
              ? <Card className="text-center py-12 text-white/40">No sessions yet</Card>
              : data.recent_sessions.map(s => (
                <Card key={s.id} className="flex items-center gap-4">
                  <span className="text-2xl">{LEVEL_EMOJIS[s.level_id]}</span>
                  <div className="flex-1">
                    <p className="font-semibold text-white capitalize">{s.level_id.replace('_', ' ')}</p>
                    <p className="text-white/30 text-xs">
                      {new Date(s.started_at).toLocaleString()} ·{' '}
                      {s.duration_seconds ? `${Math.round(s.duration_seconds)}s` : 'N/A'}
                    </p>
                  </div>
                  <StarRating stars={s.stars_earned || 0} size="sm" />
                  <Badge color={s.completed ? 'green' : 'gray'}>
                    {s.completed ? 'Done' : 'Quit'}
                  </Badge>
                </Card>
              ))}
          </div>
        )}

        {/* Voice Hurdle Race tab — separate table/endpoint from BreathQuest,
            so this is intentionally self-contained rather than mixed into
            the stats above. */}
        {tab === 'voicehurdlerace' && (
          <div className="flex flex-col gap-4">
            {vhrLoading ? (
              <Card className="text-center py-12"><Spinner /></Card>
            ) : vhrSessions.length === 0 ? (
              <Card className="text-center py-12 text-white/40">No Voice Hurdle Race sessions yet</Card>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <Card className="text-center">
                    <p className="text-2xl font-bold font-display text-brand-green">{vhrSessions.length}</p>
                    <p className="text-white/30 text-xs">races</p>
                  </Card>
                  <Card className="text-center">
                    <p className="text-2xl font-bold font-display text-yellow-400">
                      {Math.max(...vhrSessions.map(s => s.stars))}
                    </p>
                    <p className="text-white/30 text-xs">best stars</p>
                  </Card>
                  <Card className="text-center">
                    <p className="text-2xl font-bold font-display text-brand-teal">
                      {Math.round(vhrSessions.reduce((sum, s) => sum + s.pitch_accuracy, 0) / vhrSessions.length)}%
                    </p>
                    <p className="text-white/30 text-xs">avg pitch accuracy</p>
                  </Card>
                </div>
                {vhrSessions.map(s => (
                  <Card key={s.id} className="flex items-center gap-4">
                    <span className="text-2xl">🐶</span>
                    <div className="flex-1">
                      <p className="font-semibold text-white">{s.level_name}</p>
                      <p className="text-white/30 text-xs">
                        {new Date(s.created_at).toLocaleString()} · score {s.score}
                      </p>
                    </div>
                    <StarRating stars={s.stars} size="sm" />
                  </Card>
                ))}
              </>
            )}
          </div>
        )}

        {/* Chime tab — SQLite-backed, bridged read-only via chimeAPI.
            No stars/score concept here, just raw phoneme attempt scores
            (0.0-1.0), so this is deliberately a plain event log rather
            than forcing it into the star-rating visuals used elsewhere. */}
        {tab === 'chime' && (
          <div className="flex flex-col gap-4">
            {chimeLoading ? (
              <Card className="text-center py-12"><Spinner /></Card>
            ) : chimeError ? (
              <Card className="text-center py-12 text-white/40">
                Couldn't load Chime data — the Chime service may be unavailable right now.
              </Card>
            ) : chimeEvents.length === 0 ? (
              <Card className="text-center py-12 text-white/40">No Chime sessions yet</Card>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <Card className="text-center">
                    <p className="text-2xl font-bold font-display text-brand-green">{chimeEvents.length}</p>
                    <p className="text-white/30 text-xs">attempts logged</p>
                  </Card>
                  <Card className="text-center">
                    <p className="text-2xl font-bold font-display text-brand-teal">
                      {Math.round((chimeEvents.reduce((sum, e) => sum + e.score, 0) / chimeEvents.length) * 100)}%
                    </p>
                    <p className="text-white/30 text-xs">avg phoneme score</p>
                  </Card>
                </div>
                {chimeEvents.slice().reverse().slice(0, 20).map(e => (
                  <Card key={e.id} className="flex items-center gap-4">
                    <span className="text-2xl">🔔</span>
                    <div className="flex-1">
                      <p className="font-semibold text-white capitalize">{e.level_id.replace('_', ' ')}</p>
                      <p className="text-white/30 text-xs">
                        {new Date(e.timestamp).toLocaleString()} · attempt #{e.attempt_number}
                      </p>
                    </div>
                    <Badge color={e.is_valid_attempt ? 'green' : 'gray'}>
                      {Math.round(e.score * 100)}%
                    </Badge>
                  </Card>
                ))}
              </>
            )}
          </div>
        )}

        {/* VaakMirror tab — uses its own already-built therapist dashboard
            endpoint directly rather than re-deriving stats client-side. */}
        {tab === 'vaakmirror' && (
          <div className="flex flex-col gap-4">
            {/* Agent suggestions — the same adaptive-difficulty agent behind
                Chime and BreathQuest, applied here to round_size. Purely
                advisory: nothing changes until the therapist hits Accept. */}
            {!agentLoading && VM_GAMES.some(g => agentSuggestions[g] && agentSuggestions[g].action !== 'hold' && !dismissedSuggestions[g]) && (
              <div className="flex flex-col gap-2">
                {VM_GAMES.filter(g => agentSuggestions[g] && agentSuggestions[g].action !== 'hold' && !dismissedSuggestions[g]).map(g => {
                  const s = agentSuggestions[g]
                  return (
                    <Card key={g} className="border border-brand-teal/30 bg-brand-teal/5">
                      <div className="flex items-start gap-3">
                        <span className="text-lg leading-none mt-0.5" title="Adaptive agent">🧠</span>
                        <div className="flex-1">
                          <p className="text-white text-sm font-medium">{VM_GAME_LABELS[g]}</p>
                          <p className="text-white/50 text-xs mt-0.5">{s.message}</p>
                          <p className="text-white/30 text-xs mt-1">
                            Suggests round size {s.current_round_size} → {s.suggested_round_size}
                            {' '}(based on {s.n_events_considered} recent sessions)
                          </p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button
                            size="sm"
                            onClick={() => acceptAgentSuggestion(g)}
                            disabled={applyingSuggestion === g}
                          >
                            {applyingSuggestion === g ? '…' : 'Accept'}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => dismissAgentSuggestion(g)}>
                            Dismiss
                          </Button>
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}

            {vmLoading ? (
              <Card className="text-center py-12"><Spinner /></Card>
            ) : vmError ? (
              <Card className="text-center py-12 text-white/40">
                Couldn't load Orpheus data — the Orpheus service may be unavailable right now.
              </Card>
            ) : !vmDashboard || vmDashboard.sessions_count === 0 ? (
              <Card className="text-center py-12 text-white/40">No Orpheus sessions yet</Card>
            ) : (
              <>
                <Card className="text-center">
                  <p className="text-2xl font-bold font-display text-brand-green">{vmDashboard.sessions_count}</p>
                  <p className="text-white/30 text-xs">sessions</p>
                </Card>

                {vmDashboard.flagged_gaps.length > 0 && (
                  <Card>
                    <h3 className="font-semibold text-white mb-3">Flagged Gaps</h3>
                    <div className="flex flex-col gap-2">
                      {vmDashboard.flagged_gaps.map(g => (
                        <div key={g.id} className="flex items-start gap-3">
                          <Badge color={g.severity === 'high' ? 'coral' : g.severity === 'medium' ? 'amber' : 'gray'}>
                            {g.severity}
                          </Badge>
                          <div className="flex-1">
                            <p className="text-white text-sm font-medium">{g.title}</p>
                            <p className="text-white/40 text-xs">{g.detail}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {[['Manner', vmDashboard.manner_accuracy], ['Place', vmDashboard.place_accuracy], ['Voicing', vmDashboard.voicing_accuracy]].map(([label, rows]) => (
                  rows.length > 0 && (
                    <Card key={label}>
                      <h3 className="font-semibold text-white mb-3">{label} Accuracy</h3>
                      <div className="flex flex-col gap-2">
                        {rows.map(r => (
                          <div key={r.category} className="flex items-center gap-3">
                            <span className="text-sm text-white/70 w-24 capitalize">{r.category}</span>
                            <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                              <div className="h-full bg-brand-teal rounded-full" style={{ width: `${r.accuracy}%` }} />
                            </div>
                            <span className="text-white/40 text-xs w-16 text-right">{r.accuracy}% ({r.attempts})</span>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )
                ))}
              </>
            )}
          </div>
        )}

        {/* Care tab — Assignments, Goals, Messages, Home Practice, and the
            rule-based Weekly Summary. Kept as one tab rather than four
            since a therapist reviewing a patient wants all of this
            together in one "how's care going" pass. */}
        {tab === 'care' && (
          <div className="flex flex-col gap-6">
            {/* Weekly summary */}
            <Card>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-white">Weekly Summary</h3>
                <div className="flex items-center gap-2">
                  <button onClick={() => setWeekOffset(w => w + 1)}
                          className="flex items-center gap-1 text-white/40 hover:text-white text-xs px-2 py-1 rounded transition-colors">
                    <ChevronLeft size={13} /> Prior week
                  </button>
                  <span className="text-white/30 text-xs">{weekOffset === 0 ? 'This week' : `${weekOffset} week${weekOffset === 1 ? '' : 's'} ago`}</span>
                  <button onClick={() => setWeekOffset(w => Math.max(0, w - 1))} disabled={weekOffset === 0}
                          className="flex items-center gap-1 text-white/40 hover:text-white text-xs px-2 py-1 rounded transition-colors disabled:opacity-20">
                    Next week <ChevronRight size={13} />
                  </button>
                </div>
              </div>
              {summaryLoading ? (
                <div className="py-8 text-center"><Spinner /></div>
              ) : !weeklySummary ? (
                <p className="text-white/40 text-sm">Couldn't load the weekly summary.</p>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-x-4 gap-y-3 mb-4">
                    {[
                      ['BreathQuest', weeklySummary.stats.bq_sessions],
                      ['— completed', weeklySummary.stats.bq_completed],
                      ['Chime attempts', weeklySummary.stats.chime_attempts],
                      ['Assignments done', weeklySummary.stats.assignments_completed],
                      ['Assignments overdue', weeklySummary.stats.assignments_overdue],
                      ['Goals open', weeklySummary.stats.goals_open],
                      ['Goals achieved', weeklySummary.stats.goals_achieved_total],
                      ['Practice days', `${weeklySummary.stats.home_practice_days}/7`],
                      ['Practice minutes', weeklySummary.stats.home_practice_minutes],
                    ].map(([label, value], i) => (
                      <div key={i}>
                        <p className="text-lg font-bold text-white leading-tight">{value}</p>
                        <p className="text-white/40 text-[11px] leading-tight">{label}</p>
                      </div>
                    ))}
                  </div>
                  {weeklySummary.highlights.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {weeklySummary.highlights.map((h, i) => (
                        <span key={i} className="badge bg-white/5 text-white/70 text-xs px-2 py-1 rounded-full">{h}</span>
                      ))}
                    </div>
                  )}
                </>
              )}
            </Card>

            {careLoading ? (
              <Card className="text-center py-12"><Spinner /></Card>
            ) : careError ? (
              <Card className="text-center py-12 text-white/40">Couldn't load Care data right now.</Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Goals */}
                <Card>
                  <h3 className="font-semibold text-white mb-3">Goals</h3>
                  <div className="flex flex-col gap-2 mb-4">
                    {goals.length === 0 && <p className="text-white/30 text-sm">No goals set yet</p>}
                    {goals.map(g => (
                      <div key={g.id} className="flex items-center gap-3 border-b border-white/5 pb-2 last:border-0">
                        <div className="flex-1">
                          <p className="text-white text-sm capitalize">{g.target_metric.replace(/_/g, ' ')}</p>
                          <p className="text-white/30 text-xs">
                            target {g.target_value}{g.current_value != null ? ` · current ${g.current_value}` : ''}
                          </p>
                        </div>
                        <Badge color={g.achieved ? 'green' : 'gray'}>{g.achieved ? 'Achieved' : 'In progress'}</Badge>
                        <button onClick={() => removeGoal(g.id)} className="text-white/20 hover:text-brand-coral"><X size={14} /></button>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-col gap-2">
                    <input className="input text-sm" placeholder="Target metric (e.g. breath_consistency)"
                           value={newGoal.target_metric}
                           onChange={e => setNewGoal(n => ({ ...n, target_metric: e.target.value }))} />
                    <div className="flex gap-2">
                      <input className="input text-sm" type="number" step="0.01" placeholder="Target value"
                             value={newGoal.target_value}
                             onChange={e => setNewGoal(n => ({ ...n, target_value: e.target.value }))} />
                      <input className="input text-sm" type="date"
                             value={newGoal.target_date}
                             onChange={e => setNewGoal(n => ({ ...n, target_date: e.target.value }))} />
                    </div>
                    <Button onClick={saveGoal} disabled={savingGoal || !newGoal.target_metric.trim() || !newGoal.target_value} size="sm">
                      {savingGoal ? 'Saving…' : 'Add Goal'}
                    </Button>
                  </div>
                </Card>

                {/* Home practice ideas library — 50 items, filterable by
                    condition/goal. "Use for assignment" pre-fills the
                    Assignments form below. */}
                <Card>
                  <button onClick={() => setIdeasOpen(o => !o)}
                          className="w-full flex items-center justify-between">
                    <h3 className="font-semibold text-white">Home Practice Ideas</h3>
                    <span className="text-white/40 text-sm">{ideasOpen ? '− Hide' : '+ Browse 50 ideas'}</span>
                  </button>
                  {ideasOpen && (
                    <div className="mt-4">
                      <select className="input text-sm mb-3" value={ideaCondition}
                              onChange={e => setIdeaCondition(e.target.value)}>
                        <option value="">All conditions</option>
                        <option value="articulation">Articulation</option>
                        <option value="phonological">Phonological</option>
                        <option value="language">Language</option>
                        <option value="fluency">Fluency</option>
                        <option value="voice">Voice</option>
                        <option value="oral-motor">Oral motor</option>
                      </select>
                      {ideasLoading ? (
                        <div className="py-6 text-center"><Spinner /></div>
                      ) : (
                        <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
                          {ideas.map(idea => (
                            <div key={idea.id} className="border-b border-white/5 pb-2 last:border-0">
                              <p className="text-white text-sm font-medium">{idea.title}</p>
                              <p className="text-white/40 text-xs mt-0.5 mb-1.5">{idea.description}</p>
                              <button onClick={() => applyIdeaToAssignment(idea)}
                                      className="text-brand-green text-xs hover:underline">
                                Use for assignment →
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </Card>

                {/* Assignments */}
                <Card>
                  <h3 className="font-semibold text-white mb-3">Assignments</h3>
                  <div className="flex flex-col gap-2 mb-4">
                    {assignments.length === 0 && <p className="text-white/30 text-sm">No assignments yet</p>}
                    {assignments.map(a => (
                      <div key={a.id} className="flex items-center gap-3 border-b border-white/5 pb-2 last:border-0">
                        <div className="flex-1">
                          <p className="text-white text-sm">{a.title}</p>
                          <p className="text-white/30 text-xs capitalize">
                            {a.game}{a.level_id ? ` · ${a.level_id}` : ''}
                            {a.due_at ? ` · due ${new Date(a.due_at).toLocaleDateString()}` : ''}
                          </p>
                        </div>
                        <Badge color={a.status === 'completed' ? 'green' : a.status === 'overdue' ? 'coral' : 'gray'}>
                          {a.status}
                        </Badge>
                        <button onClick={() => toggleAssignmentDone(a)} className="text-white/40 hover:text-brand-green text-xs">
                          {a.status === 'completed' ? 'Undo' : 'Done'}
                        </button>
                        <button onClick={() => removeAssignment(a.id)} className="text-white/20 hover:text-brand-coral"><X size={14} /></button>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-col gap-2">
                    <input className="input text-sm" placeholder="Title"
                           value={newAssignment.title}
                           onChange={e => setNewAssignment(n => ({ ...n, title: e.target.value }))} />
                    <textarea className="input text-sm resize-none" rows={2} placeholder="Instructions (optional)"
                           value={newAssignment.instructions}
                           onChange={e => setNewAssignment(n => ({ ...n, instructions: e.target.value }))} />
                    <div className="flex gap-2">
                      <select className="input text-sm" value={newAssignment.game}
                              onChange={e => setNewAssignment(n => ({ ...n, game: e.target.value }))}>
                        <option value="chime">Chime</option>
                        <option value="breathquest">BreathQuest</option>
                        <option value="vaakmirror">Orpheus</option>
                        <option value="voicehurdlerace">Voice Hurdle Race</option>
                      </select>
                      <input className="input text-sm" placeholder="Level id (optional)"
                             value={newAssignment.level_id}
                             onChange={e => setNewAssignment(n => ({ ...n, level_id: e.target.value }))} />
                    </div>
                    <input className="input text-sm" type="date"
                           value={newAssignment.due_at}
                           onChange={e => setNewAssignment(n => ({ ...n, due_at: e.target.value }))} />
                    <Button onClick={saveAssignment} disabled={savingAssignment || !newAssignment.title.trim()} size="sm">
                      {savingAssignment ? 'Saving…' : 'Add Assignment'}
                    </Button>
                  </div>
                </Card>

                {/* Messages */}
                <Card>
                  <h3 className="font-semibold text-white mb-3">Messages</h3>
                  <div className="flex flex-col gap-2 mb-3 max-h-64 overflow-y-auto">
                    {messages.length === 0 && <p className="text-white/30 text-sm">No messages yet</p>}
                    {messages.map(m => (
                      <div key={m.id} className={`text-sm rounded-lg px-3 py-2 max-w-[85%] ${
                        m.sender_role === 'therapist' ? 'bg-brand-green/20 text-white self-end ml-auto' : 'bg-white/10 text-white'
                      }`}>
                        <p>{m.body}</p>
                        <p className="text-white/30 text-[10px] mt-1">
                          {m.sender_role} · {new Date(m.created_at).toLocaleString()}{m.read_at ? ' · read' : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input className="input text-sm flex-1" placeholder="Message to parent…"
                           value={newMessage}
                           onChange={e => setNewMessage(e.target.value)}
                           onKeyDown={e => e.key === 'Enter' && sendMessage()} />
                    <Button onClick={sendMessage} disabled={sendingMessage || !newMessage.trim()} size="sm">Send</Button>
                  </div>
                </Card>

                {/* Home Practice */}
                <Card>
                  <h3 className="font-semibold text-white mb-3">Home Practice Log</h3>
                  <div className="flex flex-col gap-2 mb-4 max-h-64 overflow-y-auto">
                    {homePractice.length === 0 && <p className="text-white/30 text-sm">No home practice logged yet</p>}
                    {homePractice.map(h => (
                      <div key={h.id} className="border-b border-white/5 pb-2 last:border-0">
                        <p className="text-white text-sm">
                          {new Date(h.practiced_on).toLocaleDateString()}
                          {h.duration_minutes ? ` · ${h.duration_minutes} min` : ''}
                        </p>
                        {h.notes && <p className="text-white/40 text-xs">{h.notes}</p>}
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <input className="input text-sm" type="date"
                             value={newPractice.practiced_on}
                             onChange={e => setNewPractice(n => ({ ...n, practiced_on: e.target.value }))} />
                      <input className="input text-sm" type="number" placeholder="Minutes"
                             value={newPractice.duration_minutes}
                             onChange={e => setNewPractice(n => ({ ...n, duration_minutes: e.target.value }))} />
                    </div>
                    <input className="input text-sm" placeholder="Notes (optional)"
                           value={newPractice.notes}
                           onChange={e => setNewPractice(n => ({ ...n, notes: e.target.value }))} />
                    <Button onClick={savePracticeLog} disabled={savingPractice} size="sm">
                      {savingPractice ? 'Saving…' : 'Log Practice'}
                    </Button>
                  </div>
                </Card>
              </div>
            )}
          </div>
        )}

        {/* Notes tab */}
        {tab === 'notes' && (
          <div className="flex flex-col gap-4">
            <Card>
              <h3 className="font-semibold text-white mb-3">Add Note</h3>
              <textarea
                className="input resize-none h-24 text-sm mb-3"
                placeholder="Observations, goals, progress notes…"
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
              />
              <Button onClick={saveNote} disabled={savingNote || !noteText.trim()} size="sm">
                {savingNote ? 'Saving…' : 'Save Note'}
              </Button>
            </Card>

            {notes.map(n => (
              <Card key={n.id} className="border-l-2 border-l-brand-teal">
                <p className="text-white text-sm whitespace-pre-wrap">{n.content}</p>
                <p className="text-white/30 text-xs mt-2">{new Date(n.created_at).toLocaleString()}</p>
                {n.tags?.length > 0 && (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {n.tags.map(t => <span key={t} className="badge bg-brand-teal/20 text-brand-teal">{t}</span>)}
                  </div>
                )}
              </Card>
            ))}

            {notes.length === 0 && (
              <Card className="text-center py-12 text-white/40">No notes yet</Card>
            )}
          </div>
        )}
      </div>
      </div>
    </div>
  )
}
