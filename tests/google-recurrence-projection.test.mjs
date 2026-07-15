import test from 'node:test'
import assert from 'node:assert/strict'
import {
  projectionHashInput,
  replaceCasaDetailsBlock,
  serializeGoogleRecurrenceProjection,
} from '../supabase/functions/_shared/google-recurrence-projection-core.mjs'

const event = {
  id: 'event-1',
  title: 'Soccer',
  start_time: '2026-07-20T20:00:00.000Z',
  end_time: '2026-07-20T21:00:00.000Z',
  all_day: false,
  location_name: 'Field House',
  address: '1 Main St',
}
const series = {
  id: 'series-1',
  revision: 7,
  timezone: 'America/New_York',
  recurrence_lines: ['RRULE:FREQ=WEEKLY;BYDAY=MO'],
}

test('projection maps native Google fields and private Casa identity', () => {
  const payload = serializeGoogleRecurrenceProjection({ event, series })
  assert.equal(payload.summary, 'Soccer')
  assert.equal(payload.location, 'Field House, 1 Main St')
  assert.equal(payload.start.timeZone, 'America/New_York')
  assert.deepEqual(payload.recurrence, ['RRULE:FREQ=WEEKLY;BYDAY=MO'])
  assert.deepEqual(payload.extendedProperties.private, {
    casaSeriesId: 'series-1',
    casaEventId: 'event-1',
    casaRevision: '7',
    casaProjectionVersion: '2',
  })
})

test('Casa details block is idempotent and preserves Google-owned description text', () => {
  const first = serializeGoogleRecurrenceProjection({
    event,
    series,
    existingGoogleDescription: 'Organizer notes stay here.',
    bundle: {
      members: [{ name: 'Jacob' }],
      enrichment: { what_to_bring: ['Water'], prep_notes: 'Leave by 3:30' },
    },
  })
  const second = serializeGoogleRecurrenceProjection({
    event,
    series,
    existingGoogleDescription: first.description,
    bundle: { members: [{ name: 'Jacob' }] },
  })
  assert.equal(second.description.match(/CASA-TABOR-DETAILS:START/g)?.length, 1)
  assert.match(second.description, /^Organizer notes stay here\./)
  assert.doesNotMatch(second.description, /Water/)
})

test('household members never become Google invitations implicitly', () => {
  const withoutInvites = serializeGoogleRecurrenceProjection({
    event,
    series,
    bundle: { members: [{ name: 'Jacob', email: 'jacob@example.com' }] },
  })
  assert.equal(withoutInvites.attendees, undefined)

  const explicit = serializeGoogleRecurrenceProjection({
    event,
    series,
    invitationAttendees: [{ email: 'guest@example.com', displayName: 'Guest' }],
  })
  assert.deepEqual(explicit.attendees, [{ email: 'guest@example.com', displayName: 'Guest' }])
})

test('all-day projection preserves Google exclusive end dates', () => {
  const payload = serializeGoogleRecurrenceProjection({
    event: { ...event, all_day: true, start_time: '2026-07-20', end_time: '2026-07-21' },
    series,
  })
  assert.deepEqual(payload.start, { date: '2026-07-20' })
  assert.deepEqual(payload.end, { date: '2026-07-21' })
})

test('details are capped and projection hash input is stable', () => {
  const capped = replaceCasaDetailsBlock('', ['x'.repeat(10_000)])
  assert.ok(capped.length <= 8_000)
  assert.equal(
    projectionHashInput({ summary: 'A', location: 'B' }),
    projectionHashInput({ location: 'B', summary: 'A' }),
  )
})

test('projection fails closed without durable identity and revision', () => {
  assert.throws(
    () => serializeGoogleRecurrenceProjection({ event, series: { ...series, revision: 0 } }),
    /revisioned series/,
  )
})
