import {
  AGENT_TOOL_DEFINITIONS,
  getAgentToolByGeminiName,
  toGeminiFunctionDeclaration,
} from './assistant-agent-tools.mjs'

export const AGENT_SHADOW_VERSION = 'agent-shadow-v1'
const READ_ROUTE_FUNCTION = 'assistant_read_request'
const WRITE_ROUTE_FUNCTION = 'assistant_write_request'
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
      ? [buildAdditiveWriteRouteDeclaration()]
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

export function isAgentPlanAllowedByRequest(plan, request) {
  if (plan?.kind !== 'tool') return true
  const declarations = request?.tools?.[0]?.function_declarations
  if (!Array.isArray(declarations)) return false
  for (const declaration of declarations) {
    if ([READ_ROUTE_FUNCTION, WRITE_ROUTE_FUNCTION].includes(declaration?.name)) {
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
    tool_name: plan?.kind === 'tool' ? plan.toolName : null,
    tool_domain: plan?.kind === 'tool' ? plan.toolName.split('.')[0] : null,
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
${authoritativeReadMode ? `
AUTHORITATIVE READ MODE:
- Decide whether the user's requested outcome is purely read-only.
- Call assistant_read_request exactly once and always set requested_effect first.
- Set requested_effect to mutation for every request whose ultimate outcome would create, add, update, move, check off, clear, remove, or delete data.
- Classify the ultimate requested outcome, not the first tool step: a mutation remains mutation even when a read would first locate or validate its target.
- Never substitute a read result for a requested mutation or confirmation flow.
- Set requested_effect to unsupported for unsupported domains or when a safe read cannot be selected.
- Only when requested_effect is read, select one read tool and supply its arguments.
` : ''}
${additiveWriteMode ? `
BOUNDED WRITE MODE:
- Call assistant_write_request exactly once and classify the user's ultimate requested outcome.
- Set requested_effect to additive_write only for creating one calendar event or adding explicit grocery items.
- Set requested_effect to exact_update only for changing one exact authoritative non-recurring calendar event, changing one exact grocery quantity, or checking off one exact grocery item.
- Set requested_effect to other_write for grocery removals, clears, multi-item changes, unchecks, or any update without one exact authoritative target.
- Set requested_effect to read for questions that do not change data.
- Set requested_effect to unsupported for cooking actions or any capability outside this rollout.
- Never convert an update or destructive request into a create/add action.
- Only when requested_effect is additive_write, select calendar.create or grocery.add_items and supply grounded arguments.
- Only when requested_effect is exact_update, select calendar.update or grocery.update_item and copy the exact ID and version from AUTHORITATIVE ENTITIES.
- For a calendar move, preserve the authoritative duration and include both replacement start and end.
- Calendar start and end MUST use CURRENT UTC OFFSET exactly; never return Z/UTC timestamps for local household times.
- For grocery.update_item, change exactly one dimension: either quantity (with optional unit) or checked=true. Never combine both in one proposal.
- An ACTIVE ENTITY grocery_item is an exact authoritative target. Requests such as changing "it/that" to a quantity or checking "it/that" off MUST use requested_effect=exact_update and grocery.update_item with that entity's exact ID and version.
- A named grocery item is also exact when AUTHORITATIVE ENTITIES contains only one item with that name.
- Do not classify an exact quantity change or exact check-off as other_write. other_write is only for unsupported mutations or missing/ambiguous targets.
- If multiple events or grocery items could match and ACTIVE ENTITY does not identify one exact entity, classify as other_write so Casa can clarify.
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
      },
      required: ['requested_effect'],
    },
  })
}

function buildAdditiveWriteRouteDeclaration() {
  const additiveTools = AGENT_TOOL_DEFINITIONS.filter((tool) => PROPOSAL_WRITE_TOOLS.has(tool.name))
  const toolArgProperties = Object.assign(
    {},
    ...additiveTools.map((tool) => tool.inputSchema.properties ?? {}),
  )
  return toGeminiFunctionDeclaration({
    name: 'assistant.write_request',
    description: 'Classify the ultimate requested effect, then optionally propose one bounded write.',
    effect: 'write',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        requested_effect: {
          type: 'string',
          enum: ['additive_write', 'exact_update', 'other_write', 'read', 'unsupported'],
          description: 'The effect of the user outcome, regardless of prerequisite lookup steps.',
        },
        tool_name: {
          type: 'string',
          enum: additiveTools.map((tool) => tool.name),
          description: 'Required only when requested_effect is additive_write or exact_update.',
        },
        tool_args: {
          type: 'object',
          additionalProperties: false,
          properties: toolArgProperties,
          description: 'Arguments for tool_name when requested_effect is additive_write or exact_update.',
        },
      },
      required: ['requested_effect'],
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
