import assert from 'node:assert/strict'
import test from 'node:test'

import { classifyAssistantAmbiguity } from '../supabase/functions/_shared/assistant-request-safety.mjs'

test('vague write targets clarify instead of guessing across domains', () => {
  for (const text of [
    'move the thing and add milk and maybe look at tomorrow too',
    'add the stuff we need for the thing at grandma house',
    'delete the other one',
    'fix it for later',
  ]) {
    assert.equal(classifyAssistantAmbiguity(text)?.kind, 'vague_action_target', text)
  }
})

test('grounded follow-ups and explicit targets remain actionable', () => {
  assert.equal(classifyAssistantAmbiguity('move it to Friday', { hasActiveEntity: true }), null)
  assert.equal(classifyAssistantAmbiguity('move soccer practice to Friday'), null)
  assert.equal(classifyAssistantAmbiguity('add milk to the grocery list'), null)
})
