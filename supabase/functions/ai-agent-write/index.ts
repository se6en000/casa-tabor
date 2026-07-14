import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireEnv } from '../_shared/env.mjs'
import { evaluateAgentToolCall } from '../_shared/assistant-agent-policy.mjs'
import {
  resolveCalendarSemanticTurn,
  shouldPreferActiveCalendarEntity,
} from '../_shared/assistant-calendar-agent.mjs'
import {
  adaptAgentGroceryUpdate,
  findAgentCalendarDuplicates,
  isAgentCalendarUpdateTargetUnambiguous,
  isAgentGroceryUpdateTargetUnambiguous,
} from '../_shared/assistant-agent-write.mjs'
import {
  getAgentToolByLegacyName,
  legacyToolNameFor,
} from '../_shared/assistant-agent-tools.mjs'
import {
  fallbackExplicitRelativeReminderTurn,
  hardenExplicitReminderTurn,
} from '../_shared/assistant-reminder-intent.mjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const ALLOWED_TOOLS = new Set([
  'calendar.create',
  'calendar.update',
  'calendar.delete',
  'calendar.complete_reminder',
  'grocery.add_items',
  'grocery.update_item',
  'grocery.remove_item',
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
        all_day?: boolean
        event_type?: string
        recurrence_master_id?: string | null
        rrule?: string | null
      }) => ({
        type: 'event',
        id: event.id,
        title: event.title,
        version: event.updated_at ?? null,
        start: event.start_time,
        end: event.end_time,
        allDay: event.all_day === true,
        eventType: event.event_type === 'reminder' ? 'reminder' : 'event',
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
    const latestUserText = Array.isArray(body?.messages)
      ? [...body.messages].reverse().find((message) => message?.role === 'user' && typeof message?.content === 'string')?.content ?? ''
      : ''
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
    const fallbackReminderTurn = plannerResult.error
      ? fallbackExplicitRelativeReminderTurn(latestUserText)
      : null
    let plan = plannerResult.error
      ? fallbackReminderTurn
        ? { kind: 'calendar_semantic', turn: fallbackReminderTurn }
        : null
      : plannerResult.data?.plan
    if (plannerResult.error && !plan) return result({ supported: false, code: 'planner_error' }, 503)
    if (plan?.kind === 'calendar_semantic') {
      plan.turn = hardenExplicitReminderTurn(plan.turn, latestUserText)
      const resolved = resolveCalendarSemanticTurn(plan.turn, {
        currentDate: body?.context?.currentDate,
        utcOffset: body?.context?.utcOffset,
        pendingAction: normalizedPendingAction,
        activeEntity,
        authoritativeEntities,
        preferActiveEntity: shouldPreferActiveCalendarEntity(
          latestUserText,
          activeAuthoritativeEntity,
          authoritativeEntities,
        ),
      })
      if (resolved.kind === 'clarify') {
        const candidates = Array.isArray(resolved.candidates) ? resolved.candidates : []
        return result({
          supported: false,
          handled: true,
          text: resolved.text,
          code: resolved.code,
          planKind: plan.kind,
          toolName: null,
          ...(candidates.length > 1
            ? {
                clarification: {
                  candidates,
                  pendingMutation: {
                    tool: plan.turn?.action === 'delete' ? 'delete_event' : 'update_event',
                    args: {},
                    semanticTurn: plan.turn,
                  },
                },
              }
            : {}),
        })
      }
      if (resolved.kind !== 'tool') {
        return result({
          supported: false,
          handled: true,
          text: writeRejectionText(resolved.code),
          code: resolved.code,
          planKind: plan.kind,
          toolName: null,
        })
      }
      plan = resolved
    }
    if (plan?.kind !== 'tool' || !ALLOWED_TOOLS.has(plan.toolName)) {
      const ambiguousCandidateIds = plan?.kind === 'defer' && plan?.reason === 'ambiguous'
        ? plan.candidateEntityIds
        : plan?.kind === 'clarify' &&
            plan?.code === 'ambiguous_authoritative_target' &&
            Array.isArray(plan.candidates)
          ? plan.candidates.flatMap((candidate) =>
              typeof candidate?.id === 'string' ? [candidate.id] : []
            )
          : []
      const ambiguousCandidates = candidateEntities(ambiguousCandidateIds, authoritativeEntities)
      const inferredAmbiguousTool = /\b(?:mark|check)\b.*\b(?:done|complete|off)\b|\bcomplete\b/i.test(latestUserText)
        ? 'complete_reminder'
        : /\b(?:delete|remove|cancel)\b/i.test(latestUserText)
          ? 'delete_event'
          : null
      const clarification = ambiguousCandidates.length > 1
        ? ambiguityClarification(ambiguousCandidateIds, authoritativeEntities, body?.context?.utcOffset)
        : plan?.kind === 'clarify'
          ? optionalText(plan.text, 500)
          : plan?.kind === 'defer' && plan?.reason === 'ambiguous'
            ? ambiguityClarification(plan.candidateEntityIds, authoritativeEntities, body?.context?.utcOffset)
            : null
      return result({
        supported: false,
        handled: Boolean(clarification),
        text: clarification,
        code: 'unsupported_write_plan',
        planKind: plan?.kind ?? 'error',
        planReason: plan?.reason ?? null,
        toolName: plan?.toolName ?? null,
        ...(clarification && inferredAmbiguousTool && ambiguousCandidates.length > 1
          ? {
              clarification: {
                candidates: ambiguousCandidates,
                pendingMutation: { tool: inferredAmbiguousTool, args: {} },
              },
            }
          : {}),
      })
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
      const candidates = duplicateLabelCandidates(authoritativeEntities, plan.args?.id, 'event', 'title')
      return result({
        supported: false,
        handled: true,
        text: candidates.length > 1
          ? ambiguityClarification(candidates.map((candidate) => candidate.id), authoritativeEntities, body?.context?.utcOffset)
          : writeRejectionText('ambiguous_update_target'),
        code: 'ambiguous_update_target',
        planKind: plan.kind,
        toolName: plan.toolName,
        ...(candidates.length > 1
          ? {
              clarification: {
                candidates,
                pendingMutation: {
                  tool: 'update_event',
                  args: plan.args,
                },
              },
            }
          : {}),
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
      activeEntity: activeAuthoritativeEntity,
      duplicateCandidates,
      expectedUtcOffset: optionalText(body?.context?.utcOffset, 12),
      authorizedMemberNames: Array.isArray(body?.context?.family)
        ? body.context.family.flatMap((member: { name?: unknown }) =>
            typeof member?.name === 'string' ? [member.name] : []
          )
        : [],
    })
    const acceptedDecision = [
      'calendar.update',
      'calendar.delete',
      'calendar.complete_reminder',
      'grocery.update_item',
      'grocery.remove_item',
    ].includes(plan.toolName)
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

function ambiguityClarification(
  candidateIds: unknown,
  entities: Array<Record<string, unknown>>,
  utcOffset: unknown,
) {
  const ids = new Set(Array.isArray(candidateIds)
    ? candidateIds.filter((id): id is string => typeof id === 'string').slice(0, 6)
    : [])
  const candidates = entities.filter((entity) => ids.has(String(entity.id ?? ''))).slice(0, 4)
  if (candidates.length === 0) {
    return 'I found more than one possible match. Tell me which one you mean. Nothing was changed.'
  }
  const choices = candidates.map((entity) => {
    const label = optionalText(entity.title ?? entity.name, 120) ?? 'Unnamed item'
    const when = formatEntityTime(entity.start, utcOffset)
    return `- **${label}**${when ? ` — ${when}` : ''}`
  }).join('\n')
  return `I found more than one possible match. Which one do you mean?\n${choices}\nNothing was changed.`
}

function candidateEntities(candidateIds: unknown, entities: Array<Record<string, unknown>>) {
  const ids = new Set(Array.isArray(candidateIds)
    ? candidateIds.filter((id): id is string => typeof id === 'string').slice(0, 6)
    : [])
  return entities
    .filter((entity) => ids.has(String(entity.id ?? '')))
    .slice(0, 6)
    .map(calendarCandidate)
}

function duplicateLabelCandidates(
  entities: Array<Record<string, unknown>>,
  targetId: unknown,
  type: string,
  labelKey: string,
) {
  const target = entities.find((entity) => entity.type === type && entity.id === targetId)
  const label = optionalText(target?.[labelKey], 180)?.toLocaleLowerCase()
  if (!label) return []
  return entities
    .filter((entity) =>
      entity.type === type &&
      optionalText(entity[labelKey], 180)?.toLocaleLowerCase() === label
    )
    .slice(0, 6)
    .map(calendarCandidate)
}

function calendarCandidate(entity: Record<string, unknown>) {
  return {
    id: entity.id,
    title: optionalText(entity.title, 180) ?? 'Calendar event',
    start: optionalText(entity.start, 80),
    version: optionalText(entity.version, 80),
  }
}

function formatEntityTime(value: unknown, utcOffset: unknown) {
  if (typeof value !== 'string') return null
  const timestamp = Date.parse(value)
  const match = String(utcOffset ?? '').match(/^([+-])(\d{2}):(\d{2})$/)
  if (!Number.isFinite(timestamp) || !match) return null
  const minutes = (match[1] === '+' ? 1 : -1) * (Number(match[2]) * 60 + Number(match[3]))
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(timestamp + minutes * 60000))
}
