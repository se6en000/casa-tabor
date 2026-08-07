import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// SnoozeMenu is a React component without a DOM test harness in this repo,
// so this is a source-contract test (style B) rather than a behavioral one.
const source = readFileSync(new URL('../src/components/shared/SnoozeMenu.tsx', import.meta.url), 'utf8')

test('SnoozeMenu renders its dropdown through a portal so ancestor overflow-hidden cannot clip or hide it', () => {
  // Bug: the Home timeline row Card and the HomeRightPanel ExpandPanel both
  // wrap their content in overflow-hidden containers (needed for the rounded
  // accent bar / grid-rows expand animation respectively). An absolutely
  // positioned dropdown nested inside those containers gets clipped/hidden
  // instead of floating above the rest of the page.
  assert.match(source, /import \{ createPortal \} from 'react-dom'/)
  assert.match(source, /createPortal\(/)
})

test('SnoozeMenu positions its portaled dropdown using the trigger\'s real screen position, not a relatively-positioned ancestor', () => {
  assert.match(source, /getBoundingClientRect/)
  assert.match(source, /position:\s*['"]fixed['"]/)
})

test('SnoozeMenu closes on outside click even though the dropdown lives in a portal outside the trigger container', () => {
  // The click-outside handler must also check the portaled menu element,
  // otherwise clicking inside the (now-detached) menu would incorrectly
  // close it.
  assert.match(source, /menuRef/)
  assert.match(source, /menuRef\.current\??\.contains/)
})
