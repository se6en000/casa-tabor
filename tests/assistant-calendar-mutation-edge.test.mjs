import assert from 'node:assert/strict'
import test from 'node:test'

import {
  calendarMutationClarification,
  answerPendingSelectiveClear,
  calendarDeleteAmbiguityClarification,
  isCalendarMutationDisambiguationFollowUp,
  resolveCalendarDeleteDisambiguation,
  resolveClarifiedCalendarCreate,
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

test('active event shifts preserve duration and support relational scheduling', () => {
  const shifted = resolveActiveCalendarMutation('Move that trip back two days.', event, [event], { utcOffset: '-04:00' })
  assert.equal(shifted.args.start, '2026-07-14T14:00:00.000Z')
  assert.equal(shifted.args.end, '2026-07-14T15:00:00.000Z')

  const meeting = { ...event, id: 'meeting', title: 'School meeting', start_time: '2026-07-16T18:30:00.000Z', end_time: '2026-07-16T19:30:00.000Z' }
  const after = resolveActiveCalendarMutation('Put it immediately after the meeting instead.', event, [event, meeting], { utcOffset: '-04:00' })
  assert.equal(after.args.start, meeting.end_time)
  assert.equal(after.args.end, '2026-07-16T20:30:00.000Z')
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
