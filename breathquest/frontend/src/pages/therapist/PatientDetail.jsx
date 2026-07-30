import { useState, useEffect } from 'react'
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

export default function PatientDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab]         = useState('progress')   // progress | sessions | voicehurdlerace | chime | vaakmirror | notes
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
  }, [id])

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
          {[['progress', '📊 Progress'], ['sessions', '🎮 Sessions'], ['voicehurdlerace', '🐶 Voice Hurdle'], ['chime', '🔔 Chime'], ['vaakmirror', '🪞 VaakMirror'], ['notes', '📝 Notes']].map(([t, label]) => (
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
            {vmLoading ? (
              <Card className="text-center py-12"><Spinner /></Card>
            ) : vmError ? (
              <Card className="text-center py-12 text-white/40">
                Couldn't load VaakMirror data — the VaakMirror service may be unavailable right now.
              </Card>
            ) : !vmDashboard || vmDashboard.sessions_count === 0 ? (
              <Card className="text-center py-12 text-white/40">No VaakMirror sessions yet</Card>
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
