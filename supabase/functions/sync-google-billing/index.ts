import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireEnv } from '../_shared/env.ts'
import { createGoogleServiceAccountToken } from '../_shared/google-service-account.mjs'
import {
  buildGoogleBillingQuery,
  rowsFromBigQuery,
  validateBillingTableIdentifier,
} from '../_shared/google-billing-query.mjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type ServiceAccount = {
  client_email: string
  private_key: string
  project_id: string
}

type BillingRow = {
  usage_date: string
  project_id: string
  project_name: string | null
  service_id: string | null
  service_name: string
  sku_id: string | null
  sku_name: string
  usage_quantity: number | null
  usage_unit: string | null
  subtotal_usd: number
  credits_usd: number
  cost_usd: number
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  })
}

function parseIsoDate(value: unknown, fallback: Date) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return fallback.toISOString().slice(0, 10)
  return text
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const sb = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))
  const today = new Date()
  const defaultStart = new Date(today.getTime() - 45 * 24 * 60 * 60 * 1000)
  const body = await req.json().catch(() => ({}))
  const periodStart = parseIsoDate(body?.period_start, defaultStart)
  const periodEnd = parseIsoDate(body?.period_end, today)
  if (periodStart > periodEnd) return json({ error: 'invalid_period' }, 400)

  const { data: run, error: runError } = await sb
    .from('billing_sync_runs')
    .insert({
      source: 'google_bigquery_detailed_export',
      period_start: periodStart,
      period_end: periodEnd,
      status: 'running',
    })
    .select('id')
    .single()
  if (runError || !run) return json({ error: `sync_run_create_failed:${runError?.message ?? 'unknown'}` }, 500)

  try {
    const serviceAccount = JSON.parse(requireEnv('GOOGLE_BILLING_SERVICE_ACCOUNT_JSON')) as ServiceAccount
    if (!serviceAccount.client_email || !serviceAccount.private_key || !serviceAccount.project_id) {
      throw new Error('invalid_google_billing_service_account')
    }
    const table = validateBillingTableIdentifier(requireEnv('GOOGLE_BILLING_TABLE'))
    const billingSchema = Deno.env.get('GOOGLE_BILLING_SCHEMA')?.trim().toLowerCase() || 'focus'
    const queryProject = Deno.env.get('GOOGLE_BILLING_QUERY_PROJECT')?.trim() || serviceAccount.project_id
    const accessToken = await createGoogleServiceAccountToken(
      serviceAccount,
      'https://www.googleapis.com/auth/bigquery.readonly',
    )
    const queryResponse = await fetch(
      `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(queryProject)}/queries`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          query: buildGoogleBillingQuery(table, billingSchema),
          useLegacySql: false,
          timeoutMs: 30000,
          parameterMode: 'NAMED',
          queryParameters: [
            { name: 'period_start', parameterType: { type: 'DATE' }, parameterValue: { value: periodStart } },
            { name: 'period_end', parameterType: { type: 'DATE' }, parameterValue: { value: periodEnd } },
          ],
        }),
      },
    )
    const queryPayload = await queryResponse.json().catch(() => null) as Record<string, unknown> | null
    if (!queryResponse.ok) throw new Error(`bigquery_query_failed:${queryResponse.status}`)
    if (queryPayload?.jobComplete !== true) throw new Error('bigquery_query_timeout')
    const rows = rowsFromBigQuery(queryPayload) as BillingRow[]
    const checksum = await sha256(JSON.stringify({ table, periodStart, periodEnd, rows }))

    const { data: billingImport, error: importError } = await sb
      .from('billing_imports')
      .upsert({
        source_type: 'google_detailed_export',
        source_name: table,
        source_checksum: checksum,
        period_start: periodStart,
        period_end: periodEnd,
        billing_state: 'provisional',
        row_count: rows.length,
        imported_at: new Date().toISOString(),
        metadata: { query_project: queryProject, billing_schema: billingSchema },
      }, { onConflict: 'source_checksum' })
      .select('id')
      .single()
    if (importError || !billingImport) {
      throw new Error(`billing_import_write_failed:${importError?.message ?? 'unknown'}`)
    }

    const lineItems = await Promise.all(rows.map(async (row) => ({
      ...row,
      import_id: billingImport.id,
      source_key: await sha256([
        row.usage_date,
        row.project_id,
        row.service_id ?? '',
        row.service_name,
        row.sku_id ?? '',
        row.sku_name,
        row.usage_unit ?? '',
      ].join('|')),
      metadata: {},
    })))
    if (lineItems.length > 0) {
      const { error: linesError } = await sb
        .from('billing_line_items')
        .upsert(lineItems, { onConflict: 'source_key' })
      if (linesError) throw new Error(`billing_line_items_write_failed:${linesError.message}`)
    }

    await sb.from('billing_sync_runs').update({
      status: 'success',
      row_count: rows.length,
      completed_at: new Date().toISOString(),
    }).eq('id', run.id)
    return json({
      ok: true,
      period_start: periodStart,
      period_end: periodEnd,
      row_count: rows.length,
      billing_state: 'provisional',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await sb.from('billing_sync_runs').update({
      status: 'error',
      error_class: message.split(':')[0],
      error_message: message.slice(0, 500),
      completed_at: new Date().toISOString(),
    }).eq('id', run.id)
    return json({ error: message }, 503)
  }
})
