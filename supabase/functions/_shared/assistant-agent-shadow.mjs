import {
  AGENT_TOOL_DEFINITIONS,
  getAgentToolByGeminiName,
  toGeminiFunctionDeclaration,
} from './assistant-agent-tools.mjs'

export const AGENT_SHADOW_VERSION = 'agent-shadow-v1'

export function buildAgentShadowRequest(input) {
  const messages = normalizeMessages(input?.messages)
  if (messages.length === 0) throw new Error('At least one conversation message is required')
  const context = normalizeContext(input?.context)
  const declarations = AGENT_TOOL_DEFINITIONS.map(toGeminiFunctionDeclaration)
  return {
    system_instruction: {
      parts: [{
        text: buildAgentShadowInstruction(context),
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
      function_calling_config: { mode: 'AUTO' },
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
    elapsed_ms: metadata.elapsedMs ?? null,
    input_tokens: metadata.inputTokens ?? 0,
    output_tokens: metadata.outputTokens ?? 0,
    total_tokens: metadata.totalTokens ?? 0,
    provider_calls: metadata.providerCalls ?? 1,
    message_count: metadata.messageCount ?? 0,
    user_text_hash: metadata.userTextHash ?? null,
  }
}

function buildAgentShadowInstruction(context) {
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
`
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
