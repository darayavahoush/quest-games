import { Star } from 'lucide-react'

export default function ProgressRing({ stars, total = 5 }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <Star
          key={i}
          size={20}
          className={i < stars ? 'text-gold fill-gold' : 'text-white/15'}
          strokeWidth={1.5}
        />
      ))}
    </div>
  )
}
