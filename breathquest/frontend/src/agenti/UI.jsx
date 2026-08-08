import { T } from "../assessment/constants";

export function Button({ children, onClick, variant = "primary", className = "", style = {}, disabled = false }) {
  const baseStyle = {
    padding: "16px 32px",
    borderRadius: "100px",
    fontFamily: "'Nunito', sans-serif",
    fontSize: "18px",
    fontWeight: 800,
    border: "none",
    transition: "all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
    opacity: disabled ? 0.6 : 1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "12px",
  };

  const variants = {
    primary: {
      background: `linear-gradient(135deg, ${T.primary}, ${T.primaryHover})`,
      color: "#FFF",
      boxShadow: disabled ? "none" : `0 10px 25px rgba(250, 93, 119, 0.3)`,
    },
    secondary: {
      background: `linear-gradient(135deg, ${T.secondary}, #F59020)`,
      color: "#FFF",
      boxShadow: disabled ? "none" : `0 10px 25px rgba(248, 162, 70, 0.3)`,
    },
    outline: {
      background: "transparent",
      color: T.primary,
      border: `2px solid ${T.primary}`,
    },
    flat: {
      background: T.surface,
      color: T.text,
      boxShadow: T.shadowSm,
    }
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`clickable ${className}`}
      style={{
        ...baseStyle,
        ...variants[variant],
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.transform = "scale(1.05) translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        if (!disabled) e.currentTarget.style.transform = "scale(1) translateY(0)";
      }}
      onMouseDown={(e) => {
        if (!disabled) e.currentTarget.style.transform = "scale(0.95)";
      }}
      onMouseUp={(e) => {
        if (!disabled) e.currentTarget.style.transform = "scale(1.05) translateY(-2px)";
      }}
    >
      {children}
    </button>
  );
}

export function Card({ children, style = {}, className = "", delay = "0s" }) {
  return (
    <div
      className={`animate-slide-up ${className}`}
      style={{
        background: T.surface,
        borderRadius: "32px",
        padding: "32px",
        boxShadow: T.shadowLg,
        animationDelay: delay,
        border: `1px solid rgba(255,255,255,0.8)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function BunnyMascot({ size = 200, mood = "happy", style = {}, className = "" }) {
  return (
    <div className={`animate-float ${className}`} style={{ width: size, height: size, position: 'relative', ...style }}>
      <svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%", overflow: 'visible' }}>
        <style>
          {`
            @keyframes ear-wiggle-left {
              0%, 100% { transform: rotate(0deg); transform-origin: 80px 90px; }
              25% { transform: rotate(-10deg); transform-origin: 80px 90px; }
            }
            @keyframes ear-wiggle-right {
              0%, 100% { transform: rotate(0deg); transform-origin: 120px 90px; }
              25% { transform: rotate(10deg); transform-origin: 120px 90px; }
            }
            .ear-l { animation: ear-wiggle-left 4s infinite; }
            .ear-r { animation: ear-wiggle-right 4s infinite 0.5s; }
          `}
        </style>
        <ellipse cx="100" cy="180" rx="55" ry="8" fill="rgba(0,0,0,0.06)" />
        <g className="ear-l">
          <path d="M 70 90 C 40 30, 70 10, 85 70 Z" fill="#FFFFFF" stroke={T.border} strokeWidth="4" />
          <path d="M 73 85 C 52 40, 72 25, 82 72 Z" fill="#F9A8D4" />
        </g>
        <g className="ear-r">
          <path d="M 130 90 C 160 30, 130 10, 115 70 Z" fill="#FFFFFF" stroke={T.border} strokeWidth="4" />
          <path d="M 127 85 C 148 40, 128 25, 118 72 Z" fill="#F9A8D4" />
        </g>
        <circle cx="100" cy="120" r="55" fill="#FFFFFF" stroke={T.border} strokeWidth="4" />
        <circle cx="82" cy="110" r="6" fill="#1A1D28" />
        <circle cx="118" cy="110" r="6" fill="#1A1D28" />
        <circle cx="80" cy="108" r="2" fill="white" />
        <circle cx="116" cy="108" r="2" fill="white" />
        <ellipse cx="65" cy="120" rx="7" ry="5" fill="#F9A8D4" opacity="0.6" />
        <ellipse cx="135" cy="120" rx="7" ry="5" fill="#F9A8D4" opacity="0.6" />
        <path d="M 96 118 Q 100 123 104 118 Z" fill="#F9A8D4" />
        {mood === "happy" ? (
          <path d="M 94 124 Q 100 132 106 124" stroke="#1A1D28" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        ) : (
          <path d="M 94 128 Q 100 124 106 128" stroke="#1A1D28" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        )}
        <circle cx="75" cy="170" r="14" fill="#FFFFFF" stroke={T.border} strokeWidth="3" />
        <circle cx="125" cy="170" r="14" fill="#FFFFFF" stroke={T.border} strokeWidth="3" />
        <path d="M 70 175 L 75 165 M 80 175 L 75 165" stroke={T.border} strokeWidth="2" strokeLinecap="round" />
        <path d="M 130 175 L 125 165 M 120 175 L 125 165" stroke={T.border} strokeWidth="2" strokeLinecap="round" />
        {mood === "idea" && (
           <g className="animate-pop-in">
              <path d="M 20 50 L 25 30 L 45 35 L 25 40 Z" fill={T.secondary} />
           </g>
        )}
      </svg>
    </div>
  );
}

export function ProgressBar({ label, progress, color = T.correct }) {
  return (
    <div style={{ width: "100%", marginBottom: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "14px", fontWeight: 700, color: T.text }}>
        <span>{label}</span>
        <span style={{ color }}>{progress}%</span>
      </div>
      <div style={{ width: "100%", height: "12px", background: T.border, borderRadius: "100px", overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${progress}%`,
            background: color,
            borderRadius: "100px",
            transition: "width 1s cubic-bezier(0.175, 0.885, 0.32, 1.275)"
          }}
        />
      </div>
    </div>
  );
}
