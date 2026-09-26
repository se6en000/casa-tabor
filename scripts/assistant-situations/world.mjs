import fs from 'node:fs'

// The family's real calendar, read only (Management API, read-only mode), so every
// situation is played against what's actually there — nothing is created or changed.

const env = Object.fromEntries(
  fs.readFileSync(new URL('../../.env.local', import.meta.url), 'utf8').split('\n')
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]),
)
export const SUPABASE_URL = env.VITE_SUPABASE_URL
export const ANON_KEY = env.VITE_SUPABASE_ANON_KEY
const PROJECT = 'sjiejymuuuqzqukyeagk'

export async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, read_only: true }),
  })
  const body = await res.json()
  if (!Array.isArray(body)) throw new Error(`Read failed: ${JSON.stringify(body).slice(0, 200)}`)
  return body
}

const OFFSET = '-04:00'
const localParts = (iso) => {
  const d = new Date(new Date(iso).getTime() - 4 * 3600e3)
  return { date: d.toISOString().slice(0, 10), hhmm: d.toISOString().slice(11, 16), weekday: d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }) }
}

/** What a situation can be built from: people, and the next three weeks of the calendar. */
export async function loadWorld(now = new Date()) {
  const family = await sql(`select id, name, full_name, role, show_on_home_sidebar from family_members order by sort_order`)
  const until = new Date(now.getTime() + 21 * 86400e3).toISOString()
  const events = await sql(`
    select e.id, e.title, e.start_time, e.end_time, e.all_day, e.event_type, e.location_name, e.address,
      coalesce((select json_agg(json_build_object('id', em.family_member_id, 'role', em.role)) from event_members em where em.event_id = e.id), '[]') as members,
      (select o.transportation_plan from event_plan_overrides o where o.event_id = e.id) as plan
    from events e
    where e.start_time >= '${now.toISOString()}' and e.start_time < '${until}'
      and e.status::text is distinct from 'cancelled' and coalesce(e.record_kind, 'single') <> 'series_template'
    order by e.start_time`)
  const nameOf = (id) => family.find((m) => m.id === id)?.name ?? null
  const shown = family.filter((m) => m.show_on_home_sidebar !== false)
  const kids = shown.filter((m) => m.role === 'child')
  const parents = shown.filter((m) => m.role === 'parent')
  const enriched = events.map((e) => {
    const members = (typeof e.members === 'string' ? JSON.parse(e.members) : e.members) ?? []
    const plan = typeof e.plan === 'string' ? JSON.parse(e.plan) : e.plan
    const drivers = [...new Set((plan?.legs ?? []).map((l) => l.driverId).filter(Boolean))].map(nameOf).filter(Boolean)
    return {
      ...e,
      local: localParts(e.start_time),
      people: members.filter((m) => m.role !== 'driver').map((m) => nameOf(m.id)).filter(Boolean),
      drivers,
      /** A trip: the calendar has a drive planned for it. */
      hasTrip: Array.isArray(plan?.legs) && plan.legs.length > 0,
      place: (e.location_name || e.address || '').split(',')[0].trim() || null,
      /** How a person would name it out loud: "softball" from "Softball: Huskies @ Wellington". */
      spoken: e.title.split(/[:@·(–—]| - /)[0].trim().toLowerCase(),
    }
  })
  const timed = enriched.filter((e) => !e.all_day && e.event_type !== 'reminder')
  const byDay = new Map()
  for (const e of timed) byDay.set(e.local.date, [...(byDay.get(e.local.date) ?? []), e])
  // Everything on a day — reminders and all-day items too — so a judge grades against all of it.
  const allOn = (date) => enriched.filter((e) => (e.all_day ? String(e.start_time).slice(0, 10) : e.local.date) === date)
    .map((e) => `${e.all_day ? 'all day' : e.local.hhmm} ${e.title}${e.event_type === 'reminder' ? ' (reminder)' : ''}${e.people.length ? ` — people: ${e.people.join(', ')}` : ''}${e.drivers.length ? ` — drivers: ${e.drivers.join(', ')}` : ''}${e.place ? ` — place: ${e.place}` : ''}`)
  const todayLocal = localParts(now.toISOString()).date
  return { now, offset: OFFSET, family, kids, parents, events: enriched, timed, byDay, allOn, todayLocal, localParts }
}
