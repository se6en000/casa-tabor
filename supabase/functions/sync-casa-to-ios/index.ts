import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireEnv } from '../_shared/env.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type GroceryDeltaRow = {
  id: string
  list_id: string
  name: string
  quantity: string | null
  unit: string | null
  category: string
  checked: boolean
  notes: string | null
  updated_at: string
  deleted_at: string | null
  ios_reminder_id: string | null
  sync_version: number
  last_modified_source: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    const sb = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))
    const { since, limit = 200 } = await req.json().catch(() => ({}))
    const effectiveLimit = Math.max(1, Math.min(Number(limit) || 200, 500))

    // Preserve original timestamp precision (microseconds) to avoid re-reading
    // the same rows when cursor precision exceeds JS Date milliseconds.
    const parsedSince =
      typeof since === 'string' && !Number.isNaN(Date.parse(since))
        ? since
        : null

    let query = sb
      .from('grocery_items')
      .select(
        'id, list_id, name, quantity, unit, category, checked, notes, updated_at, deleted_at, ios_reminder_id, sync_version, last_modified_source'
      )
      .order('updated_at', { ascending: true })
      .limit(effectiveLimit)

    if (parsedSince) query = query.gt('updated_at', parsedSince)

    const { data, error } = await query
    if (error) throw new Error(error.message)

    const rows = (data ?? []) as GroceryDeltaRow[]
    const nextCursor = rows.length > 0 ? rows[rows.length - 1].updated_at : parsedSince

    return new Response(
      JSON.stringify({
        success: true,
        since: parsedSince,
        next_cursor: nextCursor,
        server_time: new Date().toISOString(),
        deltas: rows.map((row) => ({
          id: row.id,
          ios_reminder_id: row.ios_reminder_id,
          list_id: row.list_id,
          name: row.name,
          quantity: row.quantity,
          unit: row.unit,
          category: row.category,
          checked: row.checked,
          notes: row.notes,
          updated_at: row.updated_at,
          sync_version: row.sync_version,
          last_modified_source: row.last_modified_source,
          deleted: Boolean(row.deleted_at),
          deleted_at: row.deleted_at,
        })),
      }),
      { headers: { ...CORS, 'content-type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message ?? 'sync-casa-to-ios failed' }),
      { status: 500, headers: { ...CORS, 'content-type': 'application/json' } }
    )
  }
})
