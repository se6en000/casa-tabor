import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  inferCategoryFromName,
  normalizeComparableName,
} from './grocery-normalization.ts'

type CatalogRow = {
  id: string
  canonical_name: string
  category: string
  subcategory: string | null
  default_store_section: string | null
  aliases: string[] | null
  brand_keywords: string[] | null
}

type AisleRow = {
  category: string
  subcategory: string | null
  aisle_label: string
}

export type GroceryResolution = {
  canonicalItemId: string | null
  canonicalName: string
  category: string
  subcategory: string | null
  storeSection: string | null
  brand: string | null
  confidence: number
}

function tokenize(value: string): string[] {
  return normalizeComparableName(value).split(' ').filter(Boolean)
}

function normalizeToken(token: string): string {
  if (token.endsWith('es') && token.length > 4) return token.slice(0, -2)
  if (token.endsWith('s') && token.length > 3) return token.slice(0, -1)
  return token
}

function similarityScore(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  const aTokens = new Set(tokenize(a).map(normalizeToken))
  const bTokens = new Set(tokenize(b).map(normalizeToken))
  if (aTokens.size === 0 || bTokens.size === 0) return 0
  let overlap = 0
  for (const token of aTokens) {
    if (bTokens.has(token)) overlap += 1
  }
  const jaccard = overlap / (aTokens.size + bTokens.size - overlap)
  const containment = overlap / Math.min(aTokens.size, bTokens.size)
  const boost = overlap >= 2 ? 0.05 : 0
  return Math.min(1, Math.max(jaccard, containment * 0.9) + boost)
}

function detectBrand(name: string, keywords: string[] | null | undefined): string | null {
  if (!keywords || keywords.length === 0) return null
  const normalized = normalizeComparableName(name)
  for (const brand of keywords) {
    const b = normalizeComparableName(brand)
    if (!b) continue
    if (new RegExp(`(?:^|\\s)${b.replace(/\s+/g, '\\s+')}(?:\\s|$)`).test(normalized)) {
      return brand
    }
  }
  return null
}

function buildAliasPool(row: CatalogRow): string[] {
  const aliases = row.aliases ?? []
  return [row.canonical_name, ...aliases].map((value) => normalizeComparableName(value)).filter(Boolean)
}

export async function loadCatalogRows(sb: SupabaseClient): Promise<CatalogRow[]> {
  const { data, error } = await sb
    .from('grocery_catalog_items')
    .select('id, canonical_name, category, subcategory, default_store_section, aliases, brand_keywords')
    .limit(5000)
  if (error) throw new Error(error.message)
  return (data ?? []) as CatalogRow[]
}

export async function loadAisleMappings(sb: SupabaseClient): Promise<Map<string, string>> {
  const { data: storeRows, error: storeError } = await sb
    .from('grocery_store_profiles')
    .select('id')
    .eq('is_default', true)
    .limit(1)
  if (storeError) throw new Error(storeError.message)
  const storeId = storeRows?.[0]?.id
  if (!storeId) return new Map()

  const { data: aisleRows, error: aisleError } = await sb
    .from('grocery_aisle_mappings')
    .select('category, subcategory, aisle_label')
    .eq('store_profile_id', storeId)
  if (aisleError) throw new Error(aisleError.message)

  const map = new Map<string, string>()
  for (const row of (aisleRows ?? []) as AisleRow[]) {
    const key = `${row.category}::${row.subcategory ?? ''}`
    map.set(key, row.aisle_label)
    if (!row.subcategory) {
      map.set(`${row.category}::`, row.aisle_label)
    }
  }
  return map
}

export function resolveGroceryFromCatalog(
  name: string,
  catalog: CatalogRow[],
  aislesByCategorySubcategory: Map<string, string>,
): GroceryResolution {
  const normalized = normalizeComparableName(name)
  if (!normalized) {
    return {
      canonicalItemId: null,
      canonicalName: name.trim(),
      category: 'other',
      subcategory: null,
      storeSection: aislesByCategorySubcategory.get('other::') ?? 'Other',
      brand: null,
      confidence: 0,
    }
  }

  let best: { row: CatalogRow; score: number } | null = null
  const normalizedTokens = tokenize(normalized).map(normalizeToken)
  for (const row of catalog) {
    const pool = buildAliasPool(row)
    let rowBest = 0
    for (const alias of pool) {
      let score = similarityScore(normalized, alias)
      if (alias === normalized) {
        score = 1
      } else {
        const aliasTokens = tokenize(alias).map(normalizeToken)
        const aliasPhrase = alias.replace(/\s+/g, '\\s+')
        if (new RegExp(`(?:^|\\s)${aliasPhrase}(?:\\s|$)`).test(normalized)) {
          score = Math.max(score, 0.96)
        } else if (
          aliasTokens.length >= 2 &&
          aliasTokens.every((token) => normalizedTokens.includes(token))
        ) {
          score = Math.max(score, 0.93)
        } else if (
          normalizedTokens.length >= 2 &&
          normalizedTokens.every((token) => aliasTokens.includes(token))
        ) {
          score = Math.max(score, 0.9)
        }
      }
      if (score > rowBest) rowBest = score
      if (rowBest === 1) break
    }
    if (rowBest < 0.55) continue
    if (!best || rowBest > best.score) {
      best = { row, score: rowBest }
    }
  }

  if (!best) {
    const inferredCategory = inferCategoryFromName(name)
    return {
      canonicalItemId: null,
      canonicalName: name.trim(),
      category: inferredCategory,
      subcategory: null,
      storeSection: aislesByCategorySubcategory.get(`${inferredCategory}::`) ?? null,
      brand: null,
      confidence: 0.5,
    }
  }

  const { row, score } = best
  const storeSection =
    aislesByCategorySubcategory.get(`${row.category}::${row.subcategory ?? ''}`)
    ?? aislesByCategorySubcategory.get(`${row.category}::`)
    ?? row.default_store_section
    ?? null

  return {
    canonicalItemId: row.id,
    canonicalName: row.canonical_name,
    category: row.category,
    subcategory: row.subcategory,
    storeSection,
    brand: detectBrand(name, row.brand_keywords),
    confidence: Number(score.toFixed(4)),
  }
}
