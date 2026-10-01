// Household chores (table household_chores; Jake, 2026-10-01: "a recurring reminder for chores … to see on the wall
// as reminders for that day, maybe show up on the score for that day" and "kids chores as well, like change the cat
// litter every 4 weeks"). Never synced to Google.

export interface WallChore {
  id: string
  title: string
  /** Who does it; null = nobody yet. */
  member_id: string | null
  /** Who it's about ("Give Liv her meds"). */
  for_member_id: string | null
  /** 0 = Sunday … 6 = Saturday. */
  days_of_week: number[]
  /** "20:00:00" */
  time_local: string
  minutes: number
  enabled: boolean
  /** Every N weeks, counted from the week of `starts_on`. */
  every_weeks: number
  /** YYYY-MM-DD */
  starts_on: string
}

const WEEK = 7 * 86_400_000
const sundayOf = (d: Date) => {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  s.setDate(s.getDate() - s.getDay())
  return s
}

/** Whether the chore falls on this date. */
export function choreOnDay(chore: WallChore, date: Date): boolean {
  if (!chore.enabled || !chore.days_of_week.includes(date.getDay())) return false
  const [y, m, d] = chore.starts_on.split('-').map(Number)
  const start = new Date(y, m - 1, d)
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  if (day < start) return false
  const weeks = Math.round((sundayOf(day).getTime() - sundayOf(start).getTime()) / WEEK)
  return weeks % Math.max(1, chore.every_weeks || 1) === 0
}

/** Its time on that date. */
export function choreAt(chore: WallChore, date: Date): Date {
  const [h, m] = chore.time_local.split(':').map(Number)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m)
}
