import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const editSource = readFileSync(
  new URL('../src/components/calendar/EventEditSheet.tsx', import.meta.url),
  'utf8',
)
const detailSource = readFileSync(
  new URL('../src/components/calendar/EventDetailPanel.tsx', import.meta.url),
  'utf8',
)

test('event attendee editors use binary attending or not-attending selection', () => {
  assert.match(editSource, /const isAttending = memberRoles\[member\.id\] === 'attendee'/)
  assert.match(editSource, /if \(prev\[member\.id\]\) delete next\[member\.id\][\s\S]*else next\[member\.id\] = 'attendee'/)
  assert.match(editSource, /selected=\{isAttending\}/)
  assert.doesNotMatch(editSource, /Tap once = Supporting|isPrimary|isSupporting/)

  assert.doesNotMatch(detailSource, /makeOwner|Make .* primary|Primary attendee/)
  assert.match(detailSource, /role: 'attendee'/)
})

test('read-view attendee editing reveals the same complete binary selector', () => {
  const editorStart = detailSource.indexOf('function MemberEditor')
  const editorEnd = detailSource.indexOf('/* ── Category quick-edit popover', editorStart)
  const memberEditor = detailSource.slice(editorStart, editorEnd)

  assert.match(memberEditor, /allMembers\.map\(\(member\) =>/)
  assert.match(memberEditor, /const selected = assignedIds\.has\(member\.id\)/)
  assert.match(memberEditor, /selected=\{selected\}/)
  assert.match(memberEditor, /if \(selected && eventMember\)[\s\S]*removeMember[\s\S]*else[\s\S]*addMember/)
  assert.match(detailSource, /rosterOpen && \([\s\S]*<MemberEditor/)
  assert.doesNotMatch(memberEditor, /showPicker|>\s*Add\s*</)
})

test('read-view attendee editing remains available when nobody is assigned yet', () => {
  assert.match(detailSource, /const showLowerSection = rosterOpen \|\| addressEditorOpen/)
  assert.match(detailSource, /onClick=\{\(\) => setRosterOpen\(\(open\) => !open\)\}/)
  assert.match(detailSource, /\{rosterOpen && \(/)
  assert.doesNotMatch(detailSource, /\{\(hasPeople \|\| showAddressSummary\) && \(/)
})
