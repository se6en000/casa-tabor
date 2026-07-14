import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireEnv } from '../_shared/env.mjs'
import { evaluateAgentToolCall } from '../_shared/assistant-agent-policy.mjs'
import { findAgentCalendarDuplicates } from '../_shared/assistant-agent-write.mjs'
import { legacyToolNameFor } from '../_shared/assistant-agent-tools.mjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const ALLOWED_TOOLS = new Set(['calendar.create', 'grocery.add_items'])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ agentic: true, supported: false, code: 'method_not_allowed' }, 405)

  const startedAt = Date.now()
  const sb = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))
  try {
    const body = await req.json()
    const traceId = optionalText(body?.trace_id, 120) ?? 'agent-write'
    const turnId = optionalText(body?.turn_id, 120)
    const correlationId = optionalText(body?.correlation_id, 120) ?? `${traceId}:${turnId ?? crypto.randomUUID()}`
    const actionId = optionalText(body?.action_id, 120) ?? `${correlationId}:proposal`
    const events = Array.isArray(body?.authoritative_data?.events)
      ? body.authoritative_data.events.slice(0, 100)
      : []
    const groceryItems = Array.isArray(body?.authoritative_data?.groceryItems)
      ? body.authoritative_data.groceryItems.slice(0, 150)
      : []
    const authoritativeEntities = [
      ...events.map((event: {
        id?: string
        title?: string
        updated_at?: string
        start_time?: string
        end_time?: string
        recurrence_master_id?: string | null
        rrule?: string | null
      }) => ({
        type: 'event',
        id: event.id,
        title: event.title,
        version: event.updated_at ?? null,
        start: event.start_time,
        end: event.end_time,
        recurring: Boolean(event.recurrence_master_id || event.rrule),
      })),
      ...groceryItems.map((item: { id?: string; name?: string }) => ({
        type: 'grocery_item',
        id: item.id,
        name: item.name,
      })),
    ].filter((entity) => typeof entity.id === 'string')

    const plannerResult = await sb.functions.invoke('ai-agent-shadow', {
      body: {
        messages: body?.messages,
        context: {
          ...body?.context,
          authoritativeEntities,
        },
        trace_id: traceId,
        turn_id: turnId,
        correlation_id: `${correlationId}:planner`,
        household_id: optionalText(body?.household_id, 120) ?? 'default',
        planner_mode: 'additive_write',
        model_override: body?.model_override,
        action_id: actionId,
      },
    })
    if (plannerResult.error) return result({ supported: false, code: 'planner_error' }, 503)

    const plan = plannerResult.data?.plan
    if (plan?.kind !== 'tool' || !ALLOWED_TOOLS.has(plan.toolName)) {
      return result({
        supported: false,
        code: 'non_additive_write_plan',
        planKind: plan?.kind ?? 'error',
        toolName: plan?.toolName ?? null,
      })
    }

    const duplicateCandidates = plan.toolName === 'calendar.create'
      ? findAgentCalendarDuplicates(events, plan.args)
      : []
    const policy = evaluateAgentToolCall({
      toolName: plan.toolName,
      args: plan.args,
      household: {
        id: optionalText(body?.household_id, 120) ?? 'default',
        authorized: true,
      },
      callIndex: 0,
      retryCount: 0,
      actionId,
      confirmedActionId: null,
      idempotencyKey: `${correlationId}:${actionId}`,
      agentState: body?.agent_state,
      authoritativeEntities,
      duplicateCandidates,
      authorizedMemberNames: Array.isArray(body?.context?.family)
        ? body.context.family.flatMap((member: { name?: unknown }) =>
            typeof member?.name === 'string' ? [member.name] : []
          )
        : [],
    })
    if (policy.decision !== 'execute' || policy.allowed !== true) {
      return result({
        supported: false,
        code: policy.code,
        planKind: plan.kind,
        toolName: plan.toolName,
        policy,
      })
    }

    const legacyTool = legacyToolNameFor(plan.toolName)
    if (!legacyTool) return result({ supported: false, code: 'legacy_adapter_missing' })
    return result({
      supported: true,
      type: 'tool_action',
      tool: legacyTool,
      args: plan.args,
      action_id: actionId,
      idempotency_key: `${correlationId}:${actionId}`,
      plan,
      policy,
    })

    function result(payload: Record<string, unknown>, status = 200) {
      const elapsedMs = Date.now() - startedAt
      const event = payload.supported === true ? 'server_agent_write_proposal' : 'server_agent_write_fallback'
      void sb.from('ai_drawer_debug_events').insert({
        event,
        detail: `${String(payload.code ?? payload.type ?? 'unknown')}:${String(payload.toolName ?? planName(payload) ?? '')}`,
        channel: 'debug',
        session_id: traceId,
        turn_id: turnId,
        correlation_id: correlationId,
        lane: 'agent_write',
        payload: {
          supported: payload.supported === true,
          code: payload.code ?? null,
          tool_name: planName(payload),
          elapsed_ms: elapsedMs,
        },
        page: optionalText(body?.context?.page, 64),
        source_component: 'server:ai-agent-write',
        source_origin: 'agent-write',
        dedupe_key: `${correlationId}|agent-write|${turnId ?? 'no-turn'}`,
      })
      return json({ agentic: true, elapsed_ms: elapsedMs, ...payload }, status)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return json({ agentic: true, supported: false, code: 'agent_write_failed', message }, 500)
  }
})

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  })
}

function optionalText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized ? normalized.slice(0, maxLength) : null
}

function planName(payload: Record<string, unknown>) {
  const plan = payload.plan as { toolName?: unknown } | undefined
  return typeof plan?.toolName === 'string' ? plan.toolName : null
}
