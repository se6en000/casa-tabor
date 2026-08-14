import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/components/calendar/EventDetailPanel.tsx', import.meta.url), 'utf8')

test('the outer event-command-center dialog resets its own scrollTop to guard against browser focus-scroll blank space', () => {
  // The outer dialog has `overflow: hidden` and is never meant to scroll internally -
  // only its inner `.overflow-y-auto` content div should scroll. But focusing a
  // checklist checkbox triggers the browser's native scroll-into-view behavior on
  // every scrollable ancestor, including `overflow: hidden` containers, which can
  // silently set a nonzero scrollTop on the dialog itself. That shifts the whole
  // flex column (header/content/footer) upward, leaving a permanent blank gap at
  // the bottom of the card. Guard against it by resetting scrollTop whenever it drifts.
  const shellStart = source.indexOf('key="event-panel-shell"')
  assert.ok(shellStart >= 0, 'expected to find the event-panel-shell dialog element')

  const dialogBlockEnd = source.indexOf('\n            >', shellStart)
  const dialogOpenTag = source.slice(shellStart, dialogBlockEnd)

  assert.match(
    dialogOpenTag,
    /onScroll=\{[^}]*scrollTop[^}]*=\s*0[^}]*\}/,
    'expected the dialog to have an onScroll handler that resets scrollTop to 0',
  )
})
