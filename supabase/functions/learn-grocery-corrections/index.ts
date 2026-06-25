import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireEnv } from '../_shared/env.ts'
import { loadAisleMappings, loadCatalogRows, resolveGroceryFromCatalog } from '../_shared/grocery-catalog.ts'
import { normalizeComparableName } from '../_shared/grocery-normalization.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type CorrectionRow = {
  id: string
  item_name: string | null
  to_category: string
  created_at: string
}

function titleCase(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    const {
      dry_run = false,
      min_votes = 2,
      lookback_days = 30,
      limit = 400,
    } = await req.json().catch(() => ({}))
    const minVotes = Math.max(1, Number(min_votes) || 2)
    const lookbackDays = Math.max(1, Number(lookback_days) || 30)
    const maxRows = Math.max(1, Math.min(Number(limit) || 400, 2000))
    const sinceIso = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString()

    const sb = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))
    const [catalogRows, aisleMappings] = await Promise.all([
      loadCatalogRows(sb),
      loadAisleMappings(sb),
    ])

    const { data, error } = await sb
      .from('grocery_category_corrections')
      .select('id, item_name, to_category, created_at')
      .is('applied_at', null)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(maxRows)
    if (error) throw new Error(error.message)

    const rows = (data ?? []) as CorrectionRow[]
    const grouped = new Map<string, { names: string[]; categoryVotes: Map<string, number>; correctionIds: string[] }>()
    for (const row of rows) {
      const normalized = normalizeComparableName(row.item_name ?? '')
      if (!normalized) continue
      const existing = grouped.get(normalized) ?? { names: [], categoryVotes: new Map(), correctionIds: [] }
      existing.names.push((row.item_name ?? '').trim() || normalized)
      existing.categoryVotes.set(row.to_category, (existing.categoryVotes.get(row.to_category) ?? 0) + 1)
      existing.correctionIds.push(row.id)
      grouped.set(normalized, existing)
    }

    const actions: Array<{ normalized: string; category: string; votes: number; sampleName: string; correctionIds: string[] }> = []
    for (const [normalized, group] of grouped.entries()) {
      const sortedVotes = Array.from(group.categoryVotes.entries()).sort((a, b) => b[1] - a[1])
      const winner = sortedVotes[0]
      const runnerUpVotes = sortedVotes[1]?.[1] ?? 0
      if (!winner) continue
      if (winner[1] < minVotes) continue
      if (winner[1] <= runnerUpVotes) continue
      const sampleName = group.names[0] ?? normalized
      actions.push({
        normalized,
        category: winner[0],
        votes: winner[1],
        sampleName,
        correctionIds: group.correctionIds,
      })
    }

    const appliedRules: Array<{ item: string; category: string; mode: 'update' | 'insert'; votes: number }> = []
    for (const action of actions) {
      const resolved = resolveGroceryFromCatalog(action.sampleName, catalogRows, aisleMappings)
      const section = aisleMappings.get(`${action.category}::`) ?? action.category

      if (!dry_run) {
        if (resolved.canonicalItemId && resolved.confidence >= 0.9) {
          const row = catalogRows.find((entry) => entry.id === resolved.canonicalItemId)
          const aliasSet = new Set([...(row?.aliases ?? []), action.sampleName].filter(Boolean))
          const { error: updateError } = await sb
            .from('grocery_catalog_items')
            .update({
              category: action.category,
              aliases: Array.from(aliasSet),
              default_store_section: section,
              updated_at: new Date().toISOString(),
            })
            .eq('id', resolved.canonicalItemId)
          if (updateError) throw new Error(updateError.message)
          appliedRules.push({ item: action.sampleName, category: action.category, mode: 'update', votes: action.votes })
        } else {
          const { error: insertError } = await sb
            .from('grocery_catalog_items')
            .upsert({
              canonical_name: titleCase(action.sampleName),
              category: action.category,
              subcategory: null,
              default_store_section: section,
              aliases: [action.sampleName],
              brand_keywords: [],
            }, { onConflict: 'canonical_name_normalized' })
          if (insertError) throw new Error(insertError.message)
          appliedRules.push({ item: action.sampleName, category: action.category, mode: 'insert', votes: action.votes })
        }

        const { error: markError } = await sb
          .from('grocery_category_corrections')
          .update({ applied_at: new Date().toISOString() })
          .in('id', action.correctionIds)
        if (markError) throw new Error(markError.message)
      } else {
        appliedRules.push({
          item: action.sampleName,
          category: action.category,
          mode: resolved.canonicalItemId && resolved.confidence >= 0.9 ? 'update' : 'insert',
          votes: action.votes,
        })
      }
    }

    return new Response(JSON.stringify({
      success: true,
      dry_run: Boolean(dry_run),
      scanned_count: rows.length,
      candidate_rules: actions.length,
      applied_count: appliedRules.length,
      applied_rules: appliedRules,
    }), {
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: (error as Error).message ?? 'learn-grocery-corrections failed',
    }), {
      status: 500,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }
})
