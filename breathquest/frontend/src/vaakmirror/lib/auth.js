// Reads the logged-in identity directly from BreathQuest's own auth
// storage (see breathquest's AuthContext.jsx) — VaakMirror has no login
// of its own, it only ever verifies tokens BreathQuest issued, so after
// the merge it should read the SAME keys BreathQuest's AuthProvider
// already populates on login, rather than maintaining a second copy.
//
// bq_user_type is 'therapist' | 'patient' — mapped to VaakMirror's
// existing 'kind' vocabulary ('therapist' | 'patient') so nothing
// downstream (api.js, the game pages) needs to change.

const TOKEN_KEY = 'bq_token'
const USER_TYPE_KEY = 'bq_user_type'
const USER_DATA_KEY = 'bq_user_data'
const ACTIVE_PATIENT_KEY = 'vaakmirror_active_patient'

export function getAuth() {
  try {
    const token = localStorage.getItem(TOKEN_KEY)
    const kind = localStorage.getItem(USER_TYPE_KEY)
    const raw = localStorage.getItem(USER_DATA_KEY)
    if (!token || !kind || !raw) return null

    const userData = JSON.parse(raw)
    return {
      kind,
      token,
      id: userData.id,
      name: userData.first_name || userData.name || null,
    }
  } catch {
    return null
  }
}

// Kept as no-ops rather than removed outright, so nothing importing
// { setAuth, clearAuth } from the pre-merge code breaks at build time.
// Real login/logout now goes exclusively through BreathQuest's
// AuthContext (loginKid / loginTherapist / logout) — these are here for
// backwards compatibility only and should be deleted once nothing calls
// them anymore.
export function setAuth() {
  console.warn('vaakmirror/lib/auth.js: setAuth() is a no-op post-merge — use AuthContext instead')
}

export function clearAuth() {
  localStorage.removeItem(ACTIVE_PATIENT_KEY)
}

export function getActivePatientId() {
  return localStorage.getItem(ACTIVE_PATIENT_KEY)
}

export function setActivePatientId(id) {
  localStorage.setItem(ACTIVE_PATIENT_KEY, id)
}
