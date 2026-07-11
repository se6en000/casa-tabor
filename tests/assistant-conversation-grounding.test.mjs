import assert from 'node:assert/strict'
import test from 'node:test'

import {
  answerGroundedEventFollowUp,
  eventConversationState,
  normalizeConversationState,
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

test('event follow-ups answer only from authoritative fields', () => {
  assert.match(answerGroundedEventFollowUp('Are you sure that is the right location?', event), /Greenacres Bowl/)
  assert.match(answerGroundedEventFollowUp("What's the address?", event), /6126 Lake Worth Rd/)
  assert.doesNotMatch(answerGroundedEventFollowUp('Prep me for it', event), /FunZone|superhero|party favors/i)
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
  assert.equal(secureAssistantResult({ type: 'tool_action', tool: 'update_event' }).type, 'tool_action')
  assert.equal(
    secureAssistantResult({ type: 'text', text: 'Confirmed—I created it.', write_verified: true }, { userRequestedWrite: true }).safety_rejection,
    undefined,
  )
})

test('turn-taking holds incomplete clauses but preserves short commands', () => {
  for (const text of ["yes that's the", "what's the", "don't", 'can you']) {
    assert.equal(isIncompleteVoiceFragment(text), true, text)
  }
  for (const text of ['yes', 'cancel', "what's the address", 'conversation']) {
    assert.equal(isIncompleteVoiceFragment(text), false, text)
  }
})
