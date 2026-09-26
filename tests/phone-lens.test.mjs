import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDayPlan } from '../src/wall/engine/dayPlan.ts'
import { meView } from '../src/phone/lens.ts'
import { FRIDAY, SATURDAY, at, members, routines, events } from './fixtures/wall-day-2026-09-25.mjs'

const friday = buildDayPlan({ date: FRIDAY, members, routines, events })
const saturday = buildDayPlan({ date: SATURDAY, members, routines, events })
const kit = [
  { id: 'c6', event_id: 'birthday', label: 'Birthday card', checked: false, sort_order: 1 },
  { id: 'c1', event_id: 'softball', label: 'Glove', checked: false, sort_order: 1 },
]

test("Jake's phone at 7:12 Friday: his next move first, then his other moves with a leave-by time", () => {
  const me = meView({ viewerId: 'jake-id', plan: friday, members, events, checklist: [], now: at(25, 7, 12) })
  assert.equal(me.next.title, 'Palm Beach Public')
  assert.equal(me.next.leaveBy, '7:25')
  assert.equal(me.next.summary, 'Drop off Emme & Owen')
  assert.deepEqual(me.moves.map((m) => [m.leaveBy, m.title]), []) // nothing else of his to drive today
})

test('what others have covered today, so he can stop worrying about it', () => {
  const me = meView({ viewerId: 'jake-id', plan: friday, members, events, checklist: [], now: at(25, 7, 12) })
  assert.deepEqual(me.covered.map((c) => [c.driver, c.when, c.what]), [
    ['Kelly', '7:42', 'Drop off Liv'],
    ['Giselle', '1:50', 'Pick up Emme & Owen'],
    ['Giselle', '3:12', 'Pick up Liv'],
  ])
})

test('his own reminders are "just yours"; a celebration\'s prep is listed as hidden from the honoree', () => {
  const me = meView({ viewerId: 'jake-id', plan: saturday, members, events, checklist: kit, now: at(25, 20, 0) })
  assert.deepEqual(me.hidden.map((h) => [h.from, h.label]), [['Kelly', 'Birthday card']])
  const fri = meView({ viewerId: 'jake-id', plan: friday, members, events, checklist: [], now: at(25, 7, 12) })
  assert.deepEqual(fri.justYours.map((j) => j.title), ['Pick up Photobook for Liv'])
})

test("the honoree's own phone never gets it", () => {
  const me = meView({ viewerId: 'kelly', plan: saturday, members, events, checklist: kit, now: at(25, 20, 0) })
  assert.deepEqual(me.hidden, [])
})

import { familyItems } from '../src/phone/lens.ts'

test('Family: the day as one list — each event once, when it starts, who is in it, who drives', () => {
  const items = familyItems(saturday, members, null)
  const softball = items.find((i) => i.id === 'softball')
  assert.equal(softball.time, '12:30')
  assert.equal(softball.title, 'Softball: Huskies @ RPB Cascade')
  assert.match(softball.sub, /Ferrin Park Field 1/)
  assert.match(softball.sub, /Jake drives/)
  assert.deepEqual(softball.people, ['jake-id'])
  assert.deepEqual(items.map((i) => i.at.getTime()), [...items].map((i) => i.at.getTime()).sort((a, b) => a - b))
})

test('Family filtered to one person shows only what they are in', () => {
  const kelly = familyItems(saturday, members, 'kelly')
  assert.deepEqual(kelly.map((i) => i.id), ['birthday'])
})

test('school shows as a quiet line for the children, not a list of runs', () => {
  const items = familyItems(friday, members, 'liv')
  assert.deepEqual(items.map((i) => i.title), ['Bak Middle School']) // Jake's errand for her (a reminder) stays in his list
})

test('two children at the same school, same hours, are one line with both of them', () => {
  const school = familyItems(friday, members, null).filter((i) => i.title === 'Palm Beach Public')
  assert.equal(school.length, 1)
  assert.deepEqual(school[0].people, ['emme', 'owen'])
})

import { eventView } from '../src/phone/lens.ts'

test('an event on the phone: when, where, who, the trip, and its prep', () => {
  const v = eventView({ eventId: 'softball', plan: saturday, events, members, viewerId: 'jake-id', checklist: kit })
  assert.equal(v.when, 'SAT · 12:30 – 2:30 PM')
  assert.equal(v.place.name, 'Ferrin Park Field 1')
  assert.deepEqual(v.going, ['jake-id'])
  assert.equal(v.trip.driverId, 'jake-id')
  assert.deepEqual(v.prep.map((i) => i.label), ['Glove'])
})

test("the person being celebrated doesn't see the prep on their own phone (everyone else does)", () => {
  assert.deepEqual(eventView({ eventId: 'birthday', plan: saturday, events, members, viewerId: 'kelly', checklist: kit }).prep, [])
  assert.deepEqual(eventView({ eventId: 'birthday', plan: saturday, events, members, viewerId: 'jake-id', checklist: kit }).prep.map((i) => i.label), ['Birthday card'])
})
