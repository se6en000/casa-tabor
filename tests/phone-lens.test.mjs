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
  assert.deepEqual(kelly.map((i) => i.id), ['grandma', 'birthday']) // an all-day for nobody in particular is for everyone
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

test('all-day items head the day on the phone, with their people (and for nobody in particular)', () => {
  const items = familyItems(friday, members, null)
  assert.deepEqual([items[0].time, items[0].title, items[0].people], ['All day', 'Spirit Day · wear school colors', ['emme', 'owen']])
  assert.deepEqual(familyItems(friday, members, 'owen')[0].title, 'Spirit Day · wear school colors')
  assert.equal(familyItems(saturday, members, null)[0].title, 'Grandma visiting')
  assert.equal(familyItems(saturday, members, 'kelly').some((i) => i.title === 'Grandma visiting'), true) // for everyone
})

test('the next move says where the trip is in time: leave by, should be on the way, there now', () => {
  const at = (h, m) => new Date(2026, 8, 25, h, m)
  const phase = (now) => meView({ viewerId: 'jake-id', plan: friday, members, events, checklist: [], now }).next
  assert.deepEqual([phase(at(7, 12)).phase, phase(at(7, 12)).eyebrow], ['before', 'LEAVE BY 7:25'])
  assert.deepEqual([phase(at(7, 30)).phase, phase(at(7, 30)).eyebrow], ['late', 'SHOULD BE ON THE WAY · THERE BY 7:35'])
  assert.deepEqual([phase(at(7, 38)).phase, phase(at(7, 38)).eyebrow], ['there', 'THERE NOW · BACK BY 7:45'])
})

test('the next move carries where to drive, for Directions', () => {
  const next = meView({ viewerId: 'jake-id', plan: saturday, members, events, checklist: [], now: new Date(2026, 8, 26, 9, 0) }).next
  assert.match(next.address, /Ferrin Park Field 1/)
  assert.equal(next.eventId, 'softball')
})

test("an all-day event says its own day: Kelly's Birthday (stored at UTC midnight) is SAT, not FRI", () => {
  // Live 2026-09-26: the phone said "FRI · ALL DAY" — UTC midnight read as Friday 8 PM here.
  const birthday = { id: 'bd', title: "Kelly's Birthday", event_type: 'event', all_day: true, start_time: '2026-09-26T00:00:00+00:00', end_time: '2026-09-26T23:59:59+00:00', members: [] }
  const view = eventView({ eventId: 'bd', plan: null, events: [birthday], members, viewerId: 'jake-id', checklist: [] })
  assert.equal(view.when, 'SAT · ALL DAY')
})

// Board 08a on the phone: an event with nobody on it still shows in Family, marked "No one yet".
test('Family shows an event with nobody on it, marked "No one yet" (not under anyone\'s filter)', () => {
  const nobody = { id: 'portfolio', title: 'Portfolio trigger review', start_time: at(25, 9, 0).toISOString(), end_time: at(25, 9, 30).toISOString(), all_day: false, event_type: 'event', status: 'confirmed', members: [] }
  const plan = buildDayPlan({ date: FRIDAY, members, routines, events: [...events, nobody] })
  const item = familyItems(plan, members, null).find((i) => i.id === 'portfolio')
  assert.ok(item, 'listed')
  assert.equal(item.sub, 'No one yet')
  assert.deepEqual(item.people, [])
  assert.ok(!familyItems(plan, members, 'kelly').some((i) => i.id === 'portfolio'))
})

// Canvas 33c (Jake, Oct 2: "the calendar view should have the day and under it event cards for that day … only the real
// events not routine or chores for the next say 7 days"): a day's appointments — no school or work, no chores or to-dos.
import { agendaItems } from '../src/phone/lens.ts'

test('Calendar: a day’s real events only — school, chores and to-dos stay off', () => {
  const fri = agendaItems(friday, members)
  const titles = fri.map((i) => i.title)
  assert.ok(!titles.includes('Palm Beach Public'), 'school is a routine')
  assert.ok(!titles.includes('Bak Middle School'), 'school is a routine')
  assert.ok(!titles.includes('Pick up Photobook for Liv'), 'a to-do')
  assert.ok(fri.every((i) => i.kind === 'event'))
  assert.deepEqual(agendaItems(saturday, members).map((i) => i.id).includes('softball'), true)
})

// Jake, Oct 2: "for mobile, all that needs to be shown is the flight up and back and the hotel if there is one (probably
// as an all day). we dont need the other events that hold the "away" dotted line on the kiosk". The wall keeps them.
import { buildTrips } from '../src/wall/engine/travel.ts'
import { tripEvents, members as tripMembers, routines as tripRoutines } from './fixtures/wall-trip-2026-10-07.mjs'

test('a trip on the phone: the flights and the stay, not the airport wait or the away blocks', () => {
  const travel = buildTrips(tripEvents, tripMembers, { 'jake-id': { airportMinutes: 60, way: 'uber' } })
  const out = buildDayPlan({ date: new Date(2026, 9, 7), members: tripMembers, routines: tripRoutines, events: tripEvents, travel })
  const back = buildDayPlan({ date: new Date(2026, 9, 8), members: tripMembers, routines: tripRoutines, events: tripEvents, travel })
  const day1 = familyItems(out, tripMembers, 'jake-id', tripEvents)
  const titles = day1.map((i) => i.title)
  assert.ok(!titles.some((t) => /^At DJT|^Away/.test(t)), titles.join(' | '))
  const stay = day1.find((i) => i.time === 'All day')
  assert.equal(stay.title, 'Jake in Dallas')
  assert.equal(stay.sub, 'Courtyard by Marriott Dallas Allen · Day 1 of 2')
  const flight = day1.find((i) => i.id === 'f1419')
  assert.equal(flight.title, 'Flight 1419 → DFW')
  assert.equal(flight.sub, 'Leave 12:58 · Uber to DJT')
  const day2 = familyItems(back, tripMembers, 'jake-id', tripEvents)
  assert.ok(!day2.some((i) => /^Away|^Off the plane/.test(i.title)), day2.map((i) => i.title).join(' | '))
  assert.equal(day2.find((i) => i.id === 'f2640').sub, 'Lands 6:34 · Uber home')
})

// Jake, Oct 2: on Everyone, one quiet line for someone away instead of a card each day; and an Uber button on the day
// you leave when that's your way to the airport.
import { awayLines } from '../src/phone/lens.ts'

test('away: one line — who, where, and when they’re back home', () => {
  const travel = buildTrips(tripEvents, tripMembers, { 'jake-id': { airportMinutes: 60, way: 'uber' } })
  const days = [7, 8, 9].map((d) => buildDayPlan({ date: new Date(2026, 9, d), members: tripMembers, routines: tripRoutines, events: tripEvents, travel }))
  assert.deepEqual(awayLines(days[0], days, tripMembers, new Date(2026, 9, 7, 11, 5)).map((l) => l.text), ['Jake away in Dallas · back tomorrow 7:19 PM'])
  assert.deepEqual(awayLines(days[1], days, tripMembers, new Date(2026, 9, 8, 9, 0)).map((l) => l.text), ['Jake away in Dallas · back today 7:19 PM'])
  assert.deepEqual(awayLines(days[2], days, tripMembers, new Date(2026, 9, 9, 9, 0)), [])
})

test('the day you leave: the move to the airport offers an Uber when that’s the way there', () => {
  const travel = buildTrips(tripEvents, tripMembers, { 'jake-id': { airportMinutes: 60, way: 'uber' } })
  const plan = buildDayPlan({ date: new Date(2026, 9, 7), members: tripMembers, routines: tripRoutines, events: tripEvents, travel })
  const me = meView({ viewerId: 'jake-id', plan, members: tripMembers, events: tripEvents, checklist: [], now: new Date(2026, 9, 7, 11, 5) })
  assert.match(me.next.uber, /^https:\/\/m\.uber\.com\/ul\/\?action=setPickup&pickup=my_location&dropoff%5Bformatted_address%5D=DJT/)
  // A school run has none.
  const fri = meView({ viewerId: 'jake-id', plan: friday, members, events, checklist: [], now: at(25, 7, 12) })
  assert.equal(fri.next.uber, null)
})

// Instant adds (Jake, Oct 2): a place still being looked up says so — "Working out the drive…" — and no leave-by is
// guessed until it's real.
test('a place still being looked up: "Working out the drive…", and no leave-by yet', () => {
  const pending = { id: 'gym-now', title: 'Gym', event_type: 'event', all_day: false, start_time: at(26, 15, 0).toISOString(), end_time: at(26, 16, 0).toISOString(), location_name: 'Amped Fitness', address: null, members: [{ family_member_id: 'jake-id', role: 'primary' }], _placePending: true }
  const plan = buildDayPlan({ date: SATURDAY, members, routines, events: [...events, pending] })
  const item = familyItems(plan, members, 'jake-id', [...events, pending]).find((i) => i.id === 'gym-now')
  assert.equal(item.sub, 'Amped Fitness · working out the drive…')
  const me = meView({ viewerId: 'jake-id', plan, members, events: [...events, pending], checklist: [], now: at(26, 13, 0) })
  const move = [me.next, ...me.moves].find((m) => m?.eventId === 'gym-now')
  if (move) {
    assert.equal(move.leaveBy, null)
    assert.equal(move.eyebrow, 'WORKING OUT THE DRIVE')
  }
})

test('not sure of the place: "which one?"; no address at all: "add the address" — and no leave-by for either', () => {
  const unsure = { id: 'amped', title: 'Gym', event_type: 'event', all_day: false, start_time: at(26, 15, 0).toISOString(), end_time: at(26, 16, 0).toISOString(), location_name: 'Amped Fitness', address: null, members: [{ family_member_id: 'jake-id', role: 'primary' }], enrichment: { place_choices: [{ name: 'Amped Fitness Signature', address: '2771 S Dixie Hwy' }, { name: 'Amped Fitness', address: '3101 PGA Blvd' }] } }
  const missing = { id: 'nowhere', title: 'Pottery', event_type: 'event', all_day: false, start_time: at(26, 17, 0).toISOString(), end_time: at(26, 18, 0).toISOString(), location_name: 'Clay Studio', address: null, members: [{ family_member_id: 'jake-id', role: 'primary' }] }
  const all = [...events, unsure, missing]
  const plan = buildDayPlan({ date: SATURDAY, members, routines, events: all })
  const items = familyItems(plan, members, 'jake-id', all)
  assert.equal(items.find((i) => i.id === 'amped').sub, 'Amped Fitness · which one?')
  assert.equal(items.find((i) => i.id === 'nowhere').sub, 'Clay Studio · add the address')
  const me = meView({ viewerId: 'jake-id', plan, members, events: all, checklist: [], now: at(26, 13, 0) })
  const moves = [me.next, ...me.moves].filter(Boolean)
  assert.deepEqual(moves.filter((m) => m.eventId === 'amped' || m.eventId === 'nowhere').map((m) => [m.eventId, m.leaveBy, m.eyebrow]), [['amped', null, 'WHICH PLACE?'], ['nowhere', null, 'ADD THE ADDRESS']])
})

// Jake, Oct 5 (Today on his phone): "Reply to Natasha Ahles" with a date and time, nobody on it, showed "No one yet" and
// no tick. A to-do nobody is on is still a to-do: its tick, and "To do".
test('Family: a to-do with nobody on it keeps its tick', () => {
  const at = new Date('2026-10-05T17:00:00')
  const plan = { date: new Date('2026-10-05T00:00:00'), lanes: new Map(), trips: [], allDay: [], nobody: [{ sourceId: 'r1', title: 'Reply to Natasha Ahles', start: at, end: at, reminder: true }, { sourceId: 'e1', title: 'Plumber', start: at, end: at }] }
  const items = familyItems(plan, members, null)
  assert.deepEqual(items.map((i) => [i.id, i.kind, i.sub]), [['e1', 'event', 'No one yet'], ['r1', 'todo', 'To do']])
})
