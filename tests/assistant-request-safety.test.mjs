import assert from 'node:assert/strict'
import test from 'node:test'

import {
  classifyAssistantAmbiguity,
  safeFullProfileToolNames,
} from '../supabase/functions/_shared/assistant-request-safety.mjs'

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
  assert.equal(
    classifyAssistantAmbiguity(
      'Save the recipe you just suggested. Recipe draft: Cook it, then add the sauce.',
      { hasGroundedSemanticIntent: true },
    ),
    null,
  )
  assert.equal(classifyAssistantAmbiguity('move soccer practice to Friday'), null)
  assert.equal(classifyAssistantAmbiguity('add milk to the grocery list'), null)
})

test('Talk and Plan owns ambiguity handling instead of the generic cross-domain write guard', () => {
  for (const prompt of [
    'Help me plan the Casa Tabor frame. My goal is to finish it this month, but I need help and some pushing to get it done.',
    'I need help changing something in my routine.',
    'Can we talk through how I get it done?',
    'Delete the other one.',
  ]) {
    assert.equal(
      classifyAssistantAmbiguity(prompt, { experienceMode: 'talk_plan' }),
      null,
      prompt,
    )
  }

  assert.equal(
    classifyAssistantAmbiguity('Delete the other one.', { experienceMode: 'do' })?.kind,
    'vague_action_target',
  )
})

test('app-generated structured draft prompts (Title:/Details:/Due by: fields) are never flagged as vague, even when boilerplate uses "it"', () => {
  const draftPrompt = [
    'Create a reminder from this prep/action item as a draft and ask me to confirm before saving.',
    '',
    'Title: Your InHome delivery should arrive by 11:32am',
    'Details: Your Walmart+ InHome delivery is scheduled to arrive by 11:32am today.',
    'Due by: Wednesday, August 5, 2026 at 11:32 AM Eastern Time (this is already in Eastern Time — use it as-is, do not treat it as UTC)',
  ].join('\n')
  assert.equal(classifyAssistantAmbiguity(draftPrompt), null)

  const eventDraftPrompt = draftPrompt.replace('Create a reminder', 'Create a calendar event')
  assert.equal(classifyAssistantAmbiguity(eventDraftPrompt), null)
})

test('full-profile fallback cannot invent grocery mutations', () => {
  assert.deepEqual(
    safeFullProfileToolNames(['search_web', 'add_grocery_items', 'create_event', 'remove_grocery_item']),
    ['search_web', 'create_event'],
  )
})
