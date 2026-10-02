// What Casa just added, shown at once (Jake, Oct 2, Kelly's gym add: "It's all about when the open button shows up on the
// chat that I can press the button and the event shows up. That was the delay"). Right after an add the server is busy
// (the trip planner, the place lookup, the iPhone sync all start at once), so waiting for the calendar to be fetched
// again left "Open it" with nothing to open. The saved add goes into the cached calendar straight away; the next fetch
// replaces it with the server's own copy.

interface FamilyLike { id: string; name: string; full_name?: string | null }

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
    address: null,
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
