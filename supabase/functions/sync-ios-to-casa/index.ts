import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireEnv } from '../_shared/env.ts'
import {
  normalizeComparableName,
} from '../_shared/grocery-normalization.ts'
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

type IncomingReminder = {
  reminder_id: string
  name?: string
  title?: string
  completed?: boolean
  notes?: string | null
  quantity?: string | null
  unit?: string | null
  category?: string | null
  deleted?: boolean
  updated_at?: string | null
}

type ExistingGroceryRow = {
  id: string
  ios_reminder_id: string | null
  ios_updated_at: string | null
  deleted_at: string | null
  name: string | null
  checked: boolean
}

function normalizeIso(iso?: string | null): string | null {
  if (!iso) return null
  const parsed = Date.parse(iso)
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    const sb = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))
    const { reminders } = await req.json().catch(() => ({ reminders: [] }))
    const incoming = Array.isArray(reminders) ? (reminders as IncomingReminder[]) : []
    const [catalogRows, aisleMappings] = await Promise.all([
      loadCatalogRows(sb),
      loadAisleMappings(sb),
    ])

    if (incoming.length === 0) {
      return new Response(JSON.stringify({ success: true, inserted: 0, updated: 0, deleted: 0, skipped_stale: 0 }), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    const { data: existingLists, error: listError } = await sb
      .from('grocery_lists')
      .select('id')
      .order('created_at')
      .limit(1)
    if (listError) throw new Error(listError.message)

    let listId = existingLists?.[0]?.id ?? null
    if (!listId) {
      const { data: createdList, error: createListError } = await sb
        .from('grocery_lists')
        .insert({ name: 'Weekly' })
        .select('id')
        .single()
      if (createListError) throw new Error(createListError.message)
      listId = createdList.id
    }

    const reminderIds = incoming.map((item) => item.reminder_id).filter(Boolean)
    const { data: existingRows, error: existingError } = await sb
      .from('grocery_items')
      .select('id, ios_reminder_id, ios_updated_at, deleted_at, name, checked')
      .in('ios_reminder_id', reminderIds)
    if (existingError) throw new Error(existingError.message)

    const { data: existingListRows, error: existingListRowsError } = await sb
      .from('grocery_items')
      .select('id, ios_reminder_id, ios_updated_at, deleted_at, name, checked')
      .eq('list_id', listId)
      .is('deleted_at', null)
    if (existingListRowsError) throw new Error(existingListRowsError.message)

    const existingByReminderId = new Map<string, ExistingGroceryRow>(
      ((existingRows ?? []) as ExistingGroceryRow[])
        .filter((row) => Boolean(row.ios_reminder_id))
        .map((row) => [row.ios_reminder_id as string, row])
    )
    const activeByName = new Map<string, ExistingGroceryRow[]>()
    for (const row of (existingListRows ?? []) as ExistingGroceryRow[]) {
      const key = normalizeComparableName(String(row.name ?? ''))
      if (!key) continue
      const bucket = activeByName.get(key)
      if (bucket) bucket.push(row)
      else activeByName.set(key, [row])
    }

    let inserted = 0
    let updated = 0
    let deleted = 0
    let skippedStale = 0

    for (const reminder of incoming) {
      if (!reminder.reminder_id) continue
      const existing = existingByReminderId.get(reminder.reminder_id)
      const incomingUpdatedAt = normalizeIso(reminder.updated_at) ?? new Date().toISOString()
      const existingUpdatedAt = normalizeIso(existing?.ios_updated_at ?? null)

      if (existingUpdatedAt && incomingUpdatedAt < existingUpdatedAt) {
        skippedStale += 1
        continue
      }

      const incomingName = (reminder.name ?? reminder.title ?? '').trim()
      const resolved = resolveGroceryFromCatalog(incomingName || 'Untitled', catalogRows, aisleMappings)
      const resolvedCategory = resolved.category
      const isDeleted = Boolean(reminder.deleted)

      if (existing) {
        if (isDeleted) {
          if (existing.deleted_at) continue
          const { error } = await sb
            .from('grocery_items')
            .update({
              deleted_at: new Date().toISOString(),
              last_modified_source: 'ios',
              ios_updated_at: incomingUpdatedAt,
            })
            .eq('id', existing.id)
          if (error) throw new Error(error.message)
          deleted += 1
          continue
        }

        const { error } = await sb
          .from('grocery_items')
          .update({
            name: incomingName || 'Untitled',
            quantity: reminder.quantity ?? null,
            unit: reminder.unit ?? null,
            category: resolvedCategory,
            subcategory: resolved.subcategory,
            store_section: resolved.storeSection,
            brand: resolved.brand,
            canonical_item_id: resolved.canonicalItemId,
            enhancement_confidence: resolved.confidence,
            enhanced_at: new Date().toISOString(),
            checked: Boolean(reminder.completed),
            notes: reminder.notes ?? null,
            deleted_at: null,
            last_modified_source: 'ios',
            ios_updated_at: incomingUpdatedAt,
          })
          .eq('id', existing.id)
        if (error) throw new Error(error.message)
        updated += 1
        continue
      }

      if (isDeleted) continue

      const comparableName = normalizeComparableName(incomingName || 'Untitled')
      const matchingByName = comparableName ? activeByName.get(comparableName) ?? [] : []
      if (matchingByName.length > 0) {
        const candidate = matchingByName[0]
        const { error } = await sb
          .from('grocery_items')
          .update({
            ios_reminder_id: reminder.reminder_id,
            name: incomingName || 'Untitled',
            quantity: reminder.quantity ?? null,
            unit: reminder.unit ?? null,
            category: resolvedCategory,
            subcategory: resolved.subcategory,
            store_section: resolved.storeSection,
            brand: resolved.brand,
            canonical_item_id: resolved.canonicalItemId,
            enhancement_confidence: resolved.confidence,
            enhanced_at: new Date().toISOString(),
            checked: Boolean(reminder.completed),
            notes: reminder.notes ?? null,
            deleted_at: null,
            last_modified_source: 'ios',
            ios_updated_at: incomingUpdatedAt,
          })
          .eq('id', candidate.id)
        if (error) throw new Error(error.message)
        existingByReminderId.set(reminder.reminder_id, {
          ...candidate,
          ios_reminder_id: reminder.reminder_id,
          ios_updated_at: incomingUpdatedAt,
          checked: Boolean(reminder.completed),
          name: incomingName || 'Untitled',
          deleted_at: null,
        })
        updated += 1
        continue
      }

      const comparableName = normalizeComparableName(incomingName || 'Untitled')
      const { error } = await sb.from('grocery_items').insert({
        list_id: listId,
        ios_reminder_id: reminder.reminder_id,
        name: incomingName || 'Untitled',
        quantity: reminder.quantity ?? null,
        unit: reminder.unit ?? null,
        category: resolvedCategory,
        subcategory: resolved.subcategory,
        store_section: resolved.storeSection,
        brand: resolved.brand,
        canonical_item_id: resolved.canonicalItemId,
        enhancement_confidence: resolved.confidence,
        enhanced_at: new Date().toISOString(),
        checked: Boolean(reminder.completed),
        notes: reminder.notes ?? null,
        last_modified_source: 'ios',
        ios_updated_at: incomingUpdatedAt,
      })
      if (!error) {
        inserted += 1
        continue
      }
      if (error.code !== '23505') throw new Error(error.message)

      const { error: conflictUpdateError } = await sb
        .from('grocery_items')
        .update({
          ios_reminder_id: reminder.reminder_id,
          name: incomingName || 'Untitled',
          quantity: reminder.quantity ?? null,
          unit: reminder.unit ?? null,
          category: resolvedCategory,
          subcategory: resolved.subcategory,
          store_section: resolved.storeSection,
          brand: resolved.brand,
          canonical_item_id: resolved.canonicalItemId,
          enhancement_confidence: resolved.confidence,
          enhanced_at: new Date().toISOString(),
          checked: Boolean(reminder.completed),
          notes: reminder.notes ?? null,
          deleted_at: null,
          last_modified_source: 'ios',
          ios_updated_at: incomingUpdatedAt,
        })
        .eq('list_id', listId)
        .eq('name_normalized', comparableName)
        .eq('checked', false)
        .is('deleted_at', null)
      if (conflictUpdateError) throw new Error(conflictUpdateError.message)
      updated += 1
    }

    return new Response(
      JSON.stringify({
        success: true,
        inserted,
        updated,
        deleted,
        skipped_stale: skippedStale,
        processed: incoming.length,
      }),
      { headers: { ...CORS, 'content-type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message ?? 'sync-ios-to-casa failed' }),
      { status: 500, headers: { ...CORS, 'content-type': 'application/json' } }
    )
  }
})
