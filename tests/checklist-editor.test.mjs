import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/components/calendar/ChecklistEditor.tsx', import.meta.url), 'utf8')

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
  const editableBlockMatch = source.match(/\{editable && \(\s*<div className="flex items-center gap-2 mt-2[\s\S]*?Add an item/)
  assert.ok(editableBlockMatch, 'expected the add-item input block to be gated behind `editable &&`')
})

test('ChecklistEditor inserts new items with the next sort_order and event_id', () => {
  assert.match(source, /supabase\s*\.from\('event_checklist_items'\)\s*\.insert\(\{ event_id: eventId, label, checked: false, sort_order: nextSortOrder \}\)/)
})

test('ChecklistEditor surfaces a visible error and rolls back optimistic state on toggle failure', () => {
  assert.match(source, /setLocalChecked\(\(prev\) => \(\{ \.\.\.prev, \[item\.id\]: previous \}\)\)/)
  assert.match(source, /setSaveError\(`Could not update "\$\{item\.label\}"\. \$\{error\.message\}`\)/)
})
