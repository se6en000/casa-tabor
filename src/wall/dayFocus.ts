// Any day (FAMILY_WALL_PLAN.md, Jake 2026-09-30): a day Casa opens can be weeks away, and the wall
// loads the week around it so he can swipe before and after ("load the week so I can swipe before
// and after the day I asked about"). Pure, so it's tested without the network.

const DAY_MS = 86_400_000

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()

/** Three days before, the day, three after. */
export function weekAround(date: Date): Date[] {
  return [-3, -2, -1, 0, 1, 2, 3].map((offset) => addDays(date, offset))
}

/** Whether the week around `focus` reaches past the wall's rolling cache (7 days back to 14 ahead). */
export function needsAroundFetch(focus: Date | null, now: Date): boolean {
  if (!focus) return false
  const week = weekAround(focus)
  const first = startOfDay(now).getTime() - 7 * DAY_MS
  const last = addDays(now, 14).getTime()
  return week[0].getTime() < first || week[6].getTime() > last
}

/**
 * The days on the strip: the usual week (null), or — for a day outside it — Today, then the week
 * around that day (Today once, when that week holds it).
 */
export function stripDates(usual: Date[], focus: Date | null, now: Date): Date[] | null {
  if (!focus || usual.some((d) => sameDay(d, focus))) return null
  const week = weekAround(focus)
  return week.some((d) => sameDay(d, now)) ? week : [startOfDay(now), ...week]
}

/** The day-ahead face's heading: the weekday within the week; with its date further out, or before today. */
export function dayHeading(date: Date, now: Date): string {
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase()
  const dated = `${weekday}, ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()}`
  const days = Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / DAY_MS)
  if (days < 0) return `LOOKING BACK · ${dated}`
  return days < 7 ? `LOOKING AHEAD · ${weekday}` : `LOOKING AHEAD · ${dated}`
}

/** The cache's events and a far week's, each once. */
export function mergeEvents<T extends { id: string }>(cached: T[], around: T[] | null): T[] {
  if (!around?.length) return cached
  const seen = new Set(cached.map((e) => e.id))
  return [...cached, ...around.filter((e) => !seen.has(e.id))]
}

/** "today", "tomorrow", "on Saturday" within the week, "on Saturday, Oct 17" further out or before today. */
export function dayWhen(date: Date, now: Date): string {
  const days = Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / DAY_MS)
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' })
  return days > 1 && days < 7 ? `on ${weekday}` : `on ${weekday}, ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}
