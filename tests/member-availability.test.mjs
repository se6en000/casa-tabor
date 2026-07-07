import test from 'node:test'
import assert from 'node:assert/strict'

import { evaluateMemberAvailabilityForWindow } from '../src/lib/memberAvailability.ts'

function makeMember(overrides = {}) {
  return {
    id: 'member-1',
    name: 'Kelly',
    full_name: null,
    role: 'caregiver',
    color_hex: '#6B7FD7',
    color_name: 'Indigo',
    phone: null,
    email: null,
    google_calendar_id: null,
    can_drive: true,
    availability_mode: 'strict',
    is_admin: false,
    avatar_url: null,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

test('strict mode blocks driver during unavailable work window', () => {
  const member = makeMember({ availability_mode: 'strict' })
  const start = new Date('2026-07-06T13:00:00.000Z') // 9:00 AM ET
  const end = new Date('2026-07-06T14:00:00.000Z') // 10:00 AM ET
  const rules = [{
    id: 'r1',
    member_id: member.id,
    day_of_week: 1,
    start_local: '07:30:00',
    end_local: '18:30:00',
    availability_type: 'unavailable',
    reason: 'Working hours',
    timezone: 'America/New_York',
    created_at: '',
    updated_at: '',
  }]
  const result = evaluateMemberAvailabilityForWindow(member, start, end, rules, [])
  assert.equal(result.available, false)
  assert.match(result.reason ?? '', /Working/)
})

test('day-off exception overrides strict work rule', () => {
  const member = makeMember({ availability_mode: 'strict' })
  const start = new Date('2026-07-06T13:00:00.000Z')
  const end = new Date('2026-07-06T14:00:00.000Z')
  const rules = [{
    id: 'r1',
    member_id: member.id,
    day_of_week: 1,
    start_local: '07:30:00',
    end_local: '18:30:00',
    availability_type: 'unavailable',
    reason: 'Working hours',
    timezone: 'America/New_York',
    created_at: '',
    updated_at: '',
  }]
  const exceptions = [{
    id: 'x1',
    member_id: member.id,
    start_at: '2026-07-06T04:00:00.000Z',
    end_at: '2026-07-07T03:59:59.000Z',
    override_type: 'day_off',
    note: 'PTO',
    created_at: '',
  }]
  const result = evaluateMemberAvailabilityForWindow(member, start, end, rules, exceptions)
  assert.equal(result.available, true)
  assert.equal(result.reason, null)
})

test('flexible mode remains assignable but soft-unavailable during blocked hours', () => {
  const member = makeMember({ availability_mode: 'flexible' })
  const start = new Date('2026-07-07T13:00:00.000Z') // Tue 9:00 AM ET
  const end = new Date('2026-07-07T14:00:00.000Z')
  const rules = [{
    id: 'r1',
    member_id: member.id,
    day_of_week: 2,
    start_local: '07:30:00',
    end_local: '18:30:00',
    availability_type: 'unavailable',
    reason: 'Work block',
    timezone: 'America/New_York',
    created_at: '',
    updated_at: '',
  }]
  const result = evaluateMemberAvailabilityForWindow(member, start, end, rules, [])
  assert.equal(result.available, true)
  assert.equal(result.softUnavailable, true)
  assert.equal(result.reason, 'Work block')
})

test('child remains non-drivable in transport evaluation mode', () => {
  const child = makeMember({ role: 'child', can_drive: false, availability_mode: 'strict' })
  const start = new Date('2026-07-07T13:00:00.000Z')
  const end = new Date('2026-07-07T14:00:00.000Z')
  const result = evaluateMemberAvailabilityForWindow(child, start, end, [], [])
  assert.equal(result.available, false)
  assert.equal(result.reason, 'Cannot drive')
})

test('child blocked-hours windows are honored in presence evaluation mode', () => {
  const child = makeMember({ role: 'child', can_drive: false, availability_mode: 'strict' })
  const start = new Date('2026-07-07T13:00:00.000Z') // Tue 9:00 AM ET
  const end = new Date('2026-07-07T14:00:00.000Z')
  const rules = [{
    id: 'r2',
    member_id: child.id,
    day_of_week: 2,
    start_local: '08:00:00',
    end_local: '15:00:00',
    availability_type: 'unavailable',
    reason: 'School',
    timezone: 'America/New_York',
    created_at: '',
    updated_at: '',
  }]
  const result = evaluateMemberAvailabilityForWindow(child, start, end, rules, [], { requireCanDrive: false })
  assert.equal(result.available, false)
  assert.equal(result.reason, 'School')
})
