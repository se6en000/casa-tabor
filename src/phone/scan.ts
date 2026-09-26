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
