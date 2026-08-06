// Backfills existing saved_places rows that have the address-splitting bug:
// the full Google-formatted address dumped into `address` with `city`,
// `state`, `zip` left blank (e.g. address="238 Edgewood Dr, West Palm Beach,
// FL 33405" city=null state=null zip=null). Re-verifies each row through
// Google Places Text Search and splits it into address=street,
// city/state/zip, matching the shape new rows get from DirectoryPlaceInput
// and execute-ai-action's associate_contact_place fix.
//
// Usage:
//   node scripts/backfill-saved-place-address-components.mjs                # dry run, prints a report
//   node scripts/backfill-saved-place-address-components.mjs --apply --snapshot /tmp/saved-places-snapshot.json
import { createClient } from '@supabase/supabase-js'
import { writeFile } from 'node:fs/promises'
import { verifyPlaceAddress } from '../supabase/functions/_shared/verify-place-address.mjs'

const apply = process.argv.includes('--apply')
const snapshotFlagIndex = process.argv.indexOf('--snapshot')
const snapshotPath = snapshotFlagIndex >= 0 ? process.argv[snapshotFlagIndex + 1] : null
if (apply && !snapshotPath) {
  throw new Error('--apply requires --snapshot <path> so every affected row can be restored.')
}

const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const mapsApiKey = process.env.GOOGLE_MAPS_API_KEY
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
}
if (!mapsApiKey) {
  throw new Error('GOOGLE_MAPS_API_KEY is required to re-verify addresses.')
}

const sb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

async function brokenRows() {
  const rows = []
  for (let from = 0; ; from += 500) {
    const { data, error } = await sb
      .from('saved_places')
      .select('id, name, address, city, state, zip, lat, lng')
      .not('address', 'is', null)
      .neq('address', '')
      .or('city.is.null,state.is.null,zip.is.null')
      .range(from, from + 499)
    if (error) throw error
    rows.push(...data)
    if (data.length < 500) break
  }
  return rows
}

const rows = await brokenRows()
console.log(`Found ${rows.length} saved_places rows with a missing city/state/zip.`)

const results = []
for (const row of rows) {
  const query = [row.name, row.address].filter(Boolean).join(', ')
  const verified = await verifyPlaceAddress({ fetchImpl: fetch, apiKey: mapsApiKey, query })
  results.push({ row, verified })
}

const matched = results.filter((r) => r.verified.verified && r.verified.street)
const unmatched = results.filter((r) => !(r.verified.verified && r.verified.street))

console.log(`Google-verified and splittable: ${matched.length}`)
console.log(`Could not verify (left unchanged): ${unmatched.length}`)
if (unmatched.length > 0) {
  console.log('Unmatched rows (review manually):')
  for (const { row } of unmatched) console.log(`  - ${row.id} ${row.name} | ${row.address}`)
}

if (!apply) {
  console.log('\nDry run only. Re-run with --apply --snapshot <path> to write changes.')
  process.exit(0)
}

await writeFile(
  snapshotPath,
  JSON.stringify(matched.map(({ row }) => row), null, 2),
)
console.log(`Wrote pre-change snapshot of ${matched.length} rows to ${snapshotPath}`)

let updated = 0
for (const { row, verified } of matched) {
  const { error } = await sb
    .from('saved_places')
    .update({
      address: verified.street,
      city: verified.city,
      state: verified.state,
      zip: verified.zip,
      lat: row.lat ?? verified.lat,
      lng: row.lng ?? verified.lng,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
  if (error) {
    console.error(`Failed to update ${row.id} (${row.name}): ${error.message}`)
    continue
  }
  updated += 1
}
console.log(`Updated ${updated}/${matched.length} rows.`)
