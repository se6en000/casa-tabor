import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  filterImmediateFamilyMembers,
  isSharedFamilyInbox,
  resolveImmediateFamilyMember,
} from '../supabase/functions/_shared/immediate-family-scope.mjs'

const graphSource = readFileSync(new URL('../supabase/functions/build-household-graph/index.ts', import.meta.url), 'utf8')
const gmailSource = readFileSync(new URL('../supabase/functions/scan-gmail-inbox/index.ts', import.meta.url), 'utf8')
const assistantSource = readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')

test('immediate family filter keeps only Jake, Kelly, Liv, Emme, and Owen', () => {
  const members = [
    { id: '1', name: 'Jake' },
    { id: '2', name: 'Kelly' },
    { id: '3', name: 'Liv' },
    { id: '4', name: 'Emme' },
    { id: '5', name: 'Owen' },
    { id: '6', name: 'Tabor Family' },
    { id: '7', name: 'Ms Paine' },
  ]
  assert.deepEqual(
    filterImmediateFamilyMembers(members).map((member) => member.name),
    ['Jake', 'Kelly', 'Liv', 'Emme', 'Owen'],
  )
})

test('shared family inbox detection recognizes the household mailbox', () => {
  assert.equal(isSharedFamilyInbox('taborfamilyemail@gmail.com'), true)
  assert.equal(isSharedFamilyInbox('TaborFamilyEmail@gmail.com'), true)
  assert.equal(isSharedFamilyInbox('jake@gmail.com'), false)
})

test('shared inbox evidence can resolve to an immediate member using entity names', () => {
  const members = filterImmediateFamilyMembers([
    { id: '1', name: 'Jake' },
    { id: '2', name: 'Kelly' },
    { id: '3', name: 'Liv' },
    { id: '4', name: 'Emme' },
    { id: '5', name: 'Owen' },
    { id: '6', name: 'Tabor Family' },
  ])
  const resolved = resolveImmediateFamilyMember({
    members,
    preferredName: null,
    entityNames: ['Rosangela Paine', 'Owen', 'Palm Beach Public Elementary School'],
    fallbackMemberId: null,
  })
  assert.equal(resolved?.id, '5')
})

test('graph, gmail scan, and assistant apply immediate-family scope helper', () => {
  assert.match(graphSource, /filterImmediateFamilyMembers/)
  assert.match(gmailSource, /filterImmediateFamilyMembers/)
  assert.match(gmailSource, /isSharedFamilyInbox/)
  assert.match(assistantSource, /filterImmediateFamilyMembers/)
})
