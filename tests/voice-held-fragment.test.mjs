import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { heldFragmentAfterWait } from '../src/lib/voiceTurnTaking.mjs'

// Jake, 2026-09-27 10:39 PM on the wall: "it's listening but not taking it in and processing the
// text". A 13-word sentence ended on a word that sounds unfinished, so it was held for more; when
// nothing more came, the held words were thrown away (the band has no onIncomplete). After the
// wait, what was said goes to Casa — Casa can ask if it really was cut short.

test('after the wait, a held sentence is sent as said', () => {
  assert.equal(heldFragmentAfterWait('What do we have going on this weekend with the'), 'What do we have going on this weekend with the')
  assert.equal(heldFragmentAfterWait('  can you book  '), 'can you book')
})

test('only nothing, or filler, is let go', () => {
  assert.equal(heldFragmentAfterWait(''), null)
  assert.equal(heldFragmentAfterWait('um'), null)
  assert.equal(heldFragmentAfterWait('uh...'), null)
})

test('the speech hook sends the held words when the wait runs out, instead of discarding them', () => {
  const hook = readFileSync(new URL('../src/hooks/useSpeechInput.ts', import.meta.url), 'utf8')
  const timer = hook.slice(hook.indexOf('const scheduleFragmentTimeout'), hook.indexOf('const handleFinalTranscript'))
  assert.match(timer, /heldFragmentAfterWait\(/)
  assert.match(timer, /handleFinalRef\.current\(/)
  assert.match(timer, /toSend \? 'commit'/)
})
