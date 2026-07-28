import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Clock, RefreshCw, ServerCrash, Plus, PlayCircle } from 'lucide-react'
import { getExerciseLibrary, getChildExercises, assignExercise, updateAssignmentStatus } from '../lib/api.js'
import { getActivePatientId } from '../lib/auth.js'
import { getExerciseContent } from '../data/exerciseContent.js'
import ExerciseDemo from '../components/ExerciseDemo.jsx'

const STATUS_STYLE = {
  assigned: { label: 'Assigned', color: 'text-coral', icon: PlayCircle },
  in_progress: { label: 'In progress', color: 'text-gold', icon: Clock },
  completed: { label: 'Completed', color: 'text-mint-dark', icon: CheckCircle2 },
  not_started: { label: 'Not started', color: 'text-ink/35', icon: PlayCircle },
}

export default function Exercises() {
  const [library, setLibrary] = useState([])
  const [assignments, setAssignments] = useState([])
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [busyId, setBusyId] = useState(null)
  const navigate = useNavigate()
  const patientId = getActivePatientId()

  function load() {
    if (!patientId) {
      navigate('/patients')
      return
    }
    setStatus('loading')
    Promise.all([getExerciseLibrary(), getChildExercises(patientId)])
      .then(([lib, assigns]) => {
        setLibrary(lib)
        setAssignments(assigns)
        setStatus('ready')
      })
      .catch(() => setStatus('error'))
  }

  useEffect(load, [])

  // Most recent assignment per exercise (assignments come back newest-first)
  const assignmentByExerciseId = {}
  for (const a of assignments) {
    if (!assignmentByExerciseId[a.exercise.id]) assignmentByExerciseId[a.exercise.id] = a
  }

  async function handleAssign(exerciseId) {
    setBusyId(exerciseId)
    try {
      await assignExercise(exerciseId, patientId)
      load()
    } catch {
      setBusyId(null)
    }
  }

  async function handleComplete(assignmentId, exerciseId) {
    setBusyId(exerciseId)
    try {
      await updateAssignmentStatus(assignmentId, 'completed')
      load()
    } catch {
      setBusyId(null)
    }
  }

  if (status === 'loading') {
    return (
      <div className="max-w-6xl mx-auto px-6 py-24 flex flex-col items-center gap-3 text-ink/50">
        <RefreshCw className="animate-spin" size={22} />
        <p className="text-sm">Loading exercise library…</p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="max-w-lg mx-auto px-6 py-24 text-center">
        <ServerCrash size={28} className="mx-auto text-ink/30 mb-4" />
        <p className="font-display text-xl font-bold text-ink mb-2">Couldn't reach the API</p>
        <p className="text-ink/55 text-sm leading-relaxed mb-6">
          Make sure the backend is running (<code className="text-xs bg-ink/5 px-1.5 py-0.5 rounded">uvicorn app.main:app --reload --port 8000</code>) and try again.
        </p>
        <button onClick={load} className="px-5 py-2.5 rounded-full bg-ink text-paper text-sm font-semibold inline-flex items-center gap-2">
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <p className="font-mono text-xs uppercase tracking-widest text-mint-dark mb-1">
        Oromotor exercise library
      </p>
      <h1 className="font-display text-3xl font-bold text-ink mb-3">Practice exercises</h1>
      <p className="text-ink/55 max-w-xl mb-10">
        Mouth, tongue, lip, and cheek drills, with a quick animated
        demonstration and step-by-step instructions for each. These get
        auto-assigned when the dashboard detects a pattern the games alone
        can't fix; you can also assign one manually below.
      </p>

      <div className="flex flex-col gap-5">
        {library.map((ex) => {
          const assignment = assignmentByExerciseId[ex.id]
          const s = assignment ? STATUS_STYLE[assignment.status] : null
          const Icon = s?.icon
          const isBusy = busyId === ex.id
          const content = getExerciseContent(ex.title)

          return (
            <div key={ex.id} className="rounded-2xl border border-ink/10 bg-white overflow-hidden flex flex-col sm:flex-row">
              <div className="sm:w-44 shrink-0 bg-ink flex items-center justify-center p-6">
                <ExerciseDemo kind={content.demo} className="w-full h-full" />
              </div>
              <div className="p-5 flex-1">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <p className="font-display font-bold text-ink leading-snug">{ex.title}</p>
                  <span className="text-xs text-ink/40 shrink-0">{ex.duration_label}</span>
                </div>
                <p className="text-ink/55 text-sm leading-relaxed mb-4">{ex.description}</p>

                <ol className="space-y-1.5 mb-4">
                  {content.steps.map((step, i) => (
                    <li key={i} className="flex gap-2.5 text-sm text-ink/70 leading-snug">
                      <span className="font-mono text-xs text-mint-dark shrink-0 mt-0.5">{i + 1}</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>

                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex gap-1.5 flex-wrap">
                    {ex.target_categories.map((t) => (
                      <span
                        key={t}
                        className="font-mono text-[10px] uppercase tracking-wide px-2 py-1 rounded-full bg-ink/5 text-ink/60"
                      >
                        {t}
                      </span>
                    ))}
                  </div>

                  {!assignment && (
                    <button
                      onClick={() => handleAssign(ex.id)}
                      disabled={isBusy}
                      className="flex items-center gap-1.5 text-xs font-semibold text-ink/60 hover:text-ink disabled:opacity-50"
                    >
                      <Plus size={14} /> {isBusy ? 'Assigning…' : 'Assign'}
                    </button>
                  )}

                  {assignment && assignment.status !== 'completed' && (
                    <button
                      onClick={() => handleComplete(assignment.id, ex.id)}
                      disabled={isBusy}
                      className={`flex items-center gap-1.5 text-xs font-semibold ${s.color} hover:opacity-80 disabled:opacity-50`}
                    >
                      <Icon size={14} /> {isBusy ? 'Updating…' : `${s.label} \u2014 mark complete`}
                    </button>
                  )}

                  {assignment && assignment.status === 'completed' && (
                    <span className={`flex items-center gap-1.5 text-xs font-semibold ${s.color}`}>
                      <Icon size={14} /> {s.label}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
