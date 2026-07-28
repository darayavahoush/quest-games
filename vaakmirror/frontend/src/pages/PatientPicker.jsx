import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, ServerCrash, ChevronRight } from 'lucide-react'
import { listPatients } from '../lib/breathquestApi.js'
import { getAuth, setActivePatientId } from '../lib/auth.js'

export default function PatientPicker() {
  const [patients, setPatients] = useState([])
  const [status, setStatus] = useState('loading')
  const navigate = useNavigate()

  useEffect(() => {
    const auth = getAuth()
    listPatients(auth?.token)
      .then((list) => {
        setPatients(list)
        setStatus('ready')
      })
      .catch(() => setStatus('error'))
  }, [])

  function choose(patientId) {
    setActivePatientId(patientId)
    navigate('/dashboard')
  }

  if (status === 'loading') {
    return (
      <div className="max-w-2xl mx-auto px-6 py-24 flex flex-col items-center gap-3 text-ink/50">
        <RefreshCw className="animate-spin" size={22} />
        <p className="text-sm">Loading your patients\u2026</p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="max-w-lg mx-auto px-6 py-24 text-center">
        <ServerCrash size={28} className="mx-auto text-ink/30 mb-4" />
        <p className="font-display text-xl font-bold text-ink mb-2">Couldn't reach BreathQuest</p>
        <p className="text-ink/55 text-sm">Make sure the BreathQuest API is running and try logging in again.</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <p className="font-mono text-xs uppercase tracking-widest text-mint-dark mb-1">Choose a patient</p>
      <h1 className="font-display text-3xl font-bold text-ink mb-8">Whose progress do you want to see?</h1>

      {patients.length === 0 ? (
        <p className="text-ink/50 text-sm">
          No patients yet — add one through BreathQuest first.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {patients.map((p) => (
            <button
              key={p.id}
              onClick={() => choose(p.id)}
              className="flex items-center justify-between rounded-2xl border border-ink/10 bg-white px-5 py-4 text-left hover:border-mint/40 transition-colors"
            >
              <div>
                <p className="font-display font-bold text-ink">{p.first_name}</p>
                <p className="text-ink/45 text-xs">
                  {p.total_sessions ?? 0} BreathQuest sessions
                  {p.age ? ` \u00b7 age ${p.age}` : ''}
                </p>
              </div>
              <ChevronRight size={18} className="text-ink/30" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
