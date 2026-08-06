import assert from 'node:assert/strict'
import test from 'node:test'

import { classifyAssistantIntent } from '../supabase/functions/_shared/assistant-intent-profile.mjs'
import { isHouseholdDirectoryQuestion } from '../supabase/functions/_shared/assistant-household-directory.mjs'

test('calendar reads and edits require authoritative event search', () => {
  for (const input of [
    'Give me a rundown of everything on the calendar tomorrow',
    'How many appointments are there this week?',
    'Move Owen therapy to 9 tomorrow',
    'Prep me for "Owen 6th Birthday Party"',
    "I'm talking about Owen's birthday party",
  ]) {
    assert.deepEqual(classifyAssistantIntent(input), { profile: 'event', forceEventSearch: true })
  }
})

test('schedule used as a noun remains an authoritative calendar read', () => {
  assert.deepEqual(
    classifyAssistantIntent("what's on the schedule for tomorrow"),
    { profile: 'event', forceEventSearch: true },
  )
})

test('calendar create wording uses authoritative search when no semantic frame was established', () => {
  assert.deepEqual(
    classifyAssistantIntent('Create a calendar event for dinner tomorrow'),
    { profile: 'event', forceEventSearch: true },
  )
  assert.deepEqual(
    classifyAssistantIntent('create an apt from july 21 to july 28 for Jake and the girls'),
    { profile: 'event', forceEventSearch: true },
  )
  assert.deepEqual(
    classifyAssistantIntent('schedule a trip from august 2 through august 6 for Emme'),
    { profile: 'event', forceEventSearch: true },
  )
})

test('focused event edits never search for an event already in context', () => {
  assert.deepEqual(
    classifyAssistantIntent('Change the location', { focusedEvent: true }),
    { profile: 'event', forceEventSearch: false },
  )
})

test('authoritative active events keep vague follow-ups on the event lane', () => {
  for (const input of [
    'Are you sure that is the right location?',
    "What's the address?",
    'How long will it take to get there?',
    'When should we leave?',
    "Yes that's the one",
    'Prep me for it',
  ]) {
    assert.deepEqual(
      classifyAssistantIntent(input, { activeEntityType: 'event' }),
      { profile: 'event', forceEventSearch: false },
    )
  }
})

test('pending event edits keep short list continuations on the event lane', () => {
  for (const input of ['candles', 'cookies not cookie']) {
    assert.deepEqual(
      classifyAssistantIntent(input, { activeEntityType: 'event', pendingEventAction: true }),
      { profile: 'event', forceEventSearch: false },
    )
  }
})

test('pending event confirmations keep retry and review requests on the event lane', () => {
  for (const input of ['retry', 'look at the conversation', 'review that again']) {
    assert.deepEqual(
      classifyAssistantIntent(input, { pendingEventAction: true }),
      { profile: 'event', forceEventSearch: false },
    )
  }
})

test('active grocery items keep quantity follow-ups on the grocery lane', () => {
  assert.deepEqual(
    classifyAssistantIntent('Make that two', { activeEntityType: 'grocery_item' }),
    { profile: 'grocery', forceEventSearch: false },
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

test('household directory questions load confirmed person and place context before external search', () => {
  for (const input of [
    'Where does Coach Danny meet, and what number should I use?',
    'What do you know about Shoot Straight?',
    'Where do we usually go for pediatric appointments?',
    'Who should I call about air conditioning, and where are they based?',
    'Where is Liv’s orthodontist?',
    'Who is Olivia’s dermatologist, and where are they?',
    'What other doctors does Jake use?',
    'Name Jakes doctors',
    'What sports places do Jake and Liv usually go to?',
    'What address does Coach Danny use?',
    'I need to schedule something with Coach Danny next week—where should I put it?',
  ]) {
    assert.equal(isHouseholdDirectoryQuestion(input), true, input)
  }
  assert.equal(isHouseholdDirectoryQuestion('Schedule a dentist appointment next Tuesday at 3 PM.'), false)
})

test('recipe words do not hide ambiguous calendar mutation targets', () => {
  assert.deepEqual(
    classifyAssistantIntent('delete dinner with kelly'),
    { profile: 'full', forceEventSearch: false },
  )
  assert.deepEqual(
    classifyAssistantIntent('remove the lunch recipe'),
    { profile: 'full', forceEventSearch: false },
  )
})

test('natural cooking concepts are not re-parsed by profile fallback', () => {
  for (const input of [
    'What can I use instead of buttermilk?',
    'My sauce is too thin, how do I save it?',
    'How should I reheat leftover pizza?',
    'Convert 350 Fahrenheit to Celsius',
    'Is this chicken still safe to eat?',
  ]) {
    assert.notEqual(classifyAssistantIntent(input).profile, 'recipe', input)
  }
})

test('event mutations with calendar context stay on event lane', () => {
  assert.deepEqual(
    classifyAssistantIntent('move soccer practice to next friday at 7 pm'),
    { profile: 'event', forceEventSearch: true },
  )
  assert.deepEqual(
    classifyAssistantIntent('delete summer trip on august 12'),
    { profile: 'event', forceEventSearch: true },
  )
})

test('cross-domain requests preserve the full tool lane', () => {
  assert.equal(
    classifyAssistantIntent('Should I move tomorrow’s event because of rain?').profile,
    'full',
  )
})
