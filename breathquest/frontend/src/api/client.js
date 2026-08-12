import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'

// A pagehide-safe way to fire a final request when the kid actually closes
// the tab or navigates off-site — regular axios/fetch calls can get
// cancelled mid-flight the instant the page unloads, silently dropping
// session-end and agent-quit events. `keepalive: true` is a browser
// guarantee that the request still gets sent even after the page is gone.
// No response is read (the page may already be gone by the time it would
// arrive) — this is fire-and-forget by design.
export function beaconPost(path, body, method = 'POST') {
  const token = localStorage.getItem('bq_token')
  try {
    fetch(`${BASE_URL}${path}`, {
      method,
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    })
  } catch {
    // best-effort — nothing to do if even starting the request throws
  }
}

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Attach token automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('bq_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// A 401 here means the backend has rejected the token itself (expired,
// invalid, or the patient/therapist/parent record it points to no longer
// exists) — not a per-endpoint permission issue. Before this, that state was
// invisible: AuthContext only checks whether *something* is in localStorage
// to decide isKid/isTherapist/isParent, it never re-validates the token, so
// the UI kept acting "logged in" while every real request quietly failed and
// each caller improvised its own fallback (e.g. Chime's level-unlock check
// silently treating "couldn't reach the backend" the same as "nothing
// passed yet", which looks exactly like a stuck next-level bug rather than
// what it actually is — a dead session). Handle it once, here, instead.
//
// Skip this for the auth endpoints themselves — a wrong PIN/password is a
// legitimate 401 with no session to invalidate, not a dead-session signal.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !error.config?.url?.startsWith('/auth/')) {
      const userType = localStorage.getItem('bq_user_type')
      localStorage.removeItem('bq_token')
      localStorage.removeItem('bq_user_type')
      localStorage.removeItem('bq_user_data')

      const loginPath = userType === 'therapist' ? '/therapist/login'
        : userType === 'parent' ? '/parent/login'
        : '/play' // kid landing — mirrors ProtectedKid's own redirect target

      // Full reload, not a router push: this file has no router context (it's
      // a plain axios instance, not a component), and a hard reload is exactly
      // what's needed anyway to clear any in-memory AuthContext/game state left
      // over from the dead session.
      if (window.location.pathname !== loginPath) {
        window.location.href = loginPath
      }
    }
    return Promise.reject(error)
  }
)

// ------------------------------------------------------------------ //
//  Auth                                                                //
// ------------------------------------------------------------------ //

export const verifyAPI = {
  request: (data) => api.post('/verify/request', data),
  confirm: (data) => api.post('/verify/confirm', data),
}

export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login:    (data) => api.post('/auth/login', data),
  kidRegister: (data) => api.post('/auth/kid-register', data),
  kidLogin:    (data) => api.post('/auth/kid-login', data),
  parentRegister: (data) => api.post('/auth/parent-register', data),
  parentLogin:    (data) => api.post('/auth/parent-login', data),

  therapistCandidates: () => api.get('/auth/therapist-candidates'),
  kidCandidates:       () => api.get('/auth/kid-candidates'),
  kidPinSetup: (data) => api.post('/auth/kid-pin-setup', data),
}

// ------------------------------------------------------------------ //
//  Patients                                                            //
// ------------------------------------------------------------------ //

export const patientsAPI = {
  list:   ()           => api.get('/breathquest/patients'),
  get:    (id)         => api.get(`/breathquest/patients/${id}`),
  create: (data)       => api.post('/breathquest/patients', data),
  update: (id, data)   => api.patch(`/breathquest/patients/${id}`, data),
  delete: (id)         => api.delete(`/breathquest/patients/${id}`),
  generateParentInviteCode: (id) => api.post(`/breathquest/patients/${id}/parent-invite-code`),
}

// ------------------------------------------------------------------ //
//  Sessions                                                            //
// ------------------------------------------------------------------ //

export const sessionsAPI = {
  start:     (data)              => api.post('/sessions', data),
  logEvents: (id, events)        => api.post(`/sessions/${id}/events`, { events }),
  end:       (id, data)          => api.post(`/sessions/${id}/end`, data),
  get:       (id)                => api.get(`/sessions/${id}`),
}

// ------------------------------------------------------------------ //
//  Dashboard                                                           //
// ------------------------------------------------------------------ //

export const dashboardAPI = {
  summary:     ()           => api.get('/dashboard/summary'),
  progress:    (patientId)  => api.get(`/dashboard/patients/${patientId}/progress`),
  agentStatus: (patientId, levelId, policy = 'tabular_q') =>
    api.get(`/breath/agent/status/${patientId}`, { params: { level_id: levelId, policy } }),
  createNote:  (patientId, data) => api.post(`/dashboard/patients/${patientId}/notes`, data),
  listNotes:   (patientId)       => api.get(`/dashboard/patients/${patientId}/notes`),
  updateNote:  (noteId, data)    => api.patch(`/dashboard/notes/${noteId}`, data),
  deleteNote:  (noteId)          => api.delete(`/dashboard/notes/${noteId}`),

  // Assignments ("homework")
  createAssignment: (patientId, data) => api.post(`/dashboard/patients/${patientId}/assignments`, data),
  listAssignments:  (patientId)       => api.get(`/dashboard/patients/${patientId}/assignments`),
  updateAssignment: (assignmentId, data) => api.patch(`/dashboard/assignments/${assignmentId}`, data),
  deleteAssignment: (assignmentId)       => api.delete(`/dashboard/assignments/${assignmentId}`),

  // Goals
  createGoal: (patientId, data) => api.post(`/dashboard/patients/${patientId}/goals`, data),
  listGoals:  (patientId)       => api.get(`/dashboard/patients/${patientId}/goals`),
  updateGoal: (goalId, data)    => api.patch(`/dashboard/goals/${goalId}`, data),
  deleteGoal: (goalId)          => api.delete(`/dashboard/goals/${goalId}`),

  // Messages (therapist <-> parent log)
  createMessage:    (patientId, data) => api.post(`/dashboard/patients/${patientId}/messages`, data),
  listMessages:     (patientId)       => api.get(`/dashboard/patients/${patientId}/messages`),
  markMessageRead:  (messageId)       => api.post(`/dashboard/messages/${messageId}/read`),

  // Home practice log (manual, parent-reported)
  createHomePractice: (patientId, data) => api.post(`/dashboard/patients/${patientId}/home-practice`, data),
  listHomePractice:   (patientId)       => api.get(`/dashboard/patients/${patientId}/home-practice`),

  // Multi-child alert view
  listAlerts: (inactiveDays) => api.get('/dashboard/alerts', { params: inactiveDays ? { inactive_days: inactiveDays } : {} }),

  // Weekly summary (rule-based, no LLM calls)
  weeklySummary: (patientId, weekOffset) =>
    api.get(`/dashboard/patients/${patientId}/weekly-summary`, { params: weekOffset ? { week_offset: weekOffset } : {} }),

  // ICF-style PDF report export
  getReport: (patientId) => api.get(`/dashboard/patients/${patientId}/report`, { responseType: 'blob' }),

  // Sound-accuracy-over-time (real data only — no vocab/fluency tracking exists in this app)
  getSoundProgress: (patientId, weeks) =>
    api.get(`/dashboard/patients/${patientId}/sound-progress`, { params: weeks ? { weeks } : {} }),

  // 50-item home practice ideas library, filterable by condition/goal
  listHomePracticeIdeas: (condition, goal) =>
    api.get('/dashboard/home-practice-ideas', { params: { ...(condition && { condition }), ...(goal && { goal }) } }),
}

// ------------------------------------------------------------------ //
//  Chime (therapist-facing) — chime.py itself is otherwise entirely
//  kid-token-gated; get_patient_events is the one therapist endpoint.
// ------------------------------------------------------------------ //

export const chimeAPI = {
  getPatientEvents: (patientId, levelId) =>
    api.get(`/chime/patients/${patientId}/events`, { params: levelId ? { level_id: levelId } : {} }),
}

// ------------------------------------------------------------------ //
//  VaakMirror (therapist-facing)                                      //
// ------------------------------------------------------------------ //

export const vaakmirrorAPI = {
  getPatientDashboard: (patientId) => api.get(`/vaakmirror/patients/${patientId}/dashboard`),
  getGameSettingsSuggestion: (patientId, game) =>
    api.get(`/vaakmirror/patients/${patientId}/game-settings/${game}/suggestion`),
  updateGameSettings: (patientId, game, payload) =>
    api.patch(`/vaakmirror/patients/${patientId}/game-settings/${game}`, payload),
}

// ------------------------------------------------------------------ //
//  Kid-facing "my progress" — deliberately minimal endpoint, no scores //
// ------------------------------------------------------------------ //

export const meAPI = {
  progress: () => api.get('/me/progress'),
}

// ------------------------------------------------------------------ //
//  Parent-facing                                                      //
// ------------------------------------------------------------------ //

export const billingAPI = {
  getSubscription:       () => api.get('/billing/subscription'),
  getParentSubscription: () => api.get('/billing/parent-subscription'),
  checkout:       () => api.post('/billing/checkout'),
  parentCheckout: () => api.post('/billing/parent-checkout'),
}

export const parentAPI = {
  progress: () => api.get('/parent/progress'),
  guidedActivity: () => api.get('/parent/guided-activity'),
}

// FastAPI's `detail` field is a plain string for most HTTPExceptions (e.g.
// "Invalid email or password"), but automatic Pydantic request-validation
// failures (422s — e.g. an email that fails EmailStr's format check) return
// an *array* of {type, loc, msg, input, ctx} objects instead. Every login/
// register form does `setError(err.response?.data?.detail || fallback)` and
// renders `error` directly as JSX text; when detail is that array, React
// tries to render objects as children and the whole page crashes (React
// error #31), not just the form. Normalize once, here, instead of leaving
// every call site to assume detail is always a string.
export function getErrorMessage(err, fallback = 'Something went wrong') {
  const detail = err?.response?.data?.detail
  if (!detail) return fallback
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const messages = detail.map(d => d?.msg).filter(Boolean)
    return messages.length ? messages.join('; ') : fallback
  }
  return fallback
}

export default api
