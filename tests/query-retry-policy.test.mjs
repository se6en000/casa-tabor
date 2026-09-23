import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { shouldRetryQuery } from '../src/lib/queryRetryPolicy.ts'

// 2026-09-23: `retry: 1` retried EVERY error once, including permanent
// failures (a unique-constraint violation will never succeed by retrying),
// while a bare number gives no way to bound retries differently for
// transient failures. React Query's own default retryDelay already does
// exponential backoff -- the real gap was retrying errors that can never
// succeed, not missing backoff.

test('App wires the query client to the shared retry policy, not a bare retry count', () => {
  const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(source, /retry: shouldRetryQuery/)
  assert.doesNotMatch(source, /retry:\s*1\b/)
})

test('never retries a well-known permanent Postgres/PostgREST failure', () => {
  for (const code of ['23505', '23503', '23514', '42501', '42P01', '42703', 'PGRST301']) {
    assert.equal(shouldRetryQuery(0, { code }), false, `${code} should not be retried`)
  }
})

test('retries a transient/unknown-shape failure up to a bounded count', () => {
  assert.equal(shouldRetryQuery(0, new TypeError('Failed to fetch')), true)
  assert.equal(shouldRetryQuery(1, new TypeError('Failed to fetch')), true)
  assert.equal(shouldRetryQuery(2, new TypeError('Failed to fetch')), false)
  assert.equal(shouldRetryQuery(0, { code: '500' }), true)
  assert.equal(shouldRetryQuery(0, null), true)
})
