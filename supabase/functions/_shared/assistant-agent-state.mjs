export const AGENT_STATE_VERSION = 'agent-state-v1'

const ACTION_STATUSES = new Set(['pending', 'executing'])
const ENTITY_TYPES = new Set(['event', 'grocery_item', 'recipe'])

export function createAgentConversationState(options = {}) {
  return {
    version: AGENT_STATE_VERSION,
    revision: 0,
    activeEntity: null,
    pendingAction: null,
    clarification: null,
    lastVerifiedResult: null,
    lastActionOutcome: null,
    updatedAt: timestamp(options.now),
  }
}

export function normalizeAgentConversationState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  if (value.version !== AGENT_STATE_VERSION) return null
  if (!Number.isSafeInteger(value.revision) || value.revision < 0) return null
  if (value.activeEntity && !validEntity(value.activeEntity)) return null
  if (value.pendingAction && !validPendingAction(value.pendingAction)) return null
  if (value.clarification && !validClarification(value.clarification)) return null
  return {
    version: AGENT_STATE_VERSION,
    revision: value.revision,
    activeEntity: value.activeEntity ? { ...value.activeEntity } : null,
    pendingAction: value.pendingAction
      ? { ...value.pendingAction, args: structuredClone(value.pendingAction.args) }
      : null,
    clarification: value.clarification
      ? { ...value.clarification, options: [...(value.clarification.options ?? [])] }
      : null,
    lastVerifiedResult: value.lastVerifiedResult ? structuredClone(value.lastVerifiedResult) : null,
    lastActionOutcome: value.lastActionOutcome ? { ...value.lastActionOutcome } : null,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : null,
  }
}

export function reduceAgentConversationState(current, transition, options = {}) {
  const state = normalizeAgentConversationState(current)
  if (!state) throw new Error('Invalid agent conversation state')
  if (!transition || typeof transition !== 'object') throw new Error('Invalid agent state transition')
  if (
    transition.expectedRevision !== undefined &&
    transition.expectedRevision !== state.revision
  ) {
    throw new Error(`Stale agent state revision: expected ${transition.expectedRevision}, current ${state.revision}`)
  }

  const next = structuredClone(state)
  const at = timestamp(options.now)

  switch (transition.type) {
    case 'focus_entity': {
      if (!validEntity(transition.entity)) throw new Error('Invalid authoritative entity')
      next.activeEntity = { ...transition.entity }
      break
    }
    case 'clear_entity': {
      next.activeEntity = null
      break
    }
    case 'ask_clarification': {
      const clarification = {
        questionId: transition.questionId,
        slot: transition.slot,
        options: transition.options ?? [],
        askedAt: at,
      }
      if (!validClarification(clarification)) throw new Error('Invalid clarification state')
      next.clarification = clarification
      break
    }
    case 'clear_clarification': {
      next.clarification = null
      break
    }
    case 'propose_action': {
      if (next.pendingAction) throw new Error('A pending action already exists')
      const pendingAction = {
        actionId: transition.actionId,
        toolName: transition.toolName,
        args: structuredClone(transition.args ?? {}),
        confirmation: transition.confirmation,
        status: 'pending',
        proposedAt: at,
        revisedAt: null,
      }
      if (!validPendingAction(pendingAction)) throw new Error('Invalid pending action')
      next.pendingAction = pendingAction
      next.clarification = null
      break
    }
    case 'revise_action': {
      requirePendingAction(next, transition.actionId)
      if (next.pendingAction.status !== 'pending') throw new Error('Executing actions cannot be revised')
      next.pendingAction = {
        ...next.pendingAction,
        args: structuredClone(transition.args ?? {}),
        revisedAt: at,
      }
      break
    }
    case 'cancel_action': {
      requirePendingAction(next, transition.actionId)
      next.lastActionOutcome = {
        actionId: next.pendingAction.actionId,
        toolName: next.pendingAction.toolName,
        status: 'cancelled',
        at,
      }
      next.pendingAction = null
      next.clarification = null
      break
    }
    case 'start_execution': {
      requirePendingAction(next, transition.actionId)
      if (next.pendingAction.status !== 'pending') throw new Error('Action execution already started')
      next.pendingAction.status = 'executing'
      break
    }
    case 'complete_execution': {
      requirePendingAction(next, transition.actionId)
      if (transition.result?.verified !== true) {
        throw new Error('Action completion requires a verified executor result')
      }
      next.lastVerifiedResult = {
        actionId: next.pendingAction.actionId,
        toolName: next.pendingAction.toolName,
        result: structuredClone(transition.result),
        verifiedAt: at,
      }
      next.lastActionOutcome = {
        actionId: next.pendingAction.actionId,
        toolName: next.pendingAction.toolName,
        status: 'succeeded',
        at,
      }
      if (transition.entity) {
        if (!validEntity(transition.entity)) throw new Error('Invalid result entity')
        next.activeEntity = { ...transition.entity }
      }
      next.pendingAction = null
      next.clarification = null
      break
    }
    case 'fail_execution': {
      requirePendingAction(next, transition.actionId)
      next.lastActionOutcome = {
        actionId: next.pendingAction.actionId,
        toolName: next.pendingAction.toolName,
        status: 'failed',
        errorCode: requiredText(transition.errorCode, 'errorCode'),
        at,
      }
      next.pendingAction = null
      break
    }
    case 'switch_context': {
      if (transition.entity !== null && !validEntity(transition.entity)) {
        throw new Error('Invalid context entity')
      }
      if (next.pendingAction) {
        next.lastActionOutcome = {
          actionId: next.pendingAction.actionId,
          toolName: next.pendingAction.toolName,
          status: 'superseded',
          at,
        }
      }
      next.activeEntity = transition.entity ? { ...transition.entity } : null
      next.pendingAction = null
      next.clarification = null
      break
    }
    default:
      throw new Error(`Unsupported agent state transition: ${String(transition.type)}`)
  }

  next.revision += 1
  next.updatedAt = at
  return next
}

function validEntity(entity) {
  return Boolean(
    entity &&
    ENTITY_TYPES.has(entity.type) &&
    typeof entity.id === 'string' &&
    entity.id.trim() &&
    (entity.version === undefined || entity.version === null || typeof entity.version === 'string'),
  )
}

function validPendingAction(action) {
  return Boolean(
    action &&
    typeof action.actionId === 'string' &&
    action.actionId.trim() &&
    typeof action.toolName === 'string' &&
    action.toolName.includes('.') &&
    action.args &&
    typeof action.args === 'object' &&
    !Array.isArray(action.args) &&
    ['none', 'required'].includes(action.confirmation) &&
    ACTION_STATUSES.has(action.status),
  )
}

function validClarification(clarification) {
  return Boolean(
    clarification &&
    typeof clarification.questionId === 'string' &&
    clarification.questionId.trim() &&
    typeof clarification.slot === 'string' &&
    clarification.slot.trim() &&
    Array.isArray(clarification.options) &&
    clarification.options.every((option) => typeof option === 'string'),
  )
}

function requirePendingAction(state, actionId) {
  if (!state.pendingAction) throw new Error('No pending action')
  if (state.pendingAction.actionId !== actionId) throw new Error('Pending action ID mismatch')
}

function requiredText(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`)
  return value.trim()
}

function timestamp(now) {
  const value = now instanceof Date ? now : new Date()
  if (!Number.isFinite(value.getTime())) throw new Error('Invalid state timestamp')
  return value.toISOString()
}
