// Talks to the merged FastAPI backend's new /breath routes (see
// breathquest/backend/routers/breath_agent.py), which give BreathQuest's
// own breathing levels the same adaptive-difficulty agent Chime's levels
// already used — same shape as breathquest/frontend/src/chime/lib/api.js's
// logEvent/getDifficulty/getAgentDecision, just pointed at /breath instead
// of /chime.

import api from '../../api/client'

const BREATH = '/breath'

export function logBreathEvent(event) {
  return api.post(`${BREATH}/events`, event).then(r => r.data)
}

export function getBreathEvents(levelId) {
  const params = levelId ? { level_id: levelId } : {}
  return api.get(`${BREATH}/events`, { params }).then(r => r.data)
}

export function getBreathDifficulty(levelId) {
  return api.get(`${BREATH}/difficulty/${levelId}`).then(r => r.data)
}

export function getBreathAgentDecision(levelId, policy = 'tabular_q') {
  return api.get(`${BREATH}/agent/decide/${levelId}`, { params: { policy } }).then(r => r.data)
}
