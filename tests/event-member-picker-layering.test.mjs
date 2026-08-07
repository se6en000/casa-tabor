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

test('removing an attendee updates the roster (avatars + chips) before persistence completes and restores it on failure', () => {
  const removeStart = panel.indexOf('async function removeMember')
  const removeEnd = panel.indexOf('async function addMember', removeStart)
  const removeMember = panel.slice(removeStart, removeEnd)

  assert.ok(removeStart >= 0)
  assert.match(removeMember, /onMembersOverride\(nextMembers\)/)
  assert.ok(
    removeMember.indexOf('onMembersOverride(nextMembers)') < removeMember.indexOf('await saveAssignments'),
    'the roster must update before persistence begins',
  )
  assert.match(panel, /const effectiveMembers = membersOverride \?\? event\.members \?\? \[\]/)
  assert.match(removeMember, /if \(result === 'cancelled'\)[\s\S]*onMembersOverride\(previousMembers\)/)
  assert.match(removeMember, /catch \(cause\)[\s\S]*onMembersOverride\(previousMembers\)/)
})
