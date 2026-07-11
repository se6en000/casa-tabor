import assert from 'node:assert/strict'
import test from 'node:test'

import { classifyAssistantIntent } from '../supabase/functions/_shared/assistant-intent-profile.mjs'

test('calendar reads and edits require authoritative event search', () => {
  for (const input of [
    'Give me a rundown of everything on the calendar tomorrow',
    'How many appointments are there this week?',
    'Move Owen therapy to 9 tomorrow',
  ]) {
    assert.deepEqual(classifyAssistantIntent(input), { profile: 'event', forceEventSearch: true })
  }
})

test('calendar creates keep direct create tooling available', () => {
  assert.deepEqual(
    classifyAssistantIntent('Create a calendar event for dinner tomorrow'),
    { profile: 'event', forceEventSearch: false },
  )
})

test('focused event edits never search for an event already in context', () => {
  assert.deepEqual(
    classifyAssistantIntent('Change the location', { focusedEvent: true }),
    { profile: 'event', forceEventSearch: false },
  )
})

test('common assistant domains select narrow profiles', () => {
  assert.equal(classifyAssistantIntent('Will it rain tomorrow?').profile, 'weather')
  assert.equal(classifyAssistantIntent('When should we leave for school?').profile, 'travel')
  assert.equal(classifyAssistantIntent('What is on the grocery list?').profile, 'grocery')
  assert.equal(classifyAssistantIntent('Suggest a chicken dinner').profile, 'recipe')
  assert.equal(classifyAssistantIntent('What is the latest stock price?').profile, 'web')
  assert.equal(classifyAssistantIntent('Explain photosynthesis').profile, 'general')
})

test('cross-domain requests preserve the full tool lane', () => {
  assert.equal(
    classifyAssistantIntent('Should I move tomorrow’s event because of rain?').profile,
    'full',
  )
})
