import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const panel = readFileSync(
  new URL('../src/components/calendar/EventDetailPanel.tsx', import.meta.url),
  'utf8',
)

test('member picker escapes the header and stacks above later event sections', () => {
  assert.match(panel, /showPicker && 'z-popover'/)
  // Navy crown is overflow-hidden to contain decorations; MemberEditor lives in
  // the white strip below it so the picker popover can escape without clipping.
  assert.match(panel, /overflow-hidden px-6 pt-4 pb-5/)
  assert.doesNotMatch(panel, /overflow-hidden[\s\S]{0,60}MemberEditor/)
})
