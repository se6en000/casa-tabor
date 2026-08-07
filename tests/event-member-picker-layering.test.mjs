import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const panel = readFileSync(
  new URL('../src/components/calendar/EventDetailPanel.tsx', import.meta.url),
  'utf8',
)

test('member editor stays hidden in the existing expandable header section', () => {
  assert.match(panel, /rosterOpen && \([\s\S]*<MemberEditor/)
  assert.doesNotMatch(panel.slice(panel.indexOf('function MemberEditor'), panel.indexOf('Category quick-edit popover')), /showPicker/)
  // The header remains overflow-visible for the category popover and artwork.
  assert.match(panel, /overflow-visible border-b border-casa-border bg-casa-bg px-6 pb-5 pt-4/)
  assert.doesNotMatch(panel, /overflow-hidden border-b border-casa-border bg-casa-bg px-6/)
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
