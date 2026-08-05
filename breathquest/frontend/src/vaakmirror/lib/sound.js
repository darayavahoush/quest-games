// Small synthesized chimes for positive feedback moments. Built with raw
// oscillators instead of audio files, since there's no asset pipeline here
// and it keeps the bundle dependency-free. Every call is wrapped in
// try/catch and fails silently — browsers can block audio until a user
// gesture has happened somewhere on the page, and if that hasn't occurred
// yet the visual celebration still carries the feedback on its own.

import { speak } from '../../lib/speech'

let audioCtx = null

function getCtx() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return null
    audioCtx = new Ctx()
  }
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {})
  return audioCtx
}

function tone(ctx, freq, startTime, duration, gainPeak = 0.16) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0, startTime)
  gain.gain.linearRampToValueAtTime(gainPeak, startTime + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(startTime)
  osc.stop(startTime + duration + 0.02)
}

// Short two-note "ding" — after each completed rep.
export function playChime() {
  try {
    const ctx = getCtx()
    if (!ctx) return
    const now = ctx.currentTime
    tone(ctx, 587.33, now, 0.16) // D5
    tone(ctx, 880, now + 0.09, 0.22) // A5
  } catch {
    // Ignore — audio is a nice-to-have here, not load-bearing.
  }
}

// Four-note rising fanfare — after the whole round (all reps) is complete.
export function playFanfare() {
  try {
    const ctx = getCtx()
    if (!ctx) return
    const now = ctx.currentTime
    tone(ctx, 523.25, now, 0.16) // C5
    tone(ctx, 659.25, now + 0.12, 0.16) // E5
    tone(ctx, 783.99, now + 0.24, 0.16) // G5
    tone(ctx, 1046.5, now + 0.38, 0.4) // C6, held
  } catch {
    // Ignore.
  }
}

// A soft, low, brief tone for a gentle "missed" cue — deliberately not
// harsh or buzzer-like, since this is a kids' practice tool, not an arcade
// game with penalties.
export function playMiss() {
  try {
    const ctx = getCtx()
    if (!ctx) return
    tone(ctx, 220, ctx.currentTime, 0.22, 0.09) // A3, quiet
  } catch {
    // Ignore.
  }
}

// Speaks a sound aloud using the browser's built-in speech synthesis —
// there's no phoneme audio library here, so this is a practical stand-in.
// Worth knowing: TTS engines generally say the *letter name* for single
// consonants (e.g. "s" comes out as "ess", not the isolated /s/ sound), so
// this is an audio cue tied to the target, not an accurate phoneme
// recording. Digraphs like "sh"/"ch"/"th" tend to come out closer to the
// real sound. Fails silently if speech synthesis isn't available.
//
// Now backed by the shared src/lib/speech.js implementation (same rate/
// pitch this file always used) so every part of the app shares one speech
// utility instead of two copies of the same try/catch wrapper.
export function speakSound(text) {
  speak(text, { rate: 0.85, pitch: 1.05 })
}
