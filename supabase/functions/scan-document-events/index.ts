import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireEnv } from '../_shared/env.ts'
import { resolveBackgroundLlmConfig } from '../_shared/background-llm-model.mjs'
import { createTrackedProviderFetch } from '../_shared/provider-call-ledger.mjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const providerFetch = createTrackedProviderFetch({
  functionName: 'scan-document-events',
  capability: 'document-event-scan',
  trafficClass: 'background',
})

type LlmConfig = {
  provider?: string
  model?: string
  api_key?: string
}

export type ExtractedScannedItem = {
  id?: string
  type: 'event' | 'reminder'
  title: string
  start_time: string
  end_time: string
  all_day: boolean
  location_name?: string | null
  address?: string | null
  notes?: string | null
  suggested_member_name?: string | null
  confidence: number
}

export type ScannedDocumentResult = {
  document_summary: string
  items: ExtractedScannedItem[]
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const trimmed = raw.trim()
  if (!trimmed) throw new Error('Model returned empty response')
  if (trimmed.startsWith('{')) return JSON.parse(trimmed)
  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  if (first >= 0 && last > first) {
    return JSON.parse(trimmed.slice(first, last + 1))
  }
  throw new Error('Model did not return valid JSON')
}

function normalizeItem(raw: unknown, index: number, nowIso: string): ExtractedScannedItem | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const title = String(row.title ?? row.name ?? row.summary ?? '').trim()
  if (!title) return null

  const rawType = String(row.type ?? row.event_type ?? 'event').trim().toLowerCase()
  const type: 'event' | 'reminder' = rawType === 'reminder' || rawType === 'task' || rawType === 'todo' ? 'reminder' : 'event'
  const allDay = Boolean(row.all_day ?? row.allDay ?? (type === 'reminder' && !row.start_time))

  let startTime = String(row.start_time ?? row.startTime ?? '').trim()
  let endTime = String(row.end_time ?? row.endTime ?? '').trim()

  if (!startTime) {
    startTime = nowIso
  }
  if (!endTime) {
    try {
      const parsedStart = new Date(startTime)
      if (!Number.isNaN(parsedStart.getTime())) {
        const parsedEnd = new Date(parsedStart.getTime() + (allDay ? 0 : 60 * 60 * 1000))
        endTime = parsedEnd.toISOString()
      } else {
        endTime = startTime
      }
    } catch {
      endTime = startTime
    }
  }

  const locationName = typeof row.location_name === 'string' ? row.location_name.trim() || null : (typeof row.location === 'string' ? row.location.trim() || null : null)
  const address = typeof row.address === 'string' ? row.address.trim() || null : null
  const notes = typeof row.notes === 'string' ? row.notes.trim() || null : (typeof row.description === 'string' ? row.description.trim() || null : null)
  const suggestedMember = typeof row.suggested_member_name === 'string' ? row.suggested_member_name.trim() || null : (typeof row.member === 'string' ? row.member.trim() || null : null)
  const confidence = Math.max(0.1, Math.min(1.0, Number(row.confidence ?? 0.85) || 0.85))

  return {
    id: `item-${index + 1}-${Date.now().toString(36)}`,
    type,
    title,
    start_time: startTime,
    end_time: endTime,
    all_day: allDay,
    location_name: locationName,
    address,
    notes,
    suggested_member_name: suggestedMember,
    confidence,
  }
}

async function callGeminiJson(config: Required<LlmConfig>, parts: Array<Record<string, unknown>>): Promise<string> {
  const res = await providerFetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.api_key}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    },
  )

  if (!res.ok) {
    const errorText = await res.text().catch(() => '')
    throw new Error(`Gemini request failed (${res.status}): ${errorText}`)
  }
  const data = await res.json()
  const responseParts = (data.candidates?.[0]?.content?.parts ?? []) as Array<{ text?: string; thought?: boolean }>
  return responseParts.filter((part) => !part.thought).map((part) => part.text ?? '').join('').trim()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    const body = await req.json().catch(() => ({}))
    const {
      file_base64: fileBase64Raw,
      files: filesRaw,
      mime_type: mimeTypeRaw,
      current_date_iso: currentDateIsoRaw,
      timezone: timezoneRaw,
      family_members: familyMembersRaw,
    } = body

    const nowIso = String(currentDateIsoRaw || new Date().toISOString())
    const timezone = String(timezoneRaw || 'America/New_York')
    const familyMembersList = Array.isArray(familyMembersRaw)
      ? familyMembersRaw.map((m: Record<string, unknown>) => String(m.name || m.full_name || '')).filter(Boolean).join(', ')
      : 'Family'

    const normalizedFiles: Array<{ file_base64: string; mime_type: string }> = []
    if (Array.isArray(filesRaw) && filesRaw.length > 0) {
      for (const row of filesRaw) {
        if (!row || typeof row !== 'object') continue
        const b64 = String((row as Record<string, unknown>).file_base64 ?? '').trim()
        const mime = String((row as Record<string, unknown>).mime_type ?? 'image/jpeg').trim()
        if (b64) normalizedFiles.push({ file_base64: b64, mime_type: mime })
      }
    } else if (fileBase64Raw) {
      normalizedFiles.push({
        file_base64: String(fileBase64Raw).trim(),
        mime_type: String(mimeTypeRaw || 'image/jpeg').trim(),
      })
    }

    if (normalizedFiles.length === 0) {
      throw new Error('At least one photo or document file is required')
    }

    const sb = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))
    const { data: cfgRows, error: cfgError } = await sb.from('settings').select('value').eq('key', 'llm_config').limit(1)
    if (cfgError) throw new Error(cfgError.message)
    const config = resolveBackgroundLlmConfig(cfgRows?.[0]?.value) as LlmConfig
    if (!config.api_key) throw new Error('No LLM API key configured in Casa settings')

    const provider = String(config.provider ?? 'gemini').toLowerCase()
    if (provider !== 'gemini') {
      throw new Error('Document scanner requires Gemini provider for vision/OCR analysis')
    }

    const model = config.model ?? 'gemini-1.5-flash'
    const llmConfig: Required<LlmConfig> = { provider, model, api_key: config.api_key }

    const promptText = `
You are the document intelligence engine for Casa, an executive household operating system.
Analyze the attached document(s), photos, cards, flyers, schedules, medical appointment slips, or invitations.

CONTEXT:
- Current Anchor Date & Time: ${nowIso}
- Local Timezone: ${timezone}
- Known Household Members: ${familyMembersList}

INSTRUCTIONS:
1. Examine all text, dates, times, deadlines, locations, and actions in the image(s).
2. Extract ONE TO MANY items found in the document:
   - Categorize as "event" if it is a specific calendar commitment (party, sports match/practice, doctor appt, performance, conference, school ceremony).
   - Categorize as "reminder" if it is an action item, RSVP deadline, permission slip due date, payment due, prep requirement (e.g. fasting 12h prior, wear specific jersey color).
3. Dates & Times:
   - Resolve all dates relative to current anchor timestamp (${nowIso}) in timezone ${timezone}.
   - If a year is not printed (e.g., "Saturday, Oct 14"), use the current year or next upcoming occurrence.
   - Format timestamps as full ISO 8601 strings (e.g. "2026-10-14T14:00:00.000Z" or with local timezone offset).
   - If no specific time of day is mentioned (e.g. "Spirit Week: Crazy Hat Day"), set "all_day": true.
   - If start time is given without end time, default end_time to 1 hour after start_time.
4. Locations:
   - Extract location_name (e.g. "St. Jude Medical Pavilion - Suite 400", "Lincoln Middle School Gymnasium").
   - Extract full address if visible on document.
5. People & Notes:
   - If any known household member is mentioned or implied, include their name in suggested_member_name.
   - Include helpful instructions, dress code, what to bring, coach/organizer phone or email in "notes".

RETURN STRICT JSON matching this schema:
{
  "document_summary": "Short 1-sentence summary of what this document is (e.g. Spring Soccer Schedule with 6 matches)",
  "items": [
    {
      "type": "event",
      "title": "Clean, concise title",
      "start_time": "ISO-8601 timestamp",
      "end_time": "ISO-8601 timestamp",
      "all_day": false,
      "location_name": "Venue or field name",
      "address": "Street address if present, or null",
      "notes": "Relevant details, attire, or instructions",
      "suggested_member_name": "Matched member name or null",
      "confidence": 0.95
    }
  ]
}
`.trim()

    const parts: Array<Record<string, unknown>> = [{ text: promptText }]
    for (const file of normalizedFiles) {
      parts.push({
        inline_data: {
          mime_type: file.mime_type,
          data: file.file_base64,
        },
      })
    }

    const rawResponse = await callGeminiJson(llmConfig, parts)
    const parsed = parseJsonObject(rawResponse)
    const rawItems = Array.isArray(parsed.items) ? parsed.items : []
    const normalizedItems = rawItems
      .map((item, idx) => normalizeItem(item, idx, nowIso))
      .filter((item): item is ExtractedScannedItem => item !== null)

    const summary = String(parsed.document_summary || `Found ${normalizedItems.length} items from document scan`).trim()

    return new Response(
      JSON.stringify({
        success: true,
        document_summary: summary,
        items: normalizedItems,
      }),
      { headers: { ...CORS, 'content-type': 'application/json' } },
    )
  } catch (err) {
    console.error('scan-document-events error:', err)
    return new Response(
      JSON.stringify({
        success: false,
        error: (err as Error).message ?? 'Failed to scan document',
      }),
      { status: 500, headers: { ...CORS, 'content-type': 'application/json' } },
    )
  }
})
