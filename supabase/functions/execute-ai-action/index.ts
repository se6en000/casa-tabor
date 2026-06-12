import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  RECURRING_EDIT_ERROR,
  buildValidatedUpdatePayload,
} from '../_shared/ai-event-edit.mjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { tool, args, action_id: actionId, session_id: sessionId } = await req.json()

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

      return new Response(JSON.stringify({ success: true, event_id: event.id }), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    if (tool === 'update_event') {
      const existingResult = await getExistingActionResult(sb, actionId)
      if (existingResult) {
        return new Response(JSON.stringify(existingResult), {
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

      if (normalized.destinationChanged && Object.keys(normalized.enrichmentUpdates).length === 0) {
        sb.functions.invoke('enrich-event', { body: { event_id: normalized.eventId } }).catch(() => {})
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

      return new Response(JSON.stringify(responsePayload), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    if (tool === 'undo_event_edit') {
      const existingResult = await getExistingActionResult(sb, actionId)
      if (existingResult) {
        return new Response(JSON.stringify(existingResult), {
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

      return new Response(JSON.stringify(responsePayload), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    if (tool === 'delete_event') {
      await sb.functions.invoke('delete-google-event', { body: { event_id: args.id } }).catch(() => {})
      const { error } = await sb.from('events').update({ status: 'cancelled' }).eq('id', args.id)
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    if (tool === 'add_grocery_items') {
      const { data: lists } = await sb.from('grocery_lists').select('id').order('created_at').limit(1)
      const listId = lists?.[0]?.id
      if (!listId) throw new Error('No grocery list found')

      const items = (args.items as { name: string; quantity?: string; unit?: string; category?: string; notes?: string }[]).map(i => ({
        list_id: listId,
        name: i.name,
        quantity: i.quantity ?? null,
        unit: i.unit ?? null,
        category: i.category ?? 'other',
        notes: i.notes ?? null,
        checked: false,
      }))
      const { error } = await sb.from('grocery_items').insert(items)
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ success: true, count: items.length }), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    if (tool === 'check_grocery_item') {
      const { error } = await sb.from('grocery_items').update({ checked: args.checked }).eq('id', args.item_id)
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    if (tool === 'clear_checked_grocery_items') {
      const { error } = await sb.from('grocery_items').delete().eq('checked', true)
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Unknown tool' }), {
      status: 400, headers: { ...CORS, 'content-type': 'application/json' },
    })
  } catch (e) {
    const msg = (e as Error).message ?? 'Action failed'
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 200, headers: { ...CORS, 'content-type': 'application/json' },
    })
  }
})
