// Shared browser text-to-speech utility for verbal instructions across the
// app — BreathQuest levels, Chime games, VaakMirror, and (as a manual
// tap-to-hear only, no auto-play) the login/nav flow. Generalizes the
// pattern VaakMirror's speakSound() already established in
// vaakmirror/lib/sound.js: cancel any in-flight utterance, speak the new
// one, fail silently if speech synthesis isn't available (some browsers
// block audio until a user gesture has happened somewhere on the page —
// the visual UI always carries the instruction on its own regardless).
//
// vaakmirror/lib/sound.js now re-exports `speak` as `speakSound` so its
// four existing call sites (MirrorMirror, LipSyncHero, TongueTamer,
// MinimalPairDrill) keep working unchanged.
//
// Voice: there's no server-side TTS provider wired into this app (no API
// key, no backend audio pipeline) — this is entirely the browser's
// built-in Web Speech API (`window.speechSynthesis`), which is free and
// needs no setup, but means the actual voice is whatever the device
// exposes, not something this code can force. `pickPreferredVoice()`
// below asks for an Indian-English voice (`en-IN`) when the device has
// one and otherwise falls back to the browser's default silently.
// Real-world availability: Chrome on Android/desktop commonly lists a
// network "Google" en-IN voice when online; iOS/macOS Safari ships a
// built-in en-IN voice ("Rishi") that works offline too. Devices with
// neither (e.g. some Windows/Chrome setups, or Chrome fully offline) will
// just get their normal default system voice — there's no way to
// guarantee an en-IN voice exists on every device short of adding a real
// paid cloud TTS backend, which isn't set up here.

import { useEffect, useRef } from 'react'

let cachedVoices = null
if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoices = window.speechSynthesis.getVoices()
  }
}

function pickPreferredVoice() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null
  const voices = cachedVoices?.length ? cachedVoices : window.speechSynthesis.getVoices()
  if (!voices || voices.length === 0) return null
  cachedVoices = voices
  return (
    voices.find(v => v.lang === 'en-IN') ||
    voices.find(v => v.lang?.toLowerCase().startsWith('en-in')) ||
    voices.find(v => /india/i.test(v.name)) ||
    null
  )
}

export function speak(text, { rate = 0.95, pitch = 1.0 } = {}) {
  try {
    if (!text || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(text)
    utter.rate = rate
    utter.pitch = pitch
    // Hint the language even when no exact-match voice object is found —
    // some browsers will still route to a same-language voice by lang code.
    utter.lang = 'en-IN'
    const voice = pickPreferredVoice()
    if (voice) utter.voice = voice
    window.speechSynthesis.speak(utter)
  } catch {
    // Ignore — voice is a layer on top of the visual UI, never load-bearing.
  }
}

export function stopSpeaking() {
  try {
    if (window.speechSynthesis) window.speechSynthesis.cancel()
  } catch {
    // Ignore.
  }
}

// Speaks `text` once automatically each time it becomes relevant — either
// because `enabled` flips from false to true (entering/re-entering this
// screen or phase), or because `text` itself changes while already
// enabled (e.g. moving to a new level whose instruction text differs) —
// and returns a `replay` function to wire to a "hear it again" button.
//
// This is the "auto once + replay" pattern, but "once" means once per
// entry, not once ever: re-entering the same mode/phase a second time
// (e.g. tapping back into "register" after leaving it, or every attempt's
// breathe-in cue) re-speaks, since it tracks the *edge* of becoming
// enabled rather than deduping purely on text equality. A pure
// text-equality dedupe would silently go quiet on the second visit to any
// screen whose instruction text doesn't change between visits — a real
// bug caught while wiring this into GamePage.jsx's breathe-in cue, which
// recurs identically every attempt.
//
// Safe under React StrictMode's dev-only double-invoke: the second
// invocation sees the same (text, enabled) as the first and doesn't
// re-fire, since prevRef is only updated once per actual effect run.
export function useSpokenInstruction(text, { enabled = true, rate, pitch } = {}) {
  const prevRef = useRef({ text: null, enabled: false })

  useEffect(() => {
    const prev = prevRef.current
    const enabledRisingEdge = enabled && !prev.enabled
    const textChangedWhileEnabled = enabled && prev.enabled && text !== prev.text
    if (enabled && text && (enabledRisingEdge || textChangedWhileEnabled)) {
      speak(text, { rate, pitch })
    }
    prevRef.current = { text, enabled }
  }, [text, enabled, rate, pitch])

  return () => { if (text) speak(text, { rate, pitch }) }
}
