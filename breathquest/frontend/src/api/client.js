import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'

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

export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login:    (data) => api.post('/auth/login', data),
  kidRegister: (data) => api.post('/auth/kid-register', data),
  kidLogin:    (data) => api.post('/auth/kid-login', data),
  parentRegister: (data) => api.post('/auth/parent-register', data),
  parentLogin:    (data) => api.post('/auth/parent-login', data),
}

// ------------------------------------------------------------------ //
//  Patients                                                            //
// ------------------------------------------------------------------ //

export const patientsAPI = {
  list:   ()           => api.get('/patients'),
  get:    (id)         => api.get(`/patients/${id}`),
  create: (data)       => api.post('/patients', data),
  update: (id, data)   => api.patch(`/patients/${id}`, data),
  delete: (id)         => api.delete(`/patients/${id}`),
  generateParentInviteCode: (id) => api.post(`/patients/${id}/parent-invite-code`),
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
}

// ------------------------------------------------------------------ //
//  Kid-facing "my progress" — deliberately minimal endpoint, no scores //
// ------------------------------------------------------------------ //

export const meAPI = {
  progress: () => api.get('/me/progress'),
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
