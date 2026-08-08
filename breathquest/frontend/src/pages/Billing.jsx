import { useEffect, useState } from 'react'
import { CreditCard, Loader2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { Sidebar, Card, Button } from '../components/ui'
import { billingAPI, getErrorMessage } from '../api/client'

// Shared by /therapist/billing and /parent/billing -- same subscription
// shape either way (SubscriptionOut from the backend), just a different
// pair of GET/POST endpoints depending on which owner type this is.
export default function Billing({ role }) {
  const { therapist, parent, logout } = useAuth()
  const [sub, setSub] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | none | error
  const [checkingOut, setCheckingOut] = useState(false)
  const [error, setError] = useState('')

  const getSub  = role === 'therapist' ? billingAPI.getSubscription       : billingAPI.getParentSubscription
  const doCheckout = role === 'therapist' ? billingAPI.checkout           : billingAPI.parentCheckout

  useEffect(() => {
    let cancelled = false
    getSub()
      .then(({ data }) => { if (!cancelled) { setSub(data); setStatus('ready') } })
      .catch((err) => {
        if (cancelled) return
        if (err.response?.status === 404) setStatus('none')
        else setStatus('error')
      })
    return () => { cancelled = true }
  }, [])

  async function handleCheckout() {
    setError('')
    setCheckingOut(true)
    try {
      const { data } = await doCheckout()
      window.location.href = data.checkout_url
    } catch (err) {
      // Today this is always the 501 stub -- surfaces as a normal error
      // message rather than a silent failure, since there's genuinely
      // nothing to redirect to yet.
      setError(getErrorMessage(err, 'Billing is not set up yet -- check back soon'))
      setCheckingOut(false)
    }
  }

  const daysLeft = sub?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(sub.trial_ends_at) - new Date()) / 86400000))
    : null

  return (
    <div className="min-h-screen relative flex"
         style={{ background: 'radial-gradient(ellipse 1400px 800px at 15% -10%, #1D9E75 0%, #16332D 35%, #12122A 70%)' }}>
      <Sidebar
        role={role}
        items={[
          { label: 'Dashboard', icon: CreditCard, to: role === 'therapist' ? '/therapist/dashboard' : '/parent/dashboard' },
          { label: 'Billing', icon: CreditCard, to: role === 'therapist' ? '/therapist/billing' : '/parent/billing' },
        ]}
        name={role === 'therapist' ? therapist?.full_name : parent?.full_name}
        onLogout={logout}
      />

      <div className="relative flex-1 min-w-0 max-w-2xl mx-auto px-6 py-8">
        <h1 className="font-display text-3xl font-bold text-white mb-6">Billing</h1>

        {status === 'loading' && (
          <div className="flex items-center gap-2 text-white/50">
            <Loader2 size={18} className="animate-spin" /> Loading subscription…
          </div>
        )}

        {status === 'error' && (
          <Card className="p-6 text-white/70">
            Couldn't load your subscription right now. Try refreshing.
          </Card>
        )}

        {status === 'none' && (
          <Card className="p-6 text-white/70">
            No subscription found on this account yet.
          </Card>
        )}

        {status === 'ready' && sub && (
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white/40 text-xs uppercase tracking-wide mb-1">Plan</p>
                <p className="text-white text-lg font-semibold">{sub.plan_type.replace('_', ' ')}</p>
              </div>
              <span className={
                'px-3 py-1 rounded-full text-xs font-medium ' +
                (sub.status === 'trialing' ? 'bg-brand-teal/20 text-brand-teal'
                  : sub.status === 'active' ? 'bg-green-500/20 text-green-400'
                  : 'bg-brand-amber/20 text-brand-amber')
              }>
                {sub.status}
              </span>
            </div>

            {sub.status === 'trialing' && (
              <p className="text-white/60 text-sm">
                {daysLeft} day{daysLeft === 1 ? '' : 's'} left in your trial.
              </p>
            )}
            {sub.status === 'active' && sub.current_period_end && (
              <p className="text-white/60 text-sm">
                Renews {new Date(sub.current_period_end).toLocaleDateString()}.
              </p>
            )}
            {(sub.status === 'past_due' || sub.status === 'canceled') && (
              <p className="text-brand-amber text-sm">
                Your subscription is {sub.status.replace('_', ' ')} — subscribe again to keep access.
              </p>
            )}

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <Button onClick={handleCheckout} disabled={checkingOut}>
              {checkingOut ? 'Redirecting…' : sub.status === 'active' ? 'Manage subscription' : 'Subscribe'}
            </Button>
          </Card>
        )}
      </div>
    </div>
  )
}
