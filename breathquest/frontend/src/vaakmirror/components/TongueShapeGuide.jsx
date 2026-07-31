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

// Per-move blob position/size and arrow geometry. left/right sit lower and
// further out than up/back so all four read as visually distinct at a
// glance, rather than left/right crowding the same space "back" already
// occupies.
const MOVE_CONFIG = {
  'tongue-up':    { cx: 62, cy: 34, rx: 22, ry: 12, anim: 'ttUp' },
  'tongue-back':  { cx: 78, cy: 54, rx: 16, ry: 10, anim: 'ttBack' },
  'tongue-left':  { cx: 34, cy: 58, rx: 17, ry: 11, anim: 'ttLeft' },
  'tongue-right': { cx: 86, cy: 58, rx: 17, ry: 11, anim: 'ttRight' },
}

function ArrowPath({ move }) {
  if (move === 'tongue-up') return <path d="M60 70 L60 40 M50 50 L60 38 L70 50" />
  if (move === 'tongue-back') return <path d="M46 46 L88 46 M74 34 L88 46 L74 58" />
  if (move === 'tongue-left') return <path d="M74 62 L34 62 M48 50 L34 62 L48 74" />
  if (move === 'tongue-right') return <path d="M46 62 L86 62 M72 50 L86 62 L72 74" />
  return null
}

export default function TongueShapeGuide({ move, tier = 'idle', className = '' }) {
  const color = STROKE[tier] ?? STROKE.idle
  const config = MOVE_CONFIG[move] ?? MOVE_CONFIG['tongue-up']

  return (
    <svg viewBox="0 0 120 90" className={className} style={{ transition: 'color 150ms ease' }}>
      <g fill="none" stroke={color} strokeWidth="4" strokeLinecap="round">
        <path d="M18 30 Q60 12 102 30" />
        <path d="M18 62 Q60 78 102 62" />
      </g>

      <g style={{ transformOrigin: '60px 46px', animation: `${config.anim} 1.8s ease-in-out infinite` }}>
        <ellipse cx={config.cx} cy={config.cy} rx={config.rx} ry={config.ry} fill={color} opacity="0.5" />
      </g>

      <g
        stroke={color}
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        style={{ transformOrigin: '60px 46px', animation: `${config.anim}Arrow 1.8s ease-in-out infinite` }}
      >
        <ArrowPath move={move} />
      </g>

      <style>{`
        @keyframes ttUp    { 0%,100% { transform: translateY(0); }    50% { transform: translateY(-4px); } }
        @keyframes ttBack  { 0%,100% { transform: translateX(0); }    50% { transform: translateX(6px); } }
        @keyframes ttLeft  { 0%,100% { transform: translateX(0); }    50% { transform: translateX(-6px); } }
        @keyframes ttRight { 0%,100% { transform: translateX(0); }    50% { transform: translateX(6px); } }
        @keyframes ttUpArrow    { 0%,100% { transform: translateY(0); opacity: 0.7; } 50% { transform: translateY(-6px); opacity: 1; } }
        @keyframes ttBackArrow  { 0%,100% { transform: translateX(0); opacity: 0.7; } 50% { transform: translateX(8px);  opacity: 1; } }
        @keyframes ttLeftArrow  { 0%,100% { transform: translateX(0); opacity: 0.7; } 50% { transform: translateX(-8px); opacity: 1; } }
        @keyframes ttRightArrow { 0%,100% { transform: translateX(0); opacity: 0.7; } 50% { transform: translateX(8px);  opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          g { animation: none !important; }
        }
      `}</style>
    </svg>
  )
}
