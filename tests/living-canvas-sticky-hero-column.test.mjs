import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// 2026-09-24: on desktop/kiosk widths, the user wanted the Hero card (and its
// companion Ahead/Household Dispatch card) to stay put while they finger-scroll
// the Schedule/To-Dos/Tomorrow column past it, instead of Hero scrolling away
// with the rest of the page. The two columns already live in a single
// `overflow-y-auto` page-scroll container (not nested scroll regions), so the
// standard, cheap way to get "pinned sidebar, scrolling content" out of that is
// CSS position: sticky on the left column -- no JS, no extra scroll listeners,
// and the parent grid already has `items-start` (needed so the left column's
// height is its own content height, not stretched to match the taller right
// column, which is the actual prerequisite for sticky to do anything here).
// Scoped to `lg:` only, matching every other desktop/kiosk-vs-mobile split in
// this file -- mobile keeps its existing single-column page scroll untouched.
const src = readFileSync(new URL('../src/components/canvas/CalmKioskView.tsx', import.meta.url), 'utf8')

test('the left column (Hero + Ahead) is sticky-pinned on desktop/kiosk widths', () => {
  // Anchor on the real content grid specifically (not the isPending skeleton
  // branch above it, which reuses the same grid classes for its placeholder
  // layout) by requiring the "Hero Next Up Card" comment to follow shortly after.
  const leftColumnMatch = src.match(/<div className="([^"]+)">\s*\{\/\* Hero Next Up Card \*\/\}/)
  assert.ok(leftColumnMatch, 'expected to find the left column div immediately preceding the Hero Next Up Card comment')
  const leftColumnClasses = leftColumnMatch[1]
  assert.match(leftColumnClasses, /lg:sticky/, 'left column should be sticky at the lg breakpoint')
  assert.match(leftColumnClasses, /lg:top-0/, 'left column should pin to the top of the scroll container')
})

test('the right column (Schedule/To-Dos/Tomorrow) is not sticky -- it scrolls normally', () => {
  const rightColumnMatch = src.match(/<div className="flex flex-col gap-8">\s*\{\/\* Today's Schedule/)
  assert.ok(rightColumnMatch, 'expected to find the right column opening right before the Today\'s Schedule comment')
})
