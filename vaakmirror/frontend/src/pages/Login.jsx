import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Stethoscope, Smile } from 'lucide-react'
import { therapistLogin, kidLogin } from '../lib/breathquestApi.js'
import { setAuth } from '../lib/auth.js'

export default function Login() {
  const [mode, setMode] = useState('therapist') // 'therapist' | 'patient'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [playerCode, setPlayerCode] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  async function handleTherapistLogin(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await therapistLogin(email, password)
      setAuth({ kind: 'therapist', token: res.access_token, id: res.therapist_id, name: res.full_name })
      navigate('/patients')
    } catch (err) {
      setError(err.message || 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleKidLogin(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await kidLogin(playerCode.toUpperCase(), pin)
      setAuth({
        kind: 'patient',
        token: res.access_token,
        id: res.patient_id,
        name: res.first_name,
        avatar: res.avatar,
      })
      navigate('/')
    } catch (err) {
      setError(err.message || 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-ink min-h-[calc(100vh-4rem)] flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="flex rounded-full bg-ink-light p-1 mb-8">
          <button
            onClick={() => setMode('therapist')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full text-sm font-semibold transition-colors ${
              mode === 'therapist' ? 'bg-mint text-ink-deep' : 'text-paper/60'
            }`}
          >
            <Stethoscope size={15} /> Therapist
          </button>
          <button
            onClick={() => setMode('patient')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full text-sm font-semibold transition-colors ${
              mode === 'patient' ? 'bg-coral text-paper' : 'text-paper/60'
            }`}
          >
            <Smile size={15} /> Kid
          </button>
        </div>

        {mode === 'therapist' ? (
          <form onSubmit={handleTherapistLogin} className="space-y-4">
            <div>
              <label className="block text-xs text-paper/50 mb-1.5">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl bg-ink-light border border-white/10 px-4 py-3 text-paper text-sm focus:outline-none focus:border-mint/50"
              />
            </div>
            <div>
              <label className="block text-xs text-paper/50 mb-1.5">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl bg-ink-light border border-white/10 px-4 py-3 text-paper text-sm focus:outline-none focus:border-mint/50"
              />
            </div>
            {error && <p className="text-coral text-xs">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full py-3 rounded-full bg-mint text-ink-deep font-semibold disabled:opacity-50"
            >
              {busy ? 'Signing in\u2026' : 'Sign in'}
            </button>
            <p className="text-paper/40 text-xs text-center">
              Don't have an account? Register through BreathQuest.
            </p>
          </form>
        ) : (
          <form onSubmit={handleKidLogin} className="space-y-4">
            <div>
              <label className="block text-xs text-paper/50 mb-1.5">Player code</label>
              <input
                type="text"
                required
                placeholder="e.g. CHICK42"
                value={playerCode}
                onChange={(e) => setPlayerCode(e.target.value)}
                className="w-full rounded-xl bg-ink-light border border-white/10 px-4 py-3 text-paper text-sm uppercase focus:outline-none focus:border-coral/50"
              />
            </div>
            <div>
              <label className="block text-xs text-paper/50 mb-1.5">PIN</label>
              <input
                type="password"
                inputMode="numeric"
                required
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="w-full rounded-xl bg-ink-light border border-white/10 px-4 py-3 text-paper text-sm focus:outline-none focus:border-coral/50"
              />
            </div>
            {error && <p className="text-coral text-xs">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full py-3 rounded-full bg-coral text-paper font-semibold disabled:opacity-50"
            >
              {busy ? 'Signing in\u2026' : 'Let\u2019s play'}
            </button>
            <p className="text-paper/40 text-xs text-center">
              New here? Ask your therapist or grown-up to set you up in BreathQuest first.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
