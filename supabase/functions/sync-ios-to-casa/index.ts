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
  reminder_id?: string
  id?: string
  identifier?: string
  name?: string
  title?: string
  completed?: boolean
  notes?: string | null
  quantity?: string | null
  unit?: string | null
  category?: string | null
  deleted?: boolean
  updated_at?: string | null
  updatedAt?: string | null
  last_modified_at?: string | null
  lastModifiedAt?: string | null
}

type ExistingGroceryRow = {
  id: string
  list_id: string
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

function getReminderId(reminder: IncomingReminder): string {
  return String(
    reminder.reminder_id ??
    reminder.id ??
    reminder.identifier ??
    ''
  ).trim()
}

function getReminderName(reminder: IncomingReminder): string {
  return String(reminder.name ?? reminder.title ?? '').trim()
}

function getReminderUpdatedAt(reminder: IncomingReminder): string | null {
  return normalizeIso(
    reminder.updated_at ??
    reminder.updatedAt ??
    reminder.last_modified_at ??
    reminder.lastModifiedAt ??
    null
  )
}

function pickLatestReminder(a: IncomingReminder, b: IncomingReminder): IncomingReminder {
  const aUpdated = Date.parse(getReminderUpdatedAt(a) ?? '')
  const bUpdated = Date.parse(getReminderUpdatedAt(b) ?? '')
  if (Number.isNaN(aUpdated) && Number.isNaN(bUpdated)) return b
  if (Number.isNaN(aUpdated)) return b
  if (Number.isNaN(bUpdated)) return a
  return bUpdated >= aUpdated ? b : a
}

function filterIncomingReminders(reminders: IncomingReminder[]): {
  reminders: IncomingReminder[]
  skippedShadowedCompleted: number
  skippedDuplicateActiveName: number
} {
  const latestById = new Map<string, IncomingReminder>()
  for (const reminder of reminders) {
    const reminderId = getReminderId(reminder)
    if (!reminderId) continue
    const existing = latestById.get(reminderId)
    latestById.set(reminderId, existing ? pickLatestReminder(existing, reminder) : reminder)
  }

  const groupedByName = new Map<string, IncomingReminder[]>()
  const passthrough: IncomingReminder[] = []
  for (const reminder of latestById.values()) {
    const normalizedName = normalizeComparableName(getReminderName(reminder))
    if (!normalizedName || reminder.deleted) {
      passthrough.push(reminder)
      continue
    }
    const bucket = groupedByName.get(normalizedName)
    if (bucket) bucket.push(reminder)
    else groupedByName.set(normalizedName, [reminder])
  }

  let skippedShadowedCompleted = 0
  let skippedDuplicateActiveName = 0
  const filtered: IncomingReminder[] = [...passthrough]

  for (const bucket of groupedByName.values()) {
    const active = bucket.filter((reminder) => !reminder.completed)
    const completed = bucket.filter((reminder) => reminder.completed)

    if (active.length > 0) {
      const primaryActive = active.reduce((best, current) => pickLatestReminder(best, current))
      filtered.push(primaryActive)
      skippedDuplicateActiveName += Math.max(0, active.length - 1)
      skippedShadowedCompleted += completed.length
      continue
    }

    for (const completedReminder of completed) {
      filtered.push(completedReminder)
    }
  }

  return {
    reminders: filtered,
    skippedShadowedCompleted,
    skippedDuplicateActiveName,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  let debugReminderId = ''
  let debugReminderName = ''
  let debugStage = 'initial'

  try {
    const sb = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))
    const { reminders } = await req.json().catch(() => ({ reminders: [] }))
    const incomingRaw = Array.isArray(reminders) ? (reminders as IncomingReminder[]) : []
    const incomingFiltered = filterIncomingReminders(incomingRaw)
    const incoming = incomingFiltered.reminders
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

    const reminderIds = incoming.map((item) => getReminderId(item)).filter(Boolean)
    const { data: existingRows, error: existingError } = await sb
      .from('grocery_items')
      .select('id, list_id, ios_reminder_id, ios_updated_at, deleted_at, name, checked')
      .in('ios_reminder_id', reminderIds)
    if (existingError) throw new Error(existingError.message)

    const { data: existingListRows, error: existingListRowsError } = await sb
      .from('grocery_items')
      .select('id, list_id, ios_reminder_id, ios_updated_at, deleted_at, name, checked')
      .is('deleted_at', null)
      .eq('checked', false)
    if (existingListRowsError) throw new Error(existingListRowsError.message)

    const existingByReminderId = new Map<string, ExistingGroceryRow>(
      ((existingRows ?? []) as ExistingGroceryRow[])
        .filter((row) => Boolean(row.ios_reminder_id))
        .map((row) => [row.ios_reminder_id as string, row])
    )
    const activeByName = new Map<string, ExistingGroceryRow[]>()
    for (const row of (existingListRows ?? []) as ExistingGroceryRow[]) {
      if (!row.list_id) continue
      const key = normalizeComparableName(String(row.name ?? ''))
      if (!key) continue
      const scopedKey = `${row.list_id}|${key}`
      const bucket = activeByName.get(scopedKey)
      if (bucket) bucket.push(row)
      else activeByName.set(scopedKey, [row])
    }

    let inserted = 0
    let updated = 0
    let deleted = 0
    let skippedStale = 0
    let skippedMissingId = 0
    let mergedNameConflicts = 0
    debugStage = 'starting-loop'

    for (const reminder of incoming) {
      const reminderId = getReminderId(reminder)
      if (!reminderId) {
        skippedMissingId += 1
        continue
      }
      debugReminderId = reminderId
      debugReminderName = getReminderName(reminder)
      debugStage = 'loading-existing'
      const existing = existingByReminderId.get(reminderId)
      const incomingUpdatedAt = getReminderUpdatedAt(reminder) ?? new Date().toISOString()
      const existingUpdatedAt = normalizeIso(existing?.ios_updated_at ?? null)

      if (existingUpdatedAt && incomingUpdatedAt < existingUpdatedAt) {
        skippedStale += 1
        continue
      }

      const incomingName = getReminderName(reminder)
      const resolved = resolveGroceryFromCatalog(incomingName || 'Untitled', catalogRows, aisleMappings)
      const resolvedCategory = resolved.category
      const isDeleted = Boolean(reminder.deleted)
      const incomingChecked = Boolean(reminder.completed)
      const comparableName = normalizeComparableName(incomingName || 'Untitled')
      const targetListId = existing?.list_id ?? listId
      const matchingByName = comparableName ? activeByName.get(`${targetListId}|${comparableName}`) ?? [] : []

      if (!isDeleted && !incomingChecked && matchingByName.length > 0) {
        const candidate = matchingByName[0]
        if (!existing || existing.id !== candidate.id) {
          debugStage = 'claiming-name-match'
          const { error: claimError } = await sb
            .from('grocery_items')
            .update({
              ios_reminder_id: reminderId,
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
              checked: false,
              notes: reminder.notes ?? null,
              deleted_at: null,
              last_modified_source: 'ios',
              ios_updated_at: incomingUpdatedAt,
            })
            .eq('id', candidate.id)
          if (claimError) throw new Error(claimError.message)

          if (existing && existing.id !== candidate.id) {
            debugStage = 'tombstoning-previous-reminder-row'
            const { error: tombstoneError } = await sb
              .from('grocery_items')
              .update({
                deleted_at: new Date().toISOString(),
                last_modified_source: 'ios',
                ios_updated_at: incomingUpdatedAt,
              })
              .eq('id', existing.id)
            if (tombstoneError) throw new Error(tombstoneError.message)
          }

          existingByReminderId.set(reminderId, {
            ...candidate,
            ios_reminder_id: reminderId,
            ios_updated_at: incomingUpdatedAt,
            checked: false,
            name: incomingName || 'Untitled',
            deleted_at: null,
          })
          activeByName.set(`${targetListId}|${comparableName}`, [{
            ...candidate,
            ios_reminder_id: reminderId,
            ios_updated_at: incomingUpdatedAt,
            checked: false,
            name: incomingName || 'Untitled',
            deleted_at: null,
          }])
          updated += 1
          continue
        }
      }

      if (existing) {
        if (isDeleted) {
          if (existing.deleted_at) continue
          debugStage = 'marking-existing-deleted'
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

        debugStage = 'updating-existing-by-reminder-id'
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
            checked: incomingChecked,
            notes: reminder.notes ?? null,
            deleted_at: null,
            last_modified_source: 'ios',
            ios_updated_at: incomingUpdatedAt,
          })
          .eq('id', existing.id)
        if (error && error.code !== '23505') throw new Error(error.message)
        if (error?.code === '23505') {
          const comparableName = normalizeComparableName(incomingName || 'Untitled')
          if (!comparableName) throw new Error(error.message)

          debugStage = 'merging-existing-name-conflict'
          const { error: mergeError } = await sb
            .from('grocery_items')
            .update({
              ios_reminder_id: reminderId,
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
              checked: incomingChecked,
              notes: reminder.notes ?? null,
              deleted_at: null,
              last_modified_source: 'ios',
              ios_updated_at: incomingUpdatedAt,
            })
            .eq('list_id', listId)
            .eq('name_normalized', comparableName)
            .eq('checked', false)
            .is('deleted_at', null)
          if (mergeError) throw new Error(mergeError.message)

          debugStage = 'tombstoning-existing-after-merge'
          const { error: tombstoneError } = await sb
            .from('grocery_items')
            .update({
              deleted_at: new Date().toISOString(),
              last_modified_source: 'ios',
              ios_updated_at: incomingUpdatedAt,
            })
            .eq('id', existing.id)
          if (tombstoneError) throw new Error(tombstoneError.message)

          mergedNameConflicts += 1
        }
        updated += 1
        continue
      }

      if (isDeleted) continue

      if (matchingByName.length > 0) {
        const candidate = matchingByName[0]
        debugStage = 'updating-name-match'
        const { error } = await sb
          .from('grocery_items')
          .update({
            ios_reminder_id: reminderId,
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
            checked: incomingChecked,
            notes: reminder.notes ?? null,
            deleted_at: null,
            last_modified_source: 'ios',
            ios_updated_at: incomingUpdatedAt,
          })
          .eq('id', candidate.id)
        if (error) throw new Error(error.message)
        existingByReminderId.set(reminderId, {
          ...candidate,
          ios_reminder_id: reminderId,
          ios_updated_at: incomingUpdatedAt,
          checked: incomingChecked,
          name: incomingName || 'Untitled',
          deleted_at: null,
        })
        updated += 1
        continue
      }

      debugStage = 'inserting-new-row'
      const { error } = await sb.from('grocery_items').insert({
        list_id: targetListId,
        ios_reminder_id: reminderId,
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
        checked: incomingChecked,
        notes: reminder.notes ?? null,
        last_modified_source: 'ios',
        ios_updated_at: incomingUpdatedAt,
      })
      if (!error) {
        inserted += 1
        continue
      }
      if (error.code !== '23505') throw new Error(error.message)

      debugStage = 'resolving-insert-conflict-by-name'
      const { error: conflictUpdateError } = await sb
        .from('grocery_items')
        .update({
          ios_reminder_id: reminderId,
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
          checked: incomingChecked,
          notes: reminder.notes ?? null,
          deleted_at: null,
          last_modified_source: 'ios',
          ios_updated_at: incomingUpdatedAt,
        })
        .eq('list_id', targetListId)
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
        skipped_missing_id: skippedMissingId,
        merged_name_conflicts: mergedNameConflicts,
        skipped_shadowed_completed: incomingFiltered.skippedShadowedCompleted,
        skipped_duplicate_active_name: incomingFiltered.skippedDuplicateActiveName,
        processed: incoming.length,
        received: incomingRaw.length,
      }),
      { headers: { ...CORS, 'content-type': 'application/json' } }
    )
  } catch (error) {
    const message = (error as Error).message ?? 'sync-ios-to-casa failed'
    return new Response(
      JSON.stringify({
        success: false,
        error: message,
        debug: {
          reminder_id: debugReminderId || null,
          reminder_name: debugReminderName || null,
          stage: debugStage,
        },
      }),
      { status: 500, headers: { ...CORS, 'content-type': 'application/json' } }
    )
  }
})
