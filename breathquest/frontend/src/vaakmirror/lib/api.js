// Talks to the merged FastAPI backend's VaakMirror routes, mounted at
// /api/v1/vaakmirror/... (see breathquest/backend/main.py).
//
// Reuses BreathQuest's own axios instance (src/api/client.js) rather than
// a separate fetch-based client — it already has the right baseURL
// (.../api/v1) and already attaches the bq_token header on every request,
// so duplicating that logic here would just be a second place for the
// auth-header behavior to drift out of sync.

import api, { beaconPost } from '../../api/client'

const VM = '/vaakmirror'

export function getDashboard(patientId) {
  return api.get(`${VM}/patients/${patientId}/dashboard`).then(r => r.data)
}

export function getExerciseLibrary() {
  return api.get(`${VM}/exercises`).then(r => r.data)
}

export function getChildExercises(patientId) {
  return api.get(`${VM}/patients/${patientId}/exercises`).then(r => r.data)
}

export function assignExercise(exerciseId, patientId) {
  return api.post(`${VM}/patients/${patientId}/exercises/${exerciseId}/assign`).then(r => r.data)
}

export function updateAssignmentStatus(assignmentId, status) {
  return api.patch(`${VM}/exercise-assignments/${assignmentId}`, { status }).then(r => r.data)
}

export function getGameSettings(patientId, game) {
  return api.get(`${VM}/patients/${patientId}/game-settings/${game}`).then(r => r.data)
}

export function createGameSession(game) {
  // No patient id in the request — the backend derives it from the kid's
  // own token (attached automatically by client.js), so a kid can only
  // ever log sessions against themself.
  return api.post(`${VM}/sessions`, { game }).then(r => r.data)
}

export function logAttempt(sessionId, attempt) {
  return api.post(`${VM}/sessions/${sessionId}/attempts`, attempt).then(r => r.data)
}

export function endGameSession(sessionId) {
  return api.patch(`${VM}/sessions/${sessionId}/end`).then(r => r.data)
}

// Real tab-close/navigation-away needs `keepalive`, not a regular axios
// call — the browser can cancel a normal request mid-flight the instant
// the page actually unloads. The backend's end_session is idempotent (a
// second call after a natural completion is a safe no-op), so this can
// always fire without worrying about a race with the normal completion path.
export function endGameSessionBeacon(sessionId) {
  beaconPost(`${VM}/sessions/${sessionId}/end`, {}, 'PATCH')
}

export function getWeakSounds() {
  return api.get(`${VM}/sessions/weak-sounds`).then(r => r.data)
}
