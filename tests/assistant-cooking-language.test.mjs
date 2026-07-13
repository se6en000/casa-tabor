import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COOKING_INTENTS,
  COOKING_UTTERANCE_CORPUS,
  isCookingLikeLanguage,
  parseCookingLanguage,
} from '../supabase/functions/_shared/assistant-cooking-language.mjs'

test('cooking language contract publishes stable concepts and generated coverage', () => {
  assert.equal(COOKING_INTENTS.length, 22)
  assert.equal(new Set(COOKING_INTENTS).size, COOKING_INTENTS.length)
  assert.ok(COOKING_UTTERANCE_CORPUS.length >= 80)
  for (const sample of COOKING_UTTERANCE_CORPUS) {
    const options = ['cooking.next_step', 'cooking.repeat_step'].includes(sample.intent)
      ? { assistantMode: 'chef' }
      : {}
    assert.equal(parseCookingLanguage(sample.text, options)?.intent, sample.intent, sample.text)
  }
})

test('cooking parser extracts useful open-class slots', () => {
  assert.deepEqual(parseCookingLanguage('How do I make chicken tacos?')?.slots, { recipe: 'chicken tacos' })
  assert.deepEqual(parseCookingLanguage('What can I make with salmon and rice?')?.slots, { ingredients: 'salmon and rice' })
  assert.equal(parseCookingLanguage('What can I use instead of buttermilk?')?.slots.ingredient, 'buttermilk')
})

test('cooking follow-ups require cooking context', () => {
  assert.equal(parseCookingLanguage('What do I do next?'), null)
  assert.equal(parseCookingLanguage('What do I do next?', { assistantMode: 'chef' })?.intent, 'cooking.next_step')
  assert.equal(parseCookingLanguage('Say that step again')?.intent, 'cooking.repeat_step')
})

test('common STT and spelling forms normalize before semantic parsing', () => {
  assert.equal(parseCookingLanguage('whats a good receipe for dinner')?.intent, 'cooking.recipe')
  assert.equal(parseCookingLanguage('what can i make with these ingredience')?.intent, 'cooking.from_ingredients')
  assert.equal(parseCookingLanguage('what can i do with left overs')?.intent, 'cooking.leftovers')
})

test('non-cooking language remains outside the cooking contract', () => {
  for (const text of [
    "What's going on Thursday?",
    'Add milk to the grocery list',
    'Will it rain tomorrow?',
    'Explain photosynthesis',
  ]) {
    assert.equal(parseCookingLanguage(text), null, text)
  }
  assert.equal(isCookingLikeLanguage('My sauce is too salty'), true)
  assert.equal(isCookingLikeLanguage('Move soccer practice'), false)
})
