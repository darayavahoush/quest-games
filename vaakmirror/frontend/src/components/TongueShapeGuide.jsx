// Side-profile diagram of the mouth with a tongue blob and a directional
// arrow, both animated toward the target direction — mirrors the same
// "mimic the action" idea as MouthShapeGuide, but for a movement rather
// than a static shape.

const STROKE = {
  idle: '#FBF7EE55',
  green: '#2FB8A6',
  yellow: '#F4B942',
  red: '#F0604A',
}

export default function TongueShapeGuide({ move, tier = 'idle', className = '' }) {
  const color = STROKE[tier] ?? STROKE.idle
  const isUp = move === 'tongue-up'

  return (
    <svg viewBox="0 0 120 90" className={className} style={{ transition: 'color 150ms ease' }}>
      <g fill="none" stroke={color} strokeWidth="4" strokeLinecap="round">
        <path d="M18 30 Q60 12 102 30" />
        <path d="M18 62 Q60 78 102 62" />
      </g>

      <g
        style={{
          transformOrigin: '60px 46px',
          animation: `${isUp ? 'ttUp' : 'ttBack'} 1.8s ease-in-out infinite`,
        }}
      >
        <ellipse
          cx={isUp ? 62 : 78}
          cy={isUp ? 34 : 54}
          rx={isUp ? 22 : 16}
          ry={isUp ? 12 : 10}
          fill={color}
          opacity="0.5"
        />
      </g>

      <g
        stroke={color}
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        style={{
          transformOrigin: '60px 46px',
          animation: `${isUp ? 'ttArrowUp' : 'ttArrowBack'} 1.8s ease-in-out infinite`,
        }}
      >
        {isUp ? (
          <path d="M60 70 L60 40 M50 50 L60 38 L70 50" />
        ) : (
          <path d="M46 46 L88 46 M74 34 L88 46 L74 58" />
        )}
      </g>

      <style>{`
        @keyframes ttUp   { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        @keyframes ttBack { 0%,100% { transform: translateX(0); } 50% { transform: translateX(6px); } }
        @keyframes ttArrowUp   { 0%,100% { transform: translateY(0); opacity: 0.7; } 50% { transform: translateY(-6px); opacity: 1; } }
        @keyframes ttArrowBack { 0%,100% { transform: translateX(0); opacity: 0.7; } 50% { transform: translateX(8px); opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          g { animation: none !important; }
        }
      `}</style>
    </svg>
  )
}
