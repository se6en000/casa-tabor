import test from 'node:test'
import assert from 'node:assert/strict'
import { swipeStep, wheelSwipe, stepWithin } from '../src/lib/daySwipe.ts'

// Swipe between days (Jake, 2026-09-28: "adding a touch swipe to navigate back and forth the days …
// build it in the mobile as well … mobile, desktop and pi"). Decided from where a touch started and
// ended — no live drag listener (that lagged the old homepage on the Pi) — and strict enough that a
// tap on an event stays a tap.

const at = (x, y, t) => ({ x, y, t })

test('a clear sideways swipe moves a day: left is the next day, right the one before', () => {
  assert.equal(swipeStep(at(900, 500, 0), at(500, 520, 250), { minDistance: 200 }), 1)
  assert.equal(swipeStep(at(500, 500, 0), at(900, 470, 250), { minDistance: 200 }), -1)
})

test('taps, short nudges, diagonal or mostly vertical moves, and slow drags stay what they were', () => {
  assert.equal(swipeStep(at(500, 500, 0), at(503, 501, 90), { minDistance: 200 }), null, 'a tap')
  assert.equal(swipeStep(at(500, 500, 0), at(400, 500, 150), { minDistance: 200 }), null, 'too short')
  assert.equal(swipeStep(at(500, 500, 0), at(250, 350, 200), { minDistance: 200 }), null, 'diagonal')
  assert.equal(swipeStep(at(200, 100, 0), at(230, 600, 300), { minDistance: 70 }), null, 'a phone scroll')
  assert.equal(swipeStep(at(900, 500, 0), at(500, 500, 1500), { minDistance: 200 }), null, 'a slow drag')
})

test('a two-finger trackpad swipe moves one day per gesture, and scrolling never does', () => {
  let state = null
  let steps = []
  for (let i = 0; i < 12; i++) {
    const r = wheelSwipe(state, { deltaX: 25, deltaY: 2, t: i * 16 })
    state = r.state
    if (r.step) steps.push(r.step)
  }
  assert.deepEqual(steps, [1], 'one step for one swipe, however long the inertia runs')
  // A new gesture after a pause steps again, the other way.
  steps = []
  for (let i = 0; i < 12; i++) {
    const r = wheelSwipe(state, { deltaX: -25, deltaY: 0, t: 2000 + i * 16 })
    state = r.state
    if (r.step) steps.push(r.step)
  }
  assert.deepEqual(steps, [-1])
  // Ordinary vertical scrolling with a little sideways drift: nothing.
  state = null
  steps = []
  for (let i = 0; i < 30; i++) {
    const r = wheelSwipe(state, { deltaX: 6, deltaY: 40, t: 5000 + i * 16 })
    state = r.state
    if (r.step) steps.push(r.step)
  }
  assert.deepEqual(steps, [])
})

test('steps stop at the ends instead of wrapping', () => {
  assert.equal(stepWithin(0, 1, 7), 1)
  assert.equal(stepWithin(7, 1, 7), null)
  assert.equal(stepWithin(0, -1, 7), null)
  assert.equal(stepWithin(3, -1, 7), 2)
})
