import { createClient } from 'npm:@supabase/supabase-js@2'

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
      .select('id, title, description, start_time, end_time, all_day, location_name, address, source_member_id, event_members(family_members(id, name, full_name, role)), event_enrichments(*)')
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

  // Default owner = admin family member (fallback if AI can't identify one)
  const adminMember = familyMembers.find(m => m.is_admin) ?? familyMembers[0]
  const defaultOwnerName = adminMember?.name ?? 'Jake'

  const enrichment = await enrichEvent(llmConfig, event, familyMembers, homeConfig, defaultOwnerName, extra_context, locked_category)

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
    .upsert({ ...enrichmentFields, created_at: new Date().toISOString() }, { onConflict: 'event_id' })
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

  // Always write title; update location if AI found something
  const finalLocationName = aiLocationName ?? (event.location_name as string | null)
  const finalAddress = aiAddress ?? (event.address as string | null)
  const eventPatch: Record<string, string> = { title: finalTitle }
  if (aiLocationName) eventPatch.location_name = aiLocationName
  if (aiAddress) eventPatch.address = aiAddress

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
        const raw = await callLLM(llmConfig, timeParsePrompt)
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

  // ── Step 1: Determine category — skip if user manually locked it ──
  let category: string
  if (lockedCategory && CATEGORY_FIELDS[lockedCategory]) {
    category = lockedCategory  // user-locked, skip AI pass
  } else {
    const categoryPrompt = `You are a smart family assistant for the Tabor family.

Event:
${eventBlock}

Categories available: appointment, school, sports, social, errand, travel, work, medical, birthday, holiday, home_maintenance, dining, other

What is the single best category for this event? Reply with ONLY the category word, nothing else.`
    const categoryRaw = (await callLLM(config, categoryPrompt)).trim().toLowerCase().replace(/[^a-z_]/g, '')
    category = CATEGORY_FIELDS[categoryRaw] ? categoryRaw : 'other'
  }
  const fieldsForCategory = CATEGORY_FIELDS[category]

  // ── Step 2: Fill all fields for that category ──
  const fieldLines = fieldsForCategory
    .map(f => FIELD_DESCRIPTIONS[f] ?? `${f}: string or null`)
    .join('\n  ')

  const familyNamesList = familyMembers.map(m => m.name).join(', ')

  const fieldJsonTemplate = [
    `"category": "${category}"`,
    `"primary_attendee": string — REQUIRED. The ONE person this event is for. Rules in order:
      1. If a family member name appears before "|", ":", or "@" in the title → use that name
      2. If the event is at the family home (home maintenance, delivery, repair) → use "${defaultOwner}"
      3. If a child's school/activity is in the title → use the child's name
      4. If none of the above → default to "${defaultOwner}"
      Choose ONLY from: [${familyNamesList}]`,
    `"concise_description": string — REQUIRED. A short, clear description of what this event is (3-6 words). Do NOT include the person's name. Examples: "AC Service Appointment", "Stuffed Animal Day at Play Pals", "Dentist Checkup", "Soccer Practice". This will be combined as "<primary_attendee> | <concise_description>"`,
    `"attendees": string[] — Supporting people (drivers, chaperones). Only if clearly involved. Can be []. Choose from: [${familyNamesList}]`,
    `"location_name": string or null (venue/business name found via search)`,
    `"address": string or null (full street address of the event, NOT the home address)`,
    ...fieldsForCategory.map(f => {
      if (f === 'what_to_bring') return `"what_to_bring": string[] (array of items)`
      return `"${f}": string or null`
    }),
    `"confidence": "low" | "medium" | "high"`,
  ].join(',\n  ')

  const fillPrompt = `You are a smart family assistant for the Tabor family. You have access to Google Search — USE IT now to find real information about this event.

═══ FAMILY CONTEXT ═══
Home: ${homeAddress ?? 'West Palm Beach, FL'}
Family members (only these names are valid for attendees):
  ${familyRoster}

═══ EVENT (Category: ${category}) ═══
${eventBlock}

═══ YOUR JOB ═══
1. PRIMARY ATTENDEE (always required):
   - Name before "|" or ":" in title → that person
   - Home service/maintenance → "${defaultOwner}" (the homeowner)
   - Child's school/activity → the child
   - Unknown → default to "${defaultOwner}"

2. CONCISE DESCRIPTION: 3–6 words describing the event. No person name in it.

3. SEARCH: Search Google for any business/venue and fill ALL fields with real data.

Fields to fill for a "${category}" event:
  ${fieldLines}

Also always fill:
  location_name — venue/business name (search if needed)
  address — real street address (search if needed, NOT home address)

Return ONLY this JSON object (no markdown, no prose):
{
  ${fieldJsonTemplate}
}`

  const text = await callLLM(config, fillPrompt)
  const result = parseJSON(text)

  // ── Pass 3: if AI didn't return concise_description, get it with a tiny dedicated call ──
  if (!result.concise_description || typeof result.concise_description !== 'string' || !result.concise_description.trim()) {
    const rawConciseTitle = (result.title as string | undefined)?.replace(/^[^|]+\|\s*/, '').trim()
      || (event.title as string).split('|').slice(1).join('|').trim()
    if (rawConciseTitle) {
      // Clean it up with a tiny LLM call (no search needed)
      const cleanPrompt = `Rewrite this event description in 3-6 professional words. Remove any trailing numbers or typos. No person names. Just the description.
Event: "${rawConciseTitle}"
Reply with ONLY the short description, nothing else.`
      const conciseRaw = (await callLLM(config, cleanPrompt)).trim().replace(/^["']|["']$/g, '')
      if (conciseRaw) result.concise_description = conciseRaw
    }
  }

  // Ensure category is set correctly from step 1
  result.category = category
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

async function callLLM(config: { provider: string; model: string; api_key: string }, prompt: string): Promise<string> {
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
    return data.choices?.[0]?.message?.content ?? ''
  }
  if (config.provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': config.api_key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: config.model, max_tokens: 1000, messages: [{ role: 'user', content: prompt }] }),
    })
    const data = await res.json()
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

  const raw = await callLLMNoSearch(config, prompt)

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
async function callLLMNoSearch(config: { provider: string; model: string; api_key: string }, prompt: string): Promise<string> {
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
    return data.choices?.[0]?.message?.content ?? ''
  }
  if (config.provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': config.api_key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: config.model, max_tokens: 1024, messages: [{ role: 'user', content: prompt }] }),
    })
    const data = await res.json()
    return data.content?.[0]?.text ?? ''
  }
  return ''
}
