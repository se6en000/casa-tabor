import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/components/calendar/StackedView.tsx', import.meta.url), 'utf8')

test('getGoingMembers recognizes the "attendee" role written by the attendee editor', () => {
  // The MemberEditor (EventDetailPanel.tsx) always saves members with role:
  // 'attendee' now that there's no separate "primary" distinction for attendees.
  // If getGoingMembers only matches legacy roles like 'assignee'/'primary', every
  // attendee added/edited through the new editor silently stops showing a "Going"
  // badge on the calendar card.
  const fnStart = source.indexOf('function getGoingMembers')
  assert.ok(fnStart >= 0, 'expected to find getGoingMembers')
  const fnEnd = source.indexOf('\n}', fnStart)
  const fnBody = source.slice(fnStart, fnEnd)

  assert.match(fnBody, /role === 'attendee'/, 'getGoingMembers must treat role "attendee" as going')
})
