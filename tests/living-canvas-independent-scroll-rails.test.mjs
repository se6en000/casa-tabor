import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// 2026-09-24: the first version of "Hero stays put while Schedule/To-Dos scroll"
// used position: sticky on the left column, sharing the outer page's single
// overflow-y-auto scroll surface. Live feedback: scrolling one rail still visibly
// moved the other (true sticky-sidebar physics -- it un-sticks and starts moving
// again once the row's remaining overhang runs out), which reads as "the rails
// aren't independent." Replaced with two genuinely separate overflow contexts:
// the outer container stops scrolling at all at lg: (`lg:overflow-hidden`), the
// grid fills the remaining viewport height (`lg:flex-1 lg:min-h-0`), the left
// column (Hero + Ahead) just sits in it with no scroll behavior of its own, and
// the right column (Schedule/To-Dos/Tomorrow) gets its own `overflow-y-auto`.
// Scrolling one now cannot move the other -- they don't share a scroll surface.
const src = readFileSync(new URL('../src/components/canvas/CalmKioskView.tsx', import.meta.url), 'utf8')

test('the outer page container stops scrolling at lg: -- the grid owns the scroll instead', () => {
  const outerMatch = src.match(/<div className="w-full h-full flex flex-col justify-start[^"]*">\s*\{\/\* ── Gmail Sync/)
  assert.ok(outerMatch, 'expected to find the outer container immediately before the Gmail Sync banner comment')
  assert.match(outerMatch[0], /lg:overflow-hidden/, 'outer container should stop being a scroll surface at lg:')
})

test('the two-column grid fills the remaining viewport height at lg:', () => {
  const gridMatch = src.match(/<div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-4 items-start lg:items-stretch lg:flex-1 lg:min-h-0">\s*<div className="flex flex-col gap-8">\s*\{\/\* Hero Next Up Card/)
  assert.ok(gridMatch, 'expected the real-content grid (not the skeleton one) to declare lg:items-stretch lg:flex-1 lg:min-h-0 and have a plain (non-sticky) left column right before it')
})

test('the left column (Hero + Ahead) has no scroll or sticky behavior of its own', () => {
  const leftColumnMatch = src.match(/<div className="([^"]+)">\s*\{\/\* Hero Next Up Card \*\/\}/)
  assert.ok(leftColumnMatch, 'expected to find the left column div immediately preceding the Hero Next Up Card comment')
  assert.doesNotMatch(leftColumnMatch[1], /sticky/, 'left column should not be sticky anymore -- it is a plain static pane now')
  assert.doesNotMatch(leftColumnMatch[1], /overflow-y-auto/, 'left column should not scroll internally')
})

test('the right column (Schedule/To-Dos/Tomorrow) is its own independent scroll container', () => {
  // 2026-09-24 follow-up: the right column's scroll box is now BounceScroll
  // (desktop/kiosk only -- see homepage-bounce-scroll.test.mjs for the full
  // desktop-vs-mobile wiring), which owns the actual overflow-y-auto/h-full
  // classes internally; scheduleRailRef/handleScheduleRailScroll are threaded
  // in via its innerRef/onScroll props rather than a bare div ref.
  assert.match(src, /innerRef=\{scheduleRailRef\}/, 'right column should be wired to its own scroll ref')
  assert.match(src, /onScroll=\{handleScheduleRailScroll\}/, 'right column should track its own scroll position')
  assert.match(src, /isDesktop \? \(\s*<BounceScroll/, 'right column should be an independent scroll box at lg: via BounceScroll')
})

test('scheduleRailRef/handleScheduleRailScroll/scheduleRailEdge are real hooks, not just referenced in JSX', () => {
  assert.match(src, /const scheduleRailRef = useRef<HTMLDivElement \| null>\(null\)/)
  assert.match(src, /const \[scheduleRailEdge, setScheduleRailEdge\] = useState/)
  assert.match(src, /const handleScheduleRailScroll = useCallback/)
  // Re-measures on content-size changes (collapsing/expanding a section), not just on scroll.
  assert.match(src, /new ResizeObserver/)
})

test('top/bottom scroll-edge fade cues exist and are gated to lg: only', () => {
  assert.match(src, /scheduleRailEdge\.atTop \? 'opacity-0' : 'opacity-100'/)
  assert.match(src, /scheduleRailEdge\.atBottom \? 'opacity-0' : 'opacity-100'/)
  const fadeBlock = src.slice(src.indexOf('Top/bottom scroll-edge fades'))
  assert.match(fadeBlock.slice(0, 900), /hidden lg:block pointer-events-none absolute inset-x-0 top-0/)
  assert.match(fadeBlock.slice(0, 900), /hidden lg:block pointer-events-none absolute inset-x-0 bottom-0/)
})

// 2026-09-24 follow-up: the first version called setScheduleRailEdge with a
// fresh object on every native `scroll` event -- which fires on nearly every
// frame during a touch-drag/momentum scroll -- forcing a re-render of this
// entire large component that often per scroll gesture. Fixed to only
// produce a new object (and therefore only re-render) on the two real
// atTop/atBottom transitions.
test('handleScheduleRailScroll bails out of re-rendering when atTop/atBottom have not actually changed', () => {
  const fnBody = src.slice(
    src.indexOf('const handleScheduleRailScroll = useCallback'),
    src.indexOf('const handleScheduleRailScroll = useCallback') + 500,
  )
  assert.match(
    fnBody,
    /setScheduleRailEdge\(\(prev\) => \(prev\.atTop === atTop && prev\.atBottom === atBottom \? prev : \{ atTop, atBottom \}\)\)/,
  )
})
