import assert from 'node:assert/strict'
import test from 'node:test'

import { evaluateAgentToolCall } from '../supabase/functions/_shared/assistant-agent-policy.mjs'
import { createAgentConversationState } from '../supabase/functions/_shared/assistant-agent-state.mjs'

const household = { id: 'household-1', authorized: true }

function evaluate(overrides = {}) {
  return evaluateAgentToolCall({
    toolName: 'calendar.search',
    args: { query: 'dentist' },
    household,
    callIndex: 0,
    retryCount: 0,
    agentState: createAgentConversationState({ now: new Date('2026-07-14T11:00:00Z') }),
    ...overrides,
  })
}

test('read tools execute without confirmation inside strict budgets', () => {
  assert.deepEqual(evaluate(), {
    allowed: true,
    decision: 'execute',
    code: 'policy_approved',
    toolName: 'calendar.search',
    legacyToolName: 'search_events',
    effect: 'read',
    confirmationRequired: false,
  })
  assert.equal(evaluate({ callIndex: 3 }).code, 'tool_call_budget_exceeded')
  assert.equal(evaluate({ retryCount: 2 }).code, 'planner_retry_budget_exceeded')
})

test('policy rejects unauthorized households and schema drift', () => {
  assert.equal(evaluate({ household: { id: 'household-1', authorized: false } }).code, 'unauthorized_household')
  const invalid = evaluate({ args: { query: 'dentist', invented_field: true } })
  assert.equal(invalid.code, 'invalid_tool_arguments')
  assert.deepEqual(invalid.errors, ['args.invented_field:unexpected'])
})

test('calendar updates require authoritative exact versions and confirmation', () => {
  const request = {
    toolName: 'calendar.update',
    actionId: 'action-1',
    idempotencyKey: 'turn-1:action-1',
    args: {
      id: 'event-1',
      expected_updated_at: 'v1',
      start: '2026-07-18T14:00:00-04:00',
      end: '2026-07-18T15:00:00-04:00',
    },
    authoritativeEntities: [{ type: 'event', id: 'event-1', version: 'v1' }],
  }
  assert.equal(evaluate(request).decision, 'confirm')
  assert.equal(evaluate({ ...request, confirmedActionId: 'action-1' }).decision, 'execute')
  assert.equal(evaluate({
    ...request,
    authoritativeEntities: [{ type: 'event', id: 'event-1', version: 'v2' }],
  }).code, 'stale_authoritative_target')
})

test('destructive tools never execute without matching confirmation', () => {
  const request = {
    toolName: 'calendar.delete',
    actionId: 'delete-1',
    idempotencyKey: 'turn-1:delete-1',
    args: { id: 'event-1', expected_updated_at: 'v1', title: 'Dentist' },
    authoritativeEntities: [{ type: 'event', id: 'event-1', version: 'v1' }],
  }
  const proposed = evaluate(request)
  assert.equal(proposed.decision, 'confirm')
  assert.equal(proposed.confirmationRequired, true)
  assert.equal(evaluate({ ...request, confirmedActionId: 'wrong' }).decision, 'confirm')
  assert.equal(evaluate({ ...request, confirmedActionId: 'delete-1' }).decision, 'execute')
})

test('write retries are idempotent and pending actions cannot be crossed', () => {
  const base = {
    toolName: 'grocery.add_items',
    actionId: 'add-1',
    idempotencyKey: 'turn-1:add-1',
    args: { items: [{ name: 'milk' }] },
  }
  assert.equal(evaluate(base).decision, 'execute')
  assert.equal(evaluate({ ...base, recentIdempotencyKeys: ['turn-1:add-1'] }).code, 'duplicate_action')

  const state = createAgentConversationState({ now: new Date('2026-07-14T11:00:00Z') })
  state.pendingAction = {
    actionId: 'other-action',
    toolName: 'calendar.delete',
    args: { id: 'event-1' },
    confirmation: 'required',
    status: 'pending',
    proposedAt: '2026-07-14T11:00:00.000Z',
    revisedAt: null,
  }
  assert.equal(evaluate({ ...base, agentState: state }).code, 'different_action_pending')
})

test('calendar safety catches malformed ranges, duplicates, and recurrence scope', () => {
  const create = {
    toolName: 'calendar.create',
    actionId: 'create-1',
    idempotencyKey: 'turn-1:create-1',
    args: {
      title: 'Swim practice',
      start: '2026-07-18T15:00:00-04:00',
      end: '2026-07-18T14:00:00-04:00',
    },
  }
  assert.equal(evaluate(create).code, 'invalid_calendar_duration')
  assert.equal(evaluate({
    ...create,
    args: { ...create.args, end: '2026-07-18T16:00:00-04:00' },
    duplicateCandidates: [{ id: 'event-1' }],
  }).code, 'possible_duplicate')

  assert.equal(evaluate({
    toolName: 'calendar.update',
    actionId: 'update-1',
    idempotencyKey: 'turn-1:update-1',
    args: { id: 'event-1', expected_updated_at: 'v1', title: 'Practice' },
    authoritativeEntities: [{ type: 'event', id: 'event-1', version: 'v1', recurring: true }],
  }).code, 'recurring_scope_unsupported')
})
