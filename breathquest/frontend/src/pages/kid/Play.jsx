import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getErrorMessage } from '../../api/client'
import { Button, Card, Avatar } from '../../components/ui'

const AVATARS = ['chick', 'dragon', 'cloud', 'star', 'rocket', 'fish']
const AVATAR_NAMES = { chick: 'Chicky', dragon: 'Dino', cloud: 'Cloudy', star: 'Starry', rocket: 'Zoom', fish: 'Finley' }

// Same dusk gradient used across the rest of the kid flow (GamePicker,
// MyProgress, Landing) — this page previously used two one-off purple/green
// radial gradients that didn't match anywhere else in the app.
const BG = { background: 'linear-gradient(180deg, #12142E 0%, #1E1E3F 100%)' }

function PinDots({ length }) {
  return (
    <div className="flex justify-center gap-3 mb-4">
      {[0, 1, 2, 3].map(i => (
        <div key={i} className={`w-5 h-5 rounded-full border-2 transition-all
          ${length > i ? 'bg-brand-green border-brand-green' : 'border-white/30'}`} />
      ))}
    </div>
  )
}

function PinPad({ onDigit, onDelete }) {
  return (
    <div className="grid grid-cols-3 gap-2 mb-4">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map((d, i) => (
        <button key={i}
          onClick={() => d === '⌫' ? onDelete() : d !== '' ? onDigit(String(d)) : null}
          disabled={d === ''}
          className={`h-14 rounded-xl font-vm-display text-xl font-bold transition-all active:scale-95
            ${d === '' ? 'invisible' : d === '⌫' ? 'bg-white/5 text-white/50 hover:bg-white/10'
              : 'bg-white/10 text-white hover:bg-brand-green/20 hover:text-brand-green'}`}>
          {d}
        </button>
      ))}
    </div>
  )
}

export default function KidPlay() {
  const [mode, setMode]         = useState('choose')   // choose | register | login
  const [avatar, setAvatar]     = useState('chick')
  const [firstName, setFirstName] = useState('')
  const [playerCode, setPlayerCode] = useState('')
  const [pin, setPin]           = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [registered, setRegistered] = useState(null)  // {player_code, first_name}
  const [mounted, setMounted]   = useState(false)
  const { loginKid, registerKid } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 30)
    return () => clearTimeout(t)
  }, [])

  const handlePin = (digit) => { if (pin.length < 4) setPin(p => p + digit) }
  const deletePin = () => setPin(p => p.slice(0, -1))

  const handleRegister = async () => {
    if (!firstName.trim()) { setError('What should we call you?'); return }
    if (pin.length < 4)    { setError('Choose a 4-digit PIN'); return }
    setError(''); setLoading(true)
    try {
      const data = await registerKid(firstName.trim(), avatar, pin)
      setRegistered({ player_code: data.player_code, first_name: data.first_name })
    } catch (e) {
      setError(getErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  const handleLogin = async () => {
    if (!playerCode.trim()) { setError('Enter your player code'); return }
    if (pin.length < 4)     { setError('Enter your PIN'); return }
    setError(''); setLoading(true)
    try {
      await loginKid(playerCode.trim().toUpperCase(), pin)
      navigate('/play/levels')
    } catch {
      setError('Wrong code or PIN — try again!')
      setPin('')
    } finally {
      setLoading(false)
    }
  }

  // ---- Show player code after register ----
  if (registered) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center" style={BG}>
        <div className="relative mb-5 motion-safe:animate-float">
          <div className="absolute inset-0 rounded-full bg-brand-green/20 blur-2xl motion-safe:animate-pulse-slow" />
          <Avatar avatar={avatar} size="xl" />
        </div>
        <h1 className="font-vm-display text-4xl font-bold text-white mb-2">
          You're in, {AVATAR_NAMES[avatar]}! 🎉
        </h1>
        <p className="text-white/50 mb-8">Write this down so you can log back in:</p>
        <Card className="border-2 border-brand-green p-8 mb-6 w-full max-w-xs">
          <p className="text-white/40 text-sm mb-1">Your Player Code</p>
          <p className="font-vm-display text-4xl font-bold text-brand-green tracking-widest mb-4">
            {registered.player_code}
          </p>
          <p className="text-white/40 text-sm mb-1">Your PIN</p>
          <p className="font-vm-display text-3xl font-bold text-brand-amber tracking-widest">
            {'•'.repeat(pin.length)}
          </p>
        </Card>
        <p className="text-white/30 text-xs mb-8">Show this to your teacher too!</p>
        <Button size="lg" onClick={() => navigate('/play/levels')}>Let's Play! 🚀</Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={BG}>
      {mode === 'choose' && (
        <Link to="/" className="absolute top-6 left-6 text-white/30 hover:text-white/60 text-sm">← Back</Link>
      )}

      {/* Mode chooser */}
      {mode === 'choose' && (
        <div className="text-center w-full max-w-sm">
          <div className="relative w-20 h-20 mx-auto mb-4">
            <div className="absolute inset-0 rounded-full bg-ember/20 blur-2xl motion-safe:animate-pulse-slow" />
            <div className="relative w-full h-full flex items-center justify-center text-6xl motion-safe:animate-float">🎮</div>
          </div>
          <h1 className="font-vm-display text-4xl font-bold text-white mb-2">BreathQuest</h1>
          <p className="text-white/40 mb-10">Ready to play?</p>
          <div className="flex flex-col gap-4">
            <button onClick={() => setMode('register')}
              className={`group relative overflow-hidden rounded-[2rem] p-6 text-left
                         bg-gradient-to-br from-brand-amber/20 to-dusk-mid/50 backdrop-blur-sm border-2 border-brand-amber/40
                         hover:border-brand-amber hover:-translate-y-1 hover:shadow-xl hover:shadow-brand-amber/20
                         transition-all duration-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
              style={{ transitionDelay: mounted ? '0ms' : '0ms' }}>
              <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-brand-amber/10 blur-2xl
                              group-hover:bg-brand-amber/20 transition-colors duration-300" />
              <div className="relative">
                <div className="text-3xl mb-2 group-hover:scale-110 transition-transform duration-300 inline-block">✨</div>
                <p className="font-vm-display text-xl font-bold text-white">New Player</p>
                <p className="text-white/40 text-sm">Create your account</p>
              </div>
            </button>
            <button onClick={() => setMode('login')}
              className={`group relative overflow-hidden rounded-[2rem] p-6 text-left
                         bg-gradient-to-br from-brand-green/20 to-dusk-mid/50 backdrop-blur-sm border-2 border-brand-green/40
                         hover:border-brand-green hover:-translate-y-1 hover:shadow-xl hover:shadow-brand-green/20
                         transition-all duration-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
              style={{ transitionDelay: mounted ? '90ms' : '0ms' }}>
              <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-brand-green/10 blur-2xl
                              group-hover:bg-brand-green/20 transition-colors duration-300" />
              <div className="relative">
                <div className="text-3xl mb-2 group-hover:scale-110 transition-transform duration-300 inline-block">🔑</div>
                <p className="font-vm-display text-xl font-bold text-white">I have a code</p>
                <p className="text-white/40 text-sm">Log back in</p>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Register */}
      {mode === 'register' && (
        <Card className="w-full max-w-sm border border-white/10">
          <button onClick={() => { setMode('choose'); setPin(''); setError('') }}
                  className="text-white/30 hover:text-white/60 text-sm mb-6 transition-colors">← Back</button>
          <h1 className="font-vm-display text-3xl font-bold text-white mb-6 text-center">Create Account</h1>

          {/* Name */}
          <div className="mb-5">
            <label className="text-sm text-white/50 block mb-1">Your first name</label>
            <input className="input text-lg" placeholder="e.g. Alex"
                   value={firstName} onChange={e => setFirstName(e.target.value)} />
          </div>

          {/* Avatar — real character badges, matching the rest of the app,
              instead of bare emoji in plain boxes */}
          <label className="text-sm text-white/50 block mb-3">Pick your character</label>
          <div className="grid grid-cols-3 gap-3 mb-6">
            {AVATARS.map(av => (
              <button key={av} onClick={() => setAvatar(av)}
                className="flex flex-col items-center gap-1.5 group">
                <div className={`rounded-full p-1 transition-all
                  ${avatar === av ? 'ring-2 ring-brand-green scale-110 shadow-lg shadow-brand-green/30' : 'ring-2 ring-transparent group-hover:ring-white/20'}`}>
                  <Avatar avatar={av} size="lg" />
                </div>
                <span className={`text-xs font-semibold transition-colors
                  ${avatar === av ? 'text-brand-green' : 'text-white/35 group-hover:text-white/60'}`}>
                  {AVATAR_NAMES[av]}
                </span>
              </button>
            ))}
          </div>

          {/* PIN */}
          <label className="text-sm text-white/50 block mb-2">Choose a 4-digit PIN</label>
          <PinDots length={pin.length} />
          <PinPad onDigit={handlePin} onDelete={deletePin} />

          {error && <p className="text-brand-coral text-sm text-center mb-3">{error}</p>}
          <Button className="w-full" size="lg" onClick={handleRegister} disabled={loading}>
            {loading ? 'Creating…' : 'Create Account! 🎉'}
          </Button>
        </Card>
      )}

      {/* Login */}
      {mode === 'login' && (
        <Card className="w-full max-w-sm border border-white/10">
          <button onClick={() => { setMode('choose'); setPin(''); setError('') }}
                  className="text-white/30 hover:text-white/60 text-sm mb-6 transition-colors">← Back</button>
          <h1 className="font-vm-display text-3xl font-bold text-white mb-6 text-center">Welcome Back!</h1>

          <div className="mb-5">
            <label className="text-sm text-white/50 block mb-1">Your Player Code</label>
            <input className="input text-center text-xl font-bold tracking-widest uppercase"
                   placeholder="e.g. CHICK42"
                   value={playerCode} onChange={e => setPlayerCode(e.target.value.toUpperCase())} />
          </div>

          <label className="text-sm text-white/50 block mb-2">Your PIN</label>
          <PinDots length={pin.length} />
          <PinPad onDigit={handlePin} onDelete={deletePin} />

          {error && <p className="text-brand-coral text-sm text-center mb-3">{error}</p>}
          <Button className="w-full" size="lg" onClick={handleLogin} disabled={loading}>
            {loading ? 'Checking…' : "Let's Play! 🚀"}
          </Button>
        </Card>
      )}
    </div>
  )
}
