import { createClient } from 'npm:@supabase/supabase-js@2'
import { formatInTimeZone } from 'npm:date-fns-tz@3'
import { getCorrelationId, withCorrelationHeaders } from '../_shared/correlation.ts'
import { requireEnv } from '../_shared/env.ts'
import {
  loadMemberGoogleConnection,
  resolveGoogleConnection,
  type CalendarConnection,
  type ResolvedGoogleConnection,
} from '../_shared/google-connection.ts'
import {
  classifyGoogleRecurrenceResource,
  googleRecurrenceListParams,
  isExpiredGoogleSyncCursor,
} from '../_shared/google-recurrence-import-core.mjs'

const JSON_HEADERS = { 'content-type': 'application/json' }

type RequestBody = {
  connection_id?: string
  family_member_id?: string
  force_full?: boolean
  adopt_resource_id?: string
}

type ImportResult = {
  connection_id: string
  run_id: string
  mode: 'initial' | 'incremental' | 'reconciliation'
  staged: number
  adopted: number
  linked: number
  next_sync_token: string
}

type GoogleResource = Record<string, unknown> & {
  id?: string
  recurringEventId?: string
  iCalUID?: string
  etag?: string
  updated?: string
  originalStartTime?: { dateTime?: string; date?: string; timeZone?: string }
  start?: { dateTime?: string; date?: string; timeZone?: string }
}

function occurrenceIdentity(item: GoogleResource, fallbackTimezone: string) {
  const original = item.originalStartTime
  if (!item.id || !item.recurringEventId || (!original?.dateTime && !original?.date)) return null
  const timezone = original.timeZone || item.start?.timeZone || fallbackTimezone
  return {
    google_event_id: item.id,
    google_recurring_event_id: item.recurringEventId,
    google_ical_uid: item.iCalUID ?? null,
    google_etag: item.etag ?? null,
    google_updated_at: item.updated ?? null,
    original_start_time: original.dateTime ?? null,
    original_start_date: original.date ?? null,
    occurrence_key: original.date
      ? original.date
      : `${formatInTimeZone(new Date(original.dateTime!), timezone, "yyyy-MM-dd'T'HH:mm:ss")}[${timezone}]`,
  }
}

function instanceWindow() {
  const now = new Date()
  const timeMin = new Date(now)
  timeMin.setUTCDate(timeMin.getUTCDate() - 90)
  const timeMax = new Date(now)
  timeMax.setUTCMonth(timeMax.getUTCMonth() + 18)
  return { timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString() }
}

async function linkMasterInstances(
  supabase: ReturnType<typeof createClient>,
  resolved: ResolvedGoogleConnection,
  masters: Map<string, string>,
): Promise<number> {
  const { timeMin, timeMax } = instanceWindow()
  const instanceRows = []
  for (const [masterId, timezone] of masters) {
    let pageToken: string | undefined
    do {
      const params = new URLSearchParams({
        timeMin,
        timeMax,
        showDeleted: 'true',
        maxResults: '2500',
      })
      if (pageToken) params.set('pageToken', pageToken)
      const googleResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(resolved.connection.calendar_id)}/events/${encodeURIComponent(masterId)}/instances?${params}`,
        { headers: { authorization: 'Bearer ' + resolved.accessToken } },
      )
      const payload = await googleResponse.json()
      if (!googleResponse.ok) {
        throw new Error(`Google instances ${googleResponse.status}: ${payload.error?.message ?? googleResponse.statusText}`)
      }
      for (const item of payload.items ?? []) {
        const identity = occurrenceIdentity(item, timezone)
        if (identity) instanceRows.push(identity)
      }
      pageToken = payload.nextPageToken
    } while (pageToken)
  }
  if (instanceRows.length === 0) return 0
  const { data, error } = await supabase.rpc('recurrence_link_google_occurrences_core', {
    p_connection_id: resolved.connection.id,
    p_instances: instanceRows,
  })
  if (error) throw new Error(error.message)
  return Number(data.linked ?? 0)
}

async function linkInstances(
  supabase: ReturnType<typeof createClient>,
  connectionId: string,
  instances: unknown[],
): Promise<number> {
  if (instances.length === 0) return 0
  const { data, error } = await supabase.rpc('recurrence_link_google_occurrences_core', {
    p_connection_id: connectionId,
    p_instances: instances,
  })
  if (error) throw new Error(error.message)
  return Number(data.linked ?? 0)
}

function response(body: unknown, status: number, correlationId: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: withCorrelationHeaders(JSON_HEADERS, correlationId),
  })
}

async function loadConnectionById(
  supabase: ReturnType<typeof createClient>,
  connectionId: string,
): Promise<ResolvedGoogleConnection> {
  const { data, error } = await supabase
    .from('calendar_connections')
    .select('*')
    .eq('id', connectionId)
    .eq('is_enabled', true)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Enabled Google connection not found.')
  return resolveGoogleConnection(supabase, data as CalendarConnection)
}

async function failRun(
  supabase: ReturnType<typeof createClient>,
  runId: string,
  connectionId: string,
  error: Error,
): Promise<void> {
  const now = new Date().toISOString()
  await Promise.all([
    supabase.from('google_recurrence_import_runs').update({
      status: 'failed',
      error_message: error.message,
      completed_at: now,
    }).eq('id', runId),
    supabase.from('calendar_connections').update({
      last_recurrence_sync_error: error.message,
    }).eq('id', connectionId),
  ])
}

async function importConnection(
  supabase: ReturnType<typeof createClient>,
  resolved: ResolvedGoogleConnection,
  correlationId: string,
  forceFull: boolean,
  reconciliation = false,
): Promise<ImportResult> {
  const { connection, accessToken } = resolved
  const syncToken = forceFull ? null : connection.recurrence_sync_token
  const mode = reconciliation ? 'reconciliation' : syncToken ? 'incremental' : 'initial'
  const { data: run, error: runError } = await supabase
    .from('google_recurrence_import_runs')
    .insert({
      connection_id: connection.id,
      correlation_id: reconciliation ? `${correlationId}:reconciliation` : correlationId,
      mode,
    })
    .select('id')
    .single()
  if (runError) throw new Error(runError.message)

  let pageToken: string | undefined
  let nextSyncToken: string | null = null
  let staged = 0
  let adopted = 0
  let linked: number
  const masterIds = new Map<string, string>()
  const directInstances = []
  try {
    do {
      const params = googleRecurrenceListParams({ syncToken, pageToken })
      const googleResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.calendar_id)}/events?${params}`,
        { headers: { authorization: 'Bearer ' + accessToken } },
      )
      if (isExpiredGoogleSyncCursor(googleResponse.status) && syncToken) {
        const expired = new Error('Google recurrence sync cursor expired; staged full reconciliation started.')
        await failRun(supabase, run.id, connection.id, expired)
        return importConnection(supabase, resolved, correlationId, true, true)
      }
      const payload = await googleResponse.json()
      if (!googleResponse.ok) {
        throw new Error(`Google Calendar ${googleResponse.status}: ${payload.error?.message ?? googleResponse.statusText}`)
      }
      const resources = (payload.items ?? [])
        .map((item: Record<string, unknown>) => classifyGoogleRecurrenceResource(item, connection))
        .filter(Boolean)
      for (const item of payload.items ?? []) {
        if (Array.isArray(item.recurrence) && !item.recurringEventId && item.id) {
          masterIds.set(item.id, item.start?.timeZone || 'America/New_York')
        }
        if (item.recurringEventId) {
          const identity = occurrenceIdentity(item, item.originalStartTime?.timeZone || 'America/New_York')
          if (identity) directInstances.push(identity)
        }
      }
      if (resources.length > 0) {
        const { data: stageResult, error: stageError } = await supabase.rpc(
          'recurrence_stage_google_resources_core',
          { p_run_id: run.id, p_resources: resources },
        )
        if (stageError) throw new Error(stageError.message)
        staged += Number(stageResult.staged ?? 0)
        if (connection.adoption_policy === 'automatic') {
          for (const resourceId of stageResult.master_resource_ids ?? []) {
            const { data: adoption, error: adoptionError } = await supabase.rpc(
              'recurrence_adopt_google_master_core',
              { p_resource_id: resourceId, p_explicit: false },
            )
            if (adoptionError) throw new Error(adoptionError.message)
            if (adoption.created) adopted += 1
          }
        }
      }
      pageToken = payload.nextPageToken
      if (payload.nextSyncToken) nextSyncToken = payload.nextSyncToken
    } while (pageToken)

    if (!nextSyncToken) throw new Error('Google recurrence import completed without a next sync token.')
    linked = await linkInstances(
      supabase,
      connection.id,
      directInstances.filter((item) => !masterIds.has(item.google_recurring_event_id)),
    )
    linked += await linkMasterInstances(supabase, resolved, masterIds)
    const { error: finalizeError } = await supabase.rpc(
      'recurrence_finalize_google_import_core',
      {
        p_run_id: run.id,
        p_next_sync_token: nextSyncToken,
        p_full_reconciliation: !syncToken,
      },
    )
    if (finalizeError) throw new Error(finalizeError.message)
    await supabase.from('google_recurrence_import_runs').update({
      adopted_master_count: adopted,
      linked_occurrence_count: linked,
    }).eq('id', run.id)
    return {
      connection_id: connection.id,
      run_id: run.id,
      mode,
      staged,
      adopted,
      linked,
      next_sync_token: nextSyncToken,
    }
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause))
    await failRun(supabase, run.id, connection.id, error)
    throw error
  }
}

Deno.serve(async (req) => {
  const correlationId = getCorrelationId(req, 'google-recurrence-import')
  if (req.method !== 'POST') return response({ success: false, error: 'POST required.' }, 405, correlationId)
  try {
    const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
    if (req.headers.get('authorization') !== 'Bearer ' + serviceRoleKey) {
      return response({ success: false, error: 'Service-role authorization required.' }, 403, correlationId)
    }
    const body = await req.json().catch(() => ({})) as RequestBody
    const supabase = createClient(requireEnv('SUPABASE_URL'), serviceRoleKey)

    if (body.adopt_resource_id) {
      const { data, error } = await supabase.rpc('recurrence_adopt_google_master_core', {
        p_resource_id: body.adopt_resource_id,
        p_explicit: true,
      })
      if (error) throw new Error(error.message)
      return response({ success: true, adoption: data }, 200, correlationId)
    }

    if (!body.connection_id && !body.family_member_id) {
      const { data: setting, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'recurrence_v2_flags')
        .single()
      if (error) throw new Error(error.message)
      if ((setting.value as Record<string, unknown>).google_sync_v2 !== true) {
        return response({ success: true, processed: 0, skipped: 'google_sync_v2_disabled' }, 200, correlationId)
      }
    }

    let connections: ResolvedGoogleConnection[]
    if (body.connection_id) {
      connections = [await loadConnectionById(supabase, body.connection_id)]
    } else if (body.family_member_id) {
      connections = [await loadMemberGoogleConnection(supabase, body.family_member_id)]
    } else {
      const { data, error } = await supabase
        .from('calendar_connections')
        .select('*')
        .eq('is_enabled', true)
        .order('created_at')
      if (error) throw new Error(error.message)
      connections = []
      for (const connection of data ?? []) {
        connections.push(await resolveGoogleConnection(supabase, connection as CalendarConnection))
      }
    }

    const results = []
    for (const resolved of connections) {
      results.push(await importConnection(
        supabase,
        resolved,
        `${correlationId}:${resolved.connection.id}`,
        body.force_full === true,
      ))
    }
    return response({ success: true, processed: results.length, results }, 200, correlationId)
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause))
    console.error('[import-google-recurrence]', correlationId, error.message)
    return response({ success: false, error: error.message }, 500, correlationId)
  }
})
