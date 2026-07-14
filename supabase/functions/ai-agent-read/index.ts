import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireEnv } from '../_shared/env.mjs'
import {
  executeAgentReadTool,
  formatAgentReadResult,
} from '../_shared/assistant-agent-read.mjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ agentic: true, supported: false, code: 'method_not_allowed' }, 405)

  const startedAt = Date.now()
  const sb = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))
  try {
    const body = await req.json()
    const traceId = optionalText(body?.trace_id, 120) ?? 'agent-read'
    const turnId = optionalText(body?.turn_id, 120)
    const correlationId = optionalText(body?.correlation_id, 120) ?? `${traceId}:${turnId ?? crypto.randomUUID()}`
    const events = Array.isArray(body?.authoritative_data?.events)
      ? body.authoritative_data.events.slice(0, 500)
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
      ...groceryItems.map((item: { id?: string; name?: string; quantity?: string; unit?: string }) => ({
        type: 'grocery_item',
        id: item.id,
        name: item.name,
        quantity: item.quantity ?? null,
        unit: item.unit ?? null,
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
        planner_mode: 'authoritative_read',
        model_override: body?.model_override,
      },
    })
    if (plannerResult.error) {
      return result({ supported: false, code: 'planner_error' }, 503)
    }
    const planner = plannerResult.data
    let plan = planner?.plan
    const trustedCalendarRead = (
      typeof body?.context?.calendarReadContext?.start === 'string' &&
      typeof body?.context?.calendarReadContext?.end === 'string'
    )
    const trustedReadOverride = trustedCalendarRead && (
      plan?.kind !== 'tool' ||
      plan?.toolName !== 'calendar.get_range' ||
      planner?.telemetry?.tool_effect !== 'read' ||
      planner?.policy?.decision !== 'execute'
    )
    if (trustedReadOverride) {
      plan = {
        kind: 'tool',
        toolName: 'calendar.get_range',
        args: {},
        responsePlan: plan?.responsePlan ?? {
          userGoal: 'Review the requested calendar period with useful same-day context.',
          helpfulEntityIds: [],
        },
      }
    }
    if (plan?.kind === 'clarify') {
      return result({
        supported: true,
        type: 'text',
        text: plan.text,
        plan,
        policy: null,
      })
    }
    if (
      plan?.kind !== 'tool' ||
      (!trustedReadOverride && planner?.policy?.decision !== 'execute') ||
      (!trustedReadOverride && planner?.telemetry?.tool_effect !== 'read')
    ) {
      const handledMutation = plan?.kind === 'defer' && plan?.reason === 'mutation'
      return result({
        supported: false,
        handled: handledMutation,
        text: handledMutation
          ? `I understood this as a change, but I couldn't prepare it safely. Nothing was saved.`
          : null,
        code: 'non_read_or_unapproved_plan',
        planKind: plan?.kind ?? 'error',
        planReason: plan?.reason ?? null,
        toolName: plan?.toolName ?? null,
        policyCode: planner?.policy?.code ?? null,
      })
    }
    if (
      plan.toolName === 'grocery.get_list' &&
      typeof body?.context?.groceryQuery === 'string' &&
      body.context.groceryQuery.trim() &&
      typeof plan.args?.query !== 'string'
    ) {
      plan.args = { ...plan.args, query: body.context.groceryQuery.trim() }
    }
    if (
      plan.toolName === 'calendar.get_range' &&
      typeof body?.context?.calendarReadContext?.start === 'string' &&
      typeof body?.context?.calendarReadContext?.end === 'string'
    ) {
      const calendarReadContext = body.context.calendarReadContext
      plan.args = {
        ...plan.args,
        start: typeof calendarReadContext.contextStart === 'string'
          ? calendarReadContext.contextStart
          : calendarReadContext.start,
        end: typeof calendarReadContext.contextEnd === 'string'
          ? calendarReadContext.contextEnd
          : calendarReadContext.end,
        primary_start: calendarReadContext.start,
        primary_end: calendarReadContext.end,
        utc_offset: body?.context?.utcOffset,
      }
    }
    if (plan.toolName.startsWith('calendar.')) {
      plan.args = { ...plan.args, utc_offset: body?.context?.utcOffset }
    }

    const toolResult = executeAgentReadTool(plan.toolName, plan.args, { events, groceryItems })
    const helpfulEntityIds = validatedHelpfulEntityIds(plan.responsePlan?.helpfulEntityIds, toolResult)
    const text = formatAgentReadResult(plan.toolName, toolResult, {
      utcOffset: body?.context?.utcOffset,
      scopeLabel: body?.context?.calendarReadContext?.label,
      userGoal: plan.responsePlan?.userGoal,
      helpfulEntityIds,
    })
    if (!toolResult.supported || !text) {
      return result({
        supported: false,
        code: toolResult.code ?? 'read_result_unsupported',
        toolName: plan.toolName,
      })
    }
    const activeEvents = toolResult.primaryEvents ?? toolResult.events
    const activeEntity = activeEvents?.length === 1
      ? {
          activeEntityType: 'event',
          activeEventId: activeEvents[0].id,
          activeEventUpdatedAt: activeEvents[0].updated_at ?? null,
          expectedFollowUp: 'event_follow_up',
          establishedAt: new Date().toISOString(),
        }
      : toolResult.items?.length === 1
        ? {
            activeEntityType: 'grocery_item',
            activeGroceryItemId: toolResult.items[0].id,
            expectedFollowUp: 'grocery_follow_up',
            establishedAt: new Date().toISOString(),
          }
        : null
    return result({
      supported: true,
      type: 'text',
      text,
      plan,
      policy: trustedReadOverride
        ? { decision: 'execute', code: 'trusted_semantic_read' }
        : planner.policy,
      activeEntity,
      count: toolResult.count,
      contextCount: toolResult.contextCount,
    })

    function result(payload: Record<string, unknown>, status = 200) {
      const elapsedMs = Date.now() - startedAt
      const event = payload.supported === true ? 'server_agent_read_result' : 'server_agent_read_fallback'
      void sb.from('ai_drawer_debug_events').insert({
        event,
        detail: `${String(payload.code ?? payload.type ?? 'unknown')}:${String(payload.toolName ?? planName(payload) ?? '')}`,
        channel: 'debug',
        session_id: traceId,
        turn_id: turnId,
        correlation_id: correlationId,
        lane: 'agent_read',
        payload: {
          supported: payload.supported === true,
          code: payload.code ?? null,
          tool_name: planName(payload),
          elapsed_ms: elapsedMs,
          count: payload.count ?? null,
          context_count: payload.contextCount ?? null,
          trusted_read_override: trustedReadOverride,
        },
        page: optionalText(body?.context?.page, 64),
        source_component: 'server:ai-agent-read',
        source_origin: 'agent-read',
        dedupe_key: `${correlationId}|agent-read|${turnId ?? 'no-turn'}`,
      })

      return json({ agentic: true, elapsed_ms: elapsedMs, ...payload }, status)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return json({ agentic: true, supported: false, code: 'agent_read_failed', message }, 500)
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

function validatedHelpfulEntityIds(value: unknown, result: Record<string, unknown>) {
  const requested = Array.isArray(value)
    ? value.filter((id): id is string => typeof id === 'string')
    : []
  const entities = [
    ...(Array.isArray(result.events) ? result.events : []),
    ...(Array.isArray(result.items) ? result.items : []),
    ...(Array.isArray(result.contextItems) ? result.contextItems : []),
  ] as Array<{ id?: unknown }>
  const authoritativeIds = new Set(
    entities.flatMap((entity) => typeof entity?.id === 'string' ? [entity.id] : []),
  )
  return requested.filter((id) => authoritativeIds.has(id)).slice(0, 8)
}
