import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// Regression guard for a real layout bug: the per-entry name/meta text and
// the Confirm/Dismiss action buttons were siblings in one flex row, with the
// button group `shrink-0` (non-negotiable width) and the text block given no
// `flex-1`/grow. In a narrow, twice-nested Needs You home-rail card, the
// button group's natural width ate almost all the row, and the text block
// (only `min-w-0`, no floor) got squeezed down to a few pixels — so every
// word in the meta line wrapped onto its own line, rendering as an
// unreadable vertical stack of single words instead of "New place · seen 1x
// on your calendar". The fix puts actions on their own row below the name,
// so the name/meta text always gets the full row width to truncate against.

const source = readFileSync(
  new URL('../src/components/shared/DirectorySuggestionActions.tsx', import.meta.url),
  'utf8',
)

test('entry name/meta text block is not a shrink-starved sibling of the action buttons', () => {
  // The old broken shape put confirm/dismiss in a `shrink-0` sibling of the
  // text block within one `justify-between` row — that pairing must be gone.
  assert.doesNotMatch(source, /flex items-center justify-between gap-2 py-1\.5/)
})

test('the name/meta text container claims the row with flex-1, not just min-w-0', () => {
  assert.match(source, /className="min-w-0 flex-1"/)
})

test('the meta caption line is truncated so it can never wrap into a vertical word stack', () => {
  assert.match(source, /className="truncate text-caption text-casa-muted"/)
})

test('Confirm/Dismiss actions render on their own row below the name, not beside it', () => {
  const entryBlockStart = source.indexOf('entries.map((entry)')
  const entryBlock = source.slice(entryBlockStart)
  const nameRowEnd = entryBlock.indexOf('</div>\n              </div>')
  assert.ok(nameRowEnd > -1)
  const actionsMarkup = entryBlock.slice(nameRowEnd)
  assert.match(actionsMarkup, /Confirm/)
  assert.match(actionsMarkup, /Not now, skip/)
})

test('the duplicate "Found on your calendar — save the ones..." intro sentence is gone', () => {
  // That sentence repeated the header notification and the card's own meta
  // line almost verbatim — the same fact said three times in one card.
  assert.doesNotMatch(source, /Found on your calendar — save the ones you want to keep/)
})
