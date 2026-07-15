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
  assert.doesNotMatch(inbound, /calendars\/primary/)
  for (const source of [create, update, recurring]) {
    assert.match(source, /loadWritableGoogleConnection/)
    assert.match(source, /google_connection_id: connection\.id/)
  }
  assert.match(remove, /read-only Google source is never deleted by Casa/)
  assert.doesNotMatch(remove, /google_calendar_id \?\? 'primary'/)
})

test('legacy rows without trustworthy source identity are not guessed', () => {
  assert.match(migration, /event\.source_member_id = connection\.family_member_id/)
  assert.doesNotMatch(migration, /source_member_id is null[\s\S]*google_connection_id/)
})
