import assert from 'node:assert/strict'
import test from 'node:test'

import {
  calendarMutationClarification,
  answerPendingSelectiveClear,
  calendarDeleteAmbiguityClarification,
  isCalendarMutationDisambiguationFollowUp,
  resolveCalendarDeleteDisambiguation,
  resolveClarifiedCalendarCreate,
  resolveDefaultCalendarCreate,
  resolvePendingCalendarCorrection,
  resolveActiveCalendarMutation,
  singularBulkDeleteClarification,
} from '../supabase/functions/_shared/assistant-calendar-mutation-edge.mjs'

const event = {
  id: 'dentist',
  title: 'Dentist appointment',
  start_time: '2026-07-16T14:00:00.000Z',
  end_time: '2026-07-16T15:00:00.000Z',
  updated_at: '2026-07-13T12:00:00.000Z',
}

test('complete appointment requests default to today, AM, and one hour', () => {
  const created = resolveDefaultCalendarCreate(
    'Create an appointment for 10:30 to go to Sky Zone.',
    { now: new Date('2026-07-19T12:53:07.000Z'), utcOffset: '-04:00' },
  )
  assert.deepEqual(created.args, {
    title: 'Sky Zone',
    start: '2026-07-19T14:30:00.000Z',
    end: '2026-07-19T15:30:00.000Z',
    members: [],
    event_type: 'event',
  })
  assert.deepEqual(created.defaults, {
    date: 'today',
    meridiem: 'am',
    duration_minutes: 60,
  })
  assert.equal(
    resolveDefaultCalendarCreate(
      'Create an appointment for 10:30 PM to go to Sky Zone.',
      { now: new Date('2026-07-19T12:53:07.000Z'), utcOffset: '-04:00' },
    ).args.start,
    '2026-07-20T02:30:00.000Z',
  )
  assert.equal(
    resolveDefaultCalendarCreate(
      'Create an appointment tomorrow for 10:30 to go to Sky Zone.',
      { now: new Date('2026-07-19T12:53:07.000Z'), utcOffset: '-04:00' },
    ),
    null,
  )
  assert.deepEqual(
    resolveDefaultCalendarCreate(
      'create an appointment at 10:30. To go to Skyzone.',
      { now: new Date('2026-07-19T13:52:46.000Z'), utcOffset: '-04:00' },
    ).args,
    {
      title: 'Skyzone',
      start: '2026-07-19T14:30:00.000Z',
      end: '2026-07-19T15:30:00.000Z',
      members: [],
      event_type: 'event',
    },
  )
  for (const phrase of [
    'create an appointment at 10:30? To go to Skyzone!',
    'create an appointment—at 10:30; to go to Skyzone…',
    '(create an appointment) at 10:30, to go to Skyzone.',
  ]) {
    assert.equal(
      resolveDefaultCalendarCreate(
        phrase,
        { now: new Date('2026-07-19T13:52:46.000Z'), utcOffset: '-04:00' },
      ).args.start,
      '2026-07-19T14:30:00.000Z',
      phrase,
    )
  }
})

test('active event shifts preserve duration and support relational scheduling', () => {
  const shifted = resolveActiveCalendarMutation('Move that trip back two days.', event, [event], { utcOffset: '-04:00' })
  assert.equal(shifted.args.start, '2026-07-14T14:00:00.000Z')
  assert.equal(shifted.args.end, '2026-07-14T15:00:00.000Z')

  const meeting = { ...event, id: 'meeting', title: 'School meeting', start_time: '2026-07-16T18:30:00.000Z', end_time: '2026-07-16T19:30:00.000Z' }
  const after = resolveActiveCalendarMutation('Put it immediately after the meeting instead.', event, [event, meeting], { utcOffset: '-04:00' })
  assert.equal(after.args.start, meeting.end_time)
  assert.equal(after.args.end, '2026-07-16T20:30:00.000Z')

  const bumped = resolveActiveCalendarMutation(
    'Can you bump that back half an hour? Same length.',
    { ...event, start_time: '2026-07-17T21:00:00.000Z', end_time: '2026-07-17T22:30:00.000Z' },
    [],
    { utcOffset: '-04:00' },
  )
  assert.equal(bumped.args.start, '2026-07-17T21:30:00.000Z')
  assert.equal(bumped.args.end, '2026-07-17T23:00:00.000Z')
})

test('active event moves surface conflicts and recurring edit limits', () => {
  const meeting = { ...event, id: 'meeting', title: 'School meeting', start_time: '2026-07-16T18:30:00.000Z', end_time: '2026-07-16T19:30:00.000Z' }
  const conflict = resolveActiveCalendarMutation('Move it to 3 PM Thursday.', event, [event, meeting], { utcOffset: '-04:00' })
  assert.match(conflict.text, /overlaps "School meeting"/)

  const recurring = resolveActiveCalendarMutation('Move it to 6 PM.', { ...event, rrule: 'FREQ=WEEKLY' }, [event], { utcOffset: '-04:00' })
  assert.match(recurring.text, /recurring event/)
  const oneOccurrence = resolveActiveCalendarMutation('Just that one.', { ...event, rrule: 'FREQ=WEEKLY' }, [event], { utcOffset: '-04:00' })
  assert.match(oneOccurrence.text, /event editor/)
})

test('active event pronoun deletes preserve the authoritative ID', () => {
  const deletion = resolveActiveCalendarMutation('Delete that one.', event, [event], { utcOffset: '-04:00' })
  assert.equal(deletion.tool, 'delete_event')
  assert.deepEqual(deletion.args, {
    id: 'dentist',
    title: 'Dentist appointment',
  })

  const recurring = resolveActiveCalendarMutation(
    'Remove it.',
    { ...event, rrule: 'FREQ=WEEKLY' },
    [event],
    { utcOffset: '-04:00' },
  )
  assert.match(recurring.text, /recurring event/)
})

test('canonical recurring mutations require and preserve an explicit scope', () => {
  const canonical = {
    ...event,
    series_id: 'series-1',
    record_kind: 'occurrence',
    series_revision_applied: 4,
  }
  const clarification = resolveActiveCalendarMutation(
    'Move it to 6 PM.',
    canonical,
    [canonical],
    { utcOffset: '-04:00' },
  )
  assert.match(clarification.text, /only this event, this and following events, or the entire series/i)

  const update = resolveActiveCalendarMutation(
    'Move it to 6 PM for this event and all following events.',
    canonical,
    [canonical],
    { utcOffset: '-04:00' },
  )
  assert.equal(update.tool, 'update_event')
  assert.equal(update.args.recurrence_scope, 'future')
  assert.equal(update.args.expected_series_revision, 4)

  const deletion = resolveActiveCalendarMutation(
    'Delete it for the entire series.',
    canonical,
    [canonical],
    { utcOffset: '-04:00' },
  )
  assert.equal(deletion.tool, 'delete_event')
  assert.equal(deletion.args.recurrence_scope, 'all')
})

test('ambiguous times and singular bulk deletes clarify safely', () => {
  assert.equal(calendarMutationClarification('Schedule tutoring next sat at ate.'), 'Did you mean 8 AM or 8 PM?')
  assert.match(
    singularBulkDeleteClarification(
      'Delete the dentist appointment Thursday.',
      'delete_events_by_title',
      { ids: ['a', 'b'] },
      [{ ...event, id: 'a' }, { ...event, id: 'b' }],
    ),
    /Which one should I delete/,
  )
  for (const phrase of [
    'Delete the dentist apt on Thursday.',
    'Delete the dentist apt.',
    'Remove dentist appointment Thursday.',
  ]) {
    assert.match(
      calendarDeleteAmbiguityClarification(
        phrase,
        [
          { ...event, id: 'am', title: 'Jake | Family Dentist Appointment', start_time: '2026-07-16T10:00:00-04:00' },
          { ...event, id: 'pm', title: 'Jake | Dentist Appointment', start_time: '2026-07-16T15:00:00-04:00' },
        ],
        { utcOffset: '-04:00' },
      ),
      /Which one should I delete/,
      phrase,
    )
  }
  const shortenedFollowUp = resolveCalendarDeleteDisambiguation(
    'delete the dentist apt',
    'the afternoon one',
    [
      { ...event, id: 'am', title: 'Jake | Family Dentist Appointment', start_time: '2026-07-16T10:00:00-04:00' },
      { ...event, id: 'pm', title: 'Jake | Dentist Appointment', start_time: '2026-07-16T15:00:00-04:00' },
    ],
    { utcOffset: '-04:00' },
  )
  assert.equal(shortenedFollowUp.args.id, 'pm')
  assert.equal(
    singularBulkDeleteClarification('Delete all dentist appointments.', 'delete_events_by_title', { ids: ['a', 'b'] }, [],),
    null,
  )
  const clarified = resolveClarifiedCalendarCreate(
    'Schedule tutoring next sat at ate.',
    'Eight in the morning.',
    { now: new Date('2026-07-13T20:00:00-04:00') },
  )
  assert.equal(clarified.tool, 'create_event')
  assert.equal(new Date(clarified.args.start).getHours(), 8)
  const disambiguated = resolveCalendarDeleteDisambiguation(
    'Delete the edge dentist appointment Thursday.',
    'The afternoon one.',
    [
      { ...event, id: 'am', title: '[QA] Edge dentist appointment', start_time: '2026-07-16T10:00:00-04:00' },
      { ...event, id: 'pm', title: '[QA] Edge dentist appointment', start_time: '2026-07-16T15:00:00-04:00' },
    ],
    { utcOffset: '-04:00' },
  )
  assert.equal(disambiguated.args.id, 'pm')
  assert.equal(
    isCalendarMutationDisambiguationFollowUp(
      'Delete the edge dentist appointment Thursday.',
      'The afternoon one.',
    ),
    true,
  )
  assert.match(
    calendarDeleteAmbiguityClarification(
      'Delete the edge dentist appointment Thursday.',
      [
        { ...event, id: 'am', title: '[QA] Edge dentist appointment', start_time: '2026-07-16T10:00:00-04:00' },
        { ...event, id: 'pm', title: '[QA] Edge dentist appointment', start_time: '2026-07-16T15:00:00-04:00' },
      ],
      { utcOffset: '-04:00' },
    ),
    /Which one should I delete/,
  )
  assert.equal(
    answerPendingSelectiveClear('What exactly would remain?', {
      tool: 'delete_events_by_title',
      args: { title_query: 'Thursday except school pickup' },
    }),
    'school pickup would remain on the calendar.',
  )
})

test('corrections replace pending create details without creating a duplicate', () => {
  for (const text of [
    'Actually, make that Saturday at 10 in the morning.',
    'Wait—change that to Saturday at 10 AM.',
    'Saturday at 10 AM instead.',
    'No, move that to Saturday at 10 in the morning.',
  ]) {
    const corrected = resolvePendingCalendarCorrection(
      text,
      {
        tool: 'create_event',
        args: {
          title: 'Swim practice',
          start: '2026-07-17T20:00:00.000Z',
          end: '2026-07-17T21:00:00.000Z',
          members: [],
          event_type: 'event',
        },
      },
      { now: new Date('2026-07-14T10:00:00-04:00'), utcOffset: '-04:00' },
    )
    assert.equal(corrected.tool, 'create_event', text)
    assert.equal(corrected.args.title, 'Swim practice', text)
    assert.equal(corrected.args.start, '2026-07-18T14:00:00.000Z', text)
    assert.equal(Date.parse(corrected.args.end) - Date.parse(corrected.args.start), 60 * 60000, text)
  }
})

test('pending create member clarification stays a create revision', () => {
  const corrected = resolvePendingCalendarCorrection(
    'Mom is Kelly and make it for an hour and a half.',
    {
      tool: 'create_event',
      args: {
        title: 'Dinner with Mom',
        start: '2026-07-19T22:00:00.000Z',
        end: '2026-07-19T23:00:00.000Z',
        members: [],
      },
    },
    {
      now: new Date('2026-07-14T14:00:00.000Z'),
      utcOffset: '-04:00',
      familyNames: ['Jake', 'Kelly', 'Owen'],
    },
  )
  assert.equal(corrected.tool, 'create_event')
  assert.deepEqual(corrected.args.members, ['Kelly'])
  assert.equal(Date.parse(corrected.args.end) - Date.parse(corrected.args.start), 90 * 60000)
})

test('confirmed-event corrections infer the existing period and honor a new duration', () => {
  const dinner = {
    ...event,
    id: 'dinner',
    title: 'Dinner with Kelly',
    start_time: '2026-07-19T22:00:00.000Z',
    end_time: '2026-07-19T23:00:00.000Z',
  }
  const corrected = resolveActiveCalendarMutation(
    'Actually, make it Saturday at seven for two hours.',
    dinner,
    [dinner],
    {
      now: new Date('2026-07-14T14:00:00.000Z'),
      utcOffset: '-04:00',
      familyNames: ['Jake', 'Owen'],
    },
  )
  assert.equal(corrected.tool, 'update_event')
  assert.equal(corrected.args.start, '2026-07-18T23:00:00.000Z')
  assert.equal(corrected.args.end, '2026-07-19T01:00:00.000Z')
})

test('all-day context does not block a timed confirmed-event correction', () => {
  const dinner = {
    ...event,
    id: 'dinner',
    title: 'Dinner with Kelly',
    start_time: '2026-07-19T22:00:00.000Z',
    end_time: '2026-07-19T23:00:00.000Z',
  }
  const allDay = {
    ...event,
    id: 'all-day',
    title: 'Sunday marker',
    all_day: true,
    start_time: '2026-07-19T04:00:00.000Z',
    end_time: '2026-07-20T03:59:59.000Z',
  }
  const corrected = resolveActiveCalendarMutation(
    'Actually, make it Saturday at eleven PM for two hours.',
    dinner,
    [dinner, allDay],
    {
      now: new Date('2026-07-14T14:00:00.000Z'),
      utcOffset: '-04:00',
      familyNames: ['Jake', 'Owen'],
    },
  )
  assert.equal(corrected.tool, 'update_event')
  assert.equal(corrected.args.start, '2026-07-19T03:00:00.000Z')
})

test('active-event attendee follow-ups become exact confirmation-gated updates', () => {
  const update = resolveActiveCalendarMutation(
    'Add Owen too.',
    event,
    [event],
    { utcOffset: '-04:00', familyNames: ['Jake', 'Owen'] },
  )
  assert.equal(update.tool, 'update_event')
  assert.equal(update.args.id, event.id)
  assert.deepEqual(update.args.members_add, ['Owen'])
})
