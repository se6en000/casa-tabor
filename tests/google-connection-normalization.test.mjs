import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  googleConnectionPolicy,
  isGoogleReauthorizationError,
} from '../supabase/functions/_shared/google-connection-core.mjs'

const migration = readFileSync(
  resolve('supabase/migrations/20260715230000_normalize_google_connections.sql'),
  'utf8',
)
const authorityLock = readFileSync(
  resolve('supabase/migrations/20260715231000_lock_google_connection_authority.sql'),
  'utf8',
)
const resolver = readFileSync(
  resolve('supabase/functions/_shared/google-connection.ts'),
  'utf8',
)
const inbound = readFileSync(resolve('supabase/functions/sync-calendars/index.ts'), 'utf8')
const create = readFileSync(resolve('supabase/functions/create-google-event/index.ts'), 'utf8')
const update = readFileSync(resolve('supabase/functions/push-to-google/index.ts'), 'utf8')
const recurring = readFileSync(resolve('supabase/functions/update-recurring-google/index.ts'), 'utf8')
const remove = readFileSync(resolve('supabase/functions/delete-google-event/index.ts'), 'utf8')

test('configured target is the sole writable automatic connection policy', () => {
  assert.deepEqual(
    googleConnectionPolicy(' JacobRTabor@gmail.com ', 'jacobrtabor@gmail.com'),
    {
      googleEmail: 'jacobrtabor@gmail.com',
      calendarId: 'jacobrtabor@gmail.com',
      accessMode: 'writable',
      adoptionPolicy: 'automatic',
    },
  )
  assert.deepEqual(
    googleConnectionPolicy('family@example.com', 'jacobrtabor@gmail.com'),
    {
      googleEmail: 'family@example.com',
      calendarId: 'family@example.com',
      accessMode: 'read_only',
      adoptionPolicy: 'explicit',
    },
  )
})

test('reauthorization failures are distinguished from transient sync failures', () => {
  assert.equal(isGoogleReauthorizationError(new Error('invalid_grant: token revoked')), true)
  assert.equal(isGoogleReauthorizationError(new Error('Calendar API 503')), false)
  const missing = new Error('Reconnect this account')
  missing.name = 'GOOGLE_REAUTHORIZATION_REQUIRED'
  assert.equal(isGoogleReauthorizationError(missing), true)
})

test('normalization schema constrains roles and backfills durable identities', () => {
  assert.match(migration, /calendar_connections_one_writable/)
  assert.match(migration, /calendar_connections_one_automatic/)
  assert.match(migration, /access_mode = 'writable' and adoption_policy = 'automatic'/)
  assert.match(migration, /add column if not exists google_connection_id uuid/)
  assert.match(migration, /event\.source_member_id = connection\.family_member_id/)
  assert.match(migration, /having count\(distinct event\.google_connection_id\) = 1/)
  assert.match(migration, /health_status = 'reauthorization_required'/)
  assert.match(migration, /reauthorization_required/)
})

test('connection authority is service-only while clients use the safe status view', () => {
  assert.match(authorityLock, /drop policy if exists "allow all" on public\.calendar_connections/)
  assert.match(authorityLock, /revoke all on table public\.calendar_connections from anon, authenticated/)
  assert.match(migration, /grant select on public\.google_connection_status to anon, authenticated/)
})

test('all calendar sync paths resolve explicit database connections', () => {
  assert.match(resolver, /loadWritableGoogleConnection/)
  assert.match(resolver, /loadMemberGoogleConnection/)
  assert.match(inbound, /connection\.calendar_id/)
  assert.match(inbound, /existingAtTime\.is_enriched && connection\.access_mode === 'writable'/)
  assert.match(inbound, /showDeleted: 'true'/)
  assert.match(inbound, /maxResults: '2500'/)
  assert.match(inbound, /if \(syncToken\) params\.set\('syncToken', syncToken\)/)
  assert.match(inbound, /if \(pageToken\) params\.set\('pageToken', pageToken\)/)
  assert.match(inbound, /let isFullReconciliation = !syncToken/)
  assert.match(inbound, /isFullReconciliation && !isWithinInitialSyncWindow\(ev, now\)/)
  assert.match(inbound, /if \(!isFullReconciliation\) pendingCancellations\.push\(ev\)/)
  assert.match(inbound, /MAX_INCREMENTAL_CANCELLATIONS = \d+/)
  assert.match(inbound, /QUARANTINE/)
  assert.doesNotMatch(inbound, /calendars\/primary/)
  for (const source of [create, update, recurring]) {
    assert.match(source, /loadWritableGoogleConnection/)
    assert.match(source, /google_connection_id: connection\.id/)
  }
  assert.match(remove, /read-only Google source is never deleted by Casa/)
  assert.match(remove, /markGoogleConnectionFailure/)
  assert.doesNotMatch(remove, /google_calendar_id \?\? 'primary'/)
  assert.match(
    readFileSync(resolve('supabase/functions/_shared/google.ts'), 'utf8'),
    /res\.status !== 404 && res\.status !== 410/,
  )
})

test('flattened Google sync links canonical recurrence instances instead of inserting duplicates', () => {
  assert.match(inbound, /async function linkCanonicalOccurrence/)
  assert.match(inbound, /extendedProperties\?\.private\?\.casaSeriesId/)
  assert.match(inbound, /\.eq\('google_recurring_event_id', recurringEventId\)/)
  assert.match(inbound, /\.eq\('original_start_time', originalStartTime\)/)
  assert.match(inbound, /\.rpc\('recurrence_link_google_instance'/)
  assert.match(inbound, /if \(await linkCanonicalOccurrence\(sb, connection, ev\)\) return/)
})

test('legacy rows without trustworthy source identity are not guessed', () => {
  assert.match(migration, /event\.source_member_id = connection\.family_member_id/)
  assert.doesNotMatch(migration, /source_member_id is null[\s\S]*google_connection_id/)
})
