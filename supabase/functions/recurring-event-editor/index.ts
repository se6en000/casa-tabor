import { createClient } from 'npm:@supabase/supabase-js@2'
import { getCorrelationId, withCorrelationHeaders } from '../_shared/correlation.ts'
import { requireEnv } from '../_shared/env.ts'
import { loadRecurrenceFeatureFlags } from '../_shared/recurrence-feature-flags.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-correlation-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const JSON_HEADERS = { ...CORS, 'content-type': 'application/json' }

type LoadBody = {
  action: 'load'
  selected_event_id: string
}

type SaveBody = {
  action: 'save'
  selected_event_id: string
  action_id: string
  scope: 'this' | 'future' | 'all'
  expected_series_revision: number
  changed_paths: string[]
  detail_patch: Record<string, unknown>
  series_patch: Record<string, unknown>
}

function response(body: unknown, status: number, correlationId: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: withCorrelationHeaders(JSON_HEADERS, correlationId),
  })
}

function requireUuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${label} must be a UUID.`)
  }
  return value
}

Deno.serve(async (req) => {
  const correlationId = getCorrelationId(req, 'recurring-event-editor')
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return response({ success: false, error: 'POST required.' }, 405, correlationId)

  try {
    const body = await req.json() as LoadBody | SaveBody
    requireUuid(body.selected_event_id, 'selected_event_id')
    const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))
    const flags = await loadRecurrenceFeatureFlags(supabase)

    if (body.action === 'load') {
      if (!flags.recurrence_v2_read) {
        return response({ success: true, enabled: false }, 200, correlationId)
      }
      const { data, error } = await supabase.rpc('recurrence_get_editor_context_core', {
        p_selected_event_id: body.selected_event_id,
      })
      if (error) throw new Error(error.message)
      return response({
        success: true,
        enabled: true,
        writable: flags.recurrence_v2_write && data.series.ownership !== 'read_only_import',
        context: data,
      }, 200, correlationId)
    }

    if (body.action !== 'save') throw new Error('Unsupported editor action.')
    if (!flags.recurrence_v2_write) {
      return response({ success: false, error: 'Recurring event editing is not enabled yet.' }, 200, correlationId)
    }
    if (!['this', 'future', 'all'].includes(body.scope)) throw new Error('Unsupported recurrence scope.')
    if (!Number.isSafeInteger(body.expected_series_revision) || body.expected_series_revision < 1) {
      throw new Error('expected_series_revision must be a positive integer.')
    }
    if (!Array.isArray(body.changed_paths)) throw new Error('changed_paths must be an array.')
    const { data, error } = await supabase.rpc('recurrence_apply_scoped_mutation_core', {
      p_action_id: body.action_id,
      p_selected_event_id: body.selected_event_id,
      p_scope: body.scope,
      p_mutation_type: 'update',
      p_expected_series_revision: body.expected_series_revision,
      p_changed_paths: body.changed_paths,
      p_detail_patch: body.detail_patch,
      p_series_patch: body.series_patch,
      p_actor: { source: 'event-editor' },
      p_correlation_id: correlationId,
    })
    if (error) {
      const conflict = error.code === '40001' || error.message.includes('Recurring series changed')
      return response({
        success: false,
        conflict,
        error: conflict
          ? 'This recurring event changed on another device. Your draft is still here; review the latest series and try again.'
          : error.message,
      }, 200, correlationId)
    }

    for (const seriesId of [data.series_id, data.future_series_id].filter(Boolean)) {
      const materialize = await supabase.functions.invoke('materialize-recurring-events', {
        body: { series_id: seriesId },
        headers: { Authorization: 'Bearer ' + requireEnv('SUPABASE_SERVICE_ROLE_KEY') },
      })
      if (materialize.error || materialize.data?.success === false) {
        throw new Error(`Casa saved the series, but occurrence refresh failed: ${materialize.error?.message ?? materialize.data?.error}`)
      }
    }
    return response({ success: true, result: data }, 200, correlationId)
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause))
    console.error('[recurring-event-editor]', correlationId, error.message)
    return response({ success: false, error: error.message }, 500, correlationId)
  }
})
