import {
  AGENT_TOOL_DEFINITIONS,
  getAgentToolByGeminiName,
  toGeminiFunctionDeclaration,
} from './assistant-agent-tools.mjs'

export const AGENT_SHADOW_VERSION = 'agent-shadow-v1'
const READ_ROUTE_FUNCTION = 'assistant_read_request'
const WRITE_ROUTE_FUNCTION = 'assistant_write_request'
const ADD_ROUTE_FUNCTION = 'assistant_add_request'
const WRITE_DEFER_FUNCTION = 'assistant_write_defer'
const CALENDAR_TURN_FUNCTION = 'calendar_interpret_turn'
const SEMANTIC_WRITE_FUNCTION = 'assistant_interpret_write'
const PROPOSAL_WRITE_TOOLS = new Set([
  'calendar.create',
  'calendar.update',
  'grocery.add_items',
  'grocery.update_item',
])

export function buildAgentShadowRequest(input) {
  const messages = normalizeMessages(input?.messages)
  if (messages.length === 0) throw new Error('At least one conversation message is required')
  const context = normalizeContext(input?.context)
  const authoritativeReadMode = input?.plannerMode === 'authoritative_read'
  const additiveWriteMode = input?.plannerMode === 'additive_write'
  const pendingToolName = typeof context.pendingAction?.toolName === 'string'
    ? context.pendingAction.toolName
    : null
  const conflictCheckComplete = context.completedToolCalls.some((call) =>
    call?.toolName === 'calendar.check_conflicts' &&
    call?.result?.count === 0
  )
  const declarations = authoritativeReadMode
    ? [buildReadRouteDeclaration()]
    : additiveWriteMode
      ? [buildSemanticWriteDeclaration()]
    : AGENT_TOOL_DEFINITIONS
        .filter((tool) => !pendingToolName || tool.effect === 'read' || tool.name === pendingToolName)
        .filter((tool) => !(conflictCheckComplete && tool.name === 'calendar.check_conflicts'))
        .map(toGeminiFunctionDeclaration)
  return {
    system_instruction: {
      parts: [{
        text: buildAgentShadowInstruction(context, authoritativeReadMode, additiveWriteMode),
      }],
    },
    contents: messages.map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    })),
    generation_config: {
      temperature: 0.1,
      max_output_tokens: 512,
      thinking_config: {
        thinking_budget: 0,
      },
    },
    tools: [{ function_declarations: declarations }],
    tool_config: {
      function_calling_config: { mode: authoritativeReadMode || additiveWriteMode ? 'ANY' : 'AUTO' },
    },
  }
}

export function parseAgentShadowResponse(payload) {
  const candidate = payload?.candidates?.[0]
  const parts = candidate?.content?.parts
  if (!Array.isArray(parts)) {
    return {
      kind: 'error',
      code: 'missing_candidate',
      finishReason: candidate?.finishReason ?? null,
    }
  }
  const functionCall = parts.find((part) => part?.functionCall)?.functionCall
  if (functionCall) {
    if (functionCall.name === SEMANTIC_WRITE_FUNCTION) {
      const args = functionCall.args && typeof functionCall.args === 'object'
        ? functionCall.args
        : {}
      if (
        args.requested_domain === 'calendar' &&
        ['create', 'revise', 'update', 'delete', 'complete'].includes(args.requested_outcome) &&
        args.calendar_turn &&
        typeof args.calendar_turn === 'object'
      ) {
        return {
          kind: 'calendar_semantic',
          turn: {
            version: 'calendar-semantic-turn-v1',
            action: args.requested_outcome,
            ...(typeof args.calendar_turn.target_entity_id === 'string'
              ? { targetEntityId: args.calendar_turn.target_entity_id }
              : {}),
            ...(Array.isArray(args.calendar_turn.candidate_entity_ids)
              ? { candidateEntityIds: args.calendar_turn.candidate_entity_ids }
              : {}),
            ...(args.calendar_turn.target && typeof args.calendar_turn.target === 'object'
              ? { target: normalizeCalendarSemanticPatch(args.calendar_turn.target) }
              : {}),
            patch: normalizeCalendarSemanticPatch(args.calendar_turn.patch),
          },
        }
      }
      if (args.requested_domain === 'grocery') {
        const tool = getAgentToolByGeminiName(
          String(args.grocery_tool_name ?? '').replace('.', '_'),
        )
        if (['grocery.add_items', 'grocery.update_item', 'grocery.remove_item'].includes(tool?.name)) {
          return {
            kind: 'tool',
            toolName: tool.name,
            args: sanitizeToolArgs(tool, args.grocery_tool_args),
          }
        }
      }
      return {
        kind: 'defer',
        reason: ['read', 'compound', 'unsupported'].includes(args.requested_outcome)
          ? args.requested_outcome
          : 'unsupported',
      }
    }
    if (functionCall.name === CALENDAR_TURN_FUNCTION) {
      const args = functionCall.args && typeof functionCall.args === 'object'
        ? functionCall.args
        : {}
      return {
        kind: 'calendar_semantic',
        turn: {
          version: 'calendar-semantic-turn-v1',
          action: args.action,
          ...(typeof args.target_entity_id === 'string'
            ? { targetEntityId: args.target_entity_id }
            : {}),
          ...(Array.isArray(args.candidate_entity_ids)
            ? { candidateEntityIds: args.candidate_entity_ids }
            : {}),
          ...(args.target && typeof args.target === 'object'
            ? { target: normalizeCalendarSemanticPatch(args.target) }
            : {}),
          patch: normalizeCalendarSemanticPatch(args.patch),
        },
      }

    }
    if (functionCall.name === WRITE_DEFER_FUNCTION) {
      const candidateEntityIds = Array.isArray(functionCall.args?.candidate_entity_ids)
        ? functionCall.args.candidate_entity_ids.filter((id) => typeof id === 'string').slice(0, 6)
        : []
      return {
        kind: 'defer',
        reason: typeof functionCall.args?.reason === 'string'
          ? functionCall.args.reason
          : 'unsupported_write',
        ...(candidateEntityIds.length > 0 ? { candidateEntityIds } : {}),
      }
    }
    if (functionCall.name === ADD_ROUTE_FUNCTION) {
      const tool = getAgentToolByGeminiName(
        String(functionCall.args?.tool_name ?? '').replace('.', '_'),
      )
      if (!['calendar.create', 'grocery.add_items'].includes(tool?.name)) {
        return { kind: 'error', code: 'invalid_add_route' }
      }
      return {
        kind: 'tool',
        toolName: tool.name,
        args: functionCall.args?.tool_args && typeof functionCall.args.tool_args === 'object'
          ? functionCall.args.tool_args
          : {},
      }
    }
    if (functionCall.name === READ_ROUTE_FUNCTION) {
      const requestedEffect = functionCall.args?.requested_effect
      const tool = getAgentToolByGeminiName(
        String(functionCall.args?.tool_name ?? '').replace('.', '_'),
      )
      if (requestedEffect !== 'read' || tool?.effect !== 'read') {
        return {
          kind: 'defer',
          reason: requestedEffect === 'mutation' ? 'mutation' : 'unsupported_domain',
        }
      }
      return {
        kind: 'tool',
        toolName: tool.name,
        args: functionCall.args?.tool_args && typeof functionCall.args.tool_args === 'object'
          ? functionCall.args.tool_args
          : {},
        responsePlan: {
          userGoal: typeof functionCall.args?.user_goal === 'string'
            ? functionCall.args.user_goal.slice(0, 240)
            : null,
          helpfulEntityIds: Array.isArray(functionCall.args?.helpful_entity_ids)
            ? functionCall.args.helpful_entity_ids.filter((id) => typeof id === 'string').slice(0, 8)
            : [],
        },
      }
    }
    if (functionCall.name === WRITE_ROUTE_FUNCTION) {
      const requestedEffect = functionCall.args?.requested_effect
      const tool = getAgentToolByGeminiName(
          String(functionCall.args?.tool_name ?? '').replace('.', '_'),
      )
      const validPair = requestedEffect === 'additive_write'
          ? ['calendar.create', 'grocery.add_items'].includes(tool?.name)
          : requestedEffect === 'exact_update'
            ? ['calendar.update', 'grocery.update_item'].includes(tool?.name)
            : false
      if (!validPair) {
          return {
            kind: 'defer',
            reason: requestedEffect === 'other_write' ? 'unsupported_write' : requestedEffect ?? 'unsupported_domain',
          }
      }
      return {
          kind: 'tool',
          toolName: tool.name,
          args: functionCall.args?.tool_args && typeof functionCall.args.tool_args === 'object'
            ? functionCall.args.tool_args
            : {},
      }
    }
    const definition = getAgentToolByGeminiName(functionCall.name)
    if (!definition) {
      return {
        kind: 'error',
        code: 'unknown_function',
        providerFunctionName: functionCall.name ?? null,
      }
    }
    return {
      kind: 'tool',
      toolName: definition.name,
      args: functionCall.args && typeof functionCall.args === 'object'
        ? functionCall.args
        : {},
    }
  }
  const text = parts
    .flatMap((part) => typeof part?.text === 'string' && part.text.trim() ? [part.text.trim()] : [])
    .join('\n')
  return text
    ? { kind: 'clarify', text }
    : { kind: 'error', code: 'empty_response', finishReason: candidate?.finishReason ?? null }
}

function normalizeCalendarSemanticPatch(value) {
  if (!value || typeof value !== 'object') return {}
  const patch = Object.fromEntries(
    Object.entries(value).filter(([key]) => [
      'title',
      'date_reference',
      'end_date_reference',
      'duration_minutes',
      'duration_days',
      'shift_days',
      'relative_minutes',
      'members_add',
      'members_remove',
      'location',
      'notes',
      'all_day',
      'event_type',
    ].includes(key)),
  )
  if (value.time && typeof value.time === 'object') {
    const dayPart = value.time.day_part
    const providerPeriod = value.time.period ?? value.time.meridiem
    const period = ['am', 'pm', 'ambiguous'].includes(providerPeriod)
      ? providerPeriod
      : ['afternoon', 'evening', 'night'].includes(dayPart)
        ? 'pm'
        : dayPart === 'morning'
          ? 'am'
          : 'ambiguous'
    patch.time = {
      hour: value.time.hour,
      ...(value.time.minute !== undefined ? { minute: value.time.minute } : {}),
      period,
    }

  }
  return patch
}

function sanitizeToolArgs(tool, value) {
  if (!tool?.inputSchema?.properties || !value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return Object.fromEntries(
    Object.keys(tool.inputSchema.properties)
      .filter((key) => key in value)
      .map((key) => [key, value[key]]),
  )
}

export function shouldRetryAgentShadowPlan(plan, request) {
  if (request?.tool_config?.function_calling_config?.mode !== 'ANY') return false
  if (plan?.kind !== 'error') return false
  if (!['missing_candidate', 'empty_response'].includes(plan.code)) return false
  return [null, undefined, 'STOP', 'MALFORMED_FUNCTION_CALL'].includes(plan.finishReason)
}

export function isAgentPlanAllowedByRequest(plan, request) {
  if (plan?.kind !== 'tool') return true
  const declarations = request?.tools?.[0]?.function_declarations
  if (!Array.isArray(declarations)) return false
  for (const declaration of declarations) {
    if (declaration?.name === SEMANTIC_WRITE_FUNCTION) {
      const toolNames = declaration?.parameters?.properties?.grocery_tool_name?.enum
      if (Array.isArray(toolNames) && toolNames.includes(plan.toolName)) return true
      continue
    }
    if ([READ_ROUTE_FUNCTION, WRITE_ROUTE_FUNCTION, ADD_ROUTE_FUNCTION].includes(declaration?.name)) {
      const toolNames = declaration?.parameters?.properties?.tool_name?.enum
      if (Array.isArray(toolNames) && toolNames.includes(plan.toolName)) return true
      continue
    }
    const definition = getAgentToolByGeminiName(declaration?.name)
    if (definition?.name === plan.toolName) return true
  }
  return false
}

export function agentShadowTelemetry(plan, metadata = {}) {
  return {
    shadow_version: AGENT_SHADOW_VERSION,
    model: metadata.model ?? null,
    plan_kind: plan?.kind ?? 'error',
    plan_code: plan?.kind === 'error' ? plan.code ?? null : null,
    finish_reason: plan?.kind === 'error' ? plan.finishReason ?? null : null,
    tool_name: plan?.kind === 'tool'
      ? plan.toolName
      : plan?.kind === 'calendar_semantic'
        ? 'calendar.interpret_turn'
        : null,
    tool_domain: plan?.kind === 'tool'
      ? plan.toolName.split('.')[0]
      : plan?.kind === 'calendar_semantic'
        ? 'calendar'
        : null,
    tool_effect: metadata.toolEffect ?? null,
    policy_decision: metadata.policyDecision ?? null,
    policy_code: metadata.policyCode ?? null,
    policy_errors: Array.isArray(metadata.policyErrors) ? metadata.policyErrors.slice(0, 8) : [],
    elapsed_ms: metadata.elapsedMs ?? null,
    input_tokens: metadata.inputTokens ?? 0,
    output_tokens: metadata.outputTokens ?? 0,
    total_tokens: metadata.totalTokens ?? 0,
    provider_calls: metadata.providerCalls ?? 1,
    message_count: metadata.messageCount ?? 0,
    user_text_hash: metadata.userTextHash ?? null,
  }
}

function buildAgentShadowInstruction(context, authoritativeReadMode, additiveWriteMode) {
  return `You are Casa's bounded conversation planner. Interpret natural household requests and choose capabilities.

You may understand any natural wording, corrections, pronouns, and follow-up turns. Do not depend on exact phrases.

PLANNING RULES:
- Return one function call when a Casa calendar, grocery, or cooking tool is needed.
- Return a short clarification question only when a required detail or exact target is genuinely ambiguous.
- Never claim an action executed. This is shadow planning only.
- Read tools may inspect authoritative data. Mutation tools only propose arguments.
- For updates/deletes, use exact IDs and versions from AUTHORITATIVE ENTITIES.
- If a PENDING ACTION exists and the user corrects it, call the same capability with revised arguments rather than creating a second action.
- Treat the latest user turn as authoritative when it corrects earlier details.
- Do not invent people, IDs, dates, times, quantities, or event facts.
- For calendar.create, keep relationship or contact phrases in the title, such as "Dinner with Mom". Set members only when the user assigns the event to a person whose name exactly matches FAMILY. Never turn Mom, Dad, Grandma, or another relationship word into a member unless that exact word is listed in FAMILY.
${authoritativeReadMode ? `
AUTHORITATIVE READ MODE:
- Decide whether the user's requested outcome is purely read-only.
- Call assistant_read_request exactly once and always set requested_effect first.
- Set requested_effect to mutation for every request whose ultimate outcome would create, add, update, move, check off, clear, remove, or delete data.
- Classify the ultimate requested outcome, not the first tool step: a mutation remains mutation even when a read would first locate or validate its target.
- Never substitute a read result for a requested mutation or confirmation flow.
- Set requested_effect to unsupported for unsupported domains or when a safe read cannot be selected.
- Only when requested_effect is read, select one read tool and supply its arguments.
- Reason from the human's likely goal, not a rigid literal cutoff. Use the authoritative entities to notice nearby or related facts that would materially help.
- Keep the direct answer first. Put optional context second and only select helpful_entity_ids that are genuinely useful now.
- Calendar requests for part of a day may benefit from later same-day events, conflicts, travel, or transitions. Grocery item requests may benefit from duplicate, quantity, checked-state, or closely related list context.
- Never select an entity merely to be chatty. Never invent an ID or fact.
` : ''}
${additiveWriteMode ? `
BOUNDED WRITE MODE:
- Call assistant_interpret_write exactly once. First classify the requested domain and outcome, then fill only that domain's semantic payload.
- For every calendar create, pending correction, update, delete, or reminder completion, set requested_domain=calendar and provide calendar_turn. Describe only the semantic change the user expressed.
- Reminders are non-blocking nudges, not appointments. For "remind me", task, to-do, or nudge requests, set patch.event_type=reminder. Never request a conflict check for a reminder.
- For relative reminders such as "in 20 minutes", set patch.relative_minutes to the exact positive minute count. Casa resolves the timestamp from CURRENT LOCAL DATE/TIME.
- For a date-only reminder with no clock time, set patch.all_day=true.
- Use action complete only when the person marks one exact authoritative reminder done. Never use complete for an appointment.
- Calendar update and delete proposals always require explicit confirmation; never claim they already happened.
- Never calculate or emit calendar timestamps. Extract date references, clock components, duration, member changes, and authoritative target identity; Casa resolves the final range deterministically.
- Use action revise when the user corrects a pending calendar create. Omitted patch fields mean preserve the pending value.
- Resolve conversational identity clarifications against FAMILY. When the user explains that a relationship label refers to an exact family member (for example, that Mom is Kelly), include that exact family name in members_add while preserving the pending title and every unrelated field.
- Every spoken clock time must include period=am, period=pm, or period=ambiguous. Use ordinary human context such as breakfast, school morning, lunch, dinner, or tonight when it clearly implies a period. Use ambiguous for a bare follow-up time when the active/pending event context should decide.
- For grocery writes, set requested_domain=grocery and provide one declared grocery capability and its arguments.
- Set requested_domain=other with a reason for reads, compound requests, cooking, or unsupported domains.
- Never convert an update or destructive request into a create/add action.
- Supply only the arguments declared by the selected capability.
- For exact updates, copy the exact ID and version from AUTHORITATIVE ENTITIES.
- Interpret scheduling direction semantically: moving or bumping an event back means later; moving it up means earlier.
- For grocery.update_item, change exactly one dimension: either quantity (with optional unit) or checked=true. Never combine both in one proposal.
- An ACTIVE ENTITY grocery_item is an exact authoritative target. Requests such as changing "it/that" to a quantity or checking "it/that" off MUST call grocery.update_item with that entity's exact ID and version.
- A named grocery item is also exact when AUTHORITATIVE ENTITIES contains only one item with that name.
- Do not classify an exact quantity change or exact check-off as other_write. other_write is only for unsupported mutations or missing/ambiguous targets.
- If multiple grocery items could match and ACTIVE ENTITY does not identify one exact item, call assistant_write_defer with reason ambiguous.
- Before any grocery update, compare every authoritative grocery item. When two or more share the requested name and ACTIVE ENTITY does not identify one of them, you MUST defer as ambiguous; never choose the first row.
- For calendar updates and deletes, always provide target with the title/date/time clues the person used. Select target_entity_id only for one exact target from AUTHORITATIVE ENTITIES. If multiple remain plausible, preserve the requested semantic patch, put every plausible ID in candidate_entity_ids, and omit target_entity_id so Casa can deterministically narrow the choices or ask without losing the requested change.
- For an all-day range such as "Friday through Monday", put Friday in patch.date_reference and the inclusive Monday in patch.end_date_reference. Do not convert the range to one date or ask for a time.
- For "move the whole trip one week later" or similar shifts of an existing event, set patch.shift_days to the signed calendar-day offset and omit replacement dates so Casa preserves the complete duration.
- Normalize obvious speech-to-text spelling into the intended common calendar title or grocery item name without adding unstated items.
- Do not invent missing titles, items, people, dates, times, quantities, or locations.
` : ''}

CURRENT LOCAL DATE/TIME: ${context.currentDate}
UTC OFFSET: ${context.utcOffset}
SURFACE: ${context.page}
ASSISTANT MODE: ${context.assistantMode}
FAMILY: ${context.family.join(', ') || 'not supplied'}
AUTHORITATIVE ENTITIES: ${JSON.stringify(context.authoritativeEntities)}
ACTIVE ENTITY: ${JSON.stringify(context.activeEntity)}
PENDING ACTION: ${JSON.stringify(context.pendingAction)}
COMPLETED TOOL CALLS: ${JSON.stringify(context.completedToolCalls)}

STATE RULES:
- ACTIVE ENTITY is the exact target of pronouns such as "it", "that", and "that one" unless the user switches targets.
- For a question about the dates, duration, location, or details of ACTIVE ENTITY, call calendar.get_event with its exact ID. Never call calendar.get_range with an event ID.
- If AUTHORITATIVE ENTITIES contains exactly one matching target, use its exact ID and version without searching again.
- If multiple authoritative entities plausibly match a destructive request, ask which one; never choose.
- PENDING ACTION is a proposal, not a stored entity. A correction to it MUST call the same pending capability with revised arguments. For example, revise calendar.create with calendar.create, never calendar.update.
- COMPLETED TOOL CALLS contain authoritative results already gathered during this turn. Continue the original user goal without repeating those reads.
- A completed calendar.check_conflicts result with count 0 means the proposed time is clear; proceed to calendar.create or calendar.update and never check the same range again.
- When that completed conflict result has count 0, calling calendar.check_conflicts again is forbidden and the function is no longer available. Continue to the requested calendar write.
`
}

function buildReadRouteDeclaration() {
  const readTools = AGENT_TOOL_DEFINITIONS.filter((tool) => tool.effect === 'read')
  const toolArgProperties = Object.assign(
    {},
    ...readTools.map((tool) => tool.inputSchema.properties ?? {}),
  )
  return toGeminiFunctionDeclaration({
    name: 'assistant.read_request',
    description: 'Classify the ultimate requested effect, then optionally select one authoritative read.',
    effect: 'read',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        requested_effect: {
          type: 'string',
          enum: ['read', 'mutation', 'unsupported'],
          description: 'The effect of the user outcome, regardless of prerequisite lookup steps.',
        },
        tool_name: {
          type: 'string',
          enum: readTools.map((tool) => tool.name),
          description: 'Required only when requested_effect is read.',
        },
        tool_args: {
          type: 'object',
          additionalProperties: false,
          properties: toolArgProperties,
          description: 'Arguments for tool_name when requested_effect is read.',
        },
        user_goal: {
          type: 'string',
          description: 'A concise statement of what the person is practically trying to learn or accomplish.',
        },
        helpful_entity_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional authoritative entity IDs worth mentioning after the direct answer because they are materially helpful.',
        },
      },
      required: ['requested_effect'],
    },
  })
}

function buildWriteDeferDeclaration() {
  return toGeminiFunctionDeclaration({
    name: 'assistant.write_defer',
    description: 'Safely defer a request that is not one supported bounded write.',
    effect: 'write',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        reason: {
          type: 'string',
          enum: ['read', 'destructive', 'ambiguous', 'compound', 'unsupported'],
          description: 'Why no bounded write capability can be proposed safely.',
        },
        candidate_entity_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'For ambiguous exact-target requests, the authoritative IDs of the plausible records Casa should offer to the user.',
        },
      },
      required: ['reason'],
    },
  })
}

function buildAddRouteDeclaration() {
  const additiveTools = AGENT_TOOL_DEFINITIONS.filter((tool) =>
    tool.name === 'grocery.add_items'
  )
  const toolArgProperties = Object.assign(
    {},
    ...additiveTools.map((tool) => tool.inputSchema.properties ?? {}),
  )
  return toGeminiFunctionDeclaration({
    name: 'assistant.add_request',
    description: 'Propose one additive grocery operation.',
    effect: 'write',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        tool_name: {
          type: 'string',
          enum: additiveTools.map((tool) => tool.name),
          description: 'The one additive capability to propose.',
        },
        tool_args: {
          type: 'object',
          additionalProperties: false,
          properties: toolArgProperties,
          description: 'Arguments for the selected additive capability.',
        },
      },
      required: ['tool_name', 'tool_args'],
    },
  })
}

function buildCalendarTurnDeclaration() {
  return toGeminiFunctionDeclaration({
    name: 'calendar.interpret_turn',
    description: 'Interpret a calendar mutation as a semantic delta. Casa resolves authoritative identity and local timestamps.',
    effect: 'write',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'revise', 'update', 'delete', 'complete'],
          description: 'Create, revise, update, delete, or complete one exact reminder.',
        },
        target_entity_id: {
          type: 'string',
          description: 'Exact authoritative event ID for an unambiguous update/delete. Omit for create/revise or ambiguity.',
        },
        candidate_entity_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Plausible authoritative event IDs when an update/delete target is ambiguous.',
        },
        target: {
          type: 'object',
          additionalProperties: false,
          properties: {
            title: { type: 'string' },
            date_reference: {
              type: 'object',
              additionalProperties: false,
              properties: {
                kind: {
                  type: 'string',
                  enum: ['absolute', 'weekday', 'today', 'tomorrow', 'day_after_tomorrow', 'relative_days'],
                },
                year: { type: 'number' },
                month: { type: 'number' },
                day: { type: 'number' },
                weekday: { type: 'string', enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] },
                offset_days: { type: 'number' },
              },
              required: ['kind'],
            },
            end_date_reference: {
              type: 'object',
              additionalProperties: false,
              description: 'Inclusive final calendar date when the person gives a multi-day range such as Friday through Monday.',
              properties: {
                kind: {
                  type: 'string',
                  enum: ['absolute', 'weekday', 'today', 'tomorrow', 'day_after_tomorrow', 'relative_days'],
                },
                year: { type: 'number' },
                month: { type: 'number' },
                day: { type: 'number' },
                weekday: { type: 'string', enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] },
                offset_days: { type: 'number' },
              },
              required: ['kind'],
            },
            time: {
              type: 'object',
              additionalProperties: false,
              properties: {
                hour: { type: 'number' },
                minute: { type: 'number' },
                period: { type: 'string', enum: ['am', 'pm', 'ambiguous'] },
              },
              required: ['hour', 'period'],
            },
          },
        },
        patch: {
          type: 'object',
          additionalProperties: false,
          properties: {
            title: { type: 'string', description: 'Explicit replacement or new title.' },
            date_reference: {
              type: 'object',
              additionalProperties: false,
              properties: {
                kind: {
                  type: 'string',
                  enum: ['absolute', 'weekday', 'today', 'tomorrow', 'day_after_tomorrow', 'relative_days'],
                },
                year: { type: 'number' },
                month: { type: 'number' },
                day: { type: 'number' },
                weekday: { type: 'string', enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] },
                offset_days: { type: 'number' },
              },
              required: ['kind'],
            },
            time: {
              type: 'object',
              additionalProperties: false,
              properties: {
                hour: { type: 'number', description: 'Spoken clock hour.' },
                minute: { type: 'number' },
                period: {
                  type: 'string',
                  enum: ['am', 'pm', 'ambiguous'],
                  description: 'Human-context interpretation of the spoken clock period. Use ambiguous when context does not establish AM or PM.',
                },
              },
              required: ['hour', 'period'],
            },
            duration_minutes: { type: 'number', description: 'Only when the user explicitly gives or changes duration.' },
            duration_days: { type: 'number', description: 'Inclusive calendar-day count for an all-day event, only when explicitly given or clearly requested.' },
            shift_days: { type: 'number', description: 'Signed number of calendar days to move the entire existing event range while preserving its duration.' },
            relative_minutes: { type: 'number', description: 'Positive minutes from now for a relative reminder such as "in 20 minutes".' },
            members_add: { type: 'array', items: { type: 'string' } },
            members_remove: { type: 'array', items: { type: 'string' } },
            location: { type: 'string' },
            notes: { type: 'string' },
            all_day: { type: 'boolean' },
            event_type: { type: 'string', enum: ['event', 'reminder'] },
          },
        },
      },
      required: ['action', 'patch'],
    },
  })
}

function buildSemanticWriteDeclaration() {
  const groceryTools = AGENT_TOOL_DEFINITIONS.filter((tool) =>
    ['grocery.add_items', 'grocery.update_item', 'grocery.remove_item'].includes(tool.name)
  )
  const groceryArgProperties = Object.assign(
    {},
    ...groceryTools.map((tool) => tool.inputSchema.properties ?? {}),
  )
  const calendarSchema = buildCalendarTurnDeclaration().parameters
  return toGeminiFunctionDeclaration({
    name: 'assistant.interpret_write',
    description: 'Interpret one requested outcome into a semantic calendar turn, bounded grocery proposal, or explicit deferral.',
    effect: 'write',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        requested_domain: {
          type: 'string',
          enum: ['calendar', 'grocery', 'other'],
        },
        requested_outcome: {
          type: 'string',
          enum: ['create', 'revise', 'update', 'delete', 'complete', 'add_items', 'update_item', 'remove_item', 'read', 'compound', 'unsupported'],
        },
        calendar_turn: calendarSchema,
        grocery_tool_name: {
          type: 'string',
          enum: groceryTools.map((tool) => tool.name),
        },
        grocery_tool_args: {
          type: 'object',
          additionalProperties: false,
          properties: groceryArgProperties,
        },
        reason: {
          type: 'string',
          description: 'Short reason when the requested domain is other.',
        },
      },
      required: ['requested_domain', 'requested_outcome'],
    },
  })
}

function normalizeMessages(value) {
  if (!Array.isArray(value)) return []
  return value
    .slice(-12)
    .flatMap((message) => {
      const role = message?.role === 'assistant' ? 'assistant' : message?.role === 'user' ? 'user' : null
      const content = typeof message?.content === 'string'
        ? message.content.replace(/\s+/g, ' ').trim().slice(0, 1800)
        : ''
      return role && content ? [{ role, content }] : []
    })
}

function normalizeContext(value) {
  const context = value && typeof value === 'object' ? value : {}
  return {
    currentDate: typeof context.currentDate === 'string' ? context.currentDate.slice(0, 160) : new Date().toISOString(),
    utcOffset: typeof context.utcOffset === 'string' ? context.utcOffset.slice(0, 12) : '+00:00',
    page: typeof context.page === 'string' ? context.page.slice(0, 40) : 'unknown',
    assistantMode: context.assistant_mode === 'chef' ? 'chef' : 'general',
    family: Array.isArray(context.family)
      ? context.family.flatMap((member) => typeof member?.name === 'string' ? [member.name.slice(0, 80)] : []).slice(0, 20)
      : [],
    authoritativeEntities: Array.isArray(context.authoritativeEntities)
      ? context.authoritativeEntities.slice(0, 30)
      : [],
    activeEntity: context.activeEntity && typeof context.activeEntity === 'object'
      ? context.activeEntity
      : null,
    pendingAction: context.pendingAction && typeof context.pendingAction === 'object'
      ? context.pendingAction
      : null,
    completedToolCalls: Array.isArray(context.completedToolCalls)
      ? context.completedToolCalls.slice(0, 2)
      : [],
  }
}
