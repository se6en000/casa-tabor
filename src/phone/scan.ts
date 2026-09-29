import type { ScannedItem } from '../utils/documentScanner'

// Scan it (board 05e): what the scanner read, as the calendar's own create call —
// times as printed on the flyer, in local time; nothing filled in that wasn't there.

const DAY_MS = 24 * 60 * 60 * 1000

const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00`)

/** `execute-ai-action` create_event arguments for one ticked scanned item. */
export function scanArgs(item: ScannedItem, members: Array<{ id: string; name: string }>): Record<string, unknown> {
  const location = (item.address || item.location_name || '').trim()
  const notes = item.notes?.trim()
  let start: string
  let end: string
  if (item.all_day) {
    const day = at(item.date, '00:00')
    start = day.toISOString()
    end = new Date(day.getTime() + DAY_MS).toISOString()
  } else if (item.start_time_local) {
    const s = at(item.date, item.start_time_local)
    const e = item.end_time_local ? at(item.date, item.end_time_local) : null
    start = s.toISOString()
    end = (e && e > s ? e : new Date(s.getTime() + (item.type === 'reminder' ? 15 : 60) * 60 * 1000)).toISOString()
  } else {
    start = item.start_time
    end = item.end_time
  }
  return {
    title: item.title.trim(),
    start,
    end,
    event_type: item.type,
    ...(item.all_day ? { all_day: true } : {}),
    ...(location ? { location } : {}),
    ...(notes ? { notes } : {}),
    members: item.selectedMemberIds.map((id) => members.find((m) => m.id === id)?.name).filter(Boolean),
  }
}

const time = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

/** "Sat, Oct 10 · 11:00 AM – 3:00 PM" for the review list. */
export function scanWhen(item: ScannedItem): string {
  const day = at(item.date, '12:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  if (item.all_day) return `${day} · All day`
  if (!item.start_time_local) {
    const s = new Date(item.start_time)
    return Number.isNaN(s.getTime()) ? day : `${day} · ${s.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  }
  return `${day} · ${time(item.start_time_local)}${item.end_time_local ? ` – ${time(item.end_time_local)}` : ''}`
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dayLabel = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  const day = new Date(y, m - 1, d)
  return `${DAYS[day.getDay()]} ${MONTHS[m - 1]} ${d}`
}
const clock12 = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

/** What went in, said plainly (after adding): "2026 Strings Festival · Sat Oct 24 · 3:00 PM". */
export function addedLine(item: ScannedItem): string {
  const when = item.type === 'reminder' && !item.start_time_local ? 'reminder' : item.all_day || !item.start_time_local ? 'all day' : clock12(item.start_time_local)
  return `${item.title.trim()} · ${dayLabel(item.date)} · ${when}`
}

const words = (t: string) => new Set(t.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2))
const localDate = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Something already on the calendar that this scanned item probably is: the same day, and most of
 * the smaller title's words in the other (so a second scan of the same flyer is caught, but another
 * event that day isn't).
 */
export function similarEvent<T extends { id: string; title: string; start_time: string }>(item: ScannedItem, candidates: T[]): T | null {
  const mine = words(item.title)
  if (mine.size === 0) return null
  return candidates.find((c) => {
    if (localDate(c.start_time) !== item.date) return false
    const theirs = words(c.title)
    const shared = [...mine].filter((w) => theirs.has(w)).length
    return shared / Math.min(mine.size, theirs.size || 1) >= 0.6
  }) ?? null
}
