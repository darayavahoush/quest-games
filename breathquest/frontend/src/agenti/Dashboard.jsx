import { useEffect, useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";

function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  const birthDate = new Date(dateOfBirth);
  const today = new Date();
  let years = today.getFullYear() - birthDate.getFullYear();
  let months = today.getMonth() - birthDate.getMonth();
  if (months < 0 || (months === 0 && today.getDate() < birthDate.getDate())) {
    years--;
    months += 12;
  }
  if (today.getDate() < birthDate.getDate()) {
    months--;
    if (months < 0) months = 11;
  }
  return { years, months };
}

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [patients, setPatients] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [summaryRes, patientsRes, sessionsRes] = await Promise.all([
          fetch(`${API}/patients/dashboard/summary`),
          fetch(`${API}/patients/`),
          fetch(`${API}/patients/sessions/all`),
        ]);
        const summaryData = await summaryRes.json();
        const patientsData = await patientsRes.json();
        const sessionsData = await sessionsRes.json();
        setSummary(summaryData);
        const loadedPatients = Array.isArray(patientsData) ? patientsData : [];
        setPatients(loadedPatients);
        setSessions(Array.isArray(sessionsData) ? sessionsData : []);
        if (loadedPatients.length > 0) setSelectedPatientId(loadedPatients[0].id);
      } catch (err) {
        console.error('Error fetching dashboard data from PostgreSQL:', err);
        setSummary({ total_patients: 0, total_sessions: 0, avg_accuracy: null });
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const selectedPatient = patients.find(p => p.id === selectedPatientId);
  const patientSessions = sessions
    .filter(s => s.patient_id === selectedPatientId)
    .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
  const displaySessions = [...patientSessions].reverse();
  const totalSessions = patientSessions.length;
  const avgAccuracy = totalSessions > 0
    ? Math.round(patientSessions.reduce((sum, s) => sum + (Number(s.accuracy) || 0), 0) / totalSessions)
    : 0;
  const bestSession = patientSessions.reduce(
    (best, cur) => ((Number(cur.accuracy) || 0) > (Number(best.accuracy) || 0) ? cur : best),
    { accuracy: 0 }
  );

  return (
    <div style={{ padding: "24px", background: "#f8fafc", minHeight: "calc(100vh - 80px)" }}>
      <h1 style={{ margin: "0 0 8px 0", color: "#4c1d95" }}>🏠 VaakSuddhi Dashboard</h1>
      <p style={{ margin: "0 0 20px 0", color: "#64748b" }}>
        Overall summary and detailed child's progress tracking
      </p>

      {loading ? (
        <p>Loading dashboard...</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "20px" }}>
            <div style={{ padding: "20px", background: "white", borderRadius: "16px", boxShadow: "0 4px 12px rgba(0,0,0,0.05)", borderLeft: "6px solid #8b5cf6" }}>
              <h3 style={{ margin: "0 0 6px 0", color: "#6d28d9", fontSize: "14px", textTransform: "uppercase" }}>👶 Total Children</h3>
              <h2 style={{ margin: 0, fontSize: "2rem", color: "#4c1d95" }}>{summary?.total_patients || 0}</h2>
            </div>
            <div style={{ padding: "20px", background: "white", borderRadius: "16px", boxShadow: "0 4px 12px rgba(0,0,0,0.05)", borderLeft: "6px solid #0ea5e9" }}>
              <h3 style={{ margin: "0 0 6px 0", color: "#0369a1", fontSize: "14px", textTransform: "uppercase" }}>🎤 Total Sessions</h3>
              <h2 style={{ margin: 0, fontSize: "2rem", color: "#0c4a6e" }}>{summary?.total_sessions || 0}</h2>
            </div>
            <div style={{ padding: "20px", background: "white", borderRadius: "16px", boxShadow: "0 4px 12px rgba(0,0,0,0.05)", borderLeft: "6px solid #22c55e" }}>
              <h3 style={{ margin: "0 0 6px 0", color: "#166534", fontSize: "14px", textTransform: "uppercase" }}>⭐ Avg Accuracy</h3>
              <h2 style={{ margin: 0, fontSize: "2rem", color: "#14532d" }}>{summary?.avg_accuracy ? `${summary.avg_accuracy.toFixed(1)}%` : '—'}</h2>
            </div>
          </div>

          {patients.length === 0 ? (
            <div style={{ padding: "30px", background: "white", borderRadius: "16px", textAlign: "center", boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}>
              <span style={{ fontSize: "40px" }}>🌱</span>
              <h2 style={{ color: "#64748b" }}>No children registered yet</h2>
              <p style={{ color: "#94a3b8" }}>Try running an assessment first to register a child.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              <div style={{ background: "white", padding: "20px", borderRadius: "16px", boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
                  <span style={{ fontSize: "20px" }}>👶</span>
                  <label style={{ fontWeight: 800, color: "#475569" }}>Select Child:</label>
                  <select
                    value={selectedPatientId}
                    onChange={(e) => setSelectedPatientId(e.target.value)}
                    style={{ padding: "8px 14px", borderRadius: "12px", border: "2px solid #e2e8f0", background: "#f8fafc", fontSize: "15px", fontWeight: 700, color: "#1e293b", outline: "none", cursor: "pointer" }}
                  >
                    {patients.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                {selectedPatient && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", paddingTop: "12px", borderTop: "1px solid #e2e8f0" }}>
                    <div>
                      <p style={{ margin: "0 0 4px 0", fontSize: "11px", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Age</p>
                      <p style={{ margin: 0, fontSize: "15px", color: "#1e293b", fontWeight: 600 }}>
                        {(() => {
                          const age = calculateAge(selectedPatient.date_of_birth);
                          if (age) return `${age.years}yrs ${age.months}mnths`;
                          return selectedPatient.age ? `${selectedPatient.age}yrs` : "Not specified";
                        })()}
                      </p>
                    </div>
                    <div>
                      <p style={{ margin: "0 0 4px 0", fontSize: "11px", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Contact</p>
                      <p style={{ margin: 0, fontSize: "15px", color: "#1e293b", fontWeight: 600 }}>{selectedPatient.parent_contact || "Not provided"}</p>
                    </div>
                    <div>
                      <p style={{ margin: "0 0 4px 0", fontSize: "11px", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Email</p>
                      <p style={{ margin: 0, fontSize: "15px", color: "#1e293b", fontWeight: 600 }}>{selectedPatient.email || "Not provided"}</p>
                    </div>
                    <div>
                      <p style={{ margin: "0 0 4px 0", fontSize: "11px", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Diagnosis</p>
                      <p style={{ margin: 0, fontSize: "15px", color: "#1e293b", fontWeight: 600 }}>{selectedPatient.diagnosis || "General Speech"}</p>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "20px" }}>
                <div style={{ padding: "20px", background: "linear-gradient(135deg, #ede9fe 0%, #fff 100%)", borderRadius: "16px", boxShadow: "0 4px 12px rgba(0,0,0,0.05)", borderLeft: "6px solid #8b5cf6" }}>
                  <h3 style={{ margin: "0 0 6px 0", color: "#6d28d9", fontSize: "14px", textTransform: "uppercase" }}>Child's Avg Accuracy</h3>
                  <h2 style={{ margin: 0, fontSize: "2rem", color: "#4c1d95" }}>{avgAccuracy}%</h2>
                  <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#64748b" }}>Mastery goal is 70%+</p>
                </div>
                <div style={{ padding: "20px", background: "linear-gradient(135deg, #f0fdf4 0%, #fff 100%)", borderRadius: "16px", boxShadow: "0 4px 12px rgba(0,0,0,0.05)", borderLeft: "6px solid #22c55e" }}>
                  <h3 style={{ margin: "0 0 6px 0", color: "#166534", fontSize: "14px", textTransform: "uppercase" }}>Best Pronunciation</h3>
                  <h2 style={{ margin: 0, fontSize: "2rem", color: "#14532d" }}>
                    {bestSession.target_word ? `"${bestSession.target_word}"` : "—"}
                  </h2>
                  <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#64748b" }}>Score: {bestSession.accuracy ?? 0}% match</p>
                </div>
                <div style={{ padding: "20px", background: "linear-gradient(135deg, #e0f2fe 0%, #fff 100%)", borderRadius: "16px", boxShadow: "0 4px 12px rgba(0,0,0,0.05)", borderLeft: "6px solid #0ea5e9" }}>
                  <h3 style={{ margin: "0 0 6px 0", color: "#0369a1", fontSize: "14px", textTransform: "uppercase" }}>Child's Sessions</h3>
                  <h2 style={{ margin: 0, fontSize: "2rem", color: "#0c4a6e" }}>{totalSessions}</h2>
                  <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#64748b" }}>Completed attempts</p>
                </div>
              </div>

              {totalSessions > 0 && (
                <div style={{ background: "white", padding: "24px", borderRadius: "16px", boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}>
                  <h3 style={{ margin: "0 0 16px 0", color: "#1e293b" }}>📈 Accuracy Improvement Timeline</h3>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "16px", padding: "16px 8px" }}>
                    {patientSessions.map((s, idx) => {
                      const isSuccess = (s.accuracy || 0) >= 70;
                      return (
                        <div key={s.id} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "8px 14px", borderRadius: "999px", background: isSuccess ? "#f0fdf4" : "#fef2f2", border: `2px solid ${isSuccess ? "#4ade80" : "#f87171"}`, boxShadow: "0 4px 6px rgba(0,0,0,0.02)" }}>
                            <span style={{ width: "32px", height: "32px", borderRadius: "50%", background: isSuccess ? "#22c55e" : "#ef4444", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "12px" }}>
                              {s.accuracy}%
                            </span>
                            <span style={{ fontSize: "14px", fontWeight: 800, color: "#1e293b" }}>{s.target_word}</span>
                          </div>
                          {idx < totalSessions - 1 && <span style={{ color: "#cbd5e1", fontWeight: 800 }}>➔</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={{ background: "white", padding: "24px", borderRadius: "16px", boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}>
                <h3 style={{ margin: "0 0 16px 0", color: "#1e293b" }}>📋 Session History Logs</h3>
                {displaySessions.length === 0 ? (
                  <p style={{ color: "#94a3b8" }}>No session recorded for this child yet.</p>
                ) : (
                  <div style={{ display: "grid", gap: "16px" }}>
                    {displaySessions.map((session) => (
                      <div key={session.id} style={{ border: "1.5px solid #e2e8f0", borderRadius: "14px", padding: "16px", background: "#f8fafc", display: "flex", flexDirection: "column", gap: "10px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                            <span style={{ fontSize: "20px" }}>🗣️</span>
                            <h4 style={{ margin: 0, fontSize: "1.1rem", color: "#1e293b" }}>
                              Practiced: <span style={{ color: "#7c3aed" }}>"{session.target_word}"</span>
                            </h4>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ fontSize: "14px", fontWeight: 800, color: (session.accuracy || 0) >= 70 ? "#166534" : "#991b1b" }}>
                              Score: {session.accuracy}%
                            </span>
                            <span>{"⭐".repeat(session.stars || 0)}</span>
                          </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px", fontSize: "13px", color: "#475569" }}>
                          <p style={{ margin: 0 }}><b>Spoken Pronunciation:</b> {session.spoken_word || "—"}</p>
                          <p style={{ margin: 0 }}><b>Pitch (F0):</b> {session.pitch ? `${Math.round(session.pitch)} Hz` : "Not available"}</p>
                          <p style={{ margin: 0 }}><b>Volume (Loudness):</b> {session.loudness ? `${session.loudness.toFixed(4)}` : "Not available"}</p>
                        </div>
                        {session.feedback && (
                          <div style={{ padding: "10px", background: "#ffffff", borderRadius: "8px", borderLeft: "4px solid #3b82f6" }}>
                            <p style={{ margin: 0, fontSize: "13.5px", color: "#1e293b" }}>
                              <b>SLP Feedback:</b> {session.feedback}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
