import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

export default function ParentAuth() {
  const navigate = useNavigate()
  const { loginParent, registerParent } = useAuth()
  const [mode, setMode] = useState('login')
  const [codeType, setCodeType] = useState('player_code')
  const [form, setForm] = useState({ code: '', email: '', password: '', fullName: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'login') {
        await loginParent(form.email, form.password)
      } else {
        await registerParent({ code: form.code, codeType, email: form.email, password: form.password, fullName: form.fullName })
      }
      navigate('/parent/dashboard')
    } catch (err) {
      setError(err?.response?.data?.detail || 'Something went wrong — please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center px-6 py-14">
      <div className="w-full max-w-md">
        <Link to="/" className="block text-center text-paper/40 hover:text-paper/70 text-sm mb-6">&larr; Back home</Link>
        <div className="bg-ink-light border border-white/10 rounded-3xl p-8">
          <h1 className="font-display text-2xl font-bold text-paper mb-1 text-center">
            {mode === 'login' ? 'Parent sign in' : 'Create your parent account'}
          </h1>
          <p className="text-paper/45 text-sm text-center mb-6">
            {mode === 'login' ? "Keep track of your child's progress" : "Link your account to your child's profile"}
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <>
                <div className="flex rounded-full bg-ink p-1 border border-white/10 text-xs font-semibold">
                  <button type="button" onClick={() => setCodeType('player_code')}
                    className={`flex-1 rounded-full py-2 transition-colors ${codeType === 'player_code' ? 'bg-mint text-ink' : 'text-paper/50'}`}>
                    My child's game code
                  </button>
                  <button type="button" onClick={() => setCodeType('invite')}
                    className={`flex-1 rounded-full py-2 transition-colors ${codeType === 'invite' ? 'bg-mint text-ink' : 'text-paper/50'}`}>
                    Code from therapist
                  </button>
                </div>
                <input type="text" required
                  placeholder={codeType === 'player_code' ? "Child's player code (e.g. CHICK42)" : 'Invite code from your therapist'}
                  value={form.code} onChange={update('code')}
                  className="w-full bg-ink border border-white/10 rounded-xl px-4 py-3 text-paper placeholder:text-paper/30 focus:outline-none focus:border-mint/50" />
                <input type="text" placeholder="Your name (optional)" value={form.fullName} onChange={update('fullName')}
                  className="w-full bg-ink border border-white/10 rounded-xl px-4 py-3 text-paper placeholder:text-paper/30 focus:outline-none focus:border-mint/50" />
              </>
            )}
            <input type="email" required placeholder="Email" value={form.email} onChange={update('email')}
              className="w-full bg-ink border border-white/10 rounded-xl px-4 py-3 text-paper placeholder:text-paper/30 focus:outline-none focus:border-mint/50" />
            <input type="password" required placeholder="Password" value={form.password} onChange={update('password')}
              className="w-full bg-ink border border-white/10 rounded-xl px-4 py-3 text-paper placeholder:text-paper/30 focus:outline-none focus:border-mint/50" />
            {error && <p className="text-coral text-sm">{error}</p>}
            <button type="submit" disabled={busy}
              className="w-full bg-mint text-ink font-semibold rounded-full py-3 hover:bg-mint/90 transition-colors disabled:opacity-50">
              {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>
          <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}
            className="w-full text-center text-paper/40 hover:text-paper/70 text-sm mt-5">
            {mode === 'login' ? "Don't have an account? Create one" : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    </div>
  )
}
