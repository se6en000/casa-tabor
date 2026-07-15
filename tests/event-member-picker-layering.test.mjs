import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const panel = readFileSync(
  new URL('../src/components/calendar/EventDetailPanel.tsx', import.meta.url),
  'utf8',
)

test('member picker escapes the header and stacks above later event sections', () => {
  assert.match(panel, /showPicker && 'z-popover'/)
  assert.match(panel, /className=\{cn\('relative overflow-visible px-7 pb-5 pt-6'/)
  assert.doesNotMatch(panel, /className=\{cn\('relative overflow-hidden px-7 pb-5 pt-6'/)
})
