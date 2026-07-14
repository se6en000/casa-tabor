import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createAgentConversationState,
  normalizeAgentConversationState,
  reduceAgentConversationState,
} from '../supabase/functions/_shared/assistant-agent-state.mjs'

const at = (minute) => ({ now: new Date(`2026-07-14T11:${String(minute).padStart(2, '0')}:00.000Z`) })

function transition(state, value, minute) {
  return reduceAgentConversationState(
    state,
    { ...value, expectedRevision: state.revision },
    at(minute),
  )
}

test('pending calendar creates are revised in place and complete only from verified results', () => {
  let state = createAgentConversationState(at(0))
  state = transition(state, {
    type: 'propose_action',
    actionId: 'action-1',
    toolName: 'calendar.create',
    args: { title: 'Swim practice', start: 'Friday 4 PM' },
    confirmation: 'required',
  }, 1)
  state = transition(state, {
    type: 'revise_action',
    actionId: 'action-1',
    args: { title: 'Swim practice', start: 'Saturday 10 AM' },
  }, 2)

  assert.equal(state.pendingAction.actionId, 'action-1')
  assert.equal(state.pendingAction.args.start, 'Saturday 10 AM')
  assert.equal(state.lastVerifiedResult, null)

  state = transition(state, { type: 'start_execution', actionId: 'action-1' }, 3)
  assert.throws(
    () => transition(state, {
      type: 'complete_execution',
      actionId: 'action-1',
      result: { verified: false },
    }, 4),
    /verified executor result/,
  )

  state = transition(state, {
    type: 'complete_execution',
    actionId: 'action-1',
    result: { verified: true, eventId: 'event-1' },
    entity: { type: 'event', id: 'event-1', version: 'updated-1' },
  }, 4)
  assert.equal(state.pendingAction, null)
  assert.equal(state.activeEntity.id, 'event-1')
  assert.equal(state.lastActionOutcome.status, 'succeeded')
})

test('switching conversation context supersedes stale confirmation cards', () => {
  let state = createAgentConversationState(at(0))
  state = transition(state, {
    type: 'propose_action',
    actionId: 'delete-1',
    toolName: 'calendar.delete',
    args: { id: 'event-1' },
    confirmation: 'required',
  }, 1)
  state = transition(state, {
    type: 'switch_context',
    entity: { type: 'grocery_item', id: 'item-1' },
  }, 2)

  assert.equal(state.pendingAction, null)
  assert.equal(state.activeEntity.type, 'grocery_item')
  assert.equal(state.lastActionOutcome.status, 'superseded')
})

test('state revisions reject stale updates from any client channel', () => {
  const initial = createAgentConversationState(at(0))
  const focused = transition(initial, {
    type: 'focus_entity',
    entity: { type: 'event', id: 'event-1', version: 'v1' },
  }, 1)

  assert.throws(
    () => reduceAgentConversationState(focused, {
      type: 'clear_entity',
      expectedRevision: 0,
    }, at(2)),
    /Stale agent state revision/,
  )
})

test('Pi, mobile, and web produce identical state from the same transitions', () => {
  const events = [
    {
      type: 'ask_clarification',
      questionId: 'which-dentist',
      slot: 'event_id',
      options: ['event-1', 'event-2'],
    },
    { type: 'clear_clarification' },
    {
      type: 'focus_entity',
      entity: { type: 'event', id: 'event-2', version: 'v2' },
    },
  ]
  const reduceForChannel = () => events.reduce(
    (state, event, index) => transition(state, event, index + 1),
    createAgentConversationState(at(0)),
  )

  assert.deepEqual(reduceForChannel(), reduceForChannel())
  assert.deepEqual(reduceForChannel(), reduceForChannel())
})

test('normalization rejects malformed or unknown state versions', () => {
  assert.equal(normalizeAgentConversationState(null), null)
  assert.equal(normalizeAgentConversationState({ version: 'future', revision: 0 }), null)
  assert.equal(normalizeAgentConversationState({
    ...createAgentConversationState(at(0)),
    pendingAction: { actionId: 'x', toolName: 'bad', args: {}, confirmation: 'required', status: 'pending' },
  }), null)
})
