import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireEnv } from '../_shared/env.ts'
import { inferCategoryFromName } from '../_shared/grocery-normalization.ts'

type GroceryRow = {
  id: string
  name: string | null
  category: string | null
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    const { only_other = true, dry_run = false, limit = 1000 } = await req.json().catch(() => ({}))
    const effectiveLimit = Math.max(1, Math.min(Number(limit) || 1000, 5000))
    const sb = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))

    let query = sb
      .from('grocery_items')
      .select('id, name, category')
      .is('deleted_at', null)
      .eq('checked', false)
      .limit(effectiveLimit)

    if (only_other) {
      query = query.eq('category', 'other')
    }

    const { data, error } = await query
    if (error) throw new Error(error.message)

    const rows = (data ?? []) as GroceryRow[]
    const updates = rows.flatMap((row) => {
      const name = String(row.name ?? '').trim()
      if (!name) return []
      const inferred = inferCategoryFromName(name)
      if (!inferred || inferred === 'other') return []
      if (String(row.category ?? 'other') === inferred) return []
      return [{ id: row.id, name, from: String(row.category ?? 'other'), to: inferred }]
    })

    if (!dry_run) {
      for (const item of updates) {
        const { error: updateError } = await sb
          .from('grocery_items')
          .update({
            category: item.to,
            last_modified_source: 'casa',
          })
          .eq('id', item.id)
        if (updateError) throw new Error(updateError.message)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        dry_run: Boolean(dry_run),
        scanned_count: rows.length,
        recategorized_count: updates.length,
        updates,
      }),
      { headers: { ...CORS, 'content-type': 'application/json' } },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message ?? 'recategorize-grocery-items failed' }),
      { status: 500, headers: { ...CORS, 'content-type': 'application/json' } },
    )
  }
})
