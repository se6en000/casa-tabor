import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('../supabase/functions/enrich-event/index.ts', import.meta.url),
  'utf8',
)
const placeSearchSource = readFileSync(
  new URL('../supabase/functions/place-search/index.ts', import.meta.url),
  'utf8',
)
const dispatchMigration = readFileSync(
  new URL('../supabase/migrations/20260719130000_harden_auto_enrichment_dispatch.sql', import.meta.url),
  'utf8',
)
const supabaseConfig = readFileSync(
  new URL('../supabase/config.toml', import.meta.url),
  'utf8',
)

test('event enrichment resolves explicit semantic locations through canonical Places search', () => {
  assert.match(source, /functions\.invoke\('place-search'/)
  assert.match(source, /selectConfidentEventPlace/)
  assert.match(source, /event_enrichment_place_resolved/)
  assert.match(placeSearchSource, /places\.primaryType/)
  assert.match(placeSearchSource, /primary_type:\s*p\.primaryType/)
})

test('empty or invalid provider output remains retryable instead of marking enrichment complete', () => {
  assert.match(source, /enrichment_empty_provider_output/)
  assert.match(source, /enrichment_invalid_provider_output/)
  assert.match(source, /event_enrichment_provider_failed/)
  assert.match(source, /retryable:\s*true/)
  assert.doesNotMatch(source, /return \{ category: 'other', what_to_bring: \[\], confidence: 'low' \}/)
})

test('Gemini enrichment uses a bounded JSON output budget without hidden reasoning', () => {
  assert.match(source, /maxOutputTokens:\s*1024/)
  assert.match(source, /thinkingConfig:\s*\{\s*thinkingBudget:\s*0\s*\}/)
})

test('database inserts dispatch enrichment without depending on an unavailable vault token', () => {
  assert.match(dispatchMigration, /net\.http_post/)
  assert.doesNotMatch(dispatchMigration, /vault\.decrypted_secrets/)
  assert.match(dispatchMigration, /raise warning 'event enrichment dispatch failed/)
  assert.match(supabaseConfig, /\[functions\.enrich-event\]\s+verify_jwt = false/)
})
