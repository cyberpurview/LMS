'use client'
import type { Notification } from '@/types'

let audio: AudioContext | undefined
/** Call from a user gesture; browser autoplay restrictions still apply. */
export async function prepareCompletionSound() {
  try {
    audio ||= new AudioContext()
    if (audio.state === 'suspended') await audio.resume()
  } catch {
    /* Sound is optional; unsupported audio never blocks the dashboard. */
  }
}
export function playCompletionSound() {
  if (!audio || audio.state !== 'running') return
  try {
    const now = audio.currentTime
    for (const [offset, frequency] of [
      [0, 660],
      [0.13, 880],
    ]) {
      const tone = audio.createOscillator(),
        volume = audio.createGain()
      tone.type = 'sine'
      tone.frequency.value = frequency
      volume.gain.setValueAtTime(0, now + offset)
      volume.gain.linearRampToValueAtTime(0.045, now + offset + 0.015)
      volume.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.3)
      tone.connect(volume)
      volume.connect(audio.destination)
      tone.start(now + offset)
      tone.stop(now + offset + 0.32)
      tone.onended = () => {
        tone.disconnect()
        volume.disconnect()
      }
    }
  } catch {
    /* Keep the visual notification if audio cannot play. */
  }
}
export function closeCompletionSound() {
  const previous = audio
  audio = undefined
  if (previous) void previous.close().catch(() => {})
}

/** A bounded, account-scoped receipt prevents replay across polling and tabs. */
export function createCompletionSoundFeed(userId: string, startedAt = Date.now()) {
  const seen = new Set<string>()
  const storageKey = `cyberpurview:completion-sounds:${userId}`
  return (notifications: Notification[], enabled: boolean, focused: boolean) => {
    const candidates = notifications.filter(
      (n) =>
        n.userId === userId &&
        !n.isRead &&
        n.type === 'success' &&
        /^ai-generation:[0-9a-f-]{36}:complete$/.test(n.eventKey || '') &&
        Date.parse(n.createdAt) >= startedAt &&
        !seen.has(n.id),
    )
    // Do not queue sounds that arrived while muted. Unfocused tabs may claim
    // them on return, unless the focused tab already played the same receipt.
    if (!enabled) {
      candidates.forEach((n) => seen.add(n.id))
      while (seen.size > 200) seen.delete(seen.values().next().value!)
      return
    }
    if (!focused || !candidates.length) return
    let played: string[] = []
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || '[]')
      if (Array.isArray(stored)) played = stored.filter((x) => typeof x === 'string').slice(-100)
    } catch {}
    const fresh = candidates.filter((n) => !played.includes(n.id))
    candidates.forEach((n) => seen.add(n.id))
    while (seen.size > 200) seen.delete(seen.values().next().value!)
    if (!fresh.length) return
    // One gentle chime even if multiple completions arrive in the same batch.
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify([...played, ...fresh.map((n) => n.id)].slice(-100)),
      )
    } catch {}
    playCompletionSound()
  }
}
