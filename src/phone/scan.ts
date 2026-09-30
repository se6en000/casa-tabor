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

// P3.24, by improving Scan it (Jake, 2026-09-30): what to bring or wear is packing for its event, and a match
// already on the calendar gets what's new added to it — saved through the plan engine (event_details, pack).

// The scanner names a packing item's event by its title (live, 2026-09-30, it once added ", 2026-10-01").
const sameTitle = (title: string | null | undefined, said: string | null | undefined) => {
  const t = (title ?? '').trim().toLowerCase()
  const s = (said ?? '').trim().toLowerCase()
  return Boolean(t) && (s === t || s.startsWith(`${t},`) || s.startsWith(`${t} (`) || s.startsWith(`${t} -`))
}

/** The flyer's events (with reminders), and each event's packing; packing with no event of its own is a reminder, as before. */
export function scanGroups<T extends Pick<ScannedItem, 'id' | 'type' | 'title'> & { for_title?: string | null }>(items: T[]): { events: T[]; packs: Record<string, T[]> } {
  const events = items.filter((i) => i.type !== 'prep')
  const onlyEvents = events.filter((i) => i.type === 'event')
  const packs: Record<string, T[]> = {}
  const loose: T[] = []
  for (const p of items.filter((i) => i.type === 'prep')) {
    const owner = onlyEvents.find((e) => sameTitle(e.title, p.for_title)) ?? (onlyEvents.length === 1 ? onlyEvents[0] : null)
    if (owner) (packs[owner.id] ??= []).push(p)
    else loose.push({ ...p, type: 'reminder' })
  }
  return { events: [...events, ...loose], packs }
}

export type ScanPlanItem =
  | { id: string; kind: 'event_details'; event_id: string; title: string; changes: { start?: string; end?: string; place?: string; notes?: string; people?: string[] } }
  | { id: string; kind: 'pack'; label: string; event_id: string }

/**
 * What the save hands the plan engine (after the new events are created): what's new onto each ticked match
 * already on the calendar, and each ticked packing line onto its event, old or new.
 */
export function scanPlanItems({ items, already, created, members, utcOffset }: {
  items: ScannedItem[]
  already: Record<string, { id: string; title: string; start_time: string }>
  created: Record<string, string>
  members: Array<{ id: string; name: string }>
  utcOffset: string
}): ScanPlanItem[] {
  const { events, packs } = scanGroups(items)
  const out: Array<ScanPlanItem extends infer T ? (T extends unknown ? Omit<T, 'id'> : never) : never> = []
  for (const ev of events) {
    const match = already[ev.id]
    if (!ev.selected || !match) continue
    const changes: Extract<ScanPlanItem, { kind: 'event_details' }>['changes'] = {}
    if (!ev.all_day && ev.start_time_local) {
      changes.start = `${ev.date}T${ev.start_time_local}:00${utcOffset}`
      if (ev.end_time_local && ev.end_time_local > ev.start_time_local) changes.end = `${ev.date}T${ev.end_time_local}:00${utcOffset}`
    }
    const place = (ev.location_name || ev.address || '').trim()
    if (place) changes.place = place
    if (ev.notes?.trim()) changes.notes = ev.notes.trim()
    const people = ev.selectedMemberIds.map((id) => members.find((m) => m.id === id)?.name).filter((n): n is string => Boolean(n))
    if (people.length) changes.people = people
    if (Object.keys(changes).length) out.push({ kind: 'event_details', event_id: match.id, title: match.title, changes })
  }
  for (const ev of events) {
    const target = ev.selected ? already[ev.id]?.id ?? created[ev.id] : null
    if (!target) continue
    for (const p of packs[ev.id] ?? []) if (p.selected !== false) out.push({ kind: 'pack', label: p.title.trim(), event_id: target })
  }
  return out.map((item, n) => ({ id: `i${n + 1}`, ...item }) as ScanPlanItem)
}
