import test from 'node:test'
import assert from 'node:assert/strict'

import { derivePlan, inferEventMode, inferEventPlanKind } from '../src/lib/eventCommandCenter.ts'

function member(id, name, role, color = '#888888', canDrive) {
  return {
    id: `${id}-membership`,
    role: role === 'parent' ? 'primary' : 'attendee',
    family_member: { id, name, role, color_hex: color, can_drive: canDrive },
  }
}

function makeEvent(overrides = {}) {
  return {
    id: 'event-1',
    title: 'Default event',
    start_time: '2026-07-03T14:00:00.000Z',
    end_time: '2026-07-03T15:00:00.000Z',
    all_day: false,
    address: '123 Main St, Tampa, FL',
    location_name: 'Community Center',
    enrichment: { category: 'other' },
    members: [member('jake', 'Jake', 'parent'), member('liv', 'Liv', 'child', '#5A9E7A')],
    ...overrides,
  }
}

test('inferEventMode prioritizes hosted when no destination exists', () => {
  const event = makeEvent({
    title: 'School pickup car line',
    address: null,
    location_name: null,
  })
  assert.equal(inferEventMode(event), 'hosted')
})

test('location-free birthday placeholders use event details without invented logistics', () => {
  const event = makeEvent({
    title: "Liv's Birthday Celebration",
    address: null,
    location_name: null,
    enrichment: { category: 'birthday' },
  })
  const mode = inferEventMode(event)
  const plan = derivePlan(event, mode, { household: [] })
  assert.equal(inferEventPlanKind(event, mode), 'details')
  assert.equal(plan.kind, 'details')
  assert.deepEqual(plan.legs, [])
  assert.equal(plan.yourTime, null)
  assert.doesNotMatch(plan.headline, /leave|drive|hand.?off|cover/i)
})

test('at-home lessons and sitter coverage never create driving legs', () => {
  const lesson = makeEvent({
    title: 'Violin lesson at home',
    address: null,
    location_name: 'Home',
  })
  const sitter = makeEvent({
    title: 'Sitter at home',
    address: null,
    location_name: null,
  })
  const lessonPlan = derivePlan(lesson, inferEventMode(lesson), { household: [] })
  const sitterPlan = derivePlan(sitter, inferEventMode(sitter), { household: [] })
  assert.equal(lessonPlan.kind, 'at_home')
  assert.equal(sitterPlan.kind, 'coverage')
  assert.deepEqual(lessonPlan.legs, [])
  assert.deepEqual(sitterPlan.legs, [])
})

test('remote events never create driving legs', () => {
  const event = makeEvent({
    title: 'Parent conference on Zoom',
    address: null,
    location_name: 'https://zoom.us/j/123',
  })
  const plan = derivePlan(event, inferEventMode(event), { household: [] })
  assert.equal(plan.kind, 'remote')
  assert.deepEqual(plan.legs, [])
})

test('real destinations retain the travel sequence', () => {
  const event = makeEvent()
  const mode = inferEventMode(event)
  const plan = derivePlan(event, mode, { household: [] })
  assert.equal(plan.kind, 'travel')
  assert.ok(plan.legs.some((leg) => ['drop', 'depart', 'pickup', 'return'].includes(leg.kind)))
})

test('inferEventMode prioritizes trip for long duration events', () => {
  const event = makeEvent({
    title: 'Camp pickup',
    start_time: '2026-07-03T12:00:00.000Z',
    end_time: '2026-07-03T18:30:00.000Z',
  })
  assert.equal(inferEventMode(event), 'trip')
})

test('inferEventMode classifies pickup keywords when not hosted/trip', () => {
  const event = makeEvent({
    title: 'Owen school pickup',
    enrichment: { category: 'school' },
  })
  assert.equal(inferEventMode(event), 'pickup')
})

test('derivePlan defaults to stay-and-wait for child medical events', () => {
  const event = makeEvent({
    title: "Liv's pediatric appointment",
    enrichment: { category: 'medical' },
  })
  const plan = derivePlan(event, 'appointment', { household: [], eta: null, verified: true })
  const stayLeg = plan.legs.find((leg) => leg.kind === 'stay')
  assert.equal(stayLeg?.waits, true)
  assert.equal(plan.pattern, 'Stay & wait')
})

test('derivePlan defaults to stay-and-wait for appointment mode events', () => {
  const event = makeEvent({
    title: 'Cooper grooming',
    enrichment: { category: 'appointment' },
    members: [member('jake', 'Jake', 'parent')],
  })
  const plan = derivePlan(event, 'appointment', { household: [], eta: null, verified: true })
  const stayLeg = plan.legs.find((leg) => leg.kind === 'stay')
  assert.equal(stayLeg?.waits, true)
  assert.equal(stayLeg?.title, 'Jake waits on site')
  assert.equal(plan.pattern, 'Stay & wait')
})

test('derivePlan appointment mode uses drive there/home copy', () => {
  const event = makeEvent({
    title: 'Birthday party',
    enrichment: { category: 'other' },
  })
  const plan = derivePlan(event, 'appointment', { household: [], eta: null, verified: true })
  assert.equal(plan.legs[0]?.title, 'Drive there')
  assert.equal(plan.legs[2]?.title, 'Drive home')
})

test('derivePlan appointment mode shows leave time and home arrival on return leg', () => {
  const event = makeEvent({
    start_time: '2026-07-03T18:30:00.000Z',
    end_time: '2026-07-03T20:30:00.000Z',
    title: 'Birthday party',
    enrichment: { category: 'other' },
  })
  const plan = derivePlan(event, 'appointment', {
    household: [],
    verified: true,
    eta: {
      found: true,
      leave_by: '2026-07-03T17:46:00.000Z',
      drive_time_mins: 27,
      base_drive_time_mins: 24,
    },
  })
  assert.match(plan.legs[2]?.detail ?? '', /Leave at /)
  assert.match(plan.legs[2]?.detail ?? '', /arrive home ~/)
  assert.match(plan.legs[2]?.detail ?? '', /27 min/)
  assert.match(plan.headline ?? '', /back home ~/)
})

test('derivePlan uses drop-off wording for drop-off pickup-mode events', () => {
  const event = makeEvent({
    title: 'Behavior therapy drop off',
    enrichment: { category: 'school' },
  })
  const plan = derivePlan(event, 'pickup', { household: [], eta: null, verified: true })
  assert.equal(plan.pattern, 'Drop-off only')
  assert.equal(plan.legs[0]?.title, 'Drop off')
  assert.equal(plan.yourTime, 'One quick drop-off by Jake.')
})

test('derivePlan keeps pickup wording for pickup-mode events', () => {
  const event = makeEvent({
    title: 'School pickup',
    enrichment: { category: 'school' },
  })
  const plan = derivePlan(event, 'pickup', { household: [], eta: null, verified: true })
  assert.equal(plan.pattern, 'Pickup only')
  assert.equal(plan.legs[0]?.title, 'Pick up')
})

test('derivePlan supports mixed pickup/drop-off wording', () => {
  const event = makeEvent({
    title: 'Camp pickup and drop off',
    enrichment: { category: 'school' },
  })
  const plan = derivePlan(event, 'pickup', { household: [], eta: null, verified: true })
  assert.equal(plan.pattern, 'Pickup / Drop-off')
  assert.equal(plan.legs[0]?.title, 'Drop off / pick up')
})

test('derivePlan prefers a caregiver who can drive when parent cannot drive', () => {
  const event = makeEvent({
    title: 'Owen school pickup',
    members: [
      member('jake', 'Jake', 'parent', '#2C3E6B', false),
      member('kelly', 'Kelly', 'caregiver', '#8E44AD', true),
      member('owen', 'Owen', 'child', '#4A7C59', false),
    ],
  })
  const plan = derivePlan(event, 'pickup', { household: [], eta: null, verified: true })
  assert.equal(plan.legs[0]?.driver?.name, 'Kelly')
})
