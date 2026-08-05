import assert from 'node:assert/strict'
import test from 'node:test'

import {
  canonicalizeFamilyReferences,
  formatFamilyIdentityAliases,
  resolveFamilyMemberByName,
} from '../supabase/functions/_shared/family-identity.mjs'

const family = [
  { id: 'liv-id', name: 'Liv', full_name: 'Olivia Tabor' },
  { id: 'jake-id', name: 'Jake', full_name: 'Jake Tabor' },
]

test('full-name aliases resolve to the canonical family member', () => {
  assert.equal(resolveFamilyMemberByName(family, 'Olivia')?.id, 'liv-id')
  assert.equal(resolveFamilyMemberByName(family, 'Olivia Tabor')?.id, 'liv-id')
  assert.equal(resolveFamilyMemberByName(family, 'Liv')?.id, 'liv-id')
  assert.equal(resolveFamilyMemberByName(family, 'Unknown'), null)
})

test('aliases canonicalize deterministic intent input without changing unrelated names', () => {
  assert.equal(
    canonicalizeFamilyReferences('Schedule Olivia Tabor for a dentist visit with Jake.', family),
    'Schedule Liv for a dentist visit with Jake.',
  )
})

test('identity aliases include a full name and distinct first-name alias', () => {
  assert.equal(
    formatFamilyIdentityAliases(family),
    'Olivia Tabor = Liv; Olivia = Liv; Jake Tabor = Jake',
  )
})
