import test from 'node:test'
import assert from 'node:assert/strict'
import { weekAround, needsAroundFetch, stripDates, dayHeading, mergeEvents, dayWhen } from '../src/wall/dayFocus.ts'
import { answerDay } from '../src/wall/assistant.ts'

// Any day (Jake, 2026-09-29/30): "Show me the events on October 17th" … "Can you open this day for me" —
// it couldn't. Now an answer about one day opens it (or offers to), with the week around it loaded so
// he can swipe before and after ("load the week so I can swipe before and after the day I asked about").
const NOW = new Date(2026, 8, 30, 10, 0) // Wed, Sep 30
const day = (m, d) => new Date(2026, m, d)
const key = (d) => d.toDateString()

test('the week around a day: three days before, the day, three after', () => {
  assert.deepEqual(weekAround(day(9, 17)).map(key), [14, 15, 16, 17, 18, 19, 20].map((d) => key(day(9, d))))
})

test("a week outside the wall's cache (7 days back to 14 ahead) is fetched; inside it, not", () => {
  assert.equal(needsAroundFetch(day(9, 17), NOW), true, 'Oct 20 is past the 14 days')
  assert.equal(needsAroundFetch(day(9, 3), NOW), false)
  assert.equal(needsAroundFetch(day(8, 20), NOW), true, 'Sep 17 is before the 7 days back')
  assert.equal(needsAroundFetch(null, NOW), false)
})

test('the strip: the usual week, unless the day on show is outside it — then Today, and that week', () => {
  const usual = [0, 1, 2, 3, 4, 5, 6].map((i) => day(8, 30 + i))
  assert.equal(stripDates(usual, day(9, 3), NOW), null, 'in the usual week: the usual strip')
  assert.equal(stripDates(usual, null, NOW), null)
  assert.deepEqual(stripDates(usual, day(9, 17), NOW).map(key), [key(day(8, 30)), ...[14, 15, 16, 17, 18, 19, 20].map((d) => key(day(9, d)))])
  // A week that holds today doesn't repeat it.
  assert.deepEqual(stripDates(usual, day(8, 28), NOW).map(key), [25, 26, 27, 28, 29, 30].map((d) => key(day(8, d))).concat(key(day(9, 1))))
})

test('the heading: a weekday this week; the date too further out; LOOKING BACK for a past day', () => {
  assert.equal(dayHeading(day(9, 2), NOW), 'LOOKING AHEAD · FRIDAY')
  assert.equal(dayHeading(day(9, 17), NOW), 'LOOKING AHEAD · SATURDAY, OCT 17')
  assert.equal(dayHeading(day(8, 25), NOW), 'LOOKING BACK · FRIDAY, SEP 25')
})

test('events from the cache and the far week together, each once', () => {
  assert.deepEqual(mergeEvents([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }]).map((e) => e.id), ['a', 'b', 'c'])
  assert.deepEqual(mergeEvents([{ id: 'a' }], null).map((e) => e.id), ['a'])
})

const msg = (extra) => ({ id: 'm', role: 'assistant', content: 'x', timestamp: new Date(), ...extra })
test('the day an answer is about: named by Casa (opened when asked), or a quick answer within one day', () => {
  assert.deepEqual(answerDay(msg({ showDay: { date: '2026-10-17', open: true } }), NOW), { date: day(9, 17), open: true })
  assert.deepEqual(answerDay(msg({ showDay: { date: '2026-10-17', open: false } }), NOW), { date: day(9, 17), open: false })
  const range = (start, end) => ({ conversationState: { activeEntityType: 'calendar_range', range: { start, end, contextStart: start, contextEnd: end, label: '' }, eventIds: [], expectedFollowUp: 'calendar_range_follow_up', establishedAt: '' } })
  // "What do we have next Saturday?" (live, 2026-09-30): 9 AM and 2 PM on Oct 3.
  assert.deepEqual(answerDay(msg(range('2026-10-03T13:00:00.000Z', '2026-10-03T20:00:00.000Z')), NOW), { date: day(9, 3), open: false })
  // The long answer about Oct 17 carried a range from Sep 30 to Oct 18: no day from that.
  assert.equal(answerDay(msg(range('2026-09-30T22:30:00.000Z', '2026-10-18T23:59:59.000Z')), NOW), null)
  assert.equal(answerDay(msg(range('2026-09-30T14:00:00.000Z', '2026-09-30T20:00:00.000Z')), NOW), null, 'today is already on the wall')
  assert.equal(answerDay(msg({ showDay: { date: 'soon', open: true } }), NOW), null)
  assert.equal(answerDay(null, NOW), null)
})

test('the phone says which day: today, tomorrow, a weekday, or the date further out', () => {
  assert.equal(dayWhen(day(8, 30), NOW), 'today')
  assert.equal(dayWhen(day(9, 1), NOW), 'tomorrow')
  assert.equal(dayWhen(day(9, 3), NOW), 'on Saturday')
  assert.equal(dayWhen(day(9, 17), NOW), 'on Saturday, Oct 17')
})
