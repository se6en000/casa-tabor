import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  conflictToNeedsYouItem,
  directorySuggestionToNeedsYouItem,
  isReadOnlyNeedsYouItem,
  mergeNeedsYouItems,
} from '../src/utils/needsYouFeed.ts'

const homeRightPanel = readFileSync(new URL('../src/components/home/HomeRightPanel.tsx', import.meta.url), 'utf8')
const actionHubPage = readFileSync(new URL('../src/pages/ActionHubPage.tsx', import.meta.url), 'utf8')

const baseConflict = {
  id: 'conflict-1',
  event_a_id: 'event-a',
  event_b_id: 'event-b',
  conflict_type: 'double_booked',
  severity: 3,
  description: 'Two events overlap on Tuesday',
  resolved: false,
  resolution: null,
  resolved_at: null,
  resolved_by: null,
  created_at: '2026-08-10T12:00:00.000Z',
  event_a: { id: 'event-a', start_time: '2026-08-11T15:00:00.000Z', title: 'Piano lesson' },
}

const baseDirectorySuggestion = {
  id: 'notif-1',
  type: 'directory_suggestions',
  title: 'New directory entries found',
  body: '3 new entries detected from recent events',
  event_id: null,
  source: 'directory-scan',
  read: false,
  created_at: '2026-08-10T09:00:00.000Z',
  event: null,
}

test('conflictToNeedsYouItem normalizes a Conflict row into the PrepItem shape', () => {
  const item = conflictToNeedsYouItem(baseConflict)
  assert.equal(item.id, 'conflict-1')
  assert.equal(item.source_type, 'conflict')
  assert.equal(item.description, 'Two events overlap on Tuesday')
  assert.equal(item.event_id, 'event-a')
  assert.equal(item.event_title, 'Piano lesson')
  assert.equal(item.event_date, '2026-08-11T15:00:00.000Z')
  assert.equal(item.priority, 3)
  assert.equal(item.dismissed, false)
})

test('directorySuggestionToNeedsYouItem normalizes a directory_suggestions Notification into the PrepItem shape', () => {
  const item = directorySuggestionToNeedsYouItem(baseDirectorySuggestion)
  assert.equal(item.id, 'notif-1')
  assert.equal(item.source_type, 'directory_suggestion')
  assert.equal(item.description, '3 new entries detected from recent events')
  assert.equal(item.dismissed, false)
})

test('isReadOnlyNeedsYouItem is true for conflict and directory_suggestion source types', () => {
  assert.equal(isReadOnlyNeedsYouItem({ source_type: 'conflict' }), true)
  assert.equal(isReadOnlyNeedsYouItem({ source_type: 'directory_suggestion' }), true)
})

test('isReadOnlyNeedsYouItem is false for genuine prep items', () => {
  assert.equal(isReadOnlyNeedsYouItem({ source_type: 'gmail' }), false)
  assert.equal(isReadOnlyNeedsYouItem({ source_type: null }), false)
  assert.equal(isReadOnlyNeedsYouItem({ source_type: undefined }), false)
})

test('mergeNeedsYouItems combines prep items, conflicts, and directory suggestions into one sorted list', () => {
  const prepItems = [
    { id: 'prep-1', priority: 1, due_by: null, created_at: '2026-08-09T00:00:00.000Z' },
  ]
  const merged = mergeNeedsYouItems(prepItems, [baseConflict], [baseDirectorySuggestion])
  assert.equal(merged.length, 3)
  const ids = merged.map((i) => i.id)
  assert.ok(ids.includes('prep-1'))
  assert.ok(ids.includes('conflict-1'))
  assert.ok(ids.includes('notif-1'))
  // Highest priority (the conflict, priority 3) should sort first.
  assert.equal(merged[0].id, 'conflict-1')
})

test('mergeNeedsYouItems excludes already-resolved conflicts and read directory suggestions', () => {
  const resolvedConflict = { ...baseConflict, resolved: true }
  const readSuggestion = { ...baseDirectorySuggestion, read: true }
  const merged = mergeNeedsYouItems([], [resolvedConflict], [readSuggestion])
  assert.equal(merged.length, 0)
})

test('HomeRightPanel hides prep-only action buttons for read-only Needs You items', () => {
  assert.match(homeRightPanel, /isReadOnlyNeedsYouItem/)
})

test('ActionHubPage hides prep-only action buttons for read-only Needs You items', () => {
  assert.match(actionHubPage, /isReadOnlyNeedsYouItem/)
})
