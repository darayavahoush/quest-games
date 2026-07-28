// A drawn outline of each target mouth shape, shown next to the letter so
// the child has something to visually copy — not just a text instruction.
// It also animates in a way that mimics the actual articulatory motion for
// that sound's manner (a quick pop for plosives, a shimmer for fricatives,
// etc.) rather than sitting as a static icon. Color reflects live match
// quality once the camera starts scoring.

const STROKE = {
  idle: '#FBF7EE55',
  green: '#2FB8A6',
  yellow: '#F4B942',
  red: '#F0604A',
}

// animation name -> keyframe CSS + duration, keyed by manner of articulation
const MOTION = {
  Plosive: { name: 'mgPop', duration: '1.6s' },
  Affricate: { name: 'mgPopShimmer', duration: '1.8s' },
  Fricative: { name: 'mgShimmer', duration: '0.6s' },
  Nasal: { name: 'mgBreathe', duration: '2.2s' },
  Approximant: { name: 'mgSettle', duration: '2.4s' },
  'Lateral Approximant': { name: 'mgSettle', duration: '2.4s' },
}

function ShapeSvg({ shape }) {
  switch (shape) {
    case 'lips-closed':
      return (
        <>
          <path d="M20 45 Q60 38 100 45" />
          <path d="M20 45 Q60 52 100 45" />
        </>
      )
    case 'lip-teeth':
      return (
        <>
          <path d="M22 38 h76" strokeDasharray="6 4" />
          <path d="M20 46 Q60 62 100 46 Q100 40 60 40 Q20 40 20 46 Z" fill="#2FB8A611" />
        </>
      )
    case 'wide-narrow':
      return (
        <>
          <path d="M14 44 Q60 30 106 44" />
          <path d="M14 44 Q60 54 106 44" />
          <path d="M40 44 h40" strokeDasharray="4 4" opacity="0.6" />
        </>
      )
    case 'tongue-tip-up':
      return (
        <>
          <ellipse cx="60" cy="46" rx="34" ry="20" fill="none" />
          <path d="M50 50 L60 30 L70 50 Z" fill="currentColor" opacity="0.7" stroke="none" />
        </>
      )
    case 'round-forward':
      return <ellipse cx="60" cy="46" rx="18" ry="22" fill="none" />
    case 'open-wide':
      return <ellipse cx="60" cy="46" rx="30" ry="26" fill="none" />
    default:
      return null
  }
}

export default function MouthShapeGuide({ shape, manner, tier = 'idle', className = '' }) {
  const color = STROKE[tier] ?? STROKE.idle
  const motion = MOTION[manner]

  return (
    <svg
      viewBox="0 0 120 90"
      className={className}
      style={{ color, transition: 'color 150ms ease' }}
    >
      <g
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
        style={
          motion
            ? {
                transformOrigin: '60px 46px',
                animation: `${motion.name} ${motion.duration} ease-in-out infinite`,
              }
            : undefined
        }
      >
        <ShapeSvg shape={shape} />
      </g>
      <style>{`
        @keyframes mgPop {
          0%   { transform: scaleY(0.55); opacity: 0.65; }
          14%  { transform: scaleY(1.05); opacity: 1; }
          30%  { transform: scaleY(0.55); opacity: 0.65; }
          100% { transform: scaleY(0.55); opacity: 0.65; }
        }
        @keyframes mgPopShimmer {
          0%   { transform: scaleY(0.55) translateX(0); opacity: 0.65; }
          12%  { transform: scaleY(1.05) translateX(0); opacity: 1; }
          28%  { transform: scaleY(1) translateX(0); }
          42%  { transform: scaleY(1) translateX(-2px); }
          56%  { transform: scaleY(1) translateX(2px); }
          70%  { transform: scaleY(1) translateX(-1px); }
          85%  { transform: scaleY(0.7) translateX(0); opacity: 0.8; }
          100% { transform: scaleY(0.55) translateX(0); opacity: 0.65; }
        }
        @keyframes mgShimmer {
          0%, 100% { transform: translateX(0); }
          25%      { transform: translateX(-1.5px); }
          75%      { transform: translateX(1.5px); }
        }
        @keyframes mgBreathe {
          0%, 100% { transform: scale(1); opacity: 0.85; }
          50%      { transform: scale(1.045); opacity: 1; }
        }
        @keyframes mgSettle {
          0%, 100% { transform: scale(0.98) translateY(0); }
          50%      { transform: scale(1.015) translateY(-1px); }
        }
        @media (prefers-reduced-motion: reduce) {
          g { animation: none !important; }
        }
      `}</style>
    </svg>
  )
}
