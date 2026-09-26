import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDayPlan } from '../src/wall/engine/dayPlan.ts'
import {
  draftFromEvent, stepStart, stepEnd, setDay, setAllDay, setAnytime, setTitle, setPlace,
  dayChips, draftChanges, previewEvent, consequenceLine, savePlanFor, canClearPlace,
} from '../src/wall/editing.ts'
import { SATURDAY, FRIDAY, at, members, routines, events } from './fixtures/wall-day-2026-09-25.mjs'

const softball = events.find((e) => e.id === 'softball')
const photobook = { ...events.find((e) => e.id === 'photobook'), has_due_date: true }
const planWith = (date, list) => buildDayPlan({ date, members, routines, events: list })
const replace = (event) => events.map((e) => (e.id === event.id ? event : e))

test('a draft starts as the event is now', () => {
  const d = draftFromEvent(softball)
  assert.equal(d.title, 'Softball: Huskies @ RPB Cascade')
  assert.equal(d.startMin, 12 * 60 + 30)
  assert.equal(d.endMin, 14 * 60 + 30)
  assert.equal(d.day.getTime(), SATURDAY.getTime())
  assert.equal(d.place.name, softball.location_name)
  assert.equal(d.place.driveMinutes, 29)
  assert.deepEqual(draftChanges(softball, d), [])
})

test('moving the start moves the end with it; the end alone never goes before the start', () => {
  const d = stepStart(draftFromEvent(softball), -15)
  assert.equal(d.startMin, 12 * 60 + 15)
  assert.equal(d.endMin, 14 * 60 + 15)
  const shorter = stepEnd(d, -120)
  assert.equal(shorter.endMin, 12 * 60 + 30) // stops 15 min after the start
})

test('changes say what they were', () => {
  const d = stepStart(draftFromEvent(softball), -15)
  assert.deepEqual(draftChanges(softball, d), [
    { field: 'start', was: '12:30 PM' },
    { field: 'end', was: '2:30 PM' },
  ])
  const renamed = setTitle(draftFromEvent(softball), 'Softball playoff')
  assert.deepEqual(draftChanges(softball, renamed), [{ field: 'title', was: 'Softball: Huskies @ RPB Cascade' }])
  const moved = setDay(draftFromEvent(softball), new Date(2026, 8, 27))
  assert.deepEqual(draftChanges(softball, moved), [{ field: 'day', was: 'Sat, Sep 26' }])
})

test('day chips: the next six days from today, and the event\'s own day when it is further out', () => {
  const chips = dayChips(at(25, 20, 0), SATURDAY)
  assert.deepEqual(chips.map((c) => `${c.weekday} ${c.date.getDate()}${c.selected ? '*' : ''}`), ['FRI 25', 'SAT 26*', 'SUN 27', 'MON 28', 'TUE 29', 'WED 30'])
  const far = dayChips(at(25, 20, 0), new Date(2026, 9, 9))
  assert.equal(far.length, 7)
  assert.equal(far[6].selected, true)
})

test('the preview uses the same leave-time rule as the save (start − drive − 5 min)', () => {
  const d = stepStart(draftFromEvent(softball), -15)
  const after = planWith(SATURDAY, replace(previewEvent(softball, d)))
  const trip = after.trips.find((t) => t.sourceId === 'softball')
  assert.equal(trip.leaveAt.getTime(), at(26, 11, 41).getTime())
  assert.equal(trip.arriveAt.getTime(), at(26, 12, 15).getTime())
  assert.equal(trip.homeAt.getTime(), at(26, 14, 44).getTime())
})

test('"what changes" names the driver and the old and new leave times', () => {
  const d = stepStart(draftFromEvent(softball), -15)
  const before = planWith(SATURDAY, events)
  const after = planWith(SATURDAY, replace(previewEvent(softball, d)))
  assert.equal(consequenceLine(before, after, 'softball', members), 'Jake leaves at 11:41 instead of 11:56.')
})

test('a new place changes the drive, and the leave time with it', () => {
  const d = setPlace(draftFromEvent(softball), { name: 'Royal Palm Beach Commons Park', address: '11600 Poinciana Blvd, Royal Palm Beach, FL', driveMinutes: 26 })
  assert.deepEqual(draftChanges(softball, d), [{ field: 'place', was: softball.location_name }])
  const after = planWith(SATURDAY, replace(previewEvent(softball, d)))
  assert.equal(after.trips.find((t) => t.sourceId === 'softball').leaveAt.getTime(), at(26, 11, 59).getTime())
})

test('"No place" is offered only without a saved trip plan, and then leaves an unplaced item; "at home" is never a trip', () => {
  assert.equal(canClearPlace(softball), false)
  const withPlace = { ...photobook, location_name: 'Photobook Shop', address: 'Publix Plaza, Palm Beach', enrichment: { drive_time_mins: 15, departure_time: null } }
  assert.equal(canClearPlace(withPlace), true)
  const none = previewEvent(withPlace, setPlace(draftFromEvent(withPlace), { name: '', address: '', driveMinutes: null }))
  const fri = planWith(FRIDAY, events.map((e) => (e.id === 'photobook' ? none : e)))
  assert.equal(fri.trips.some((t) => t.sourceId === 'photobook'), false)
  assert.ok(fri.unplaced.some((u) => u.sourceId === 'photobook'))
  const home = previewEvent(softball, setPlace(draftFromEvent(softball), { name: 'Home', address: '', driveMinutes: 0 }))
  assert.equal(planWith(SATURDAY, replace(home)).trips.some((t) => t.sourceId === 'softball'), false)
})

test('a reminder can be "anytime" (no due date)', () => {
  const d = setAnytime(draftFromEvent(photobook), true)
  assert.deepEqual(draftChanges(photobook, d), [{ field: 'anytime', was: 'Fri, Sep 25 · 10:25 AM' }])
  assert.deepEqual(savePlanFor(photobook, d).map((s) => s.kind), ['clearDueDate'])
})

test('saving runs only what changed: schedule before place, so the place sees the new time', () => {
  let d = stepStart(draftFromEvent(softball), -15)
  d = setTitle(d, 'Softball playoff')
  d = setPlace(d, { name: 'Royal Palm Beach Commons Park', address: '11600 Poinciana Blvd, Royal Palm Beach, FL', driveMinutes: 26 })
  const steps = savePlanFor(softball, d)
  assert.deepEqual(steps.map((s) => s.kind), ['title', 'schedule', 'venue'])
  const schedule = steps[1]
  assert.equal(schedule.start.getTime(), at(26, 12, 15).getTime())
  assert.equal(schedule.end.getTime(), at(26, 14, 15).getTime())
  assert.equal(steps[2].venue.name, 'Royal Palm Beach Commons Park')
  assert.deepEqual(savePlanFor(softball, draftFromEvent(softball)), [])
})

test('all day: the whole day, and the schedule step says so', () => {
  const d = setAllDay(draftFromEvent(softball), true)
  const [step] = savePlanFor(softball, d)
  assert.equal(step.kind, 'schedule')
  assert.equal(step.allDay, true)
  assert.equal(step.start.getTime(), SATURDAY.getTime())
})

test('friday\'s events are untouched by a saturday edit', () => {
  const d = stepStart(draftFromEvent(softball), -15)
  const fri = planWith(FRIDAY, replace(previewEvent(softball, d)))
  assert.deepEqual(fri.trips.map((t) => t.sourceId).sort(), planWith(FRIDAY, events).trips.map((t) => t.sourceId).sort())
})

import { blankEvent, createArgs, NEW_EVENT_ID } from '../src/wall/editing.ts'

test('a new event starts blank on the day on show: the next full hour today, 9 AM on another day', () => {
  const today = blankEvent(new Date(2026, 8, 25), new Date(2026, 8, 25, 14, 20), 'event')
  assert.equal(today.id, NEW_EVENT_ID)
  assert.equal(today.title, '')
  assert.equal(new Date(today.start_time).getHours(), 15)
  assert.equal((new Date(today.end_time) - new Date(today.start_time)) / 60000, 60)
  const saturday = blankEvent(new Date(2026, 8, 26), new Date(2026, 8, 25, 14, 20), 'reminder')
  assert.equal(new Date(saturday.start_time).getHours(), 9)
  assert.equal(saturday.event_type, 'reminder')
  assert.equal((new Date(saturday.end_time) - new Date(saturday.start_time)) / 60000, 15)
})

test('adding sends the calendar\'s own create call: title, times, kind, place, and who is going by name', () => {
  const event = blankEvent(new Date(2026, 8, 26), new Date(2026, 8, 25, 20, 0), 'event')
  const draft = { ...draftFromEvent(event), title: '  Jaida watching Owen and Emme ', startMin: 12 * 60, endMin: 15 * 60,
    place: { name: 'Home', address: '3209 Washington Road, West Palm Beach, FL 33405', driveMinutes: null }, going: ['emme', 'owen'] }
  const args = createArgs(draft, 'event', members)
  assert.equal(args.title, 'Jaida watching Owen and Emme')
  assert.equal(new Date(args.start).getTime(), new Date(2026, 8, 26, 12, 0).getTime())
  assert.equal(new Date(args.end).getTime(), new Date(2026, 8, 26, 15, 0).getTime())
  assert.equal(args.event_type, 'event')
  assert.equal(args.location, '3209 Washington Road, West Palm Beach, FL 33405')
  assert.deepEqual(args.members, ['Emme', 'Owen'])
})

test('with no place, no location is sent (never a guess)', () => {
  const event = blankEvent(new Date(2026, 8, 26), new Date(2026, 8, 25, 20, 0), 'reminder')
  const args = createArgs({ ...draftFromEvent(event), title: 'Order the cake' }, 'reminder', members)
  assert.equal('location' in args, false)
  assert.deepEqual(args.members, [])
})
