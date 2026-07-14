import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireEnv } from '../_shared/env.mjs'
import { evaluateAgentToolCall } from '../_shared/assistant-agent-policy.mjs'
import {
  agentShadowTelemetry,
  buildAgentShadowRequest,
  parseAgentShadowResponse,
} from '../_shared/assistant-agent-shadow.mjs'
import { getAgentTool } from '../_shared/assistant-agent-tools.mjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const DEFAULT_MODEL = 'gemini-2.5-flash-lite'
const SUPPORTED_MODELS = new Set(['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-3.5-flash'])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const startedAt = Date.now()
  const sb = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))
  try {
    const body = await req.json()
    const messages = Array.isArray(body?.messages) ? body.messages : []
    const latestUserText = [...messages].reverse().find((message) => message?.role === 'user')?.content ?? ''
    const traceId = text(body?.trace_id, 120) ?? 'agent-shadow'
    const turnId = text(body?.turn_id, 120)
    const correlationId = text(body?.correlation_id, 120) ?? `${traceId}:${turnId ?? crypto.randomUUID()}`
    const actionId = text(body?.action_id, 120) ?? `${correlationId}:plan`

    const { data: configRows, error: configError } = await sb
      .from('settings')
      .select('value')
      .eq('key', 'llm_config')
      .limit(1)
    if (configError) throw new Error(configError.message)
    const config = configRows?.[0]?.value ?? {}
    const modelOverride = text(body?.model_override, 80)
    const configuredModel = text(config.model, 80) ?? DEFAULT_MODEL
    const model = modelOverride && SUPPORTED_MODELS.has(modelOverride)
      ? modelOverride
      : SUPPORTED_MODELS.has(configuredModel)
        ? configuredModel
        : DEFAULT_MODEL
    const apiKey = text(config.api_key, 500)
    if (!apiKey) throw new Error('Gemini API key is not configured')

    const requestBody = buildAgentShadowRequest({
      messages,
      context: body?.context,
      plannerMode: body?.planner_mode,
    })
    let response = await callGemini(model, apiKey, requestBody)
    let providerCalls = 1
    if ([429, 500, 502, 503, 504].includes(response.status)) {
      await new Promise((resolve) => setTimeout(resolve, 100))
      response = await callGemini(model, apiKey, requestBody)
      providerCalls += 1
    }
    if (!response.ok) {
      throw new Error(`Gemini shadow planner failed with status ${response.status}`)
    }
    const providerPayload = await response.json()
    const plan = parseAgentShadowResponse(providerPayload)
    const tool = plan.kind === 'tool' ? getAgentTool(plan.toolName) : null
    const policy = plan.kind === 'tool'
      ? evaluateAgentToolCall({
          toolName: plan.toolName,
          args: plan.args,
          household: { id: text(body?.household_id, 120) ?? 'default', authorized: true },
          callIndex: 0,
          retryCount: 0,
          actionId,
          confirmedActionId: null,
          idempotencyKey: `${correlationId}:${actionId}`,
          agentState: body?.agent_state,
          authoritativeEntities: body?.context?.authoritativeEntities,
          duplicateCandidates: body?.context?.duplicateCandidates,
          authorizedMemberNames: Array.isArray(body?.context?.family)
            ? body.context.family.flatMap((member: { name?: unknown }) =>
                typeof member?.name === 'string' ? [member.name] : []
              )
            : [],
        })
      : null
    const usage = providerPayload?.usageMetadata ?? {}
    const telemetry = agentShadowTelemetry(plan, {
      model,
      toolEffect: tool?.effect ?? null,
      policyDecision: policy?.decision ?? null,
      policyCode: policy?.code ?? null,
      elapsedMs: Date.now() - startedAt,
      inputTokens: integer(usage.promptTokenCount),
      outputTokens: integer(usage.candidatesTokenCount),
      totalTokens: integer(usage.totalTokenCount),
      providerCalls,
      messageCount: messages.length,
      userTextHash: await sha256(latestUserText),
    })

    await sb.from('ai_drawer_debug_events').insert({
      event: 'server_agent_shadow_plan',
      detail: `${telemetry.plan_kind}:${telemetry.tool_name ?? telemetry.policy_code ?? 'none'}`,
      channel: 'debug',
      session_id: traceId,
      turn_id: turnId,
      correlation_id: correlationId,
      lane: 'agent_shadow',
      payload: telemetry,
      page: text(body?.context?.page, 64),
      source_component: 'server:ai-agent-shadow',
      source_origin: 'agent-shadow',
      dedupe_key: `${correlationId}|agent-shadow|${turnId ?? 'no-turn'}`,
    })

    return json({ shadow: true, model, plan, policy, telemetry })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return json({ shadow: true, error: 'shadow_planner_failed', message }, 500)
  }
})

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  })
}

function text(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized ? normalized.slice(0, maxLength) : null
}

function integer(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
}

async function callGemini(model: string, apiKey: string, requestBody: unknown) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    return await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      },
    )
  } finally {
    clearTimeout(timeout)
  }
}

async function sha256(value: unknown) {
  const bytes = new TextEncoder().encode(typeof value === 'string' ? value : '')
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
