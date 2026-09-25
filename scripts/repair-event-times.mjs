#!/usr/bin/env node
// One-off repair (approved by Jake 2026-09-25, FAMILY_WALL_PLAN.md P1.4): fix the
// AI-written times already stored before enrich-event started validating them.
// Uses the same rules as the live check (supabase/functions/_shared/event-time-sanity.mjs):
//   - event_enrichments.departure_time: keep if 0–6 h before the start and on time,
//     else start − drive time, else null
//   - event_logistics.time: keep if within 12 h of the event, else the same clock
//     time moved onto the event's date, else null
//
//   node scripts/repair-event-times.mjs            # preview: counts and examples, changes nothing
//   node scripts/repair-event-times.mjs --apply    # back up the current values, then write in one transaction
//
// Each row is only changed if it still holds the value read moments earlier.
// Reads SUPABASE_ACCESS_TOKEN from .env.local (never printed).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { plausibleDepartureIso, sanitizeStepTimeIso } from '../supabase/functions/_shared/event-time-sanity.mjs'

const PROJECT_REF = 'sjiejymuuuqzqukyeagk'
const apply = process.argv.includes('--apply')

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]),
)
if (!env.SUPABASE_ACCESS_TOKEN) throw new Error('SUPABASE_ACCESS_TOKEN missing from .env.local')

async function query(sql, readOnly) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql, read_only: readOnly }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`query failed (${res.status}): ${text.slice(0, 500)}`)
  return JSON.parse(text)
}

async function planFixes() {
  const enrichments = await query(`
    select en.id, en.departure_time, en.drive_time_mins, e.start_time
    from event_enrichments en join events e on e.id = en.event_id
    where en.departure_time is not null`, true)
  const steps = await query(`
    select l.id, l.time, e.start_time, e.end_time
    from event_logistics l join events e on e.id = l.event_id
    where l.time is not null`, true)
  const same = (a, b) => (a == null && b == null) || (a != null && b != null && Date.parse(a) === Date.parse(b))
  return {
    enrichments,
    steps,
    departureFixes: enrichments
      .map((r) => ({ id: r.id, old: r.departure_time, next: plausibleDepartureIso(r.departure_time, r.start_time, r.drive_time_mins) }))
      .filter((f) => !same(f.old, f.next)),
    stepFixes: steps
      .map((r) => ({ id: r.id, old: r.time, next: sanitizeStepTimeIso(r.time, r.start_time, r.end_time) }))
      .filter((f) => !same(f.old, f.next)),
  }
}

const { enrichments, steps, departureFixes, stepFixes } = await planFixes()

console.log(`Departures: ${departureFixes.length} of ${enrichments.length} change (${departureFixes.filter((f) => !f.next).length} cleared)`)
console.log(`Step times: ${stepFixes.length} of ${steps.length} change (${stepFixes.filter((f) => !f.next).length} cleared)`)
for (const f of departureFixes.slice(0, 3)) console.log(`  departure ${f.old} -> ${f.next}`)
for (const f of stepFixes.slice(0, 3)) console.log(`  step      ${f.old} -> ${f.next}`)

if (!apply) {
  console.log('\nPreview only. Run with --apply to write these changes.')
  process.exit(0)
}
if (departureFixes.length + stepFixes.length === 0) {
  console.log('Nothing to change.')
  process.exit(0)
}

const backupDir = path.join(os.homedir(), 'casa-tabor-backups')
fs.mkdirSync(backupDir, { recursive: true })
const backupFile = path.join(backupDir, `event-time-repair-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
fs.writeFileSync(backupFile, JSON.stringify({ departureFixes, stepFixes }, null, 1))
console.log(`\nBackup of every old value: ${backupFile}`)

const literal = (v) => (v == null ? 'null::timestamptz' : `'${new Date(v).toISOString()}'::timestamptz`)
const values = (rows) => rows.map((r) => `('${r.id}'::uuid, ${literal(r.old)}, ${literal(r.next)})`).join(',\n')
const statements = []
if (departureFixes.length) {
  statements.push(`with v(id, old_t, new_t) as (values ${values(departureFixes)})
update event_enrichments en set departure_time = v.new_t from v where en.id = v.id and en.departure_time = v.old_t`)
}
if (stepFixes.length) {
  statements.push(`with v(id, old_t, new_t) as (values ${values(stepFixes)})
update event_logistics l set time = v.new_t from v where l.id = v.id and l.time = v.old_t`)
}
await query(`begin;\n${statements.join(';\n')};\ncommit;`, false)

// Confirm with the same rules: nothing should be left to change (rows edited meanwhile aside).
const left = await planFixes()
console.log(`Applied. Left to change now: ${left.departureFixes.length} departures, ${left.stepFixes.length} step times.`)
