import { Link } from 'react-router-dom'
import { ArrowLeft, Hammer } from 'lucide-react'

export default function ComingSoonGame({ title, blurb }) {
  return (
    <div className="bg-ink min-h-[calc(100vh-4rem)]">
      <div className="max-w-2xl mx-auto px-6 py-24 text-center">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-paper/50 hover:text-paper text-sm mb-10"
        >
          <ArrowLeft size={15} /> All games
        </Link>
        <div className="w-14 h-14 rounded-2xl bg-mint/15 border border-mint/30 flex items-center justify-center mx-auto mb-6">
          <Hammer size={22} className="text-mint" />
        </div>
        <p className="font-mono text-xs uppercase tracking-widest text-mint mb-3">In progress</p>
        <h1 className="font-display text-3xl font-bold text-paper mb-4">{title}</h1>
        <p className="text-paper/55 leading-relaxed">{blurb}</p>
      </div>
    </div>
  )
}
