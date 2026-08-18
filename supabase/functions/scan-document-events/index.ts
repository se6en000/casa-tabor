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
  date: string // YYYY-MM-DD
  start_time_local?: string | null // HH:MM
  end_time_local?: string | null // HH:MM
  start_time: string // ISO string
  end_time: string // ISO string
  all_day: boolean
  location_name?: string | null
  address?: string | null
  notes?: string | null
  raw_text_snippet?: string | null
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

function padZero(n: number): string {
  return String(n).padStart(2, '0')
}

function normalizeDateStr(rawDate: unknown, anchorDate: Date): string {
  if (typeof rawDate === 'string') {
    const trimmed = rawDate.trim()
    const ymdMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed)
    if (ymdMatch) {
      return `${ymdMatch[1]}-${padZero(Number(ymdMatch[2]))}-${padZero(Number(ymdMatch[3]))}`
    }
    const mdMatch = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(trimmed)
    if (mdMatch) {
      const year = mdMatch[3] ? (mdMatch[3].length === 2 ? `20${mdMatch[3]}` : mdMatch[3]) : String(anchorDate.getFullYear())
      return `${year}-${padZero(Number(mdMatch[1]))}-${padZero(Number(mdMatch[2]))}`
    }
  }
  return `${anchorDate.getFullYear()}-${padZero(anchorDate.getMonth() + 1)}-${padZero(anchorDate.getDate())}`
}

function normalizeTimeStr(rawTime: unknown): string | null {
  if (typeof rawTime !== 'string') return null
  const trimmed = rawTime.trim().toLowerCase()
  if (!trimmed || trimmed === 'null' || trimmed === 'none' || trimmed === 'all day') return null

  // 12-hour format with am/pm (e.g. "2:30 pm", "10am", "9:15 am")
  const ampmMatch = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i.exec(trimmed)
  if (ampmMatch) {
    let hours = Number(ampmMatch[1])
    const minutes = Number(ampmMatch[2] ?? 0)
    const isPm = ampmMatch[3].toLowerCase() === 'pm'
    if (isPm && hours < 12) hours += 12
    if (!isPm && hours === 12) hours = 0
    return `${padZero(hours)}:${padZero(minutes)}`
  }

  // 24-hour format (e.g. "14:30", "09:00")
  const hmMatch = /^(\d{1,2}):(\d{2})$/.exec(trimmed)
  if (hmMatch) {
    const hours = Number(hmMatch[1])
    const minutes = Number(hmMatch[2])
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${padZero(hours)}:${padZero(minutes)}`
    }
  }

  return null
}

function normalizeItem(raw: unknown, index: number, anchorDate: Date, timezone: string): ExtractedScannedItem | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const title = String(row.title ?? row.name ?? row.summary ?? '').trim()
  if (!title) return null

  const rawType = String(row.type ?? row.event_type ?? 'event').trim().toLowerCase()
  const type: 'event' | 'reminder' = rawType === 'reminder' || rawType === 'task' || rawType === 'todo' ? 'reminder' : 'event'

  const date = normalizeDateStr(row.date ?? row.start_date ?? row.start_time, anchorDate)
  const startTimeLocal = normalizeTimeStr(row.start_time ?? row.time ?? row.start_time_local)
  let endTimeLocal = normalizeTimeStr(row.end_time ?? row.end_time_local)

  const isAllDayExplicit = Boolean(row.all_day ?? row.allDay ?? row.is_all_day)
  const allDay = isAllDayExplicit || !startTimeLocal

  if (startTimeLocal && !endTimeLocal) {
    const [h, m] = startTimeLocal.split(':').map(Number)
    const nextH = (h + 1) % 24
    endTimeLocal = `${padZero(nextH)}:${padZero(m)}`
  }

  // Build standard start_time and end_time ISO strings
  let startTimeIso = ''
  let endTimeIso = ''

  if (allDay) {
    const [y, m, d] = date.split('-').map(Number)
    startTimeIso = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0)).toISOString()
    endTimeIso = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999)).toISOString()
  } else {
    // Construct localized ISO representation for timed events
    startTimeIso = `${date}T${startTimeLocal || '09:00'}:00`
    endTimeIso = `${date}T${endTimeLocal || '10:00'}:00`
  }

  const locationName = typeof row.location_name === 'string' ? row.location_name.trim() || null : (typeof row.location === 'string' ? row.location.trim() || null : null)
  const address = typeof row.address === 'string' ? row.address.trim() || null : null
  const notes = typeof row.notes === 'string' ? row.notes.trim() || null : (typeof row.description === 'string' ? row.description.trim() || null : null)
  const rawSnippet = typeof row.raw_text_snippet === 'string' ? row.raw_text_snippet.trim() || null : (typeof row.snippet === 'string' ? row.snippet.trim() || null : null)
  const suggestedMember = typeof row.suggested_member_name === 'string' ? row.suggested_member_name.trim() || null : (typeof row.member === 'string' ? row.member.trim() || null : null)
  const confidence = Math.max(0.1, Math.min(1.0, Number(row.confidence ?? 0.9) || 0.9))

  return {
    id: `item-${index + 1}-${Date.now().toString(36)}`,
    type,
    title,
    date,
    start_time_local: allDay ? null : startTimeLocal,
    end_time_local: allDay ? null : endTimeLocal,
    start_time: startTimeIso,
    end_time: endTimeIso,
    all_day: allDay,
    location_name: locationName,
    address,
    notes,
    raw_text_snippet: rawSnippet,
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
    const anchorDate = new Date(nowIso)
    const validAnchor = Number.isNaN(anchorDate.getTime()) ? new Date() : anchorDate
    const currentYear = validAnchor.getFullYear()
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
You are the document intelligence OCR & temporal extraction engine for Casa.
Read the attached image(s) with high precision (invitation cards, sports schedules, school flyers, medical slips, permission forms, appointment cards).

ANCHOR CALENDAR CONTEXT:
- Today is: ${validAnchor.toDateString()} (Year: ${currentYear})
- Local Timezone: ${timezone}
- Household Members: ${familyMembersList}

EXTRACTION RULES:
1. Extract EVERY distinct scheduled event or reminder mentioned on the document.
   - Set "type": "event" for calendar commitments (matches, games, parties, doctor appointments, ceremonies, flights).
   - Set "type": "reminder" for deadlines, RSVP notices, permission slip due dates, fee payments, prep instructions (e.g. fasting 12h prior).
2. DATES & TIMES (CRITICAL ACCURACY):
   - For "date", output the exact calendar date in "YYYY-MM-DD" format.
   - If the year is not explicitly written on the paper (e.g. "Saturday, Oct 10" or "Friday 10/16"), use the anchor year ${currentYear} (or ${currentYear + 1} if the date is in the past relative to today).
   - Match the day of week with the date on the paper exactly.
   - For "start_time", output the start time in 24-hour "HH:MM" format (e.g. "09:30", "14:00") or null if all-day.
   - For "end_time", output the end time in 24-hour "HH:MM" format (e.g. "11:00", "16:30") or null.
   - If no specific hour/minute is written (e.g. "Spirit Day: Wear Blue", "Fall Picture Day", "No School - Teacher Workday"), set "all_day": true, and set "start_time": null, "end_time": null.
3. VENUES & ADDRESSES:
   - Extract location_name (e.g. "Riverside Park - Field 3", "SkyZone Trampoline Park", "Dr. Smith Pediatric Suite 200").
   - Extract address (street, city, state, zip) if printed on the document.
4. NOTES & RAW SNIPPET:
   - In "notes", capture relevant details (dress code, what to bring, waiver required, coach contact).
   - In "raw_text_snippet", quote the exact line/phrase from the paper that produced this item.
5. HOUSEHOLD MEMBERS:
   - If any member from (${familyMembersList}) is named, assign them in "suggested_member_name".

RETURN STRICT JSON matching this exact schema:
{
  "document_summary": "1-sentence summary of the document (e.g. Spring Soccer League Schedule with 6 matches)",
  "items": [
    {
      "type": "event", // or "reminder"
      "title": "Clean, descriptive title",
      "date": "YYYY-MM-DD",
      "start_time": "HH:MM", // 24-hour local time, or null if all-day
      "end_time": "HH:MM", // 24-hour local time, or null
      "all_day": false,
      "location_name": "Venue or field name, or null",
      "address": "Street address, or null",
      "notes": "Instructions, attire, or notes, or null",
      "raw_text_snippet": "Exact text line from paper",
      "suggested_member_name": "Member name, or null",
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
      .map((item, idx) => normalizeItem(item, idx, validAnchor, timezone))
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
