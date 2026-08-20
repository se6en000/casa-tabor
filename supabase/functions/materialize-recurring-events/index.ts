import { createClient } from 'npm:@supabase/supabase-js@2'
import { getCorrelationId, withCorrelationHeaders } from '../_shared/correlation.ts'
import { requireEnv } from '../_shared/env.ts'
import { recurrenceEngine } from '../_shared/recurrence-engine.ts'

const JSON_HEADERS = { 'content-type': 'application/json' }
const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_PAST_DAYS = 90
const DEFAULT_FUTURE_MONTHS = 18
const MAX_BATCH_SIZE = 25

type RequestBody = {
  series_id?: string
  range_start?: string
  range_end?: string
  limit?: number
}

type SeriesRow = {
  id: string
  timezone: string
  recurrence_lines: string[]
  revision: number
  template_event_id: string
  template: {
    start_time: string
    end_time: string
    all_day: boolean
    status: string
    deleted_at: string | null
  } | null
}

function defaultRange(now: Date): { rangeStart: string; rangeEnd: string } {
  const rangeStart = new Date(now.getTime() - DEFAULT_PAST_DAYS * DAY_MS)
  const rangeEnd = new Date(now)
  rangeEnd.setUTCMonth(rangeEnd.getUTCMonth() + DEFAULT_FUTURE_MONTHS)
  return { rangeStart: rangeStart.toISOString(), rangeEnd: rangeEnd.toISOString() }
}

function requireIso(value: string | undefined, fallback: string, label: string): string {
  const resolved = value ?? fallback
  if (!Number.isFinite(new Date(resolved).getTime())) throw new Error(`Invalid ${label}.`)
  return new Date(resolved).toISOString()
}

function response(body: unknown, status: number, correlationId: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: withCorrelationHeaders(JSON_HEADERS, correlationId),
  })
}

Deno.serve(async (req) => {
  const correlationId = getCorrelationId(req, 'recurrence-materialize')
  if (req.method !== 'POST') return response({ success: false, error: 'POST required.' }, 405, correlationId)

  try {
    const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return response({ success: false, error: 'Service-role authorization required.' }, 403, correlationId)
    }

    const body = await req.json().catch(() => ({})) as RequestBody
    const supabase = createClient(requireEnv('SUPABASE_URL'), serviceRoleKey)
    const defaults = defaultRange(new Date())
    const rangeStart = requireIso(body.range_start, defaults.rangeStart, 'range_start')
    const rangeEnd = requireIso(body.range_end, defaults.rangeEnd, 'range_end')
    if (rangeEnd <= rangeStart) throw new Error('range_end must follow range_start.')

    if (!body.series_id) {
      const { data: setting, error: settingError } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'recurrence_v2_flags')
        .single()
      if (settingError) throw new Error(settingError.message)
      const flags = setting.value as Record<string, unknown>
      if (flags.recurrence_v2_read !== true && flags.recurrence_v2_write !== true) {
        return response({ success: true, processed: 0, skipped: 'recurrence_v2_disabled' }, 200, correlationId)
      }
    }

    let query = supabase
      .from('event_series')
      .select(`
        id, timezone, recurrence_lines, revision, template_event_id,
        template:events!event_series_template_event_id_fkey(start_time,end_time,all_day,status,deleted_at)
      `)
      .eq('status', 'active')
      .order('last_materialized_at', { ascending: true, nullsFirst: true })
      .limit(Math.max(1, Math.min(Number(body.limit) || MAX_BATCH_SIZE, MAX_BATCH_SIZE)))
    if (body.series_id) query = query.eq('id', body.series_id)

    const { data, error } = await query
    if (error) throw new Error(error.message)
    const seriesRows = (data ?? []) as unknown as SeriesRow[]
    if (body.series_id && seriesRows.length === 0) {
      return response({ success: false, error: 'Active recurring series not found.' }, 404, correlationId)
    }

    const results = []
    for (const series of seriesRows) {
      if (!series.template || series.template.status === 'cancelled' || Boolean(series.template.deleted_at)) {
        console.warn(`[Materialize] Series ${series.id} template is cancelled or deleted. Retiring series...`)
        const nowIso = new Date().toISOString()
        const purgeAfterIso = new Date(Date.now() + 30 * 86400000).toISOString()
        await supabase
          .from('event_series')
          .update({
            status: 'deleted',
            deleted_at: nowIso,
            purge_after: purgeAfterIso,
            updated_at: nowIso,
          })
          .eq('id', series.id)
        continue
      }

      const durationMs = new Date(series.template.end_time).getTime()
        - new Date(series.template.start_time).getTime()
      const generated = recurrenceEngine.generateOccurrences({
        dtstart: series.template.start_time,
        durationMs,
        recurrenceLines: series.recurrence_lines,
        timezone: series.timezone,
        rangeStart,
        rangeEnd,
        allDay: series.template.all_day,
      })
      if (generated.truncated) throw new Error(`Series ${series.id} exceeded the materialization limit.`)
      if (generated.wallTimeValidation.unexpected.length > 0) {
        throw new Error(
          `Series ${series.id} generated wall times that disagree with its template: `
          + generated.wallTimeValidation.unexpected.slice(0, 3).join(', '),
        )
      }

      const { data: reconciled, error: reconcileError } = await supabase.rpc(
        'recurrence_reconcile_materialized_occurrences',
        {
          p_series_id: series.id,
          p_expected_series_revision: series.revision,
          p_occurrences: generated.occurrences,
          p_range_start: rangeStart,
          p_range_end: rangeEnd,
          p_correlation_id: correlationId,
        },
      )
      if (reconcileError) {
        await supabase
          .from('event_series')
          .update({ materialization_error: reconcileError.message })
          .eq('id', series.id)
        throw new Error(`Series ${series.id}: ${reconcileError.message}`)
      }
      results.push(reconciled)
    }

    return response({ success: true, processed: results.length, results }, 200, correlationId)
  } catch (error) {
    return response(
      { success: false, error: error instanceof Error ? error.message : 'Materialization failed.' },
      500,
      correlationId,
    )
  }
})
