// Computes level unlock/pass state from Chime's own event history —
// no separate backend endpoint needed, /chime/events already returns
// only this kid's events (backend derives identity from the token).
import { getEvents } from './api'

export const LEVEL_ORDER = ['aa', 'oo', 'ma', 'fa', 'ha', 'village-builder']

const PASS_THRESHOLD = 0.6

// { aa: true, oo: false, ... } — has this kid ever passed each level.
export async function getPassedLevels() {
  const events = await getEvents()
  const passed = {}
  for (const levelId of LEVEL_ORDER) {
    passed[levelId] = events.some(
      e => e.level_id === levelId && e.is_valid_attempt && e.score >= PASS_THRESHOLD
    )
  }
  return passed
}

// First level is always unlocked; every other level unlocks once the
// one immediately before it in LEVEL_ORDER has been passed.
export function getUnlockedLevels(passed) {
  const unlocked = {}
  LEVEL_ORDER.forEach((levelId, i) => {
    unlocked[levelId] = i === 0 || !!passed[LEVEL_ORDER[i - 1]]
  })
  return unlocked
}
