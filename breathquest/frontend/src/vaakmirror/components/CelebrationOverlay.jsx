import { Sparkles, ArrowRight } from 'lucide-react'

// Shown for ~1s after each rep, over the camera feed — gives a clear "that
// one's done" moment and points the child toward the target panel for
// what's next, rather than silently swapping the target underneath them.
export default function CelebrationOverlay({ show }) {
  return (
    <div
      className={`absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-ink-deep/80 backdrop-blur-sm pointer-events-none transition-opacity duration-300 ${
        show ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div
        className="w-16 h-16 rounded-full bg-mint/20 border border-mint/40 flex items-center justify-center"
        style={{ animation: show ? 'celebratePop 0.5s ease-out' : 'none' }}
      >
        <Sparkles size={28} className="text-mint" />
      </div>
      <p className="font-display text-xl font-bold text-paper">Nice! ✨</p>
      <p className="text-paper/60 text-sm flex items-center gap-1.5">
        Look at your next one
        <ArrowRight size={14} style={{ animation: 'celebrateNudge 0.9s ease-in-out infinite' }} />
      </p>
      <style>{`
        @keyframes celebratePop {
          0%   { transform: scale(0.4); opacity: 0; }
          60%  { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes celebrateNudge {
          0%, 100% { transform: translateX(0); }
          50%      { transform: translateX(4px); }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation: none !important; }
        }
      `}</style>
    </div>
  )
}
