import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// 2026-09-24: user reported (with screenshots, scrolled to the true max) that
// the last card in the homepage's right rail sat flush against the bottom of
// the window with no breathing room, reading as truncated. Two independent
// fixes, both real structural issues rather than guesses:
//
// 1. The rail's wrapper div (parent of BounceScroll) is itself a child of a
//    `flex flex-col` container (the right grid column). A flex-col's default
//    cross-axis stretch only affects WIDTH, not height -- without its own
//    flex-basis, the wrapper just sizes to its own content instead of the
//    available height, leaving BounceScroll's `h-full` nothing real to
//    resolve against. Added lg:flex-1 so the height chain is explicit and
//    guaranteed to match the actual available space, not just however it
//    happens to compute.
// 2. The scrollable content's own trailing padding was a thin lg:pb-8 (32px)
//    -- doubled to lg:pb-16 for real clearance at the true bottom of scroll.
const src = readFileSync(new URL('../src/components/canvas/CalmKioskView.tsx', import.meta.url), 'utf8')

test('the rail wrapper has an explicit flex-basis so it actually fills the right column height', () => {
  assert.match(src, /<div className="relative lg:min-h-0 lg:flex-1">\s*\{isDesktop \? \(/)
})

test('the scrollable content has generous trailing padding so the last card clears the bottom edge', () => {
  assert.match(src, /innerClassName="flex flex-col gap-8 lg:pr-1 lg:pb-16 scrollbar-hide"/)
  assert.doesNotMatch(src, /lg:pb-8 scrollbar-hide/, 'old thin padding should be gone, not just supplemented')
})
