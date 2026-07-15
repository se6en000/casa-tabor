import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

if (!process.argv.includes('--live-fixture')) {
  throw new Error('Pass --live-fixture to run the isolated Google recurrence projection fixture.')
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
const runId = crypto.randomUUID()
const prefix = `Google recurrence projection ${runId}`
const actionIds = [`${prefix}:create`, `${prefix}:delete`]
let templateId
let occurrenceId
let seriesId
let googleEventId

async function processOutbox() {
  const res = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/process-google-recurrence-outbox`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
      'x-correlation-id': runId,
    },
    body: JSON.stringify({ limit: 10 }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(JSON.stringify(body))
  return body
}

try {
  const { data: connection, error: connectionError } = await db
    .from('calendar_connections')
    .select('id,calendar_id')
    .eq('access_mode', 'writable')
    .eq('is_enabled', true)
    .single()
  if (connectionError) throw connectionError

  const { data: template, error: templateError } = await db.from('events').insert({
    title: `${prefix} template`,
    description: 'Private Casa fixture',
    start_time: '2026-08-24T13:00:00.000Z',
    end_time: '2026-08-24T14:00:00.000Z',
    event_type: 'event',
    record_kind: 'series_template',
    location_name: 'Casa Test Field',
    address: '1 Test Way',
    is_enriched: true,
  }).select('id').single()
  if (templateError) throw templateError
  templateId = template.id

  const { data: series, error: seriesError } = await db.from('event_series').insert({
    template_event_id: templateId,
    timezone: 'America/New_York',
    recurrence_lines: ['RRULE:FREQ=WEEKLY;COUNT=2'],
    ownership: 'casa',
    source_connection_id: connection.id,
    google_calendar_id: connection.calendar_id,
  }).select('id').single()
  if (seriesError) throw seriesError
  seriesId = series.id

  const { data: occurrence, error: occurrenceError } = await db.from('events').insert({
    title: `${prefix} occurrence`,
    start_time: '2026-08-24T13:00:00.000Z',
    end_time: '2026-08-24T14:00:00.000Z',
    event_type: 'event',
    record_kind: 'occurrence',
    series_id: seriesId,
    occurrence_key: '2026-08-24T09:00:00[America/New_York]',
    original_start_time: '2026-08-24T13:00:00.000Z',
    series_revision_applied: 1,
    is_enriched: true,
  }).select('id').single()
  if (occurrenceError) throw occurrenceError
  occurrenceId = occurrence.id

  await db.from('event_checklist_items').insert({
    event_id: templateId,
    label: 'Bring projection proof',
    checked: false,
    template_revision: 1,
  })
  const { data: mutation, error: mutationError } = await db.rpc('recurrence_apply_scoped_mutation_core', {
    p_action_id: actionIds[0],
    p_selected_event_id: occurrenceId,
    p_scope: 'all',
    p_mutation_type: 'update',
    p_expected_series_revision: 1,
    p_changed_paths: ['event.title'],
    p_detail_patch: { event: { title: `${prefix} projected` } },
    p_series_patch: {},
    p_actor: { type: 'integration_fixture' },
    p_correlation_id: runId,
  })
  if (mutationError) throw mutationError
  assert.equal(mutation.google_sync_status, 'pending')

  const createRun = await processOutbox()
  const { data: createOperation, error: createOperationError } = await db
    .from('calendar_sync_operations')
    .select('status,google_response,conflict_detected,last_error')
    .eq('action_id', actionIds[0])
    .single()
  if (createOperationError) throw createOperationError
  assert.equal(createOperation.status, 'succeeded', JSON.stringify({ createRun, lastError: createOperation.last_error }))
  assert.equal(createOperation.conflict_detected, false)
  const googleEvent = createOperation.google_response.googleEvent
  googleEventId = googleEvent.id
  assert.equal(googleEvent.summary, `${prefix} projected`)
  assert.deepEqual(googleEvent.recurrence, ['RRULE:FREQ=WEEKLY;COUNT=2'])
  assert.equal(googleEvent.extendedProperties.private.casaSeriesId, seriesId)
  assert.match(googleEvent.description, /Bring projection proof/)

  const { data: deletion, error: deletionError } = await db.rpc('recurrence_delete_scoped_core', {
    p_action_id: actionIds[1],
    p_selected_event_id: occurrenceId,
    p_scope: 'all',
    p_expected_series_revision: 2,
    p_series_patch: {},
    p_actor: { type: 'integration_fixture' },
    p_correlation_id: runId,
  })
  if (deletionError) throw deletionError
  assert.equal(deletion.google_sync_status, 'pending')
  await processOutbox()
  const { data: deleteOperation, error: deleteOperationError } = await db
    .from('calendar_sync_operations')
    .select('status')
    .eq('action_id', actionIds[1])
    .single()
  if (deleteOperationError) throw deleteOperationError
  assert.equal(deleteOperation.status, 'succeeded')

  console.log(JSON.stringify({
    success: true,
    googleMasterCreated: true,
    fullCasaDetailsProjected: true,
    privateIdentityProjected: true,
    deleteConfirmed: true,
  }))
} finally {
  if (googleEventId) {
    const { data: token } = await db
      .from('google_tokens')
      .select('access_token')
      .eq('google_email', 'jacobrtabor@gmail.com')
      .single()
    if (token?.access_token) {
      await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(googleEventId)}`,
        { method: 'DELETE', headers: { authorization: `Bearer ${token.access_token}` } },
      )
    }
  }
  await db.from('calendar_sync_operations').delete().in('action_id', actionIds)
  await db.from('recurrence_mutation_history').delete().in('action_id', actionIds)
  if (occurrenceId) await db.from('events').delete().eq('id', occurrenceId)
  if (seriesId) await db.from('event_series').delete().eq('id', seriesId)
  if (templateId) await db.from('events').delete().eq('id', templateId)
  await db.from('events').delete().ilike('title', `${prefix}%`)
}
