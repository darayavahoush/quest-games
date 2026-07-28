// Signature hero visual: three mouth silhouettes (smile / round / open)
// crossfade in a loop, echoing the shape-matching mechanic itself. Built as
// three stacked static SVG paths with staggered CSS opacity keyframes so it
// works with zero JS and respects prefers-reduced-motion via index.css.

const shapes = [
  { d: 'M40 100 Q140 150 240 100', delay: '0s', label: 'ee' },
  { d: 'M110 90 Q140 60 170 90 Q170 130 140 140 Q110 130 110 90 Z', delay: '2.6s', label: 'oo' },
  { d: 'M70 80 Q140 60 210 80 Q210 150 140 160 Q70 150 70 80 Z', delay: '5.2s', label: 'ah' },
]

export default function MouthMotif({ className = '' }) {
  return (
    <div className={`relative ${className}`} aria-hidden="true">
      <svg viewBox="0 0 280 200" className="w-full h-full">
        <defs>
          <linearGradient id="mouthGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#F0604A" />
            <stop offset="100%" stopColor="#F4B942" />
          </linearGradient>
        </defs>
        {shapes.map((s, i) => (
          <path
            key={i}
            d={s.d}
            fill="none"
            stroke="url(#mouthGrad)"
            strokeWidth="10"
            strokeLinecap="round"
            style={{
              animation: `mouthMorph 7.8s ease-in-out infinite`,
              animationDelay: s.delay,
              opacity: i === 0 ? 1 : 0,
            }}
          />
        ))}
      </svg>
      <style>{`
        @keyframes mouthMorph {
          0%   { opacity: 1; }
          8%   { opacity: 1; }
          18%  { opacity: 0; }
          92%  { opacity: 0; }
          100% { opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          svg path { animation: none !important; opacity: 1 !important; }
          svg path:not(:first-child) { display: none; }
        }
      `}</style>
    </div>
  )
}
