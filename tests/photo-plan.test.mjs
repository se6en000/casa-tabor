import test from 'node:test'
import assert from 'node:assert/strict'
import { fullAiCard, fullAiTools } from '../supabase/functions/_shared/assistant-full-ai.mjs'

// P3.24 — a flyer's details for an event already on the calendar (event_details), never a second copy: the plan
// engine's kind, used by the Scan it sheet's save and by a planning conversation ("add those details to the
// field trip"). Jake, 2026-09-30, chose to improve Scan it rather than send photos to the planning model.
const utcOffset = '-04:00'
const now = new Date('2026-09-29T19:00:00-04:00')
const events = [{ id: 'e-trip', title: 'Field trip', start_time: '2026-10-01T04:00:00Z', end_time: '2026-10-02T03:59:00Z', all_day: true, event_type: 'event', people: [], drivers: [], place: null, address: null }]
const family = [{ id: 'm-owen', name: 'Owen' }, { id: 'm-liv', name: 'Liv' }]
const call = (items) => fullAiCard({ name: 'set_plan', args: { title: 'Owen’s field trip', items } }, { events, utcOffset, now, projects: [], family })

test('new details go onto an event already there: its time, place, notes and who', () => {
  const plan = call([
    { kind: 'event_details', event_id: 'e-trip', start: '2026-10-01T09:30', end: '2026-10-01T12:00', place: 'Glazer Hall', notes: 'By bus from school, back for lunch. Questions: Kim Kerry (561) 329-1269', people: ['Owen', 'Nobody'], why: 'The flyer has the times' },
    { kind: 'pack', label: 'Neon pink Kindergarten by the Sea shirt', for_event: 'e-trip' },
    { kind: 'pack', label: 'Packed lunch', for_event: 'e-trip' },
  ])
  assert.equal(plan.tool, 'apply_plan')
  assert.deepEqual(plan.args.items[0], { id: 'i1', kind: 'event_details', event_id: 'e-trip', title: 'Field trip', why: 'The flyer has the times',
    changes: { start: '2026-10-01T09:30:00-04:00', end: '2026-10-01T12:00:00-04:00', place: 'Glazer Hall', notes: 'By bus from school, back for lunch. Questions: Kim Kerry (561) 329-1269', people: ['Owen'] } })
  assert.equal(plan.args.items.filter((i) => i.kind === 'pack').length, 2)
})

test('never onto an event that isn’t there, and never an empty change', () => {
  const plan = call([
    { kind: 'event_details', event_id: 'made-up', place: 'Glazer Hall' },
    { kind: 'event_details', event_id: 'e-trip' },
    { kind: 'todo', title: 'Sign the permission slip' },
  ])
  assert.deepEqual(plan.args.items.map((i) => i.kind), ['todo'])
})

test('the plan tool knows event_details', () => {
  const tool = fullAiTools({ planning: true }).find((t) => t.name === 'set_plan')
  assert.ok(tool.parameters.properties.items.items.properties.kind.enum.includes('event_details'))
  assert.match(tool.description, /never a second copy of it/)
})
