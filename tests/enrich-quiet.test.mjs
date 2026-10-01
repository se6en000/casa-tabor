import test from 'node:test'
import assert from 'node:assert/strict'
import { bringFromSource, isRoutineRunCopy, statedInSource } from '../supabase/functions/_shared/enrich-quiet.mjs'

// Jake, 2026-10-01: "cleanup the enrich event issue - see if that reduces some random noise". The enricher's guessed
// items were the noise; items the event's own words mention stay.
test('only what the event says: the violin for violin practice; no insurance card for the orthodontist', () => {
  assert.deepEqual(bringFromSource(['Violin', 'Music sheets', 'Water bottle'], 'Emme Practice Violin with Meredith'), ['Violin'])
  assert.deepEqual(bringFromSource(['Insurance card', 'List of current medications'], 'McCranels orthodontist ET OT'), [])
  assert.deepEqual(bringFromSource(['Packed lunch', 'Neon pink class shirt', 'Sunscreen'], 'Field trip. All students need to wear their neon pink Kindergarten class shirt and a packed lunch.'), ['Packed lunch', 'Neon pink class shirt'])
  assert.deepEqual(bringFromSource(['Glove', 'glove ', 'Cleats'], 'Softball: bring glove and cleats'), ['Glove', 'Cleats'])
  assert.equal(statedInSource('Bat', 'Batting practice'), false)
})

test('school-run copies are skipped; ordinary events are not', () => {
  assert.equal(isRoutineRunCopy('Drop off Emme @ Palm Beach Public Elementary School · Early Beethoven Strings'), true)
  assert.equal(isRoutineRunCopy('Pick up Liv @ Bak Middle School of the Arts'), true)
  assert.equal(isRoutineRunCopy('Pick up Photobook for Liv'), false)
  assert.equal(isRoutineRunCopy('McCranels orthodontist ET OT'), false)
})
