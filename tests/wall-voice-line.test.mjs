import test from 'node:test'
import assert from 'node:assert/strict'
import { FUSE_HELD_MS, FUSE_MS, FUSE_STARTS_MS, amplitude, fuseProgress, inkWords, stepLevel, voiceState } from '../src/wall/voiceLine.ts'

// Canvas row 17: one voice line under the words — you vs the room, the fuse, words in confidence ink.

const base = { now: 10_000, micOpen: true, bridgeDown: false, thinking: false, needsYes: false, heard: '', level: 4, floor: 4, noisyFor: 0, lastLoudAt: 0, signal: { lastWordAt: 0, heldSince: 0, confidence: null, speechAt: 0 } }

test('the line\'s state: can\'t hear first, then Casa\'s turn, then yours', () => {
  assert.equal(voiceState({ ...base, bridgeDown: true, thinking: true }), 'deaf')
  assert.equal(voiceState({ ...base, thinking: true }), 'thinking')
  assert.equal(voiceState(base), 'quiet')
  assert.equal(voiceState({ ...base, micOpen: false }), 'off')
  assert.equal(voiceState({ ...base, micOpen: false, needsYes: true }), 'yes')
  assert.equal(voiceState({ ...base, needsYes: true }), 'yes')
})

test('you vs the room: words coming = hearing you; loud with no words for a while = room noise', () => {
  const talking = { ...base, heard: 'add a dentist', level: 40, signal: { lastWordAt: 9_800, heldSince: 0, confidence: 0.93 } }
  assert.equal(voiceState(talking), 'voice')
  assert.equal(voiceState({ ...talking, signal: { ...talking.signal, confidence: 0.5 } }), 'unsure')
  // Between words (Deepgram updates every few hundred ms) the voice still counts while it's loud.
  assert.equal(voiceState({ ...talking, signal: { ...talking.signal, lastWordAt: 8_600 } }), 'voice')
  // Planning keeps the mic open while Casa thinks: talking over it shows your voice, not the sweep.
  assert.equal(voiceState({ ...talking, thinking: true }), 'voice')
  assert.equal(voiceState({ ...base, level: 30, noisyFor: 2_000 }), 'noise')
  assert.equal(voiceState({ ...base, level: 30, noisyFor: 800 }), 'quiet')
})

test('the fuse: words heard and you stopped; held for the rest of a sentence, it runs the 4.5 s hold', () => {
  const stopped = { ...base, heard: 'add a dentist on Friday at 4', level: 5, signal: { lastWordAt: 9_300, heldSince: 0, confidence: 0.9 } }
  assert.equal(voiceState(stopped), 'fuse')
  // It starts empty when it appears (600 ms after the last word) and fills over the rest of Casa's wait.
  assert.equal(fuseProgress(stopped.now, stopped.signal, 0), (700 - FUSE_STARTS_MS) / (FUSE_MS - FUSE_STARTS_MS))
  const held = { ...stopped, signal: { ...stopped.signal, heldSince: 8_000 } }
  assert.equal(voiceState(held), 'fuse')
  assert.equal(fuseProgress(held.now, held.signal, 0), 2_000 / FUSE_HELD_MS)
  // It never claims to be full before Casa has actually taken the turn.
  assert.equal(fuseProgress(60_000, stopped.signal, 0), 0.97)
})

test('the level rises fast and falls slower; the room\'s own level is learned slowly upward, quickly downward', () => {
  let s = { level: 0, floor: 5 }
  s = stepLevel(s, 60, 60)
  assert.ok(s.level > 55, `fast up: ${s.level}`)
  const after = stepLevel(s, 0, 100)
  // Slower down than up (~200 ms), but quick enough that the fuse shows soon after your voice stops.
  assert.ok(after.level > 25 && after.level < 45, `slower down: ${after.level}`)
  assert.ok(stepLevel({ level: 5, floor: 5 }, 40, 100).floor < 6, 'a voice barely moves the floor')
  assert.ok(stepLevel({ level: 5, floor: 20 }, 4, 300).floor < 10, 'a quieter room is learned fast')
  assert.equal(amplitude(5, 5), 0)
  assert.equal(amplitude(100, 5), 1)
})

test('words in confidence ink: the ones Deepgram isn\'t sure of are faded, matched from the end', () => {
  const ink = inkWords('Add a dentist appointment for live on Friday', [
    { word: 'for', confidence: 0.98 }, { word: 'live', confidence: 0.41 }, { word: 'on', confidence: 0.95 }, { word: 'friday', confidence: 0.52 },
  ])
  assert.deepEqual(ink.filter((w) => w.faded).map((w) => w.text), ['live', 'Friday'])
  assert.equal(ink.map((w) => w.text).join(' '), 'Add a dentist appointment for live on Friday')
  assert.deepEqual(inkWords('hello there', []).map((w) => w.faded), [false, false])
})

// Jake, 2026-09-30, on the wall: "I start talking and it translates the text and sends it before the line even
// moves." The traces showed why: Deepgram's words came all at once with the end of the sentence, and the line
// waited for words. Now your voice moves it (loud above the room, with Deepgram's speech start), and the fuse
// runs from when your voice stops.
test('your voice moves the line before any words come; the fuse starts when your voice stops', () => {
  const speaking = { ...base, level: 14, floor: 2, signal: { ...base.signal, speechAt: 9_200 } }
  assert.equal(voiceState(speaking), 'voice')
  // The same sound with no voice detected is the room.
  assert.equal(voiceState({ ...speaking, signal: { ...base.signal }, noisyFor: 2_000 }), 'noise')
  // Your voice stopped 500 ms ago, no words yet: the fuse, filling from when you stopped.
  const stopped = { ...base, level: 2, floor: 2, lastLoudAt: 9_500, signal: { ...base.signal, speechAt: 8_000 } }
  assert.equal(voiceState(stopped), 'fuse')
  assert.equal(fuseProgress(stopped.now, stopped.signal, stopped.lastLoudAt), (500 - FUSE_STARTS_MS) / (FUSE_MS - FUSE_STARTS_MS))
  // A voice start with nothing after it (a cough): back to quiet once the wait has passed.
  assert.equal(voiceState({ ...stopped, lastLoudAt: 7_000 }), 'quiet')
  // The words arriving after you stopped (as they do on the wall) don't count as talking, and the fuse keeps its
  // place — it doesn't jump back to the wave and start over.
  const words = { ...stopped, heard: 'add a dentist', signal: { ...stopped.signal, lastWordAt: 9_900 } }
  assert.equal(voiceState(words), 'fuse')
  assert.equal(fuseProgress(words.now, words.signal, words.lastLoudAt), fuseProgress(stopped.now, stopped.signal, stopped.lastLoudAt))
})
