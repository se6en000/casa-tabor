import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const editSource = readFileSync(
  new URL('../src/components/calendar/EventEditSheet.tsx', import.meta.url),
  'utf8',
)
const headerSource = readFileSync(
  new URL('../src/components/calendar/living-flow/components/LivingFlowHeader.tsx', import.meta.url),
  'utf8',
)
const stateHook = readFileSync(
  new URL('../src/components/calendar/living-flow/hooks/useLivingFlowState.ts', import.meta.url),
  'utf8',
)

test('event attendee editors use binary attending or not-attending selection', () => {
  assert.match(editSource, /const isAttending = memberRoles\[member\.id\] === 'attendee'/)
  assert.match(editSource, /if \(prev\[member\.id\]\) delete next\[member\.id\][\s\S]*else next\[member\.id\] = 'attendee'/)
  assert.match(editSource, /selected=\{isAttending\}/)
  assert.doesNotMatch(editSource, /Tap once = Supporting|isPrimary|isSupporting/)
})

test('Living Flow attendee editing reveals the member selector in the header capsule', () => {
  assert.match(headerSource, /living-attendee-capsule/)
  assert.match(headerSource, /living-member-grid/)
  assert.match(headerSource, /onToggleMember/)
  assert.match(stateHook, /toggleMember = useCallback\(async/)
})
