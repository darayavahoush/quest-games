import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { dashboardAPI, chimeAPI, vaakmirrorAPI } from '../../api/client'
import { voiceHurdleRaceApi } from '../../api/voiceHurdleRaceApi'
import { Card, Badge, Avatar, StarRating, Button, Spinner, PageLoader } from '../../components/ui'
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
         BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts'

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
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab]         = useState('progress')   // progress | sessions | voicehurdlerace | chime | vaakmirror | care | notes
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

  return (
    <div className="min-h-screen bg-brand-dark">
      {/* Nav */}
      <nav className="border-b border-white/10 px-6 py-4 flex items-center gap-4 sticky top-0 bg-brand-dark/95 backdrop-blur z-10">
        <button onClick={() => navigate('/therapist/dashboard')}
                className="text-white/40 hover:text-white text-sm transition-colors">← Dashboard</button>
        <span className="text-white/20">/</span>
        <span className="text-white font-semibold">{data.first_name}</span>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Profile header */}
        <div className="flex items-center gap-6 mb-8">
          <Avatar avatar={data.avatar} size="xl" />
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
        <div className="flex gap-1 bg-white/5 p-1 rounded-xl mb-6 w-fit">
          {[['progress', '📊 Progress'], ['sessions', '🎮 Sessions'], ['voicehurdlerace', '🐶 Voice Hurdle'], ['chime', '🔔 Chime'], ['vaakmirror', '🪞 Orpheus'], ['care', '🩺 Care'], ['notes', '📝 Notes']].map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all
                ${tab === t ? 'bg-brand-green text-brand-dark' : 'text-white/50 hover:text-white'}`}>
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
                          className="text-white/40 hover:text-white text-xs px-2 py-1 rounded transition-colors">
                    ← Prior week
                  </button>
                  <span className="text-white/30 text-xs">{weekOffset === 0 ? 'This week' : `${weekOffset} week${weekOffset === 1 ? '' : 's'} ago`}</span>
                  <button onClick={() => setWeekOffset(w => Math.max(0, w - 1))} disabled={weekOffset === 0}
                          className="text-white/40 hover:text-white text-xs px-2 py-1 rounded transition-colors disabled:opacity-20">
                    Next week →
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
                        <button onClick={() => removeGoal(g.id)} className="text-white/20 hover:text-brand-coral text-xs">✕</button>
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
                        <button onClick={() => removeAssignment(a.id)} className="text-white/20 hover:text-brand-coral text-xs">✕</button>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-col gap-2">
                    <input className="input text-sm" placeholder="Title"
                           value={newAssignment.title}
                           onChange={e => setNewAssignment(n => ({ ...n, title: e.target.value }))} />
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
  )
}
