import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { dashboardAPI } from '../../api/client'
import { Card, Badge, Button, PageLoader } from '../../components/ui'
import { ArrowLeft } from 'lucide-react'

const LEVEL_OPTIONS = [
  { id: 'balloon', label: 'Balloon' }, { id: 'candle', label: 'Candle' },
  { id: 'dandelion', label: 'Dandelion' }, { id: 'dragon', label: 'Dragon' },
  { id: 'float_rider', label: 'Float Rider' }, { id: 'pinwheel', label: 'Pinwheel' },
]

const POLICY_LABELS = {
  rule_based: 'Rule-based', bandit: 'Bandit', tabular_q: 'Tabular Q-learning',
  ppo: 'PPO', recurrent_ppo: 'Recurrent PPO',
}

export default function AgentInsight() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [levelId, setLevelId] = useState(LEVEL_OPTIONS[0].id)
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    dashboardAPI.agentStatus(id, levelId)
      .then(r => setStatus(r.data))
      .catch(e => setError(e?.response?.data?.detail || 'Could not load agent status'))
      .finally(() => setLoading(false))
  }, [id, levelId])

  useEffect(() => { load() }, [load])

  return (
    <div className="max-w-3xl mx-auto p-6">
      <Button variant="ghost" onClick={() => navigate(`/therapist/patients/${id}`)} className="mb-4">
        <ArrowLeft size={16} className="mr-1" /> Back to patient
      </Button>

      <h1 className="text-xl font-display font-bold text-white mb-1">What the agent sees</h1>
      <p className="text-white/40 text-sm mb-6">
        Read-only — this does not affect gameplay or training data.
      </p>

      <div className="flex gap-2 mb-6 flex-wrap">
        {LEVEL_OPTIONS.map(l => (
          <button
            key={l.id}
            onClick={() => setLevelId(l.id)}
            className={`px-3 py-1.5 rounded-full text-sm ${
              l.id === levelId ? 'bg-brand-green text-black' : 'bg-white/10 text-white/60'
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>

      {loading ? <PageLoader /> : error ? (
        <Card className="text-center py-12 text-white/40">{error}</Card>
      ) : !status ? null : (
        <div className="flex flex-col gap-4">
          <Card>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-white">Active policy</h3>
              <Badge color={status.policy === status.requested_policy ? 'green' : 'amber'}>
                {POLICY_LABELS[status.policy] || status.policy}
              </Badge>
            </div>
            {status.downgrade_reason && (
              <p className="text-white/50 text-sm">{status.downgrade_reason}</p>
            )}
            <p className="text-white/30 text-xs mt-2">
              Based on {status.n_events_considered} recent attempts on this level.
            </p>
          </Card>

          <Card>
            <h3 className="font-semibold text-white mb-3">What the agent is looking at</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-white/30 text-xs">Success rate</p>
                <p className="text-white">{(status.obs.success_rate * 100).toFixed(0)}%</p>
              </div>
              <div>
                <p className="text-white/30 text-xs">Difficulty</p>
                <p className="text-white">{(status.obs.difficulty * 100).toFixed(0)}%</p>
              </div>
              <div>
                <p className="text-white/30 text-xs">Frustration</p>
                <p className="text-white">{(status.obs.frustration * 100).toFixed(0)}%</p>
              </div>
              <div>
                <p className="text-white/30 text-xs">Severity</p>
                <p className="text-white">{status.obs.severity_numeric.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-white/30 text-xs">Targeted sound</p>
                <p className="text-white">{status.obs.is_targeted_sound ? 'Yes' : 'No'}</p>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
