// Talks to the VaakMirror FastAPI backend. Every call attaches whatever
// token is currently stored from BreathQuest login (see src/lib/auth.js)
// — VaakMirror has no login of its own, it only verifies tokens
// BreathQuest issued.

import { getAuth } from './auth.js'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function request(path, options = {}) {
  const auth = getAuth()
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
      ...(options.headers || {}),
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`API ${res.status} on ${path}: ${body}`)
  }
  if (res.status === 204) return null
  return res.json()
}

export function getDashboard(patientId) {
  return request(`/patients/${patientId}/dashboard`)
}

export function getExerciseLibrary() {
  return request('/exercises')
}

export function getChildExercises(patientId) {
  return request(`/patients/${patientId}/exercises`)
}

export function assignExercise(exerciseId, patientId) {
  return request(`/patients/${patientId}/exercises/${exerciseId}/assign`, { method: 'POST' })
}

export function updateAssignmentStatus(assignmentId, status) {
  return request(`/exercise-assignments/${assignmentId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

export function createGameSession(game) {
  // No patient id in the request — the backend derives it from the kid's
  // own token, so a kid can only ever log sessions against themself.
  return request('/sessions', {
    method: 'POST',
    body: JSON.stringify({ game }),
  })
}

export function logAttempt(sessionId, attempt) {
  return request(`/sessions/${sessionId}/attempts`, {
    method: 'POST',
    body: JSON.stringify(attempt),
  })
}

export function endGameSession(sessionId) {
  return request(`/sessions/${sessionId}/end`, { method: 'PATCH' })
}
