import assert from 'node:assert/strict'
import test from 'node:test'

import { conflictMetaLine, directorySuggestionMetaLine, prepMetaLine } from '../src/utils/needsYouMeta.ts'

test('prepMetaLine shows a plain "Today · h:mm a" line when due_by is later today', () => {
  const dueBy = new Date()
  dueBy.setHours(dueBy.getHours() + 1, 0, 0, 0)
  const line = prepMetaLine({ source_type: 'reminder_manual', due_by: dueBy.toISOString() })
  assert.match(line.text, /^Today · \d{1,2}:\d{2} (AM|PM)$/)
})

test('prepMetaLine shows "Tomorrow · h:mm a" when due_by falls tomorrow', () => {
  const dueBy = new Date()
  dueBy.setDate(dueBy.getDate() + 1)
  dueBy.setHours(15, 0, 0, 0)
  const line = prepMetaLine({ source_type: 'calendar_ai', due_by: dueBy.toISOString() })
  assert.equal(line.text, 'Tomorrow · 3:00 PM')
})

test('prepMetaLine falls back to "via {source} · {assignee}" when there is no due date', () => {
  const line = prepMetaLine({ source_type: 'gmail' }, 'Jake')
  assert.equal(line.text, 'via email · Jake')
})

test('prepMetaLine falls back to "via {source}" (no assignee) when unassigned', () => {
  const line = prepMetaLine({ source_type: 'gmail' })
  assert.equal(line.text, 'via email')
})

test('prepMetaLine lowercases the source label for the "via" fallback', () => {
  assert.equal(prepMetaLine({ source_type: 'reminder_manual' }).text, 'via reminder')
  assert.equal(prepMetaLine({ source_type: 'calendar_ai' }).text, 'via calendar')
})

test('conflictMetaLine joins both event start times with "&", labeled by day', () => {
  const today = new Date()
  const a = new Date(today); a.setHours(8, 30, 0, 0)
  const b = new Date(today); b.setHours(12, 0, 0, 0)
  const line = conflictMetaLine({
    event_a: { id: 'a', title: 'Meet & Greet', start_time: a.toISOString() },
    event_b: { id: 'b', title: 'Mary RBT to Watch Owen', start_time: b.toISOString() },
  })
  assert.equal(line.text, 'Today · 8:30 AM & 12:00 PM')
})

test('conflictMetaLine falls back gracefully when event data is missing', () => {
  const line = conflictMetaLine(null)
  assert.equal(line.text, 'Scheduling conflict')
})

test('directorySuggestionMetaLine is a static "Auto-detected · needs your review" line', () => {
  assert.equal(directorySuggestionMetaLine.text, 'Auto-detected · needs your review')
})
