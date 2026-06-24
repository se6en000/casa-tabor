import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  RECURRING_EDIT_ERROR,
  buildValidatedUpdatePayload,
} from '../_shared/ai-event-edit.mjs'
import {
  deriveImpactedEnrichmentFields,
  hasSmartEnrichmentInputs,
} from '../_shared/enrichment-impact.mjs'
import { requireEnv } from '../_shared/env.mjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GROCERY_CATEGORIES = new Set([
  'produce',
  'dairy',
  'meat',
  'pantry',
  'frozen',
  'bakery',
  'beverages',
  'other',
])

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  produce: ['apple', 'banana', 'orange', 'berry', 'lettuce', 'spinach', 'broccoli', 'carrot', 'tomato', 'onion', 'avocado', 'lemon', 'lime', 'grape', 'cucumber', 'potato', 'mushroom'],
  dairy: ['milk', 'cheese', 'butter', 'cream', 'yogurt', 'egg', 'mozzarella', 'cheddar', 'parmesan'],
  meat: ['chicken', 'beef', 'steak', 'pork', 'fish', 'salmon', 'tuna', 'shrimp', 'turkey', 'bacon', 'sausage'],
  bakery: ['bread', 'bagel', 'muffin', 'croissant', 'bun', 'roll', 'tortilla', 'pita'],
  frozen: ['frozen', 'ice cream', 'sorbet', 'pizza', 'fries', 'waffle'],
  pantry: ['pasta', 'rice', 'cereal', 'oat', 'flour', 'sugar', 'salt', 'oil', 'vinegar', 'sauce', 'soup', 'bean', 'lentil', 'spice', 'seasoning', 'ketchup', 'mustard', 'mayo'],
  beverages: ['water', 'juice', 'soda', 'coffee', 'tea', 'beer', 'wine', 'sparkling', 'lemonade', 'drink'],
}

const NAME_NORMALIZATION_RULES: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bcoca[\s-]?cola\b|\bcoke\b/i, replacement: 'Coca-Cola' },
  { pattern: /\bdr[\s.]?pepper\b/i, replacement: 'Dr Pepper' },
  { pattern: /\bgatorade\b/i, replacement: 'Gatorade' },
  { pattern: /\bred ?bull\b/i, replacement: 'Red Bull' },
  { pattern: /\bpaper ?towels?\b/i, replacement: 'paper towels' },
  { pattern: /\btoilet ?paper\b/i, replacement: 'toilet paper' },
]

function toTitleCase(value: string): string {
  return value
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ')
}

function normalizeGroceryName(rawName: string): { name: string; normalizedFrom?: string } {
  const trimmed = rawName.trim().replace(/\s+/g, ' ')
  if (!trimmed) return { name: '' }
  for (const rule of NAME_NORMALIZATION_RULES) {
    if (rule.pattern.test(trimmed)) {
      return { name: rule.replacement, normalizedFrom: trimmed }
    }
  }
  return { name: toTitleCase(trimmed) }
}

function inferCategory(inputCategory: unknown, itemName: string): string {
  if (typeof inputCategory === 'string') {
    const normalizedCategory = inputCategory.trim().toLowerCase()
    if (GROCERY_CATEGORIES.has(normalizedCategory)) return normalizedCategory
  }
  const lower = itemName.toLowerCase()
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((keyword) => lower.includes(keyword))) return category
  }
  return 'other'
}

function normalizeComparableName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

async function getExistingActionResult(sb: ReturnType<typeof createClient>, actionId?: string) {
  if (!actionId) return null
  const { data, error } = await sb
    .from('ai_event_edit_history')
    .select('result_payload')
    .eq('action_id', actionId)
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) throw new Error(error.message)
  return data?.[0]?.result_payload ?? null
}

async function updateAuditResult(
  sb: ReturnType<typeof createClient>,
  historyId: string | null | undefined,
  payload: Record<string, unknown>,
  syncStatus: 'not_needed' | 'pending' | 'retrying' | 'succeeded' | 'failed',
  errorMessage?: string,
) {
  if (!historyId) return
  const { error } = await sb
    .from('ai_event_edit_history')
    .update({
      result_payload: payload,
      sync_status: syncStatus,
      error_message: errorMessage ?? null,
    })
    .eq('id', historyId)

  if (error) throw new Error(error.message)
}

async function queueGoogleSyncRetry(
  sb: ReturnType<typeof createClient>,
  eventId: string,
  historyId: string | null | undefined,
  syncError: string,
) {
  const { data, error } = await sb.rpc('enqueue_google_sync_job', {
    p_event_id: eventId,
    p_audit_history_id: historyId ?? null,
    p_error: syncError,
  })
  if (error) throw new Error(error.message)
  return data as string | null
}

async function finalizeEventSync(
  sb: ReturnType<typeof createClient>,
  eventId: string,
  historyId: string | null | undefined,
  response: Record<string, unknown>,
) {
  const syncRes = await sb.functions.invoke('push-to-google', {
    body: { event_id: eventId },
  }).catch((err: Error) => ({ data: null, error: err }))

  const syncError = syncRes?.error?.message ?? syncRes?.data?.error ?? null
  if (!syncError) {
    const syncedResponse = { ...response, sync_status: 'synced' }
    await updateAuditResult(sb, historyId, syncedResponse, 'succeeded')
    return syncedResponse
  }

  try {
    const syncJobId = await queueGoogleSyncRetry(sb, eventId, historyId, syncError)
    const queuedResponse = {
      ...response,
      sync_warning: `Saved in Casa Tabor. Google sync failed for now and was queued to retry automatically: ${syncError}`,
      sync_status: 'queued',
      sync_job_id: syncJobId,
    }
    await updateAuditResult(sb, historyId, queuedResponse, 'pending', syncError)
    return queuedResponse
  } catch (queueError) {
    const failedResponse = {
      ...response,
      sync_warning: `Saved in Casa Tabor, but Google sync failed and retry queueing also failed: ${syncError}`,
      sync_status: 'failed',
    }
    await updateAuditResult(
      sb,
      historyId,
      failedResponse,
      'failed',
      `${syncError}; retry queue error: ${(queueError as Error).message ?? 'unknown error'}`,
    )
    return failedResponse
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const sb = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))
  const {
    tool,
    args,
    action_id: actionId,
    session_id: sessionId,
    correlation_id: correlationId,
  } = await req.json()
  const cid = correlationId ?? `${sessionId ?? 'no-session'}:${actionId ?? 'no-action'}`
  console.log(`[execute-ai-action][${cid}] start tool=${tool}`)

  try {
    if (tool === 'create_event') {
      const { data: event, error } = await sb.from('events').insert({
        title: args.title,
        start_time: args.start,
        end_time: args.end,
        location_name: args.location ?? null,
        all_day: args.all_day ?? false,
        description: args.notes ?? null,
        status: 'confirmed',
        is_enriched: false,
        event_type: args.event_type ?? 'event',
      }).select().single()

      if (error) throw new Error(error.message)

      // Add members
      if (args.members?.length > 0) {
        const { data: family } = await sb.from('family_members').select('id, name')
        const memberIds = (args.members as string[])
          .map((name: string) => (family ?? []).find((f: { id: string; name: string }) => f.name.toLowerCase() === name.toLowerCase())?.id)
          .filter(Boolean)
        if (memberIds.length > 0) {
          await sb.from('event_members').insert(
            memberIds.map((id, i) => ({ event_id: event.id, family_member_id: id, role: i === 0 ? 'primary' : 'attendee' }))
          )
        }
      }

      // Fire enrichment async (slow — Gemini AI, don't block)
      sb.functions.invoke('enrich-event', { body: { event_id: event.id } }).catch(() => {})
      // Await Google sync — fire-and-forget can be killed before completion in Deno Deploy
      await sb.functions.invoke('create-google-event', { body: { event_id: event.id } }).catch(() => {})

      return new Response(JSON.stringify({ success: true, event_id: event.id, correlation_id: cid }), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    if (tool === 'update_event') {
      const existingResult = await getExistingActionResult(sb, actionId)
      if (existingResult) {
        return new Response(JSON.stringify({ ...existingResult, correlation_id: cid }), {
          headers: { ...CORS, 'content-type': 'application/json' },
        })
      }

      const { errors, normalized } = buildValidatedUpdatePayload(args)
      if (errors.length > 0) {
        throw new Error(errors.join('; '))
      }

      const { data: eventRow, error: eventLoadError } = await sb
        .from('events')
        .select('id, event_type, google_event_id, recurrence_master_id, rrule, updated_at')
        .eq('id', normalized.eventId)
        .maybeSingle()
      if (eventLoadError || !eventRow) {
        throw new Error(eventLoadError?.message ?? 'Event not found')
      }

      if (eventRow.recurrence_master_id || eventRow.rrule) {
        throw new Error(RECURRING_EDIT_ERROR)
      }

      let addIds: string[] = []
      if (normalized.membersAdd && normalized.membersAdd.length > 0) {
        const { data: family } = await sb.from('family_members').select('id, name')
        const unresolved = normalized.membersAdd.filter((name) => !(family ?? []).some((f: { id: string; name: string }) => f.name.toLowerCase() === name.toLowerCase()))
        if (unresolved.length > 0) {
          throw new Error(`Unknown family member(s): ${unresolved.join(', ')}`)
        }
        addIds = normalized.membersAdd
          .map((name) => (family ?? []).find((f: { id: string; name: string }) => f.name.toLowerCase() === name.toLowerCase())?.id)
          .filter(Boolean) as string[]
      }

      let removeIds: string[] = []
      if (normalized.membersRemove && normalized.membersRemove.length > 0) {
        const { data: family } = await sb.from('family_members').select('id, name')
        const unresolved = normalized.membersRemove.filter((name) => !(family ?? []).some((f: { id: string; name: string }) => f.name.toLowerCase() === name.toLowerCase()))
        if (unresolved.length > 0) {
          throw new Error(`Unknown family member(s): ${unresolved.join(', ')}`)
        }
        removeIds = normalized.membersRemove
          .map((name) => (family ?? []).find((f: { id: string; name: string }) => f.name.toLowerCase() === name.toLowerCase())?.id)
          .filter(Boolean) as string[]
      }

      const eventUpdates = {
        ...normalized.eventUpdates,
        ...(normalized.destinationChanged ? { is_enriched: false } : {}),
      }
      const manualEnrichmentFields = Object.keys(normalized.enrichmentUpdates)
      const shouldTargetedReenrich = hasSmartEnrichmentInputs({
        changedEventFields: normalized.changedEventFields,
        changedEnrichmentFields: normalized.changedEnrichmentFields,
        membersChanged: normalized.membersChanged,
      })
      const targetFields = shouldTargetedReenrich
        ? deriveImpactedEnrichmentFields({
          changedEventFields: normalized.changedEventFields,
          changedEnrichmentFields: normalized.changedEnrichmentFields,
          membersChanged: normalized.membersChanged,
          lockedFields: manualEnrichmentFields,
        })
        : []

      const { error: rpcError } = await sb.rpc('ai_apply_event_update', {
        p_event_id: normalized.eventId,
        p_event_updates: eventUpdates,
        p_enrichment_updates: normalized.enrichmentUpdates,
        p_checklist_items: normalized.checklistItems ?? null,
        p_action_items: normalized.actionItems ?? null,
        p_members_add: addIds,
        p_members_remove: removeIds,
        p_action_id: actionId ?? null,
        p_expected_updated_at: normalized.expectedUpdatedAt,
        p_request_payload: args,
        p_ai_session_id: sessionId ?? null,
      })
      if (rpcError) throw new Error(rpcError.message)

      if (targetFields.length > 0) {
        sb.functions.invoke('enrich-event', {
          body: {
            event_id: normalized.eventId,
            target_fields: targetFields,
            locked_fields: manualEnrichmentFields,
            locked_category: typeof normalized.enrichmentUpdates.category === 'string'
              ? normalized.enrichmentUpdates.category
              : undefined,
            change_context: {
              changed_event_fields: normalized.changedEventFields,
              changed_enrichment_fields: normalized.changedEnrichmentFields,
              members_changed: normalized.membersChanged,
            },
          },
        }).catch(() => {})
      }

      const { data: historyRow, error: historyLoadError } = actionId
        ? await sb
          .from('ai_event_edit_history')
          .select('id')
          .eq('action_id', actionId)
          .order('created_at', { ascending: false })
          .limit(1)
        : { data: null, error: null }
      if (historyLoadError) throw new Error(historyLoadError.message)

      const baseResponse = {
        success: true,
        event_id: normalized.eventId,
        action_id: actionId ?? null,
      }
      const responsePayload = await finalizeEventSync(sb, normalized.eventId, historyRow?.[0]?.id, baseResponse)

      return new Response(JSON.stringify({ ...responsePayload, correlation_id: cid }), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    if (tool === 'undo_event_edit') {
      const existingResult = await getExistingActionResult(sb, actionId)
      if (existingResult) {
        return new Response(JSON.stringify({ ...existingResult, correlation_id: cid }), {
          headers: { ...CORS, 'content-type': 'application/json' },
        })
      }

      const targetActionId = String(args?.action_id ?? '').trim()
      if (!targetActionId) {
        throw new Error('action_id is required for undo_event_edit')
      }
      if (!actionId) {
        throw new Error('Undo action requires an action_id')
      }

      const { data: undoResult, error: undoError } = await sb.rpc('ai_revert_event_edit', {
        p_action_id: targetActionId,
        p_undo_action_id: actionId,
        p_ai_session_id: sessionId ?? null,
      })
      if (undoError) throw new Error(undoError.message)

      const { data: historyRow, error: historyLoadError } = await sb
        .from('ai_event_edit_history')
        .select('id')
        .eq('action_id', actionId)
        .order('created_at', { ascending: false })
        .limit(1)
      if (historyLoadError) throw new Error(historyLoadError.message)

      const baseResponse = {
        success: true,
        event_id: String(undoResult?.event_id ?? ''),
        action_id: actionId,
        undid_action_id: targetActionId,
      }
      const responsePayload = await finalizeEventSync(sb, baseResponse.event_id, historyRow?.[0]?.id, baseResponse)

      return new Response(JSON.stringify({ ...responsePayload, correlation_id: cid }), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    if (tool === 'delete_event') {
      await sb.functions.invoke('delete-google-event', { body: { event_id: args.id } }).catch(() => {})
      const { error } = await sb.from('events').update({ status: 'cancelled' }).eq('id', args.id)
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ success: true, correlation_id: cid }), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    if (tool === 'add_grocery_items') {
      const { data: lists } = await sb.from('grocery_lists').select('id').order('created_at').limit(1)
      const listId = lists?.[0]?.id
      if (!listId) throw new Error('No grocery list found')

      const sourceItems = Array.isArray(args.items)
        ? args.items as { name: string; quantity?: string; unit?: string; category?: string; notes?: string }[]
        : []
      const normalizedItems = sourceItems
        .map((item) => {
          const normalized = normalizeGroceryName(String(item.name ?? ''))
          if (!normalized.name) return null
          const category = inferCategory(item.category, normalized.name)
          return {
            rawName: String(item.name ?? '').trim(),
            name: normalized.name,
            normalizedFrom: normalized.normalizedFrom,
            quantity: item.quantity ?? null,
            unit: item.unit ?? null,
            category,
            notes: item.notes ?? null,
          }
        })
        .filter((item): item is {
          rawName: string
          name: string
          normalizedFrom?: string
          quantity: string | null
          unit: string | null
          category: string
          notes: string | null
        } => item !== null)

      if (normalizedItems.length === 0) throw new Error('No valid grocery item names were provided')

      const { data: existingItems, error: existingItemsError } = await sb
        .from('grocery_items')
        .select('name')
        .eq('list_id', listId)
        .eq('checked', false)
        .is('deleted_at', null)
      if (existingItemsError) throw new Error(existingItemsError.message)

      const seenNames = new Set((existingItems ?? []).map((item) => normalizeComparableName(String(item.name ?? ''))))
      const skippedExactMatches: string[] = []
      const uniqueItems = normalizedItems.filter((item) => {
        const key = normalizeComparableName(item.name)
        if (seenNames.has(key)) {
          skippedExactMatches.push(item.name)
          return false
        }
        seenNames.add(key)
        return true
      })

      const items = uniqueItems.map((i) => ({
        list_id: listId,
        name: i.name,
        quantity: i.quantity ?? null,
        unit: i.unit ?? null,
        category: i.category,
        notes: i.notes ?? null,
        checked: false,
        last_modified_source: 'casa',
      }))
      if (items.length > 0) {
        const { error } = await sb.from('grocery_items').insert(items)
        if (error) throw new Error(error.message)
      }
      return new Response(JSON.stringify({
        success: true,
        count: items.length,
        items: uniqueItems.map((item) => ({
          name: item.name,
          category: item.category,
          normalized_from: item.normalizedFrom ?? null,
        })),
        skipped_exact_matches: skippedExactMatches,
        correlation_id: cid,
      }), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    if (tool === 'check_grocery_item') {
      const { error } = await sb
        .from('grocery_items')
        .update({ checked: args.checked, last_modified_source: 'casa' })
        .eq('id', args.item_id)
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ success: true, correlation_id: cid }), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    if (tool === 'clear_checked_grocery_items') {
      const { error } = await sb
        .from('grocery_items')
        .update({ deleted_at: new Date().toISOString(), last_modified_source: 'casa' })
        .eq('checked', true)
        .is('deleted_at', null)
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ success: true, correlation_id: cid }), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Unknown tool', correlation_id: cid }), {
      status: 400, headers: { ...CORS, 'content-type': 'application/json' },
    })
  } catch (e) {
    const msg = (e as Error).message ?? 'Action failed'
    console.error(`[execute-ai-action][${cid}] error ${msg}`)
    return new Response(JSON.stringify({ success: false, error: msg, correlation_id: cid }), {
      status: 200, headers: { ...CORS, 'content-type': 'application/json' },
    })
  }
})
