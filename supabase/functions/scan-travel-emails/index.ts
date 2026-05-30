/**
 * scan-travel-emails
 *
 * Scans each family member's Gmail for flight/hotel confirmation emails.
 * Uses AI to extract structured travel data, calls weather API for forecast,
 * generates packing list and home coverage notes, and upserts a trip record.
 *
 * POST {}                        — scan all members
 * POST { family_member_id }      — scan specific member
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TRAVEL_KEYWORDS = [
  'itinerary', 'e-ticket', 'eticket', 'boarding pass', 'flight confirmation',
  'booking confirmation', 'reservation confirmed', 'hotel confirmation',
  'your flight', 'flight receipt', 'trip receipt', 'travel itinerary',
  'airline confirmation', 'ticket number', 'record locator',
  'trip document', 'your e-ticket', 'ticket receipt', 'travel receipt',
  'e-ticket and trip', 'flight details', 'travel details',
]

// Known corporate travel & airline sender domains
const TRAVEL_SENDER_DOMAINS = [
  'mycwt.com', 'carlsonwagonlit.com', 'concur.com', 'egencia.com',
  'aa.com', 'delta.com', 'united.com', 'southwest.com', 'jetblue.com',
  'spirit.com', 'alaskaair.com', 'hawaiianairlines.com', 'flyfrontier.com',
  'marriott.com', 'hilton.com', 'ihg.com', 'hyatt.com', 'wyndham.com',
  'hotels.com', 'booking.com', 'expedia.com', 'kayak.com', 'orbitz.com',
  'priceline.com', 'travelport.com', 'sabre.com', 'amadeus.com',
  'tripit.com', 'worldchoice.com',
]

const TRAVEL_REGEX = new RegExp(TRAVEL_KEYWORDS.join('|'), 'i')

// ── Gmail helpers ──────────────────────────────────────────────────────────

async function gmailFetch(path: string, token: string) {
  return fetch(`https://gmail.googleapis.com/gmail/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

function decodeBase64(data: string): string {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/')
  try {
    return atob(b64)
  } catch {
    return ''
  }
}

function extractBodyText(payload: Record<string, unknown>): string {
  const parts = (payload.parts as Record<string, unknown>[] | undefined) ?? []
  const mimeType = payload.mimeType as string ?? ''
  const bodyData = (payload.body as Record<string, unknown> | undefined)?.data as string | undefined

  if (bodyData && (mimeType === 'text/plain' || mimeType === 'text/html')) {
    return decodeBase64(bodyData)
  }

  // Collect ALL parts (not just first match) for multi-part emails like CWT
  const texts: string[] = []
  for (const part of parts) {
    const text = extractBodyText(part as Record<string, unknown>)
    if (text.length > 50) texts.push(text)
  }
  return texts.join('\n')
}

function hasPdfAttachment(payload: Record<string, unknown>): boolean {
  const parts = (payload.parts as Record<string, unknown>[] | undefined) ?? []
  for (const part of parts) {
    const mime = part.mimeType as string ?? ''
    if (mime === 'application/pdf') return true
    if (hasPdfAttachment(part as Record<string, unknown>)) return true
  }
  return false
}

async function searchTravelEmails(token: string, since: Date): Promise<{ id: string }[]> {
  const after = Math.floor(since.getTime() / 1000)

  // Keyword-based search (catches most confirmation emails)
  const keywordQuery = encodeURIComponent(
    `(itinerary OR "flight confirmation" OR "booking confirmation" OR "e-ticket" OR "eticket" OR ` +
    `"hotel confirmation" OR "reservation confirmed" OR "trip document" OR "your e-ticket" OR ` +
    `"ticket receipt" OR "travel itinerary" OR "flight receipt" OR "boarding pass") after:${after}`
  )

  // Sender-domain search (catches CWT, Concur, airlines, hotels)
  const senderQuery = encodeURIComponent(
    `(${TRAVEL_SENDER_DOMAINS.map(d => `from:${d}`).join(' OR ')}) after:${after}`
  )

  const [kwRes, sndRes] = await Promise.all([
    gmailFetch(`/users/me/messages?q=${keywordQuery}&maxResults=30`, token),
    gmailFetch(`/users/me/messages?q=${senderQuery}&maxResults=30`, token),
  ])

  const kwMsgs: { id: string }[] = kwRes.ok ? ((await kwRes.json()).messages ?? []) : []
  const sndMsgs: { id: string }[] = sndRes.ok ? ((await sndRes.json()).messages ?? []) : []

  // Deduplicate
  const seen = new Set<string>()
  const all: { id: string }[] = []
  for (const m of [...kwMsgs, ...sndMsgs]) {
    if (!seen.has(m.id)) { seen.add(m.id); all.push(m) }
  }
  return all
}

// ── AI helpers ─────────────────────────────────────────────────────────────

async function callLLM(
  llmConfig: { provider: string; model: string; api_key: string },
  systemPrompt: string,
  userContent: string
): Promise<string> {
  const provider = llmConfig.provider ?? 'openai'

  if (provider === 'gemini') {
    const model = llmConfig.model || 'gemini-2.0-flash'
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${llmConfig.api_key}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userContent }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    })
    if (!res.ok) throw new Error(`Gemini error: ${await res.text()}`)
    const data = await res.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  }

  if (provider === 'anthropic') {
    const url = 'https://api.anthropic.com/v1/messages'
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': llmConfig.api_key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: llmConfig.model || 'claude-3-haiku-20240307',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
    })
    if (!res.ok) throw new Error(`Anthropic error: ${await res.text()}`)
    const data = await res.json()
    return data.content[0].text
  }

  // Default: OpenAI
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${llmConfig.api_key}` },
    body: JSON.stringify({
      model: llmConfig.model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
    }),
  })
  if (!res.ok) throw new Error(`OpenAI error: ${await res.text()}`)
  const data = await res.json()
  return data.choices[0].message.content
}

// Airport timezone offsets (UTC offset in hours, standard time; add 1 for DST Mar–Nov)
const AIRPORT_TZ: Record<string, number> = {
  // Eastern (EST -5 / EDT -4)
  PBI: -5, MIA: -5, FLL: -5, MCO: -5, TPA: -5, JAX: -5,
  JFK: -5, LGA: -5, EWR: -5, BOS: -5, BDL: -5, PHL: -5, PIT: -5,
  CLT: -5, RDU: -5, BWI: -5, IAD: -5, DCA: -5, ATL: -5,
  DTW: -5, CLE: -5, CMH: -5, CVG: -5, IND: -5,
  // Central (CST -6 / CDT -5)
  DFW: -6, DAL: -6, IAH: -6, HOU: -6, SAT: -6, AUS: -6, MSY: -6,
  ORD: -6, MDW: -6, MKE: -6, STL: -6, MCI: -6, OMA: -6,
  MSP: -6, DSM: -6, LIT: -6, MEM: -6, BNA: -6,
  // Mountain (MST -7 / MDT -6)
  DEN: -7, SLC: -7, ABQ: -7, PHX: -7, TUS: -7, BOI: -7, BIL: -7,
  // Pacific (PST -8 / PDT -7)
  LAX: -8, SFO: -8, SJC: -8, OAK: -8, SEA: -8, PDX: -8, LAS: -8, SAN: -8,
}

function isDst(date: Date): boolean {
  // US DST: second Sunday of March through first Sunday of November
  const jan = new Date(date.getFullYear(), 0, 1).getTimezoneOffset()
  const jul = new Date(date.getFullYear(), 6, 1).getTimezoneOffset()
  return date.getTimezoneOffset() < Math.max(jan, jul)
}

function tzOffsetForAirport(iata: string, dateStr: string): number {
  const base = AIRPORT_TZ[iata.toUpperCase()] ?? -5 // default Eastern
  const date = new Date(dateStr + 'T12:00:00Z')
  return isDst(date) ? base + 1 : base
}

function toOffsetString(hours: number): string {
  const abs = Math.abs(hours)
  const h = String(Math.floor(abs)).padStart(2, '0')
  const m = String((abs % 1) * 60).padStart(2, '0')
  return (hours < 0 ? '-' : '+') + h + ':' + m
}

const EXTRACT_SYSTEM = `You are a travel data extractor. Extract ALL flight and hotel information from the email.
This may be a corporate travel booking from CWT (Carlson Wagonlit Travel), Concur, Egencia, or an airline directly.
Look for: flight numbers (e.g. AA2467), IATA airport codes (e.g. DFW, PBI), confirmation codes (e.g. QJRMUD),
departure/arrival times, hotel names, addresses, check-in/checkout dates.
Return ONLY valid JSON with these exact fields (null for missing):
{
  "traveler_name": string|null,
  "destination_city": string|null,
  "destination_state": string|null,
  "destination_country": string|null,
  "outbound_flight_number": string|null,
  "outbound_airline": string|null,
  "outbound_origin_airport": string|null,
  "outbound_dest_airport": string|null,
  "outbound_departs_at": string|null,
  "outbound_arrives_at": string|null,
  "outbound_seat": string|null,
  "outbound_terminal": string|null,
  "outbound_confirmation": string|null,
  "layover_airport": string|null,
  "layover_flight_number": string|null,
  "layover_airline": string|null,
  "layover_departs_at": string|null,
  "layover_arrives_at": string|null,
  "hotel_name": string|null,
  "hotel_address": string|null,
  "hotel_checkin_date": string|null,
  "hotel_checkout_date": string|null,
  "hotel_checkin_time": string|null,
  "hotel_checkout_time": string|null,
  "hotel_confirmation": string|null,
  "hotel_phone": string|null,
  "return_flight_number": string|null,
  "return_airline": string|null,
  "return_origin_airport": string|null,
  "return_dest_airport": string|null,
  "return_departs_at": string|null,
  "return_arrives_at": string|null,
  "return_seat": string|null,
  "return_terminal": string|null,
  "return_confirmation": string|null
}

CRITICAL TIME RULE — READ CAREFULLY:
Times in travel emails are LOCAL airport clock times. You MUST preserve them as the EXACT digits shown — do NOT convert to UTC, do NOT apply any timezone math.
Format: "YYYY-MM-DDTHH:MM:SS" with NO suffix (no Z, no offset). Just the date and the exact clock digits from the email.

CORRECT EXAMPLES:
  PBI departure "7:04am" Jun 2 2026  → "2026-06-02T07:04:00"   ✓ (exact digits, no suffix)
  DFW arrival "9:22am" Jun 2 2026    → "2026-06-02T09:22:00"   ✓
  DFW departure "9:32am" Jun 4 2026  → "2026-06-04T09:32:00"   ✓
  PBI arrival "1:21pm" Jun 4 2026    → "2026-06-04T13:21:00"   ✓

WRONG (never do this):
  "2026-06-02T11:04:00Z"   ✗ (that's UTC-converted, 4 hours wrong)
  "2026-06-02T07:04:00Z"   ✗ (Z suffix incorrectly implies UTC)
  "2026-06-02T07:04:00-04:00" ✗ (offset not needed, omit it)

Hotel dates: use "YYYY-MM-DD" format (date only, no time).
Airport codes must be 3-letter IATA (e.g. DFW, PBI, LAX). No explanation, only JSON.`

const PACKING_SYSTEM = `You are a travel assistant. Based on the trip details and weather forecast, generate a practical packing list.
Return ONLY valid JSON array: [{"item": "...", "reason": "..."}]
Include 8-12 items. Consider: business attire, weather conditions, trip duration, destination type.`

const HOME_COVERAGE_SYSTEM = `You are a family logistics assistant. Based on who is traveling and the family calendar, suggest home coverage tasks.
Return ONLY valid JSON: {"notes": "...", "tasks": ["..."]}
Be practical: school pickups, pet care, house tasks, communication reminders.`

// ── Weather helper (Open-Meteo — free, no API key) ────────────────────────

const WMO_CONDITIONS: Record<number, string> = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Foggy', 48: 'Icy fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow',
  80: 'Rain showers', 81: 'Rain showers', 82: 'Heavy showers',
  95: 'Thunderstorm', 96: 'Thunderstorm w/ hail', 99: 'Thunderstorm w/ hail',
}

async function getWeatherForecast(
  city: string,
  state: string | null,
  startDateStr?: string | null,   // YYYY-MM-DD trip start — show weather for trip dates
  _apiKey?: string
): Promise<{ date: string; high: number; low: number; condition: string; icon: string }[]> {
  // Step 1: geocode the city
  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`
  const geoRes = await fetch(geoUrl)
  if (!geoRes.ok) return []
  const geoData = await geoRes.json()
  const loc = geoData.results?.[0]
  if (!loc) return []

  // Step 2: get forecast (16 days so we can reach a future trip start date, Fahrenheit)
  const wxUrl = `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto&forecast_days=16&temperature_unit=fahrenheit`
  const wxRes = await fetch(wxUrl)
  if (!wxRes.ok) return []
  const wx = await wxRes.json()

  const days: string[] = wx.daily?.time ?? []

  // Find the index where the trip starts (default: day 0 = today)
  let startIdx = 0
  if (startDateStr) {
    const idx = days.findIndex(d => d >= startDateStr)
    if (idx >= 0) startIdx = idx
  }

  return days.slice(startIdx, startIdx + 5).map((date: string, i: number) => {
    const idx = startIdx + i
    const code = wx.daily.weathercode[idx] ?? 0
    return {
      date,
      high: Math.round(wx.daily.temperature_2m_max[idx]),
      low: Math.round(wx.daily.temperature_2m_min[idx]),
      condition: WMO_CONDITIONS[code] ?? 'Unknown',
      icon: String(code),
    }
  })
}

// ── Logistics calculator ───────────────────────────────────────────────────

// Known IATA airport coordinates for quick lookup (avoids geocoding every time)
const AIRPORT_COORDS: Record<string, [number, number]> = {
  PBI: [26.6832, -80.0956], MIA: [25.7959, -80.2870], FLL: [26.0726, -80.1527],
  MCO: [28.4294, -81.3089], TPA: [27.9755, -82.5332], JAX: [30.4941, -81.6879],
  ATL: [33.6407, -84.4277], CLT: [35.2140, -80.9431], DCA: [38.8521, -77.0378],
  IAD: [38.9531, -77.4565], BWI: [39.1754, -76.6683], PHL: [39.8721, -75.2437],
  JFK: [40.6413, -73.7781], LGA: [40.7769, -73.8740], EWR: [40.6895, -74.1745],
  BOS: [42.3656, -71.0096], ORD: [41.9742, -87.9073], MDW: [41.7868, -87.7522],
  DFW: [32.8998, -97.0403], DAL: [32.8471, -96.8518], IAH: [29.9902, -95.3368],
  HOU: [29.6454, -95.2789], AUS: [30.1975, -97.6664], MSY: [29.9934, -90.2580],
  DEN: [39.8561, -104.6737], SLC: [40.7884, -111.9778], PHX: [33.4373, -112.0078],
  LAX: [33.9425, -118.4081], SFO: [37.6213, -122.3790], SEA: [47.4502, -122.3088],
  LAS: [36.0840, -115.1537], SAN: [32.7338, -117.1933], PDX: [45.5898, -122.5951],
}

async function getDriveMinutes(fromAddress: string, toIata: string): Promise<number> {
  const airportCoords = AIRPORT_COORDS[toIata.toUpperCase()]
  if (!airportCoords) return 45 // unknown airport — default 45min

  try {
    // Geocode origin address using Nominatim (free, no key)
    const geoRes = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(fromAddress)}&format=json&limit=1`,
      { headers: { 'User-Agent': 'CasaTabor/1.0' } }
    )
    if (!geoRes.ok) return 45
    const geoData = await geoRes.json()
    if (!geoData[0]) return 45
    const { lat, lon } = geoData[0]

    // Route using OSRM (free public API)
    const routeRes = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${lon},${lat};${airportCoords[1]},${airportCoords[0]}?overview=false`
    )
    if (!routeRes.ok) return 45
    const routeData = await routeRes.json()
    const durationSec = routeData.routes?.[0]?.duration ?? 2700
    return Math.ceil(durationSec / 60) + 5 // round up + 5min buffer
  } catch {
    return 45
  }
}

// These work on the literal ISO digits (not UTC-adjusted timestamps)
function nominalAddMinutes(iso: string, mins: number): string {
  if (!iso.includes('T')) return iso
  const [datePart, timePart] = iso.split('T')
  const timeDigits = timePart.replace(/[Z+-].*$/, '')
  const [h, m, s] = timeDigits.split(':').map(Number)
  const total = h * 60 + m + mins
  const newH = Math.floor(((total % 1440) + 1440) % 1440 / 60)
  const newM = ((total % 60) + 60) % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${datePart}T${pad(newH)}:${pad(newM)}:${pad(s ?? 0)}Z`
}

function calcLeaveHomeBy(departsAt: string | null, driveMin: number): string | null {
  if (!departsAt) return null
  // 90min TSA buffer + drive time, working on nominal local digits
  return nominalAddMinutes(departsAt, -(90 + driveMin))
}

function calcLeaveHotelBy(returnsAt: string | null, driveMin: number): string | null {
  if (!returnsAt) return null
  return nominalAddMinutes(returnsAt, -(90 + driveMin))
}

// Airport UTC offset table (summer/daylight = Mar–Nov, winter = Nov–Mar)
const AIRPORT_UTC_OFFSET_HOURS: Record<string, { summer: number; winter: number }> = {
  // Eastern
  PBI: { summer: -4, winter: -5 }, MIA: { summer: -4, winter: -5 }, FLL: { summer: -4, winter: -5 },
  MCO: { summer: -4, winter: -5 }, TPA: { summer: -4, winter: -5 }, JAX: { summer: -4, winter: -5 },
  ATL: { summer: -4, winter: -5 }, CLT: { summer: -4, winter: -5 }, RDU: { summer: -4, winter: -5 },
  DCA: { summer: -4, winter: -5 }, IAD: { summer: -4, winter: -5 }, BWI: { summer: -4, winter: -5 },
  PHL: { summer: -4, winter: -5 }, JFK: { summer: -4, winter: -5 }, LGA: { summer: -4, winter: -5 },
  EWR: { summer: -4, winter: -5 }, BOS: { summer: -4, winter: -5 }, DTW: { summer: -4, winter: -5 },
  // Central
  DFW: { summer: -5, winter: -6 }, DAL: { summer: -5, winter: -6 }, IAH: { summer: -5, winter: -6 },
  HOU: { summer: -5, winter: -6 }, AUS: { summer: -5, winter: -6 }, MSY: { summer: -5, winter: -6 },
  ORD: { summer: -5, winter: -6 }, MDW: { summer: -5, winter: -6 }, MCI: { summer: -5, winter: -6 },
  MSP: { summer: -5, winter: -6 }, BNA: { summer: -5, winter: -6 }, MEM: { summer: -5, winter: -6 },
  STL: { summer: -5, winter: -6 },
  // Mountain
  DEN: { summer: -6, winter: -7 }, SLC: { summer: -6, winter: -7 }, PHX: { summer: -7, winter: -7 },
  ABQ: { summer: -6, winter: -7 },
  // Pacific
  LAX: { summer: -7, winter: -8 }, SFO: { summer: -7, winter: -8 }, SEA: { summer: -7, winter: -8 },
  LAS: { summer: -7, winter: -8 }, SAN: { summer: -7, winter: -8 }, PDX: { summer: -7, winter: -8 },
}

/**
 * Convert a nominal ISO string ("2026-06-02T07:04:00" — no timezone suffix)
 * to a proper UTC ISO string for storage in the calendar events table.
 * Uses the departure airport's local timezone offset.
 */
function nominalToUTCForCalendar(nominal: string, airportCode: string): string {
  if (!nominal || !nominal.includes('T')) return nominal
  // Strip any existing timezone suffix the LLM might have added (Z, +HH:MM, -HH:MM)
  const clean = nominal.replace(/[Z]$/, '').replace(/[+-]\d{2}:\d{2}$/, '')
  const tz = AIRPORT_UTC_OFFSET_HOURS[airportCode.toUpperCase()]
  if (!tz) return clean + 'Z' // unknown airport — treat as UTC (imperfect fallback)
  const datePart = clean.split('T')[0]
  const month = parseInt(datePart.split('-')[1], 10)
  // March–November = summer/daylight saving
  const isSummer = month >= 3 && month <= 11
  const offsetHours = isSummer ? tz.summer : tz.winter
  // Build a Date from the nominal string as if it were UTC, then subtract the offset
  const nominalUTCms = new Date(clean + 'Z').getTime()
  if (isNaN(nominalUTCms)) return clean + 'Z' // guard against invalid strings
  const trueUTCms = nominalUTCms - offsetHours * 3600 * 1000
  return new Date(trueUTCms).toISOString()
}

// ── Shared extraction + upsert pipeline ──────────────────────────────────

async function extractAndUpsertTrip(
  sb: ReturnType<typeof createClient>,
  llmConfig: { provider: string; model: string; api_key: string },
  opts: {
    sourceText: string        // full email/PDF text
    sourceSubject: string
    sourceType: 'gmail' | 'pdf'
    gmailMessageId?: string   // set for gmail sources
    familyMemberId: string
    memberName: string
    existingTripId?: string   // set when updating an existing trip
    eventId?: string          // calendar event to patch after extraction
  }
): Promise<{ ok: boolean; debug: string }> {
  const { sourceText, sourceSubject, sourceType, gmailMessageId, familyMemberId, memberName, existingTripId, eventId } = opts

  // AI extraction
  const truncatedBody = sourceText.slice(0, 6000)
  let extracted: Record<string, unknown> = {}
  try {
    const raw = await callLLM(llmConfig, EXTRACT_SYSTEM, `Email subject: ${sourceSubject}\n\n${truncatedBody}`)
    extracted = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim())
  } catch (err) {
    return { ok: false, debug: `llm-err: ${String(err).slice(0, 120)}` }
  }

  if (!extracted.outbound_departs_at && !extracted.outbound_flight_number) {
    return { ok: false, debug: 'no flight data extracted' }
  }

  const travelerName = (extracted.traveler_name as string | null) ?? memberName
  const destCity = (extracted.destination_city as string | null) ?? ''
  const destState = (extracted.destination_state as string | null) ?? null
  const originAirport = (extracted.outbound_origin_airport as string | null) ?? ''
  const returnAirport = (extracted.return_origin_airport as string | null) ?? ''

  const tripStartDate = extracted.outbound_departs_at
    ? (extracted.outbound_departs_at as string).slice(0, 10)
    : (extracted.hotel_checkin_date as string | null)
  const tripEndDate = extracted.return_arrives_at
    ? (extracted.return_arrives_at as string).slice(0, 10)
    : (extracted.hotel_checkout_date as string | null)

  if (tripEndDate && new Date(tripEndDate) < new Date(Date.now() - 90 * 86400000)) {
    return { ok: false, debug: 'trip ended >90 days ago, skipping' }
  }

  // Load home address from home_config (single source of truth)
  const { data: homeConfigRow } = await sb.from('settings').select('value').eq('key', 'home_config').maybeSingle()
  const hc = homeConfigRow?.value as { address?: string; city?: string; state?: string; zip?: string } | null
  const homeAddress: string = hc
    ? [hc.address, hc.city, hc.state, hc.zip].filter(Boolean).join(', ')
    : ''

  // ── Run all independent async tasks in parallel ──────────────────────────
  const [
    driveToAirport,
    driveFromAirport,
    weatherForecast,
    packingRaw,
    homeCoverageRaw,
  ] = await Promise.all([
    homeAddress && originAirport ? getDriveMinutes(homeAddress, originAirport) : Promise.resolve(45),
    homeAddress && returnAirport ? getDriveMinutes(homeAddress, returnAirport) : Promise.resolve(30),
    destCity ? getWeatherForecast(destCity, destState, tripStartDate ?? null) : Promise.resolve([]),
    // Packing list
    callLLM(llmConfig, PACKING_SYSTEM, `Traveler: ${travelerName}
Destination: ${destCity}${destState ? `, ${destState}` : ''}
Trip dates: ${extracted.outbound_departs_at ?? 'unknown'} to ${extracted.return_arrives_at ?? extracted.hotel_checkout_date ?? 'unknown'}
Trip type: Work/business trip`).catch(() => '[]'),
    // Home coverage
    callLLM(llmConfig, HOME_COVERAGE_SYSTEM, `${travelerName} is traveling to ${destCity} for work.
Departure: ${extracted.outbound_departs_at}
Return: ${extracted.return_arrives_at ?? extracted.hotel_checkout_date}
This is a family household. Other family members remain at home.`).catch(() => '{"notes":"","tasks":[]}'),
  ])

  const leaveHomeBy = calcLeaveHomeBy(extracted.outbound_departs_at as string | null, driveToAirport as number)
  const leaveHotelBy = calcLeaveHotelBy(extracted.return_departs_at as string | null, driveFromAirport as number)

  let packingSuggestions: { item: string; reason: string }[] = []
  try { packingSuggestions = JSON.parse((packingRaw as string).replace(/```json\n?|\n?```/g, '').trim()) } catch { /* non-fatal */ }

  let aiNotes = ''
  let homeCoverageNotes = ''
  try {
    const parsed = JSON.parse((homeCoverageRaw as string).replace(/```json\n?|\n?```/g, '').trim())
    aiNotes = parsed.notes ?? ''
    homeCoverageNotes = (parsed.tasks ?? []).join('\n')
  } catch { /* non-fatal */ }

  const tripTitle = `${travelerName} | ${destCity}${destState ? ` ${destState}` : ''} Work Trip`

  const tripPayload = {
    family_member_id: familyMemberId,
    traveler_name: travelerName,
    trip_title: tripTitle,
    destination_city: destCity,
    destination_state: destState,
    destination_country: (extracted.destination_country as string | null) ?? 'US',
    outbound_flight_number: extracted.outbound_flight_number,
    outbound_airline: extracted.outbound_airline,
    outbound_origin_airport: extracted.outbound_origin_airport,
    outbound_dest_airport: extracted.outbound_dest_airport,
    outbound_departs_at: extracted.outbound_departs_at,
    outbound_arrives_at: extracted.outbound_arrives_at,
    outbound_seat: extracted.outbound_seat,
    outbound_terminal: extracted.outbound_terminal,
    outbound_confirmation: extracted.outbound_confirmation,
    layover_airport: extracted.layover_airport,
    layover_flight_number: extracted.layover_flight_number,
    layover_airline: extracted.layover_airline,
    layover_departs_at: extracted.layover_departs_at,
    layover_arrives_at: extracted.layover_arrives_at,
    hotel_name: extracted.hotel_name,
    hotel_address: extracted.hotel_address,
    hotel_checkin_date: extracted.hotel_checkin_date,
    hotel_checkout_date: extracted.hotel_checkout_date,
    hotel_checkin_time: (extracted.hotel_checkin_time as string | null) ?? '3:00 PM',
    hotel_checkout_time: (extracted.hotel_checkout_time as string | null) ?? '11:00 AM',
    hotel_confirmation: extracted.hotel_confirmation,
    hotel_phone: extracted.hotel_phone,
    return_flight_number: extracted.return_flight_number,
    return_airline: extracted.return_airline,
    return_origin_airport: extracted.return_origin_airport,
    return_dest_airport: extracted.return_dest_airport,
    return_departs_at: extracted.return_departs_at,
    return_arrives_at: extracted.return_arrives_at,
    return_seat: extracted.return_seat,
    return_terminal: extracted.return_terminal,
    return_confirmation: extracted.return_confirmation,
    leave_home_by: leaveHomeBy,
    leave_hotel_by: leaveHotelBy,
    drive_to_airport_min: driveToAirport,
    drive_from_airport_min: driveFromAirport,
    destination_weather: weatherForecast,
    packing_suggestions: packingSuggestions,
    ai_notes: aiNotes,
    home_coverage_notes: homeCoverageNotes,
    trip_start_date: tripStartDate,
    trip_end_date: tripEndDate,
    status: 'confirmed',
    source_email_body: sourceText.slice(0, 20000),
    source_email_subject: sourceSubject,
    source_type: sourceType,
    updated_at: new Date().toISOString(),
  }

  let resolvedEventId: string | null | undefined = eventId

  if (existingTripId) {
    // UPDATE in place — preserves event_id link
    const { data: updated } = await sb.from('trips').update(tripPayload).eq('id', existingTripId).select('event_id').maybeSingle()
    if (!resolvedEventId && updated?.event_id) resolvedEventId = updated.event_id
  } else {
    // Post-extraction dedup: check for an existing trip for this member with the same
    // flight number OR same departure date (±1 day). This prevents duplicates when the
    // same booking generates multiple emails (confirmation, receipt, itinerary update, etc.)
    const flightNum = (extracted.outbound_flight_number as string | null)?.replace(/\s/g, '') ?? null
    let foundDupe: { id: string; event_id: string | null; gmail_message_ids: string[] } | null = null

    if (flightNum) {
      const { data: byFlight } = await sb.from('trips')
        .select('id, event_id, gmail_message_ids')
        .eq('family_member_id', familyMemberId)
        .ilike('outbound_flight_number', flightNum)
        .maybeSingle()
      foundDupe = byFlight ?? null
    }

    if (!foundDupe && tripStartDate) {
      const dayBefore = new Date(new Date(tripStartDate).getTime() - 86400000).toISOString().slice(0, 10)
      const dayAfter  = new Date(new Date(tripStartDate).getTime() + 86400000).toISOString().slice(0, 10)
      const { data: byDate } = await sb.from('trips')
        .select('id, event_id, gmail_message_ids')
        .eq('family_member_id', familyMemberId)
        .gte('trip_start_date', dayBefore)
        .lte('trip_start_date', dayAfter)
        .maybeSingle()
      foundDupe = byDate ?? null
    }

    if (foundDupe) {
      // Merge the new gmail message ID into the existing array, then update
      const existingIds: string[] = foundDupe.gmail_message_ids ?? []
      const mergedIds = gmailMessageId && !existingIds.includes(gmailMessageId)
        ? [...existingIds, gmailMessageId]
        : existingIds
      const { data: updated } = await sb.from('trips')
        .update({ ...tripPayload, gmail_message_ids: mergedIds })
        .eq('id', foundDupe.id)
        .select('event_id').maybeSingle()
      if (!resolvedEventId && (updated?.event_id ?? foundDupe.event_id)) {
        resolvedEventId = updated?.event_id ?? foundDupe.event_id
      }
    } else {
      const gmailMsgIds = gmailMessageId ? [gmailMessageId] : []
      const { data: inserted } = await sb.from('trips').insert({
        ...tripPayload,
        gmail_message_ids: gmailMsgIds,
      }).select('id, event_id').maybeSingle()
      if (!resolvedEventId && inserted?.event_id) resolvedEventId = inserted.event_id
    }
  }

  // Patch the calendar event start/end to match the email's actual dates (email = source of truth)
  // Times stored in trips are nominal (local clock digits, no offset).
  // For the calendar events table we need real UTC timestamps.
  const originAirportCode = (extracted.outbound_origin_airport as string | null) ?? ''
  const returnDestAirportCode = (extracted.return_dest_airport as string | null) ?? originAirportCode

  const outboundNominal = (extracted.outbound_departs_at as string | null)
    ?? (tripStartDate ? `${tripStartDate}T06:00:00` : null)
  const returnNominal   = (extracted.return_arrives_at   as string | null)
    ?? (tripEndDate   ? `${tripEndDate}T23:59:00`   : null)

  if (!outboundNominal) {
    return { ok: false, debug: 'no departure time available for event patching' }
  }

  const eventStart = originAirportCode
    ? nominalToUTCForCalendar(outboundNominal, originAirportCode)
    : outboundNominal + 'Z'
  const eventEnd = returnNominal
    ? (returnDestAirportCode
      ? nominalToUTCForCalendar(returnNominal, returnDestAirportCode)
      : returnNominal + 'Z')
    : eventStart

  if (resolvedEventId) {
    await sb.from('events').update({
      start_time: eventStart,
      end_time: eventEnd,
      updated_at: new Date().toISOString(),
    }).eq('id', resolvedEventId)
    // Ensure trip has event_id linked
    if (existingTripId) {
      await sb.from('trips').update({ event_id: resolvedEventId }).eq('id', existingTripId)
    }
  } else if (tripStartDate && tripEndDate) {
    // No event_id — find by member via event_members join, match on trip start date ±2 days
    const lo = new Date(tripStartDate); lo.setDate(lo.getDate() - 1)
    const hi = new Date(tripStartDate); hi.setDate(hi.getDate() + 2)
    const { data: memberEvents } = await sb
      .from('event_members')
      .select('event_id, events!inner(id, start_time, end_time)')
      .eq('family_member_id', familyMemberId)
      .gte('events.start_time', lo.toISOString())
      .lte('events.start_time', hi.toISOString())
      .limit(3)
    if (memberEvents && memberEvents.length > 0) {
      const matchEvt = (memberEvents[0] as { event_id: string; events: { id: string; start_time: string; end_time: string } })?.events
      if (matchEvt) {
        await sb.from('events').update({
          start_time: eventStart,
          end_time: eventEnd,
          updated_at: new Date().toISOString(),
        }).eq('id', matchEvt.id)
        // Link for future rescans
        const tripIdToLink = existingTripId
        if (tripIdToLink) {
          await sb.from('trips').update({ event_id: matchEvt.id }).eq('id', tripIdToLink)
        } else {
          // Was an insert — find the newly inserted trip by gmail_message_id
          if (gmailMessageId) {
            const { data: newTrip } = await sb.from('trips').select('id').contains('gmail_message_ids', [gmailMessageId]).maybeSingle()
            if (newTrip) await sb.from('trips').update({ event_id: matchEvt.id }).eq('id', newTrip.id)
          }
        }
      }
    }
  }

  return { ok: true, debug: `processed: ${tripTitle}` }
}

// ── Main handler ───────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}

  // Load LLM config (needed for all modes)
  const { data: llmRow } = await sb.from('settings').select('value').eq('key', 'llm_config').single()
  const llmConfig = (llmRow?.value ?? {}) as { provider: string; model: string; api_key: string }

  // ── MODE 1: reprocess_trip_id — re-extract from stored email body ─────────
  // If no stored body, fall through to Gmail scan with reset flag
  if (body.reprocess_trip_id) {
    const { data: trip, error: tripErr } = await sb
      .from('trips')
      .select('id, family_member_id, source_email_body, source_email_subject, source_type, event_id, traveler_name')
      .eq('id', body.reprocess_trip_id)
      .single()
    if (tripErr || !trip) {
      return new Response(JSON.stringify({ error: 'trip not found' }), { status: 404, headers: { ...CORS, 'content-type': 'application/json' } })
    }
    if (trip.source_email_body) {
      // Has stored body — re-extract from it directly
      const result = await extractAndUpsertTrip(sb, llmConfig, {
        sourceText: trip.source_email_body,
        sourceSubject: trip.source_email_subject ?? '',
        sourceType: (trip.source_type as 'gmail' | 'pdf') ?? 'gmail',
        familyMemberId: trip.family_member_id,
        memberName: trip.traveler_name ?? 'Unknown',
        existingTripId: trip.id,
        eventId: trip.event_id ?? body.event_id ?? undefined,
      })
      return new Response(JSON.stringify({ ok: result.ok, debug: result.debug }), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }
    // No stored body — delete the stale trip and fall through to Gmail scan
    // The Gmail scan dedup logic will reprocess it and store the body
    await sb.from('trips').delete().eq('id', body.reprocess_trip_id)
    // Fall through to MODE 3 with the member + event context
    body.family_member_id = trip.family_member_id
    if (!body.event_id && trip.event_id) body.event_id = trip.event_id
  }

  // ── MODE 2: raw_text — PDF or pasted text upload ──────────────────────────
  if (body.raw_text) {
    const familyMemberId: string = body.family_member_id
    const eventId: string | undefined = body.event_id ?? undefined
    const existingTripId: string | undefined = body.existing_trip_id ?? undefined
    if (!familyMemberId) {
      return new Response(JSON.stringify({ error: 'family_member_id required' }), { status: 400, headers: { ...CORS, 'content-type': 'application/json' } })
    }
    const { data: member } = await sb.from('family_members').select('name').eq('id', familyMemberId).single()
    const result = await extractAndUpsertTrip(sb, llmConfig, {
      sourceText: body.raw_text,
      sourceSubject: body.source_subject ?? 'PDF Itinerary',
      sourceType: 'pdf',
      familyMemberId,
      memberName: member?.name ?? 'Unknown',
      existingTripId,
      eventId,
    })
    return new Response(JSON.stringify({ ok: result.ok, debug: result.debug }), {
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }

  // ── MODE 3: Gmail scan (default) ──────────────────────────────────────────
  const targetMemberId: string | null = body.family_member_id ?? null
  // Optional event context — when scanning for a specific event, use these to
  // update the existing dupe trip (re-extract with new timezone prompt) and link it
  const scanEventId: string | null = body.event_id ?? null
  const scanEventDate: string | null = body.event_date ?? null
  const scanEventLocation: string | null = body.event_location ?? null

  // Load google tokens — include any token not explicitly disabled for Gmail scanning
  const memberQuery = sb
    .from('google_tokens')
    .select('family_member_id, access_token, expires_at, family_members(id, name)')
    .not('gmail_scan_enabled', 'eq', false)

  if (targetMemberId) memberQuery.eq('family_member_id', targetMemberId)
  const { data: tokens, error: tokErr } = await memberQuery
  if (tokErr) return new Response(JSON.stringify({ error: tokErr.message }), { status: 500, headers: { ...CORS, 'content-type': 'application/json' } })

  const results: { member: string; trips_found: number; error?: string; debug?: string[] }[] = []
  const since = new Date()
  since.setDate(since.getDate() - 90) // look back 90 days to catch trip emails sent weeks in advance

  for (const tokenRow of tokens ?? []) {
    const memberName = (tokenRow.family_members as { name: string } | null)?.name ?? 'Unknown'
    let accessToken = tokenRow.access_token

    // Refresh token if needed
    if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
      const { data: full } = await sb
        .from('google_tokens')
        .select('refresh_token')
        .eq('family_member_id', tokenRow.family_member_id)
        .single()
      if (full?.refresh_token) {
        const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: Deno.env.get('GOOGLE_CLIENT_ID') ?? '',
            client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '',
            refresh_token: full.refresh_token,
            grant_type: 'refresh_token',
          }),
        })
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json()
          accessToken = refreshData.access_token
          await sb.from('google_tokens').update({
            access_token: refreshData.access_token,
            expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString(),
          }).eq('family_member_id', tokenRow.family_member_id)
        }
      }
    }

    try {
      const messages = await searchTravelEmails(accessToken, since)
      let tripsFound = 0
      const debugInfo: string[] = []

      for (const msg of messages) {
        // Fetch full message
        const msgRes = await gmailFetch(`/users/me/messages/${msg.id}?format=full`, accessToken)
        if (!msgRes.ok) { debugInfo.push(`msg ${msg.id}: fetch failed ${msgRes.status}`); continue }
        const msgData = await msgRes.json()

        const subject = (msgData.payload?.headers ?? []).find((h: { name: string; value: string }) => h.name === 'Subject')?.value ?? ''
        const fromHeader = (msgData.payload?.headers ?? []).find((h: { name: string; value: string }) => h.name === 'From')?.value ?? ''
        const snippet = msgData.snippet ?? ''

        // Pass if subject/snippet matches keywords OR sender is a known travel domain
        const fromKnownSender = TRAVEL_SENDER_DOMAINS.some(d => fromHeader.toLowerCase().includes(d))
        if (!TRAVEL_REGEX.test(subject) && !TRAVEL_REGEX.test(snippet) && !fromKnownSender) {
          debugInfo.push(`SKIP(no-keyword): ${subject.slice(0, 60)}`)
          continue
        }

        const bodyText = extractBodyText(msgData.payload ?? {})
        if (!bodyText || bodyText.length < 100) { debugInfo.push(`SKIP(no-body): ${subject.slice(0, 60)}`); continue }

        // Check if we already processed this email
        const { data: existing } = await sb
          .from('trips')
          .select('id, source_email_body')
          .contains('gmail_message_ids', [msg.id])
          .maybeSingle()

        // Also check for an existing trip by date proximity (avoids creating duplicates when
        // the same email was already processed under a different message ID)
        const existingByDate = !existing ? await (async () => {
          if (!scanEventId) return null
          const { data: byEvent } = await sb.from('trips')
            .select('id, source_email_body, event_id')
            .eq('family_member_id', tokenRow.family_member_id)
            .eq('outbound_flight_number', subject.match(/AA\s*\d+|DL\s*\d+|UA\s*\d+|WN\s*\d+/i)?.[0]?.replace(/\s/,'') ?? '__none__')
            .maybeSingle()
          return byEvent
        })() : null

        const tripToUpdate = existing ?? existingByDate

        if (tripToUpdate) {
          // If this scan was triggered for a specific event and the trip has no stored body,
          // reprocess it so we can fix timezone issues and store the body for future rescans
          if (scanEventId && !tripToUpdate.source_email_body) {
            debugInfo.push(`REPROCESS(no-stored-body): ${subject.slice(0, 60)}`)
            const result = await extractAndUpsertTrip(sb, llmConfig, {
              sourceText: bodyText,
              sourceSubject: subject,
              sourceType: 'gmail',
              gmailMessageId: msg.id,
              familyMemberId: tokenRow.family_member_id,
              memberName,
              existingTripId: tripToUpdate.id,
              eventId: scanEventId,
            })
            if (result.ok) tripsFound++
            debugInfo.push(result.debug)
          } else {
            // Already processed with stored body — link event_id if not already linked
            if (scanEventId) {
              await sb.from('trips').update({ event_id: scanEventId }).eq('id', tripToUpdate.id).is('event_id', null)
            }
            debugInfo.push(`SKIP(dupe): ${subject.slice(0, 60)}`)
          }
          continue
        }

        // Check if body mentions the event location (when scanning for a specific event)
        // to prioritize the right email
        if (scanEventLocation) {
          const locationWords = scanEventLocation.toLowerCase().split(/[\s,|]+/).filter(w => w.length > 3)
          const bodyLower = bodyText.toLowerCase()
          const matches = locationWords.filter(w => bodyLower.includes(w))
          if (matches.length === 0 && locationWords.length > 0) {
            debugInfo.push(`SKIP(location-mismatch): ${subject.slice(0, 60)}`)
            continue
          }
        }

        debugInfo.push(`PROCESSING: ${subject.slice(0, 80)} | from: ${fromHeader.slice(0, 50)}`)

        const result = await extractAndUpsertTrip(sb, llmConfig, {
          sourceText: bodyText,
          sourceSubject: subject,
          sourceType: 'gmail',
          gmailMessageId: msg.id,
          familyMemberId: tokenRow.family_member_id,
          memberName,
          ...(scanEventId ? { eventId: scanEventId } : {}),
        })
        if (result.ok) tripsFound++
        debugInfo.push(result.debug)
      }

      results.push({ member: memberName, trips_found: tripsFound, debug: debugInfo })
    } catch (err) {
      results.push({ member: memberName, trips_found: 0, error: String(err), debug: [] })
    }
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { ...CORS, 'content-type': 'application/json' },
  })
})
