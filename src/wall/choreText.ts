import { choreOnDay, type WallChore } from './engine/chores.ts'

// How a chore reads on a person's page and in its sheet (canvas 20a/20b): "Every 4 weeks · Sun 10:00 AM · next Sun,
// Oct 4", and the dates its schedule works out to.

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function choreTime(time: string): string {
  const [h, m] = time.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

export function choreDays(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b)
  if (sorted.length === 7) return 'Every day'
  if (sorted.join() === '1,2,3,4,5') return 'Weekdays'
  if (sorted.join() === '0,6') return 'Weekends'
  return sorted.map((d) => DAY[d]).join(' & ').replace(/ & (?=.* & )/g, ', ')
}

/** The next `count` dates it falls on, from `from` (today included). */
export function nextChoreDates(chore: WallChore, from: Date, count: number): Date[] {
  const out: Date[] = []
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  for (let i = 0; i < 400 && out.length < count; i++, d.setDate(d.getDate() + 1)) {
    if (choreOnDay(chore, d)) out.push(new Date(d))
  }
  return out
}

/** "Every 4 weeks · Sun 10:00 AM · next Sun, Oct 4" (a weekly chore just names its days). */
export function choreDetail(chore: WallChore, today: Date): string {
  const often = chore.every_weeks > 1 ? `Every ${chore.every_weeks} weeks · ${choreDays(chore.days_of_week)}` : choreDays(chore.days_of_week)
  const [next] = nextChoreDates(chore, today, 1)
  const when = next ? ` · next ${next.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}` : ''
  return `${often} ${choreTime(chore.time_local)}${when}`
}

/** A blank chore for someone: weekly, at 8 PM, today's weekday, from today. */
export function newChore(memberId: string | null, today: Date): WallChore {
  return { id: '', title: '', member_id: memberId, for_member_id: null, days_of_week: [today.getDay()], time_local: '20:00:00', minutes: 10, enabled: true, every_weeks: 1, starts_on: ymd(today) }
}
