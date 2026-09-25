import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  createTrackedProviderFetch,
  isCircuitBreakerResponse,
  isTrafficBlockedByBreaker,
} from '../supabase/functions/_shared/provider-call-ledger.mjs'

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const NOW = Date.parse('2026-09-23T20:00:00Z')

test('breaker: no state or not paused never blocks', () => {
  assert.equal(isTrafficBlockedByBreaker(null, 'user', NOW), false)
  assert.equal(isTrafficBlockedByBreaker(undefined, 'background', NOW), false)
  assert.equal(isTrafficBlockedByBreaker({ paused: false, pause_scope: 'all' }, 'user', NOW), false)
})

test('breaker: scope "all" blocks every traffic class', () => {
  const state = { paused: true, pause_scope: 'all', pause_until: null }
  for (const cls of ['user', 'background', 'shadow', 'qa']) {
    assert.equal(isTrafficBlockedByBreaker(state, cls, NOW), true, cls)
  }
})

test('breaker: scope "background" blocks everything except user-initiated traffic', () => {
  const state = { paused: true, pause_scope: 'background', pause_until: null }
  assert.equal(isTrafficBlockedByBreaker(state, 'user', NOW), false)
  assert.equal(isTrafficBlockedByBreaker(state, 'background', NOW), true)
  assert.equal(isTrafficBlockedByBreaker(state, 'shadow', NOW), true)
  assert.equal(isTrafficBlockedByBreaker(state, 'qa', NOW), true)
})

test('breaker: an expired timed pause no longer blocks', () => {
  const expired = { paused: true, pause_scope: 'all', pause_until: '2026-09-23T19:59:00Z' }
  const active = { paused: true, pause_scope: 'all', pause_until: '2026-09-23T20:30:00Z' }
  assert.equal(isTrafficBlockedByBreaker(expired, 'user', NOW), false)
  assert.equal(isTrafficBlockedByBreaker(active, 'user', NOW), true)
})

test('tracked fetch: an open breaker returns a synthetic 503 and never reaches the provider', async () => {
  const realFetch = globalThis.fetch
  let providerCalls = 0
  globalThis.fetch = async () => {
    providerCalls++
    return new Response('{}', { status: 200 })
  }
  try {
    const trackedFetch = createTrackedProviderFetch({
      functionName: 'test-fn',
      capability: 'test',
      trafficClass: 'background',
      breakerStateReader: async () => ({ paused: true, pause_scope: 'background', pause_until: null }),
    })
    const res = await trackedFetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
      method: 'POST',
      body: JSON.stringify({ contents: [] }),
    })
    assert.equal(res.status, 503)
    assert.equal(providerCalls, 0)
    assert.equal(isCircuitBreakerResponse(res), true)
    const body = await res.json()
    assert.equal(body.error.status, 'CIRCUIT_BREAKER_OPEN')
  } finally {
    globalThis.fetch = realFetch
  }
})

test('tracked fetch: user traffic still flows while only background is paused', async () => {
  const realFetch = globalThis.fetch
  let providerCalls = 0
  globalThis.fetch = async () => {
    providerCalls++
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    const trackedFetch = createTrackedProviderFetch({
      functionName: 'test-fn',
      capability: 'test',
      trafficClass: 'user',
      breakerStateReader: async () => ({ paused: true, pause_scope: 'background', pause_until: null }),
    })
    const res = await trackedFetch('https://api.openai.com/v1/chat/completions', { method: 'POST', body: '{}' })
    assert.equal(res.status, 200)
    assert.equal(providerCalls, 1)
    assert.equal(isCircuitBreakerResponse(res), false)
  } finally {
    globalThis.fetch = realFetch
  }
})

test('tracked fetch: a breaker read failure fails open (AI keeps working)', async () => {
  const realFetch = globalThis.fetch
  let providerCalls = 0
  globalThis.fetch = async () => {
    providerCalls++
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    const trackedFetch = createTrackedProviderFetch({
      functionName: 'test-fn',
      capability: 'test',
      trafficClass: 'user',
      breakerStateReader: async () => { throw new Error('db down') },
    })
    const res = await trackedFetch('https://api.openai.com/v1/chat/completions', { method: 'POST', body: '{}' })
    assert.equal(res.status, 200)
    assert.equal(providerCalls, 1)
  } finally {
    globalThis.fetch = realFetch
  }
})

// Queue/cron workers must skip the whole run while paused rather than let each AI call
// fail: scan-gmail-inbox marks an email processed ("no events found") when its
// classifier returns null, so failing mid-run would permanently drop every email
// that arrived during the pause.
test('background workers check the breaker before doing any work', () => {
  for (const fn of ['scan-gmail-inbox', 'scan-travel-emails', 'index-family-data']) {
    const src = source(`supabase/functions/${fn}/index.ts`)
    assert.match(src, /checkAiCircuitBreaker\('background'\)/, fn)
    assert.match(src, /ai_circuit_breaker_open/, fn)
  }
})

test('ai-assistant answers with a clear paused message instead of a generic failure', () => {
  const src = source('supabase/functions/ai-assistant/index.ts')
  assert.match(src, /checkAiCircuitBreaker\('user'\)/)
  assert.match(src, /code: 'ai_paused'/)
})

test('capture-command routes its Gemini call through the tracked (ledgered, breaker-aware) fetch', () => {
  const src = source('supabase/functions/capture-command/index.ts')
  assert.match(src, /createTrackedProviderFetch/)
  assert.doesNotMatch(src, /await fetch\(`https:\/\/generativelanguage/)
})

const migration = source('supabase/migrations/20260924011404_system_health_and_ai_circuit_breaker.sql')

test('health migration: alerts table is locked down, read only through RPCs', () => {
  assert.match(migration, /create table if not exists public\.system_alerts/)
  assert.match(migration, /alter table public\.system_alerts enable row level security/)
  assert.match(migration, /revoke all on public\.system_alerts from anon, authenticated/)
  assert.match(migration, /create or replace function public\.get_system_health_summary\(\)/)
})

test('health migration: evaluator runs on its own staggered cron slot and is security definer', () => {
  assert.match(migration, /create or replace function public\.evaluate_system_health\(\)[\s\S]*?security definer[\s\S]*?set search_path/)
  assert.match(migration, /cron\.schedule\(\s*'evaluate-system-health',\s*'13,28,43,58 \* \* \* \*'/)
})

test('health migration: usage from before a manual resume never re-trips the breaker', () => {
  assert.match(migration, /resumed_at/)
  assert.match(migration, /greatest\(v_now - interval '1 hour', v_since_resume\)/)
})

test('health migration: resume/pause go through an RPC that preserves the thresholds', () => {
  assert.match(migration, /create or replace function public\.set_ai_circuit_breaker\(/)
  assert.match(migration, /coalesce\(v_current, '\{\}'::jsonb\) \|\|/)
})

// Regression: `text[] || 'literal'` parses the literal as an array ("malformed array
// literal") -- the evaluator crashed the first time it tried to raise any alert.
test('health migration: alert-key arrays are built with array_append, never `|| literal`', () => {
  assert.doesNotMatch(migration, /v_(open_keys|breaches|elevated) := v_\w+ \|\|/)
  assert.match(migration, /array_append\(v_open_keys, 'ai_spend:runaway'\)/)
})
