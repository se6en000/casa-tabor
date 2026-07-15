import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

if (!process.argv.includes('--apply')) {
  throw new Error('Pass --apply to execute the audited recurrence cutover.')
}

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const separator = line.indexOf('=')
      return [line.slice(0, separator), line.slice(separator + 1).replace(/^['"]|['"]$/g, '')]
    }),
)
const db = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function flags() {
  const { data, error } = await db.from('settings').select('value').eq('key', 'recurrence_v2_flags').single()
  if (error) throw error
  return data.value
}

async function setFlags(expected, next, reason) {
  const { data, error } = await db.rpc('recurrence_set_rollout_flags', {
    p_expected_flags: expected,
    p_next_flags: next,
    p_reason: reason,
  })
  if (error) throw error
  return data
}

async function invariantSnapshot() {
  const count = async (table, filter = (query) => query) => {
    const { count: value, error } = await filter(db.from(table).select('*', { head: true, count: 'exact' }))
    if (error) throw error
    return value
  }
  const { data: identities, error: identityError } = await db
    .from('event_series')
    .select('source_connection_id,google_recurring_event_id')
    .not('google_recurring_event_id', 'is', null)
  if (identityError) throw identityError
  const identityKeys = identities.map((row) => `${row.source_connection_id}:${row.google_recurring_event_id}`)
  return {
    events: await count('events'),
    visible: await count('events', (query) => query.is('deleted_at', null).neq('record_kind', 'series_template')),
    templates: await count('events', (query) => query.eq('record_kind', 'series_template')),
    series: await count('event_series'),
    tombstones: await count('events', (query) => query.not('deleted_at', 'is', null)),
    googleIdentities: identityKeys.length,
    duplicateIdentities: identityKeys.length - new Set(identityKeys).size,
  }
}

const original = await flags()
const baseline = await invariantSnapshot()
const { data: operations, error: operationsError } = await db
  .from('recurrence_operations_summary')
  .select('active_syncs,failed_syncs,migration_anomalies')
  .single()
if (operationsError) throw operationsError
const { data: writableConnection, error: connectionError } = await db
  .from('calendar_connections')
  .select('health_status')
  .eq('access_mode', 'writable')
  .eq('is_enabled', true)
  .single()
if (connectionError) throw connectionError
assert.equal(baseline.duplicateIdentities, 0)
assert.equal(operations.active_syncs, 0)
assert.equal(operations.failed_syncs, 0)
assert.equal(operations.migration_anomalies, 0)
assert.equal(writableConnection.health_status, 'healthy')
try {
  let current = original
  current = await setFlags(current, { ...current, recurrence_v2_read: true }, 'Enable canonical recurrence reads')
  current = await setFlags(current, { ...current, recurrence_v2_write: true }, 'Enable revision-guarded Casa recurrence writes')
  current = await setFlags(current, { ...current, recurrence_v2_delete: true }, 'Enable recoverable scoped recurrence deletion')
  current = await setFlags(current, { ...current, google_sync_v2: true }, 'Enable Jacob Google recurrence projection')

  const after = await invariantSnapshot()
  assert.deepEqual(after, baseline)
  assert.deepEqual(current, {
    recurrence_v2_read: true,
    recurrence_v2_write: true,
    google_sync_v2: true,
    recurrence_v2_delete: true,
  })
  console.log(JSON.stringify({ success: true, original, flags: current, invariants: after }))
} catch (cause) {
  const current = await flags()
  if (JSON.stringify(current) !== JSON.stringify(original)) {
    await setFlags(current, original, 'Automatic rollback after failed recurrence cutover')
  }
  throw cause
}
