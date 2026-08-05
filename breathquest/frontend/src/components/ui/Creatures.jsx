// Illustrated creature avatars — replaces the old emoji-in-a-gradient-circle
// Avatar with real drawn characters, in the same style language as Landing.jsx's
// BreathBuddy (soft gradient body, dot eyes, blush cheeks, warm dark linework).
//
// Each creature is a self-contained <svg viewBox="0 0 100 100">. Gradient ids
// are namespaced with a per-instance `uid` (from useId()) so two copies of the
// same creature on one page — e.g. GamePicker's header avatar + hero avatar —
// don't silently share (and fight over) the same <linearGradient> definition.

import { useId } from 'react'

// Shared cute-face kit — dot eyes, blush cheeks, a simple smile — so every
// creature reads as the same friendly cast rather than six unrelated styles.
function Face({ cx, cy, ink, blush, eyeGap = 10.5, eyeDy = 0, smileWidth = 7, smileDrop = 9 }) {
  return (
    <g>
      <circle cx={cx - eyeGap * 1.55} cy={cy + eyeDy} r={11.5} fill={blush} opacity="0.4" />
      <circle cx={cx + eyeGap * 1.55} cy={cy + eyeDy} r={11.5} fill={blush} opacity="0.4" />
      <circle cx={cx - eyeGap} cy={cy + eyeDy - 1.5} r={3.2} fill={ink} />
      <circle cx={cx + eyeGap} cy={cy + eyeDy - 1.5} r={3.2} fill={ink} />
      <circle cx={cx - eyeGap + 1} cy={cy + eyeDy - 2.5} r={1} fill="white" opacity="0.9" />
      <circle cx={cx + eyeGap + 1} cy={cy + eyeDy - 2.5} r={1} fill="white" opacity="0.9" />
      <path
        d={`M ${cx - smileWidth} ${cy + eyeDy + smileDrop} q ${smileWidth} 6.5 ${smileWidth * 2} 0`}
        stroke={ink} strokeWidth="2.8" strokeLinecap="round" fill="none"
      />
    </g>
  )
}

function Chick({ uid }) {
  const g = `chick-${uid}`
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFEE9C" />
          <stop offset="100%" stopColor="#FFB84D" />
        </linearGradient>
      </defs>
      <ellipse cx="34" cy="70" rx="9" ry="4" fill="#E68A2E" opacity="0.5" />
      <ellipse cx="66" cy="70" rx="9" ry="4" fill="#E68A2E" opacity="0.5" />
      <path d="M28 82 L34 74 L40 82 Z" fill="#E68A2E" />
      <path d="M60 82 L66 74 L72 82 Z" fill="#E68A2E" />
      <ellipse cx="50" cy="58" rx="34" ry="30" fill={`url(#${g})`} />
      <path d="M18 48 Q10 46 14 38 Q22 40 24 48 Z" fill={`url(#${g})`} />
      <path d="M82 48 Q90 46 86 38 Q78 40 76 48 Z" fill={`url(#${g})`} />
      <path d="M42 22 Q46 12 52 18 Q56 10 58 20" stroke="#E68A2E" strokeWidth="3.5"
            strokeLinecap="round" fill="none" />
      <path d="M43 62 L50 68 L57 62 Z" fill="#F0793B" />
      <Face cx={50} cy={54} ink="#7A4A1E" blush="#FF9B6B" eyeGap={11} />
    </svg>
  )
}

function Dino({ uid }) {
  const g = `dino-${uid}`
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#B6F5B0" />
          <stop offset="100%" stopColor="#2FB86F" />
        </linearGradient>
      </defs>
      <path d="M20 78 Q14 88 24 88 Q28 82 30 76 Z" fill="#1E8C56" />
      <path d="M80 78 Q86 88 76 88 Q72 82 70 76 Z" fill="#1E8C56" />
      <path d="M16 66 Q4 70 10 78 Q18 76 22 68 Z" fill={`url(#${g})`} />
      <ellipse cx="50" cy="58" rx="33" ry="29" fill={`url(#${g})`} />
      <path d="M36 26 L40 14 L45 27 M48 24 L52 12 L57 25 M60 27 L64 16 L68 28"
            fill={`url(#${g})`} stroke="none" />
      <path d="M40 20 Q42 16 45 20" fill="#1E8C56" opacity="0" />
      <ellipse cx="30" cy="50" rx="4.5" ry="6" fill="#1E8C56" opacity="0.55" />
      <Face cx={51} cy={56} ink="#1E5C38" blush="#FF9B6B" eyeGap={11} />
      <path d="M40 68 q10 8 20 0" stroke="#1E5C38" strokeWidth="0" fill="none" />
    </svg>
  )
}

function Rocket({ uid }) {
  const g = `rocket-${uid}`
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#E6D4FF" />
          <stop offset="100%" stopColor="#9B6BF0" />
        </linearGradient>
        <linearGradient id={`${g}-flame`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFD08A" />
          <stop offset="100%" stopColor="#FF6B4A" />
        </linearGradient>
      </defs>
      <path d="M50 84 Q42 96 40 82 Q50 78 50 78 Q50 78 60 82 Q58 96 50 84 Z" fill={`url(#${g}-flame)`} />
      <path d="M30 66 L14 78 L26 56 Z" fill="#7C4FD1" />
      <path d="M70 66 L86 78 L74 56 Z" fill="#7C4FD1" />
      <path d="M50 10 C68 24 72 46 66 68 Q50 78 34 68 C28 46 32 24 50 10 Z" fill={`url(#${g})`} />
      <circle cx="50" cy="46" r="15" fill="#FBF7EE" opacity="0.9" />
      <Face cx={50} cy={47} ink="#5A3A9E" blush="#FF9B6B" eyeGap={8.5} smileWidth={5.5} smileDrop={7} />
    </svg>
  )
}

function Fish({ uid }) {
  const g = `fish-${uid}`
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#B3EFFF" />
          <stop offset="100%" stopColor="#2FA9E0" />
        </linearGradient>
      </defs>
      <path d="M14 50 L30 38 L30 62 Z" fill="#1E7CB0" />
      <path d="M60 22 Q70 16 66 28 Q74 30 66 36 Z" fill={`url(#${g})`} />
      <ellipse cx="56" cy="52" rx="32" ry="27" fill={`url(#${g})`} />
      <path d="M40 60 Q46 66 52 60" stroke="#1E7CB0" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.6" />
      <Face cx={60} cy={50} ink="#0F5A82" blush="#FFB3C6" eyeGap={9} smileWidth={5.5} smileDrop={7} />
    </svg>
  )
}

function Bunny({ uid }) {
  const g = `bunny-${uid}`
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FDE2EE" />
          <stop offset="100%" stopColor="#F5A3C7" />
        </linearGradient>
        <linearGradient id={`${g}-inner`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFF" />
          <stop offset="100%" stopColor="#FBC7DC" />
        </linearGradient>
      </defs>
      <ellipse cx="34" cy="82" rx="10" ry="4" fill="#E8709E" opacity="0.4" />
      <ellipse cx="66" cy="82" rx="10" ry="4" fill="#E8709E" opacity="0.4" />
      <path d="M30 30 C24 8 34 2 38 20 C40 30 38 38 34 40 Z" fill={`url(#${g})`} />
      <path d="M70 30 C76 8 66 2 62 20 C60 30 62 38 66 40 Z" fill={`url(#${g})`} />
      <path d="M33 24 C30 12 35 10 37 21" fill={`url(#${g}-inner)`} />
      <path d="M67 24 C70 12 65 10 63 21" fill={`url(#${g}-inner)`} />
      <ellipse cx="50" cy="60" rx="32" ry="28" fill={`url(#${g})`} />
      <Face cx={50} cy={58} ink="#B0507E" blush="#FF9B6B" eyeGap={11} />
    </svg>
  )
}

function Fox({ uid }) {
  const g = `fox-${uid}`
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFB870" />
          <stop offset="100%" stopColor="#E8791A" />
        </linearGradient>
      </defs>
      <path d="M22 20 L38 38 L18 42 Z" fill={`url(#${g})`} />
      <path d="M78 20 L62 38 L82 42 Z" fill={`url(#${g})`} />
      <path d="M25 24 L35 36 L23 38 Z" fill="#FBF7EE" opacity="0.8" />
      <path d="M75 24 L65 36 L77 38 Z" fill="#FBF7EE" opacity="0.8" />
      <ellipse cx="50" cy="60" rx="33" ry="28" fill={`url(#${g})`} />
      <path d="M38 66 Q50 78 62 66 Q56 72 50 72 Q44 72 38 66 Z" fill="#FBF7EE" opacity="0.85" />
      <path d="M50 62 L44 70 L56 70 Z" fill="#B0500E" />
      <Face cx={50} cy={54} ink="#8A4A0E" blush="#FF9B6B" eyeGap={11.5} smileDrop={11} />
    </svg>
  )
}

export const CREATURES = {
  chick:  Chick,
  dragon: Dino,
  bunny:  Bunny,
  fox:    Fox,
  rocket: Rocket,
  fish:   Fish,
}

export const CREATURE_ACCENTS = {
  chick:  { from: '#FFEE9C', to: '#FFB84D', ring: '#FFB84D' },
  dragon: { from: '#B6F5B0', to: '#2FB86F', ring: '#2FB86F' },
  bunny:  { from: '#FDE2EE', to: '#F5A3C7', ring: '#F5A3C7' },
  fox:    { from: '#FFB870', to: '#E8791A', ring: '#E8791A' },
  rocket: { from: '#E6D4FF', to: '#9B6BF0', ring: '#9B6BF0' },
  fish:   { from: '#B3EFFF', to: '#2FA9E0', ring: '#2FA9E0' },
}

export function Creature({ species = 'chick', className = '' }) {
  const uid = useId()
  const C = CREATURES[species] || CREATURES.chick
  return (
    <div className={className}>
      <C uid={uid} />
    </div>
  )
}
