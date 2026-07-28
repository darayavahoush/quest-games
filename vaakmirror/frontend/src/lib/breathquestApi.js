// VaakMirror has no login of its own — a therapist or kid logs into
// BreathQuest directly, and the token that produces is reused for
// VaakMirror's own API (see src/lib/api.js). This client only talks to
// BreathQuest for the handful of things VaakMirror's frontend needs:
// logging in, and listing a therapist's patients so they can pick one.

const BQ_BASE_URL = import.meta.env.VITE_BREATHQUEST_API_URL || 'http://localhost:8000'

async function request(path, options = {}) {
  const res = await fetch(`${BQ_BASE_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `BreathQuest API ${res.status} on ${path}`)
  }
  return res.json()
}

export function therapistLogin(email, password) {
  return request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
}

export function kidLogin(player_code, pin) {
  return request('/auth/kid-login', { method: 'POST', body: JSON.stringify({ player_code, pin }) })
}

export function listPatients(token) {
  return request('/patients', { headers: { Authorization: `Bearer ${token}` } })
}
