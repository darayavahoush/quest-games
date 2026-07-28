import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { PageLoader } from './components/ui'

import Landing            from './pages/Landing'
import TherapistLogin     from './pages/therapist/Login'
import TherapistDashboard from './pages/therapist/Dashboard'
import PatientDetail      from './pages/therapist/PatientDetail'
import KidPlay            from './pages/kid/Play'
import LevelSelect        from './pages/kid/LevelSelect'
import GamePage           from './pages/kid/GamePage'
import GamePicker         from './pages/kid/GamePicker'
import VaakMirrorHome     from './vaakmirror/VaakMirrorHome'
import MirrorMirror       from './vaakmirror/MirrorMirror'
import TongueTamer        from './vaakmirror/TongueTamer'
import LipSyncHero        from './vaakmirror/LipSyncHero'
import ChimeHome          from './chime/ChimeHome'
import VillageBuilder     from './chime/VillageBuilder'

// Lets Quest Hub hand off a logged-in session by linking here with
// ?token=&kind=&id=&name=&data= — adopts it into BreathQuest's OWN
// storage keys (bq_token / bq_user_type / bq_user_data), the same ones
// AuthContext reads on mount. `data` is the FULL raw response from
// BreathQuest's own /auth/login or /auth/kid-login (the hub logs in
// directly against BreathQuest, so this is real BreathQuest data, not a
// reconstruction) — using it directly means nothing gets lost, unlike
// rebuilding bq_user_data from just {kind, token, id, name}.
//
// Deliberately synchronous, NOT inside useEffect: AuthContext's own
// useEffect reads localStorage on mount to set React state. If this also
// ran in an effect, it would race AuthContext's effect with no guaranteed
// order. Running it here, in the component body, guarantees localStorage
// is populated before AuthProvider (a child of this function) ever mounts.
function adoptHubHandoffIfPresent() {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  const token = params.get('token')
  const kind = params.get('kind')     // 'therapist' | 'patient' — matches bq_user_type values exactly
  const data = params.get('data')

  if (!token || !kind || !data) return

  try {
    const userData = JSON.parse(data)
    localStorage.setItem('bq_token', token)
    localStorage.setItem('bq_user_type', kind)
    localStorage.setItem('bq_user_data', JSON.stringify(userData))
  } catch {
    // Malformed data param — skip adoption rather than half-write storage
    return
  }

  // Strip the params from the URL/history without needing react-router
  // (this runs before BrowserRouter has mounted).
  const cleanUrl = window.location.pathname + window.location.hash
  window.history.replaceState({}, '', cleanUrl)
}

function ProtectedTherapist({ children }) {
  const { isTherapist, loading } = useAuth()
  if (loading) return <PageLoader />
  if (!isTherapist) return <Navigate to="/therapist/login" replace />
  return children
}

function ProtectedKid({ children }) {
  const { isKid, loading } = useAuth()
  if (loading) return <PageLoader />
  if (!isKid) return <Navigate to="/play" replace />
  return children
}

function AppRoutes() {
  const { isTherapist, isKid, loading } = useAuth()
  if (loading) return <PageLoader />

  return (
    <Routes>
      <Route path="/" element={<Landing />} />

      {/* Therapist */}
      <Route path="/therapist/login" element={
        isTherapist ? <Navigate to="/therapist/dashboard" replace /> : <TherapistLogin />
      } />
      <Route path="/therapist/dashboard" element={
        <ProtectedTherapist><TherapistDashboard /></ProtectedTherapist>
      } />
      <Route path="/therapist/patients/:id" element={
        <ProtectedTherapist><PatientDetail /></ProtectedTherapist>
      } />

      {/* Kid */}
      <Route path="/play" element={
        isKid ? <ProtectedKid><GamePicker /></ProtectedKid> : <KidPlay />
      } />
      <Route path="/play/levels" element={
        <ProtectedKid><LevelSelect /></ProtectedKid>
      } />
      <Route path="/play/game/:levelId" element={
        <ProtectedKid><GamePage /></ProtectedKid>
      } />
      <Route path="/play/vaakmirror" element={
        <ProtectedKid><VaakMirrorHome /></ProtectedKid>
      } />
      <Route path="/play/vaakmirror/mirror-mirror" element={
        <ProtectedKid><MirrorMirror /></ProtectedKid>
      } />
      <Route path="/play/vaakmirror/tongue-tamer" element={
        <ProtectedKid><TongueTamer /></ProtectedKid>
      } />
      <Route path="/play/vaakmirror/lip-sync-hero" element={
        <ProtectedKid><LipSyncHero /></ProtectedKid>
      } />
      <Route path="/play/chime" element={
        <ProtectedKid><ChimeHome /></ProtectedKid>
      } />
      <Route path="/play/chime/village-builder" element={
        <ProtectedKid><VillageBuilder /></ProtectedKid>
      } />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  adoptHubHandoffIfPresent()

  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
