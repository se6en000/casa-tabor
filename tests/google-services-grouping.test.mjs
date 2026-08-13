import assert from 'node:assert/strict'
import test from 'node:test'

import { splitGoogleServiceMembers, isActiveGoogleServiceMember } from '../src/utils/googleServicesGrouping.ts'

test('isActiveGoogleServiceMember treats connected, usable accounts as active', () => {
  assert.equal(
    isActiveGoogleServiceMember({
      status: { google_email: 'active@example.com', is_enabled: true, reauthorization_required: false },
    }),
    true,
  )
  assert.equal(
    isActiveGoogleServiceMember({
      status: { google_email: 'reauth@example.com', is_enabled: true, reauthorization_required: true },
    }),
    false,
  )
  assert.equal(
    isActiveGoogleServiceMember({
      status: { google_email: 'disabled@example.com', is_enabled: false, reauthorization_required: false },
    }),
    false,
  )
  assert.equal(isActiveGoogleServiceMember({ status: null }), false)
})

test('splitGoogleServiceMembers returns active accounts first and preserves sort order', () => {
  const { activeMembers, inactiveMembers } = splitGoogleServiceMembers([
    {
      id: 'c',
      sort_order: 30,
      status: { google_email: 'active-2@example.com', is_enabled: true, reauthorization_required: false },
    },
    {
      id: 'a',
      sort_order: 10,
      status: { google_email: 'active-1@example.com', is_enabled: true, reauthorization_required: false },
    },
    {
      id: 'b',
      sort_order: 20,
      status: { google_email: 'inactive@example.com', is_enabled: true, reauthorization_required: true },
    },
  ])

  assert.deepEqual(activeMembers.map((member) => member.id), ['a', 'c'])
  assert.deepEqual(inactiveMembers.map((member) => member.id), ['b'])
})
