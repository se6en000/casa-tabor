/**
 * One-time migration: convert legacy `event_enrichments.what_to_bring`
 * string-array data into structured `event_checklist_items` rows.
 *
 * Idempotent: only processes events with a non-empty `what_to_bring` and
 * zero existing `event_checklist_items` rows, so re-running is a no-op for
 * already-migrated events. Never deletes or modifies `what_to_bring` itself.
 *
 * Dry-run by default. Pass --apply to write.
 *
 *   node scripts/migrate-what-to-bring-to-checklist.mjs          # dry run
 *   node scripts/migrate-what-to-bring-to-checklist.mjs --apply  # write
 */
import { createClient } from '@supabase/supabase-js'
import { whatToBringToChecklistRows } from '../src/lib/checklistMigration.ts'

const apply = process.argv.includes('--apply')

const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
}

const sb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

async function allCandidateEnrichments() {
  const rows = []
  for (let from = 0; ; from += 500) {
    const { data, error } = await sb
      .from('event_enrichments')
      .select('event_id, what_to_bring')
      .not('what_to_bring', 'is', null)
      .order('event_id')
      .range(from, from + 499)
    if (error) throw error
    rows.push(...data)
    if (data.length < 500) break
  }
  return rows.filter((row) => Array.isArray(row.what_to_bring) && row.what_to_bring.length > 0)
}

async function existingChecklistEventIds() {
  const ids = new Set()
  for (let from = 0; ; from += 500) {
    const { data, error } = await sb
      .from('event_checklist_items')
      .select('event_id')
      .order('event_id')
      .range(from, from + 499)
    if (error) throw error
    for (const row of data) ids.add(row.event_id)
    if (data.length < 500) break
  }
  return ids
}

const [candidates, alreadyMigrated] = await Promise.all([
  allCandidateEnrichments(),
  existingChecklistEventIds(),
])

const toMigrate = candidates.filter((row) => !alreadyMigrated.has(row.event_id))

console.log(`Found ${candidates.length} event(s) with non-empty what_to_bring.`)
console.log(`${candidates.length - toMigrate.length} already have checklist rows (skipped, idempotent).`)
console.log(`${toMigrate.length} event(s) need migration.`)

if (toMigrate.length === 0) {
  console.log('Nothing to do.')
  process.exit(0)
}

let inserted = 0
for (const row of toMigrate) {
  const drafts = whatToBringToChecklistRows(row.what_to_bring)
  if (drafts.length === 0) continue
  console.log(`${apply ? 'Inserting' : '[dry-run] would insert'} ${drafts.length} row(s) for event ${row.event_id}: ${drafts.map((d) => d.label).join(', ')}`)
  if (apply) {
    const { error } = await sb
      .from('event_checklist_items')
      .insert(drafts.map((d) => ({ event_id: row.event_id, ...d })))
    if (error) throw error
  }
  inserted += drafts.length
}

console.log(`${apply ? 'Inserted' : '[dry-run] would insert'} ${inserted} checklist row(s) across ${toMigrate.length} event(s).`)
if (!apply) {
  console.log('Dry run only — re-run with --apply to write these rows.')
}
