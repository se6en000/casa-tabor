import test from 'node:test'
import assert from 'node:assert/strict'
import { voiceFinalIntent } from '../src/lib/voiceTurnTaking.mjs'

// The band keeps listening (P3.13), so every sentence heard is sorted: a draft's yes/no,
// a goodbye that ends the session, or words for Casa. A goodbye word inside a real
// sentence is never a goodbye.

test('a whole short goodbye ends the session', () => {
  for (const said of ['go away', 'ok thats all', 'bye', 'stop listening', "we're done", 'thanks casa that is all']) {
    assert.equal(voiceFinalIntent(said, { hasPending: false }), 'dismiss', said)
  }
})

test('goodbye words inside a real sentence go to Casa', () => {
  for (const said of [
    'never mind that. what time does the softball start on Saturday?',
    'is the dentist close to school',
    'can Kelly stop at the store on the way home',
    'say bye to grandma on the calendar for Sunday',
  ]) {
    assert.equal(voiceFinalIntent(said, { hasPending: false }), 'send', said)
  }
})

test('with a draft waiting, a short no cancels the draft and a short yes confirms it — the session goes on', () => {
  assert.equal(voiceFinalIntent('never mind', { hasPending: true }), 'cancel')
  assert.equal(voiceFinalIntent('nah cancel that', { hasPending: true }), 'cancel')
  assert.equal(voiceFinalIntent('yes add it', { hasPending: true }), 'confirm')
  assert.equal(voiceFinalIntent('ok', { hasPending: true }), 'confirm')
  assert.equal(voiceFinalIntent('go away', { hasPending: true }), 'dismiss')
})

test('with nothing waiting, "never mind" alone means done', () => {
  assert.equal(voiceFinalIntent('never mind', { hasPending: false }), 'dismiss')
})

test('a change to the draft is never read as a yes or a no', () => {
  assert.equal(voiceFinalIntent('no make it 4 instead', { hasPending: true }), 'send')
  assert.equal(voiceFinalIntent('yes but put Emme on it too', { hasPending: true }), 'send')
  assert.equal(voiceFinalIntent('ok and add Liv', { hasPending: true }), 'send')
})

import { isIncompleteVoiceFragment } from '../src/lib/voiceTurnTaking.mjs'

test('a thought cut off at a pause is held for the rest, even with the punctuation the transcriber added', () => {
  // Heard on the wall 2026-09-26: "When is the best day next week to book Liv's?" — Jake was mid-thought.
  for (const said of [
    "When is the best day next week to book Liv's?",
    'can you book',
    'remind me to.',
    'add a dentist for Emme and',
    "what's on Kelly's",
    'put Owen down for um',
  ]) {
    assert.equal(isIncompleteVoiceFragment(said), true, said)
  }
})

test('a finished sentence still goes straight through', () => {
  for (const said of [
    "When is the best day next week to book Liv's batting practice with coach Danny?",
    "what's on tomorrow",
    "it's Kelly's",
    'what time is it',
    'yes',
    'add milk',
  ]) {
    assert.equal(isIncompleteVoiceFragment(said), false, said)
  }
})
