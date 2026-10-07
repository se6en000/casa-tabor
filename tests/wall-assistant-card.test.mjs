import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDayPlan } from '../src/wall/engine/dayPlan.ts'
import { assistantCard, replacedAction, timeRange } from '../src/wall/assistantCard.ts'
import { members, routines, events } from './fixtures/wall-day-2026-09-25.mjs'

const planDay = (date, evs) => buildDayPlan({ date, members, routines, events: evs })
const ctx = (extra = {}) => ({ events, members, planDay, ...extra })
const local = (d, h, m) => new Date(2026, 8, d, h, m).toISOString()
const add = (args) => ({ tool: 'create_event', args: { title: 'Dentist', event_type: 'event', start: local(25, 16, 0), end: local(25, 17, 0), members: ['Liv'], ...args } })

test('an add says when, where it lands in the first person’s day, and who can drive', () => {
  const card = assistantCard(add({ location: 'Palm Beach Pediatric Dentistry' }), null, ctx({ driveMinutes: 24 }))
  assert.equal(card.kind, 'add')
  assert.equal(card.when, 'Fri, Sep 25 · 4:00 – 5:00 PM')
  assert.equal(card.place, 'Palm Beach Pediatric Dentistry')
  assert.equal(card.lane.memberId, 'liv')
  assert.ok(card.lane.segments.some((s) => s.sourceId === 'new'), 'the draft is in Liv’s lane')
  assert.ok(card.lane.segments.some((s) => /Bak Middle/.test(s.label)), 'with her school day')
  assert.equal(card.leaveBy, '3:31', 'the 24-min drive plus the app’s 5-min buffer, as the edit sheet and a saved event have it')
  assert.ok(card.drivers.length >= 2)
  assert.ok(card.drivers.every((d) => typeof d.note === 'string'))
  assert.deepEqual(card.touches, ['Nothing else then for Liv'])
})

test('without a known drive there is no leave-by, and no place means no drive at all', () => {
  assert.equal(assistantCard(add({ location: 'Somewhere new' }), null, ctx()).leaveBy, null)
  const home = assistantCard(add({}), null, ctx())
  assert.equal(home.drivers, null)
  assert.equal(home.place, null)
})

test('an add during school is no clash — routines are what the day is built around (Oct 7)', () => {
  const card = assistantCard(add({ start: local(25, 10, 0), end: local(25, 11, 0) }), null, ctx())
  assert.ok(!card.touches.some((t) => t.startsWith('Clashes')), card.touches.join(' | '))
})

test('a real appointment still clashes; an add while Giselle has Owen asks who’s taking him', () => {
  const dentist = { id: 'dentist', title: 'Dentist', event_type: 'event', all_day: false, status: 'confirmed', start_time: local(25, 16, 0), end_time: local(25, 17, 0), members: [{ family_member_id: 'liv', role: 'primary' }] }
  const clash = assistantCard(add({ title: 'Haircut', start: local(25, 16, 30), end: local(25, 17, 30) }), null, ctx({ events: [...events, dentist], planDay: (date, evs) => buildDayPlan({ date, members, routines, events: [...evs, dentist] }) }))
  assert.ok(clash.touches.includes('Clashes with Dentist (Liv)'), clash.touches.join(' | '))
  const giselle = { id: 'owen-giselle', key: 'care-giselle', memberId: 'owen', title: 'With Giselle', routineType: 'care', venueName: 'Giselle’s house', venueAddress: '', daysOfWeek: [1, 2, 3, 4, 5], startLocal: '14:00', endLocal: '17:00', dropoffDriverName: '', pickupDriverName: 'Giselle', enabled: true }
  const owen = assistantCard(add({ members: ['Owen'], start: local(25, 15, 0), end: local(25, 16, 0) }), null, ctx({ planDay: (date, evs) => buildDayPlan({ date, members, routines: [...routines, giselle], events: evs }) }))
  assert.deepEqual(owen.touches, ['Owen’s with Giselle then — who’s taking Owen?'])
})

test('the card says what the latest turn changed on it', () => {
  const before = add({ start: local(25, 15, 30), end: local(25, 16, 30) })
  const after = add({ location: 'Palm Beach Pediatric Dentistry', members: ['Liv', 'Emme'] })
  assert.deepEqual(assistantCard(after, before, ctx()).justChanged, ['3:30 → 4:00', 'place added', 'Emme added'])
  assert.deepEqual(assistantCard(after, null, ctx()).justChanged, [])
})

test('a change says before → after, keeps who is on it, and a new driver is chosen', () => {
  const move = { tool: 'update_event', args: { id: 'softball', start: local(26, 13, 0), end: local(26, 15, 0) } }
  const card = assistantCard(move, null, ctx())
  assert.equal(card.kind, 'change')
  assert.equal(card.when, 'Sat, Sep 26 · 1:00 – 3:00 PM')
  assert.equal(card.before, '12:30 – 2:30 PM')
  const handoff = { tool: 'update_event', args: { id: 'softball', driver_name: 'Kelly' } }
  const kelly = assistantCard(handoff, null, ctx())
  assert.equal(kelly.before, null, 'the time did not move')
  assert.equal(kelly.drivers.find((d) => d.chosen)?.name, 'Kelly')
  assert.deepEqual(assistantCard(handoff, { tool: 'update_event', args: { id: 'softball' } }, ctx()).justChanged, ['Kelly drives'])
})

test('anything else is not a calendar card', () => {
  assert.equal(assistantCard({ tool: 'add_grocery_items', args: {} }, null, ctx()), null)
  assert.equal(assistantCard({ tool: 'update_event', args: { id: 'nope' } }, null, ctx()), null)
  assert.equal(assistantCard(null, null, ctx()), null)
})

test('the card it replaced is the latest earlier one of the same kind and target', () => {
  const m = (tool, args) => ({ toolAction: { tool, args } })
  const a = m('create_event', { title: 'A' })
  const b = m('update_event', { id: 'x' })
  const c = m('create_event', { title: 'A2' })
  assert.deepEqual(replacedAction([a, b, c], c), { tool: 'create_event', args: { title: 'A' } })
  assert.equal(replacedAction([a, b, c], b), null)
})

test('times read like a wall clock', () => {
  assert.equal(timeRange(new Date(2026, 8, 25, 11, 30), new Date(2026, 8, 25, 13, 0)), '11:30 AM – 1:00 PM')
})

test('a moved event leaves at the moved time: the drive follows it, as saving would', () => {
  const move = { tool: 'update_event', args: { id: 'softball', start: local(26, 13, 0), end: local(26, 15, 0) } }
  const card = assistantCard(move, null, ctx())
  assert.equal(card.leaveBy, '12:26', 'the 29-min drive plus the app’s 5-min buffer')
  const drive = card.lane.segments.find((s) => s.sourceId === 'softball' && s.kind === 'drive')
  assert.equal(drive.start.getHours() * 60 + drive.start.getMinutes(), 12 * 60 + 26)
})

test('a change to a new place uses the drive looked up for it', () => {
  const move = { tool: 'update_event', args: { id: 'softball', location: 'Wellington Regional Park' } }
  const card = assistantCard(move, null, ctx({ driveMinutes: 40 }))
  assert.equal(card.place, 'Wellington Regional Park')
  assert.equal(card.leaveBy, '11:45')
})

test('the lane preview: a window from 8 AM that takes in the day, the draft marked, room after it for its name', async () => {
  const { laneView } = await import('../src/wall/assistantCard.ts')
  const card = assistantCard(add({ location: 'Palm Beach Pediatric Dentistry' }), null, ctx({ driveMinutes: 24 }))
  const view = laneView(card)
  assert.equal(view.from, 7, 'school drop-off starts before 8')
  assert.ok(view.to >= 20, 'three hours of room after the drive home')
  const draft = view.blocks.find((b) => b.draft && b.kind !== 'drive')
  assert.ok(draft && draft.left > 0 && draft.width > 0)
  assert.ok(view.blocks.some((b) => !b.draft && /Bak Middle/.test(b.label)))
  assert.ok(view.labelLeft >= draft.left + draft.width, 'the name sits after the draft and its drive home')
  assert.equal(view.label, '4:00 Dentist')
  assert.equal(laneView({ ...card, allDay: true }), null)
})

// "Which one?" before the yes (Jake, Oct 2): the card shows the address it found, or the places to pick from.
test('the card carries the address it found, or the places to pick from', () => {
  const sure = assistantCard(add({ location: 'Smile Dental', address: '1 Tooth St, West Palm Beach, FL' }), null, ctx())
  assert.equal(sure.place, 'Smile Dental')
  assert.equal(sure.address, '1 Tooth St, West Palm Beach, FL')
  assert.deepEqual(sure.placeChoices, [])
  const choices = [{ name: 'Amped Fitness Signature', address: '2771 S Dixie Hwy, West Palm Beach, FL' }, { name: 'Amped Fitness', address: '3101 PGA Blvd, Palm Beach Gardens, FL' }]
  const unsure = assistantCard(add({ location: 'Amped Fitness', place_choices: choices }), null, ctx())
  assert.equal(unsure.address, null)
  assert.deepEqual(unsure.placeChoices, choices)
  assert.deepEqual(assistantCard(add({ location: 'Amped Fitness', place_choices: null }), null, ctx()).placeChoices, [])
})

// Canvas 65: the card shows the notes before the yes — an add's own, or the lines a change adds.
test('the card shows its notes: an add’s, or the lines a change adds; a new line is a change', () => {
  const card = assistantCard(add({ notes: 'Ideas:\n1. Happy birthday!\n\n2. Hope it’s a great one' }), null, ctx())
  assert.deepEqual(card.notes, ['Ideas:', '1. Happy birthday!', '2. Hope it’s a great one'])
  assert.equal(card.notesAdded, false)
  const change = assistantCard({ tool: 'update_event', args: { id: 'softball', notes_add: ['Bring chairs'] } }, null, ctx())
  assert.deepEqual(change.notes, ['Bring chairs'])
  assert.equal(change.notesAdded, true)
  const again = assistantCard({ tool: 'update_event', args: { id: 'softball', notes_add: ['Bring chairs', 'Gate 11:45'] } }, { tool: 'update_event', args: { id: 'softball', notes_add: ['Bring chairs'] } }, ctx())
  assert.ok(again.justChanged.includes('notes changed'))
  assert.deepEqual(assistantCard(add({}), null, ctx()).notes, [])
})
