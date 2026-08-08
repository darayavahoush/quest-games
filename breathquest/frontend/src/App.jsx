import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { PageLoader } from './components/ui'

import PlaySelect         from './pages/Landing'  // quest-games' original kid/therapist/parent
                                                        // chooser -- renamed at the import site only;
                                                        // moved off "/" to make room for agenti_ai's
                                                        // Landing there instead (see routes below)
import { Landing as AgentiLanding } from './agenti/Landing'
import AgentiDashboard    from './agenti/Dashboard'
import AgentiPatients     from './agenti/Patients'
import TherapistLogin     from './pages/therapist/Login'
import TherapistDashboard from './pages/therapist/Dashboard'
import PatientDetail      from './pages/therapist/PatientDetail'
import AgentInsight        from './pages/therapist/AgentInsight'
import KidPlay            from './pages/kid/Play'
import LevelSelect        from './pages/kid/LevelSelect'
import GamePage           from './pages/kid/GamePage'
import GamePicker         from './pages/kid/GamePicker'
import MyProgress         from './pages/kid/MyProgress'
import VaakMirrorHome     from './vaakmirror/VaakMirrorHome'
import MirrorMirror       from './vaakmirror/MirrorMirror'
import TongueTamer        from './vaakmirror/TongueTamer'
import LipSyncHero        from './vaakmirror/LipSyncHero'
import MinimalPairDrill   from './vaakmirror/MinimalPairDrill'
import ChimeHome          from './chime/ChimeHome'
import VillageBuilder     from './chime/VillageBuilder'
import RocketLaunch       from './chime/RocketLaunch'
import SubmarineDive      from './chime/SubmarineDive'
import FireflyJar         from './chime/FireflyJar'
import WindChimeGarden    from './chime/WindChimeGarden'
import BubbleWrapPop      from './chime/BubbleWrapPop'
import XylophoneTower    from './chime/XylophoneTower'
import LionsRoar          from './chime/LionsRoar'
import RequireLevelUnlocked from './chime/lib/RequireLevelUnlocked'
import VoiceHurdleRace    from './voiceHurdleRace/VoiceHurdleRace'
import ParentAuth         from './pages/parent/ParentAuth'
import ParentDashboard    from './pages/parent/ParentDashboard'
import Verify             from './pages/Verify'
import Billing            from './pages/Billing'

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

function ProtectedParent({ children }) {
  const { isParent, loading } = useAuth()
  if (loading) return <PageLoader />
  if (!isParent) return <Navigate to="/parent/login" replace />
  return children
}

function AppRoutes() {
  const { isTherapist, isKid, loading } = useAuth()
  if (loading) return <PageLoader />

  return (
    <Routes>
      <Route path="/" element={<AgentiLanding onStart={(target) => window.location.assign(
        target === 'dashboard' ? '/dashboard'
          : target === 'patients' ? '/patients'
          : target.startsWith('play-select') ? `/${target}`  // preserves ?mode=signin, if present
          : '/play-select'
      )} />} />
      <Route path="/play-select" element={<PlaySelect />} />
      <Route path="/verify" element={<Verify />} />
      <Route path="/dashboard" element={<AgentiDashboard />} />
      <Route path="/patients" element={<AgentiPatients />} />

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
      <Route path="/therapist/patients/:id/agent" element={
        <ProtectedTherapist><AgentInsight /></ProtectedTherapist>
      } />
      <Route path="/therapist/billing" element={
        <ProtectedTherapist><Billing role="therapist" /></ProtectedTherapist>
      } />

      {/* Kid */}
      <Route path="/play" element={
        isKid ? <ProtectedKid><GamePicker /></ProtectedKid> : <KidPlay />
      } />
      <Route path="/play/levels" element={
        <ProtectedKid><LevelSelect /></ProtectedKid>
      } />
      <Route path="/play/progress" element={
        <ProtectedKid><MyProgress /></ProtectedKid>
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
      <Route path="/play/vaakmirror/minimal-pair-drill" element={
        <ProtectedKid><MinimalPairDrill /></ProtectedKid>
      } />
      <Route path="/play/chime" element={
        <ProtectedKid><ChimeHome /></ProtectedKid>
      } />
      <Route path="/play/chime/rocket-launch" element={
        <ProtectedKid><RequireLevelUnlocked levelId="aa"><RocketLaunch /></RequireLevelUnlocked></ProtectedKid>
      } />
      <Route path="/play/chime/submarine-dive" element={
        <ProtectedKid><RequireLevelUnlocked levelId="oo"><SubmarineDive /></RequireLevelUnlocked></ProtectedKid>
      } />
      <Route path="/play/chime/firefly-jar" element={
        <ProtectedKid><RequireLevelUnlocked levelId="ma"><FireflyJar /></RequireLevelUnlocked></ProtectedKid>
      } />
      <Route path="/play/chime/wind-chime-garden" element={
        <ProtectedKid><RequireLevelUnlocked levelId="fa"><WindChimeGarden /></RequireLevelUnlocked></ProtectedKid>
      } />
      <Route path="/play/chime/bubble-wrap-pop" element={
        <ProtectedKid><RequireLevelUnlocked levelId="ha"><BubbleWrapPop /></RequireLevelUnlocked></ProtectedKid>
      } />
      <Route path="/play/chime/xylophone-tower" element={
        <ProtectedKid><RequireLevelUnlocked levelId="ee"><XylophoneTower /></RequireLevelUnlocked></ProtectedKid>
      } />
      <Route path="/play/chime/lions-roar" element={
        <ProtectedKid><RequireLevelUnlocked levelId="r"><LionsRoar /></RequireLevelUnlocked></ProtectedKid>
      } />
      <Route path="/play/chime/village-builder" element={
        <ProtectedKid><RequireLevelUnlocked levelId="village-builder"><VillageBuilder /></RequireLevelUnlocked></ProtectedKid>
      } />
      <Route path="/play/voice-hurdle-race" element={
        <ProtectedKid><VoiceHurdleRace /></ProtectedKid>
      } />

      {/* Parent */}
      <Route path="/parent/login" element={<ParentAuth />} />
      <Route path="/parent/dashboard" element={
        <ProtectedParent><ParentDashboard /></ProtectedParent>
      } />
      <Route path="/parent/billing" element={
        <ProtectedParent><Billing role="parent" /></ProtectedParent>
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
