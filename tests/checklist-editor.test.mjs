import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/components/calendar/ChecklistEditor.tsx', import.meta.url), 'utf8')
const calendarEventsSource = readFileSync(new URL('../src/hooks/useCalendarEvents.ts', import.meta.url), 'utf8')

test('ChecklistEditor toggles checked state directly against event_checklist_items', () => {
  assert.match(source, /supabase\.from\('event_checklist_items'\)\.update\(\{ checked: newVal \}\)\.eq\('id', item\.id\)/)
})

test('ChecklistEditor only renders the remove control when editable', () => {
  assert.match(source, /\{editable && \(\s*<IconButton[\s\S]*?aria-label=\{`Remove "\$\{item\.label\}"`\}/)
})

test('ChecklistEditor removes a row via delete, not just local hide', () => {
  assert.match(source, /supabase\.from\('event_checklist_items'\)\.delete\(\)\.eq\('id', item\.id\)/)
})

test('ChecklistEditor add-item input only renders when editable', () => {
  const editableBlockMatch = source.match(/\{editable && \(\s*<div className="[^"]*mt-2[^"]*"[\s\S]*?Add an item/)
  assert.ok(editableBlockMatch, 'expected the add-item input block to be gated behind `editable &&`')
})

test('ChecklistEditor uses shared controls and provides a visible touch-friendly Add action', () => {
  assert.match(source, /import \{ Button, Checkbox, IconButton, Input \} from '\.\.\/ui'/)
  assert.match(source, /<Input[\s\S]*?aria-label="New checklist item"/)
  assert.match(source, /<Button[\s\S]*?onClick=\{\(\) => void addItem\(\)\}[\s\S]*?>\s*Add\s*<\/Button>/)
  assert.doesNotMatch(source, /<input/)
})

test('ChecklistEditor inserts new items with the next sort_order and event_id', () => {
  assert.match(source, /supabase\s*\.from\('event_checklist_items'\)\s*\.insert\(\{ event_id: eventId, label, checked: false, sort_order: nextSortOrder \}\)/)
})

test('ChecklistEditor does not duplicate an optimistic item after query refresh returns it', () => {
  assert.match(source, /itemIds = new Set\(items\.map\(\(item\) => item\.id\)\)/)
  assert.match(source, /addedItems\.filter\(\(item\) => !itemIds\.has\(item\.id\)\)/)
})

test('ChecklistEditor surfaces a visible error and rolls back optimistic state on toggle failure', () => {
  assert.match(source, /setLocalChecked\(\(prev\) => \(\{ \.\.\.prev, \[item\.id\]: previous \}\)\)/)
  assert.match(source, /setSaveError\(`Could not update "\$\{item\.label\}"\. \$\{error\.message\}`\)/)
})

test('ChecklistEditor invalidates both summary and event-details caches after every successful mutation', () => {
  const invalidationHelper = source.match(/const invalidateChecklistQueries = async \(\) => \{[\s\S]*?\n  \}/)?.[0] ?? ''
  assert.match(invalidationHelper, /queryKey: \['events'\]/)
  assert.match(invalidationHelper, /queryKey: \['event-details', eventId\]/)
  assert.equal(
    [...source.matchAll(/await invalidateChecklistQueries\(\)/g)].length,
    3,
    'toggle, remove, and add must all refresh the same canonical caches',
  )
})

test('calendar realtime invalidation includes event_checklist_items', () => {
  assert.match(
    calendarEventsSource,
    /\.on\('postgres_changes', \{ event: '\*', schema: 'public', table: 'event_checklist_items' \}, _fireInvalidation\)/,
  )
})
