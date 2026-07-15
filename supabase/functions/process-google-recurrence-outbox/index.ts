import { createClient } from 'npm:@supabase/supabase-js@2'
import { getCorrelationId, withCorrelationHeaders } from '../_shared/correlation.ts'
import { requireEnv } from '../_shared/env.ts'
import {
  markGoogleConnectionFailure,
  markGoogleConnectionHealthy,
  resolveGoogleConnection,
  type CalendarConnection,
} from '../_shared/google-connection.ts'
import {
  serializeGoogleRecurrenceProjection,
} from '../_shared/google-recurrence-projection-core.mjs'
import {
  detectsGoogleConflict,
  deterministicGoogleEventId,
  isRetryableGoogleStatus,
  operationNeedsEvent,
  operationPlan,
} from '../_shared/google-recurrence-outbox-core.mjs'

type Json = Record<string, unknown>
type Operation = Json & {
  id: string
  operation_type: string
  series_id: string
  event_id: string | null
  connection_id: string
  casa_revision: number
  attempts: number
}

class GoogleApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'GOOGLE_CALENDAR_API_ERROR'
    this.status = status
  }
}

function response(body: Json, status: number, correlationId: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: withCorrelationHeaders({ 'content-type': 'application/json' }, correlationId),
  })
}

async function googleRequest(accessToken: string, url: string, method = 'GET', body?: Json) {
  const res = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await res.text()
  const payload = text ? JSON.parse(text) : {}
  if (!res.ok && !(method === 'DELETE' && res.status === 404)) {
    throw new GoogleApiError(res.status, payload?.error?.message ?? `Google Calendar ${method} failed.`)
  }
  return payload
}

function eventUrl(calendarId: string, eventId?: string | null) {
  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
  return eventId ? `${base}/${encodeURIComponent(eventId)}` : base
}

async function loadProjectionContext(supabase: ReturnType<typeof createClient>, operation: Operation) {
  const { data: series, error: seriesError } = await supabase
    .from('event_series')
    .select('*')
    .eq('id', operation.series_id)
    .single()
  if (seriesError) throw seriesError
  if (series.ownership === 'read_only_import') throw new Error('Read-only imported series cannot be projected to Google.')
  if (Number(series.revision) < Number(operation.casa_revision)) {
    throw new Error('Outbox operation targets a series revision that does not exist.')
  }
  const { data: template, error: templateError } = await supabase
    .from('events')
    .select('*')
    .eq('id', series.template_event_id)
    .single()
  if (templateError) throw templateError

  let event = template
  if (operationNeedsEvent(operation.operation_type)) {
    if (!operation.event_id) throw new Error(`${operation.operation_type} requires an occurrence event.`)
    const { data, error } = await supabase.from('events').select('*').eq('id', operation.event_id).single()
    if (error) throw error
    event = data
  }
  const { data: bundle, error: bundleError } = await supabase.rpc('recurrence_build_reusable_patch', {
    p_event_id: event.id,
  })
  if (bundleError) throw bundleError
  return { series, event, bundle }
}

async function saveGoogleIdentity(
  supabase: ReturnType<typeof createClient>,
  operation: Operation,
  series: Json,
  event: Json,
  google: Json,
  master: boolean,
) {
  const seriesPatch = master
    ? {
        google_recurring_event_id: google.id,
        google_ical_uid: google.iCalUID ?? null,
        google_etag: google.etag ?? null,
        google_updated_at: google.updated ?? null,
        last_projected_revision: operation.casa_revision,
      }
    : { last_projected_revision: operation.casa_revision }
  const { error: seriesError } = await supabase.from('event_series').update(seriesPatch).eq('id', series.id)
  if (seriesError) throw seriesError
  const { error: eventError } = await supabase.from('events').update({
    google_event_id: google.id,
    google_calendar_id: series.google_calendar_id,
    google_connection_id: operation.connection_id,
    google_ical_uid: google.iCalUID ?? null,
    google_etag: google.etag ?? null,
    google_updated_at: google.updated ?? null,
  }).eq('id', event.id)
  if (eventError) throw eventError
}

async function executeOperation(
  supabase: ReturnType<typeof createClient>,
  operation: Operation,
  connection: CalendarConnection,
  accessToken: string,
) {
  const { series, event, bundle } = await loadProjectionContext(supabase, operation)
  const steps = operationPlan(operation, series)
  let googleEvent: Json | null = null
  let conflictDetected = false

  for (const step of steps) {
    if (step === 'patch_parent_master') {
      const { data: parent, error } = await supabase.from('event_series').select('*').eq('id', series.parent_series_id).single()
      if (error) throw error
      if (!parent.google_recurring_event_id) continue
      const { data: parentEvent, error: parentEventError } = await supabase
        .from('events')
        .select('*')
        .eq('id', parent.template_event_id)
        .single()
      if (parentEventError) throw parentEventError
      const { data: parentBundle, error: parentBundleError } = await supabase.rpc('recurrence_build_reusable_patch', {
        p_event_id: parentEvent.id,
      })
      if (parentBundleError) throw parentBundleError
      const current = await googleRequest(accessToken, eventUrl(connection.calendar_id, parent.google_recurring_event_id))
      const payload = serializeGoogleRecurrenceProjection({
        event: parentEvent,
        series: parent,
        bundle: parentBundle,
        existingGoogleDescription: current.description ?? '',
      })
      await googleRequest(accessToken, eventUrl(connection.calendar_id, parent.google_recurring_event_id), 'PATCH', payload)
      continue
    }

    const targetId = step.includes('instance') ? event.google_event_id : series.google_recurring_event_id
    const current = targetId && !step.startsWith('cancel') && !step.startsWith('delete')
      ? await googleRequest(accessToken, eventUrl(connection.calendar_id, targetId))
      : null
    conflictDetected ||= detectsGoogleConflict(step.includes('instance') ? event : series, current)
    const payload = serializeGoogleRecurrenceProjection({
      event,
      series,
      bundle,
      existingGoogleDescription: current?.description ?? '',
    })
    if (step.includes('instance')) delete payload.recurrence

    if (step === 'create_master') {
      const deterministicId = deterministicGoogleEventId(operation.id)
      try {
        googleEvent = await googleRequest(accessToken, eventUrl(connection.calendar_id), 'POST', {
          id: deterministicId,
          ...payload,
        })
      } catch (cause) {
        if (!(cause instanceof GoogleApiError) || cause.status !== 409) throw cause
        googleEvent = await googleRequest(accessToken, eventUrl(connection.calendar_id, deterministicId))
      }
      await saveGoogleIdentity(supabase, operation, series, event, googleEvent, true)
    } else if (step === 'patch_master' || step === 'patch_instance') {
      if (!targetId) throw new Error(`${step} requires a Google event identity.`)
      googleEvent = await googleRequest(accessToken, eventUrl(connection.calendar_id, targetId), 'PATCH', payload)
      await saveGoogleIdentity(supabase, operation, series, event, googleEvent, step === 'patch_master')
    } else if (step === 'delete_master' || step === 'cancel_instance') {
      if (targetId) await googleRequest(accessToken, eventUrl(connection.calendar_id, targetId), 'DELETE')
    } else if (step === 'restore_instance') {
      if (!targetId) throw new Error('restore_instance requires a Google instance identity.')
      googleEvent = await googleRequest(accessToken, eventUrl(connection.calendar_id, targetId), 'PATCH', {
        ...payload,
        status: 'confirmed',
      })
      await saveGoogleIdentity(supabase, operation, series, event, googleEvent, false)
    }
  }
  return { googleEvent, conflictDetected, steps }
}

Deno.serve(async (req) => {
  const correlationId = getCorrelationId(req, 'google-recurrence-outbox')
  if (req.method !== 'POST') return response({ success: false, error: 'POST required.' }, 405, correlationId)
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  if (req.headers.get('authorization') !== `Bearer ${serviceRoleKey}`) {
    return response({ success: false, error: 'Service-role authorization required.' }, 403, correlationId)
  }
  const body = await req.json().catch(() => ({})) as { limit?: number; operation_id?: string }
  const supabase = createClient(requireEnv('SUPABASE_URL'), serviceRoleKey)
  const { data: flags, error: flagError } = await supabase.from('settings').select('value').eq('key', 'recurrence_v2_flags').single()
  if (flagError) return response({ success: false, error: flagError.message }, 500, correlationId)
  if (flags.value?.google_sync_v2 !== true && !body.operation_id) {
    return response({ success: true, skipped: 'google_sync_v2_disabled', processed: 0 }, 200, correlationId)
  }

  if (body.operation_id) {
    const { error } = await supabase.rpc('recurrence_retry_google_sync_operation', { p_operation_id: body.operation_id })
    if (error) return response({ success: false, error: error.message }, 409, correlationId)
  }
  const workerId = `${correlationId}:${crypto.randomUUID()}`
  const { data: operations, error: claimError } = await supabase.rpc('recurrence_claim_google_sync_operations', {
    p_worker_id: workerId,
    p_limit: Math.min(25, Math.max(1, body.limit ?? 10)),
  })
  if (claimError) return response({ success: false, error: claimError.message }, 500, correlationId)

  const results = []
  for (const operation of operations as Operation[]) {
    let resolved
    try {
      const { data: connection, error } = await supabase.from('calendar_connections').select('*').eq('id', operation.connection_id).single()
      if (error) throw error
      if (connection.access_mode !== 'writable') throw new Error('Outbox target is not a writable Google connection.')
      resolved = await resolveGoogleConnection(supabase, connection as CalendarConnection)
      const result = await executeOperation(supabase, operation, resolved.connection, resolved.accessToken)
      await supabase.rpc('recurrence_finish_google_sync_operation', {
        p_operation_id: operation.id,
        p_worker_id: workerId,
        p_success: true,
        p_google_response: result,
        p_conflict_detected: result.conflictDetected,
      })
      await markGoogleConnectionHealthy(supabase, operation.connection_id)
      results.push({ id: operation.id, status: 'succeeded', ...result })
    } catch (cause) {
      const error = cause instanceof Error
        ? cause
        : new Error(
            cause && typeof cause === 'object' && 'message' in cause
              ? String(cause.message)
              : JSON.stringify(cause),
          )
      const retryable = error instanceof GoogleApiError && isRetryableGoogleStatus(error.status)
      const { error: finishError } = await supabase.rpc('recurrence_finish_google_sync_operation', {
        p_operation_id: operation.id,
        p_worker_id: workerId,
        p_success: false,
        p_retryable: retryable,
        p_error: error.message,
      })
      if (resolved) await markGoogleConnectionFailure(supabase, operation.connection_id, error)
      results.push({ id: operation.id, status: retryable ? 'retrying' : 'failed', error: error.message, finish_error: finishError?.message })
    }
  }
  return response({ success: true, processed: results.length, results }, 200, correlationId)
})
