import test from 'node:test'
import assert from 'node:assert/strict'

import {
  CATEGORIES,
  findArbitraryFontSizes,
  findRawHexColors,
  findArbitraryZIndex,
  findInlineStyleBlocks,
  findHoverOnlyReveals,
  findNativeControlRecreations,
  findTitleOnlyButtonLabels,
  findUndersizedSquareControls,
} from '../scripts/lib/audit-rules.mjs'

test('findArbitraryFontSizes matches px/rem/em fixed sizes but not token classes', () => {
  const content = [
    "className=\"text-[13px] text-[1.1rem] text-[0.8em]\"",
    "className=\"text-heading text-body-sm text-display-lg\"",
  ].join('\n')
  const matches = findArbitraryFontSizes(content)
  assert.equal(matches.length, 3)
  assert.equal(matches[0].line, 1)
})

test('findRawHexColors matches 3/4/6/8-digit hex literals', () => {
  const content = "const c1 = '#ABC'; const c2 = '#AABBCC'; const c3 = '#AABBCCDD'; const c4 = '#ABCD'"
  const matches = findRawHexColors(content)
  assert.equal(matches.length, 4)
})

test('findRawHexColors does not confuse a bare word for a hex color', () => {
  const content = "const notAColor = 'deadbeef' // no leading #"
  assert.equal(findRawHexColors(content).length, 0)
})

test('findArbitraryZIndex matches z-[N] but not semantic z-utilities', () => {
  const content = "className=\"z-[60] z-[9999] z-10 z-auto\""
  const matches = findArbitraryZIndex(content)
  assert.equal(matches.length, 2)
})

test('findInlineStyleBlocks counts every style={{ occurrence, including multiple per line', () => {
  const content = [
    'const a = <div style={{ top: 4 }} />',
    'const b = <div className="foo" />',
    'const c = <div style={{ left: 2 }} style={{ nested: true }} />',
  ].join('\n')
  // 1 on line 1, 0 on line 2, 2 on line 3 = 3 total.
  assert.equal(findInlineStyleBlocks(content).length, 3)
})

test('findUndersizedSquareControls flags sub-44px square utility pairs and size-N', () => {
  const content = [
    '<button className="w-8 h-8 rounded-full" />',   // undersized (32px)
    '<a href="/" className="h-6 w-6" />',            // undersized, reversed order (24px)
    '<button className="size-9" />',                  // undersized shorthand (36px)
    '<button className="w-12 h-12 rounded-full" />',  // fine (48px, >= 44px min)
    '<button className="w-8 h-10" />',                // not square — should not match
    '<span className="w-4 h-4" />',                   // decorative geometry is ignored
    '<button className="w-8 h-8 min-h-control" />',   // semantic target override
  ].join('\n')
  const matches = findUndersizedSquareControls(content)
  assert.equal(matches.length, 3)
  assert.ok(matches.some((m) => m.snippet.includes('w-8 h-8')))
  assert.ok(matches.some((m) => m.snippet.includes('h-6 w-6')))
  assert.ok(matches.some((m) => m.snippet.includes('size-9')))
})

test('findUndersizedSquareControls treats w-11/h-11 (44px) as meeting the minimum', () => {
  const content = '<button className="w-11 h-11 rounded-full" />'
  assert.equal(findUndersizedSquareControls(content).length, 0)
})

test('hover-only reveal audit catches touch-inaccessible visibility contracts', () => {
  assert.equal(findHoverOnlyReveals('<Copy className="opacity-0 group-hover:opacity-50" />').length, 1)
  assert.equal(findHoverOnlyReveals('<Copy className="opacity-60 group-hover:opacity-100" />').length, 0)
})

test('title-only button labels require an explicit aria-label', () => {
  assert.equal(findTitleOnlyButtonLabels('<button title="Delete"><Trash /></button>').length, 1)
  assert.equal(findTitleOnlyButtonLabels('<button title="Delete" aria-label="Delete"><Trash /></button>').length, 0)
})

test('native control recreation audit exempts shared UI primitives', () => {
  const content = '<button type="button">Save</button>'
  assert.equal(findNativeControlRecreations(content, 'src/pages/TestPage.tsx').length, 1)
  assert.equal(findNativeControlRecreations(content, 'src/components/ui/Button.tsx').length, 0)
})

test('every CATEGORIES entry documents its heuristic limits (no silent overclaiming)', () => {
  assert.ok(CATEGORIES.length >= 5)
  for (const cat of CATEGORIES) {
    assert.equal(typeof cat.id, 'string')
    assert.equal(typeof cat.label, 'string')
    assert.equal(typeof cat.run, 'function')
    assert.ok(cat.heuristicLimits && cat.heuristicLimits.length > 20, `${cat.id} must explain its heuristic limits`)
  }
})

test('line numbers reported by findMatches-based rules are 1-based and accurate', () => {
  const content = 'line one\nline two\nconst x = "#ABCDEF"\nline four'
  const matches = findRawHexColors(content)
  assert.equal(matches.length, 1)
  assert.equal(matches[0].line, 3)
})

test('line numbers and snippets remain accurate with CRLF line endings', () => {
  const content = Array.from({ length: 50 }, (_, i) => `const x${i} = 1;`)
    .concat('const target = "#ABCDEF";')
    .join('\r\n')
  const matches = findRawHexColors(content)
  assert.equal(matches.length, 1)
  assert.equal(matches[0].line, 51)
  assert.equal(matches[0].snippet, 'const target = "#ABCDEF";')
})
