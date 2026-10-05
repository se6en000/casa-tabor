import test from 'node:test'
import assert from 'node:assert/strict'
import { resumeGate, reconnectGate, catchUpLimit, reconnectBackoff } from '../src/lib/catchUp.ts'

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

// Oct 5: the kiosk's live feed flapped from 8 PM (connect, drop, connect every few seconds) and each reconnect re-read
// the whole calendar: ~80 reads a minute of events, get & pack and the feed, all night, until the database stopped
// answering anyone (the phone wouldn't load). A catch-up re-reads at most once a minute, however often it's asked.
test('catch-up re-reads at most once a minute, however often the feed flaps', () => {
  const limit = catchUpLimit(60_000)
  let reads = 0
  for (let t = 0; t < 10 * 60_000; t += 4_000) if (limit.allow(t)) reads++
  assert.equal(reads, 10)
})

test('the first catch-up goes at once', () => {
  assert.equal(catchUpLimit(60_000).allow(1_000_000), true)
})

test('reconnect waits longer after each quick drop, back to 3 s once the feed has held', () => {
  const b = reconnectBackoff()
  assert.deepEqual([b.next(0), b.next(4_000), b.next(9_000), b.next(20_000), b.next(40_000)], [3_000, 6_000, 12_000, 24_000, 48_000])
  assert.equal(b.next(100_000), 60_000)
  b.connected(200_000)
  assert.equal(b.next(260_000), 3_000)
})
