import assert from 'node:assert/strict'
import test from 'node:test'

import {
  splitGoogleServiceMembers,
  isActiveGoogleServiceMember,
  isGmailActiveMember,
  isCalendarOnlyMember,
} from '../src/utils/googleServicesGrouping.ts'

test('isActiveGoogleServiceMember treats connected, usable accounts as active', () => {
  assert.equal(
    isActiveGoogleServiceMember({
      id: '1',
      sort_order: 1,
      status: { google_email: 'active@example.com', is_enabled: true, reauthorization_required: false },
    }),
    true,
  )
  assert.equal(
    isActiveGoogleServiceMember({
      id: '2',
      sort_order: 2,
      status: { google_email: 'reauth@example.com', is_enabled: true, reauthorization_required: true },
    }),
    false,
  )
  assert.equal(
    isActiveGoogleServiceMember({
      id: '3',
      sort_order: 3,
      status: { google_email: 'disabled@example.com', is_enabled: false, reauthorization_required: false },
    }),
    false,
  )
  assert.equal(isActiveGoogleServiceMember({ id: '4', sort_order: 4, status: null }), false)
})

test('isGmailActiveMember requires connected, enabled, not reauth, and gmail_scan_enabled', () => {
  assert.equal(
    isGmailActiveMember({
      id: '1',
      sort_order: 1,
      status: { google_email: 'jake@example.com', is_enabled: true, reauthorization_required: false, gmail_scan_enabled: true },
    }),
    true,
  )
  assert.equal(
    isGmailActiveMember({
      id: '2',
      sort_order: 2,
      status: { google_email: 'cal@example.com', is_enabled: true, reauthorization_required: false, gmail_scan_enabled: false },
    }),
    false,
  )
})

test('splitGoogleServiceMembers returns active accounts with Gmail active first then calendar-only', () => {
  const { gmailActiveMembers, calendarOnlyMembers, activeMembers, inactiveMembers } = splitGoogleServiceMembers([
    {
      id: 'c',
      sort_order: 30,
      status: { google_email: 'cal-only@example.com', is_enabled: true, reauthorization_required: false, gmail_scan_enabled: false },
    },
    {
      id: 'a',
      sort_order: 10,
      status: { google_email: 'gmail-active@example.com', is_enabled: true, reauthorization_required: false, gmail_scan_enabled: true },
    },
    {
      id: 'b',
      sort_order: 20,
      status: { google_email: 'inactive@example.com', is_enabled: true, reauthorization_required: true },
    },
  ])

  assert.deepEqual(gmailActiveMembers.map((m) => m.id), ['a'])
  assert.deepEqual(calendarOnlyMembers.map((m) => m.id), ['c'])
  assert.deepEqual(activeMembers.map((m) => m.id), ['a', 'c'])
  assert.deepEqual(inactiveMembers.map((m) => m.id), ['b'])
})
