// Holds the logged-in identity (from BreathQuest login) and, for
// therapists, which patient's dashboard/exercises they're currently
// viewing. Plain localStorage — no context/state library needed for
// something this small, but every reader should go through these
// functions rather than touching localStorage directly, so the storage
// key/shape only needs to change in one place if it ever does.

const AUTH_KEY = 'vaakmirror_auth'
const ACTIVE_PATIENT_KEY = 'vaakmirror_active_patient'

export function getAuth() {
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

// auth shape: { kind: 'therapist' | 'patient', token, id, name }
export function setAuth(auth) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(auth))
}

export function clearAuth() {
  localStorage.removeItem(AUTH_KEY)
  localStorage.removeItem(ACTIVE_PATIENT_KEY)
}

export function getActivePatientId() {
  return localStorage.getItem(ACTIVE_PATIENT_KEY)
}

export function setActivePatientId(id) {
  localStorage.setItem(ACTIVE_PATIENT_KEY, id)
}
