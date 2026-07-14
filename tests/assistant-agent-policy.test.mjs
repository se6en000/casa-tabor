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

test('policy tolerates provider nulls only for optional tool arguments', () => {
  const optionalNulls = evaluate({
    args: { query: null, start: null, end: null, member_name: null },
  })
  assert.equal(optionalNulls.decision, 'execute')

  const requiredNull = evaluate({
    toolName: 'calendar.get_range',
    args: { start: null, end: '2026-07-17T00:00:00-04:00' },
  })
  assert.equal(requiredNull.code, 'invalid_tool_arguments')
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

test('calendar writes reject family members not present in authoritative context', () => {
  const inventedMember = evaluate({
    toolName: 'calendar.create',
    args: {
      title: 'Family planning meeting',
      start: '2026-07-17T16:00:00-04:00',
      end: '2026-07-17T17:00:00-04:00',
      members: ['Family Planning Meeting'],
    },
    authorizedMemberNames: ['Jake', 'Liv'],
  })

  assert.equal(inventedMember.code, 'unknown_calendar_member')
  assert.deepEqual(inventedMember.unknownMembers, ['Family Planning Meeting'])

  const knownMembers = evaluate({
    toolName: 'calendar.create',
    actionId: 'create-known-members',
    idempotencyKey: 'create-known-members-key',
    args: {
      title: 'Swim practice',
      start: '2026-07-17T16:00:00-04:00',
      end: '2026-07-17T17:00:00-04:00',
      members: ['jake', 'LIV'],
    },
    authorizedMemberNames: ['Jake', 'Liv'],
  })
  assert.equal(knownMembers.decision, 'execute')
})

test('calendar writes reject model timestamps that ignore household UTC offset', () => {
  const wrongOffset = evaluate({
    toolName: 'calendar.create',
    actionId: 'create-wrong-offset',
    idempotencyKey: 'create-wrong-offset-key',
    expectedUtcOffset: '-04:00',
    args: {
      title: 'Dentist appointment',
      start: '2026-07-17T14:00:00.000Z',
      end: '2026-07-17T15:00:00.000Z',
    },
  })
  assert.equal(wrongOffset.code, 'unexpected_calendar_utc_offset')

  const householdOffset = evaluate({
    toolName: 'calendar.create',
    actionId: 'create-correct-offset',
    idempotencyKey: 'create-correct-offset-key',
    expectedUtcOffset: '-04:00',
    args: {
      title: 'Dentist appointment',
      start: '2026-07-17T14:00:00-04:00',
      end: '2026-07-17T15:00:00-04:00',
    },
  })
  assert.equal(householdOffset.decision, 'execute')
})

test('grocery updates require one exact versioned change and confirmation', () => {
  const target = {
    type: 'grocery_item',
    id: 'milk-1',
    version: 'v1',
    name: 'Milk',
    quantity: '1',
    unit: 'gallon',
    checked: false,
  }
  const quantityUpdate = {
    toolName: 'grocery.update_item',
    actionId: 'grocery-update-1',
    idempotencyKey: 'turn-1:grocery-update-1',
    args: {
      id: 'milk-1',
      expected_updated_at: 'v1',
      quantity: '2',
      unit: 'gallons',
    },
    authoritativeEntities: [target],
  }
  assert.equal(evaluate(quantityUpdate).decision, 'confirm')
  assert.equal(evaluate({
    ...quantityUpdate,
    confirmedActionId: 'grocery-update-1',
  }).decision, 'execute')
  assert.equal(evaluate({
    ...quantityUpdate,
    authoritativeEntities: [{ ...target, version: 'v2' }],
  }).code, 'stale_authoritative_target')

  const checkUpdate = evaluate({
    ...quantityUpdate,
    args: {
      id: 'milk-1',
      expected_updated_at: 'v1',
      checked: true,
    },
  })

  test('exact updates reject duplicate labels unless an active entity disambiguates', () => {
    const target = {
      type: 'grocery_item',
      id: 'milk-1',
      version: 'v1',
      name: 'Oat milk',
      quantity: '1',
      checked: false,
    }
    const duplicate = { ...target, id: 'milk-2' }
    const request = {
      toolName: 'grocery.update_item',
      actionId: 'duplicate-update',
      idempotencyKey: 'duplicate-update-key',
      args: {
        id: target.id,
        expected_updated_at: target.version,
        quantity: '2',
      },
      authoritativeEntities: [target, duplicate],
    }
    assert.equal(evaluate(request).code, 'ambiguous_authoritative_target')
    assert.equal(evaluate({
      ...request,
      activeEntity: target,
    }).decision, 'confirm')
  })
  assert.equal(checkUpdate.decision, 'confirm')
})

test('grocery update policy rejects mixed, empty, and no-op changes', () => {
  const target = {
    type: 'grocery_item',
    id: 'milk-1',
    version: 'v1',
    quantity: '1',
    unit: 'gallon',
    checked: false,
  }
  const base = {
    toolName: 'grocery.update_item',
    actionId: 'grocery-update-1',
    idempotencyKey: 'turn-1:grocery-update-1',
    authoritativeEntities: [target],
  }
  assert.equal(evaluate({
    ...base,
    args: { id: 'milk-1', expected_updated_at: 'v1' },
  }).code, 'grocery_update_requires_one_change')
  assert.equal(evaluate({
    ...base,
    args: {
      id: 'milk-1',
      expected_updated_at: 'v1',
      quantity: '2',
      checked: true,
    },
  }).code, 'grocery_update_requires_one_change')
  assert.equal(evaluate({
    ...base,
    args: { id: 'milk-1', expected_updated_at: 'v1', quantity: '   ' },
  }).code, 'invalid_grocery_quantity')
  assert.equal(evaluate({
    ...base,
    args: { id: 'milk-1', expected_updated_at: 'v1', unit: 'gallons' },
  }).code, 'grocery_unit_requires_quantity')
  assert.equal(evaluate({
    ...base,
    args: { id: 'milk-1', expected_updated_at: 'v1', checked: false },
  }).code, 'grocery_update_no_change')
  assert.equal(evaluate({
    ...base,
    args: {
      id: 'milk-1',
      expected_updated_at: 'v1',
      quantity: '1',
      unit: 'gallon',
    },
  }).code, 'grocery_update_no_change')
})
