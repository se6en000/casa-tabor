import { AGENT_EXECUTION_BUDGET } from './assistant-agent-contract.mjs'
import { getAgentTool, legacyToolNameFor } from './assistant-agent-tools.mjs'
import { normalizeAgentConversationState } from './assistant-agent-state.mjs'

const ALWAYS_CONFIRM = new Set([
  'calendar.update',
  'calendar.delete',
  'grocery.update_item',
  'grocery.remove_item',
])

export function evaluateAgentToolCall(request) {
  if (!request || typeof request !== 'object') return reject('invalid_request')
  const tool = getAgentTool(request.toolName)
  if (!tool) return reject('unknown_tool')
  if (
    !request.household ||
    request.household.authorized !== true ||
    typeof request.household.id !== 'string' ||
    !request.household.id.trim()
  ) {
    return reject('unauthorized_household')
  }
  if (
    !Number.isSafeInteger(request.callIndex) ||
    request.callIndex < 0 ||
    request.callIndex >= AGENT_EXECUTION_BUDGET.maxToolCallsPerTurn
  ) {
    return reject('tool_call_budget_exceeded')
  }
  if (
    !Number.isSafeInteger(request.retryCount) ||
    request.retryCount < 0 ||
    request.retryCount > AGENT_EXECUTION_BUDGET.maxPlannerRetries
  ) {
    return reject('planner_retry_budget_exceeded')
  }

  const schemaErrors = validateSchema(tool.inputSchema, request.args, 'args')
  if (schemaErrors.length > 0) {
    return reject('invalid_tool_arguments', { errors: schemaErrors })
  }

  const state = request.agentState === undefined
    ? null
    : normalizeAgentConversationState(request.agentState)
  if (request.agentState !== undefined && !state) return reject('invalid_agent_state')
  if (
    state?.pendingAction &&
    state.pendingAction.actionId !== request.actionId
  ) {
    return reject('different_action_pending')
  }

  const domainDecision = evaluateDomainPolicy(tool, request)
  if (domainDecision) return domainDecision

  if (tool.effect !== 'read') {
    if (typeof request.actionId !== 'string' || !request.actionId.trim()) {
      return reject('action_id_required')
    }
    if (typeof request.idempotencyKey !== 'string' || !request.idempotencyKey.trim()) {
      return reject('idempotency_key_required')
    }
    if (
      Array.isArray(request.recentIdempotencyKeys) &&
      request.recentIdempotencyKeys.includes(request.idempotencyKey)
    ) {
      return reject('duplicate_action')
    }
  }

  const confirmationRequired = tool.effect === 'destructive' || ALWAYS_CONFIRM.has(tool.name)
  if (confirmationRequired && request.confirmedActionId !== request.actionId) {
    return allow('confirm', 'confirmation_required', tool, true)
  }

  return allow('execute', 'policy_approved', tool, confirmationRequired)
}

function evaluateDomainPolicy(tool, request) {
  if (tool.domain === 'calendar') {
    const timeDecision = validateCalendarTimes(request.args, request.expectedUtcOffset)
    if (timeDecision) return timeDecision
    const memberDecision = validateCalendarMembers(tool.name, request.args, request.authorizedMemberNames)
    if (memberDecision) return memberDecision

    if (['calendar.update', 'calendar.delete'].includes(tool.name)) {
      const target = findEntity(request.authoritativeEntities, 'event', request.args.id)
      if (!target) return clarify('authoritative_target_required', tool)
      if (hasAmbiguousLabel(request, 'event', target, 'title')) {
        return clarify('ambiguous_authoritative_target', tool)
      }
      if (
        typeof target.version !== 'string' ||
        target.version !== request.args.expected_updated_at
      ) {
        return reject('stale_authoritative_target')
      }

      if (target.recurring === true) return reject('recurring_scope_unsupported')
    }

    if (
      tool.name === 'calendar.create' &&
      Array.isArray(request.duplicateCandidates) &&
      request.duplicateCandidates.length > 0
    ) {
      return clarify('possible_duplicate', tool)
    }
  }

  if (['grocery.update_item', 'grocery.remove_item'].includes(tool.name)) {
    const target = findEntity(request.authoritativeEntities, 'grocery_item', request.args.id)
    if (!target) return clarify('authoritative_target_required', tool)
    if (hasAmbiguousLabel(request, 'grocery_item', target, 'name')) {
      return clarify('ambiguous_authoritative_target', tool)
    }
    if (tool.name === 'grocery.update_item') {
      if (
        typeof target.version !== 'string' ||
        target.version !== request.args.expected_updated_at
      ) {
        return reject('stale_authoritative_target')
      }
      const updateDecision = validateGroceryUpdate(request.args, target)
      if (updateDecision) return updateDecision
    }
  }

  return null
}

function hasAmbiguousLabel(request, type, target, labelKey) {
  if (request.activeEntity?.type === type && request.activeEntity?.id === target.id) return false
  const label = String(target?.[labelKey] ?? '').trim().toLocaleLowerCase()
  if (!label) return false
  return (request.authoritativeEntities ?? []).filter((entity) =>
    entity?.type === type &&
    String(entity?.[labelKey] ?? '').trim().toLocaleLowerCase() === label
  ).length > 1
}

function validateGroceryUpdate(args, target) {
  const hasQuantity = typeof args.quantity === 'string'
  const hasUnit = typeof args.unit === 'string'
  const hasChecked = typeof args.checked === 'boolean'
  if (hasUnit && !hasQuantity) return reject('grocery_unit_requires_quantity')
  if (hasQuantity === hasChecked) return reject('grocery_update_requires_one_change')
  if (hasQuantity && !args.quantity.trim()) return reject('invalid_grocery_quantity')
  if (hasChecked && target.checked === args.checked) return reject('grocery_update_no_change')
  if (
    hasQuantity &&
    typeof target.quantity === 'string' &&
    target.quantity.trim() === args.quantity.trim() &&
    (!hasUnit || String(target.unit ?? '').trim() === args.unit.trim())
  ) {
    return reject('grocery_update_no_change')
  }
  return null
}

function validateCalendarMembers(toolName, args, authorizedMemberNames) {
  const requestedNames = toolName === 'calendar.create'
    ? args.members
    : toolName === 'calendar.update'
      ? [...(args.members_add ?? []), ...(args.members_remove ?? [])]
      : []
  if (!Array.isArray(requestedNames) || requestedNames.length === 0) return null
  const authorized = new Set(
    (Array.isArray(authorizedMemberNames) ? authorizedMemberNames : [])
      .filter((name) => typeof name === 'string')
      .map((name) => name.trim().toLocaleLowerCase())
      .filter(Boolean),
  )
  const unknown = requestedNames.filter((name) =>
    typeof name !== 'string' || !authorized.has(name.trim().toLocaleLowerCase())
  )
  return unknown.length > 0
    ? reject('unknown_calendar_member', { unknownMembers: unknown })
    : null
}

function validateCalendarTimes(args, expectedUtcOffset) {
  const hasStart = typeof args.start === 'string'
  const hasEnd = typeof args.end === 'string'
  if (!hasStart && !hasEnd) return null
  if (hasStart !== hasEnd) return reject('calendar_time_range_incomplete')
  const start = Date.parse(args.start)
  const end = Date.parse(args.end)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return reject('invalid_calendar_time')
  if (end <= start) return reject('invalid_calendar_duration')
  if (
    typeof expectedUtcOffset === 'string' &&
    expectedUtcOffset.trim() &&
    (!args.start.endsWith(expectedUtcOffset) || !args.end.endsWith(expectedUtcOffset))
  ) {
    return reject('unexpected_calendar_utc_offset')
  }
  return null
}

function validateSchema(schema, value, path) {
  const errors = []
  if (!matchesType(schema.type, value)) return [`${path}:expected_${schema.type}`]
  if (schema.type === 'object') {
    for (const required of schema.required ?? []) {
      if (!(required in value)) errors.push(`${path}.${required}:required`)
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in (schema.properties ?? {}))) errors.push(`${path}.${key}:unexpected`)
      }
    }
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      if (key in value) {
        if (value[key] === null && !(schema.required ?? []).includes(key)) continue
        errors.push(...validateSchema(child, value[key], `${path}.${key}`))
      }
    }
  }
  if (schema.type === 'array') {
    for (const [index, item] of value.entries()) {
      errors.push(...validateSchema(schema.items, item, `${path}[${index}]`))
    }
  }
  return errors
}

function matchesType(type, value) {
  if (type === 'object') return Boolean(value && typeof value === 'object' && !Array.isArray(value))
  if (type === 'array') return Array.isArray(value)
  if (type === 'string') return typeof value === 'string'
  if (type === 'boolean') return typeof value === 'boolean'
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value)
  return false
}

function findEntity(entities, type, id) {
  if (!Array.isArray(entities)) return null
  return entities.find((entity) => entity?.type === type && entity?.id === id) ?? null
}

function allow(decision, code, tool, confirmationRequired) {
  return {
    allowed: true,
    decision,
    code,
    toolName: tool.name,
    legacyToolName: legacyToolNameFor(tool.name),
    effect: tool.effect,
    confirmationRequired,
  }
}

function clarify(code, tool) {
  return {
    allowed: true,
    decision: 'clarify',
    code,
    toolName: tool.name,
    legacyToolName: legacyToolNameFor(tool.name),
    effect: tool.effect,
    confirmationRequired: false,
  }
}

function reject(code, detail = {}) {
  return { allowed: false, decision: 'reject', code, ...detail }
}
