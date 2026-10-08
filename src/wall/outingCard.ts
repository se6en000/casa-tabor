import type { WallEvent, WallMember } from './engine/types'
import type { Outing } from '../../supabase/functions/_shared/scout.mjs'

// An outing's card (canvas 77; Jake, Oct 8: "build it"): Add to calendar — who's going, when, leave by, that evening, a
// reminder to get tickets — and the event it adds.

/** What its page said (the scout function's `details`): facts by label, what it didn't say, its tickets link, when it ends. */
export interface OutingDetails {
  facts: Array<{ label: string; text: string }>
  not_said?: string[]
  ticket_url?: string | null
  ends?: string | null
  read_at?: string | null
}

type Who = Pick<WallMember, 'id' | 'name' | 'role'>

/** Who goes by default: the two of them for an evening out, a workout, a gig, a place; the family for a family one. */
export function goingFor(kind: string, members: Who[]): string[] {
  const parents = members.filter((m) => m.role === 'parent').map((m) => m.id)
  if (kind !== 'family') return parents
  return members.filter((m) => m.role === 'parent' || m.role === 'child').filter((m) => m.name !== 'Tabor Family').map((m) => m.id)
}

const startOf = (o: Pick<Outing, 'when'>): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/.exec(o.when ?? '')
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 18), Number(m[5] ?? 0)) : null
}
const clockOf = (d: Date) => `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`

/** "5:45 · 8 min drive": its start, less the drive and ten minutes; null without a drive time. */
export function leaveBy(o: Pick<Outing, 'when' | 'drive_min'>): string | null {
  const start = startOf(o)
  if (!start || !o.drive_min) return null
  const at = new Date(start.getTime() - (o.drive_min + 7) * 60_000)
  const rounded = new Date(Math.floor(at.getTime() / (5 * 60_000)) * 5 * 60_000)
  return `${clockOf(rounded)} · ${o.drive_min} min drive`
}

const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

/** A reminder to get tickets four days before (tomorrow if it's close) — for a ticketed one only. */
export function ticketsDue(o: Pick<Outing, 'when' | 'free'>, details: Pick<OutingDetails, 'ticket_url'> | null, today: string): { due: string; day: string } | null {
  if (!o.when || o.free === true || (o.free !== false && !details?.ticket_url)) return null
  const day = o.when.slice(0, 10)
  if (day <= today) return null
  const tomorrow = addDays(today, 1)
  const fourBefore = addDays(day, -4)
  const due = fourBefore > tomorrow ? fourBefore : tomorrow
  return { due, day: due === tomorrow ? 'tomorrow' : new Date(`${due}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }) }
}

/** That evening: what the ones going already have on around it, or that nothing is. */
export function eveningLine(o: Pick<Outing, 'when'>, going: string[], events: WallEvent[], members: Who[]): string {
  const start = startOf(o)
  const names = going.map((id) => members.find((m) => m.id === id)?.name).filter(Boolean) as string[]
  if (!start) return ''
  const from = start.getTime() - 2 * 3600_000
  const to = start.getTime() + 4 * 3600_000
  const clash = events.filter((e) => !e.all_day && e.event_type !== 'reminder' && new Date(e.start_time).getTime() < to && new Date(e.end_time).getTime() > from)
    .map((e) => ({ e, who: (e.members ?? []).map((x) => x.family_member_id ?? x.family_member?.id).filter((id): id is string => Boolean(id) && going.includes(id!)) }))
    .filter((c) => c.who.length)
  if (!clash.length) return `Nothing else on for ${names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}` : names[0] ?? 'them'}`
  return clash.slice(0, 2).map((c) => `${c.who.map((id) => members.find((m) => m.id === id)?.name).join(' & ')}: ${c.e.title} at ${clockOf(new Date(c.e.start_time))}`).join(' · ')
}

/** The event Add it makes: its time (its page's end, else two hours), its place, who's going, what to know in its notes. */
export function addArgs(o: Outing, details: OutingDetails | null, going: string[], members: Who[]): Record<string, unknown> {
  const start = startOf(o) ?? new Date()
  const endM = /^(\d{2}):(\d{2})$/.exec(details?.ends ?? '')
  const end = endM ? new Date(start.getFullYear(), start.getMonth(), start.getDate(), Number(endM[1]), Number(endM[2])) : new Date(start.getTime() + 2 * 3600_000)
  const notes = [
    ...(details?.facts ?? []).filter((f) => /ticket|price|cost/i.test(f.label)).map((f) => `${f.label}: ${f.text}`),
    ...(details?.ticket_url ? [`Tickets: ${details.ticket_url}`] : []),
    ...(o.url ? [`Its page: ${o.url}`] : []),
  ]
  return {
    title: o.title,
    start: start.toISOString(),
    end: (end > start ? end : new Date(start.getTime() + 2 * 3600_000)).toISOString(),
    event_type: 'event',
    ...((o.address || o.place) ? { location: o.address || o.place } : {}),
    members: going.map((id) => members.find((m) => m.id === id)?.name).filter(Boolean),
    ...(notes.length ? { notes: notes.join('\n') } : {}),
  }
}
