import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

process.env.TZ = 'America/New_York'

import {
  buildCreatePreviewCopy,
  buildDeleteManyPreviewCopy,
  buildDeletePreviewCopy,
  buildUpdatePreviewCopy,
} from '../src/utils/aiConfirmPreview.ts'

const event = {
  title: 'Dentist appointment',
  start_time: '2026-07-14T20:00:00-04:00',
  end_time: '2026-07-14T21:00:00-04:00',
  all_day: false,
}

const drawerSource = await readFile(
  new URL('../src/components/shared/AIChatDrawer.tsx', import.meta.url),
  'utf8',
)
const previewSource = await readFile(
  new URL('../src/utils/aiConfirmPreview.ts', import.meta.url),
  'utf8',
)

test('update preview explains the current and new time', () => {
  const preview = buildUpdatePreviewCopy({ id: 'event-1', start: '2026-07-14T16:00:00-04:00', end: '2026-07-14T17:00:00-04:00' }, event)
  assert.equal(preview.heading, 'Move "Dentist appointment"')
  assert.equal(preview.currentSpan, 'Tue, Jul 14 · 8:00 PM – 9:00 PM')
  assert.equal(preview.nextSpan, 'Tue, Jul 14 · 4:00 PM – 5:00 PM')
})

test('delete preview names the event and says what happens', () => {
  const preview = buildDeletePreviewCopy(event, { id: 'event-1' })
  assert.equal(preview.heading, 'Delete "Dentist appointment"')
  assert.match(preview.when ?? '', /8:00 PM/)
  assert.match(preview.note, /removes it from your calendar/)
})

test('bulk delete preview lists the actual matching events', () => {
  const preview = buildDeleteManyPreviewCopy([
    { id: 'a', title: 'Dentist appointment', start_time: '2026-07-14T20:00:00-04:00', end_time: '2026-07-14T21:00:00-04:00', all_day: false },
    { id: 'b', title: 'Dentist appointment', start_time: '2026-07-15T11:00:00-04:00', end_time: '2026-07-15T12:00:00-04:00', all_day: false },
    { id: 'c', title: 'Dentist appointment', start_time: '2026-07-16T09:00:00-04:00', end_time: '2026-07-16T10:00:00-04:00', all_day: false },
  ], {
    ids: ['a', 'b', 'c'],
    title_query: 'Dentist appointment',
    count: 3,
  })
  assert.equal(preview.heading, 'Delete 3 matching events?')
  assert.match(preview.note, /remove 3 events/)
  assert.equal(preview.matches.length, 3)
  assert.match(preview.matches[0], /Dentist appointment —/)
})

test('create preview names the new event and date', () => {
  const preview = buildCreatePreviewCopy({
    title: 'Team lunch',
    start: '2026-07-16T12:00:00-04:00',
    end: '2026-07-16T13:00:00-04:00',
    location: 'The Square',
    members: ['Jake', 'Kelly'],
  }, { now: new Date('2026-07-16T08:00:00-04:00') })
  assert.equal(preview.heading, 'Ready to add "Team lunch"?')
  assert.equal(preview.when, 'Today · 12:00 PM – 1:00 PM')
  assert.deepEqual(preview.details, ['Location: The Square', 'People: Jake, Kelly', 'Duration: 1 hour'])
  assert.match(preview.impact, /Casa Calendar now/)
  assert.doesNotMatch(preview.details.join(' '), /Guests:/)
})

test('tool confirmations use the card as the only pending-action heading', () => {
  assert.match(drawerSource, /\{!ta && msg\.content/)
  assert.match(drawerSource, /editSeed=\{messages\.slice\(0, messageIndex\)\.findLast/)
  assert.match(drawerSource, /onEditMessage\(editSeed \?\? ''\)/)
})

test('confirmation actions are concrete and use touch-sized controls', () => {
  for (const label of [
    'Create event',
    'Apply change',
    'Delete event',
    'Delete matching events',
    'Add items',
    'Save recipe',
    'Update item',
    'Remove item',
    'Update quantity',
    'Clear checked items',
    'Change',
    'Cancel',
  ]) {
    assert.match(drawerSource, new RegExp(label))
  }
  assert.match(drawerSource, /min-h-control flex items-center gap-2 px-4/)
})

test('every supported tool has an informational preview branch', () => {
  for (const tool of [
    'create_event',
    'update_event',
    'bulk_update_events',
    'delete_event',
    'delete_events_by_title',
    'add_grocery_items',
    'create_recipe',
    'check_grocery_item',
    'remove_grocery_item',
    'update_grocery_item_quantity',
    'clear_checked_grocery_items',
  ]) {
    assert.match(drawerSource, new RegExp(`tool === '${tool}'`))
  }
  assert.match(previewSource, /connected calendar sync follows automatically/)
  assert.match(drawerSource, /iOS Reminders sync follows asynchronously/)
})
