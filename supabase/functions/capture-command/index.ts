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

function buildExecutionResponse(route: Extract<CaptureRoute, { status: 'execute' }>, data: Record<string, unknown>) {
  if (route.tool === 'add_grocery_items') {
    const created = Number(data.count ?? 0)
    const alreadyPresent = Number(data.already_present_count ?? 0)
    if (created > 0 && alreadyPresent > 0) {
      return `Added ${created} grocery ${created === 1 ? 'item' : 'items'}; ${alreadyPresent} ${alreadyPresent === 1 ? 'was' : 'were'} already on the list.`
    }
    if (created > 0) return `Added ${created} grocery ${created === 1 ? 'item' : 'items'} to the shopping list.`
    if (alreadyPresent > 0) return 'Those grocery items were already on the shopping list.'
    return 'I could not find any grocery items to add.'
  }

  if (typeof data.message === 'string' && data.message.trim()) {
    return data.message.trim()
  }

  const title = normalizeText(route.args.title)
  if (route.args.event_type === 'reminder') {
    return title ? `Reminder set: ${title}.` : 'Reminder created.'
  }
  return title ? `Event created: ${title}.` : 'Event created.'
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

    if (route.status === 'needs_clarification') {
      const responseText = route.clarification_question
      const spokenSummary = enforceSpokenBrevity(responseText)
      await sb.from('capture_requests').insert({
        capture_device_id: captureDeviceId,
        client_request_id: clientRequestId,
        channel: normalizeText(body.channel) || 'shortcut',
        request_mode: normalizeText(body.request_mode) || 'voice',
        raw_text: String(body.text ?? ''),
        normalized_text: normalizedText,
        status: 'needs_clarification',
        confidence: 0.5,
        latency_ms: Date.now() - startedAt,
        clarification_question: route.clarification_question,
        response_text: responseText,
      })
      return new Response(JSON.stringify({
        status: 'needs_clarification',
        resolved_intent: null,
        spoken_summary: spokenSummary,
        response_text: responseText,
        clarification_question: route.clarification_question,
        created_entities: [],
        confidence: 0.5,
        correlation_id: null,
      }), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    if (route.status === 'unsupported') {
      // Lane 2: Executive AI Assistant Fallback
      try {
        const { data: aiData, error: aiError } = await sb.functions.invoke('ai-assistant', {
          body: {
            messages: [{ role: 'user', content: normalizedText }],
            context: {
              page: 'quick-capture',
              currentDate: new Date().toISOString(),
              utcOffset: normalizeText(body.utc_offset) || '-04:00',
              captureChannel: normalizeText(body.channel) || 'shortcut',
            },
            correlation_id: clientRequestId,
            client_trace_source: 'capture-command-ai-lane',
            stream: false,
          },
        })

        if (!aiError && aiData && typeof aiData === 'object') {
          const aiPayload = aiData as Record<string, unknown>
          const assistantText = typeof aiPayload.text === 'string' && aiPayload.text.trim()
            ? aiPayload.text.trim()
            : typeof aiPayload.message === 'string' && aiPayload.message.trim()
              ? aiPayload.message.trim()
              : 'Done.'
          const spokenSummary = enforceSpokenBrevity(assistantText)

          await sb.from('capture_requests').insert({
            capture_device_id: captureDeviceId,
            client_request_id: clientRequestId,
            channel: normalizeText(body.channel) || 'shortcut',
            request_mode: normalizeText(body.request_mode) || 'voice',
            raw_text: String(body.text ?? ''),
            normalized_text: normalizedText,
            resolved_intent: 'ai_assistant_execution',
            status: 'executed',
            confidence: 0.9,
            latency_ms: Date.now() - startedAt,
            correlation_id: clientRequestId,
            response_text: assistantText,
            created_entities: [],
          })

          return new Response(JSON.stringify({
            status: 'executed',
            resolved_intent: 'ai_assistant_execution',
            spoken_summary: spokenSummary,
            response_text: assistantText,
            clarification_question: null,
            created_entities: [],
            confidence: 0.9,
            correlation_id: clientRequestId,
          }), {
            headers: { ...CORS, 'content-type': 'application/json' },
          })
        }
      } catch (aiFallbackError) {
        console.warn('[capture-command] AI assistant fallback failed:', aiFallbackError)
      }

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
        response_text: route.message,
      })
      return new Response(JSON.stringify({
        status: 'unsupported',
        resolved_intent: null,
        spoken_summary: enforceSpokenBrevity(route.message),
        response_text: route.message,
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
    const responseText = buildExecutionResponse(route, payload)
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
