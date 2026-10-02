import type { WallEvent, WallMember } from '../wall/engine/types'

// The phone's month (canvas 30b): any date, not just the week. A grid of the month's days, a dot for each person with
// something on the calendar that day (not school and work — those are every weekday), and the chosen day's first line.

/** The month's cells: blanks before the 1st so it starts on its weekday (Sunday first), then 1…n. */
export function monthCells(month: Date): Array<number | null> {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  return [...Array.from({ length: first.getDay() }, () => null), ...Array.from({ length: days }, (_, i) => i + 1)]
}

const onDay = (e: WallEvent, y: number, m: number, d: number) => {
  const start = new Date(e.start_time)
  const end = e.end_time ? new Date(e.end_time) : start
  const dayStart = new Date(y, m, d)
  const dayEnd = new Date(y, m, d + 1)
  return start < dayEnd && (end > dayStart || start >= dayStart)
}

const people = (e: WallEvent) => (e.members ?? [])
  .filter((r) => r.role !== 'driver')
  .map((r) => r.family_member_id ?? r.family_member?.id ?? null)
  .filter((id): id is string => Boolean(id))

const counts = (e: WallEvent) => e.status !== 'cancelled' && e.event_type !== 'reminder'

/** Day of the month → who has something on the calendar that day, in the family's order. */
export function monthDots(events: WallEvent[], month: Date, members: Pick<WallMember, 'id'>[]): Map<number, string[]> {
  const y = month.getFullYear()
  const m = month.getMonth()
  const days = new Date(y, m + 1, 0).getDate()
  const order = members.map((p) => p.id)
  const dots = new Map<number, string[]>()
  for (let d = 1; d <= days; d++) {
    const ids = new Set<string>()
    for (const e of events) if (counts(e) && onDay(e, y, m, d)) for (const id of people(e)) ids.add(id)
    if (ids.size) dots.set(d, order.filter((id) => ids.has(id)))
  }
  return dots
}

/** The chosen day's first line: "Emme’s build night · 6:00", "+2 more", or "Nothing on the calendar". */
export function dayLine(events: WallEvent[], date: Date): string {
  const on = events
    .filter((e) => counts(e) && onDay(e, date.getFullYear(), date.getMonth(), date.getDate()))
    .sort((a, b) => Number(Boolean(b.all_day)) - Number(Boolean(a.all_day)) || new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
  if (on.length === 0) return 'Nothing on the calendar'
  const first = on[0]
  const time = first.all_day ? 'all day' : new Date(first.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/, '')
  return `${first.title} · ${time}${on.length > 1 ? ` · +${on.length - 1} more` : ''}`
}
