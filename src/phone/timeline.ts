// Where we are in the day on the phone (canvas 30a; Jake, Oct 2: "an indicator of where we are time wise in the day.
// What's past should be obvious. What's come up right in front of me"). Today's list splits at NOW: what has started
// goes above the line — the last two in view, the rest folded into "↑ N earlier" — finished ones faded; the first
// thing after now is lifted with how long until it.

export interface TimedItem {
  id: string
  at: Date
  end: Date
  title: string
  /** "All day" items head the list and aren't on either side of now. */
  time: string
}

export interface DayTimeline<T extends TimedItem> {
  allDay: T[]
  /** Started, folded away: "↑ 4 earlier". */
  folded: T[]
  /** Started, the last few kept in view above the line. */
  before: T[]
  /** Not started yet; the first is "next". */
  after: T[]
  nextId: string | null
}

/** How many of what has started stay in view above the NOW line. */
export const KEEP_IN_VIEW = 2

export function dayTimeline<T extends TimedItem>(items: T[], now: Date, keep = KEEP_IN_VIEW): DayTimeline<T> {
  const allDay = items.filter((i) => i.time === 'All day')
  const timed = items.filter((i) => i.time !== 'All day')
  const started = timed.filter((i) => i.at.getTime() <= now.getTime())
  const after = timed.filter((i) => i.at.getTime() > now.getTime())
  const cut = Math.max(0, started.length - keep)
  return { allDay, folded: started.slice(0, cut), before: started.slice(cut), after, nextId: after[0]?.id ?? null }
}

/** Over already (faded), as opposed to still going (school until 2:00). */
export const isPast = (item: Pick<TimedItem, 'end'>, now: Date) => item.end.getTime() <= now.getTime()

/** "In 25 min", "In 1 hr", "In 1 hr 25 min". */
export function untilWords(at: Date, now: Date): string {
  const minutes = Math.max(1, Math.round((at.getTime() - now.getTime()) / 60_000))
  if (minutes < 60) return `In ${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `In ${h} hr${m ? ` ${m} min` : ''}`
}

/** "↑ 4 earlier · Palm Beach Public, Bak Middle School, …" */
export function foldLabel(folded: Pick<TimedItem, 'title'>[]): string {
  const names = [...new Set(folded.map((i) => i.title.split(/[:·]/)[0].trim()))]
  return `${folded.length} earlier · ${names.join(', ')}`
}
