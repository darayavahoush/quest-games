// Shared kid-facing sidebar nav — replaces GameNavbar's APPS list, same
// four games plus "All games" as a way back to the picker. Extracted to
// its own file since it's now used across BreathQuest/Chime/Orpheus/
// Voice Hurdle Race's separate home pages, not owned by any one of them.
import { Home, Wind, Waves, Bell, Rabbit } from 'lucide-react'

export const KID_SIDEBAR_ITEMS = [
  { label: 'All games',    icon: Home,   to: '/play' },
  { label: 'BreathQuest',  icon: Wind,   to: '/play/levels' },
  { label: 'Orpheus',      icon: Waves,  to: '/play/vaakmirror' },
  { label: 'Chime',        icon: Bell,   to: '/play/chime' },
  { label: 'Voice Hurdle', icon: Rabbit, to: '/play/voice-hurdle-race' },
]
