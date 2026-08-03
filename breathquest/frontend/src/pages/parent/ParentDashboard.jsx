import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, Calendar, Star, Sparkles } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { Avatar } from '../../components/ui'
import { parentAPI } from '../../api/client'

function formatDate(iso) {
  if (!iso) return 'Not yet played'
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// Parent-facing dashboard, reading GET /parent/progress — a fully-built
// backend endpoint (routers/parent.py) that already existed with zero
// frontend consumer, same situation as kid_progress.py before MyProgress.jsx.
// Deliberately trend-level, matching what the backend itself already
// decided to expose: no raw per-attempt scores, no avg_breath_strength
// (backend sends that field back as null on purpose -- see the comment on
// LevelProgress in parent.py), no clinical notes. That's therapist-only,
// via a completely separate dashboard.py + therapist token.
export default function ParentDashboard() {
  const { parent, logout } = useAuth()
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | error

  useEffect(() => {
    let cancelled = false
    parentAPI.progress()
      .then(({ data }) => { if (!cancelled) { setData(data); setStatus('ready') } })
      .catch(() => { if (!cancelled) setStatus('error') })
    return () => { cancelled = true }
  }, [])

  const starPct = data ? Math.min(100, Math.round((data.total_stars / Math.max(1, data.max_possible_stars)) * 100)) : 0
  const trend = data?.improvement_trend

  return (
    <div className="bg-ink min-h-screen">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <Avatar avatar={data?.avatar} size="sm" />
          <div>
            <span className="font-display font-bold text-paper">
              {data?.child_first_name || parent?.child_first_name}'s Progress
            </span>
          </div>
        </div>
        <button onClick={logout} className="text-paper/30 hover:text-paper/60 text-sm transition-colors">
          Log out
        </button>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-10">
        {status === 'loading' && (
          <div className="text-center py-20 text-paper/40">Loading progress…</div>
        )}

        {status === 'error' && (
          <div className="text-center py-20">
            <p className="text-paper/50 mb-2">Couldn't load progress right now.</p>
            <p className="text-paper/30 text-sm">Try again in a bit!</p>
          </div>
        )}

        {status === 'ready' && data && (
          <>
            {/* Weekly summary -- the one prose element on this page, everything
                else is numbers/chips. This is the rule-based (no LLM) narrative
                dashboard.py already generates for therapists too. */}
            <div className="rounded-2xl border border-mint/20 bg-mint/5 p-6 mb-6">
              <p className="font-mono text-xs uppercase tracking-widest text-mint mb-2">This week</p>
              <p className="text-paper text-[15px] leading-relaxed mb-4">{data.weekly_summary.narrative}</p>
              {data.weekly_summary.highlights?.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {data.weekly_summary.highlights.map((h, i) => (
                    <span key={i} className="text-xs font-semibold px-3 py-1 rounded-full bg-mint/15 text-mint-light border border-mint/25">
                      {h}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Top stats row */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="rounded-2xl p-5 text-center border border-white/10 bg-white/5">
                <Sparkles className="w-5 h-5 text-brand-amber mx-auto mb-2" />
                <p className="font-display text-2xl font-bold text-paper">{data.total_sessions}</p>
                <p className="text-paper/40 text-xs mt-1">sessions played</p>
              </div>
              <div className="rounded-2xl p-5 text-center border border-white/10 bg-white/5">
                <Star className="w-5 h-5 text-brand-amber mx-auto mb-2" fill="currentColor" fillOpacity={0.3} />
                <p className="font-display text-2xl font-bold text-paper">{Math.round(data.completion_rate * 100)}%</p>
                <p className="text-paper/40 text-xs mt-1">sessions completed</p>
              </div>
              <div className="rounded-2xl p-5 text-center border border-white/10 bg-white/5">
                {trend == null ? (
                  <>
                    <Calendar className="w-5 h-5 text-paper/40 mx-auto mb-2" />
                    <p className="font-display text-2xl font-bold text-paper/50">—</p>
                    <p className="text-paper/40 text-xs mt-1">not enough data yet</p>
                  </>
                ) : (
                  <>
                    {trend >= 0
                      ? <TrendingUp className="w-5 h-5 text-mint mx-auto mb-2" />
                      : <TrendingDown className="w-5 h-5 text-coral mx-auto mb-2" />}
                    <p className={`font-display text-2xl font-bold ${trend >= 0 ? 'text-mint' : 'text-coral'}`}>
                      {trend >= 0 ? '+' : ''}{trend}
                    </p>
                    <p className="text-paper/40 text-xs mt-1">star trend</p>
                  </>
                )}
              </div>
            </div>

            {/* Total stars bar */}
            <div className="rounded-2xl p-6 border border-white/10 bg-white/5 mb-8">
              <div className="flex items-center justify-between mb-2">
                <span className="text-paper/60 text-sm font-medium">Total stars (BreathQuest)</span>
                <span className="text-paper/40 text-xs">{data.total_stars} / {data.max_possible_stars}</span>
              </div>
              <div className="h-3 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-brand-amber to-ember rounded-full transition-[width] duration-700"
                  style={{ width: `${starPct}%` }}
                />
              </div>
            </div>

            {/* Per-level breakdown -- best stars and last played, no raw
                scores (avg_breath_strength always comes back null here on
                purpose from the backend). */}
            <h2 className="font-display text-lg font-bold text-paper mb-3">By level</h2>
            <div className="flex flex-col gap-2">
              {data.level_progress.map((lvl) => (
                <div
                  key={lvl.level_id}
                  className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
                >
                  <div>
                    <p className="text-paper text-sm font-semibold">{lvl.level_name}</p>
                    <p className="text-paper/35 text-xs mt-0.5">
                      {lvl.attempts} attempt{lvl.attempts === 1 ? '' : 's'} · last played {formatDate(lvl.last_played)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {Array.from({ length: 3 }, (_, j) => (
                      <span key={j} className="text-lg" style={{ color: j < lvl.best_stars ? '#FAC775' : 'rgba(255,255,255,0.12)' }}>
                        ★
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <p className="text-paper/25 text-xs text-center mt-10">
              Showing BreathQuest progress. Ask your child's therapist about progress in other games.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
