import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildPriorConversationEvidence,
  requestsPriorConversationContext,
} from '../supabase/functions/_shared/talk-plan-continuity.mjs'
import {
  isPlanningProposalAcceptance,
  planningProposalConversationState,
} from '../supabase/functions/_shared/talk-plan-proposal-state.mjs'

test('prior-conversation retrieval recognizes conceptual history requests', () => {
  for (const text of [
    'Review my latest conversation with Alexa.',
    'What did we decide before?',
    'Pick up where we left off on the anniversary trip.',
    'Use our earlier discussion to help with this.',
  ]) {
    assert.equal(requestsPriorConversationContext(text), true, text)
  }
  assert.equal(requestsPriorConversationContext('What is on the calendar today?'), false)
})

test('prior-conversation evidence is bounded and excludes the active conversation', () => {
  const evidence = buildPriorConversationEvidence({
    activeConversationId: 'current',
    conversations: [
      { id: 'current', title: 'Current', updated_at: '2026-08-12T12:00:00Z' },
      { id: 'prior-1', title: 'Anniversary plan', updated_at: '2026-08-12T11:00:00Z' },
      { id: 'prior-2', title: 'Frame project', updated_at: '2026-08-11T11:00:00Z' },
      { id: 'prior-3', title: 'Older', updated_at: '2026-08-10T11:00:00Z' },
      { id: 'prior-4', title: 'Too old for packet', updated_at: '2026-08-09T11:00:00Z' },
    ],
    messages: [
      { conversation_id: 'prior-1', role: 'user', content: 'Book Bimini for our anniversary.' },
      { conversation_id: 'prior-1', role: 'assistant', content: 'We narrowed it to two weekends.' },
      { conversation_id: 'prior-2', role: 'user', content: 'Finish the Casa frame.' },
      { conversation_id: 'current', role: 'user', content: 'Do not duplicate this active chat.' },
    ],
  })

  assert.deepEqual(evidence.map((item) => item.source_id), ['prior-1', 'prior-2', 'prior-3'])
  assert.match(evidence[0].excerpt, /Bimini/)
  assert.doesNotMatch(JSON.stringify(evidence), /duplicate this active chat/)
})

test('planning proposals persist bounded actionable text and accept natural confirmations', () => {
  const state = planningProposalConversationState(
    'Here is the plan:\n1. Block flights Friday at 7 PM.\n2. Reserve dinner Saturday at 6 PM.',
    new Date('2026-08-12T12:00:00Z'),
  )
  assert.equal(state?.activeEntityType, 'planning_proposal')
  assert.match(state?.proposalText ?? '', /Reserve dinner/)

  for (const text of ['Yes please', 'Go ahead with that plan', 'Looks good, do it']) {
    assert.equal(isPlanningProposalAcceptance(text), true, text)
  }
  assert.equal(isPlanningProposalAcceptance('What would that cost?'), false)
})
