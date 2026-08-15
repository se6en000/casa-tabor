import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const header = readFileSync(
  new URL('../src/components/calendar/living-flow/components/LivingFlowHeader.tsx', import.meta.url),
  'utf8',
)
const stateHook = readFileSync(
  new URL('../src/components/calendar/living-flow/hooks/useLivingFlowState.ts', import.meta.url),
  'utf8',
)

const eventMutations = readFileSync(
  new URL('../src/lib/eventMutations.ts', import.meta.url),
  'utf8',
)

test('member editor uses the inline attendee capsule and drawer expansion', () => {
  assert.match(header, /living-attendee-capsule/)
  assert.match(header, /living-member-grid/)
  assert.match(header, /onToggleMember/)
})

test('toggling an attendee updates the state optimistically and persists to event_members', () => {
  assert.match(stateHook, /toggleMember = useCallback\(async/)
  assert.match(stateHook, /setState\(prev => \(\{ \.\.\.prev, selectedMemberIds: nextIds \}\)\)/)
  assert.match(eventMutations, /\.from\('event_members'\)/)
})
