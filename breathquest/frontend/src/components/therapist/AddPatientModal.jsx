import { useState } from 'react'
import { patientsAPI, getErrorMessage } from '../../api/client'
import { Button, Input, Avatar } from '../ui'

const AVATARS = ['chick', 'dragon', 'cloud', 'star', 'rocket', 'fish']
const AVATAR_EMOJIS = { chick:'🐥', dragon:'🐉', cloud:'☁️', star:'⭐', rocket:'🚀', fish:'🐠' }

export default function AddPatientModal({ onClose, onAdded }) {
  const [form, setForm]   = useState({ first_name: '', pin: '', age: '', avatar: 'chick', diagnosis_notes: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // Created patient's player_code — the actual login credential the kid
  // needs. Previously the modal closed the instant the API call succeeded,
  // so there was never a moment to show this to the therapist at all.
  const [created, setCreated] = useState(null)

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    if (!/^\d{4}$/.test(form.pin)) { setError('PIN must be exactly 4 digits'); return }
    setError(''); setLoading(true)
    try {
      const { data } = await patientsAPI.create({
        ...form,
        age: form.age ? parseInt(form.age) : undefined,
      })
      setCreated(data)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to add patient'))
    } finally {
      setLoading(false)
    }
  }

  const finishUp = () => {
    onAdded()
  }

  if (created) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-brand-card border border-white/10 rounded-2xl w-full max-w-md p-6 text-center">
          <div className="text-5xl mb-4">{AVATAR_EMOJIS[created.avatar] || '🎉'}</div>
          <h2 className="text-xl font-bold text-white mb-1">{created.first_name} is all set!</h2>
          <p className="text-white/50 text-sm mb-5">
            Give this login code to {created.first_name} — they'll use it with their 4-digit PIN
            to sign in and play.
          </p>
          <div className="bg-white/5 border border-white/10 rounded-xl py-4 mb-6">
            <p className="text-white/40 text-xs uppercase tracking-widest mb-1">Player Code</p>
            <p className="font-display text-3xl font-bold text-brand-green tracking-widest">
              {created.player_code}
            </p>
          </div>
          <Button className="w-full" onClick={finishUp}>Done</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-brand-card border border-white/10 rounded-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Add New Patient</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white text-2xl leading-none">×</button>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          {/* Avatar picker */}
          <div>
            <label className="text-sm font-medium text-white/70 block mb-2">Choose Avatar</label>
            <div className="flex gap-2 flex-wrap">
              {AVATARS.map(av => (
                <button key={av} type="button"
                  onClick={() => setForm(f => ({ ...f, avatar: av }))}
                  className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl
                    transition-all border-2 ${form.avatar === av
                      ? 'border-brand-green bg-brand-green/20 scale-110'
                      : 'border-white/10 bg-white/5 hover:border-white/30'}`}>
                  {AVATAR_EMOJIS[av]}
                </button>
              ))}
            </div>
          </div>

          <Input label="First Name" placeholder="e.g. Alex" value={form.first_name}
                 onChange={set('first_name')} required />
          <Input label="4-Digit PIN" placeholder="e.g. 1234" maxLength={4}
                 value={form.pin} onChange={set('pin')} required />
          <Input label="Age (optional)" type="number" placeholder="e.g. 7" min={2} max={18}
                 value={form.age} onChange={set('age')} />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-white/70">Notes (optional)</label>
            <textarea
              className="input resize-none h-20 text-sm"
              placeholder="Diagnosis, goals, anything relevant…"
              value={form.diagnosis_notes}
              onChange={set('diagnosis_notes')}
            />
          </div>

          {error && (
            <div className="bg-brand-coral/10 border border-brand-coral/30 rounded-xl px-4 py-3 text-brand-coral text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3 mt-2">
            <Button variant="ghost" className="flex-1" type="button" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" type="submit" disabled={loading}>
              {loading ? 'Adding…' : 'Add Patient'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
