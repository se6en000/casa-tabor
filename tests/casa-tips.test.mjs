import test from 'node:test'
import assert from 'node:assert/strict'
import { CASA_TIPS, pickTip, tipsByTopic, noteTipUsage } from '../supabase/functions/_shared/casa-tips.mjs'

// Tips while Casa thinks, and "What can I say?" (FAMILY_WALL_PLAN.md P3.19 3c; Jake 2026-09-27:
// "as the AI is thinking it reminds me of tips and tricks … kinda like the way Claude does").

test('about sixteen, each one sentence with the words to say, grouped by topic', () => {
  assert.ok(CASA_TIPS.length >= 14 && CASA_TIPS.length <= 20)
  for (const t of CASA_TIPS) {
    assert.ok(t.id && t.topic && t.text, t.id)
    assert.ok(t.text.length < 140, `${t.id} is short`)
  }
  assert.deepEqual(tipsByTopic().map((g) => g.topic), ['Calendar', 'Coming up', 'Gift ideas', 'Groceries & recipes', 'Talking to Casa'])
  assert.equal(new Set(CASA_TIPS.map((t) => t.id)).size, CASA_TIPS.length)
})

test('a tip that fits the question comes first', () => {
  assert.equal(pickTip({ question: "When's Carl's birthday again?", usage: {}, seed: 0 }).topic, 'Gift ideas')
  assert.equal(pickTip({ question: 'is there a spirit day this week', usage: {}, seed: 0 }).topic, 'Coming up')
  assert.equal(pickTip({ question: 'we need eggs', usage: {}, seed: 0 }).topic, 'Groceries & recipes')
})

test('tips retire once the thing has been used a couple of times', () => {
  let usage = {}
  usage = noteTipUsage(usage, 'gift idea for Kelly: a scarf')
  usage = noteTipUsage(usage, 'gift idea for Liv: roller skates')
  const tip = pickTip({ question: "When's Carl's birthday again?", usage, seed: 0 })
  assert.notEqual(tip.id, 'gift-save', 'saving gift ideas is known now')
})

test('otherwise it rotates, and never runs out', () => {
  const seen = new Set(Array.from({ length: 40 }, (_, seed) => pickTip({ question: 'hmm', usage: {}, seed }).id))
  assert.ok(seen.size >= 8)
  const all = Object.fromEntries(CASA_TIPS.flatMap((t) => (t.uses ? [[t.id, 5]] : [])))
  assert.ok(pickTip({ question: 'hmm', usage: all, seed: 3 }), 'still a tip when all are known')
})
