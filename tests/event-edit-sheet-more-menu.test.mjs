import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/components/calendar/EventEditSheet.tsx', import.meta.url), 'utf8')

test('EventEditSheet consolidates Delete and Ask AI to fill in details into a header more-actions menu', () => {
  assert.match(source, /aria-label="More actions"/)
  assert.match(source, /role="menu"/)
  assert.match(source, /role="menuitem"/)
  assert.match(source, />\s*Ask AI to fill in details\s*</)
})

test('EventEditSheet removes the inline Delete button from the Type toggle row', () => {
  const typeBlock = source.match(/\{\/\* ── Event Type Toggle ── \*\/\}[\s\S]*?<\/div>\s*\n\s*\n/)
  assert.ok(typeBlock, 'expected to find the Event Type toggle block')
  assert.doesNotMatch(typeBlock[0], /leadingIcon=\{<Trash2/, 'Delete button should no longer be inline with the Type toggle')
})

test('EventEditSheet keeps the extra-context text input and mic dictation reachable from the menu, not deleted', () => {
  assert.match(source, /extraContext/)
  assert.match(source, /micActive/)
  assert.match(source, /startMic/)
})

test('EventEditSheet still triggers the existing enrichment flow from the menu action', () => {
  assert.match(source, /handleReenrich/)
})
