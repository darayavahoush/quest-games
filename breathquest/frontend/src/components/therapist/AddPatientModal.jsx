import { useState, useRef } from 'react'
import { Check, Copy } from 'lucide-react'
import { patientsAPI, getErrorMessage } from '../../api/client'
import { Button, Input } from '../ui'

// Name + accent per avatar — previously this picker was just six identical
// grey squares with an emoji in them, no name, no color, nothing to make
// picking one feel like an actual choice rather than a formality.
const CHARACTERS = [
  { id: 'chick',  name: 'Chip',     emoji: '🐥', color: '#FAC775' },
  { id: 'dragon', name: 'Blaze',    emoji: '🐉', color: '#E24B4A' },
  { id: 'bunny',  name: 'Puff',     emoji: '🐰', color: '#F5A3C7' },
  { id: 'fox',    name: 'Ranger',   emoji: '🦊', color: '#E8791A' },
  { id: 'rocket', name: 'Zoom',     emoji: '🚀', color: '#7850DC' },
  { id: 'fish',   name: 'Bubbles',  emoji: '🐠', color: '#1D9E75' },
]
const CHAR_BY_ID = Object.fromEntries(CHARACTERS.map(c => [c.id, c]))

function CharacterPicker({ value, onChange }) {
  const selected = CHAR_BY_ID[value]
  return (
    <div>
      <label className="text-sm font-medium text-white/70 block mb-2">Choose a Character</label>
      <div className="grid grid-cols-3 gap-2.5 mb-3">
        {CHARACTERS.map((c) => {
          const isSelected = c.id === value
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onChange(c.id)}
              className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl border-2 transition-all duration-200
                ${isSelected ? 'scale-105 shadow-lg' : 'border-white/10 bg-white/5 hover:border-white/25'}`}
              style={isSelected ? {
                borderColor: c.color,
                backgroundColor: `${c.color}22`,
                boxShadow: `0 0 0 1px ${c.color}55, 0 6px 16px -4px ${c.color}66`,
              } : undefined}
            >
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center text-2xl"
                style={{ backgroundColor: `${c.color}33` }}
              >
                {c.emoji}
              </div>
              <span className="text-xs font-semibold" style={{ color: isSelected ? c.color : 'rgba(255,255,255,0.5)' }}>
                {c.name}
              </span>
            </button>
          )
        })}
      </div>
      {selected && (
        <p className="text-white/40 text-xs text-center">
          Meet <span className="font-semibold" style={{ color: selected.color }}>{selected.name}</span> — this
          is who they'll play as.
        </p>
      )}
    </div>
  )
}

// Four separate digit boxes, auto-advancing — replaces a single free-text
// "type 4 digits" field with something that actually looks and behaves
// like the PIN it is.
function PinEntry({ value, onChange }) {
  const digits = value.split('').concat(['', '', '', '']).slice(0, 4)
  const refs = [useRef(), useRef(), useRef(), useRef()]

  const setDigit = (i, d) => {
    const next = [...digits]
    next[i] = d
    onChange(next.join(''))
    if (d && i < 3) refs[i + 1].current?.focus()
  }

  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs[i - 1].current?.focus()
  }

  return (
    <div>
      <label className="text-sm font-medium text-white/70 block mb-2">4-Digit PIN</label>
      <div className="flex gap-2.5">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={refs[i]}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={d}
            onChange={(e) => setDigit(i, e.target.value.replace(/\D/g, '').slice(-1))}
            onKeyDown={(e) => handleKeyDown(i, e)}
            className="w-14 h-14 text-center text-2xl font-bold bg-white/5 border border-white/15
                       rounded-xl text-white focus:outline-none focus:border-brand-green transition-colors"
          />
        ))}
      </div>
    </div>
  )
}

export default function AddPatientModal({ onClose, onAdded }) {
  const [form, setForm]   = useState({ first_name: '', pin: '', age: '', avatar: 'chick', diagnosis_notes: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
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

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(created.player_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard API can be unavailable (permissions, non-HTTPS context) —
      // the code is still shown on screen, so this is a nice-to-have, not
      // something worth surfacing an error for.
    }
  }

  if (created) {
    const char = CHAR_BY_ID[created.avatar]
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-brand-card border border-white/10 rounded-2xl w-full max-w-md p-6 text-center">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-5xl mx-auto mb-4 motion-safe:animate-float"
            style={{ backgroundColor: `${char?.color ?? '#A8FF6F'}22` }}
          >
            {char?.emoji ?? '🎉'}
          </div>
          <h2 className="text-xl font-bold text-white mb-1">{created.first_name} is all set!</h2>
          <p className="text-white/50 text-sm mb-5">
            Give this login code to {created.first_name} — they'll use it with their 4-digit PIN
            to sign in and play as {char?.name ?? 'their character'}.
          </p>
          <div className="bg-white/5 border border-white/10 rounded-xl py-4 mb-6 relative">
            <p className="text-white/40 text-xs uppercase tracking-widest mb-1">Player Code</p>
            <p className="font-display text-3xl font-bold text-brand-green tracking-widest mb-3">
              {created.player_code}
            </p>
            <button
              onClick={copyCode}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full
                         bg-white/5 border border-white/10 text-white/60 hover:text-white hover:border-white/25 transition-colors"
            >
              {copied ? <><Check size={13} className="text-brand-green" /> Copied!</> : <><Copy size={13} /> Copy code</>}
            </button>
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
          <CharacterPicker value={form.avatar} onChange={(id) => setForm(f => ({ ...f, avatar: id }))} />

          <Input label="First Name" placeholder="e.g. Alex" value={form.first_name}
                 onChange={set('first_name')} required />
          <PinEntry value={form.pin} onChange={(v) => setForm(f => ({ ...f, pin: v }))} />
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
