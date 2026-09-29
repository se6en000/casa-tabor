import test from 'node:test'
import assert from 'node:assert/strict'
import { FULL_AI_TOOLS, READ_TOOLS, buildFullAiSystem, findEventsRange } from '../supabase/functions/_shared/assistant-full-ai.mjs'

// Jake's bug reports 2026-09-28 8:14 and 8:16 PM: "What is going on October 24?" → "I can only see
// about three weeks out". The whole calendar, past and future (reminders too), is one lookup away.

test('find_events is a read tool the assistant can call with dates and/or words', () => {
  const tool = FULL_AI_TOOLS.find((t) => t.name === 'find_events')
  assert.ok(tool)
  assert.deepEqual(Object.keys(tool.parameters.properties).sort(), ['from', 'query', 'to'])
  assert.ok(READ_TOOLS.has('find_events'))
})

test('the prompt says the calendar below is only three weeks, and anything else is a find_events away', () => {
  const system = buildFullAiSystem({ family: [], events: [], groceries: [], pending: [], onScreenIds: [], utcOffset: '-04:00', now: new Date('2026-09-28T20:00:00-04:00') })
  assert.match(system, /find_events/)
  assert.doesNotMatch(system, /can only see/i)
})

test('the range: a day, a span, or words across two years either side; never unbounded', () => {
  const today = '2026-09-28'
  assert.deepEqual(findEventsRange({ from: '2026-10-24' }, today), { from: '2026-10-24', to: '2026-10-24', words: [] })
  assert.deepEqual(findEventsRange({ from: '2026-10-01', to: '2026-10-31' }, today), { from: '2026-10-01', to: '2026-10-31', words: [] })
  assert.deepEqual(findEventsRange({ query: 'Strings festival' }, today), { from: '2024-09-28', to: '2028-09-28', words: ['strings', 'festival'] })
  assert.deepEqual(findEventsRange({ from: '2026-12-01', to: '2026-11-01' }, today), { from: '2026-11-01', to: '2026-12-01', words: [] }, 'backwards is turned round')
  assert.equal(findEventsRange({ from: 'nonsense' }, today), null)
  assert.deepEqual(findEventsRange({ query: 'a %_ the' }, today).words, [], 'no wildcard characters or tiny words reach the search')
})

// Live check 2026-09-28: "Did the strings festival appointment get created?" (no date) → "I don't see
// any" — answered from the three weeks shown without searching. Never "not on the calendar" unsearched.
test('the assistant is told to search before saying something is not on the calendar', () => {
  const system = buildFullAiSystem({ family: [], events: [], groceries: [], pending: [], onScreenIds: [], utcOffset: '-04:00', now: new Date('2026-09-28T20:00:00-04:00') })
  assert.match(system, /before saying .*isn.t on the calendar.*find_events/is)
})
