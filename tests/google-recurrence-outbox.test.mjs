import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  detectsGoogleConflict,
  deterministicGoogleEventId,
  isRetryableGoogleStatus,
  operationPlan,
  retryDelaySeconds,
} from '../supabase/functions/_shared/google-recurrence-outbox-core.mjs'

const migration = readFileSync('supabase/migrations/20260715240000_google_recurrence_outbox.sql', 'utf8')
const worker = readFileSync('supabase/functions/process-google-recurrence-outbox/index.ts', 'utf8')

test('outbox plans every supported operation and split dependencies', () => {
  assert.deepEqual(operationPlan({ operation_type: 'patch_master' }, { google_recurring_event_id: null }), ['create_master'])
  assert.deepEqual(operationPlan({ operation_type: 'split_series' }, {}), ['patch_parent_master', 'create_master'])
  assert.deepEqual(operationPlan({ operation_type: 'delete_master' }, { google_recurring_event_id: null }), [])
  assert.throws(() => operationPlan({ operation_type: 'unknown' }, {}), /Unsupported/)
})

test('retry policy is bounded and only retries transient Google failures', () => {
  assert.equal(isRetryableGoogleStatus(429), true)
  assert.equal(isRetryableGoogleStatus(503), true)
  assert.equal(isRetryableGoogleStatus(400), false)
  assert.equal(retryDelaySeconds(1), 15)
  assert.equal(retryDelaySeconds(99), 3_600)
})

test('master creation uses a deterministic Google-safe ID after lost responses', () => {
  assert.equal(
    deterministicGoogleEventId('123e4567-e89b-12d3-a456-426614174000'),
    'c123e4567e89b12d3a456426614174000',
  )
  assert.throws(() => deterministicGoogleEventId('short'), /UUID-like/)
  assert.match(worker, /cause\.status !== 409/)
})

test('Casa-wins conflict detection compares durable Google revision metadata', () => {
  assert.equal(detectsGoogleConflict(
    { google_updated_at: '2026-07-15T12:00:00Z', google_etag: 'old' },
    { updated: '2026-07-15T12:01:00Z', etag: 'new' },
  ), true)
  assert.equal(detectsGoogleConflict(
    { google_updated_at: '2026-07-15T12:00:00Z', google_etag: 'same' },
    { updated: '2026-07-15T12:01:00Z', etag: 'same' },
  ), false)
})

test('database claiming is dependency-aware, leased, bounded, and service-only', () => {
  assert.match(migration, /for update of operation skip locked/)
  assert.match(migration, /dependency\.status = 'succeeded'/)
  assert.match(migration, /last_attempt_at < now\(\) - interval '10 minutes'/)
  assert.match(migration, /attempts < max_attempts/)
  assert.match(migration, /grant execute on function public\.recurrence_claim_google_sync_operations/)
  assert.match(migration, /where name = 'SUPABASE_SERVICE_ROLE_KEY'/)
})

test('worker is service-only, dark-launch gated, and uses the canonical serializer', () => {
  assert.match(worker, /Service-role authorization required/)
  assert.match(worker, /google_sync_v2_disabled/)
  assert.match(worker, /serializeGoogleRecurrenceProjection/)
  assert.match(worker, /recurrence_build_reusable_patch/)
  assert.match(worker, /Read-only imported series cannot be projected/)
  assert.match(worker, /recurrence_finish_google_sync_operation/)
  assert.match(worker, /markGoogleConnectionFailure/)
})
