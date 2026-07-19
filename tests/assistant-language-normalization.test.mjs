import assert from 'node:assert/strict'
import test from 'node:test'

import {
  normalizeAssistantLanguage,
  normalizeAssistantSpeechPunctuation,
} from '../supabase/functions/_shared/assistant-language-normalization.mjs'

test('speech punctuation is formatting noise while semantic clock and date separators survive', () => {
  const variants = [
    'Create an appointment at 10:30 to go to Skyzone',
    'Create an appointment at 10:30. To go to Skyzone.',
    'Create an appointment at 10:30? To go to Skyzone!',
    'Create an appointment—at 10:30; to go to Skyzone…',
    '(Create an appointment) at 10:30, to go to Skyzone.',
  ]
  const normalized = variants.map((value) => normalizeAssistantSpeechPunctuation(value).toLowerCase())

  assert.deepEqual(normalized, Array(variants.length).fill(
    'create an appointment at 10:30 to go to skyzone',
  ))
  assert.equal(normalizeAssistantSpeechPunctuation("Owen's visit on 7/19 at 10:30 a.m."), "Owen's visit on 7/19 at 10:30 am")
  assert.equal(normalizeAssistantSpeechPunctuation('from 8–9 PM'), 'from 8 to 9 PM')
})

test('question marks do not change assistant intent language', () => {
  assert.equal(
    normalizeAssistantLanguage("What's on my calendar tomorrow?"),
    "what's on my calendar tomorrow",
  )
  assert.equal(
    normalizeAssistantLanguage('Delete this event?!'),
    'delete this event',
  )
})
