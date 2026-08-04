import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Flame, Star, Calendar } from 'lucide-react'
import { Avatar } from '../../components/ui'
import { meAPI } from '../../api/client'

// Kid-facing progress view. The backend endpoint this reads from
// (GET /me/progress, routers/kid_progress.py) already existed — cross-game
// totals, weekly play count, a streak — it just never had a page to show
// it on. Deliberately keeps the backend's own framing: no raw scores, no
// per-level breakdown, no clinical language, just numbers a kid can be
// proud of.
export default function MyProgress() {
  const navigate = useNavigate()
  const [progress, setProgress] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | error

  useEffect(() => {
    let cancelled = false
    meAPI.progress()
      .then(({ data }) => { if (!cancelled) { setProgress(data); setStatus('ready') } })
      .catch(() => { if (!cancelled) setStatus('error') })
    return () => { cancelled = true }
  }, [])

  const starPct = progress ? Math.min(100, Math.round((progress.total_stars / Math.max(1, progress.max_possible_stars)) * 100)) : 0

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(180deg, #12142E 0%, #1E1E3F 100%)' }}>
      <div className="max-w-2xl mx-auto px-6 py-10">
        <button
          onClick={() => navigate('/play')}
          className="inline-flex items-center gap-1.5 text-white/40 hover:text-white text-sm mb-8 transition-colors"
        >
          <ArrowLeft size={15} /> Back to games
        </button>

        {status === 'loading' && (
          <div className="text-center py-20 text-white/40">Loading your progress…</div>
        )}

        {status === 'error' && (
          <div className="text-center py-20">
            <p className="text-white/50 mb-2">Couldn't load your progress right now.</p>
            <p className="text-white/30 text-sm">Try again in a bit!</p>
          </div>
        )}

        {status === 'ready' && progress && (
          <>
            <div className="text-center mb-10">
              <Avatar avatar={progress.avatar} size="xl" />
              <h1 className="font-vm-display text-3xl font-bold text-white mt-5">
                {progress.first_name}'s Progress
              </h1>
              <p className="text-white/40 mt-2">Look how far you've come! 🎉</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              {/* Streak */}
              <div className="rounded-2xl p-6 text-center border border-white/10 bg-white/5">
                <div className="w-12 h-12 rounded-full bg-ember/15 flex items-center justify-center mx-auto mb-3">
                  <Flame className="w-6 h-6 text-ember" />
                </div>
                <p className="font-vm-display text-3xl font-bold text-white">{progress.current_streak_days}</p>
                <p className="text-white/40 text-xs mt-1">
                  day{progress.current_streak_days === 1 ? '' : 's'} in a row
                </p>
              </div>

              {/* This week */}
              <div className="rounded-2xl p-6 text-center border border-white/10 bg-white/5">
                <div className="w-12 h-12 rounded-full bg-mint/15 flex items-center justify-center mx-auto mb-3">
                  <Calendar className="w-6 h-6 text-mint" />
                </div>
                <p className="font-vm-display text-3xl font-bold text-white">{progress.games_played_this_week}</p>
                <p className="text-white/40 text-xs mt-1">
                  game{progress.games_played_this_week === 1 ? '' : 's'} this week
                </p>
              </div>

              {/* Stars */}
              <div className="rounded-2xl p-6 text-center border border-white/10 bg-white/5">
                <div className="w-12 h-12 rounded-full bg-brand-amber/15 flex items-center justify-center mx-auto mb-3">
                  <Star className="w-6 h-6 text-brand-amber" fill="currentColor" fillOpacity={0.3} />
                </div>
                <p className="font-vm-display text-3xl font-bold text-white">{progress.total_stars}</p>
                <p className="text-white/40 text-xs mt-1">total stars</p>
              </div>
            </div>

            <div className="rounded-2xl p-6 border border-white/10 bg-white/5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white/60 text-sm font-medium">Stars earned</span>
                <span className="text-white/40 text-xs">
                  {progress.total_stars} / {progress.max_possible_stars}
                </span>
              </div>
              <div className="h-3 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-brand-amber to-ember rounded-full transition-[width] duration-700"
                  style={{ width: `${starPct}%` }}
                />
              </div>
              {starPct === 100 && (
                <p className="text-brand-amber text-xs font-semibold mt-3 text-center">
                  🏆 You've earned every star — amazing!
                </p>
              )}
            </div>

            {progress.current_streak_days === 0 && (
              <p className="text-white/30 text-xs text-center mt-8">
                Play a game today to start a new streak!
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
