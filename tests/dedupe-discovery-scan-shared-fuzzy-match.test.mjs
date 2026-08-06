import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// Source-contract coverage for the SQL migration that aligns
// discover_directory_candidates()'s dedupe checks with the shared
// find_similar_places/find_similar_contacts fuzzy-match functions instead of
// duplicating the ilike/similarity/alias logic inline. No local Postgres is
// available in this test runner, so behavior is asserted against the raw SQL
// text (same convention as other migration-touching tests in this repo) and
// verified live against the deployed function separately.

const migrationPath = new URL(
  '../supabase/migrations/20260806142000_discover_directory_candidates_use_shared_fuzzy_match.sql',
  import.meta.url,
)
const sql = readFileSync(migrationPath, 'utf8')

test('find_similar_places gains an additive p_include_dismissed param defaulting to false', () => {
  assert.match(sql, /p_include_dismissed boolean default false\n\) returns table\(id uuid, name text, address text/)
  assert.match(sql, /where \(p_include_dismissed or sp\.dismissed_at is null\)/)
})

test('find_similar_contacts gains an additive p_include_dismissed param defaulting to false', () => {
  assert.match(sql, /p_include_dismissed boolean default false\n\) returns table\(id uuid, name text, phone text, email text/)
  assert.match(sql, /where \(p_include_dismissed or sc\.dismissed_at is null\)/)
})

test('discover_directory_candidates places check reuses find_similar_places instead of inline ilike/similarity', () => {
  assert.match(sql, /select 1 from public\.find_similar_places\(dp\.name, null, null, true\) fsp\s*\n\s*where fsp\.score >= 0\.6/)
  // The old duplicated inline dedupe query must be gone from this function body.
  assert.doesNotMatch(sql, /sp\.name ilike dp\.name/)
})

test('discover_directory_candidates contacts check reuses find_similar_contacts instead of inline ilike/similarity', () => {
  assert.match(sql, /select 1 from public\.find_similar_contacts\(ac\.name, null, null, null, true\) fsc\s*\n\s*where fsc\.score >= 0\.6/)
  assert.doesNotMatch(sql, /sc\.name ilike ac\.name/)
})

test('discover_directory_candidates still passes include-dismissed=true so a dismissed duplicate keeps blocking re-insertion', () => {
  // This is the specific regression guard: dismissed_at exists so a
  // household can permanently reject a suggestion. If the discovery scan
  // switched to the default (dismissed rows excluded from matching), a
  // dismissed place/contact would look like "does not exist" again and get
  // silently recreated on the next scan.
  const placesCall = sql.match(/find_similar_places\(dp\.name, null, null, (\w+)\)/)
  const contactsCall = sql.match(/find_similar_contacts\(ac\.name, null, null, null, (\w+)\)/)
  assert.equal(placesCall?.[1], 'true')
  assert.equal(contactsCall?.[1], 'true')
})

test('discover_directory_candidates does not pass a phone into the contacts dedupe check (behavior-equivalent refactor)', () => {
  assert.match(sql, /find_similar_contacts\(ac\.name, null, null, null, true\)/)
})
