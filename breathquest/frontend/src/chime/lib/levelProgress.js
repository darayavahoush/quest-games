// Computes level unlock/pass state from Chime's own event history —
// no separate backend endpoint needed, /chime/events already returns
// only this kid's events (backend derives identity from the token).
import { getEvents } from './api'

export const LEVEL_ORDER = ['aa', 'oo', 'ma', 'fa', 'ha', 'ee', 'r', 'village-builder']

// Single source of truth for levelId -> route, so ChimeHome's cards and each
// game's own "Next Level" button can never point at different paths.
export const LEVEL_ROUTES = {
  aa: '/play/chime/rocket-launch',
  oo: '/play/chime/submarine-dive',
  ma: '/play/chime/firefly-jar',
  fa: '/play/chime/wind-chime-garden',
  ha: '/play/chime/bubble-wrap-pop',
  ee: '/play/chime/xylophone-tower',
  r: '/play/chime/lions-roar',
  'village-builder': '/play/chime/village-builder',
}

const PASS_THRESHOLD = 0.6

// Returns the next level's route once `currentLevelId` has been passed, or
// null if this was the last level (caller should send the kid back to
// ChimeHome / show a "you finished them all!" state instead of a button).
// Does NOT re-check unlock state — a level that was just completed is by
// definition unlocking whatever comes after it.
export function getNextLevelRoute(currentLevelId) {
  const i = LEVEL_ORDER.indexOf(currentLevelId)
  if (i === -1 || i === LEVEL_ORDER.length - 1) return null
  return LEVEL_ROUTES[LEVEL_ORDER[i + 1]]
}

// { aa: true, oo: false, ... } — has this kid ever passed each level.
export async function getPassedLevels() {
  const events = await getEvents()
  const passed = {}
  for (const levelId of LEVEL_ORDER) {
    passed[levelId] = events.some(
      e =>
        e.level_id === levelId &&
        e.is_valid_attempt &&
        // Either a real per-burst/per-attempt score cleared PASS_THRESHOLD, or the
        // mini-game itself fired its "level complete" success screen. The five
        // phoneme games use deliberately forgiving in-game catch/pop/launch
        // thresholds (well under PASS_THRESHOLD) so a kid can finish the game
        // without any single logged event ever reaching 0.6 — the explicit
        // level_complete marker is what actually unlocks the next level in
        // that case.
        (e.score >= PASS_THRESHOLD || e.action === 'level_complete')
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
