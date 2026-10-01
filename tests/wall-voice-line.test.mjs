import test from 'node:test'
import assert from 'node:assert/strict'
import { FUSE_HELD_MS, QUIET_AFTER_MS, envelope, fuseProgress, inkWords, shownWords, stepLevel, voiceState } from '../src/wall/voiceLine.ts'

// Canvas row 17: one voice line under the words. Jake on the wall, 2026-09-30, fifth try: "it's slow to start vibing
// and slow to stop at the end … it's like the same wave, there's no real dynamism … it seems to just be on and waving
// around or off … it feels sloppy." So the line starts and stops on the loudness itself (every 20 ms from the bridge),
// and the wave IS the voice: the last couple of seconds of loudness, travelling out from the middle.

const base = { now: 10_000, micOpen: true, bridgeDown: false, thinking: false, needsYes: false, heard: '', loudAt: 0, noisyFor: 0, signal: { lastWordAt: 0, heldSince: 0, speechAt: 0 } }

test('the line\'s state: can\'t hear first, then Casa\'s turn, then yours', () => {
  assert.equal(voiceState({ ...base, bridgeDown: true, thinking: true }), 'deaf')
  assert.equal(voiceState({ ...base, thinking: true }), 'thinking')
  assert.equal(voiceState(base), 'quiet')
  assert.equal(voiceState({ ...base, micOpen: false }), 'off')
  assert.equal(voiceState({ ...base, micOpen: false, needsYes: true }), 'yes')
  assert.equal(voiceState({ ...base, needsYes: true }), 'yes')
})

test('it starts the moment you\'re louder than the room and stops a third of a second after you stop', () => {
  // Loud 20 ms ago, no voice detected yet (Deepgram's takes 300–700 ms): already you.
  assert.equal(voiceState({ ...base, loudAt: 9_980 }), 'voice')
  // Quiet for less than the gap between syllables: still you.
  assert.equal(voiceState({ ...base, loudAt: 10_000 - QUIET_AFTER_MS + 50 }), 'voice')
  // Quiet longer than that: done — no waiting seconds for words.
  assert.equal(voiceState({ ...base, loudAt: 10_000 - QUIET_AFTER_MS - 50, heard: 'tell me', signal: { lastWordAt: 9_000, heldSince: 0, speechAt: 8_000 } }), 'heard')
  // Talking over Casa's thinking (planning keeps the mic open) shows your voice.
  assert.equal(voiceState({ ...base, loudAt: 9_990, thinking: true }), 'voice')
})

test('loud for a while with no voice and no words is the room, not you', () => {
  assert.equal(voiceState({ ...base, loudAt: 9_990, noisyFor: 2_000 }), 'noise')
  assert.equal(voiceState({ ...base, loudAt: 9_990, noisyFor: 800 }), 'voice')
})

test('the fuse is only the real stall: an unfinished sentence held for the rest (4.5 s), with tap to send', () => {
  const held = { ...base, heard: 'add a dentist for', signal: { lastWordAt: 7_000, heldSince: 8_000, speechAt: 6_000 } }
  assert.equal(voiceState(held), 'fuse')
  assert.equal(fuseProgress(held.now, held.signal), 2_000 / FUSE_HELD_MS)
  assert.equal(fuseProgress(60_000, held.signal), 0.97)
  assert.equal(voiceState({ ...held, loudAt: 9_950 }), 'voice')
})

test('the level: up at once, down quickly (syllables show); the room is learned slowly up, quickly down', () => {
  let s = { level: 34, floor: 34 }
  s = stepLevel(s, 52, 20)
  assert.ok(s.level > 50, `up at once: ${s.level}`)
  const after = stepLevel(s, 34, 60)
  assert.ok(after.level < 45, `down quickly: ${after.level}`)
  assert.ok(stepLevel({ level: 34, floor: 34 }, 52, 100).floor < 35, 'a voice barely moves the room')
  assert.ok(stepLevel({ level: 34, floor: 40 }, 30, 300).floor < 33, 'a quieter room is learned fast')
})

test('the envelope: nothing for the room, a syllable most of the height, a shout all of it', () => {
  assert.equal(envelope(34, 34), 0)
  assert.equal(envelope(37, 34), 0)
  assert.ok(envelope(50, 34) >= 0.6)
  assert.equal(envelope(90, 34), 1)
})

test('words in confidence ink: the ones Deepgram isn\'t sure of are faded, matched from the end', () => {
  const ink = inkWords('Add a dentist appointment for live on Friday', [
    { word: 'for', confidence: 0.98 }, { word: 'live', confidence: 0.41 }, { word: 'on', confidence: 0.95 }, { word: 'friday', confidence: 0.44 },
  ])
  assert.deepEqual(ink.filter((w) => w.faded).map((w) => w.text), ['live', 'Friday'])
  assert.equal(ink.map((w) => w.text).join(' '), 'Add a dentist appointment for live on Friday')
})

test('the wake word is left off the words shown, so the sentence doesn\'t jump when it\'s dropped', () => {
  assert.equal(shownWords('Alexa, tell me what\'s on the calendar'), 'tell me what\'s on the calendar')
  assert.equal(shownWords('Alexa.'), '')
  assert.equal(shownWords('Tell Alexa no'), 'Tell Alexa no')
})
