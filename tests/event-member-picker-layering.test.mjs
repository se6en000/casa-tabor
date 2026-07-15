import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const panel = readFileSync(
  new URL('../src/components/calendar/EventDetailPanel.tsx', import.meta.url),
  'utf8',
)

test('member picker escapes the header and stacks above later event sections', () => {
  assert.match(panel, /showPicker && 'z-popover'/)
  // The crown must remain overflow-visible so category and member popovers are
  // not clipped; BirthdayCardDecoration contains its own artwork overflow.
  assert.match(panel, /overflow-visible px-6 pt-4 pb-5/)
  assert.doesNotMatch(panel, /overflow-hidden px-6 pt-4 pb-5/)
})
