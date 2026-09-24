import { memo, type ComponentType } from 'react'
import { isSameMinute } from 'date-fns'

// 2026-09-24: part of the kiosk scroll-jank investigation (see
// casa_tabor_pi_ux_lag_investigation memory). The homepage's `now` comes from
// useLiveClock(10_000) at the top of CalmKioskView and is threaded down as a
// prop to most widgets -- a fresh Date reference every 10 seconds. Plain
// React.memo can't help those widgets at all: `now` changing reference every
// tick makes memo's default shallow-equal check fail every single time,
// forcing a full re-render of that widget (and everything under it) every 10
// seconds regardless of whether anything the widget actually DISPLAYS
// changed. Nothing any of these widgets render is more precise than whole
// minutes ("14m", "3:00 PM"), and the numeric countdown props they're passed
// (minutesUntilLeave, etc.) are themselves already minute-quantized upstream,
// so they only actually change on a real minute boundary anyway -- `now`
// ticking every 10s inside that same minute carries no new information for
// these components. This wraps a component in memo() using a comparator that
// treats `now` as equal whenever it falls in the same minute, while still
// doing normal Object.is comparison on every other prop -- so it behaves
// exactly like a plain memo() except it stops re-rendering 5 times out of
// every 6 ticks for zero visual difference.
export function memoWithMinuteNow<P extends { now?: Date }>(Component: ComponentType<P>) {
  return memo(Component, (prev, next) => {
    const nowEqual = prev.now && next.now ? isSameMinute(prev.now, next.now) : Object.is(prev.now, next.now)
    if (!nowEqual) return false
    const keys = Object.keys(next) as (keyof P)[]
    for (const key of keys) {
      if (key === 'now') continue
      if (!Object.is(prev[key], next[key])) return false
    }
    return Object.keys(prev).length === keys.length
  })
}
