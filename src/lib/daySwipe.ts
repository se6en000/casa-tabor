// Swiping between days on the wall, the desktop and the phone (Jake, 2026-09-28). Pure, so it's
// tested: a swipe is decided from where a touch started and ended (no live drag listener — that
// lagged the old homepage on the Pi), and a trackpad's two-finger swipe from its wheel deltas.

export interface TouchPoint { x: number; y: number; t: number }
export type DayStep = 1 | -1

/** Next day (1, a swipe to the left), the day before (-1), or null: a tap, a scroll, a nudge. */
export function swipeStep(start: TouchPoint, end: TouchPoint, { minDistance }: { minDistance: number }): DayStep | null {
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (Math.abs(dx) < minDistance) return null
  // Clearly sideways: a diagonal or a scroll isn't a swipe.
  if (Math.abs(dx) < Math.abs(dy) * 2) return null
  // A slow drag isn't a swipe either (someone moving a finger across while reading).
  if (end.t - start.t > 900) return null
  return dx < 0 ? 1 : -1
}

export interface WheelState { sum: number; last: number; fired: boolean }

const WHEEL_THRESHOLD = 120
const WHEEL_IDLE_MS = 300

/**
 * A two-finger trackpad swipe, from wheel events: sideways movement adds up until it's clearly a
 * swipe, then one step — and nothing more until the gesture (and its inertia) has stopped.
 */
export function wheelSwipe(state: WheelState | null, event: { deltaX: number; deltaY: number; t: number }): { state: WheelState; step: DayStep | null } {
  const fresh = !state || event.t - state.last > WHEEL_IDLE_MS
  const current: WheelState = fresh ? { sum: 0, last: event.t, fired: false } : { ...state, last: event.t }
  if (current.fired) return { state: current, step: null }
  // Only sideways movement counts; vertical scrolling resets the tally.
  if (Math.abs(event.deltaX) <= Math.abs(event.deltaY) * 2) return { state: { ...current, sum: 0 }, step: null }
  current.sum += event.deltaX
  if (Math.abs(current.sum) < WHEEL_THRESHOLD) return { state: current, step: null }
  return { state: { ...current, fired: true }, step: current.sum > 0 ? 1 : -1 }
}

/** The index a step lands on, or null past either end (no wrapping). */
export function stepWithin(index: number, step: DayStep, last: number): number | null {
  const next = index + step
  return next < 0 || next > last ? null : next
}
