const FILTERS = [
  { id: 'none', label: 'No filter', ring: 'ring-white/15', badge: null, frameColor: 'rgba(255,255,255,0.12)' },
  { id: 'lion', label: 'Lion', ring: 'ring-gold', badge: '🦁', frameColor: '#F4B942' },
  { id: 'robot', label: 'Robot', ring: 'ring-mint', badge: '🤖', frameColor: '#2FB8A6' },
  { id: 'hero', label: 'Superhero', ring: 'ring-coral', badge: '🦸', frameColor: '#F0604A' },
  { id: 'bunny', label: 'Bunny', ring: 'ring-[#F2A6C7]', badge: '🐰', frameColor: '#F2A6C7' },
  { id: 'cat', label: 'Cat', ring: 'ring-[#F3B37A]', badge: '🐱', frameColor: '#F3B37A' },
  { id: 'unicorn', label: 'Unicorn', ring: 'ring-[#B98FE0]', badge: '🦄', frameColor: '#B98FE0' },
]

export default function CharacterFilterPicker({ value, onChange }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {FILTERS.map((f) => (
        <button
          key={f.id}
          onClick={() => onChange(f.id)}
          className={`w-11 h-11 rounded-full flex items-center justify-center border transition-all ${
            value === f.id
              ? 'border-transparent ring-2 ' + f.ring + ' bg-white/10'
              : 'border-white/10 hover:border-white/25'
          }`}
          aria-pressed={value === f.id}
          aria-label={f.label}
          title={f.label}
        >
          <span className="text-lg leading-none">{f.badge ?? '○'}</span>
        </button>
      ))}
    </div>
  )
}

export { FILTERS }
