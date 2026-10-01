import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDayPlan } from '../src/wall/engine/dayPlan.ts'
import { buildTrips } from '../src/wall/engine/travel.ts'
import { decisionsFor } from '../src/wall/decisions.ts'
import { casaTopic, snoozeUntil, pushNow, pushMessage } from '../src/wall/casaTalk.ts'
import { members, routines, tripEvents, travelPrefs, WEDNESDAY, THURSDAY, on } from './fixtures/wall-trip-2026-10-07.mjs'

// Canvas row 21 (Jake, 2026-10-01, approved): "Casa wants to talk to you" — the one thing a person must decide,
// said in two sentences with the answers, within the next day. Jake is in Dallas Wed–Thu; Thursday's 7:35 drop-off
// (his usual run) has no one.
const [trip] = buildTrips(tripEvents, members, travelPrefs)
const plans = (state = {}) => {
  const planOn = (date) => buildDayPlan({ date, members, routines, events: tripEvents, travel: [trip], tripState: state[date.getDate()] ?? { drivers: {}, departed: {} } })
  return planOn
}
const decisions = (now, state = {}) => [WEDNESDAY, THURSDAY].flatMap((date) => {
  const plan = plans(state)(date)
  return decisionsFor(plan, members, now, new Set(Object.keys(state[date.getDate()]?.dismissed ?? {}))).map((d) => ({ ...d, date }))
})
const topicAt = (now, talk = {}, state = {}) => casaTopic(decisions(now, state), plans(state), members, now, talk)

test('Wednesday afternoon: Casa raises Thursday’s 7:35 to Jake, in his words, with who’s free', () => {
  const now = on(7, 15, 5)
  const topic = topicAt(now)
  assert.ok(topic, 'something to say')
  assert.equal(topic.forName, 'Jake')
  assert.equal(topic.eyebrow, 'JAKE, ABOUT TOMORROW MORNING')
  assert.match(topic.said, /^You’re in Dallas tomorrow, and nobody’s taking Emme and Owen to .+ at 7:35\.$/)
  assert.match(topic.why[0], /^It’s 16 hours away, and nobody has it\.$/)
  assert.ok(topic.answers.some((a) => a.label === 'I’ll handle it' && a.action.type === 'dismiss'))
  assert.equal(topic.answers.at(-1).label, 'Not now')
  assert.deepEqual(topic.answers.map((a) => a.label), ['Giselle will', 'Someone else', 'I’ll handle it', 'Not now'])
  assert.equal(topic.ask, 'Giselle’s free then.')
})

test('more than a day ahead it stays quiet (the TO DECIDE count has it)', () => {
  assert.equal(topicAt(on(6, 15, 0)), null)
})

test('once someone has it, Casa has nothing to say about it', () => {
  const now = on(7, 15, 5)
  const open = topicAt(now)
  const giselle = members.find((m) => m.name === 'Giselle').id
  const covered = topicAt(now, {}, { 8: { drivers: { [open.decision.tripIds[0]]: giselle }, departed: {} } })
  assert.equal(covered, null)
})

test('"I’ll handle it" is remembered like any decision; "Not now" waits until its time', () => {
  const now = on(7, 15, 5)
  const open = topicAt(now)
  assert.equal(topicAt(now, {}, { 8: { drivers: {}, departed: {}, dismissed: { [open.key]: true } } }), null)
  const until = snoozeUntil(open.at, now)
  assert.equal(until.getTime(), on(7, 17, 0).getTime(), 'a morning run comes back the evening before')
  assert.equal(topicAt(now, { snoozed: { [open.key]: until.toISOString() } }), null)
  assert.equal(topicAt(on(7, 17, 1), { snoozed: { [open.key]: until.toISOString() } })?.key, open.key)
})

test('"Not now" in the evening: two hours, never later than an hour before', () => {
  const at = on(8, 7, 35)
  assert.equal(snoozeUntil(at, on(7, 20, 0)).getTime(), on(7, 22, 0).getTime())
  assert.equal(snoozeUntil(at, on(8, 6, 0)).getTime(), on(8, 6, 35).getTime())
})

test('the phones hear once, and not at night', () => {
  const topic = topicAt(on(7, 15, 5))
  assert.equal(pushNow(topic, {}, on(7, 15, 5)), true)
  assert.equal(pushNow(topic, { pushed: { [topic.key]: 'x' } }, on(7, 15, 5)), false)
  assert.equal(pushNow(topic, {}, on(7, 22, 0)), false)
  const msg = pushMessage(topic)
  assert.equal(msg.title, 'Something for you, Jake')
  assert.equal(msg.body, topic.said)
  assert.equal(msg.url, '/phone')
})

test('handed to someone with something else on: Casa says that to them instead', () => {
  const now = on(7, 15, 5)
  const open = topicAt(now)
  const topic = topicAt(now, {}, { 8: { drivers: { [open.decision.tripIds[0]]: 'kelly' }, departed: {} } })
  assert.equal(topic?.decision.kind, 'driver_busy')
  assert.equal(topic.forName, 'Kelly')
  assert.equal(topic.eyebrow, 'KELLY, ABOUT TOMORROW MORNING')
  assert.equal(topic.answers.at(-2).label, 'Kelly will manage')
})
