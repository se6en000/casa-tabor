/** Where a swipe on a to-do or chore ends: right past a third is done; left past half the snooze buttons opens them. */
export function swipeOutcome(dx: number, width: number, canSnooze: boolean, snoozeW: number): 'done' | 'snooze' | 'none' {
  if (dx >= width / 3) return 'done'
  if (canSnooze && dx <= -snoozeW / 2) return 'snooze'
  return 'none'
}
