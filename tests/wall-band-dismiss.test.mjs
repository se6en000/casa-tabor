import test from 'node:test'
import assert from 'node:assert/strict'
import { dismissStep, isSwipeDown } from '../src/wall/assistant.ts'

// Dismissing Casa without the small button (Jake, 2026-09-30: "if the AI gets tripped … I need a non voice
// way to quickly dismiss it … I can't be forced to only click the small button"): a tap anywhere outside the
// band, a swipe down on it, or Esc on a computer. With a card waiting for his yes, a tap outside asks once
// more first ("Tap again to close — the card isn't saved"), so a stray tap never throws a plan away.
test('a tap outside closes the band; with a card waiting, the first one only asks', () => {
  assert.equal(dismissStep({ how: 'tap_outside', waiting: false, armedAt: 0, now: 10_000 }), 'close')
  assert.equal(dismissStep({ how: 'tap_outside', waiting: true, armedAt: 0, now: 10_000 }), 'arm')
  assert.equal(dismissStep({ how: 'tap_outside', waiting: true, armedAt: 8_000, now: 10_000 }), 'close', 'the second tap within 4 seconds closes')
  assert.equal(dismissStep({ how: 'tap_outside', waiting: true, armedAt: 1_000, now: 10_000 }), 'arm', 'a tap long after asks again')
  assert.equal(dismissStep({ how: 'swipe_down', waiting: true, armedAt: 0, now: 10_000 }), 'close', 'a swipe down is on purpose')
  assert.equal(dismissStep({ how: 'escape', waiting: true, armedAt: 0, now: 10_000 }), 'close')
})

test('a swipe down: mostly downward, far enough, quick enough', () => {
  assert.equal(isSwipeDown({ x: 900, y: 700, t: 0 }, { x: 920, y: 900, t: 300 }), true)
  assert.equal(isSwipeDown({ x: 900, y: 700, t: 0 }, { x: 920, y: 760, t: 300 }), false, 'too short: a tap that slid')
  assert.equal(isSwipeDown({ x: 900, y: 700, t: 0 }, { x: 1200, y: 880, t: 300 }), false, 'more sideways than down')
  assert.equal(isSwipeDown({ x: 900, y: 900, t: 0 }, { x: 900, y: 700, t: 300 }), false, 'upward')
  // The band follows the hand now (canvas 37a-3, Jake Oct 3): a slow pull that brings it far enough down closes it too;
  // a slow short one springs back.
  assert.equal(isSwipeDown({ x: 900, y: 700, t: 0 }, { x: 900, y: 900, t: 2000 }), true, 'a slow pull, far enough')
  assert.equal(isSwipeDown({ x: 900, y: 700, t: 0 }, { x: 900, y: 840, t: 2000 }), false, 'a slow short pull springs back')
})

// A questionable trigger barely touches the screen (Jake, 2026-09-30: "finish the little AI band/UX for
// questionable AI triggers"): a wake-word open is a small "Listening…" pill until words are heard; the mic
// button (on purpose) opens the full band at once; a tap on the pill opens it too.
test('a wake shows the small pill until words are heard; the mic button opens the full band', async () => {
  const { bandCompact } = await import('../src/wall/assistant.ts')
  assert.equal(bandCompact({ viaWake: true, heard: '', messages: 0, expanded: false }), true)
  assert.equal(bandCompact({ viaWake: true, heard: 'what time', messages: 0, expanded: false }), false, 'words heard: the full band')
  assert.equal(bandCompact({ viaWake: true, heard: '', messages: 2, expanded: false }), false, 'a conversation is under way')
  assert.equal(bandCompact({ viaWake: true, heard: '', messages: 0, expanded: true }), false, 'tapped open')
  assert.equal(bandCompact({ viaWake: false, heard: '', messages: 0, expanded: false }), false, 'the mic button is on purpose')
})

// Jake, 2026-09-30: "after I used the email function … it's stuck on the email 'done' when I invoke Alexa, it
// doesn't start a new session and start listening". The kept conversation's last answer ("open the email
// review") reopened the finished review on every open. An answer opens things once, however often the band
// opens; and asking Casa always shows the band, never a review left behind.
test('an answer opens the email review or a day once, however often the band opens', async () => {
  const { firstTime } = await import('../src/wall/assistant.ts')
  assert.equal(firstTime('answer-1'), true)
  assert.equal(firstTime('answer-1'), false, 'the band opened again with the same answer')
  assert.equal(firstTime('answer-2'), true)
  const fs = await import('node:fs')
  const band = fs.readFileSync(new URL('../src/wall/WallAssistantBand.tsx', import.meta.url), 'utf8')
  assert.match(band, /answer\?\.emailReview && onOpenEmail && firstTime\(`email:\$\{answer\.id\}`\)/)
  assert.match(band, /firstTime\(`day:\$\{answer\.id\}`\)/)
  const frame = fs.readFileSync(new URL('../src/wall/WallFrame.tsx', import.meta.url), 'utf8')
  assert.match(frame, /const ask = useCallback\(\(say\?: string\) => \{\n\s+setEmailOpen\(false\)/)
})

// Jake, 2026-09-30 (talking over a project page): "when I touch the project the AI goes away" — a tap outside
// closes Casa only before anything's been said (an accidental wake); once there's a conversation, a tap
// reaches the screen underneath, and Casa stays until a swipe down, Close, or "that's all".
test('a tap outside closes Casa only before there is a conversation', async () => {
  const { tapOutsideCloses } = await import('../src/wall/assistant.ts')
  assert.equal(tapOutsideCloses(0), true)
  assert.equal(tapOutsideCloses(1), false)
  assert.equal(tapOutsideCloses(6), false)
})
