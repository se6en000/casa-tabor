import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { askTipThisOpen, askTipDone, ASK_TIP_OPENS } from '../src/phone/askTip.ts'

// The Ask button in the T, breathing, and "Hold me to ask" (canvas 41a/41b; Jake, Oct 5: "A but we also need to have it
// animated/breathing in a way"; earlier: "maybe even like a helper tip to say, hold me down to quickly ask a question").
function store() { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) } }

test('the tip shows on the first three openings, then not again', () => {
  const s = store()
  assert.deepEqual(Array.from({ length: 5 }, () => askTipThisOpen(s)), [true, true, true, false, false])
  assert.equal(ASK_TIP_OPENS, 3)
})

test('held once, or Got it: never again; no storage, no tip', () => {
  const s = store()
  assert.equal(askTipThisOpen(s), true)
  askTipDone(s)
  assert.equal(askTipThisOpen(s), false)
  assert.equal(askTipThisOpen(null), false)
})

test('the button says T / ASK and breathes, still while held and for Reduce Motion', () => {
  const mark = readFileSync(new URL('../src/phone/AskMark.tsx', import.meta.url), 'utf8')
  assert.match(mark, />T</)
  assert.match(mark, />ASK</)
  assert.match(mark, /held \? 'stroke-wall-ink' : 'ask-ring-breathe/)
  assert.match(mark, /\{!held && <circle[^>]*ask-glint/)
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
  assert.match(css, /prefers-reduced-motion: reduce\) \{\s*\.ask-ring-breathe, \.ask-glint \{ animation: none; \}/)
})

test('a to-do swiped right past a third is done; left past half the buttons opens them; short swipes spring back', async () => {
  const { swipeOutcome } = await import('../src/phone/swipe.ts')
  assert.equal(swipeOutcome(130, 360, true, 148), 'done')
  assert.equal(swipeOutcome(100, 360, true, 148), 'none')
  assert.equal(swipeOutcome(-80, 360, true, 148), 'snooze')
  assert.equal(swipeOutcome(-60, 360, true, 148), 'none')
  // A chore has nothing to the left.
  assert.equal(swipeOutcome(-140, 360, false, 148), 'none')
})

test('the swipe tip shows on the first few opens, apart from the Ask tip, until a swipe or "Got it"', async () => {
  const { swipeTip } = await import('../src/phone/askTip.ts')
  const s = store()
  assert.equal(swipeTip.thisOpen(s), true)
  askTipDone(s)
  assert.equal(swipeTip.thisOpen(s), true)
  swipeTip.done(s)
  assert.equal(swipeTip.thisOpen(s), false)
})
