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
import { saveGroceryItems } from '../_shared/assistant-grocery-write.mjs'
import { resolveFamilyMemberByName } from '../_shared/family-identity.mjs'
import {
  buildRecurringDetailMutation,
  buildRecurringSeriesPatch,
  isCanonicalRecurringEvent,
} from '../_shared/assistant-recurring-mutation.mjs'

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

function normalizeCreateEventType(value: unknown): 'event' | 'reminder' {
  const normalized = normalizeOptionalText(value, 32)?.toLowerCase()
  if (!normalized) return 'event'
  if (['reminder', 'task', 'todo'].includes(normalized)) return 'reminder'
  return 'event'
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
  const { data: family, error } = await sb.from('family_members').select('id, name, full_name')
  if (error) throw new Error(error.message)

  const resolvedIds = new Map<string, string>()
  const unresolved: string[] = []
  for (const rawName of names) {
    const member = resolveFamilyMemberByName(family, rawName)
    if (!member) {
      unresolved.push(rawName)
      continue
    }
    resolvedIds.set(rawName, member.id)
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

async function applyRecurringMemberChanges(
  sb: ReturnType<typeof createClient>,
  detailPatch: Record<string, unknown>,
  normalized: {
    membersAdd?: string[]
    membersRemove?: string[]
    membersChanged: boolean
  },
  membersPrimary?: string,
  membersAttendees?: string[],
) {
  if (!normalized.membersChanged && !membersPrimary && membersAttendees === undefined) return false

  const names = [
    ...(normalized.membersAdd ?? []),
    ...(normalized.membersRemove ?? []),
    ...(membersPrimary ? [membersPrimary] : []),
    ...(membersAttendees ?? []),
  ]
  const { resolvedIds, unresolved } = await resolveFamilyMembersByName(sb, names)
  if (unresolved.length > 0) throw new Error(`Unknown family member(s): ${unresolved.join(', ')}`)

  const current = new Map(
    ((detailPatch.assignments as Array<{ family_member_id: string; role: string }>) ?? [])
      .map((assignment) => [assignment.family_member_id, assignment.role]),
  )
  for (const name of normalized.membersRemove ?? []) {
    const id = resolvedIds.get(name)
    if (id) current.delete(id)
  }
  for (const name of normalized.membersAdd ?? []) {
    const id = resolvedIds.get(name)
    if (id && !current.has(id)) current.set(id, 'attendee')
  }

  if (membersAttendees !== undefined) {
    const attendeeIds = new Set(membersAttendees.map((name) => resolvedIds.get(name)).filter(Boolean))
    for (const [id, role] of current) {
      if (role !== 'primary') current.delete(id)
    }
    for (const id of attendeeIds) current.set(id as string, 'attendee')
  }
  if (membersPrimary) {
    const primaryId = resolvedIds.get(membersPrimary)
    for (const [id, role] of current) {
      if (role === 'primary') current.set(id, 'attendee')
    }
    if (primaryId) current.set(primaryId, 'primary')
  }

  detailPatch.assignments = [...current.entries()].map(([family_member_id, role]) => ({
    family_member_id,
    role,
  }))
  return true
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
    if (tool === 'confirm_directory_entity') {
      const entityType = normalizeOptionalText(args?.entity_type, 20)
      const entityId = normalizeOptionalText(args?.entity_id, 80)
      if (!entityId || !['contact', 'place'].includes(entityType ?? '')) {
        throw new Error('A valid directory entity type and ID are required')
      }
      const table = entityType === 'contact' ? 'saved_contacts' : 'saved_places'
      const { data: entity, error } = await sb
        .from(table)
        .update({ confirmed: true, source: 'manual', updated_at: new Date().toISOString() })
        .eq('id', entityId)
        .select('id, name')
        .maybeSingle()
      if (error || !entity) throw new Error(error?.message ?? 'Directory candidate not found')

      appendActionTrace('server_ai_action_succeeded', 'confirm_directory_entity', {
        entity_type: entityType,
        entity_id: entity.id,
      })
      return new Response(JSON.stringify({
        success: true,
        entity_type: entityType,
        entity_id: entity.id,
        message: `Saved ${entity.name} as a confirmed ${entityType}.`,
        correlation_id: cid,
      }), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    if (tool === 'associate_contact_place') {
      const contactId = normalizeOptionalText(args?.contact_id, 80)
      let placeId = normalizeOptionalText(args?.place_id, 80)
      const placeName = normalizeOptionalText(args?.place_name, 220)
      const placeAddress = normalizeOptionalText(args?.place_address, 500)
      const relationship = normalizeOptionalText(args?.relationship, 120) ?? 'provider_location'
      if (!contactId || (!placeId && !placeName)) throw new Error('contact_id and a place ID or name are required')

      const { data: contact, error: contactError } = await sb
        .from('saved_contacts')
        .select('id, name')
        .eq('id', contactId)
        .eq('confirmed', true)
        .maybeSingle()
      if (contactError || !contact) throw new Error(contactError?.message ?? 'Confirmed contact not found')

      let place: { id: string; name: string; confirmed: boolean } | null = null
      if (placeId) {
        const { data, error } = await sb.from('saved_places').select('id, name, confirmed').eq('id', placeId).maybeSingle()
        if (error) throw new Error(error.message)
        place = data
      } else if (placeName) {
        // Fuzzy lookup first (name similarity + phone match) so STT-garbled or
        // differently-formatted names ("Dr. John Ledakis" vs "John S. Ledakis,
        // DDS, PA") match an existing place instead of creating a duplicate.
        const { data: similar, error: similarError } = await sb
          .rpc('find_similar_places', { p_name: placeName, p_phone: null })
        if (similarError) throw new Error(similarError.message)
        const bestMatch = Array.isArray(similar)
          ? similar.find((row: { score?: number }) => (row.score ?? 0) >= 0.6) ?? null
          : null
        if (bestMatch) {
          place = { id: bestMatch.id, name: bestMatch.name, confirmed: bestMatch.confirmed }
          placeId = bestMatch.id
        } else {
          const { data: created, error: createError } = await sb
            .from('saved_places')
            .insert({
              name: placeName,
              aliases: [],
              address: placeAddress,
              category: 'other',
              confirmed: true,
              source: 'manual',
              occurrence_count: Number.isInteger(args?.evidence_count) ? args.evidence_count : 1,
              notes: 'Created from household-confirmed calendar evidence.',
            })
            .select('id, name, confirmed')
            .single()
          if (createError) throw new Error(createError.message)
          place = created
          placeId = created.id
        }
      }
      if (!place || !placeId) throw new Error('Place not found')
      if (!place.confirmed && args?.confirm_place !== true) throw new Error('The suggested place must be confirmed first')
      if (!place.confirmed) {
        const { error: confirmPlaceError } = await sb
          .from('saved_places')
          .update({ confirmed: true, source: 'manual', updated_at: new Date().toISOString() })
          .eq('id', place.id)
        if (confirmPlaceError) throw new Error(confirmPlaceError.message)
      }

      const { data: association, error } = await sb.rpc('set_contact_place_relationship', {
        p_contact_id: contact.id,
        p_place_id: place.id,
        p_relationship: relationship,
        p_is_default: args?.is_default !== false,
        p_source: 'manual',
        p_confirmed: true,
        p_confidence: 1,
        p_evidence_count: Number.isInteger(args?.evidence_count) ? args.evidence_count : 0,
        p_evidence_notes: normalizeOptionalText(args?.evidence_notes, 1000),
      })
      if (error) throw new Error(error.message)

      appendActionTrace('server_ai_action_succeeded', 'associate_contact_place', {
        contact_id: contact.id,
        place_id: place.id,
        relationship,
      })
      return new Response(JSON.stringify({
        success: true,
        association_id: association?.id ?? null,
        message: `Saved ${place.name} as ${contact.name}'s ${relationship.replaceAll('_', ' ')}.`,
        correlation_id: cid,
      }), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    if (tool === 'associate_family_contact') {
      const familyMemberId = normalizeOptionalText(args?.family_member_id, 80)
      const contactId = normalizeOptionalText(args?.contact_id, 80)
      const relationship = normalizeOptionalText(args?.relationship, 120)
      if (!familyMemberId || !contactId || !relationship) {
        throw new Error('family_member_id, contact_id, and relationship are required')
      }

      const [{ data: member, error: memberError }, { data: contact, error: contactError }] = await Promise.all([
        sb.from('family_members').select('id, name').eq('id', familyMemberId).maybeSingle(),
        sb.from('saved_contacts').select('id, name').eq('id', contactId).maybeSingle(),
      ])
      if (memberError || !member) throw new Error(memberError?.message ?? 'Family member not found')
      if (contactError || !contact) throw new Error(contactError?.message ?? 'Contact not found')

      const { data: association, error } = await sb
        .from('family_contact_relationships')
        .upsert({
          family_member_id: member.id,
          contact_id: contact.id,
          relationship,
          source: 'manual',
          confirmed: true,
          confidence: 1,
          evidence_count: Number.isInteger(args?.evidence_count) ? args.evidence_count : 0,
          evidence_notes: normalizeOptionalText(args?.evidence_notes, 1000),
        }, { onConflict: 'family_member_id,contact_id,relationship' })
        .select('id')
        .single()
      if (error) throw new Error(error.message)

      appendActionTrace('server_ai_action_succeeded', 'associate_family_contact', {
        family_member_id: member.id,
        contact_id: contact.id,
        relationship,
        association_id: association.id,
      })
      return new Response(JSON.stringify({
        success: true,
        association_id: association.id,
        message: `Saved ${member.name}'s ${relationship}: ${contact.name}.`,
        correlation_id: cid,
      }), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    if (tool === 'create_event') {
      const normalizedEventType = normalizeCreateEventType(args.event_type)
      const normalizedTitle = normalizeOptionalText(args.title, 220)
      const normalizedLocation = normalizeOptionalText(args.location, 220)
      if (!normalizedTitle) throw new Error('title is required for create_event')

      // ── Duplicate guard ──
      // AI chat/voice has no memory of what it already created, so the same
      // request re-run (retry, re-heard voice command, user re-asking) would
      // otherwise silently create a second near-identical event/reminder that
      // then spawns its own prep item and notification stream forever. Treat
      // "same normalized title + same exact start time, not deleted" as the
      // same real-world thing and hand back the existing event instead.
      if (args.start) {
        const { data: possibleDupes } = await sb
          .from('events')
          .select('id, title, start_time, event_type, updated_at')
          .is('deleted_at', null)
          .eq('start_time', args.start)
        const existing = (possibleDupes ?? []).find(
          (e: { title: string }) => e.title.trim().toLowerCase() === normalizedTitle.toLowerCase()
        )
        if (existing) {
          return new Response(JSON.stringify({
            success: true,
            duplicate: true,
            event_id: existing.id,
            event_updated_at: existing.updated_at,
            sync_status: 'synced',
            correlation_id: cid,
            message: `"${normalizedTitle}" already exists on your calendar at this time — I didn't create a second one.`,
          }), {
            headers: { ...CORS, 'content-type': 'application/json' },
          })
        }
      }

      const { data: event, error } = await sb.from('events').insert({
        title: normalizedTitle,
        start_time: args.start,
        end_time: args.end,
        location_name: normalizedLocation ?? null,
        all_day: args.all_day ?? false,
        description: args.notes ?? null,
        status: 'confirmed',
        is_enriched: false,
        event_type: normalizedEventType,
      }).select().single()

      if (error) throw new Error(error.message)

      // Add members
      if (args.members?.length > 0) {
        const { data: family } = await sb.from('family_members').select('id, name, full_name')
        const memberIds = (args.members as string[])
          .map((name: string) => resolveFamilyMemberByName(family, name)?.id)
          .filter(Boolean)
        if (memberIds.length > 0) {
          await sb.from('event_members').insert(
            memberIds.map((id, i) => ({ event_id: event.id, family_member_id: id, role: i === 0 ? 'primary' : 'attendee' }))
          )
        }
      }

      if (normalizedEventType !== 'reminder') {
        // Await Google sync for calendar events — fire-and-forget can be killed before completion in Deno Deploy.
        await sb.functions.invoke('create-google-event', { body: { event_id: event.id } }).catch(() => {})
      }

      return new Response(JSON.stringify({
        success: true,
        event_id: event.id,
        event_updated_at: event.updated_at,
        sync_status: 'synced',
        correlation_id: cid,
      }), {
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
        source_type: 'manual',
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

      appendActionTrace('server_ai_action_succeeded', 'create_recipe', {
        recipe_id: recipeId,
        ingredient_count: ingredientRows.length,
        step_count: stepRows.length,
        image_saved: Boolean(selectedImageUrl),
      })
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
        .select('id, event_type, google_event_id, recurrence_master_id, rrule, updated_at, series_id, record_kind, series_revision_applied, original_start_time, original_start_date, start_time')
        .eq('id', normalized.eventId)
        .maybeSingle()
      if (eventLoadError || !eventRow) {
        throw new Error(eventLoadError?.message ?? 'Event not found')
      }

      if (isCanonicalRecurringEvent(eventRow)) {
        if (!actionId) throw new Error('Recurring event changes require an action ID.')
        if (!normalized.recurrenceScope || !normalized.expectedSeriesRevision) {
          throw new Error('Choose whether to change this event, this and following events, or the entire series.')
        }
        const { data: context, error: contextError } = await sb.rpc('recurrence_get_editor_context_core', {
          p_selected_event_id: normalized.eventId,
        })
        if (contextError || !context) throw new Error(contextError?.message ?? 'Recurring event details are unavailable.')
        if (context.series.revision !== normalized.expectedSeriesRevision) {
          throw new Error('This recurring series changed before confirmation. Please review it again.')
        }

        const { changedPaths, detailPatch } = buildRecurringDetailMutation(context, normalized)
        const assignmentsChanged = await applyRecurringMemberChanges(
          sb,
          detailPatch,
          normalized,
          membersPrimary,
          membersAttendees,
        )
        if (assignmentsChanged) changedPaths.push('assignments')
        if (changedPaths.length === 0) throw new Error('No recurring event changes were provided.')

        const seriesPatch = buildRecurringSeriesPatch(
          context,
          normalized.recurrenceScope,
          eventRow,
        )
        const recurrenceResult = await sb.functions.invoke('recurring-event-editor', {
          body: {
            action: 'save',
            selected_event_id: normalized.eventId,
            action_id: actionId,
            scope: normalized.recurrenceScope,
            expected_series_revision: normalized.expectedSeriesRevision,
            changed_paths: [...new Set(changedPaths)],
            detail_patch: detailPatch,
            series_patch: seriesPatch,
          },
          headers: { Authorization: `Bearer ${requireEnv('SUPABASE_SERVICE_ROLE_KEY')}` },
        })
        if (recurrenceResult.error) throw new Error(recurrenceResult.error.message)
        if (recurrenceResult.data?.success === false) {
          throw new Error(recurrenceResult.data.error ?? 'Recurring event change failed.')
        }
        appendActionTrace('server_ai_action_recurring_succeeded', 'update_event', {
          event_id: normalized.eventId,
          scope: normalized.recurrenceScope,
          series_id: recurrenceResult.data?.result?.series_id ?? eventRow.series_id,
          series_revision: recurrenceResult.data?.result?.series_revision ?? null,
        })
        return new Response(JSON.stringify({
          success: true,
          event_id: normalized.eventId,
          action_id: actionId,
          recurrence_scope: normalized.recurrenceScope,
          casa_saved: true,
          google_sync_status: 'queued',
          result: recurrenceResult.data?.result ?? null,
          correlation_id: cid,
        }), {
          headers: { ...CORS, 'content-type': 'application/json' },
        })
      }

      if (eventRow.recurrence_master_id || eventRow.rrule) {
        throw new Error(RECURRING_EDIT_ERROR)
      }

      let addIds: string[] = []
      if (normalized.membersAdd && normalized.membersAdd.length > 0) {
        const { data: family } = await sb.from('family_members').select('id, name, full_name')
        const unresolved = normalized.membersAdd.filter((name) => !resolveFamilyMemberByName(family, name))
        if (unresolved.length > 0) {
          throw new Error(`Unknown family member(s): ${unresolved.join(', ')}`)
        }
        addIds = normalized.membersAdd
          .map((name) => resolveFamilyMemberByName(family, name)?.id)
          .filter(Boolean) as string[]
      }

      let removeIds: string[] = []
      if (normalized.membersRemove && normalized.membersRemove.length > 0) {
        const { data: family } = await sb.from('family_members').select('id, name, full_name')
        const unresolved = normalized.membersRemove.filter((name) => !resolveFamilyMemberByName(family, name))
        if (unresolved.length > 0) {
          throw new Error(`Unknown family member(s): ${unresolved.join(', ')}`)
        }
        removeIds = normalized.membersRemove
          .map((name) => resolveFamilyMemberByName(family, name)?.id)
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

      const { data: updatedEvent, error: updatedEventError } = await sb
        .from('events')
        .select('updated_at')
        .eq('id', normalized.eventId)
        .single()
      if (updatedEventError) throw new Error(updatedEventError.message)

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
        event_updated_at: updatedEvent.updated_at,
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
              const { data: family } = await sb.from('family_members').select('id, name, full_name')
              const unresolved = normalized.membersAdd.filter((name) => !resolveFamilyMemberByName(family, name))
              if (unresolved.length > 0) {
                throw new Error(`Unknown family member(s): ${unresolved.join(', ')}`)
              }
              addIds = normalized.membersAdd
                .map((name) => resolveFamilyMemberByName(family, name)?.id)
                .filter(Boolean) as string[]
            }

            let removeIds: string[] = []
            if (normalized.membersRemove && normalized.membersRemove.length > 0) {
              const { data: family } = await sb.from('family_members').select('id, name, full_name')
              const unresolved = normalized.membersRemove.filter((name) => !resolveFamilyMemberByName(family, name))
              if (unresolved.length > 0) {
                throw new Error(`Unknown family member(s): ${unresolved.join(', ')}`)
              }
              removeIds = normalized.membersRemove
                .map((name) => resolveFamilyMemberByName(family, name)?.id)
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
      const { data: eventRow, error: eventLoadError } = await sb
        .from('events')
        .select('id, series_id, record_kind, series_revision_applied, original_start_time, original_start_date, start_time, recurrence_master_id, rrule')
        .eq('id', args.id)
        .maybeSingle()
      if (eventLoadError || !eventRow) throw new Error(eventLoadError?.message ?? 'Event not found')

      if (isCanonicalRecurringEvent(eventRow)) {
        const scope = args.recurrence_scope
        const expectedSeriesRevision = args.expected_series_revision
        if (!actionId) throw new Error('Recurring event deletion requires an action ID.')
        if (!['this', 'future', 'all'].includes(scope) || !Number.isSafeInteger(expectedSeriesRevision) || expectedSeriesRevision < 1) {
          throw new Error('Choose whether to delete this event, this and following events, or the entire series.')
        }
        const { data: context, error: contextError } = await sb.rpc('recurrence_get_editor_context_core', {
          p_selected_event_id: args.id,
        })
        if (contextError || !context) throw new Error(contextError?.message ?? 'Recurring event details are unavailable.')
        if (context.series.revision !== expectedSeriesRevision) {
          throw new Error('This recurring series changed before confirmation. Please review it again.')
        }
        const recurrenceResult = await sb.functions.invoke('recurring-event-editor', {
          body: {
            action: 'delete',
            selected_event_id: args.id,
            action_id: actionId,
            scope,
            expected_series_revision: expectedSeriesRevision,
            series_patch: buildRecurringSeriesPatch(context, scope, eventRow),
          },
          headers: { Authorization: `Bearer ${requireEnv('SUPABASE_SERVICE_ROLE_KEY')}` },
        })
        if (recurrenceResult.error) throw new Error(recurrenceResult.error.message)
        if (recurrenceResult.data?.success === false) {
          throw new Error(recurrenceResult.data.error ?? 'Recurring event deletion failed.')
        }
        appendActionTrace('server_ai_action_recurring_succeeded', 'delete_event', {
          event_id: args.id,
          scope,
          series_id: recurrenceResult.data?.result?.series_id ?? eventRow.series_id,
          series_revision: recurrenceResult.data?.result?.series_revision ?? null,
        })
        return new Response(JSON.stringify({
          success: true,
          event_id: args.id,
          action_id: actionId,
          recurrence_scope: scope,
          casa_saved: true,
          google_sync_status: 'queued',
          result: recurrenceResult.data?.result ?? null,
          correlation_id: cid,
        }), {
          headers: { ...CORS, 'content-type': 'application/json' },
        })
      }

      if (eventRow.recurrence_master_id || eventRow.rrule) {
        throw new Error(RECURRING_EDIT_ERROR)
      }
      await sb.functions.invoke('delete-google-event', { body: { event_id: args.id } }).catch(() => {})
      const { error } = await sb.from('events').update({ status: 'cancelled' }).eq('id', args.id)
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ success: true, correlation_id: cid }), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    if (tool === 'complete_reminder') {
      const { data: reminder, error: reminderError } = await sb
        .from('events')
        .select('id, event_type, updated_at')
        .eq('id', args.id)
        .maybeSingle()
      if (reminderError || !reminder) throw new Error(reminderError?.message ?? 'Reminder not found')
      if (reminder.event_type !== 'reminder') throw new Error('Only reminders can be completed')
      if (args.expected_updated_at && reminder.updated_at !== args.expected_updated_at) {
        throw new Error('Reminder changed before completion. Please review it again.')
      }
      const { error } = await sb.rpc('complete_reminder_with_linked_actions', {
        p_reminder_id: args.id,
        p_expected_updated_at: args.expected_updated_at ?? null,
      })
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ success: true, completed: true, event_id: args.id, correlation_id: cid }), {
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
        .select('id, title, series_id, record_kind, recurrence_master_id, rrule')
        .in('id', uniqueIds)
      if (matchedLoadError) throw new Error(matchedLoadError.message)
      if (!matchedRows || matchedRows.length === 0) throw new Error('No matching events found for bulk delete')
      if (matchedRows.some((event) => isCanonicalRecurringEvent(event) || event.recurrence_master_id || event.rrule)) {
        throw new Error('Bulk deletion cannot include recurring events. Choose one recurring event and an explicit scope.')
      }

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
      const result = await saveGroceryItems(sb, args.items)
      return new Response(JSON.stringify({
        ...result,
        correlation_id: cid,
      }), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    if (tool === 'check_grocery_item') {
      const expectedUpdatedAt = normalizeOptionalText(args.expected_updated_at, 80)
      let query = sb
        .from('grocery_items')
        .update({ checked: args.checked, last_modified_source: 'casa' })
        .eq('id', args.item_id)
        .is('deleted_at', null)
      if (expectedUpdatedAt) query = query.eq('updated_at', expectedUpdatedAt)
      const { data, error } = await query
        .select('id, name, updated_at')
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) throw new Error(expectedUpdatedAt ? 'Grocery item changed since this action was proposed' : 'Grocery item not found')
      return new Response(JSON.stringify({ success: true, item: data, external_sync_status: 'asynchronous', correlation_id: cid }), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    if (tool === 'remove_grocery_item') {
      const expectedUpdatedAt = normalizeOptionalText(args.expected_updated_at, 80)
      let query = sb
        .from('grocery_items')
        .update({ deleted_at: new Date().toISOString(), last_modified_source: 'casa' })
        .eq('id', args.item_id)
        .is('deleted_at', null)
      if (expectedUpdatedAt) query = query.eq('updated_at', expectedUpdatedAt)
      const { data, error } = await query
        .select('id, name')
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) throw new Error(expectedUpdatedAt ? 'Grocery item changed since this action was proposed' : 'Grocery item not found')
      return new Response(JSON.stringify({ success: true, item: data, external_sync_status: 'asynchronous', correlation_id: cid }), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    if (tool === 'update_grocery_item_quantity') {
      const quantity = normalizeOptionalText(args.quantity, 60)
      if (!quantity) throw new Error('Grocery quantity is required')
      const expectedUpdatedAt = normalizeOptionalText(args.expected_updated_at, 80)
      const hasUnit = Object.prototype.hasOwnProperty.call(args, 'unit')
      const unit = normalizeOptionalText(args.unit, 60)
      let query = sb
        .from('grocery_items')
        .update({
          quantity,
          ...(hasUnit ? { unit } : {}),
          last_modified_source: 'casa',
        })
        .eq('id', args.item_id)
        .eq('checked', false)
        .is('deleted_at', null)
      if (expectedUpdatedAt) query = query.eq('updated_at', expectedUpdatedAt)
      const { data, error } = await query
        .select('id, name, quantity, unit, updated_at')
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) throw new Error(expectedUpdatedAt ? 'Grocery item changed since this action was proposed' : 'Grocery item not found')
      return new Response(JSON.stringify({ success: true, item: data, external_sync_status: 'asynchronous', correlation_id: cid }), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    if (tool === 'clear_checked_grocery_items') {
      const { data, error } = await sb
        .from('grocery_items')
        .update({ deleted_at: new Date().toISOString(), last_modified_source: 'casa' })
        .eq('checked', true)
        .is('deleted_at', null)
        .select('id')
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({
        success: true,
        count: data?.length ?? 0,
        external_sync_status: 'asynchronous',
        correlation_id: cid,
      }), {
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
