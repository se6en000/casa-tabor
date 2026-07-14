import assert from 'node:assert/strict'
import test from 'node:test'

import { shouldRetryTransientLlmStatus } from '../supabase/functions/_shared/assistant-llm-retry.mjs'

test('one bounded retry is eligible for transient provider failures', () => {
  for (const status of [500, 502, 503]) {
    assert.equal(shouldRetryTransientLlmStatus(status, 1500), true, String(status))
  }
})

test('quota, client errors, timeouts, and exhausted budgets do not retry', () => {
  for (const status of [400, 401, 429, 504]) {
    assert.equal(shouldRetryTransientLlmStatus(status, 5000), false, String(status))
  }
  assert.equal(shouldRetryTransientLlmStatus(503, 1499), false)
})
