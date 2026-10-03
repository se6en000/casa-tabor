import type { QueryClient } from '@tanstack/react-query'
// What Casa just added, shown at once (Jake, Oct 2, Kelly's gym add: "It's all about when the open button shows up on the
// chat that I can press the button and the event shows up. That was the delay"). Right after an add the server is busy
// (the trip planner, the place lookup, the iPhone sync all start at once), so waiting for the calendar to be fetched
// again left "Open it" with nothing to open. The saved add goes into the cached calendar straight away; the next fetch
// replaces it with the server's own copy.

interface FamilyLike { id: string; name: string; full_name?: string | null }

/**
 * Marks an event shown before its place has been looked up: the name is real, the address and drive aren't yet, so the
 * phone says "Working out the drive…" rather than showing a guess (Jake, Oct 2).
 */
export const PLACE_PENDING = '_placePending' as const

const byName = (family: FamilyLike[], name: unknown) => {
  const n = String(name ?? '').trim().toLowerCase()
  return family.find((m) => m.name.toLowerCase() === n || (m.full_name ?? '').toLowerCase() === n) ?? null
}

/** The added event as the calendar's cache holds it, from what was saved; null without times. */
export function optimisticEvent(id: string, args: Record<string, unknown>, family: FamilyLike[]) {
  const start = typeof args.start === 'string' ? args.start : null
  const end = typeof args.end === 'string' ? args.end : start
  if (!id || !start || !end) return null
  const names = Array.isArray(args.members) ? (args.members as unknown[]).map((n) => String(n).trim().toLowerCase()) : []
  const people = names
    .map((n) => family.find((m) => m.name.toLowerCase() === n || (m.full_name ?? '').toLowerCase() === n))
    .filter((m): m is FamilyLike => Boolean(m))
  const location = typeof args.location === 'string' && args.location.trim() ? args.location.trim() : null
  return {
    id,
    title: String(args.title ?? ''),
    description: null,
    start_time: start,
    end_time: end,
    all_day: args.all_day === true,
    has_due_date: true,
    event_type: args.event_type === 'reminder' ? 'reminder' : 'event',
    location_name: location,
    address: typeof args.address === 'string' && args.address.trim() ? args.address.trim() : null,
    lat: null,
    lng: null,
    status: 'confirmed',
    is_enriched: false,
    rrule: null,
    recurrence_master_id: null,
    record_kind: 'single',
    google_event_id: null,
    google_calendar_id: null,
    source_member_id: null,
    members: people.map((m, i) => ({ id: `${id}:${m.id}`, role: i === 0 ? 'primary' : 'attendee', family_member: m })),
    ...(location ? { [PLACE_PENDING]: true } : {}),
    enrichment: null,
    plan_override: null,
    logistics: [],
    checklist: [],
    actions: [],
  }
}

/** A cached range with the event in it once (a plain list, or a range result's `active`). */
export function withEvent(old: unknown, event: { id: string } | null): unknown {
  if (!event) return old
  if (Array.isArray(old)) return old.some((e) => e?.id === event.id) ? old : [...old, event]
  if (old && typeof old === 'object' && Array.isArray((old as { active?: unknown[] }).active)) {
    const typed = old as { active: Array<{ id?: string }> }
    return typed.active.some((e) => e?.id === event.id) ? old : { ...typed, active: [...typed.active, event] }
  }
  return old
}

type Member = { id?: string; role?: string; family_member_id?: string; family_member?: { id?: string } | null }
type CachedEvent = { id: string; members?: Member[]; [key: string]: unknown }
const memberId = (m: Member) => m.family_member_id ?? m.family_member?.id ?? null

/** A cached event as Casa's change will leave it: title, times, people; a new place marked as still being looked up. */
export function changedEvent(before: CachedEvent, args: Record<string, unknown>, family: FamilyLike[]): CachedEvent {
  const next: CachedEvent = { ...before }
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  if (str(args.title)) next.title = str(args.title)
  if (str(args.start)) next.start_time = str(args.start)
  if (str(args.end)) next.end_time = str(args.end)
  if (args.all_day === true || args.all_day === false) next.all_day = args.all_day
  if (str(args.location)) {
    next.location_name = str(args.location)
    next.address = null
    next[PLACE_PENDING] = true
  }
  const remove = new Set((Array.isArray(args.members_remove) ? args.members_remove : []).map((n) => byName(family, n)?.id).filter(Boolean))
  const add = (Array.isArray(args.members_add) ? args.members_add : []).map((n) => byName(family, n)).filter((m): m is FamilyLike => Boolean(m))
  const kept = (before.members ?? []).filter((m) => !remove.has(memberId(m) ?? ''))
  next.members = [...kept, ...add.filter((m) => !kept.some((k) => memberId(k) === m.id)).map((m) => ({ id: `${before.id}:${m.id}`, role: 'attendee', family_member: m }))]
  return next
}

/** A cached range with one event replaced (a plain list, or a range result's `active`). */
export function withChanged(old: unknown, id: string, change: (e: CachedEvent) => CachedEvent): unknown {
  const swap = (list: CachedEvent[]) => (list.some((e) => e?.id === id) ? list.map((e) => (e?.id === id ? change(e) : e)) : list)
  if (Array.isArray(old)) return swap(old as CachedEvent[])
  if (old && typeof old === 'object' && Array.isArray((old as { active?: unknown[] }).active)) {
    const typed = old as { active: CachedEvent[] }
    const active = swap(typed.active)
    return active === typed.active ? old : { ...typed, active }
  }
  return old
}

/**
 * The calendar's own cached ranges (useCalendarEvents): only these hold a day's events. Other 'events' keys are other
 * shapes — the packing list ('wall-checklist'), the wall's trip legs, the week index — and an event must never land in
 * them. A reminder also goes into the reminders list.
 */
export const RANGE_KINDS = new Set(['week', 'around', 'rolling', 'month'])
const calendarRanges = (event?: { event_type?: unknown } | null) => ({
  predicate: (q: { queryKey: readonly unknown[] }) => q.queryKey[0] === 'events' && (RANGE_KINDS.has(String(q.queryKey[1])) || (q.queryKey[1] === 'all-reminders' && event?.event_type === 'reminder')),
})
const familyOf = (qc: QueryClient) => qc.getQueryData<FamilyLike[]>(['family-members']) ?? []

/** What was just added, on the phone's calendar at once (the next fetch replaces it with the server's copy). */
export function showAdded(qc: QueryClient, id: string | null | undefined, args: Record<string, unknown>): void {
  if (!id) return
  const added = optimisticEvent(id, args, familyOf(qc))
  if (added) qc.setQueriesData(calendarRanges(added), (old: unknown) => withEvent(old, added))
}

/** A change, on the phone's calendar at once. */
export function showChanged(qc: QueryClient, id: string | null | undefined, args: Record<string, unknown>): void {
  if (!id) return
  const family = familyOf(qc)
  qc.setQueriesData(calendarRanges(), (old: unknown) => withChanged(old, id, (e) => changedEvent(e, args, family)))
}

/**
 * An edit held on screen while it saves: its steps each refresh the calendar, and a refresh that lands halfway would
 * show the old place for a moment, then the new. While `saving` runs, every fetched range gets the edit laid back over
 * it; then the server's copy takes over.
 */
export function holdWhileSaving(qc: QueryClient, id: string, change: (e: CachedEvent) => CachedEvent, saving: Promise<unknown>): Promise<unknown> {
  qc.setQueriesData({ queryKey: ['events'] }, (old: unknown) => withChanged(old, id, change))
  const cache = qc.getQueryCache()
  const stop = cache.subscribe((event) => {
    if (event.type !== 'updated' || event.query.queryKey[0] !== 'events') return
    const action = event.action as { type?: string; manual?: boolean }
    if (action.type !== 'success' || action.manual) return
    qc.setQueryData(event.query.queryKey, (old: unknown) => withChanged(old, id, change))
  })
  return saving.finally(stop)
}
