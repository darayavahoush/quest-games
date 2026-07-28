import { useEffect } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import Navbar from './components/Navbar.jsx'
import RequireAuth from './components/RequireAuth.jsx'
import Login from './pages/Login.jsx'
import PatientPicker from './pages/PatientPicker.jsx'
import Landing from './pages/Landing.jsx'
import MirrorMirror from './pages/MirrorMirror.jsx'
import TongueTamer from './pages/TongueTamer.jsx'
import LipSyncHero from './pages/LipSyncHero.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Exercises from './pages/Exercises.jsx'
import { setAuth } from './lib/auth.js'

// Lets Quest Hub hand off a logged-in session by linking here with
// ?token=&kind=&id=&name= — adopts it into this app's own auth storage,
// then strips the params so they don't linger in the URL/browser history.
function useHubHandoff() {
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const token = params.get('token')
    const kind = params.get('kind')
    const id = params.get('id')
    const name = params.get('name')
    if (token && kind && id) {
      setAuth({ kind, token, id, name })
      navigate(location.pathname, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

export default function App() {
  useHubHandoff()

  return (
    <div className="min-h-screen bg-paper">
      <Navbar />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Landing />} />

        {/* Kid (patient) identity required — these log gameplay against
            whoever is logged in */}
        <Route
          path="/games/mirror-mirror"
          element={
            <RequireAuth kind="patient">
              <MirrorMirror />
            </RequireAuth>
          }
        />
        <Route
          path="/games/tongue-tamer"
          element={
            <RequireAuth kind="patient">
              <TongueTamer />
            </RequireAuth>
          }
        />
        <Route
          path="/games/lip-sync-hero"
          element={
            <RequireAuth kind="patient">
              <LipSyncHero />
            </RequireAuth>
          }
        />

        {/* Therapist identity required */}
        <Route
          path="/patients"
          element={
            <RequireAuth kind="therapist">
              <PatientPicker />
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard"
          element={
            <RequireAuth kind="therapist">
              <Dashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/exercises"
          element={
            <RequireAuth kind="therapist">
              <Exercises />
            </RequireAuth>
          }
        />
      </Routes>
    </div>
  )
}
