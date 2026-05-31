import { createClient } from 'npm:@supabase/supabase-js@2'

interface UsageAccum { inputTokens: number; outputTokens: number }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const sb = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))

  const { event_id, extra_context, locked_category } = await req.json().catch(() => ({}))
  if (!event_id) return new Response(JSON.stringify({ error: 'event_id required' }), { status: 400, headers: { ...CORS, 'content-type': 'application/json' } })

  // Load everything in parallel
  const [eventRes, llmRes, familyRes, homeRes] = await Promise.all([
    sb.from('events')
      .select('id, title, description, start_time, end_time, all_day, location_name, address, source_member_id, leg_type, event_members(family_members(id, name, full_name, role)), event_enrichments(*)')
      .eq('id', event_id)
      .single(),
    sb.from('settings').select('value').eq('key', 'llm_config').single(),
    sb.from('family_members').select('id, name, full_name, role, phone, email, is_admin').order('sort_order'),
    sb.from('settings').select('value').eq('key', 'home_config').single(),
  ])

  const event = eventRes.data
  if (eventRes.error || !event) return new Response(JSON.stringify({ error: eventRes.error?.message ?? 'event not found' }), { status: 404, headers: { ...CORS, 'content-type': 'application/json' } })

  const llmConfig = llmRes.data?.value as { provider: string; model: string; api_key: string } | null
  if (!llmConfig?.api_key) return new Response(JSON.stringify({ error: 'No LLM API key configured' }), { status: 422, headers: { ...CORS, 'content-type': 'application/json' } })

  const familyMembers = (familyRes.data ?? []) as { id: string; name: string; full_name: string | null; role: string; phone: string | null; email: string | null; is_admin: boolean }[]
  const homeConfig = homeRes.data?.value as { address?: string; city?: string; state?: string; zip?: string } | null

  // ── Content-hash dedup: skip all LLM calls if event hasn't meaningfully changed ──
  const contentHash = [
    event.title ?? '',
    event.description ?? '',
    event.start_time ?? '',
    event.end_time ?? '',
    event.location_name ?? '',
    event.address ?? '',
  ].join('|')

  const existingEnrichment = (event.event_enrichments as Record<string, unknown>[] | null)?.[0]
  if (!extra_context && !locked_category && existingEnrichment?.source_hash === contentHash) {
    console.log('[enrich-event] skipping — content unchanged, hash matches')
    // Log cached hit (non-blocking)
    sb.from('ai_usage_log').insert({ function_name: 'enrich-event', provider: llmConfig.provider, model: llmConfig.model, input_tokens: 0, output_tokens: 0, cached: true }).then(() => {}).catch(() => {})
    return new Response(JSON.stringify({ ok: true, cached: true }), { headers: { ...CORS, 'content-type': 'application/json' } })
  }

  // Default owner = admin family member (fallback if AI can't identify one)
  const adminMember = familyMembers.find(m => m.is_admin) ?? familyMembers[0]
  const defaultOwnerName = adminMember?.name ?? 'Jake'

  const usageAccum: UsageAccum = { inputTokens: 0, outputTokens: 0 }
  const enrichment = await enrichEvent(llmConfig, event, familyMembers, homeConfig, defaultOwnerName, extra_context, locked_category, usageAccum)

  const row = { ...enrichment, event_id, enriched_by: `${llmConfig.provider}/${llmConfig.model}`, enriched_at: new Date().toISOString(), updated_at: new Date().toISOString() }

  // Strip fields that don't belong in event_enrichments
  const { location_name: aiLocationName, address: aiAddress, attendees: aiAttendees, primary_attendee: aiPrimaryRaw, title: aiTitleRaw, concise_description: aiConcise, ...enrichmentFields } = row as typeof row & { location_name?: string; address?: string; attendees?: string[]; primary_attendee?: string; title?: string; concise_description?: string }

  const nameToId = Object.fromEntries(familyMembers.map(m => [m.name.toLowerCase(), m.id]))

  // ── Server-side primary detection from title (more reliable than AI) ──
  // Strip all "Name | " prefixes to find who is named AND get the clean description
  const titleStr = (event.title as string) ?? ''
  const titleSegments = titleStr.split('|').map((s: string) => s.trim())
  let serverDetectedPrimary: string | null = null
  const descriptionSegments: string[] = []
  for (const seg of titleSegments) {
    const matched = familyMembers.find(m =>
      m.name.toLowerCase() === seg.toLowerCase() ||
      m.full_name?.toLowerCase() === seg.toLowerCase() ||
      m.name.toLowerCase().startsWith(seg.toLowerCase()) ||
      seg.toLowerCase().startsWith(m.name.toLowerCase())
    )
    if (matched && !serverDetectedPrimary) {
      serverDetectedPrimary = matched.name  // first name found is primary
    } else if (!matched) {
      descriptionSegments.push(seg)
    }
  }
  const rawDescription = descriptionSegments.join(' | ').trim() || titleStr
  // Clean up the raw description: remove trailing digits/junk, fix title case
  const cleanTitleDescription = rawDescription
    .replace(/\d+$/, '')           // strip trailing numbers (e.g. "Practice9" → "Practice")
    .replace(/\s{2,}/g, ' ')       // collapse whitespace
    .trim()
    .replace(/\b\w/g, (c: string) => c.toUpperCase()) // Title Case

  // ── Guaranteed owner: server title detection → AI result → default owner ──
  const resolvedPrimary = serverDetectedPrimary
    ?? (aiPrimaryRaw && nameToId[aiPrimaryRaw.toLowerCase()] ? aiPrimaryRaw : defaultOwnerName)

  // ── Guaranteed title: AI concise desc → AI title stripped → cleaned-up title (no name prefix) ──
  const toTitleCase = (s: string) => s.replace(/\b\w/g, (c: string) => c.toUpperCase())
  const rawConcise = aiConcise?.trim() || aiTitleRaw?.replace(/^[^|]+\|\s*/,'').trim() || cleanTitleDescription
  const concisePart = toTitleCase(rawConcise)
  const finalTitle = `${resolvedPrimary} | ${concisePart}`

  const { error: upsertErr } = await sb.from('event_enrichments')
    .upsert({ ...enrichmentFields, source_hash: contentHash, created_at: new Date().toISOString() }, { onConflict: 'event_id' })
  if (upsertErr) return new Response(JSON.stringify({ error: upsertErr.message }), { status: 500, headers: { ...CORS, 'content-type': 'application/json' } })

  // Sync event_members with roles
  const memberInserts: { event_id: string; family_member_id: string; role: string; rsvp_status: string }[] = []
  const primaryId = nameToId[resolvedPrimary.toLowerCase()]
  if (primaryId) memberInserts.push({ event_id, family_member_id: primaryId, role: 'primary', rsvp_status: 'accepted' })
  for (const name of (aiAttendees ?? [])) {
    const id = nameToId[name.toLowerCase()]
    if (id && !memberInserts.find(m => m.family_member_id === id)) {
      memberInserts.push({ event_id, family_member_id: id, role: 'attendee', rsvp_status: 'accepted' })
    }
  }

  if (memberInserts.length > 0) {
    await sb.from('event_members').delete().eq('event_id', event_id)
    await sb.from('event_members').insert(memberInserts)
  }

  // For trip leg events (flights, hotels), preserve the structured title and existing location
  const isTripLeg = !!(event.leg_type as string | null)
  const finalLocationName = isTripLeg
    ? (event.location_name as string | null)  // never overwrite leg location
    : (aiLocationName ?? (event.location_name as string | null))
  const finalAddress = isTripLeg
    ? (event.address as string | null)
    : (aiAddress ?? (event.address as string | null))
  const eventPatch: Record<string, string> = isTripLeg
    ? {}  // don't overwrite title or location for leg events
    : { title: finalTitle }
  if (!isTripLeg && aiLocationName) eventPatch.location_name = aiLocationName
  if (!isTripLeg && aiAddress) eventPatch.address = aiAddress

  await sb.from('events').update({
    is_enriched: true,
    updated_at: new Date().toISOString(),
    ...eventPatch,
  }).eq('id', event_id)

  // ── Generate logistics steps for away events ──
  const homeAddress = homeConfig
    ? [homeConfig.address, homeConfig.city, homeConfig.state, homeConfig.zip].filter(Boolean).join(', ')
    : null

  const isAtHome = !finalLocationName && !finalAddress
  const isHomeService = ['home_maintenance'].includes(enrichmentFields.category as string)

  console.log('[enrich-event] logistics check:', { isAtHome, isHomeService, homeAddress: !!homeAddress, location: finalLocationName })

  if (!isAtHome && !isHomeService && homeAddress && (finalLocationName || finalAddress)) {
    const allAttendeeNames = [resolvedPrimary, ...(aiAttendees ?? [])]
    const attendeeObjs = familyMembers.filter(m => allAttendeeNames.includes(m.name))

    try {
      const logisticsSteps = await generateLogistics(
        llmConfig,
        {
          title: finalTitle,
          start_time: event.start_time as string,
          end_time: event.end_time as string,
          location_name: finalLocationName,
          address: finalAddress,
          category: enrichmentFields.category as string,
        },
        homeAddress,
        attendeeObjs,
        familyMembers,
        usageAccum,
      )

      if (logisticsSteps.length > 0) {
        // Clear old steps then insert fresh ones
        await sb.from('event_logistics').delete().eq('event_id', event_id)

        // Strip drive_time_mins — not a column in event_logistics (goes to event_enrichments)
        await sb.from('event_logistics').insert(
          logisticsSteps.map(({ drive_time_mins: _dtm, ...step }, i) => ({ ...step, event_id, sort_order: i + 1 }))
        )

        // Backfill enrichment travel fields if LLM returned them
        const travelPatch: Record<string, unknown> = {}
        const depStep = logisticsSteps.find(s => s.step_type === 'departure')
        if (depStep?.time) travelPatch.departure_time = depStep.time
        if (logisticsSteps[0]?.drive_time_mins) travelPatch.drive_time_mins = logisticsSteps[0].drive_time_mins
        if (Object.keys(travelPatch).length > 0) {
          await sb.from('event_enrichments').update(travelPatch).eq('event_id', event_id)
        }
      }
    } catch (logErr) {
      console.error('[enrich-event] logistics generation failed (non-fatal):', logErr)
    }
  }

  // ── Parse time updates from extra_context ──
  // If the user's note contains time info (e.g. "starts at 3", "3:30pm", "30 mins"), extract updated times
  let updatedStartTime: string | undefined
  let updatedEndTime: string | undefined
  if (extra_context?.trim()) {
    const timeChangeHints = /\b(\d{1,2}(:\d{2})?\s*(am|pm)|starts?\s+at|ends?\s+at|\d+\s*min(s|utes)?|half\s+hour|hour\s+long)\b/i
    if (timeChangeHints.test(extra_context)) {
      try {
        const eventDate = (event.start_time as string).slice(0, 10) // YYYY-MM-DD
        const timeParsePrompt = `Event date: ${eventDate}
Current start: ${event.start_time}
Current end: ${event.end_time}
User correction: "${extra_context}"

Extract the new start and end times. Use the same date (${eventDate}) unless user specifies otherwise.
Reply ONLY with JSON: {"start_time": "ISO8601", "end_time": "ISO8601"}
Times should be in local Eastern time stored as UTC (EDT = UTC-4 in summer, EST = UTC-5 in winter).`
        const raw = await callLLM(llmConfig, timeParsePrompt, usageAccum)
        const parsed = parseJSON(raw)
        if (parsed.start_time && typeof parsed.start_time === 'string') updatedStartTime = parsed.start_time as string
        if (parsed.end_time && typeof parsed.end_time === 'string') updatedEndTime = parsed.end_time as string
        if (updatedStartTime || updatedEndTime) {
          const timePatch: Record<string, string> = {}
          if (updatedStartTime) timePatch.start_time = updatedStartTime
          if (updatedEndTime) timePatch.end_time = updatedEndTime
          await sb.from('events').update({ ...timePatch, updated_at: new Date().toISOString() }).eq('id', event_id)
        }
      } catch (e) {
        console.error('[enrich-event] time parse failed (non-fatal):', e)
      }
    }
  }

  // Log usage (non-blocking)
  sb.from('ai_usage_log').insert({ function_name: 'enrich-event', provider: llmConfig.provider, model: llmConfig.model, input_tokens: usageAccum.inputTokens, output_tokens: usageAccum.outputTokens, cached: false }).then(() => {}).catch(() => {})

  return new Response(JSON.stringify({
    ok: true,
    enrichment: enrichmentFields,
    title: finalTitle,
    location_name: finalLocationName,
    address: finalAddress,
    primary_attendee: resolvedPrimary,
    attendees: aiAttendees ?? [],
    ...(updatedStartTime ? { start_time: updatedStartTime } : {}),
    ...(updatedEndTime   ? { end_time: updatedEndTime }     : {}),
  }), { headers: { ...CORS, 'content-type': 'application/json' } })
})

// Category→field definitions (mirrors categoryFields.ts on the frontend)
const CATEGORY_FIELDS: Record<string, string[]> = {
  sports:           ['what_to_bring', 'outfit_suggestion', 'parking_notes', 'contact_name', 'contact_phone', 'prep_notes'],
  school:           ['what_to_bring', 'contact_name', 'contact_phone', 'parking_notes', 'prep_notes'],
  medical:          ['contact_name', 'contact_phone', 'cost_estimate', 'what_to_bring', 'dietary_notes', 'prep_notes'],
  appointment:      ['contact_name', 'contact_phone', 'cost_estimate', 'parking_notes', 'prep_notes'],
  home_maintenance: ['contact_name', 'contact_phone', 'cost_estimate', 'prep_notes'],
  dining:           ['dietary_notes', 'cost_estimate', 'outfit_suggestion', 'contact_name', 'contact_phone', 'prep_notes'],
  travel:           ['what_to_bring', 'cost_estimate', 'parking_notes', 'prep_notes'],
  social:           ['outfit_suggestion', 'what_to_bring', 'dietary_notes', 'cost_estimate', 'contact_name', 'contact_phone', 'prep_notes'],
  birthday:         ['outfit_suggestion', 'what_to_bring', 'dietary_notes', 'cost_estimate', 'contact_name', 'contact_phone', 'prep_notes'],
  work:             ['contact_name', 'contact_phone', 'what_to_bring', 'parking_notes', 'prep_notes'],
  errand:           ['contact_name', 'contact_phone', 'cost_estimate', 'prep_notes'],
  holiday:          ['outfit_suggestion', 'what_to_bring', 'dietary_notes', 'meal_impact', 'prep_notes'],
  other:            ['outfit_suggestion', 'what_to_bring', 'dietary_notes', 'meal_impact', 'contact_name', 'contact_phone', 'cost_estimate', 'parking_notes', 'prep_notes'],
}

const FIELD_DESCRIPTIONS: Record<string, string> = {
  what_to_bring:     'what_to_bring: string[] — items to bring (e.g. ["Water bottle", "Shin guards"]). Fill with at least 1–3 relevant items.',
  outfit_suggestion: 'outfit_suggestion: string — what to wear (e.g. "Comfortable clothes, sneakers"). Always suggest something appropriate.',
  parking_notes:     'parking_notes: string — parking tips. Search for real parking info near the venue if possible.',
  contact_name:      'contact_name: string — name of the business, venue, or person to contact. Extract from title/context or search.',
  contact_phone:     'contact_phone: string — phone number. Search Google for the real number if a business name is known.',
  cost_estimate:     'cost_estimate: string — estimated cost (e.g. "$20–40 per person"). Estimate based on venue type if unknown.',
  dietary_notes:     'dietary_notes: string — food/dietary notes (e.g. "Bring nut-free snacks", "Venue has menu options").',
  meal_impact:       'meal_impact: string — how this affects meal timing (e.g. "Eat before, event runs through dinner").',
  prep_notes:        'prep_notes: string — prep reminders or notes (1–3 sentences). Always fill this with something useful.',
}

async function enrichEvent(
  config: { provider: string; model: string; api_key: string },
  event: Record<string, unknown>,
  familyMembers: { id: string; name: string; full_name: string | null; role: string; phone: string | null; email: string | null; is_admin: boolean }[],
  homeConfig: { address?: string; city?: string; state?: string; zip?: string } | null,
  defaultOwner: string,
  extraContext?: string,
  lockedCategory?: string,
  accum?: UsageAccum,
) {
  const start = new Date(event.start_time as string)
  const timeStr = (event.all_day as boolean)
    ? 'all day'
    : start.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })

  const homeAddress = homeConfig
    ? [homeConfig.address, homeConfig.city, homeConfig.state, homeConfig.zip].filter(Boolean).join(', ')
    : null

  const familyRoster = familyMembers.length > 0
    ? familyMembers.map(m => {
        const parts = [`${m.name} (${m.role})`]
        if (m.phone) parts.push(`phone: ${m.phone}`)
        return parts.join(', ')
      }).join('\n  ')
    : 'family'

  const titleAndDesc = `${event.title} ${event.description ?? ''}`.toLowerCase()
  const mentionedMembers = familyMembers
    .filter(m => titleAndDesc.includes(m.name.toLowerCase()) || (m.full_name && titleAndDesc.includes(m.full_name.toLowerCase())))
    .map(m => m.name)
  const linkedMembers = (event.event_members as { family_members: { name: string } }[] | undefined)
    ?.map(m => m.family_members?.name).filter(Boolean) ?? []
  const whoLine = [...new Set([...mentionedMembers, ...linkedMembers])].join(', ') || 'whole family'

  const extraContextLine = extraContext?.trim()
    ? `\nEXTRA CONTEXT (treat as ground truth):\n"${extraContext.trim()}"\n`
    : ''

  const eventBlock = `Title: ${event.title}
When: ${timeStr}
Location: ${(event.location_name as string) || (event.address as string) || 'not specified'}
Description: ${(event.description as string) || 'none'}
Who: ${whoLine}${extraContextLine}`

  const nearCity = homeConfig?.city ?? 'West Palm Beach, FL'

  // ── Single merged call: detect category + fill all fields at once ──
  // Build a combined prompt so we go from 2 LLM calls → 1
  const allCategoryFields = Object.entries(CATEGORY_FIELDS)
    .map(([cat, fields]) => `  ${cat}: ${fields.join(', ')}`)
    .join('\n')

  const familyNamesList = familyMembers.map(m => m.name).join(', ')

  // If category is locked by user, skip detection and go straight to fill
  const categoryInstruction = lockedCategory && CATEGORY_FIELDS[lockedCategory]
    ? `Category is already set to: ${lockedCategory} — do NOT change it.`
    : `STEP 1 — Detect the best category from: appointment, school, sports, social, errand, travel, work, medical, birthday, holiday, home_maintenance, dining, other
Category → fields to fill:
${allCategoryFields}`

  const allFieldDescriptions = Object.entries(FIELD_DESCRIPTIONS)
    .map(([k, v]) => `  "${k}": ${v.split('—')[1]?.trim() ?? 'string or null'}`)
    .join('\n')

  const detectedCategoryPlaceholder = (lockedCategory && CATEGORY_FIELDS[lockedCategory]) ? lockedCategory : '<detected>'

  const fillPrompt = `You are a smart family assistant for the Tabor family. You have access to Google Search — USE IT to find real venue, business, and parking information.

═══ FAMILY CONTEXT ═══
Home: ${homeConfig ? [homeConfig.address, homeConfig.city, homeConfig.state, homeConfig.zip].filter(Boolean).join(', ') : 'West Palm Beach, FL'}
Family members (ONLY these names are valid for attendees):
  ${familyRoster}

═══ EVENT ═══
${eventBlock}

═══ YOUR JOB ═══
${categoryInstruction}

STEP 2 — Fill ALL of these fields:
• primary_attendee (REQUIRED): The ONE person this event is for.
    Rules (in order): 1) Name before "|", ":", or "@" in title → use that name; 2) Home service/maintenance → "${defaultOwner}"; 3) Child's school/activity → the child; 4) Unknown → "${defaultOwner}"
    Choose ONLY from: [${familyNamesList}]
• concise_description (REQUIRED): 3–6 words describing event. NO person names. E.g. "Soccer Practice", "Dentist Checkup", "AC Service Call"
• attendees: string[] — supporting people (drivers, chaperones). [] if none obvious. From: [${familyNamesList}]
• location_name: venue/business name (search Google if needed)
• address: real full street address (search Google, NOT home address)
• confidence: "low" | "medium" | "high"

Category-specific fields to fill (only those relevant to the detected/locked category):
${allFieldDescriptions}

Return ONLY this JSON object (no markdown, no prose):
{
  "category": "${detectedCategoryPlaceholder}",
  "primary_attendee": "<name>",
  "concise_description": "<3-6 words>",
  "attendees": [],
  "location_name": null,
  "address": null,
  "confidence": "medium"
  ... (plus any category-specific fields from the list above)
}`

  const text = await callLLM(config, fillPrompt, accum)
  const result = parseJSON(text)

  // Ensure category is valid
  const detectedCategory = (lockedCategory && CATEGORY_FIELDS[lockedCategory])
    ? lockedCategory
    : (CATEGORY_FIELDS[result.category as string] ? result.category as string : 'other')
  result.category = detectedCategory

  return result
}

function parseJSON(text: string): Record<string, unknown> {
  try {
    // Try to find a JSON object in the response (handles prose before/after from search grounding)
    const firstBrace = text.indexOf('{')
    const lastBrace = text.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace !== -1) {
      const jsonStr = text.slice(firstBrace, lastBrace + 1)
      return JSON.parse(jsonStr)
    }
    // Strip markdown fences as fallback
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    return JSON.parse(clean)
  } catch {
    console.error('Failed to parse LLM response:', text)
    return { category: 'other', what_to_bring: [], confidence: 'low' }
  }
}

async function callLLM(config: { provider: string; model: string; api_key: string }, prompt: string, accum?: UsageAccum): Promise<string> {
  if (config.provider === 'gemini') {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.api_key}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { maxOutputTokens: 1000, temperature: 0.3 },
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(res.status === 429 ? `quota_exceeded: ${data?.error?.message ?? 'Gemini quota exceeded'}` : (data?.error?.message ?? `Gemini error ${res.status}`))
    if (accum) { accum.inputTokens += data.usageMetadata?.promptTokenCount ?? 0; accum.outputTokens += data.usageMetadata?.candidatesTokenCount ?? 0 }
    // Search grounding splits response across multiple parts — join text parts only
    const parts = data.candidates?.[0]?.content?.parts ?? []
    return parts.map((p: { text?: string }) => p.text ?? '').join('')
  }
  if (config.provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.api_key}` },
      body: JSON.stringify({ model: config.model, messages: [{ role: 'user', content: prompt }], max_tokens: 1000, temperature: 0.3 }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(res.status === 429 ? `quota_exceeded: ${data?.error?.message ?? 'OpenAI quota exceeded'}` : (data?.error?.message ?? `OpenAI error ${res.status}`))
    if (accum) { accum.inputTokens += data.usage?.prompt_tokens ?? 0; accum.outputTokens += data.usage?.completion_tokens ?? 0 }
    return data.choices?.[0]?.message?.content ?? ''
  }
  if (config.provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': config.api_key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: config.model, max_tokens: 1000, messages: [{ role: 'user', content: prompt }] }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(res.status === 429 ? `quota_exceeded: ${data?.error?.message ?? 'Anthropic quota exceeded'}` : (data?.error?.message ?? `Anthropic error ${res.status}`))
    if (accum) { accum.inputTokens += data.usage?.input_tokens ?? 0; accum.outputTokens += data.usage?.output_tokens ?? 0 }
    return data.content?.[0]?.text ?? ''
  }
  return ''
}

// ── Logistics step generation for away events ────────────────────────────
interface LogisticsStep {
  step_type: string
  icon: string
  title: string
  description: string | null
  time: string | null
  location_name: string | null
  address: string | null
  drive_time_mins?: number
}

async function generateLogistics(
  config: { provider: string; model: string; api_key: string },
  event: { title: string; start_time: string; end_time: string; location_name: string | null; address: string | null; category: string },
  homeAddress: string,
  attendees: { name: string; role: string }[],
  allFamily: { name: string; role: string }[],
  accum?: UsageAccum,
): Promise<LogisticsStep[]> {
  const startTime = new Date(event.start_time)
  const endTime = new Date(event.end_time)
  const timeStr = startTime.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
  const endStr = endTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })

  const attendeeNames = attendees.map(a => `${a.name} (${a.role})`).join(', ')
  const driversAvailable = allFamily.filter(m => m.role === 'parent' || m.role === 'adult').map(m => m.name).join(', ')

  const destination = event.address || event.location_name || 'the venue'

  const prompt = `You are a logistics planner for the Tabor family. Use Google Search to find the real drive time from the home to the destination.

HOME: ${homeAddress}
DESTINATION: ${destination}
EVENT: "${event.title}"
STARTS: ${timeStr}
ENDS: ${endStr}
WHO'S GOING: ${attendeeNames || 'family'}
AVAILABLE DRIVERS: ${driversAvailable || 'Jake (parent)'}

TASK: Using Google Maps knowledge, estimate the real driving time from home to the destination. Then generate a realistic step-by-step logistics plan as a JSON array.

Rules:
- Add 5–10 min buffer before event start (arrive a few min early)
- If it's a drop-off event (kids sports/school/activity where parent drops off and leaves), include a departure step, drop-off step, and pickup step at end time
- If it's a stay-and-watch event (birthday party, performance, appointment), include departure + arrival only
- If multiple family members need to split (e.g. 2 kids at different places), call that out
- Keep descriptions brief and practical (1 short sentence)
- For time fields use full ISO-8601 format in UTC based on the Eastern timezone offset

Return ONLY a JSON array (no markdown, no prose):
[
  {
    "step_type": "departure|arrival|dropoff|pickup|coordination",
    "icon": "<single emoji — 🚗 for driving, 📍 for arrival, 🏠 for home, the sport/activity emoji for dropoff>",
    "title": "<action title, e.g. 'Leave home by 7:20 PM'>",
    "description": "<1 sentence practical detail, or null>",
    "time": "<ISO-8601 UTC datetime string, e.g. '2026-05-28T23:20:00Z'>",
    "location_name": "<venue name or null>",
    "address": "<full address or null>",
    "drive_time_mins": <integer minutes, only on the first/departure step>
  }
]`

  const raw = await callLLMNoSearch(config, prompt, accum)

  // Parse array
  try {
    const firstBracket = raw.indexOf('[')
    const lastBracket = raw.lastIndexOf(']')
    if (firstBracket === -1 || lastBracket === -1) return []
    const steps = JSON.parse(raw.slice(firstBracket, lastBracket + 1)) as LogisticsStep[]
    return Array.isArray(steps) ? steps : []
  } catch {
    console.error('[generateLogistics] parse error:', raw.slice(0, 300))
    return []
  }
}

// Separate LLM caller without Google Search tool (for structured JSON that must not have grounding prose)
async function callLLMNoSearch(config: { provider: string; model: string; api_key: string }, prompt: string, accum?: UsageAccum): Promise<string> {
  if (config.provider === 'gemini') {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.api_key}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 1024,
          temperature: 0.2,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(res.status === 429 ? `quota_exceeded: ${data?.error?.message ?? 'Gemini quota exceeded'}` : (data?.error?.message ?? `Gemini error ${res.status}`))
    if (accum) { accum.inputTokens += data.usageMetadata?.promptTokenCount ?? 0; accum.outputTokens += data.usageMetadata?.candidatesTokenCount ?? 0 }
    const parts = (data.candidates?.[0]?.content?.parts ?? []) as { text?: string; thought?: boolean }[]
    return parts.filter(p => !p.thought).map(p => p.text ?? '').join('')
  }
  if (config.provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.api_key}` },
      body: JSON.stringify({ model: config.model, messages: [{ role: 'user', content: prompt }], max_tokens: 1024, temperature: 0.2 }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(res.status === 429 ? `quota_exceeded: ${data?.error?.message ?? 'OpenAI quota exceeded'}` : (data?.error?.message ?? `OpenAI error ${res.status}`))
    if (accum) { accum.inputTokens += data.usage?.prompt_tokens ?? 0; accum.outputTokens += data.usage?.completion_tokens ?? 0 }
    return data.choices?.[0]?.message?.content ?? ''
  }
  if (config.provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': config.api_key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: config.model, max_tokens: 1024, messages: [{ role: 'user', content: prompt }] }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(res.status === 429 ? `quota_exceeded: ${data?.error?.message ?? 'Anthropic quota exceeded'}` : (data?.error?.message ?? `Anthropic error ${res.status}`))
    if (accum) { accum.inputTokens += data.usage?.input_tokens ?? 0; accum.outputTokens += data.usage?.output_tokens ?? 0 }
    return data.content?.[0]?.text ?? ''
  }
  return ''
}
