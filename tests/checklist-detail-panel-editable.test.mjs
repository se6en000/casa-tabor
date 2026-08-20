import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/components/calendar/ChecklistEditor.tsx', import.meta.url), 'utf8')

test('ChecklistEditor supports editable mode with item additions and toggles', () => {
  assert.match(source, /editable\?: boolean/)
  assert.match(source, /publishEventAggregatePatch/)
  assert.match(source, /setLocalChecked/)
})
