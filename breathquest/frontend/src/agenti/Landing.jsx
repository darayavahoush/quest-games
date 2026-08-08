import { T } from "../assessment/constants";
import { Button, BunnyMascot } from "./UI";

export function Landing({ onStart }) {
  return (
    <div
      style={{
        width: "100%",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
        position: "relative",
        overflow: "hidden",
        background:
          "radial-gradient(circle at top, rgba(255, 245, 186, 0.8), transparent 18%), linear-gradient(180deg, #fff9f1 0%, #f7fbff 100%)",
      }}
    >
      <style>{`
        @keyframes float-slow {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-12px); }
        }
        @keyframes float-fast {
          0%, 100% { transform: translateY(0px) scale(1); }
          50% { transform: translateY(-18px) scale(1.04); }
        }
        @keyframes bubble-drift {
          0% { transform: translateX(0) translateY(0); opacity: 0.5; }
          50% { opacity: 0.95; }
          100% { transform: translateX(25px) translateY(-20px); opacity: 0; }
        }
        @keyframes pulse-ring {
          0% { transform: scale(0.95); opacity: 0.6; }
          50% { transform: scale(1.05); opacity: 0.9; }
          100% { transform: scale(1.15); opacity: 0; }
        }
      `}</style>

      <div className="bg-blob-1" />
      <div className="bg-blob-2" />
      <div
        style={{
          position: "absolute", top: "12%", left: "10%", width: "14px", height: "14px",
          background: T.primary, borderRadius: "50%", opacity: 0.7,
          animation: "float-slow 3.5s ease-in-out infinite",
        }}
      />
      <div
        style={{
          position: "absolute", top: "20%", right: "18%", width: "18px", height: "18px",
          background: T.secondary, borderRadius: "50%", opacity: 0.7,
          animation: "float-slow 4s ease-in-out infinite 0.5s",
        }}
      />
      <div
        style={{
          position: "absolute", bottom: "10%", left: "22%", width: "10px", height: "10px",
          background: "#60a5fa", borderRadius: "50%", opacity: 0.75,
          animation: "float-slow 3s ease-in-out infinite 1s",
        }}
      />

      <div
        style={{
          maxWidth: "1220px", width: "100%", display: "flex", alignItems: "center",
          justifyContent: "space-between", gap: "48px", zIndex: 1,
        }}
      >
        <div className="animate-slide-up" style={{ flex: 1, maxWidth: "560px" }}>
          <div
            style={{
              display: "inline-flex", alignItems: "center", gap: "10px", padding: "10px 16px",
              background: "rgba(255, 255, 255, 0.78)", border: `1px solid ${T.border}`,
              borderRadius: "999px", boxShadow: T.shadowSm, marginBottom: "18px",
            }}
          >
            <span style={{ fontSize: "18px" }}>🎉</span>
            <span style={{ fontSize: "15px", fontWeight: 800, color: T.primary }}>
              Speech Adventure Time
            </span>
          </div>

          <h1
            style={{
              fontFamily: "'Nunito', sans-serif", fontSize: "clamp(48px, 6vw, 72px)",
              fontWeight: 900, lineHeight: 1, color: T.text, margin: "0 0 18px 0",
            }}
          >
            Let's make speaking <br />
            <span style={{ color: T.primary }}>fun and easy</span>
          </h1>

          <p
            style={{
              fontSize: "19px", color: T.textMuted, lineHeight: 1.6,
              marginBottom: "32px", fontWeight: 600,
            }}
          >
            Practice your words, hear fun feedback, and grow your confidence with a smiling AI buddy.
          </p>

          <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", marginBottom: "22px" }}>
            <Button onClick={() => onStart("play-select")} variant="primary" style={{ padding: "18px 32px", fontSize: "18px" }}>
              Start Assessment
            </Button>
            <Button onClick={() => onStart("play-select?mode=signin")} variant="secondary" style={{ padding: "18px 28px", fontSize: "18px" }}>
              Sign in
            </Button>
          </div>

          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
            <div style={{ background: "#fff", borderRadius: "18px", padding: "12px 14px", boxShadow: T.shadowSm, minWidth: "130px" }}>
              <div style={{ fontSize: "18px", fontWeight: 800, color: T.primary }}>⭐ 98%</div>
              <div style={{ fontSize: "13px", color: T.textMuted }}>happy learners</div>
            </div>
            <div style={{ background: "#fff", borderRadius: "18px", padding: "12px 14px", boxShadow: T.shadowSm, minWidth: "130px" }}>
              <div style={{ fontSize: "18px", fontWeight: 800, color: T.secondary }}>🎵 20+</div>
              <div style={{ fontSize: "13px", color: T.textMuted }}>fun sounds</div>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center" }}>
          <div style={{ position: "relative", width: "520px", maxWidth: "100%", display: "flex", justifyContent: "center" }}>
            <div
              style={{
                position: "absolute", inset: "12% 8%",
                background: "radial-gradient(circle, rgba(250, 93, 119, 0.18), rgba(255,255,255,0))",
                borderRadius: "50%", animation: "pulse-ring 5s ease-out infinite",
              }}
            />
            <div
              style={{
                position: "absolute", top: "18%", right: "4%", background: "#fff",
                borderRadius: "18px 18px 6px 18px", padding: "10px 14px", boxShadow: T.shadowSm,
                fontWeight: 800, color: T.text, animation: "float-fast 4s ease-in-out infinite",
              }}
            >
              YAY! 🎈
            </div>
            <div
              style={{
                position: "absolute", bottom: "8%", left: "2%", width: "140px", background: "#fff",
                borderRadius: "18px", padding: "12px", boxShadow: T.shadowSm,
                animation: "float-slow 3.5s ease-in-out infinite 0.8s",
              }}
            >
              <div style={{ fontSize: "12px", fontWeight: 800, color: T.primary, marginBottom: "4px" }}>Today's Goal</div>
              <div style={{ fontSize: "14px", color: T.text, fontWeight: 700 }}>Say "apple" 🎯</div>
            </div>
            <div style={{ position: "absolute", top: "0%", left: "8%", display: "flex", gap: "8px" }}>
              {['✨', '🌟', '💫'].map((icon, index) => (
                <span
                  key={index}
                  style={{
                    fontSize: index === 1 ? "24px" : "18px",
                    animation: `bubble-drift ${3 + index}s ease-out infinite ${index * 0.6}s`,
                  }}
                >
                  {icon}
                </span>
              ))}
            </div>
            <BunnyMascot size={430} mood="happy" style={{ position: "relative", zIndex: 2 }} />
          </div>
        </div>
      </div>
    </div>
  );
}
