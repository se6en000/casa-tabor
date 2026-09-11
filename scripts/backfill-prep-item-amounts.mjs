// One-time backfill for the new prep_items.amount_cents column (see migration
// 20260911181708_prep_item_vendor_spend.sql). Historical rows never had a real
// extracted amount -- this re-runs the same $-amount regex the UI has always
// used for display (extractAmount in src/utils/actionInspectionSynthesis.ts)
// against each row's description/event_title, so the new vendor-spend summary
// has *some* history to show instead of starting empty. Marked amount_estimated
// so the UI can show these as approximate rather than as precise as amounts the
// Gmail classifier extracts directly going forward.
//
// Idempotent and additive-only: only ever fills rows where amount_cents IS NULL,
// never touches a row that already has one. Safe to re-run.
//
// Usage:
//   node scripts/backfill-prep-item-amounts.mjs                 # dry run, prints what would change
//   node scripts/backfill-prep-item-amounts.mjs --apply          # writes amount_cents/amount_estimated

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const apply = process.argv.includes('--apply')

const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const index = line.indexOf('=')
      return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, '')]
    }),
)

const supabaseUrl = env.VITE_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY
if (!supabaseUrl || !key) {
  throw new Error('VITE_SUPABASE_URL and a Supabase key are required in .env.local')
}

const sb = createClient(supabaseUrl, key, { auth: { persistSession: false } })

// Same pattern as extractAmount() in src/utils/actionInspectionSynthesis.ts.
function extractAmountCents(text) {
  if (!text) return null
  const match = text.match(/\$[\d,]+(?:\.\d{2})?/)
  if (!match) return null
  const numeric = Number(match[0].replace(/[$,]/g, ''))
  if (!Number.isFinite(numeric) || numeric <= 0) return null
  return Math.round(numeric * 100)
}

async function fetchCandidateRows() {
  const rows = []
  for (let from = 0; ; from += 500) {
    const { data, error } = await sb
      .from('prep_items')
      .select('id, description, event_title, attention_vendor')
      .is('amount_cents', null)
      .order('created_at')
      .range(from, from + 499)
    if (error) throw error
    rows.push(...data)
    if (data.length < 500) break
  }
  return rows
}

const rows = await fetchCandidateRows()
const updates = rows
  .map((row) => ({
    id: row.id,
    vendor: row.attention_vendor,
    amount_cents: extractAmountCents(row.description) ?? extractAmountCents(row.event_title),
  }))
  .filter((row) => row.amount_cents != null)

console.log(`Scanned ${rows.length} prep_items with no amount_cents.`)
console.log(`Found a dollar amount in ${updates.length} of them.`)
console.log('Sample:', updates.slice(0, 10))

if (!apply) {
  console.log('\nDry run only -- re-run with --apply to write amount_cents/amount_estimated.')
  process.exit(0)
}

let applied = 0
for (const update of updates) {
  const { error } = await sb
    .from('prep_items')
    .update({ amount_cents: update.amount_cents, amount_estimated: true })
    .eq('id', update.id)
    .is('amount_cents', null) // never overwrite a value written since this script started reading
  if (error) {
    console.error(`Failed to update ${update.id}:`, error.message)
    continue
  }
  applied += 1
}
console.log(`\nApplied amount_cents to ${applied}/${updates.length} rows.`)
