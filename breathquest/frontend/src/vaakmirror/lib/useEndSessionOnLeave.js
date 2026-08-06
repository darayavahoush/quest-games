import { useEffect } from 'react'
import { endGameSession, endGameSessionBeacon } from './api.js'

/**
 * Closes out an in-progress VaakMirror session if the kid leaves before
 * finishing. Each of the 4 game components (MirrorMirror, TongueTamer,
 * LipSyncHero, MinimalPairDrill) already ends its session on natural
 * completion themselves — this only covers the cases they didn't: backing
 * out to the exercise picker mid-round (SPA-internal, a regular call is
 * fine), and actually closing/refreshing the tab (needs a keepalive beacon,
 * since a normal call gets cancelled mid-flight the instant the page
 * unloads). The backend's end_session is idempotent, so this never has to
 * worry about racing the natural-completion path.
 *
 * sessionIdRef: a ref holding the current session id (or null before one's
 * started / after it's already ended).
 */
export function useEndSessionOnLeave(sessionIdRef) {
  useEffect(() => {
    const handlePageHide = () => {
      if (sessionIdRef.current) endGameSessionBeacon(sessionIdRef.current)
    }
    window.addEventListener('pagehide', handlePageHide)
    return () => {
      window.removeEventListener('pagehide', handlePageHide)
      if (sessionIdRef.current) endGameSession(sessionIdRef.current).catch(() => {})
    }
  }, [])
}
