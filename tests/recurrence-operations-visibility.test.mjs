import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync('supabase/migrations/20260715241000_recurrence_operations_visibility.sql', 'utf8')
const hook = readFileSync('src/hooks/useRecurrenceOperations.ts', 'utf8')
const card = readFileSync('src/components/settings/RecurrenceOperationsCard.tsx', 'utf8')
const page = readFileSync('src/pages/GoogleServicesPage.tsx', 'utf8')

test('operations visibility includes sync, conflicts, tombstones, imports, and anomalies', () => {
  for (const field of [
    'active_syncs',
    'failed_syncs',
    'casa_wins_conflicts',
    'tombstones',
    'pending_imports',
    'migration_anomalies',
    'rollout_flags',
  ]) {
    assert.match(migration, new RegExp(field))
  }
  assert.match(migration, /correlation_id/)
  assert.match(migration, /action_id/)
  assert.match(migration, /casa_revision/)
})

test('status reads are sanitized while retry only accepts failed operations', () => {
  assert.match(migration, /security_barrier = true/)
  assert.match(migration, /grant select on public\.recurrence_sync_operation_status/)
  assert.match(migration, /and status = 'failed'/)
  assert.match(migration, /Only failed sync operations can be retried/)
})

test('calendar settings provides truthful rollout state and actionable failures', () => {
  assert.match(hook, /refetchInterval:\s*(?:isPageVisible\s*\?\s*)?30_000/)
  assert.match(card, /Google recurrence projection is paused/)
  assert.match(card, /Retry now/)
  assert.match(card, /Casa version kept/)
  assert.match(card, /Recurrence status is unavailable/)
  assert.match(page, /<RecurrenceOperationsCard \/>/)
})

test('operations surface reuses design-system feedback and data-display primitives', () => {
  for (const primitive of ['Alert', 'Button', 'Card', 'Chip', 'Heading', 'Skeleton', 'Text']) {
    assert.match(card, new RegExp(`\\b${primitive}\\b`))
  }
})
