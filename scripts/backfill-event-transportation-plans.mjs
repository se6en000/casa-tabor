import { createClient } from '@supabase/supabase-js'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  classifyTransportationDefault,
  mayReplaceTransportationPlan,
} from '../supabase/functions/_shared/event-transportation-defaults.mjs'

const apply = process.argv.includes('--apply')
const snapshotFlagIndex = process.argv.indexOf('--snapshot')
const snapshotPath = snapshotFlagIndex >= 0 ? process.argv[snapshotFlagIndex + 1] : null
if (apply && !snapshotPath) {
  throw new Error('--apply requires --snapshot <path> so every affected row can be restored.')
}
const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
}

const sb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

async function allRows() {
  const rows = []
  for (let from = 0; ; from += 500) {
    const { data, error } = await sb
      .from('events')
      .select(`
        id, title, start_time, end_time, all_day, event_type, status, deleted_at,
        location_name, address, lat, lng, record_kind, series_id,
        event_enrichments(category),
        event_plan_overrides(
          waits, driver_overrides, mode_override, transportation_plan,
          verified, location_signature
        )
      `)
      .is('deleted_at', null)
      .neq('event_type', 'reminder')
      .order('start_time')
      .range(from, from + 499)
    if (error) throw error
    rows.push(...data)
    if (data.length < 500) break
  }
  return rows
}

const events = await allRows()
const candidates = events.flatMap((event) => {
  const enrichment = Array.isArray(event.event_enrichments)
    ? event.event_enrichments[0] ?? null
    : event.event_enrichments
  const override = Array.isArray(event.event_plan_overrides)
    ? event.event_plan_overrides[0] ?? null
    : event.event_plan_overrides
  if (!mayReplaceTransportationPlan(override?.transportation_plan ?? null)) return []
  const legacy = {
    waits: override?.waits ?? null,
    driver_overrides: override?.driver_overrides ?? {},
    mode_override: override?.mode_override ?? null,
  }
  const classification = classifyTransportationDefault({
    ...event,
    category: enrichment?.category ?? null,
  }, legacy)
  return classification.kind === 'appointment'
    || classification.kind === 'pickup'
    || classification.kind === 'no_route'
    ? [{ event, classification }]
    : []
})

const summary = candidates.reduce((counts, candidate) => {
  const key = candidate.classification.kind === 'no_route'
    ? `no_route:${candidate.classification.reason}`
    : candidate.classification.kind
  counts[key] = (counts[key] ?? 0) + 1
  if (!candidate.event.address?.trim()) counts.missing_address = (counts.missing_address ?? 0) + 1
  if (candidate.event.series_id) counts.recurring_occurrence = (counts.recurring_occurrence ?? 0) + 1
  return counts
}, {})

console.log(JSON.stringify({
  mode: apply ? 'apply' : 'dry-run',
  scanned: events.length,
  candidates: candidates.length,
  summary,
}, null, 2))

if (!apply) process.exit(0)

const manualPlanSnapshot = Object.fromEntries(events.flatMap((event) => {
  const override = Array.isArray(event.event_plan_overrides)
    ? event.event_plan_overrides[0] ?? null
    : event.event_plan_overrides
  return mayReplaceTransportationPlan(override?.transportation_plan ?? null)
    ? []
    : [[event.id, override.transportation_plan]]
}))
await writeFile(resolve(snapshotPath), JSON.stringify({
  created_at: new Date().toISOString(),
  candidates: candidates.map(({ event, classification }) => ({ event, classification })),
  protected_manual_plans: manualPlanSnapshot,
}, null, 2), { flag: 'wx' })

const results = []
for (const [index, candidate] of candidates.entries()) {
  const { data, error } = await sb.functions.invoke('ensure-event-transportation-plan', {
    body: { event_id: candidate.event.id },
  })
  if (error || data?.error) {
    throw new Error(
      `Transportation backfill failed for ${candidate.event.id}: ${error?.message ?? data.error}`,
    )
  }
  results.push(data)
  if ((index + 1) % 25 === 0) {
    console.log(`Processed ${index + 1}/${candidates.length}`)
  }
}

const generated = results.filter((result) => result?.generated === true).length
const manualSkips = results.filter((result) => result?.skipped === 'manual_plan').length
const unresolved = results.filter((result) => (
  result?.skipped === 'no_place_match'
  || result?.skipped === 'missing_location_query'
)).length
if (manualSkips > 0 || unresolved > 0) {
  throw new Error(`Backfill stopped verification: manual_skips=${manualSkips}, unresolved=${unresolved}.`)
}

const afterEvents = await allRows()
const afterById = new Map(afterEvents.map((event) => [event.id, event]))
for (const candidate of candidates) {
  const after = afterById.get(candidate.event.id)
  const override = Array.isArray(after?.event_plan_overrides)
    ? after.event_plan_overrides[0] ?? null
    : after?.event_plan_overrides
  const plan = override?.transportation_plan ?? null
  if (candidate.classification.kind === 'no_route') {
    if (plan !== null) throw new Error(`No-route event ${candidate.event.id} received an invented plan.`)
    continue
  }
  const expectedLegs = candidate.classification.kind === 'pickup' ? 1 : 2
  if (plan?.source !== 'generated' || plan?.legs?.length !== expectedLegs) {
    throw new Error(`Generated plan verification failed for ${candidate.event.id}.`)
  }
}
for (const [eventId, beforePlan] of Object.entries(manualPlanSnapshot)) {
  const after = afterById.get(eventId)
  const override = Array.isArray(after?.event_plan_overrides)
    ? after.event_plan_overrides[0] ?? null
    : after?.event_plan_overrides
  if (JSON.stringify(override?.transportation_plan ?? null) !== JSON.stringify(beforePlan)) {
    throw new Error(`Protected manual plan changed for ${eventId}.`)
  }
}

console.log(JSON.stringify({
  applied: results.length,
  generated,
  manual_skips: manualSkips,
  unresolved,
  verified_candidates: candidates.length,
  verified_manual_plans: Object.keys(manualPlanSnapshot).length,
  snapshot: resolve(snapshotPath),
}, null, 2))
