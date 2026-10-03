import test from 'node:test'
import assert from 'node:assert/strict'
import { DEV_ITEMS, FRESH_ITEMS, HOLDOUT_ITEMS, UNSEEN_ITEMS, buildCases, score } from '../scripts/grocery-voice-eval.mjs'

// Grocery voice adds, scored (Jake, Oct 2: "test 100 common grocery items and see if you can make it better"). Before:
// 60% / 14% / 2% / 2% of things said came out exactly right. These floors keep it from sliding back.
const rate = (items, offset) => {
  const s = score([11, 22, 33].flatMap((seed) => buildCases(items, seed + offset)))
  return { said: s.utterancesRight / s.utterances, aisle: s.aislesRight / s.items }
}

test('the dev set (136 items, tuned against): almost every list comes out right', () => {
  const r = rate(DEV_ITEMS, 0)
  assert.ok(r.said >= 0.95, `said right ${r.said}`)
  assert.ok(r.aisle >= 0.97, `aisle ${r.aisle}`)
})

test('held-out and fresh items: still right', () => {
  assert.ok(rate(HOLDOUT_ITEMS, 1000).said >= 0.95)
  assert.ok(rate(FRESH_ITEMS, 2000).said >= 0.9)
})

test('items never tuned against: better than before (2%), a floor to hold', () => {
  const r = rate(UNSEEN_ITEMS, 3000)
  assert.ok(r.said >= 0.55, `said right ${r.said}`)
  assert.ok(r.aisle >= 0.75, `aisle ${r.aisle}`)
})
