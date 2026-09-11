import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveCalendarBatchCreate } from '../supabase/functions/_shared/assistant-calendar-agent.mjs'

// Phase 2 of the multi-event create feature: given several independent
// create turns (from a "add soccer Tuesday, piano Thursday, and the dentist
// Monday" style request), resolve each one to concrete calendar.create args
// the exact same deterministic way a single create is resolved today --
// reusing resolveCreate's own date/time/timezone math per item rather than
// duplicating it, so a batch item is held to the same correctness bar as a
// single create.

const context = {
  currentDate: '2026-07-14T16:45:00-04:00',
  utcOffset: '-04:00',
}

test('resolves every well-formed turn in the batch to its own calendar.create args', () => {
  const turns = [
    { patch: { title: 'Soccer Practice', date_reference: { kind: 'weekday', weekday: 'tuesday' }, time: { hour: 4, period: 'pm' } } },
    { patch: { title: 'Piano Lesson', date_reference: { kind: 'weekday', weekday: 'thursday' }, time: { hour: 3, period: 'pm' } } },
    { patch: { title: 'Dentist', date_reference: { kind: 'weekday', weekday: 'monday' }, time: { hour: 9, period: 'am' } } },
  ]

  const results = resolveCalendarBatchCreate(turns, context)

  assert.equal(results.length, 3)
  assert.equal(results[0].status, 'resolved')
  assert.equal(results[0].args.title, 'Soccer Practice')
  assert.equal(results[1].args.title, 'Piano Lesson')
  assert.equal(results[2].args.title, 'Dentist')
})

test('a reminder-typed item with an explicit all_day flag resolves without a clock time', () => {
  const turns = [
    { patch: { title: 'Field trip form due', event_type: 'reminder', date_reference: { kind: 'tomorrow' }, all_day: true } },
  ]

  const results = resolveCalendarBatchCreate(turns, context)

  assert.equal(results[0].status, 'resolved')
  assert.equal(results[0].args.event_type, 'reminder')
})

test('a reminder-typed item with a date but no time and no all_day flag asks for a time rather than silently guessing all-day', () => {
  // Unlike a single create, a batch item has no raw user text of its own for
  // the hardenExplicitReminderTurn safety net to inspect -- the planner is
  // expected to set patch.all_day=true itself for a date-only reminder (same
  // instruction as the single-item schema). If it doesn't, asking is correct;
  // guessing would risk silently misinterpreting the item.
  const turns = [
    { patch: { title: 'Field trip form due', event_type: 'reminder', date_reference: { kind: 'tomorrow' } } },
  ]

  const results = resolveCalendarBatchCreate(turns, context)

  assert.equal(results[0].status, 'needs_input')
  assert.equal(results[0].slot, 'time')
})

test('one item missing a required detail is flagged for that item only, without discarding the rest of the batch', () => {
  const turns = [
    { patch: { title: 'Soccer Practice', date_reference: { kind: 'weekday', weekday: 'tuesday' }, time: { hour: 4, period: 'pm' } } },
    { patch: { title: 'Piano Lesson' } }, // no date at all
    { patch: { title: 'Dentist', date_reference: { kind: 'weekday', weekday: 'monday' }, time: { hour: 9, period: 'am' } } },
  ]

  const results = resolveCalendarBatchCreate(turns, context)

  assert.equal(results.length, 3)
  assert.equal(results[0].status, 'resolved')
  assert.equal(results[1].status, 'needs_input')
  assert.equal(results[1].slot, 'date')
  assert.equal(results[2].status, 'resolved')
})

test('an item missing a title entirely is flagged for that item rather than crashing the batch', () => {
  const turns = [
    { patch: { date_reference: { kind: 'tomorrow' }, time: { hour: 4, period: 'pm' } } },
  ]

  const results = resolveCalendarBatchCreate(turns, context)

  assert.equal(results[0].status, 'needs_input')
  assert.equal(results[0].slot, 'title')
})

test('an empty batch resolves to an empty list', () => {
  assert.deepEqual(resolveCalendarBatchCreate([], context), [])
  assert.deepEqual(resolveCalendarBatchCreate(null, context), [])
})

test('rejects the whole batch deterministically (not per-item) when the household UTC offset is missing, since every item needs it', () => {
  const turns = [
    { patch: { title: 'Soccer Practice', date_reference: { kind: 'tomorrow' }, time: { hour: 4, period: 'pm' } } },
  ]

  const results = resolveCalendarBatchCreate(turns, { currentDate: context.currentDate })

  assert.equal(results[0].status, 'rejected')
  assert.equal(results[0].code, 'valid_household_utc_offset_required')
})
