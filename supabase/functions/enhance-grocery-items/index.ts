import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireEnv } from '../_shared/env.ts'
import {
  loadAisleMappings,
  loadCatalogRows,
  resolveGroceryFromCatalog,
} from '../_shared/grocery-catalog.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type GroceryRow = {
  id: string
  name: string | null
  category: string | null
  subcategory: string | null
  store_section: string | null
  brand: string | null
  canonical_item_id: string | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    const { item_ids: itemIdsRaw, limit = 300, dry_run = false } = await req.json().catch(() => ({ item_ids: [], limit: 300, dry_run: false }))
    const itemIds = Array.isArray(itemIdsRaw)
      ? itemIdsRaw.filter((id) => typeof id === 'string' && id.trim().length > 0)
      : []
    const effectiveLimit = Math.max(1, Math.min(Number(limit) || 300, 2000))

    const sb = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))
    const [catalogRows, aisleMappings] = await Promise.all([
      loadCatalogRows(sb),
      loadAisleMappings(sb),
    ])

    let query = sb
      .from('grocery_items')
      .select('id, name, category, subcategory, store_section, brand, canonical_item_id')
      .eq('checked', false)
      .is('deleted_at', null)
      .limit(effectiveLimit)
      .order('updated_at', { ascending: false })

    if (itemIds.length > 0) {
      query = query.in('id', itemIds)
    }

    const { data, error } = await query
    if (error) throw new Error(error.message)

    const rows = (data ?? []) as GroceryRow[]
    const updates = rows.flatMap((row) => {
      const name = String(row.name ?? '').trim()
      if (!name) return []
      const resolved = resolveGroceryFromCatalog(name, catalogRows, aisleMappings)
      const changed =
        (row.category ?? 'other') !== resolved.category
        || (row.subcategory ?? null) !== (resolved.subcategory ?? null)
        || (row.store_section ?? null) !== (resolved.storeSection ?? null)
        || (row.brand ?? null) !== (resolved.brand ?? null)
        || (row.canonical_item_id ?? null) !== (resolved.canonicalItemId ?? null)
      if (!changed) return []
      return [{
        id: row.id,
        name,
        from_category: row.category ?? 'other',
        to_category: resolved.category,
        subcategory: resolved.subcategory,
        store_section: resolved.storeSection,
        brand: resolved.brand,
        canonical_item_id: resolved.canonicalItemId,
        confidence: resolved.confidence,
      }]
    })

    if (!dry_run) {
      for (const update of updates) {
        const { error: updateError } = await sb
          .from('grocery_items')
          .update({
            category: update.to_category,
            subcategory: update.subcategory,
            store_section: update.store_section,
            brand: update.brand,
            canonical_item_id: update.canonical_item_id,
            enhancement_confidence: update.confidence,
            enhanced_at: new Date().toISOString(),
            last_modified_source: 'casa',
          })
          .eq('id', update.id)
        if (updateError) throw new Error(updateError.message)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        dry_run: Boolean(dry_run),
        scanned_count: rows.length,
        enhanced_count: updates.length,
        updates: updates.slice(0, 150),
      }),
      { headers: { ...CORS, 'content-type': 'application/json' } },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message ?? 'enhance-grocery-items failed' }),
      { status: 500, headers: { ...CORS, 'content-type': 'application/json' } },
    )
  }
})
