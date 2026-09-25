import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDayPlan } from '../src/wall/engine/dayPlan.ts'
import { buildScore } from '../src/wall/score.ts'
import { xForTime } from '../src/wall/timeline.ts'
import { FRIDAY, SATURDAY, at, members, routines, events } from './fixtures/wall-day-2026-09-25.mjs'

const fridayPlan = () => buildDayPlan({ date: FRIDAY, members, routines, events })
const lane = (score, id) => score.lanes.find((l) => l.member.id === id)
const pigmentOf = (score, id) => lane(score, id).pigmentIndex

test('lanes follow the home-screen setting in the family order, each with a steady color', () => {
  const score = buildScore(fridayPlan(), members, at(25, 10, 8))
  assert.deepEqual(score.lanes.map((l) => l.member.name), ['Jake', 'Kelly', 'Liv', 'Emme', 'Owen', 'Giselle'])
  // Colors follow the person, not the row, so a sitter appearing doesn't recolor anyone.
  const hidden = members.map((m) => (m.id === 'giselle' ? { ...m, show_on_home_sidebar: false } : m))
  const quietDay = buildDayPlan({ date: SATURDAY, members: hidden, routines, events })
  const without = buildScore(quietDay, hidden, at(26, 9, 0))
  assert.equal(without.lanes.some((l) => l.member.id === 'giselle'), false)
  assert.equal(pigmentOf(without, 'owen'), pigmentOf(score, 'owen'))
})

test('a sitter switched off for the home screen gets a lane on a day she drives', () => {
  const hidden = members.map((m) => (m.id === 'giselle' ? { ...m, show_on_home_sidebar: false } : m))
  const score = buildScore(buildDayPlan({ date: FRIDAY, members: hidden, routines, events }), hidden, at(25, 10, 8))
  assert.ok(lane(score, 'giselle'))
})

test('school is a bar in the child\'s color with the drop-off and pickup drivers\' initials at each end', () => {
  const score = buildScore(fridayPlan(), members, at(25, 10, 8))
  const liv = lane(score, 'liv')
  const school = liv.blocks.find((b) => b.kind === 'place')
  assert.equal(school.x, xForTime(at(25, 8, 0)))
  assert.equal(school.width, xForTime(at(25, 15, 30)) - xForTime(at(25, 8, 0)))
  assert.match(school.label, /Bak Middle/)
  assert.equal(school.pigmentIndex, pigmentOf(score, 'liv'))
  const [dropoff, pickup] = liv.monograms
  assert.equal(dropoff.initial, 'K')
  assert.equal(dropoff.pigmentIndex, pigmentOf(score, 'kelly'))
  assert.equal(dropoff.x, school.x)
  assert.equal(pickup.initial, 'G')
  assert.equal(pickup.x, school.x + school.width)
  assert.equal(liv.notes[0].text, 'Giselle · 3:30')
})

test('a pickup note gives way to something starting right after the pickup', () => {
  const score = buildScore(fridayPlan(), members, at(25, 10, 8))
  // Emme's Spirit Day reminder starts at 2:00, exactly at her pickup.
  assert.deepEqual(lane(score, 'emme').notes, [])
  assert.equal(lane(score, 'emme').monograms.at(-1).initial, 'G')
  assert.equal(lane(score, 'owen').notes[0].text, 'Giselle · 2:00')
})

test('driving legs sit in the driver\'s lane, in the driver\'s color, labelled with the run', () => {
  const score = buildScore(fridayPlan(), members, at(25, 10, 8))
  const giselle = lane(score, 'giselle')
  const drives = giselle.blocks.filter((b) => b.kind === 'drive')
  assert.equal(drives.length, 2)
  assert.ok(drives.every((b) => b.pigmentIndex === pigmentOf(score, 'giselle')))
  assert.deepEqual(drives.map((b) => b.label), ['Pick up Emme & Owen', 'Pick up Liv'])
  // The first label stops before the second one starts.
  assert.ok(drives[0].x + drives[0].labelMaxWidth < drives[1].x)
  // Children don't get a second copy of the school run in their own lanes.
  assert.equal(lane(score, 'emme').blocks.some((b) => b.kind === 'drive'), false)
})

test('an item with no place is drawn as unplaced, never as a trip', () => {
  const score = buildScore(fridayPlan(), members, at(25, 10, 8))
  const photobook = lane(score, 'jake-id').blocks.find((b) => b.sourceId === 'photobook')
  assert.equal(photobook.kind, 'activity')
  assert.equal(photobook.placeStatus, 'unknown')
  assert.equal(photobook.label, 'Pick up Photobook for Liv')
})

test('a game with no driver shows its road time as unassigned in the players\' lanes', () => {
  const players = members
  const withOwen = events.map((e) => (e.id === 'baseball' ? { ...e, members: [{ family_member_id: 'owen', role: 'primary' }] } : e))
  const score = buildScore(buildDayPlan({ date: SATURDAY, members: players, routines, events: withOwen }), players, at(26, 9, 0))
  const owen = lane(score, 'owen')
  assert.ok(owen.blocks.some((b) => b.kind === 'drive_unassigned' && b.sourceId === 'baseball'))
  assert.ok(owen.blocks.some((b) => b.kind === 'activity' && b.sourceId === 'baseball'))
})

test('labels that would overlap the one before are dropped, never stacked', () => {
  const crowded = [
    ...events,
    { id: 'a', title: 'Call the plumber about the kitchen', all_day: false, start_time: at(25, 13, 0).toISOString(), end_time: at(25, 13, 15).toISOString(), location_name: null, address: null, members: [{ family_member_id: 'jake-id', role: 'primary' }] },
    { id: 'b', title: 'Order flowers', all_day: false, start_time: at(25, 13, 10).toISOString(), end_time: at(25, 13, 20).toISOString(), location_name: null, address: null, members: [{ family_member_id: 'jake-id', role: 'primary' }] },
  ]
  const score = buildScore(buildDayPlan({ date: FRIDAY, members, routines, events: crowded }), members, at(25, 10, 8))
  const jake = lane(score, 'jake-id')
  assert.equal(jake.blocks.find((b) => b.sourceId === 'a').label, 'Call the plumber about the kitchen')
  assert.equal(jake.blocks.find((b) => b.sourceId === 'b').label, null)
})

test('each lane says where the person is now, or when they next leave', () => {
  const score = buildScore(fridayPlan(), members, at(25, 10, 8))
  assert.equal(lane(score, 'liv').status, 'Bak Middle School · until 3:30')
  assert.equal(lane(score, 'giselle').status, 'Leaves at 1:50')
  assert.equal(lane(score, 'kelly').status, '')
  const early = buildScore(fridayPlan(), members, at(25, 7, 30))
  assert.equal(lane(early, 'jake-id').status, 'Driving · back by 7:45')
  assert.equal(lane(early, 'emme').status, 'Riding to Palm Beach Public')
  assert.equal(lane(early, 'liv').status, 'Leaves at 7:42 with Kelly')
})

test('after a pickup the child reads as home, with what comes next', () => {
  const score = buildScore(fridayPlan(), members, at(25, 14, 18))
  assert.equal(lane(score, 'owen').status, 'Home since 2:10')
  assert.equal(lane(score, 'emme').status, 'Home · Emme Practice Violin with Meredith · 4:30')
  // Someone never collected today just shows what's next.
  assert.equal(lane(buildScore(fridayPlan(), members, at(25, 9, 0)), 'jake-id').status, 'Pick up Photobook for Liv · 10:25')
})

test('during an item at home or with no place, the lane says what it is and until when', () => {
  assert.equal(lane(buildScore(fridayPlan(), members, at(25, 16, 40)), 'emme').status, 'Emme Practice Violin with Meredith · until 5:15')
  const atHome = events.map((e) => (e.id === 'violin' ? { ...e, location_name: 'Home' } : e))
  const plan = buildDayPlan({ date: FRIDAY, members, routines, events: atHome })
  assert.equal(lane(buildScore(plan, members, at(25, 16, 40)), 'emme').status, 'Home · Emme Practice Violin with Meredith · until 5:15')
})

test('a child leaving with nobody to drive says so', () => {
  const withOwen = events.map((e) => (e.id === 'baseball' ? { ...e, members: [{ family_member_id: 'owen', role: 'primary' }] } : e))
  const score = buildScore(buildDayPlan({ date: SATURDAY, members, routines, events: withOwen }), members, at(26, 9, 0))
  assert.equal(lane(score, 'owen').status, 'Needs a driver · leaves 12:05')
})

test('"everyone home by" is the last return of the day, and only when every return is known', () => {
  const score = buildScore(fridayPlan(), members, at(25, 10, 8))
  assert.equal(score.everyoneHomeBy.label, 'Everyone home by 3:48')
  assert.equal(score.everyoneHomeBy.x, xForTime(at(25, 15, 48)))
  assert.equal(buildScore(fridayPlan(), members, at(25, 16, 0)).everyoneHomeBy, null)
  // Saturday's baseball has no driver but a known drive time; drop the drive time and the marker goes.
  const unknown = events.map((e) => (e.id === 'baseball' ? { ...e, enrichment: null } : e))
  const sat = buildScore(buildDayPlan({ date: SATURDAY, members, routines, events: unknown }), members, at(26, 9, 0))
  assert.equal(sat.everyoneHomeBy, null)
})
