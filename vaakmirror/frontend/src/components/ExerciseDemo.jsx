// Small looping animated demonstrations, one per exercise "kind" — same
// technique as MouthShapeGuide/TongueShapeGuide (animated SVG, no video
// assets), so the exercise library shows an actual visual of the motion
// rather than a generic play-button placeholder.

const INK = '#FBF7EE'
const CORAL = '#F0604A'
const MINT = '#2FB8A6'
const GOLD = '#F4B942'

function BreathDemo() {
  return (
    <>
      <ellipse cx="46" cy="45" rx="10" ry="7" fill="none" stroke={INK} strokeWidth="3" />
      {[0, 1, 2].map((i) => (
        <path
          key={i}
          d={`M60 45 Q75 ${40 - i * 3} 95 45`}
          fill="none"
          stroke={MINT}
          strokeWidth="2.5"
          strokeLinecap="round"
          style={{
            animation: `exBreath 1.6s ease-out infinite`,
            animationDelay: `${i * 0.35}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes exBreath {
          0%   { opacity: 0; transform: translateX(-6px); }
          25%  { opacity: 1; }
          100% { opacity: 0; transform: translateX(10px); }
        }
      `}</style>
    </>
  )
}

function TongueDemo() {
  return (
    <>
      <path d="M22 30 Q60 15 98 30" fill="none" stroke={INK} strokeWidth="3" />
      <path d="M22 60 Q60 75 98 60" fill="none" stroke={INK} strokeWidth="3" />
      <g style={{ transformOrigin: '60px 45px', animation: 'exTongue 1.4s ease-in-out infinite' }}>
        <ellipse cx="60" cy="46" rx="16" ry="10" fill={CORAL} opacity="0.6" />
      </g>
      <style>{`
        @keyframes exTongue {
          0%, 100% { transform: translateY(6px); }
          50%      { transform: translateY(-8px); }
        }
      `}</style>
    </>
  )
}

function HumDemo() {
  return (
    <>
      <path d="M50 45 Q60 40 70 45" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      <path d="M50 45 Q60 50 70 45" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      {[0, 1, 2].map((i) => (
        <circle
          key={i}
          cx="60"
          cy="45"
          r="8"
          fill="none"
          stroke={GOLD}
          strokeWidth="2"
          style={{
            animation: 'exHum 1.8s ease-out infinite',
            animationDelay: `${i * 0.5}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes exHum {
          0%   { r: 8; opacity: 0.9; }
          100% { r: 34; opacity: 0; }
        }
      `}</style>
    </>
  )
}

function MassageDemo() {
  return (
    <>
      <path d="M40 20 Q20 45 40 72" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      <circle
        r="6"
        fill={CORAL}
        opacity="0.85"
        style={{ animation: 'exMassage 2.2s linear infinite', transformOrigin: '30px 45px' }}
      />
      <style>{`
        @keyframes exMassage {
          0%   { transform: translate(30px, 30px); }
          25%  { transform: translate(22px, 45px); }
          50%  { transform: translate(30px, 60px); }
          75%  { transform: translate(38px, 45px); }
          100% { transform: translate(30px, 30px); }
        }
      `}</style>
    </>
  )
}

function RoundDemo() {
  return (
    <>
      <path d="M22 30 Q60 15 98 30" fill="none" stroke={INK} strokeWidth="2.5" opacity="0.35" />
      <path d="M22 60 Q60 75 98 60" fill="none" stroke={INK} strokeWidth="2.5" opacity="0.35" />
      <ellipse
        cx="60"
        cy="45"
        rx="16"
        ry="18"
        fill="none"
        stroke={MINT}
        strokeWidth="4"
        style={{ transformOrigin: '60px 45px', animation: 'exRound 1.8s ease-in-out infinite' }}
      />
      <style>{`
        @keyframes exRound {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(0.72); }
        }
      `}</style>
    </>
  )
}

const DEMOS = {
  breath: BreathDemo,
  tongue: TongueDemo,
  hum: HumDemo,
  massage: MassageDemo,
  round: RoundDemo,
}

export default function ExerciseDemo({ kind, className = '' }) {
  const Demo = DEMOS[kind] ?? RoundDemo
  return (
    <svg viewBox="0 0 120 90" className={className}>
      <Demo />
    </svg>
  )
}
