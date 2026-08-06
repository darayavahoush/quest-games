import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getErrorMessage } from '../../api/client'
import { Button, Input, Card } from '../../components/ui'
import {
  ClipboardList, LineChart, ShieldCheck,
  Mail, Lock, User, Building2, Eye, EyeOff, ArrowLeft, Stethoscope,
} from 'lucide-react'

const VALUE_PROPS = [
  { icon: ClipboardList, text: 'Assign exercises and track every session in one place' },
  { icon: LineChart, text: 'See progress trends across all your patients at a glance' },
  { icon: ShieldCheck, text: "Each patient links only to their own teacher — nothing shared" },
]

export default function TherapistLogin() {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ email: '', password: '', full_name: '', clinic_name: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { loginTherapist, registerTherapist } = useAuth()
  const navigate = useNavigate()

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'login') {
        await loginTherapist(form.email, form.password)
      } else {
        await registerTherapist(form)
      }
      navigate('/therapist/dashboard')
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2" style={{ background: '#0F1D22' }}>

      <div className="hidden lg:flex flex-col justify-center px-16 relative overflow-hidden"
           style={{ background: 'radial-gradient(ellipse at 30% 20%, #1E8C7D 0%, #12222A 55%, #0F1D22 100%)' }}>
        <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full bg-mint/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full bg-mint-dark/10 blur-3xl" />

        <div className="relative z-10 max-w-sm">
          <div className="w-14 h-14 rounded-2xl bg-mint/15 border border-mint/25 flex items-center justify-center mb-8">
            <Stethoscope className="w-7 h-7 text-mint-light" />
          </div>
          <h1 className="font-vm-display text-4xl font-bold text-paper leading-tight mb-4">
            Everything your patients practice, in one dashboard.
          </h1>
          <p className="text-paper/50 mb-10">
            BreathQuest links each kid's play directly to your caseload — no separate logins to juggle.
          </p>

          <div className="flex flex-col gap-5">
            {VALUE_PROPS.map(({ icon: Icon, text }, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-mint/10 border border-mint/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Icon className="w-4 h-4 text-mint-light" />
                </div>
                <p className="text-paper/70 text-sm leading-relaxed pt-1">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center p-6 py-16">
        <div className="w-full max-w-md">
          <Link to="/" className="inline-flex items-center gap-2 text-white/50 hover:text-white
                                  hover:bg-white/5 transition-colors mb-8 text-sm font-medium
                                  -ml-3 px-3 py-1.5 rounded-full">
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>

          <div className="mb-8 lg:hidden text-center">
            <div className="w-14 h-14 rounded-2xl bg-mint/15 border border-mint/25 flex items-center justify-center mx-auto mb-4">
              <Stethoscope className="w-7 h-7 text-mint-light" />
            </div>
            <h1 className="font-vm-display text-2xl font-bold text-white">Teacher Portal</h1>
          </div>

          <div className="mb-6 hidden lg:block">
            <h2 className="font-vm-display text-2xl font-bold text-white">
              {mode === 'login' ? 'Welcome back' : 'Create your account'}
            </h2>
            <p className="text-white/40 text-sm mt-1">
              {mode === 'login' ? 'Sign in to your dashboard' : 'Takes about a minute'}
            </p>
          </div>

          <Card className="border-white/10">
            <div className="flex bg-white/5 rounded-xl p-1 mb-6">
              {['login', 'register'].map(m => (
                <button key={m} onClick={() => { setMode(m); setError('') }}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all
                    ${mode === m ? 'bg-mint text-brand-dark shadow-sm' : 'text-white/50 hover:text-white'}`}>
                  {m === 'login' ? 'Sign In' : 'Register'}
                </button>
              ))}
            </div>

            <form onSubmit={submit} className="flex flex-col gap-4">
              {mode === 'register' && (
                <>
                  <Input icon={User} label="Full name" placeholder="Dr. Jane Smith"
                         value={form.full_name} onChange={set('full_name')} required />
                  <Input icon={Building2} label="Clinic name (optional)" placeholder="Happy Kids Clinic"
                         value={form.clinic_name} onChange={set('clinic_name')} />
                </>
              )}
              <Input icon={Mail} label="Email" type="email" placeholder="you@clinic.com"
                     value={form.email} onChange={set('email')} required />

              <Input
                icon={Lock}
                label="Password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={form.password}
                onChange={set('password')}
                required
                rightElement={
                  <button type="button" onClick={() => setShowPassword(s => !s)}
                          className="text-white/30 hover:text-white/60 transition-colors">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
              />

              {error && (
                <div className="bg-brand-coral/10 border border-brand-coral/30 rounded-xl px-4 py-3
                                text-brand-coral text-sm">
                  {error}
                </div>
              )}

              <Button type="submit" variant="teal" className="w-full mt-2" disabled={loading}>
                {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
              </Button>
            </form>
          </Card>

          <p className="text-center text-white/25 text-xs mt-6">
            Your patients' data stays linked to your account only.
          </p>
        </div>
      </div>
    </div>
  )
}
