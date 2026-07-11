import test from 'node:test'
import assert from 'node:assert/strict'

import { tryLocalScheduleAnswer } from '../src/lib/scheduleFastPath.mjs'

// Fixed "now": Wed Jul 8 2026, 10:00 local
const NOW = new Date(2026, 6, 8, 10, 0, 0)
const iso = (y, mo, d, h, mi) => new Date(y, mo, d, h, mi, 0).toISOString()

const events = [
  { title: 'Standup', start_time: iso(2026, 6, 8, 9, 0), end_time: iso(2026, 6, 8, 9, 30) }, // today, past
  { title: 'Dentist', start_time: iso(2026, 6, 8, 14, 0), end_time: iso(2026, 6, 8, 15, 0), location_name: 'Downtown' }, // today, upcoming
  { title: 'Owen Birthday', start_time: iso(2026, 6, 9, 12, 0), end_time: iso(2026, 6, 9, 13, 0) }, // tomorrow
]

test('fast-path: "what\'s next" returns the next upcoming event', () => {
  const out = tryLocalScheduleAnswer("what's next", events, NOW)
  assert.ok(out && out.includes('Dentist'), `expected Dentist, got: ${out}`)
  assert.ok(out.includes('Downtown'), 'should include location')
})

test('fast-path: in-progress event is surfaced as happening now', () => {
  const live = [{ title: 'Meeting', start_time: iso(2026, 6, 8, 9, 30), end_time: iso(2026, 6, 8, 10, 30) }]
  const out = tryLocalScheduleAnswer("what's up next", live, NOW)
  assert.ok(out && out.includes('Happening now'), `expected happening-now, got: ${out}`)
})

test('fast-path: "what\'s on today" lists only remaining today events', () => {
  const out = tryLocalScheduleAnswer("what's on today", events, NOW)
  assert.ok(out && out.includes('Dentist'), 'includes upcoming today event')
  assert.ok(!out.includes('Standup'), 'excludes past today event')
  assert.ok(!out.includes('Owen Birthday'), 'excludes tomorrow event')
})

test('fast-path: "what\'s on tomorrow" lists tomorrow only', () => {
  const out = tryLocalScheduleAnswer("what's on tomorrow", events, NOW)
  assert.ok(out && out.includes('Owen Birthday'), 'includes tomorrow event')
  assert.ok(!out.includes('Dentist'), 'excludes today event')
})

test('fast-path: empty today returns a clean nothing-left message', () => {
  const out = tryLocalScheduleAnswer("what's on today", [events[0]], NOW)
  assert.equal(out, 'Nothing left on your calendar today.')
})

test('fast-path: action verbs are NOT fast-pathed (defers to LLM)', () => {
  assert.equal(tryLocalScheduleAnswer('add dentist tomorrow', events, NOW), null)
  assert.equal(tryLocalScheduleAnswer('move my next event', events, NOW), null)
  assert.equal(tryLocalScheduleAnswer('remind me about tomorrow', events, NOW), null)
})

test('fast-path: unrelated / long queries return null', () => {
  assert.equal(tryLocalScheduleAnswer('what is the weather like in Paris right now please', events, NOW), null)
  assert.equal(tryLocalScheduleAnswer('tell me a joke', events, NOW), null)
})

test('fast-path: production schedule phrasing stays deterministic', () => {
  assert.match(tryLocalScheduleAnswer("what's up today", events, NOW), /thing left today/)
  assert.match(tryLocalScheduleAnswer('what do we have going on today?', events, NOW), /thing left today/)
  assert.match(tryLocalScheduleAnswer("what's next on the calendar", events, NOW), /Up next/)
  assert.match(tryLocalScheduleAnswer('what is on tomorrow', events, NOW), /thing tomorrow/)
  assert.match(tryLocalScheduleAnswer("what's on the calendar for tomorrow can you tell me", events, NOW), /thing tomorrow/)
})

test('fast-path: next today never leaks into tomorrow', () => {
  const onlyTomorrow = [events.find((event) => event.title === 'Owen Birthday')]
  assert.equal(tryLocalScheduleAnswer("what's next today", onlyTomorrow, NOW), 'Nothing else on your calendar today.')
})

test('fast-path: compound schedule-and-write requests stay on the safe lane', () => {
  assert.equal(
    tryLocalScheduleAnswer("what's going on tomorrow and set a reminder to take out the trash", events, NOW),
    null,
  )
  assert.equal(
    tryLocalScheduleAnswer("what's on tomorrow and tell me a joke", events, NOW),
    null,
  )
})
