import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// 2026-09-22: a real, pre-existing directory-matching bug, found while
// investigating why a chat-created "Kelly Workout" event's location ("amped")
// never resolved to the household's actual saved place "Amped Fitness
// Signature". Confirmed live against prod:
//   select similarity('Amped Fitness Signature', 'amped');        -- 0.25
//   select 'Amped Fitness Signature' ilike 'amped';                -- false
//   select 'Amped Fitness Signature' ilike '%amped%';              -- true
//   select * from find_similar_places('amped', null);              -- []
// find_similar_places's "name_containment" branch reads `sp.name ilike p_name`
// with NO wildcards -- that's just a case-insensitive equality check wearing
// a containment label, so it never actually catches a short/partial name
// against a longer canonical one, and the plain trigram similarity() fallback
// tanks hard on this kind of length mismatch (short substring vs a much
// longer full name), leaving the WHERE clause's own similarity(...) > 0.4
// filter to reject it outright before scoring is even relevant.
const raw = readFileSync(
  new URL('../supabase/migrations/20260923000515_fix_find_similar_places_partial_match.sql', import.meta.url),
  'utf8',
)
// Strip full-line SQL comments so assertions can't accidentally match this
// file's own explanatory prose (which necessarily quotes the old buggy code).
const statements = raw.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n')

test('find_similar_places containment check actually uses wildcards both directions', () => {
  assert.match(statements, /sp\.name ilike '%' \|\| p_name \|\| '%'/)
  assert.match(statements, /p_name ilike '%' \|\| sp\.name \|\| '%'/)
  // the old, broken bare-equality form must be gone from the actual SQL
  assert.doesNotMatch(statements, /sp\.name ilike p_name(?!\s*\|\|)/)
})

test('the WHERE clause admits a real containment match even when trigram similarity would reject it', () => {
  const whereIdx = statements.indexOf('where (p_include_dismissed')
  assert.ok(whereIdx >= 0, 'WHERE clause not found')
  const whereClause = statements.slice(whereIdx)
  assert.match(whereClause, /sp\.name ilike '%' \|\| p_name \|\| '%'/)
  assert.match(whereClause, /p_name ilike '%' \|\| sp\.name \|\| '%'/)
  assert.match(whereClause, /word_similarity\(p_name, sp\.name\) > 0\.4/)
})

test('word_similarity is used as an additional fuzzy fallback for partial (non-substring) names', () => {
  assert.match(statements, /word_similarity\(p_name, sp\.name\)/)
})

test('function signature and volatility match the original (recreated, not newly exposed as SECURITY DEFINER)', () => {
  assert.match(statements, /create or replace function public\.find_similar_places\(\s*p_name text,\s*p_phone text default null,\s*p_exclude_id uuid default null,\s*p_include_dismissed boolean default false\s*\)/)
  assert.match(statements, /language sql\s*\n\s*stable/)
  assert.doesNotMatch(statements, /security definer/)
})
