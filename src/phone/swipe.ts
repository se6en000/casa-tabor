/** A quick flick counts as a full swipe (px per ms), as long as it travelled this far. */
const FLICK_V = 0.5
const FLICK_MIN = 44

/**
 * Where a swipe on a to-do or chore ends: right past a third (or a quick flick right) is done; left past half the
 * snooze buttons (or a flick left) opens them; anything else springs back.
 */
export function swipeOutcome(dx: number, width: number, canSnooze: boolean, snoozeW: number, velocity = 0): 'done' | 'snooze' | 'none' {
  if (dx >= width / 3 || (velocity >= FLICK_V && dx >= FLICK_MIN)) return 'done'
  if (canSnooze && (dx <= -snoozeW / 2 || (velocity <= -FLICK_V && dx <= -FLICK_MIN))) return 'snooze'
  return 'none'
}

/** Which way a finger is going, once it has gone far enough to tell: sideways is the card's, up and down the day's. */
export function swipeAxis(dx: number, dy: number, slop = 6): 'x' | 'y' | null {
  if (Math.abs(dx) < slop && Math.abs(dy) < slop) return null
  return Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
}
