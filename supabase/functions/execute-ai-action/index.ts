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

function normalizeOptionalText(value: unknown, maxLen = 300): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, maxLen)
}

function toIngredientRawText(input: {
  rawText: string | null
  quantity: string | null
  unit: string | null
  name: string
}): string {
  if (input.rawText) return input.rawText
  const parts = [input.quantity, input.unit, input.name]
    .map((value) => (value ?? '').trim())
    .filter((value) => value.length > 0)
  return parts.join(' ')
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

function extractMemberRoleOverrides(args: Record<string, unknown>) {
  const membersPrimary = typeof args.members_primary === 'string' && args.members_primary.trim().length > 0
    ? args.members_primary.trim()
    : undefined
  const membersAttendees = Array.isArray(args.members_attendees)
    ? args.members_attendees
      .map((value) => String(value).trim())
      .filter((value) => value.length > 0)
    : undefined
  const cleanArgs = { ...args }
  delete cleanArgs.members_primary
  delete cleanArgs.members_attendees
  return {
    cleanArgs,
    membersPrimary,
    membersAttendees,
  }
}

async function resolveFamilyMembersByName(
  sb: ReturnType<typeof createClient>,
  names: string[],
) {
  if (names.length === 0) return { resolvedIds: new Map<string, string>(), unresolved: [] as string[] }
  const { data: family, error } = await sb.from('family_members').select('id, name')
  if (error) throw new Error(error.message)

  const familyByName = new Map((family ?? []).map((member: { id: string; name: string }) => [member.name.toLowerCase(), member.id]))
  const resolvedIds = new Map<string, string>()
  const unresolved: string[] = []
  for (const rawName of names) {
    const key = rawName.toLowerCase()
    const id = familyByName.get(key)
    if (!id) {
      unresolved.push(rawName)
      continue
    }
    resolvedIds.set(rawName, id)
  }
  return { resolvedIds, unresolved }
}

async function applyMemberRoleOverrides(
  sb: ReturnType<typeof createClient>,
  eventId: string,
  membersPrimary?: string,
  membersAttendees?: string[],
) {
  if (!membersPrimary && membersAttendees === undefined) return

  const candidateNames = [
    ...(membersPrimary ? [membersPrimary] : []),
    ...(membersAttendees ?? []),
  ]
  const { resolvedIds, unresolved } = await resolveFamilyMembersByName(sb, candidateNames)
  if (unresolved.length > 0) {
    throw new Error(`Unknown family member(s): ${unresolved.join(', ')}`)
  }

  const primaryId = membersPrimary ? resolvedIds.get(membersPrimary) : undefined
  const attendeeIds = (membersAttendees ?? [])
    .map((name) => resolvedIds.get(name))
    .filter((id): id is string => Boolean(id))
    .filter((id) => id !== primaryId)

  if (primaryId) {
    await sb
      .from('event_members')
      .update({ role: 'attendee' })
      .eq('event_id', eventId)
      .eq('role', 'primary')

    await sb
      .from('event_members')
      .upsert({ event_id: eventId, family_member_id: primaryId, role: 'primary', rsvp_status: 'accepted' })
  }

  if (membersAttendees !== undefined) {
    const attendeeSet = new Set(attendeeIds)
    const { data: existingMembers, error: existingError } = await sb
      .from('event_members')
      .select('id, family_member_id, role')
      .eq('event_id', eventId)
    if (existingError) throw new Error(existingError.message)

    const removeIds = (existingMembers ?? [])
      .filter((member: { id: string; family_member_id: string; role: string }) => member.role === 'attendee' && !attendeeSet.has(member.family_member_id))
      .map((member: { id: string }) => member.id)

    if (removeIds.length > 0) {
      const { error: removeError } = await sb.from('event_members').delete().in('id', removeIds)
      if (removeError) throw new Error(removeError.message)
    }

    for (const attendeeId of attendeeIds) {
      await sb
        .from('event_members')
        .upsert({ event_id: eventId, family_member_id: attendeeId, role: 'attendee', rsvp_status: 'accepted' })
    }
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
    trace_id: traceIdRaw,
    turn_id: turnIdRaw,
    lane: laneRaw,
    device_id: deviceIdRaw,
    client_trace_present: clientTracePresentRaw,
    client_build: clientBuildRaw,
    client_trace_source: clientTraceSourceRaw,
  } = await req.json()
  const cid = correlationId ?? `${sessionId ?? 'no-session'}:${actionId ?? 'no-action'}`
  const traceId = normalizeOptionalText(traceIdRaw, 160) ?? normalizeOptionalText(sessionId, 160)
  const turnId = normalizeOptionalText(turnIdRaw, 160)
  const lane = normalizeOptionalText(laneRaw, 80) ?? 'tool_action'
  const deviceId = normalizeOptionalText(deviceIdRaw, 160)
  const appendActionTrace = (event: string, detail: string, payload?: Record<string, unknown>) => {
    sb.from('ai_drawer_debug_events').insert({
      event,
      detail: detail.slice(0, 2000),
      channel: 'debug',
      session_id: traceId,
      turn_id: turnId,
      correlation_id: cid,
      lane,
      payload: {
        action_id: actionId ?? null,
        tool: tool ?? null,
        client_trace_present: clientTracePresentRaw === true,
        client_build: normalizeOptionalText(clientBuildRaw, 120),
        client_trace_source: normalizeOptionalText(clientTraceSourceRaw, 80),
        ...payload,
      },
      device_id: deviceId,
      page: 'assistant_action',
      source_component: 'server:execute-ai-action',
      source_origin: 'ai-drawer-confirmation',
      source_href: null,
      user_agent: null,
      platform: Deno.build.os,
      dedupe_key: `${cid}|${event}|${actionId ?? 'no-action'}`,
    }).then(() => {}).catch(() => {})
  }
  console.log(`[execute-ai-action][${cid}] start tool=${tool}`)
  appendActionTrace('server_ai_action_started', String(tool ?? 'unknown'))

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

    if (tool === 'create_recipe') {
      const recipeName = normalizeOptionalText(args?.name, 180)
      if (!recipeName) throw new Error('Recipe name is required')

      const rawIngredients = Array.isArray(args?.ingredients) ? args.ingredients : []
      if (rawIngredients.length === 0) throw new Error('At least one ingredient is required')
      if (rawIngredients.length > 80) throw new Error('Too many ingredients (max 80)')

      const rawSteps = Array.isArray(args?.steps) ? args.steps : []
      if (rawSteps.length === 0) throw new Error('At least one step is required')
      if (rawSteps.length > 120) throw new Error('Too many steps (max 120)')

      const ingredients = rawIngredients
        .map((row) => {
          const obj = row as Record<string, unknown>
          const name = normalizeOptionalText(obj.name, 160)
          if (!name) return null
          const quantity = normalizeOptionalText(obj.quantity, 40)
          const unit = normalizeOptionalText(obj.unit, 60)
          const rawText = normalizeOptionalText(obj.raw_text, 280)
          return {
            name,
            quantity,
            unit,
            raw_text: toIngredientRawText({ rawText, quantity, unit, name }),
            optional: obj.optional === true,
          }
        })
        .filter((row): row is { name: string; quantity: string | null; unit: string | null; raw_text: string; optional: boolean } => row !== null)
      if (ingredients.length === 0) throw new Error('No valid ingredients found')

      const steps = rawSteps
        .map((row) => normalizeOptionalText(row, 2000))
        .filter((step): step is string => Boolean(step))
      if (steps.length === 0) throw new Error('No valid steps found')

      let selectedImageUrl = normalizeOptionalText(args?.image_url, 1000)
      if (!selectedImageUrl) {
        const imageLookup = await sb.functions.invoke('recipe-image-search', {
          body: { query: recipeName, limit: 1 },
        }).catch(() => ({ data: null, error: null }))
        const imageData = imageLookup.data as { results?: Array<{ url?: string }> } | null
        selectedImageUrl = normalizeOptionalText(imageData?.results?.[0]?.url, 1000)
      }

      const recipeInsert = {
        name: recipeName,
        source_url: normalizeOptionalText(args?.source_url, 1000),
        image_url: selectedImageUrl,
        servings: normalizeOptionalText(args?.servings, 60),
        cook_time: normalizeOptionalText(args?.cook_time, 60),
        instructions_text: steps.map((step, index) => `${index + 1}. ${step}`).join('\n'),
        last_used_at: new Date().toISOString(),
      }

      const { data: recipeRow, error: recipeError } = await sb
        .from('recipes')
        .insert(recipeInsert)
        .select('id')
        .single()
      if (recipeError) throw new Error(recipeError.message)

      const recipeId = String(recipeRow.id)
      const ingredientRows = ingredients.map((ingredient, index) => ({
        recipe_id: recipeId,
        raw_text: ingredient.raw_text,
        name: ingredient.name,
        quantity: ingredient.quantity,
        unit: ingredient.unit,
        optional: ingredient.optional,
        sort_order: index,
      }))
      const { error: ingredientError } = await sb.from('recipe_ingredients').insert(ingredientRows)
      if (ingredientError) throw new Error(ingredientError.message)

      const stepRows = steps.map((instruction, index) => ({
        recipe_id: recipeId,
        step_number: index + 1,
        instruction,
      }))
      const { error: stepError } = await sb.from('recipe_steps').insert(stepRows)
      if (stepError) throw new Error(stepError.message)

      if (selectedImageUrl) {
        const { error: imageError } = await sb.from('recipe_images').insert([{
          recipe_id: recipeId,
          image_url: selectedImageUrl,
          is_primary: true,
          sort_order: 0,
        }])
        const missingRecipeImagesTable = imageError?.code === '42P01' || imageError?.code === 'PGRST205'
        if (imageError && !missingRecipeImagesTable) throw new Error(imageError.message)
      }

      return new Response(JSON.stringify({
        success: true,
        recipe_id: recipeId,
        image_url: selectedImageUrl,
        correlation_id: cid,
      }), {
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

      const { cleanArgs, membersPrimary, membersAttendees } = extractMemberRoleOverrides(args as Record<string, unknown>)
      const { errors, normalized } = buildValidatedUpdatePayload(cleanArgs)
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
        p_request_payload: cleanArgs,
        p_ai_session_id: sessionId ?? null,
      })
      if (rpcError) throw new Error(rpcError.message)

      await applyMemberRoleOverrides(sb, normalized.eventId, membersPrimary, membersAttendees)

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

    if (tool === 'bulk_update_events') {
      const rawIds = Array.isArray(args?.ids)
        ? (args.ids as unknown[])
          .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
          .map((id) => id.trim())
        : []
      const ids = [...new Set(rawIds)]
      if (ids.length === 0) throw new Error('ids must include at least one event id')
      if (ids.length > 75) throw new Error('Cannot bulk update more than 75 events at once')

      const { cleanArgs, membersPrimary, membersAttendees } = extractMemberRoleOverrides(args as Record<string, unknown>)
      delete (cleanArgs as Record<string, unknown>).ids
      delete (cleanArgs as Record<string, unknown>).title_query
      delete (cleanArgs as Record<string, unknown>).count

      const hasUpdateFields = Object.keys(cleanArgs).length > 0
      const hasRoleOverrides = Boolean(membersPrimary) || membersAttendees !== undefined
      if (!hasUpdateFields && !hasRoleOverrides) {
        throw new Error('bulk_update_events must include at least one editable field')
      }

      const { data: rows, error: rowsError } = await sb
        .from('events')
        .select('id, title, updated_at, recurrence_master_id, rrule')
        .in('id', ids)
      if (rowsError) throw new Error(rowsError.message)
      if (!rows || rows.length === 0) throw new Error('No matching events found for bulk update')

      const recurringTitles = rows.filter((row) => row.recurrence_master_id || row.rrule).map((row) => row.title)
      if (recurringTitles.length > 0) {
        throw new Error(`Recurring events are not supported in bulk AI edit yet: ${recurringTitles.slice(0, 3).join(', ')}`)
      }

      const updatedEventIds: string[] = []
      const failedEvents: { id: string; title: string; error: string }[] = []

      for (const row of rows) {
        try {
          if (hasUpdateFields) {
            const singleArgs = {
              ...cleanArgs,
              id: row.id,
              expected_updated_at: row.updated_at,
            }
            const { errors, normalized } = buildValidatedUpdatePayload(singleArgs)
            if (errors.length > 0) throw new Error(errors.join('; '))

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
              p_action_id: actionId ? `${actionId}:${row.id}` : null,
              p_expected_updated_at: normalized.expectedUpdatedAt,
              p_request_payload: singleArgs,
              p_ai_session_id: sessionId ?? null,
            })
            if (rpcError) throw new Error(rpcError.message)
          }

          await applyMemberRoleOverrides(sb, row.id, membersPrimary, membersAttendees)
          updatedEventIds.push(row.id)
        } catch (error) {
          failedEvents.push({
            id: row.id,
            title: row.title,
            error: (error as Error).message ?? 'Unknown error',
          })
        }
      }

      for (const eventId of updatedEventIds) {
        void sb.functions.invoke('push-to-google', { body: { event_id: eventId } }).catch(() => {})
      }

      return new Response(JSON.stringify({
        success: failedEvents.length === 0,
        updated_count: updatedEventIds.length,
        failed_count: failedEvents.length,
        failed_events: failedEvents.slice(0, 10),
        sync_status: updatedEventIds.length > 0 ? 'queued' : 'failed',
        sync_warning: updatedEventIds.length > 0
          ? `Updated ${updatedEventIds.length} events in Casa Tabor. Google sync has been queued in the background.`
          : 'No events were updated.',
        correlation_id: cid,
      }), {
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

    if (tool === 'delete_events_by_title') {
      const ids = Array.isArray(args?.ids)
        ? (args.ids as unknown[])
          .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
          .map((id) => id.trim())
        : []
      const uniqueIds = [...new Set(ids)]
      if (uniqueIds.length === 0) throw new Error('ids must include at least one event id')
      if (uniqueIds.length > 50) throw new Error('Cannot delete more than 50 events at once')

      const { data: matchedRows, error: matchedLoadError } = await sb
        .from('events')
        .select('id, title')
        .in('id', uniqueIds)
      if (matchedLoadError) throw new Error(matchedLoadError.message)
      if (!matchedRows || matchedRows.length === 0) throw new Error('No matching events found for bulk delete')

      const matchedIds = matchedRows.map((row) => row.id)
      const missingCount = uniqueIds.length - matchedIds.length

      for (const eventId of matchedIds) {
        await sb.functions.invoke('delete-google-event', { body: { event_id: eventId } }).catch(() => {})
      }

      const { error: updateError } = await sb
        .from('events')
        .update({ status: 'cancelled' })
        .in('id', matchedIds)
      if (updateError) throw new Error(updateError.message)

      return new Response(JSON.stringify({
        success: true,
        deleted_count: matchedIds.length,
        deleted_titles: matchedRows.map((row) => row.title),
        missing_count: missingCount,
        correlation_id: cid,
      }), {
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
      return new Response(JSON.stringify({ success: true, count: items.length, correlation_id: cid }), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    if (tool === 'check_grocery_item') {
      const { error } = await sb.from('grocery_items').update({ checked: args.checked }).eq('id', args.item_id)
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ success: true, correlation_id: cid }), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    if (tool === 'clear_checked_grocery_items') {
      const { error } = await sb.from('grocery_items').delete().eq('checked', true)
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
    appendActionTrace('server_ai_action_failed', msg)
    return new Response(JSON.stringify({ success: false, error: msg, correlation_id: cid }), {
      status: 200, headers: { ...CORS, 'content-type': 'application/json' },
    })
  }
})
