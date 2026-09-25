import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// 2026-09-24: user reported (confirmed testing via Mac trackpad/mouse, not
// the physical kiosk touchscreen) that dragging up on the sidecar also
// scrolled the homepage rail behind/beside it. pointerGestures.ts is a
// mouse-drag-as-touch fallback specifically for kiosk hardware that never
// forwards real touch events (it tears itself down and never re-activates
// the instant a real touchstart fires, so a genuine touchscreen never
// exercises this code at all). Its onPointerMove determined which element to
// scroll via `findScrollable(e.target as Element, ...)` -- but without
// explicit pointer capture, e.target on a pointermove reflects whatever
// element is CURRENTLY under the cursor, which can drift mid-drag (a drag
// starting on the fixed sidecar panel can cross into the page content beside
// it). Re-deriving the scrollable ancestor from that drifted target could
// resolve to an entirely different scrollable region than the one the user
// was actually trying to drag -- explaining exactly the reported symptom.
// Fixed by anchoring to the target captured at pointerdown instead.
const src = readFileSync(new URL('../src/lib/pointerGestures.ts', import.meta.url), 'utf8')

test('captures the pointerdown target for later use, separate from swipeTarget', () => {
  assert.match(src, /let downTarget: Element \| null = null/)
  assert.match(src, /downTarget = e\.target as Element/)
})

test('the axis-lock/scrollable-ancestor lookup uses the captured pointerdown target, not the drifting pointermove target', () => {
  const moveBody = src.slice(src.indexOf('function onPointerMove'), src.indexOf('function onPointerUp'))
  assert.match(moveBody, /findScrollable\(downTarget, 'horizontal'\)/)
  assert.match(moveBody, /findScrollable\(downTarget, 'vertical'\)/)
  assert.doesNotMatch(moveBody, /findScrollable\(e\.target as Element/, 'should no longer re-derive the scrollable ancestor from the live (possibly drifted) pointermove target')
})
