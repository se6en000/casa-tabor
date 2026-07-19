import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const panel = readFileSync(
  new URL('../src/components/calendar/EventDetailPanel.tsx', import.meta.url),
  'utf8',
)

test('member picker escapes the header and stacks above later event sections', () => {
  assert.match(panel, /showPicker && 'z-popover'/)
  // The crown must remain overflow-visible so category and member popovers are
  // not clipped; BirthdayCardDecoration contains its own artwork overflow.
  assert.match(panel, /overflow-visible px-6 pt-4 pb-5/)
  assert.doesNotMatch(panel, /overflow-hidden px-6 pt-4 pb-5/)
})

test('removing an attendee hides its pill before persistence completes and restores it on failure', () => {
  const removeStart = panel.indexOf('async function removeMember')
  const removeEnd = panel.indexOf('async function addMember', removeStart)
  const removeMember = panel.slice(removeStart, removeEnd)

  assert.ok(removeStart >= 0)
  assert.match(removeMember, /setOptimisticallyRemovedIds\(\(removedIds\) => new Set\(removedIds\)\.add\(eventMemberId\)\)/)
  assert.ok(
    removeMember.indexOf('setOptimisticallyRemovedIds') < removeMember.indexOf('await saveAssignments'),
    'the pill must disappear before persistence begins',
  )
  assert.match(panel, /event\.members\.filter\(\(member\) => !optimisticallyRemovedIds\.has\(member\.id\)\)/)
  assert.match(removeMember, /if \(result === 'cancelled'\)[\s\S]*restoredIds\.delete\(eventMemberId\)/)
  assert.match(removeMember, /catch \(cause\)[\s\S]*restoredIds\.delete\(eventMemberId\)/)
})
