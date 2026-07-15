import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync('supabase/migrations/20260715242000_recurrence_v2_controlled_cutover.sql', 'utf8')
const cutover = readFileSync('scripts/recurrence-v2-cutover.mjs', 'utf8')

test('cutover is audited, revision-checked, dependency-ordered, and service-only', () => {
  assert.match(migration, /recurrence_rollout_audit/)
  assert.match(migration, /v_current is distinct from p_expected_flags/)
  assert.match(migration, /Recurrence writes require recurrence reads/)
  assert.match(migration, /Recurring deletion requires recurrence writes/)
  assert.match(migration, /Google projection requires recurrence writes/)
  assert.match(migration, /grant execute[\s\S]*to service_role/)
})

test('cutover enables each capability separately and rolls back on failed verification', () => {
  const read = cutover.indexOf('recurrence_v2_read: true')
  const write = cutover.indexOf('recurrence_v2_write: true')
  const deletion = cutover.indexOf('recurrence_v2_delete: true')
  const google = cutover.indexOf('google_sync_v2: true')
  assert.ok(read < write && write < deletion && deletion < google)
  assert.match(cutover, /assert\.deepEqual\(after, baseline\)/)
  assert.match(cutover, /Automatic rollback after failed recurrence cutover/)
  assert.match(cutover, /Pass --apply/)
})
