import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// 2026-09-24: user reported that after flipping the event sidecar to Copilot
// and back to Event, scrolling on what looked like the event view instead
// moved the homepage behind it. Reproduced live (Claude-in-Chrome, repeated
// rapid flip -> flip -> drag sequences): the sidecar could end up visually
// stuck mid-3D-rotation (a heavily distorted floating panel) or, in one
// repro, close outright. Root cause: `isFrontView`/`aria-hidden`/
// `pointer-events` all toggled INSTANTLY off the raw `sidecarTab` value
// while the visual `rotateY` animation was still 0.42s into animating --
// triggering a second flip before the first settled desynced "what's
// visually facing the viewer" from "what's actually receiving touch/scroll
// input," since Framer Motion's `animate` prop redirects an in-flight
// animation to a new target rather than queueing, but the pointer-events
// gating isn't animated at all -- it's a hard boolean flip.
//
// Fixed by decoupling the ANIMATED/interactive state (displayedIsFlippedToAi)
// from the raw desired value (sidecarTab === 'ai'). A rapid second flip
// while one is still in-flight now queues via a plain useEffect, applying
// only once the current animation's onAnimationComplete fires -- instead of
// interrupting a still-animating rotateY with a new target.
const src = readFileSync(new URL('../src/components/shared/SidecarCompanion.tsx', import.meta.url), 'utf8')

test('the flip state is decoupled from the raw sidecarTab value via displayedIsFlippedToAi', () => {
  assert.match(src, /const desiredIsFlippedToAi = sidecarTab === 'ai'/)
  assert.match(src, /const \[displayedIsFlippedToAi, setDisplayedIsFlippedToAi\] = useState\(desiredIsFlippedToAi\)/)
  assert.match(src, /const \[isFlipAnimating, setIsFlipAnimating\] = useState\(false\)/)
})

test('a change while already animating is queued, not applied immediately', () => {
  const effectBody = src.slice(src.indexOf('useEffect(() => {\n    if (isFlipAnimating) return'))
  assert.match(effectBody.slice(0, 300), /if \(isFlipAnimating\) return/)
  assert.match(effectBody.slice(0, 300), /setIsFlipAnimating\(true\)/)
  assert.match(effectBody.slice(0, 300), /setDisplayedIsFlippedToAi\(desiredIsFlippedToAi\)/)
})

test('the rotateY animation and both face pointer-events/aria-hidden all derive from the same guarded state', () => {
  assert.match(src, /animate=\{\{ rotateY: displayedIsFlippedToAi \? 180 : 0 \}\}/)
  assert.match(src, /onAnimationComplete=\{\(\) => setIsFlipAnimating\(false\)\}/)
  assert.match(src, /const isFrontView = !displayedIsFlippedToAi/)
  // No stray reference to a raw, unguarded flip boolean should remain.
  assert.doesNotMatch(src, /const isFlippedToAi = sidecarTab/)
})
