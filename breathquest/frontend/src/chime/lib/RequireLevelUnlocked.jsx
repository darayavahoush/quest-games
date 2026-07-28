import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { getPassedLevels, getUnlockedLevels } from './levelProgress'

// Wraps a phoneme game route so a kid can't bypass the lock by typing
// the URL directly — mirrors the same check ChimeHome uses for cards.
export default function RequireLevelUnlocked({ levelId, children }) {
  const [state, setState] = useState('loading') // loading | allowed | blocked

  useEffect(() => {
    let cancelled = false
    getPassedLevels()
      .then(passed => {
        if (cancelled) return
        setState(getUnlockedLevels(passed)[levelId] ? 'allowed' : 'blocked')
      })
      .catch(() => {
        if (!cancelled) setState(levelId === 'aa' ? 'allowed' : 'blocked')
      })
    return () => { cancelled = true }
  }, [levelId])

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center text-paper/40 text-sm">
        Loading…
      </div>
    )
  }
  if (state === 'blocked') {
    return <Navigate to="/play/chime" replace />
  }
  return children
}
