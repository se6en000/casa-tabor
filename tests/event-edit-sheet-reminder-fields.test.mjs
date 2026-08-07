import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/components/calendar/EventEditSheet.tsx', import.meta.url), 'utf8')

test('EventEditSheet hides the Category picker entirely for reminders', () => {
  const categoryBlock = source.match(/\{\/\* ── Category picker ── \*\/\}[\s\S]*?Changing the category updates which fields are shown below\./)
  assert.ok(categoryBlock, 'expected to find the Category picker block')
  assert.match(categoryBlock[0], /eventType !== 'reminder' &&/, 'Category section should be gated behind eventType !== \'reminder\'')
})

test('EventEditSheet renders a single date/time picker (no end time) for reminders, using native date+time inputs not datetime-local', () => {
  assert.match(source, /eventType === 'reminder'/)
  assert.doesNotMatch(source, /type="datetime-local"/, 'this repo uses DateTimeDial/native date+time inputs, not datetime-local, per design-system precedent')
  // A reminder branch must set both startDT and endDT to the same value so a
  // reminder remains a point in time, not a range, without changing the
  // underlying save contract that still reads both fields.
  assert.match(source, /setStartDT\(next\)[\s\S]{0,80}setEndDT\(next\)/)
})

test('EventEditSheet keeps the full dual-dial Date & Time UI for events', () => {
  assert.match(source, /<DateTimeDial/)
})

test('EventEditSheet keeps Repeat available for reminders (no reminder gate around it)', () => {
  const repeatBlock = source.match(/\{\/\* Recurrence \*\/\}[\s\S]*?<\/DisclosureSection>/)
  assert.ok(repeatBlock, 'expected to find the Repeat DisclosureSection block')
  assert.doesNotMatch(repeatBlock[0], /eventType === 'reminder'/, 'Repeat should not be conditionally hidden for reminders')
})

test('EventEditSheet defaults Location closed for reminders instead of auto-expanding when empty', () => {
  assert.match(source, /defaultOpen=\{eventType === 'reminder' \? false : \(!location && !address\)\}/)
})

test('EventEditSheet stores timed reminders with a valid positive internal duration in both save paths', () => {
  assert.match(source, /import \{ normalizeReminderTimeRange \} from '\.\.\/\.\.\/utils\/reminderTimeRange'/)
  assert.equal(
    [...source.matchAll(/normalizeReminderTimeRange\(startDT, event\.start_time, event\.end_time\)/g)].length,
    2,
    'canonical and legacy save paths must both normalize reminder point times',
  )
})
