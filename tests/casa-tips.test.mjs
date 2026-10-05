import test from 'node:test'
import assert from 'node:assert/strict'
import { CASA_TIPS, asksForTips, isNewTip, pickTip, tipsByTopic } from '../supabase/functions/_shared/casa-tips.mjs'

// Tips and "what can I say?" (P3.19 3c; rewritten Oct 3 — Jake: "update that list with any new examples of your
// capabilities … a reminder to talk to you I would a human, not a robot with only defined phrases").

test('said the way a person says it, short, grouped by what you are doing', () => {
  assert.ok(CASA_TIPS.length >= 20 && CASA_TIPS.length <= 30)
  for (const t of CASA_TIPS) {
    assert.ok(t.id && t.topic && t.text, t.id)
    assert.ok(t.text.length < 110, `${t.id} is short`)
    assert.match(t.text, /^“/, `${t.id} starts with the words to say`)
  }
  assert.deepEqual(tipsByTopic().map((g) => g.topic), ['Calendar', 'Who’s driving', 'Trips', 'Groceries', 'To do & plans', 'Remember', 'Coming up', 'Email', 'Getting around', 'Talking'])
  for (const g of tipsByTopic()) assert.ok(g.tips.length >= 1, g.topic)
  assert.equal(new Set(CASA_TIPS.map((t) => t.id)).size, CASA_TIPS.length)
})

test('a tip that fits the question comes first', () => {
  assert.equal(pickTip({ question: "When's Carl's birthday again?", seed: 0 }).id, 'gift-save')
  assert.equal(pickTip({ question: 'is there a spirit day this week', seed: 0 }).id, 'cu-rule')
  assert.equal(pickTip({ question: 'we need eggs', seed: 0 }).topic, 'Groceries')
  assert.equal(pickTip({ question: 'I’m flying to Dallas Wednesday', seed: 0 }).topic, 'Trips')
})

test('nothing retires: it rotates through all of them, again and again', () => {
  const seen = new Set(Array.from({ length: CASA_TIPS.length * 2 }, (_, seed) => pickTip({ question: 'hmm', seed }).id))
  assert.equal(seen.size, CASA_TIPS.length)
})

test('"what can I say?" and "what can you do?" ask for the list; anything else is a question for Casa', () => {
  for (const s of ['What can I say?', 'what can you do', 'Alexa, what can I say?', 'So what can I ask?', 'What else can you do?', 'Show me what I can say']) assert.ok(asksForTips(s), s)
  for (const s of ['What can I say to Kelly about Friday?', 'what can you do about the dentist', 'Is it going to rain?']) assert.equal(asksForTips(s), false, s)
})

test('the last two weeks’ abilities are marked new', () => {
  const groc = CASA_TIPS.find((t) => t.id === 'groc-add')
  assert.equal(isNewTip(groc, new Date('2026-10-03T12:00:00')), true)
  assert.equal(isNewTip(groc, new Date('2026-10-30T12:00:00')), false)
  assert.equal(isNewTip(CASA_TIPS.find((t) => t.id === 'cal-day'), new Date('2026-10-03T12:00:00')), false)
})

test('"Casa, what can you do?" (when it reaches Casa) is answered from the same list', async () => {
  const { buildFullAiSystem } = await import('../supabase/functions/_shared/assistant-full-ai.mjs')
  const system = buildFullAiSystem({ family: [], events: [], groceries: [], pending: [], onScreenIds: [], utcOffset: '-04:00', now: new Date('2026-09-27T12:00:00-04:00') })
  assert.match(system, /WHAT YOU CAN DO/)
  for (const t of CASA_TIPS) assert.ok(system.includes(t.text), t.id)
  assert.match(system, /what can I say\?/i)
})
