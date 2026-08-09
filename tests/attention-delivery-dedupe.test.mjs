import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(
  new URL('../supabase/migrations/20260809130500_attention_delivery_dedupe.sql', import.meta.url),
  'utf8',
)
const policy = readFileSync(
  new URL('../supabase/functions/apply-notification-policy/index.ts', import.meta.url),
  'utf8',
)

test('notification delivery keys are unique and event enrichment is emitted once per event', () => {
  assert.match(migration, /create unique index[\s\S]*notifications[\s\S]*dedupe_key/)
  assert.match(migration, /event_enriched:\s*'?\s*\|\|\s*new\.event_id/)
  assert.match(migration, /on conflict \(dedupe_key\)[\s\S]*do nothing/)
})

test('conflict policy delivery uses one stable key instead of a six-hour window', () => {
  assert.match(policy, /policy_conflict:\$\{c\.id\}/)
  assert.doesNotMatch(policy, /dedupeFrom/)
})
