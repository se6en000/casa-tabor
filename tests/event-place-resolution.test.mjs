import assert from 'node:assert/strict'
import test from 'node:test'

import {
  findSavedEventPlace,
  selectConfidentEventPlace,
} from '../supabase/functions/_shared/event-place-resolution.mjs'

test('selects a business matching the expressed venue identity', () => {
  const place = selectConfidentEventPlace('Sky Zone Palm Springs', [{
    name: 'Sky Zone Trampoline Park',
    address: '964 S Congress Ave, Palm Springs, FL 33406, USA',
    primary_type: 'amusement_center',
  }])

  assert.equal(place?.name, 'Sky Zone Trampoline Park')
})

test('rejects a city-only Places result as an event destination', () => {
  const place = selectConfidentEventPlace('Palm Springs', [{
    name: 'Palm Springs',
    address: 'Palm Springs, FL, USA',
    primary_type: 'locality',
  }])

  assert.equal(place, null)
})

test('prefers an exact saved-place alias', () => {
  const place = findSavedEventPlace('school', [{
    name: 'Palm Beach Day Academy',
    aliases: ['school', 'PBDA'],
    address: '1901 S Flagler Dr',
  }])

  assert.equal(place?.name, 'Palm Beach Day Academy')
})
