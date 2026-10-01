import test from 'node:test'
import assert from 'node:assert/strict'
import { FUSE_HELD_MS, VOICE_HANGOVER_MS, amplitude, fuseProgress, inkWords, shownWords, stepLevel, voiceState } from '../src/wall/voiceLine.ts'

// Canvas row 17: one voice line under the words. Jake on the wall, 2026-09-30: "it's still extremely chaotic" — a
// screen recording showed the fuse filling and restarting with every burst of words while he talked (Deepgram sends
// words about a second apart, and his voice reads only 1–5 of 100 on the bridge's meter, so it never counted as
// talking). So: hearing you holds through the gaps; the line only changes on real signals; the fuse is only the
// real stall (an unfinished sentence held 4.5 s).

const base = { now: 10_000, micOpen: true, bridgeDown: false, thinking: false, needsYes: false, heard: '', level: 1, floor: 1, noisyFor: 0, signal: { lastWordAt: 0, heldSince: 0, speechAt: 0 } }

test('the line\'s state: can\'t hear first, then Casa\'s turn, then yours', () => {
  assert.equal(voiceState({ ...base, bridgeDown: true, thinking: true }), 'deaf')
  assert.equal(voiceState({ ...base, thinking: true }), 'thinking')
  assert.equal(voiceState(base), 'quiet')
  assert.equal(voiceState({ ...base, micOpen: false }), 'off')
  assert.equal(voiceState({ ...base, micOpen: false, needsYes: true }), 'yes')
  assert.equal(voiceState({ ...base, needsYes: true }), 'yes')
})

test('hearing you starts with Deepgram\'s voice start and holds through the gaps between bursts of words', () => {
  // A voice started, no words yet (they come a second or more later): hearing you, however quiet the meter reads.
  assert.equal(voiceState({ ...base, level: 3, signal: { ...base.signal, speechAt: 9_400 } }), 'voice')
  // Words a second ago, the next burst not here yet: still hearing you — no flip to anything else.
  const talking = { ...base, heard: 'Alexa, tell me', signal: { lastWordAt: 9_000, heldSince: 0, speechAt: 7_000 } }
  assert.equal(voiceState(talking), 'voice')
  // Only the wake word so far (hidden from the words shown): still your voice, not a drop to quiet mid-sentence.
  assert.equal(voiceState({ ...base, heard: '', signal: { lastWordAt: 9_700, heldSince: 0, speechAt: 9_000 } }), 'voice')
  // Planning keeps the mic open while Casa thinks: talking over it shows your voice.
  assert.equal(voiceState({ ...talking, thinking: true }), 'voice')
  // Words on screen and nothing new for a while: a still line while Deepgram decides you're done.
  assert.equal(voiceState({ ...talking, signal: { ...talking.signal, lastWordAt: 10_000 - VOICE_HANGOVER_MS - 1 } }), 'heard')
})

test('the fuse is only the real stall: an unfinished sentence held for the rest (4.5 s), with tap to send', () => {
  const held = { ...base, heard: 'add a dentist for', signal: { lastWordAt: 7_000, heldSince: 8_000, speechAt: 6_000 } }
  assert.equal(voiceState(held), 'fuse')
  assert.equal(fuseProgress(held.now, held.signal), 2_000 / FUSE_HELD_MS)
  assert.equal(fuseProgress(60_000, held.signal), 0.97)
  // Talking again during the hold is your voice.
  assert.equal(voiceState({ ...held, signal: { ...held.signal, lastWordAt: 9_800 } }), 'voice')
})

test('the room: loud with no voice detected for a while; a cough with nothing after it settles back', () => {
  assert.equal(voiceState({ ...base, level: 30, noisyFor: 2_000 }), 'noise')
  assert.equal(voiceState({ ...base, level: 30, noisyFor: 800 }), 'quiet')
  assert.equal(voiceState({ ...base, signal: { ...base.signal, speechAt: 10_000 - VOICE_HANGOVER_MS - 2_000 } }), 'quiet')
})

test('the level rises fast and falls slower; the room\'s level is learned; height is scaled to the bridge\'s decibel scale', () => {
  let s = { level: 30, floor: 34 }
  s = stepLevel(s, 52, 60)
  assert.ok(s.level > 51, `fast up: ${s.level}`)
  const after = stepLevel(s, 34, 100)
  assert.ok(after.level > 40 && after.level < 48, `slower down: ${after.level}`)
  assert.ok(stepLevel({ level: 34, floor: 34 }, 52, 100).floor < 35, 'a voice barely moves the floor')
  assert.equal(amplitude(34, 34), 0)
  // A normal voice on the wall (~45–55 against a room of ~34) is most of the height; a shout is all of it.
  assert.ok(amplitude(50, 34) >= 0.7)
  assert.equal(amplitude(90, 34), 1)
})

test('the wake word is left off the words shown, so the sentence doesn\'t jump when it\'s dropped', () => {
  assert.equal(shownWords('Alexa, tell me what\'s on the calendar'), 'tell me what\'s on the calendar')
  assert.equal(shownWords('Alexa.'), '')
  assert.equal(shownWords('Hey Alexa what time is it'), 'what time is it')
  assert.equal(shownWords('Tell Alexa no'), 'Tell Alexa no')
})

test('words in confidence ink: the ones Deepgram isn\'t sure of are faded, matched from the end', () => {
  const ink = inkWords('Add a dentist appointment for live on Friday', [
    { word: 'for', confidence: 0.98 }, { word: 'live', confidence: 0.41 }, { word: 'on', confidence: 0.95 }, { word: 'friday', confidence: 0.44 },
  ])
  assert.deepEqual(ink.filter((w) => w.faded).map((w) => w.text), ['live', 'Friday'])
  assert.equal(ink.map((w) => w.text).join(' '), 'Add a dentist appointment for live on Friday')
  assert.deepEqual(inkWords('hello there', []).map((w) => w.faded), [false, false])
})
