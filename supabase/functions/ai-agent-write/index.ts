import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireEnv } from '../_shared/env.mjs'
import { evaluateAgentToolCall } from '../_shared/assistant-agent-policy.mjs'
import {
  alignCalendarMoveToRequestedTime,
  adaptAgentGroceryUpdate,
  findAgentCalendarDuplicates,
  isAgentCalendarUpdateTargetUnambiguous,
  isAgentGroceryUpdateTargetUnambiguous,
  repairInvalidCalendarMoveDuration,
} from '../_shared/assistant-agent-write.mjs'
import {
  getAgentToolByLegacyName,
  legacyToolNameFor,
} from '../_shared/assistant-agent-tools.mjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const ALLOWED_TOOLS = new Set([
  'calendar.create',
  'calendar.update',
  'grocery.add_items',
  'grocery.update_item',
])

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
      ...groceryItems.map((item: {
        id?: string
        name?: string
        updated_at?: string
        quantity?: string
        unit?: string
        checked?: boolean
      }) => ({
        type: 'grocery_item',
        id: item.id,
        name: item.name,
        version: item.updated_at ?? null,
        quantity: item.quantity ?? null,
        unit: item.unit ?? null,
        checked: item.checked ?? null,
      })),
    ].filter((entity) => typeof entity.id === 'string')
    const activeEntity = body?.context?.activeEntity
    const activeAuthoritativeEntity = ['event', 'grocery_item'].includes(activeEntity?.type)
      ? authoritativeEntities.find((entity) =>
          entity.type === activeEntity.type && entity.id === activeEntity.id
        )
      : null
    const planningEntities = activeAuthoritativeEntity
      ? [activeAuthoritativeEntity]
      : authoritativeEntities
    const pendingAction = body?.context?.pendingAction
    const pendingTool = getAgentToolByLegacyName(pendingAction?.tool)
    const normalizedPendingAction = pendingTool && ALLOWED_TOOLS.has(pendingTool.name)
      ? {
          actionId: optionalText(pendingAction?.actionId, 120) ?? `${correlationId}:pending`,
          toolName: pendingTool.name,
          args: pendingAction?.args && typeof pendingAction.args === 'object'
            ? pendingAction.args
            : {},
        }
      : pendingAction?.toolName && ALLOWED_TOOLS.has(pendingAction.toolName)
        ? pendingAction
        : null

    const plannerResult = await sb.functions.invoke('ai-agent-shadow', {
      body: {
        messages: body?.messages,
        context: {
          ...body?.context,
          authoritativeEntities: planningEntities,
          pendingAction: normalizedPendingAction,
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
      const clarification = plan?.kind === 'clarify'
        ? optionalText(plan.text, 500)
        : plan?.kind === 'defer' && plan?.reason === 'ambiguous'
          ? 'I found more than one possible match. Tell me which one you mean. Nothing was changed.'
          : null
      return result({
        supported: false,
        handled: Boolean(clarification),
        text: clarification,
        code: 'unsupported_write_plan',
        planKind: plan?.kind ?? 'error',
        planReason: plan?.reason ?? null,
        toolName: plan?.toolName ?? null,
      })
    }
    if (plan.toolName === 'calendar.update') {
      plan.args = repairInvalidCalendarMoveDuration(plan.args, authoritativeEntities)
      plan.args = alignCalendarMoveToRequestedTime(
        plan.args,
        authoritativeEntities,
        body?.context?.calendarRequestedTime,
        body?.context?.utcOffset,
      )
    }

    const duplicateCandidates = plan.toolName === 'calendar.create'
      ? findAgentCalendarDuplicates(events, plan.args)
      : []
    if (
      plan.toolName === 'calendar.update' &&
      !isAgentCalendarUpdateTargetUnambiguous(
        authoritativeEntities,
        plan.args,
        activeEntity,
      )
    ) {
      return result({
        supported: false,
        handled: true,
        text: writeRejectionText('ambiguous_update_target'),
        code: 'ambiguous_update_target',
        planKind: plan.kind,
        toolName: plan.toolName,
      })
    }
    if (
      plan.toolName === 'grocery.update_item' &&
      !isAgentGroceryUpdateTargetUnambiguous(
        authoritativeEntities,
        plan.args,
        activeEntity,
      )
    ) {
      return result({
        supported: false,
        handled: true,
        text: writeRejectionText('ambiguous_update_target'),
        code: 'ambiguous_update_target',
        planKind: plan.kind,
        toolName: plan.toolName,
      })
    }
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
      expectedUtcOffset: optionalText(body?.context?.utcOffset, 12),
      authorizedMemberNames: Array.isArray(body?.context?.family)
        ? body.context.family.flatMap((member: { name?: unknown }) =>
            typeof member?.name === 'string' ? [member.name] : []
          )
        : [],
    })
    const acceptedDecision = ['calendar.update', 'grocery.update_item'].includes(plan.toolName)
      ? 'confirm'
      : 'execute'
    if (policy.decision !== acceptedDecision || policy.allowed !== true) {
      return result({
        supported: false,
        handled: true,
        text: writeRejectionText(policy.code, policy),
        code: policy.code,
        planKind: plan.kind,
        toolName: plan.toolName,
        policy,
      })
    }

    const legacyAction = plan.toolName === 'grocery.update_item'
      ? adaptAgentGroceryUpdate(plan.args)
      : {
          tool: legacyToolNameFor(plan.toolName),
          args: plan.args,
        }
    if (!legacyAction?.tool) {
      return result({
        supported: false,
        handled: true,
        text: writeRejectionText('legacy_adapter_missing'),
        code: 'legacy_adapter_missing',
        planKind: plan.kind,
        toolName: plan.toolName,
      })
    }
    return result({
      supported: true,
      type: 'tool_action',
      tool: legacyAction.tool,
      args: legacyAction.args,
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

function writeRejectionText(code: unknown, detail?: Record<string, unknown>) {
  if (code === 'unknown_calendar_member') {
    const names = Array.isArray(detail?.unknownMembers)
      ? detail.unknownMembers.filter((name) => typeof name === 'string').join(', ')
      : ''
    return names
      ? `I don't know which Casa family member ${names} means. Tell me the person's Casa name. Nothing was saved.`
      : `I don't know which Casa family member you mean. Tell me the person's Casa name. Nothing was saved.`
  }
  if (code === 'ambiguous_update_target' || code === 'ambiguous_authoritative_target') {
    return 'I found more than one possible match. Tell me which one you mean. Nothing was changed.'
  }
  if (code === 'duplicate_calendar_start') {
    return 'There is already an event at that time. Tell me whether you want a different time. Nothing was saved.'
  }
  if (code === 'stale_authoritative_target') {
    return 'That item changed before I could prepare the update. Please try again with the latest version. Nothing was changed.'
  }
  return `I understood this as a change, but I couldn't prepare it safely. Nothing was saved.`
}

function planName(payload: Record<string, unknown>) {
  const plan = payload.plan as { toolName?: unknown } | undefined
  return typeof plan?.toolName === 'string' ? plan.toolName : null
}
