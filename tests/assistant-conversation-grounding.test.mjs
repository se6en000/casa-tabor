import assert from 'node:assert/strict'
import test from 'node:test'

import {
  answerGroundedEventFollowUp,
  answerGroundedEventSemanticFrame,
  calendarClarificationConversationState,
  eventConversationState,
  groceryConversationState,
  normalizeConversationState,
  resolveCalendarClarificationSelection,
} from '../supabase/functions/_shared/assistant-conversation-grounding.mjs'
import { secureAssistantResult } from '../supabase/functions/_shared/assistant-output-safety.mjs'
import { isIncompleteVoiceFragment } from '../src/lib/voiceTurnTaking.mjs'

const event = {
  id: 'event-1',
  title: 'Owen 6th Birthday Party',
  start_time: '2026-07-11T16:30:00Z',
  end_time: '2026-07-11T18:30:00Z',
  updated_at: '2026-07-11T01:15:59Z',
  location_name: 'Greenacres Bowl',
  address: '6126 Lake Worth Rd. Greenacres, FL 33463',
  description: '10 guests expected',
  event_members: [{ family_members: { name: 'Owen' } }],
  event_enrichments: [{ prep_notes: null, what_to_bring: [] }],
}

test('conversation state retains an authoritative event identity and expires', () => {
  const now = new Date('2026-07-11T13:00:00Z')
  const state = eventConversationState(event, now)
  assert.equal(normalizeConversationState(state, now.getTime() + 1000)?.activeEventId, event.id)
  assert.equal(normalizeConversationState(state, now.getTime() + 31 * 60 * 1000), null)
})

test('conversation state retains an authoritative grocery item identity', () => {
  const now = new Date('2026-07-11T13:00:00Z')
  const state = groceryConversationState({ id: 'milk' }, now)
  assert.equal(normalizeConversationState(state, now.getTime() + 1000)?.activeGroceryItemId, 'milk')
})

test('calendar clarification state preserves choices and resolves ordinal follow-ups', () => {
  const now = new Date('2026-07-14T13:00:00Z')
  const secondEvent = {
    ...event,
    id: 'event-2',
    updated_at: 'v2',
    start_time: '2026-07-18T23:00:00Z',
  }
  const state = calendarClarificationConversationState(
    [event, secondEvent],
    {
      tool: 'update_event',
      args: { id: event.id, expected_updated_at: event.updated_at, members_add: ['Owen'] },
    },
    now,
  )
  const normalized = normalizeConversationState(state, now.getTime() + 1000)
  assert.equal(normalized.candidateEvents.length, 2)
  const resolved = resolveCalendarClarificationSelection(
    'the second one',
    normalized,
    [event, secondEvent],
  )
  assert.equal(resolved.tool, 'update_event')
  assert.equal(resolved.args.id, 'event-2')
  assert.equal(resolved.args.expected_updated_at, 'v2')
  assert.deepEqual(resolved.args.members_add, ['Owen'])
})

test('calendar clarification lists numbered choices and resolves spoken time or weekday', () => {
  const saturday = {
    ...event,
    id: 'saturday-dinner',
    title: 'Dinner With Kelly',
    updated_at: 'sat-v1',
    start_time: '2026-07-18T23:00:00Z',
  }
  const sunday = {
    ...event,
    id: 'sunday-dinner',
    title: 'Dinner With Kelly',
    updated_at: 'sun-v1',
    start_time: '2026-07-19T22:00:00Z',
  }
  const state = calendarClarificationConversationState(
    [saturday, sunday],
    { tool: 'delete_event', args: {} },
    new Date('2026-07-14T13:00:00Z'),
  )
  const options = { utcOffset: '-04:00' }

  const choices = resolveCalendarClarificationSelection(
    'what are my choices number them',
    state,
    [saturday, sunday],
    options,
  )
  assert.match(choices.text, /1\. Dinner With Kelly — Sat, Jul 18 at 7:00 PM/)
  assert.match(choices.text, /2\. Dinner With Kelly — Sun, Jul 19 at 6:00 PM/)
  assert.equal(
    resolveCalendarClarificationSelection(
      'delete the one starting at 7',
      state,
      [saturday, sunday],
      options,
    ).args.id,
    saturday.id,
  )
  assert.equal(
    resolveCalendarClarificationSelection(
      'delete the Sunday one',
      state,
      [saturday, sunday],
      options,
    ).args.id,
    sunday.id,
  )
})

test('calendar search candidates ground explicit ordinal and weekday deletes', () => {
  const saturday = {
    ...event,
    id: 'saturday-dinner',
    title: 'Dinner With Kelly',
    updated_at: 'sat-v1',
    start_time: '2026-07-18T23:00:00Z',
  }
  const sunday = {
    ...event,
    id: 'sunday-dinner',
    title: 'Dinner With Kelly',
    updated_at: 'sun-v1',
    start_time: '2026-07-19T22:00:00Z',
  }
  const state = calendarClarificationConversationState(
    [saturday, sunday],
    { tool: 'select_event', args: {} },
    new Date('2026-07-14T13:00:00Z'),
  )
  const normalized = normalizeConversationState(state, Date.parse('2026-07-14T13:00:01Z'))
  const options = { utcOffset: '-04:00' }

  assert.equal(
    resolveCalendarClarificationSelection(
      'delete the first one please',
      normalized,
      [saturday, sunday],
      options,
    ).args.id,
    saturday.id,
  )
  assert.equal(
    resolveCalendarClarificationSelection(
      'delete the one on Sunday',
      normalized,
      [saturday, sunday],
      options,
    ).args.id,
    sunday.id,
  )
})

test('calendar clarification preserves and applies the semantic mutation after selection', () => {
  const now = new Date('2026-07-14T13:00:00Z')
  const secondEvent = {
    ...event,
    id: 'event-2',
    updated_at: 'v2',
    start_time: '2026-07-18T23:00:00Z',
  }
  const state = calendarClarificationConversationState(
    [event, secondEvent],
    {
      tool: 'update_event',
      args: {},
      semanticTurn: {
        version: 'calendar-semantic-turn-v1',
        action: 'update',
        candidateEntityIds: [event.id, secondEvent.id],
        patch: { members_add: ['Owen'] },
      },
    },
    now,
  )
  const normalized = normalizeConversationState(state, now.getTime() + 1000)
  const resolved = resolveCalendarClarificationSelection(
    'the first one',
    normalized,
    [event, secondEvent],
    { currentDate: now.toISOString(), utcOffset: '+00:00' },
  )
  assert.equal(resolved.tool, 'update_event')
  assert.equal(resolved.args.id, event.id)
  assert.deepEqual(resolved.args.members_add, ['Owen'])
})

test('event follow-ups answer only from authoritative fields', () => {
  assert.match(answerGroundedEventFollowUp('Are you sure that is the right location?', event), /Greenacres Bowl/)
  assert.match(answerGroundedEventFollowUp("What's the address?", event), /6126 Lake Worth Rd/)
  assert.doesNotMatch(answerGroundedEventFollowUp('Prep me for it', event), /FunZone|superhero|party favors/i)
})

test('semantic event frames dispatch without re-parsing the original phrase', () => {
  assert.match(answerGroundedEventSemanticFrame({ intent: 'event.location' }, event), /Greenacres Bowl/)
  assert.match(answerGroundedEventSemanticFrame({ intent: 'event.duration' }, event), /2 hours/)
  assert.match(answerGroundedEventSemanticFrame({ intent: 'event.attendees' }, event), /Owen/)
})

test('natural candidate confirmations retain the active event', () => {
  assert.match(answerGroundedEventFollowUp("yeah that's the one obviously", event), /using the calendar event/)
})

test('output safety rejects pseudo-tools and unsupported write claims', () => {
  assert.equal(
    secureAssistantResult({ type: 'text', text: 'tool_code\nprint(update_event({id: "made-up"}))' }).safety_rejection,
    'raw_tool_syntax',
  )
  assert.equal(
    secureAssistantResult({ type: 'text', text: "Okay, I'll update the address." }, { userRequestedWrite: true }).safety_rejection,
    'unsupported_write_claim',
  )
  assert.equal(
    secureAssistantResult({ type: 'text', text: "I've scheduled that trip for you." }, { userRequestedWrite: true }).safety_rejection,
    'unsupported_write_claim',
  )
  assert.equal(secureAssistantResult({ type: 'tool_action', tool: 'update_event' }).type, 'tool_action')
  assert.equal(
    secureAssistantResult({ type: 'text', text: 'Confirmed—I created it.', write_verified: true }, { userRequestedWrite: true }).safety_rejection,
    undefined,
  )
  assert.equal(
    secureAssistantResult({ type: 'text', text: "Okay, I'm searching for your events now. Please bear with me." }).safety_rejection,
    'unsupported_deferred_progress',
  )
  assert.equal(
    secureAssistantResult({ type: 'text', text: "Do we have what? Tell me more about what you're looking for." }).safety_rejection,
    undefined,
  )
})

test('turn-taking holds incomplete clauses but preserves short commands', () => {
  for (const text of ["yes that's the", "what's the", "don't", 'can you', 'do we have']) {
    assert.equal(isIncompleteVoiceFragment(text), true, text)
  }
  for (const text of ['yes', 'cancel', "what's the address", 'conversation']) {
    assert.equal(isIncompleteVoiceFragment(text), false, text)
  }
})
