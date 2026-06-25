import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireEnv } from '../_shared/env.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type GroceryRow = {
  id: string
  list_id: string
  name: string
  quantity: string | null
  unit: string | null
  category: string
  checked: boolean
  notes: string | null
  ios_reminder_id: string | null
  updated_at: string
  created_at: string
}

function normalizeComparableName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

function scoreRow(row: GroceryRow): number {
  let score = 0
  if (row.ios_reminder_id) score += 100
  if ((row.notes ?? '').trim().length > 0) score += 20
  if ((row.quantity ?? '').trim().length > 0) score += 10
  if ((row.unit ?? '').trim().length > 0) score += 5
  return score
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    const sb = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))
    const { dry_run: dryRunRaw } = await req.json().catch(() => ({ dry_run: false }))
    const dryRun = Boolean(dryRunRaw)

    const { data, error } = await sb
      .from('grocery_items')
      .select('id, list_id, name, quantity, unit, category, checked, notes, ios_reminder_id, updated_at, created_at')
      .eq('checked', false)
      .is('deleted_at', null)

    if (error) throw new Error(error.message)
    const rows = (data ?? []) as GroceryRow[]

    const groups = new Map<string, GroceryRow[]>()
    for (const row of rows) {
      const nameKey = normalizeComparableName(row.name)
      if (!nameKey) continue
      const key = `${row.list_id}::${nameKey}`
      const bucket = groups.get(key)
      if (bucket) bucket.push(row)
      else groups.set(key, [row])
    }

    const dedupePlans: Array<{
      list_id: string
      normalized_name: string
      keep_id: string
      remove_ids: string[]
      count: number
    }> = []
    const removeIds: string[] = []

    for (const [key, bucket] of groups.entries()) {
      if (bucket.length <= 1) continue

      const sorted = [...bucket].sort((a, b) => {
        const scoreDiff = scoreRow(b) - scoreRow(a)
        if (scoreDiff !== 0) return scoreDiff
        const updatedDiff = Date.parse(b.updated_at) - Date.parse(a.updated_at)
        if (updatedDiff !== 0) return updatedDiff
        return Date.parse(a.created_at) - Date.parse(b.created_at)
      })

      const keep = sorted[0]
      const remove = sorted.slice(1)
      const normalizedName = key.split('::')[1] ?? ''
      dedupePlans.push({
        list_id: keep.list_id,
        normalized_name: normalizedName,
        keep_id: keep.id,
        remove_ids: remove.map((row) => row.id),
        count: sorted.length,
      })
      for (const row of remove) removeIds.push(row.id)
    }

    if (!dryRun && removeIds.length > 0) {
      const { error: updateError } = await sb
        .from('grocery_items')
        .update({
          deleted_at: new Date().toISOString(),
          last_modified_source: 'casa',
        })
        .in('id', removeIds)
      if (updateError) throw new Error(updateError.message)
    }

    return new Response(JSON.stringify({
      success: true,
      dry_run: dryRun,
      duplicate_groups: dedupePlans.length,
      duplicate_rows: removeIds.length,
      sample: dedupePlans.slice(0, 20),
    }), {
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: (error as Error).message ?? 'dedupe-grocery-items failed',
    }), {
      status: 500,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }
})
