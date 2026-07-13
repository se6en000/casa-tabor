import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CALENDAR_INTENTS,
  CALENDAR_UTTERANCE_CORPUS,
} from '../supabase/functions/_shared/assistant-calendar-language.mjs'
import {
  COOKING_INTENTS,
  COOKING_UTTERANCE_CORPUS,
} from '../supabase/functions/_shared/assistant-cooking-language.mjs'
import {
  GROCERY_INTENTS,
  GROCERY_UTTERANCE_CORPUS,
} from '../supabase/functions/_shared/assistant-grocery-language.mjs'

test('semantic ontology covers broad concepts through generated natural language', () => {
  const intents = [...CALENDAR_INTENTS, ...GROCERY_INTENTS, ...COOKING_INTENTS]
  const utterances = [
    ...CALENDAR_UTTERANCE_CORPUS,
    ...GROCERY_UTTERANCE_CORPUS,
    ...COOKING_UTTERANCE_CORPUS,
  ]

  assert.ok(intents.length >= 45, `expected at least 45 concepts, got ${intents.length}`)
  assert.ok(utterances.length >= 500, `expected at least 500 generated utterances, got ${utterances.length}`)
  assert.equal(new Set(intents).size, intents.length)
  for (const intent of intents) {
    assert.ok(utterances.some((sample) => sample.intent === intent), `missing utterance coverage for ${intent}`)
  }
})
