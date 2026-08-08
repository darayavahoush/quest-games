import { useEffect, useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";

export default function Patients() {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPatients = async () => {
      try {
        const res = await fetch(`${API}/patients/`);
        const data = await res.json();
        setPatients(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchPatients();
  }, []);

  return (
    <div style={{ padding: "24px" }}>
      <h1 style={{ margin: 0 }}>👶 Patients</h1>
      {loading ? (
        <p>Loading patients...</p>
      ) : (
        <div style={{ display: "grid", gap: "12px", marginTop: "18px" }}>
          {patients.length === 0 ? (
            <p>No patients yet.</p>
          ) : (
            patients.map((patient) => (
              <div key={patient.id} style={{ background: "white", borderRadius: "14px", padding: "16px", boxShadow: "0 8px 18px rgba(0,0,0,0.06)" }}>
                <h3 style={{ margin: 0 }}>{patient.name}</h3>
                <p style={{ margin: "6px 0 0", color: "#6b7280" }}>Age: {patient.age ?? "Not added"}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
