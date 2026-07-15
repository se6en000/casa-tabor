import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  classifyGoogleRecurrenceResource,
  googleRecurrenceListParams,
  isExpiredGoogleSyncCursor,
} from '../supabase/functions/_shared/google-recurrence-import-core.mjs'

const migration = readFileSync(
  resolve('supabase/migrations/20260715232000_google_recurrence_import.sql'),
  'utf8',
)
const importer = readFileSync(
  resolve('supabase/functions/import-google-recurrence/index.ts'),
  'utf8',
)
const connection = {
  id: 'connection-1',
  access_mode: 'writable',
  adoption_policy: 'automatic',
}

test('Google recurrence masters stage for policy-controlled adoption', () => {
  const resource = classifyGoogleRecurrenceResource({
    id: 'master-1',
    status: 'confirmed',
    recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO'],
    start: { dateTime: '2026-07-20T16:00:00-04:00', timeZone: 'America/New_York' },
    end: { dateTime: '2026-07-20T17:00:00-04:00', timeZone: 'America/New_York' },
    summary: 'Practice',
  }, connection)

  assert.equal(resource.resource_type, 'master')
  assert.equal(resource.adoption_status, 'pending_automatic')
  assert.deepEqual(resource.recurrence_lines, ['RRULE:FREQ=WEEKLY;BYDAY=MO'])
})

test('read-only masters remain pending explicit adoption', () => {
  const resource = classifyGoogleRecurrenceResource({
    id: 'master-2',
    recurrence: ['RRULE:FREQ=DAILY'],
    start: { date: '2026-07-20' },
    end: { date: '2026-07-21' },
  }, { ...connection, access_mode: 'read_only', adoption_policy: 'explicit' })
  assert.equal(resource.adoption_status, 'pending_explicit')
})

test('exceptions preserve stable original timed and all-day identity', () => {
  const timed = classifyGoogleRecurrenceResource({
    id: 'exception-1',
    recurringEventId: 'master-1',
    originalStartTime: {
      dateTime: '2026-07-20T16:00:00-04:00',
      timeZone: 'America/New_York',
    },
    status: 'cancelled',
  }, connection)
  assert.equal(timed.resource_type, 'exception')
  assert.equal(timed.original_start_time, '2026-07-20T16:00:00-04:00')
  assert.equal(timed.google_status, 'cancelled')

  const allDay = classifyGoogleRecurrenceResource({
    id: 'exception-2',
    recurringEventId: 'master-2',
    originalStartTime: { date: '2026-07-21' },
  }, connection)
  assert.equal(allDay.original_start_date, '2026-07-21')
  assert.equal(allDay.original_start_time, null)
})

test('malformed exceptions fail closed instead of losing occurrence identity', () => {
  assert.throws(
    () => classifyGoogleRecurrenceResource({
      id: 'exception-3',
      recurringEventId: 'master-1',
    }, connection),
    /missing originalStartTime/,
  )
})

test('dedicated recurrence list cursor never flattens generated instances', () => {
  const initial = googleRecurrenceListParams({})
  assert.equal(initial.get('singleEvents'), 'false')
  assert.equal(initial.get('showDeleted'), 'true')
  assert.equal(initial.has('syncToken'), false)
  assert.equal(initial.has('timeMin'), false)

  const incremental = googleRecurrenceListParams({ syncToken: 'cursor', pageToken: 'page' })
  assert.equal(incremental.get('syncToken'), 'cursor')
  assert.equal(incremental.get('pageToken'), 'page')
  assert.equal(isExpiredGoogleSyncCursor(410), true)
  assert.equal(isExpiredGoogleSyncCursor(401), false)
})

test('import schema stages full reconciliation before cursor commit and retirement', () => {
  assert.match(migration, /recurrence_sync_token text/)
  assert.match(migration, /last_seen_run_id is distinct from p_run_id/)
  assert.match(migration, /where id = p_run_id\s+and status = 'running'/)
  assert.match(migration, /adoption_status in \('adopted', 'ignored'\)/)
  assert.match(migration, /'pending_automatic'/)
  assert.match(migration, /recurrence_link_google_occurrences_core/)
  assert.match(migration, /recurrence_adopt_google_masters_core/)
  assert.match(migration, /grant execute on function public\.recurrence_adopt_google_master_core/)
  assert.match(migration, /where name = 'SUPABASE_SERVICE_ROLE_KEY'/)
})

test('importer is service-only, flag-gated, and reconciles expired cursors', () => {
  assert.match(importer, /Service-role authorization required/)
  assert.match(importer, /google_sync_v2_disabled/)
  assert.match(importer, /isExpiredGoogleSyncCursor\(googleResponse\.status\)/)
  assert.match(importer, /return importConnection\(supabase, resolved, correlationId, true, true\)/)
  assert.match(importer, /recurrence_stage_google_resources_core/)
  assert.match(importer, /recurrence_link_google_occurrences_core/)
  assert.match(importer, /\.neq\('google_status', 'cancelled'\)/)
  assert.match(importer, /recurrence_adopt_google_masters_core/)
  assert.match(importer, /if \(!nextSyncToken\)[\s\S]*automaticMasterResourceIds\.size/)
})

test('inbound recurrence import does not overwrite Casa-owned event detail', () => {
  const linkFunction = migration.match(
    /create or replace function public\.recurrence_link_google_occurrences_core[\s\S]*?revoke all on function/,
  )?.[0] ?? ''
  for (const field of ['title', 'description', 'location', 'start_time', 'end_time', 'what_to_bring']) {
    const assignment = new RegExp(`\\n\\s*${field}\\s*=`)
    assert.doesNotMatch(linkFunction, assignment)
  }
  assert.match(migration, /status = 'cancelled'/)
  assert.match(migration, /'series_template'/)
  const existingSeriesUpdate = migration.match(
    /if found then[\s\S]*?return jsonb_build_object\('series_id', v_existing\.id/,
  )?.[0] ?? ''
  assert.doesNotMatch(existingSeriesUpdate, /recurrence_lines =/)
})
