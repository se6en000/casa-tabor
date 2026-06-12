import test from 'node:test'
import assert from 'node:assert/strict'

import {
  AMBIGUITY_GUARDRAILS,
  DIFF_AND_OUTPUT_GUARDRAILS,
  EDIT_INTENT_GUARDRAILS,
  RECOVERY_AND_CONFLICT_GUARDRAILS,
} from '../supabase/functions/_shared/ai-prompt-guardrails.mjs'

test('edit intent guardrails enforce append/replace/clear/transform classification', () => {
  assert.match(EDIT_INTENT_GUARDRAILS, /append \| replace \| clear \| transform/i)
  assert.match(EDIT_INTENT_GUARDRAILS, /add.*append by default/i)
})

test('ambiguity guardrails require disambiguation before writes', () => {
  assert.match(AMBIGUITY_GUARDRAILS, /ambiguous=true/i)
  assert.match(AMBIGUITY_GUARDRAILS, /confidence < 0\.75/i)
  assert.match(AMBIGUITY_GUARDRAILS, /ask.*disambiguation/i)
})

test('diff/output guardrails require explicit change/preserve/confirm contract', () => {
  assert.match(DIFF_AND_OUTPUT_GUARDRAILS, /Will change/i)
  assert.match(DIFF_AND_OUTPUT_GUARDRAILS, /Will preserve/i)
  assert.match(DIFF_AND_OUTPUT_GUARDRAILS, /Needs confirmation/i)
})

test('recovery/conflict guardrails cover retries and conflicting intents', () => {
  assert.match(RECOVERY_AND_CONFLICT_GUARDRAILS, /concurrency\/sync\/schema failures/i)
  assert.match(RECOVERY_AND_CONFLICT_GUARDRAILS, /refresh and retry/i)
  assert.match(RECOVERY_AND_CONFLICT_GUARDRAILS, /conflicting edit intents/i)
})
