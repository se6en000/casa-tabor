import { createClient } from 'npm:@supabase/supabase-js@2'

import { requireEnv } from '../_shared/env.ts'
import { resolveCaptureCommand } from '../_shared/capture-command-router.mjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-casa-capture-token',
}

type CaptureRoute =
  | {
    status: 'execute'
    tool: 'create_event' | 'add_grocery_items'
    args: Record<string, unknown>
  }
  | {
    status: 'needs_clarification'
    clarification_question: string
  }
  | {
    status: 'unsupported'
    message: string
  }

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function captureTokenFromRequest(request: Request): string | null {
  const direct = request.headers.get('x-casa-capture-token')?.trim()
  if (direct) return direct
  const auth = request.headers.get('authorization')?.trim() ?? ''
  const match = auth.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() ?? null
}

function resolvedIntent(route: CaptureRoute): string | null {
  if (route.status !== 'execute') return null
  if (route.tool === 'add_grocery_items') return 'add_grocery_items'
  return route.args.event_type === 'reminder' ? 'create_reminder' : 'create_event'
}

function formatSpokenDateTime(startIso: string | undefined, utcOffset = '-04:00'): string {
  if (!startIso || typeof startIso !== 'string') return ''
  const ms = Date.parse(startIso)
  if (!Number.isFinite(ms)) return ''

  const offsetMinutes = parseOffsetMinutes(utcOffset)
  const shifted = new Date(ms + offsetMinutes * 60000)
  const now = new Date()
  const nowShifted = new Date(now.getTime() + offsetMinutes * 60000)

  const dateKey = shifted.toISOString().slice(0, 10)
  const nowKey = nowShifted.toISOString().slice(0, 10)
  const tomorrowKey = new Date(nowShifted.getTime() + 86400000).toISOString().slice(0, 10)

  const hours = shifted.getUTCHours()
  const minutes = shifted.getUTCMinutes()
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHour = hours % 12 || 12
  const displayMinute = minutes === 0 ? '' : `:${String(minutes).padStart(2, '0')}`
  const timeStr = `${displayHour}${displayMinute} ${period}`

  if (dateKey === nowKey) {
    return `today at ${timeStr}`
  }
  if (dateKey === tomorrowKey) {
    return `tomorrow at ${timeStr}`
  }

  const diffDays = Math.round((Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - Date.UTC(nowShifted.getUTCFullYear(), nowShifted.getUTCMonth(), nowShifted.getUTCDate())) / 86400000)
  if (diffDays > 1 && diffDays < 7) {
    const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][shifted.getUTCDay()]
    return `${weekday} at ${timeStr}`
  }

  const monthName = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'][shifted.getUTCMonth()]
  const day = shifted.getUTCDate()
  return `${monthName} ${day} at ${timeStr}`
}

function parseOffsetMinutes(offset: string) {
  const match = String(offset ?? '').match(/^([+-])(\d{2}):(\d{2})$/)
  if (!match) return 0
  const minutes = Number(match[2]) * 60 + Number(match[3])
  return (match[1] === '+' ? 1 : -1) * minutes
}

function buildExecutionResponse(
  route: Extract<CaptureRoute, { status: 'execute' }>,
  data: Record<string, unknown>,
  utcOffset = '-04:00',
) {
  if (route.tool === 'add_grocery_items') {
    const rawItems = Array.isArray(route.args.items) ? (route.args.items as Array<{ name?: string }>) : []
    const itemNames = rawItems.map((i) => i?.name).filter((n): n is string => Boolean(n))
    if (itemNames.length > 0 && itemNames.length <= 3) {
      return `Added ${itemNames.join(', ')} to the shopping list.`
    }
    const created = Number(data.count ?? itemNames.length)
    if (created > 0) return `Added ${created} ${created === 1 ? 'item' : 'items'} to the shopping list.`
    return 'Added to your shopping list.'
  }

  if (typeof data.message === 'string' && data.message.trim()) {
    return data.message.trim()
  }

  const title = normalizeText(route.args.title)
  const when = formatSpokenDateTime(route.args.start as string | undefined, utcOffset)
  const members = Array.isArray(route.args.members) ? (route.args.members as string[]).filter(Boolean) : []
  const memberName = members.length > 0 ? members[0] : null
  const conflictTitle = typeof data.conflict_title === 'string' && data.conflict_title.trim()
    ? data.conflict_title.trim()
    : null

  if (route.args.event_type === 'reminder') {
    const target = memberName ? ` for ${memberName}` : ''
    const timeClause = when ? ` for ${when}` : ''
    return title ? `Set reminder${target}${timeClause}: ${title}.` : 'Reminder created.'
  }

  const timeClause = when ? ` for ${when}` : ''
  const conflictNote = conflictTitle ? ` Note: conflicts with ${conflictTitle}.` : ''
  return title ? `Scheduled ${title}${timeClause}.${conflictNote}` : 'Event created.'
}

async function planCaptureActionWithLlm(
  text: string,
  options: { now: Date; utcOffset: string; familyNames: string[] },
): Promise<CaptureRoute | null> {
  const geminiKey = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_AI_API_KEY') || ''
  if (!geminiKey) return null

  const nowIso = options.now.toISOString()
  const systemInstruction = `You are a strict single-shot execution engine for iOS Shortcuts and voice quick actions in Casa Tabor (a smart home family system).
Current local time reference: ${nowIso} (Timezone offset: ${options.utcOffset}).
Known Family Members: ${options.familyNames.join(', ')}.

MANDATORY RULES:
1. You MUST call one of the provided functions (create_event or add_grocery_items). NEVER return chat text or conversational questions.
2. If the user wants to add groceries/shopping items (e.g. food, household items, shopping list items), call add_grocery_items.
3. If the user wants to set a reminder, task, to-do, chore, or alert (e.g. "clean the pool", "take out trash", "remind me to call John"), call create_event with event_type="reminder".
   - If time is not specified for a reminder, default to 9:00 AM (start: YYYY-MM-DDT09:00:00${options.utcOffset}, end: YYYY-MM-DDT09:15:00${options.utcOffset}).
4. If the user wants to schedule an appointment, meeting, flight, dinner, tour, or calendar event, call create_event with event_type="event".
   - Default duration is 60 minutes (or 30 minutes for quick appointments).
5. Clean the title: remove "remind me to", "please add", "put on my schedule", etc.
6. Always output valid ISO 8601 strings with timezone offset ${options.utcOffset}.`

  const tools = [
    {
      functionDeclarations: [
        {
          name: 'create_event',
          description: 'Create a calendar event or reminder task in Casa Tabor with sensible defaults.',
          parameters: {
            type: 'OBJECT',
            properties: {
              title: { type: 'STRING', description: 'Clean title of the event or reminder' },
              event_type: { type: 'STRING', enum: ['event', 'reminder'], description: 'Event or reminder' },
              start: { type: 'STRING', description: `ISO 8601 start with offset ${options.utcOffset}` },
              end: { type: 'STRING', description: `ISO 8601 end with offset ${options.utcOffset}` },
              location: { type: 'STRING', description: 'Optional location' },
              members: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Family members' },
            },
            required: ['title', 'event_type', 'start', 'end'],
          },
        },
        {
          name: 'add_grocery_items',
          description: 'Add grocery items to shopping list.',
          parameters: {
            type: 'OBJECT',
            properties: {
              items: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    name: { type: 'STRING', description: 'Item name' },
                    quantity: { type: 'STRING', description: 'Quantity if mentioned' },
                    category: { type: 'STRING', description: 'Category or other' },
                  },
                  required: ['name'],
                },
              },
            },
            required: ['items'],
          },
        },
      ],
    },
  ]

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text }] }],
        systemInstruction: { parts: [{ text: systemInstruction }] },
        tools,
        toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: ['create_event', 'add_grocery_items'] } },
        generationConfig: { temperature: 0.1 },
      }),
    })

    if (!response.ok) return null
    const data = await response.json()
    const parts = data?.candidates?.[0]?.content?.parts as Array<{ functionCall?: { name: string; args: Record<string, unknown> } }> | undefined
    const functionCall = parts?.find((p) => Boolean(p.functionCall))?.functionCall

    if (!functionCall) return null

    if (functionCall.name === 'add_grocery_items' && Array.isArray(functionCall.args?.items)) {
      return {
        status: 'execute',
        tool: 'add_grocery_items',
        args: functionCall.args,
      }
    }

    if (functionCall.name === 'create_event' && functionCall.args?.title && functionCall.args?.start && functionCall.args?.end) {
      const args = functionCall.args
      const temporalProvenance = {
        sourceMessageId: 'capture-command-llm',
        sourceText: text,
        rangeStart: String(args.start).slice(0, 10),
        rangeEnd: String(args.end).slice(0, 10),
        resolutionKind: 'relative',
        requiresExactDateConfirmation: false,
      }
      return {
        status: 'execute',
        tool: 'create_event',
        args: {
          ...args,
          temporal_provenance: temporalProvenance,
        },
      }
    }
  } catch (err) {
    console.warn('[capture-command] LLM planner failed:', err)
  }

  return null
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }

  const sb = createClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  )

  const startedAt = Date.now()
  let captureDeviceId: string | null = null
  let normalizedText = ''
  let route: CaptureRoute | null = null

  try {
    const body = await request.json().catch(() => ({}))

    // Administrative device token management from Casa Settings UI
    if (body.action === 'provision_token') {
      const label = normalizeText(body.label) || 'iPhone Action Button'
      const rawToken = `casa_capture_${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`
      const tokenHash = await sha256Hex(rawToken)
      const tokenPrefix = rawToken.slice(0, 18)

      let adminUserId = '00000000-0000-0000-0000-000000000000'
      try {
        const { data: usersData } = await sb.auth.admin.listUsers({ perPage: 1 })
        if (usersData?.users?.[0]?.id) {
          adminUserId = usersData.users[0].id
        }
      } catch {
        // use fallback admin id
      }

      const { data: newDev, error: insertErr } = await sb.from('capture_devices').insert({
        label,
        token_hash: tokenHash,
        token_prefix: tokenPrefix,
        created_by: adminUserId,
      }).select('id,label,token_prefix,created_at').single()

      if (insertErr) throw insertErr

      return new Response(JSON.stringify({
        status: 'success',
        token: rawToken,
        device: newDev,
      }), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    if (body.action === 'list_devices') {
      const { data: devices, error: listErr } = await sb
        .from('capture_devices')
        .select('id,label,token_prefix,created_at,last_used_at,revoked_at')
        .order('created_at', { ascending: false })
      if (listErr) throw listErr
      return new Response(JSON.stringify({
        status: 'success',
        devices: devices ?? [],
      }), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    if (body.action === 'list_recent_requests') {
      const { data: reqs, error: reqErr } = await sb
        .from('capture_requests')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)
      if (reqErr) throw reqErr
      return new Response(JSON.stringify({
        status: 'success',
        requests: reqs ?? [],
      }), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    if (body.action === 'revoke_device') {
      const deviceId = normalizeText(body.deviceId)
      if (!deviceId) throw new Error('deviceId required')
      const { error: revErr } = await sb
        .from('capture_devices')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', deviceId)
      if (revErr) throw revErr
      return new Response(JSON.stringify({ status: 'revoked' }), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    const token = captureTokenFromRequest(request)
    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing capture token' }), {
        status: 401,
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    const tokenHash = await sha256Hex(token)
    const { data: device, error: deviceError } = await sb
      .from('capture_devices')
      .select('id')
      .eq('token_hash', tokenHash)
      .is('revoked_at', null)
      .maybeSingle()
    if (deviceError) throw deviceError
    if (!device) {
      return new Response(JSON.stringify({ error: 'Invalid capture token' }), {
        status: 401,
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }
    captureDeviceId = device.id

    normalizedText = normalizeText(body.text)
    const clientRequestId = normalizeText(body.client_request_id)
    if (!clientRequestId) {
      return new Response(JSON.stringify({ error: 'client_request_id is required' }), {
        status: 400,
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }
    if (!normalizedText) {
      return new Response(JSON.stringify({ error: 'text is required' }), {
        status: 400,
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    const { data: existingRequest, error: existingRequestError } = await sb
      .from('capture_requests')
      .select('status,resolved_intent,response_text,clarification_question,created_entities,confidence,correlation_id')
      .eq('capture_device_id', captureDeviceId)
      .eq('client_request_id', clientRequestId)
      .maybeSingle()
    if (existingRequestError) throw existingRequestError
    if (existingRequest) {
      return new Response(JSON.stringify({
        status: existingRequest.status,
        resolved_intent: existingRequest.resolved_intent,
        response_text: existingRequest.response_text,
        clarification_question: existingRequest.clarification_question,
        created_entities: Array.isArray(existingRequest.created_entities) ? existingRequest.created_entities : [],
        confidence: Number(existingRequest.confidence ?? 0),
        correlation_id: existingRequest.correlation_id,
      }), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    // 10-second rapid idempotency check (protects against iOS Shortcut double-tap or network retry storms)
    const tenSecondsAgo = new Date(Date.now() - 10000).toISOString()
    const { data: recentDuplicate } = await sb
      .from('capture_requests')
      .select('status,resolved_intent,response_text,clarification_question,created_entities,confidence,correlation_id')
      .eq('capture_device_id', captureDeviceId)
      .eq('normalized_text', normalizedText)
      .gte('created_at', tenSecondsAgo)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (recentDuplicate && recentDuplicate.status === 'executed') {
      return new Response(JSON.stringify({
        status: recentDuplicate.status,
        resolved_intent: recentDuplicate.resolved_intent,
        spoken_summary: enforceSpokenBrevity(recentDuplicate.response_text ?? ''),
        response_text: recentDuplicate.response_text,
        clarification_question: recentDuplicate.clarification_question,
        created_entities: Array.isArray(recentDuplicate.created_entities) ? recentDuplicate.created_entities : [],
        confidence: Number(recentDuplicate.confidence ?? 0.95),
        correlation_id: recentDuplicate.correlation_id,
      }), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    route = resolveCaptureCommand(normalizedText, {
      now: new Date(),
      utcOffset: normalizeText(body.utc_offset) || '-04:00',
      familyNames: ['Jake', 'Kelly', 'Liv', 'Emme', 'Owen'],
    }) as CaptureRoute

    await sb.from('capture_devices').update({ last_used_at: new Date().toISOString() }).eq('id', captureDeviceId)

    function enforceSpokenBrevity(text: string, maxWords = 15): string {
      const trimmed = (text || '').replace(/[\r\n]+/g, ' ').trim()
      if (!trimmed) return ''
      const words = trimmed.split(/\s+/)
      if (words.length <= maxWords) return trimmed
      return words.slice(0, maxWords).join(' ') + '.'
    }

    if (route.status !== 'execute') {
      const plannedRoute = await planCaptureActionWithLlm(normalizedText, {
        now: new Date(),
        utcOffset: normalizeText(body.utc_offset) || '-04:00',
        familyNames: ['Jake', 'Kelly', 'Liv', 'Emme', 'Owen'],
      })
      if (plannedRoute && plannedRoute.status === 'execute') {
        route = plannedRoute
      }
    }

    if (route.status !== 'execute') {
      const fallbackMsg = 'Could not recognize that quick action.'
      await sb.from('capture_requests').insert({
        capture_device_id: captureDeviceId,
        client_request_id: clientRequestId,
        channel: normalizeText(body.channel) || 'shortcut',
        request_mode: normalizeText(body.request_mode) || 'voice',
        raw_text: String(body.text ?? ''),
        normalized_text: normalizedText,
        status: 'unsupported',
        confidence: 0.2,
        latency_ms: Date.now() - startedAt,
        response_text: fallbackMsg,
      })
      return new Response(JSON.stringify({
        status: 'unsupported',
        resolved_intent: null,
        spoken_summary: enforceSpokenBrevity(fallbackMsg),
        response_text: fallbackMsg,
        clarification_question: null,
        created_entities: [],
        confidence: 0.2,
        correlation_id: null,
      }), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    const { data, error } = await sb.functions.invoke('execute-ai-action', {
      body: {
        tool: route.tool,
        args: route.args,
        correlation_id: clientRequestId,
        client_trace_source: 'capture-command',
      },
    })
    if (error) {
      let detailedMessage = error.message
      try {
        const anyErr = error as unknown as { context?: { json?: () => Promise<{ error?: string }> } }
        if (anyErr.context && typeof anyErr.context.json === 'function') {
          const errBody = await anyErr.context.json()
          if (errBody?.error) detailedMessage = errBody.error
        }
      } catch {
        // use fallback message
      }
      throw new Error(detailedMessage)
    }
    const payload = data && typeof data === 'object' ? data as Record<string, unknown> : {}
    if (payload.success === false && typeof payload.error === 'string') {
      throw new Error(payload.error)
    }
    const responseText = buildExecutionResponse(route, payload, normalizeText(body.utc_offset) || '-04:00')
    const spokenSummary = enforceSpokenBrevity(responseText)
    const createdEntities = route.tool === 'add_grocery_items'
      ? (Array.isArray(payload.items) ? payload.items.map((item) => ({ type: 'grocery_item', ...(item as Record<string, unknown>) })) : [])
      : payload.event_id
        ? [{ type: route.args.event_type === 'reminder' ? 'reminder' : 'event', id: payload.event_id }]
        : []

    await sb.from('capture_requests').insert({
      capture_device_id: captureDeviceId,
      client_request_id: clientRequestId,
      channel: normalizeText(body.channel) || 'shortcut',
      request_mode: normalizeText(body.request_mode) || 'voice',
      raw_text: String(body.text ?? ''),
      normalized_text: normalizedText,
      resolved_intent: resolvedIntent(route),
      status: 'executed',
      confidence: 0.95,
      latency_ms: Date.now() - startedAt,
      correlation_id: typeof payload.correlation_id === 'string' ? payload.correlation_id : null,
      response_text: responseText,
      created_entities: createdEntities,
    })

    return new Response(JSON.stringify({
      status: 'executed',
      resolved_intent: resolvedIntent(route),
      spoken_summary: spokenSummary,
      response_text: responseText,
      clarification_question: null,
      created_entities: createdEntities,
      confidence: 0.95,
      correlation_id: typeof payload.correlation_id === 'string' ? payload.correlation_id : null,
    }), {
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    console.error('[capture-command] failed:', message)
    if (captureDeviceId && normalizedText) {
      await sb.from('capture_requests').insert({
        capture_device_id: captureDeviceId,
        client_request_id: crypto.randomUUID(),
        channel: 'shortcut',
        request_mode: 'voice',
        raw_text: normalizedText,
        normalized_text: normalizedText,
        resolved_intent: route ? resolvedIntent(route) : null,
        status: 'failed',
        confidence: 0,
        latency_ms: Date.now() - startedAt,
        error_message: message.slice(0, 1000),
        response_text: 'Quick Actions could not complete that request right now.',
      }).then(() => {}).catch(() => {})
    }
    return new Response(JSON.stringify({
      status: 'failed',
      resolved_intent: route ? resolvedIntent(route) : null,
      response_text: 'Quick Actions could not complete that request right now.',
      clarification_question: null,
      created_entities: [],
      confidence: 0,
      correlation_id: null,
      error: message,
    }), {
      status: 500,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }
})
