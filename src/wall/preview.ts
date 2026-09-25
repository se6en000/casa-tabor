import type { Posture } from './posture.ts'

// Tap-to-preview: each tap on the wall shows the next face; with no touch for
// 2 minutes it goes back to the face that fits the time of day.

export const PREVIEW_MS = 2 * 60_000
const ORDER: Posture[] = ['calm', 'launch', 'evening']

export interface PreviewState {
  posture: Posture
  /** When it lapses (ms since epoch). */
  until: number
}

const active = (state: PreviewState | null, nowMs: number) => (state && nowMs < state.until ? state : null)

export function shownPosture(auto: Posture, state: PreviewState | null, nowMs: number): { posture: Posture; preview: boolean } {
  const live = active(state, nowMs)
  return live ? { posture: live.posture, preview: true } : { posture: auto, preview: false }
}

/** The preview after one more tap; null means back to automatic. */
export function nextPreview(auto: Posture, state: PreviewState | null, nowMs: number): PreviewState | null {
  const current = shownPosture(auto, state, nowMs).posture
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]
  return next === auto ? null : { posture: next, until: nowMs + PREVIEW_MS }
}
