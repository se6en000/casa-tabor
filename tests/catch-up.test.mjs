import test from 'node:test'
import assert from 'node:assert/strict'
import { resumeGate, reconnectGate } from '../src/lib/catchUp.ts'

// Jake, Oct 3: "I recently added some appointments on the kiosk … about 20 minutes later I open my phone … the
// appointments … just weren't there … until I started adding a new appointment then all of a sudden they showed up."
// The phone's lists live on the live feed; on an iPhone in the background the feed drops, and nothing re-read what was
// missed. Coming back to the app, or the feed coming back, now re-reads.

test('coming back to the app after being away re-reads; a blink does not', () => {
  const gate = resumeGate(10_000)
  gate.hidden(1_000)
  assert.equal(gate.visible(4_000), false, 'three seconds away: nothing missed worth a re-read')
  gate.hidden(10_000)
  assert.equal(gate.visible(10_000 + 20 * 60_000), true, 'twenty minutes away')
  assert.equal(gate.visible(10_000 + 20 * 60_000 + 5), false, 'only once per return')
  assert.equal(gate.visible(99_000), false, 'never hidden: nothing to catch up')
})

test('the live feed coming back re-reads; its first connection does not', () => {
  const gate = reconnectGate()
  assert.equal(gate.status('SUBSCRIBED'), false, 'the first connection: the page just loaded what is there')
  assert.equal(gate.status('CLOSED'), false)
  assert.equal(gate.status('SUBSCRIBED'), true, 'back after a drop: changes may have been missed')
  assert.equal(gate.status('SUBSCRIBED'), false, 'still connected: nothing new')
  gate.status('TIMED_OUT')
  assert.equal(gate.status('SUBSCRIBED'), true)
})
