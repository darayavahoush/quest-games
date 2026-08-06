/**
 * voiceHurdleRaceApi.ts — VoiceHurdleRace session calls.
 *
 * Uses the Hub's shared `api` axios instance (see api/client.js) rather
 * than a separate fetch wrapper. That instance already attaches the kid's
 * bearer token via its request interceptor and points at the one real
 * backend base URL — the old version here pointed at a different env var
 * (VITE_API_BASE_URL vs. everyone else's VITE_API_URL) and never sent an
 * Authorization header at all, so patient_id had to travel in the request
 * body instead of coming from the token like every other game here.
 */
import api from './client';

export interface VoiceHurdleRaceSessionCreate {
  level_id: number;
  level_name: string;
  score: number;
  time_remaining: number;
  pitch_accuracy: number;
  loudness_accuracy: number;
  stars: number;
  difficulty?: number;
}

export interface AgentDecision {
  policy: string;
  action: 'raise' | 'hold' | 'lower';
  n_events_considered: number;
  message: string;
}

export interface VoiceHurdleRaceSession extends VoiceHurdleRaceSessionCreate {
  id: string;
  patient_id: string;
  created_at: string;
}

export interface LeaderboardEntry {
  session_id: string;
  patient_name: string;
  level_name: string;
  stars: number;
  created_at: string;
}

export const voiceHurdleRaceApi = {
  createVoiceHurdleRaceSession: (data: VoiceHurdleRaceSessionCreate) =>
    api.post<VoiceHurdleRaceSession>('/voicehurdlerace/sessions', data).then((r) => r.data),

  getMySessions: () =>
    api.get<VoiceHurdleRaceSession[]>('/voicehurdlerace/sessions').then((r) => r.data),

  getVoiceHurdleRaceSessions: (patientId: string) =>
    api.get<VoiceHurdleRaceSession[]>(`/voicehurdlerace/patients/${patientId}/sessions`).then((r) => r.data),

  getVoiceHurdleRaceLeaderboard: () =>
    api.get<LeaderboardEntry[]>('/voicehurdlerace/leaderboard').then((r) => r.data),

  getAgentDecision: (levelId: number, policy: string = 'tabular_q') =>
    api.get<AgentDecision>(`/voicehurdlerace/agent/decide/${levelId}`, { params: { policy } }).then((r) => r.data),
};
