import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// Source-contract coverage for the SQL migration fixing a real duplicate
// Needs You bug: an event whose enrichment "contact" is really just the
// venue's own front-desk line (contact_name === location_name, e.g.
// "North Berwick Golf Club") got surfaced twice — once as a place
// suggestion, once as a contact suggestion — because candidate_contacts
// never cross-checked the event's own location_name. No local Postgres is
// available in this test runner, so behavior is asserted against the raw
// SQL text (same convention as other migration-touching tests in this
// repo) and verified live against the deployed function separately.

const migrationPath = new URL(
  '../supabase/migrations/20260806195900_discover_directory_candidates_skip_contact_matching_location.sql',
  import.meta.url,
)
const sql = readFileSync(migrationPath, 'utf8')

test('candidate_contacts excludes a contact_name that exactly matches the event\'s own location_name', () => {
  assert.match(
    sql,
    /and \(\s*e\.location_name is null\s*\n\s*or lower\(trim\(ee\.contact_name\)\) <> lower\(trim\(e\.location_name\)\)\s*\n\s*\)/,
  )
})

test('the location-name exclusion is scoped to candidate_contacts, not candidate_places', () => {
  const placesCte = sql.slice(sql.indexOf('candidate_places as ('), sql.indexOf('candidate_contacts as ('))
  assert.doesNotMatch(placesCte, /location_name/)
})

test('existing family-member exclusion and dedupe-check behavior is preserved', () => {
  assert.match(sql, /not exists \(\s*select 1 from public\.family_members fm\s*\n\s*where fm\.name ilike trim\(ee\.contact_name\)\s*\n\s*\)/)
  assert.match(sql, /select 1 from public\.find_similar_contacts\(ac\.name, null, null, null, true\) fsc\s*\n\s*where fsc\.score >= 0\.6/)
})
