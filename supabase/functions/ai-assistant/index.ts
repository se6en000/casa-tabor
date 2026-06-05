import { createClient } from 'npm:@supabase/supabase-js@2'

interface UsageAccum { inputTokens: number; outputTokens: number }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Message { role: 'user' | 'assistant'; content: string }
interface ImagePayload { mimeType: string; data: string } // raw base64, no data: prefix
interface Context {
  page: string
  currentDate: string
  utcOffset: string
  events: EventSummary[]
  family: FamilyMember[]
  homeCity?: string
}
interface EventSummary {
  id: string
  title: string
  start_time: string
  end_time: string
  location_name: string | null
  members: string[] // names
  category: string | null
}
interface FamilyMember { id: string; name: string }

// ── Place search helper ───────────────────────────────────────────────────────

interface PlaceResult { name: string; address: string; lat: number | null; lng: number | null; phone: string | null }

async function searchPlaces(query: string, city?: string): Promise<PlaceResult[]> {
  const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY')
  if (!apiKey) return []
  const textQuery = city ? `${query} in ${city}` : query
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.nationalPhoneNumber',
      },
      body: JSON.stringify({ textQuery, maxResultCount: 5 }),
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.places ?? []).map((p: { displayName?: { text: string }; formattedAddress?: string; location?: { latitude: number; longitude: number }; nationalPhoneNumber?: string }) => ({
      name: p.displayName?.text ?? '',
      address: p.formattedAddress ?? '',
      lat: p.location?.latitude ?? null,
      lng: p.location?.longitude ?? null,
      phone: p.nationalPhoneNumber ?? null,
    }))
  } catch { return [] }
}

// ── Google Maps helpers ───────────────────────────────────────────────────────

async function geocodeAddress(address: string, apiKey: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.location',
      },
      body: JSON.stringify({ textQuery: address, maxResultCount: 1 }),
    })
    const data = await res.json()
    const loc = data.places?.[0]?.location
    if (!loc) return null
    return { lat: loc.latitude, lng: loc.longitude }
  } catch { return null }
}

function wmoCodeToCondition(code: number): string {
  if (code === 0) return 'Clear sky'
  if (code <= 3) return code === 1 ? 'Mainly clear' : code === 2 ? 'Partly cloudy' : 'Overcast'
  if (code <= 48) return 'Foggy'
  if (code <= 55) return 'Drizzle'
  if (code <= 65) return code <= 63 ? 'Rain' : 'Heavy rain'
  if (code <= 75) return 'Snow'
  if (code <= 82) return 'Rain showers'
  if (code <= 86) return 'Snow showers'
  if (code === 95) return 'Thunderstorm'
  return 'Thunderstorm with hail'
}

async function fetchAirQuality(lat: number, lng: number, apiKey: string): Promise<{ aqi: number; category: string; dominantPollutant: string } | null> {
  try {
    const res = await fetch(`https://airquality.googleapis.com/v1/currentConditions:lookup?key=${apiKey}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ location: { latitude: lat, longitude: lng } }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const idx = data.indexes?.find((i: { code: string }) => i.code === 'uaqi') ?? data.indexes?.[0]
    if (!idx) return null
    return { aqi: idx.aqi, category: idx.category, dominantPollutant: idx.dominantPollutant ?? '' }
  } catch { return null }
}

async function fetchPollen(lat: number, lng: number, apiKey: string): Promise<{ tree: string; grass: string; weed: string } | null> {
  try {
    const res = await fetch(
      `https://pollen.googleapis.com/v1/forecast:lookup?key=${apiKey}&location.longitude=${lng}&location.latitude=${lat}&days=1`
    )
    if (!res.ok) return null
    const data = await res.json()
    const types: { code: string; indexInfo?: { category?: string } }[] = data.dailyInfo?.[0]?.pollenTypeInfo ?? []
    const get = (code: string) => types.find(t => t.code === code)?.indexInfo?.category ?? 'None'
    return { tree: get('TREE'), grass: get('GRASS'), weed: get('WEED') }
  } catch { return null }
}

async function getWeatherForLocation(lat: number, lng: number, apiKey: string) {
  try {
    const [wxRes, airQuality, pollen] = await Promise.all([
      fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m,uv_index&daily=precipitation_probability_max,weather_code&temperature_unit=fahrenheit&forecast_days=1&timezone=auto`
      ),
      fetchAirQuality(lat, lng, apiKey),
      fetchPollen(lat, lng, apiKey),
    ])
    if (!wxRes.ok) return null
    const data = await wxRes.json()
    const c = data.current
    return {
      temp: Math.round(c.temperature_2m),
      condition: wmoCodeToCondition(c.weather_code),
      feelsLike: Math.round(c.apparent_temperature),
      humidity: c.relative_humidity_2m ?? null,
      uvIndex: c.uv_index != null ? Math.round(c.uv_index) : null,
      precipProbability: c.precipitation_probability ?? data.daily?.precipitation_probability_max?.[0] ?? null,
      airQuality,
      pollen,
    }
  } catch { return null }
}

async function getDriveTime(origin: string, destination: string, apiKey: string) {
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&key=${apiKey}&departure_time=now`
    )
    const data = await res.json()
    const leg = data.routes?.[0]?.legs?.[0]
    if (!leg) return null
    return {
      durationText: leg.duration_in_traffic?.text ?? leg.duration?.text ?? 'Unknown',
      durationSeconds: leg.duration_in_traffic?.value ?? leg.duration?.value ?? 0,
      distance: leg.distance?.text ?? 'Unknown',
    }
  } catch { return null }
}

async function getTimezone(lat: number, lng: number, timestamp: number, apiKey: string) {
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/timezone/json?location=${lat},${lng}&timestamp=${timestamp}&key=${apiKey}`
    )
    const data = await res.json()
    if (data.status !== 'OK') return null
    return {
      timeZoneId: data.timeZoneId ?? '',
      timeZoneName: data.timeZoneName ?? '',
      rawOffset: data.rawOffset ?? 0,
      dstOffset: data.dstOffset ?? 0,
    }
  } catch { return null }
}

// ── Intent detection ──────────────────────────────────────────────────────────

// Detect if the latest user message is asking for a place/address lookup
function extractPlaceQuery(userMessage: string, homeCity: string): { query: string; city: string } | null {
  const msg = userMessage.toLowerCase()
  const locationIntents = [
    'address', 'where is', 'find ', 'look up', 'locate', 'location of',
    'phone number', 'number for', 'directions to', 'how do i get to',
  ]
  if (!locationIntents.some(t => msg.includes(t))) return null

  const inMatch = userMessage.match(/(?:find|where is|address (?:for|of)|look up|locate)\s+(.+?)(?:\s+in\s+|\s+near\s+)(.+?)(?:\?|$)/i)
  if (inMatch) return { query: inMatch[1].trim(), city: inMatch[2].trim() }

  const queryMatch = userMessage.match(/(?:find|where is|address (?:for|of)|look up|locate)\s+(.+?)(?:\?|$)/i)
  if (queryMatch) return { query: queryMatch[1].trim(), city: homeCity }

  return null
}

function extractContextQueries(msg: string, homeCity: string): {
  weatherQuery?: string
  driveTimeQuery?: { origin: string; destination: string }
  timezoneQuery?: string
} {
  const lower = msg.toLowerCase()
  const result: { weatherQuery?: string; driveTimeQuery?: { origin: string; destination: string }; timezoneQuery?: string } = {}

  // Weather intent
  const weatherIntents = ['weather', 'will it rain', 'going to rain', 'gonna rain', 'rain today', 'rain tomorrow',
    'is it raining', 'chance of rain', 'temperature', 'how hot', 'how cold', 'forecast', 'air quality', 'pollen',
    'sunny', 'cloudy', 'storm', 'hurricane', 'humidity', 'feels like', 'uv index']
  if (weatherIntents.some(t => lower.includes(t))) {
    const cityMatch = msg.match(/weather\s+(?:like\s+)?(?:in|for|at)\s+([A-Za-z\s,]+?)(?:\s+right\s+now|\s+today|\s+tomorrow|\?|$|\.)/i)
      ?? msg.match(/(?:in|for|at)\s+([A-Za-z\s,]+?)\s+(?:weather|forecast)/i)
      ?? msg.match(/weather\s+(?:in|for|at)\s+([A-Za-z\s,]+?)(?:\?|$|\.)/i)
    result.weatherQuery = cityMatch?.[1]?.trim() ?? homeCity
  }

  // Drive time intent
  const driveIntents = ['how long', 'drive time', 'leave by', 'how far', 'get to', 'commute', 'directions to']
  if (driveIntents.some(t => lower.includes(t))) {
    const toMatch = msg.match(/(?:get to|drive to|directions to|how long to|how far to)\s+(.+?)(?:\?|$|\.| from)/i)
    const fromMatch = msg.match(/from\s+(.+?)\s+to\s+(.+?)(?:\?|$|\.)/i)
    if (fromMatch) {
      result.driveTimeQuery = { origin: fromMatch[1].trim(), destination: fromMatch[2].trim() }
    } else if (toMatch) {
      result.driveTimeQuery = { origin: homeCity, destination: toMatch[1].trim() }
    }
  }

  // Timezone intent
  const tzIntents = ['what time in', 'time zone', 'timezone', 'when is it in', 'current time in']
  if (tzIntents.some(t => lower.includes(t))) {
    const tzMatch = msg.match(/(?:what time|time zone|timezone|when is it|current time)\s+in\s+([A-Za-z\s,]+?)(?:\?|$|\.)/i)
    if (tzMatch) result.timezoneQuery = tzMatch[1].trim()
  }

  return result
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const mapsKey = Deno.env.get('GOOGLE_MAPS_API_KEY') ?? ''

  const { messages, context, image }: { messages: Message[]; context: Context; image?: ImagePayload } = await req.json()

  // Load LLM config + saved places + contacts + all events for the year in parallel
  const yearStart = new Date(); yearStart.setMonth(0, 1); yearStart.setHours(0,0,0,0)
  const yearEnd = new Date(); yearEnd.setFullYear(yearEnd.getFullYear() + 1, 11, 31); yearEnd.setHours(23,59,59,999)

  const [{ data: cfgRow }, { data: savedPlaces }, savedContactsResult, { data: allEvents }] = await Promise.all([
    sb.from('settings').select('value').eq('key', 'llm_config').single(),
    sb.from('saved_places').select('name, aliases, address, city, state, zip, category, notes, phone').order('name'),
    sb.from('saved_contacts').select('name, aliases, phone, email, address, relationship, notes').order('name')
      .then(r => r)
      .catch(() => ({ data: null as null, error: null })),
    sb.from('events')
      .select('id, title, start_time, end_time, location_name, event_members(family_members(name)), enrichments(category)')
      .eq('status', 'confirmed')
      .gte('start_time', yearStart.toISOString())
      .lte('start_time', yearEnd.toISOString())
      .order('start_time'),
  ])
  const savedContacts = savedContactsResult?.data ?? null
  const config = cfgRow?.value ?? { provider: 'gemini', model: 'gemini-1.5-flash', api_key: '' }

  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content ?? ''
  const placeQuery = extractPlaceQuery(lastUserMessage, context.homeCity ?? '')
  const contextQueries = extractContextQueries(lastUserMessage, context.homeCity ?? '')

  // Run place search + context queries in parallel
  const [placeResults, weatherData, driveTimeData, timezoneData] = await Promise.all([
    placeQuery ? searchPlaces(placeQuery.query, placeQuery.city) : Promise.resolve([]),
    contextQueries.weatherQuery
      ? geocodeAddress(contextQueries.weatherQuery, mapsKey).then(loc => loc ? getWeatherForLocation(loc.lat, loc.lng, mapsKey) : null)
      : Promise.resolve(null),
    contextQueries.driveTimeQuery
      ? getDriveTime(contextQueries.driveTimeQuery.origin, contextQueries.driveTimeQuery.destination, mapsKey)
      : Promise.resolve(null),
    contextQueries.timezoneQuery
      ? geocodeAddress(contextQueries.timezoneQuery, mapsKey).then(loc => loc ? getTimezone(loc.lat, loc.lng, Math.floor(Date.now() / 1000), mapsKey) : null)
      : Promise.resolve(null),
  ])

  // Build system context block
  const familyNames = context.family.map(f => f.name).join(', ')

  type DbEvent = { id: string; title: string; start_time: string; end_time: string; location_name: string | null; event_members: { family_members: { name: string } | null }[]; enrichments: { category: string | null }[] }
  const eventsBlock = !allEvents || allEvents.length === 0
    ? 'No events.'
    : (allEvents as DbEvent[]).map(e => {
        const members = e.event_members?.map(m => m.family_members?.name).filter(Boolean).join(', ') ?? ''
        const category = e.enrichments?.[0]?.category ?? ''
        return `- ID:${e.id} | "${e.title}" | ${e.start_time} – ${e.end_time}${e.location_name ? ` | ${e.location_name}` : ''}${members ? ` | Who: ${members}` : ''}${category ? ` | ${category}` : ''}`
      }).join('\n')

  // Build saved places context block
  const placesBlock = savedPlaces && savedPlaces.length > 0
    ? savedPlaces.map(p => {
        const addr = [p.address, p.city, p.state, p.zip].filter(Boolean).join(', ')
        const aliases = p.aliases?.length ? ` (also: ${p.aliases.join(', ')})` : ''
        const extra = [addr, p.phone, p.notes].filter(Boolean).join(' | ')
        return `- ${p.name}${aliases}${extra ? ': ' + extra : ''}`
      }).join('\n')
    : null

  // Build contacts context block
  const contactsBlock = savedContacts && savedContacts.length > 0
    ? savedContacts.map((c: { name: string; aliases?: string[]; phone?: string | null; email?: string | null; address?: string | null; relationship?: string | null; notes?: string | null }) => {
        const aliases = c.aliases?.length ? ` (also: ${c.aliases.join(', ')})` : ''
        const extra = [c.relationship, c.phone, c.email, c.address, c.notes].filter(Boolean).join(' | ')
        return `- ${c.name}${aliases}${extra ? ': ' + extra : ''}`
      }).join('\n')
    : null

  const placesSearchBlock = placeResults.length > 0
    ? `\nPLACE SEARCH RESULTS for "${placeQuery?.query}" (from Google Places — these are REAL addresses, use them):\n` +
      placeResults.map((p, i) => `${i + 1}. ${p.name} — ${p.address}${p.phone ? ` | ${p.phone}` : ''}`).join('\n')
    : (placeQuery ? `\nPLACE SEARCH: No results found for "${placeQuery.query}" in ${placeQuery.city}.` : '')

  const weatherBlock = weatherData
    ? `\nCURRENT WEATHER for ${contextQueries.weatherQuery}: ${weatherData.temp}°F, ${weatherData.condition}` +
      (weatherData.feelsLike != null ? `, feels like ${weatherData.feelsLike}°F` : '') +
      (weatherData.humidity != null ? `, humidity ${weatherData.humidity}%` : '') +
      (weatherData.precipProbability != null ? `, ${weatherData.precipProbability}% chance of rain` : '') +
      (weatherData.uvIndex != null ? `, UV index ${weatherData.uvIndex}` : '') +
      (weatherData.airQuality != null ? `. Air Quality: AQI ${weatherData.airQuality.aqi} (${weatherData.airQuality.category})` : '') +
      (weatherData.pollen != null ? `. Pollen — Tree: ${weatherData.pollen.tree}, Grass: ${weatherData.pollen.grass}, Weed: ${weatherData.pollen.weed}` : '')
    : ''

  const driveTimeBlock = driveTimeData
    ? `\nDRIVE TIME from ${contextQueries.driveTimeQuery?.origin} to ${contextQueries.driveTimeQuery?.destination}: ${driveTimeData.durationText} (${driveTimeData.distance})`
    : ''

  const timezoneBlock = timezoneData
    ? `\nTIMEZONE for ${contextQueries.timezoneQuery}: ${timezoneData.timeZoneName} (${timezoneData.timeZoneId}), UTC offset ${(timezoneData.rawOffset + timezoneData.dstOffset) / 3600}h`
    : ''

  const systemPrompt = `You are the Casa Tabor family assistant — a helpful, concise, warm AI for the ${familyNames} family. 
Current date/time: ${context.currentDate}
User's local UTC offset: ${context.utcOffset ?? '-04:00'} (IMPORTANT: all times you generate MUST use this offset, e.g. "2026-05-28T20:00:00${context.utcOffset ?? '-04:00'}")
Current page: ${context.page}
Home city: ${context.homeCity ?? 'unknown'}

EVENTS IN VIEW:
${eventsBlock}

FAMILY MEMBERS: ${familyNames}
${placesBlock ? `\nSAVED PLACES (use these to resolve location nicknames and fill in addresses):\n${placesBlock}` : ''}
${contactsBlock ? `\nSAVED CONTACTS (use these to resolve people's names, numbers, and addresses):\n${contactsBlock}` : ''}
${placesSearchBlock}${weatherBlock}${driveTimeBlock}${timezoneBlock}

You can either:
1. Answer questions conversationally about the events, schedule, or family.
2. Analyze an attached image — describe what you see and relate it to the family calendar if relevant (e.g. a school flyer, game schedule, invitation, or screenshot of a calendar).
3. Answer weather/air quality/pollen questions — if CURRENT WEATHER data is provided above, use it to give a real answer. You DO have access to live weather data when it appears in this context block.
4. Look up addresses: When the user asks to find a business or location, you have already received Google Places results above (if any). Present the numbered list naturally and ask which one they want. Once they confirm, create the event with the full address.
5. Take an ACTION by responding with ONLY a JSON array (even for a single action) — no prose, no markdown fences:

[
  {"action":"create_event","title":"<Owner> | <Concise Description>","start":"<ISO with offset>","end":"<ISO with offset>","location":"<full address from Places results>","members":["<name>"],"event_type":"event","needs_clarification":"<question or null>"}
]

- Set "event_type" to "reminder" when the user uses words like "remind me", "reminder", "don't forget", or describes something that is a notification rather than an activity to attend. All other creations use "event_type":"event".
- For reminders with a specific time (e.g. "remind me at 3pm"), set start and end to the same time (start = end = that time). For all-day reminders, use midnight (T00:00:00) for both start and end.

For updating: [{"action":"update_event","id":"<event id>","changes":{"title":"...","start":"...","end":"...","location":"<full street address>"},"needs_clarification":"<or null>"}]
- When the user asks to update/set/change the address or location of an event, use update_event with "location" set to the full address. This will automatically re-enrich the event (weather, drive times, map) with the new location.
- If the address is incomplete (e.g. just a business name), use place search to find the full address first.
For deleting: [{"action":"delete_event","id":"<event id>","title":"<title for confirmation>","needs_clarification":"<or null>"}]
For multiple events: return multiple objects in the same array.

Rules:
- ALWAYS wrap actions in a JSON array [ ], even for a single action.
- If the user's intent is clearly an action (create/update/delete) AND you have all the info needed, return the JSON array.
- If you need more info (e.g. who is attending, what time), include needs_clarification on the relevant action.
- For event titles use the format: <Owner First Name> | <Concise Description in Title Case>
- Default the owner to the first family member (${context.family[0]?.name ?? 'Jake'}) if not specified.
- For times, use the current date as the base if the user says "tonight" or "today".
- When place search results are shown above, ALWAYS present them as a numbered list and ask the user to pick one before creating an event.
- Otherwise answer conversationally, be brief (1-3 sentences max), warm, and smart.
- Never make up events that aren't in the list.

FUZZY EVENT MATCHING — very important:
- Event timestamps are ISO strings with UTC offset (e.g. "2026-06-09T22:30:00+00:00"). Use the user's UTC offset (${context.utcOffset ?? '-04:00'}) to convert to local time when matching days/times the user mentions.
- If you can't find an exact match for what the user describes, scan the EVENTS IN VIEW list for the closest match by: (1) day of week match, (2) partial title match, (3) family member match. Then say something like "I found 'Softball Practice' on Tuesday June 9 (6:30–9 PM, Liv) — is that the one you mean?" and ask for confirmation before acting.
- Never flatly say "I don't see it." Always try fuzzy matching and suggest the closest candidate.`

  // Build conversation prompt
  const conversationHistory = messages
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n')

  const fullPrompt = `${systemPrompt}\n\nCONVERSATION:\n${conversationHistory}\nAssistant:`

  let raw: string
  const usageAccum: UsageAccum = { inputTokens: 0, outputTokens: 0 }
  try {
    raw = await callLLM(config, fullPrompt, image, usageAccum)
  } catch (e) {
    const msg = (e as Error).message ?? 'LLM error'
    const isQuota = msg.includes('quota') || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')
    return new Response(
      JSON.stringify({ type: 'error', code: isQuota ? 'quota_exceeded' : 'llm_error', message: msg }),
      { status: 200, headers: { ...CORS, 'content-type': 'application/json' } }
    )
  }
  // Log usage (non-blocking)
  sb.from('ai_usage_log').insert({ function_name: 'ai-assistant', provider: config.provider, model: config.model, input_tokens: usageAccum.inputTokens, output_tokens: usageAccum.outputTokens, cached: false }).then(() => {}).catch(() => {})
  const text = raw.trim()

  // Try to detect if response is a JSON action array (or single object)
  const arrStart = text.indexOf('[')
  const arrEnd = text.lastIndexOf(']')
  if (arrStart !== -1 && arrEnd > arrStart) {
    try {
      const actions = JSON.parse(text.slice(arrStart, arrEnd + 1))
      if (Array.isArray(actions) && actions.length > 0 && actions[0]?.action) {
        return new Response(JSON.stringify({ type: 'multi_action', actions }), {
          headers: { ...CORS, 'content-type': 'application/json' },
        })
      }
    } catch (_) { /* fall through */ }
  }
  // Fallback: single JSON object (legacy)
  const jsonStart = text.indexOf('{')
  const jsonEnd = text.lastIndexOf('}')
  if (jsonStart !== -1 && jsonEnd > jsonStart) {
    try {
      const action = JSON.parse(text.slice(jsonStart, jsonEnd + 1))
      if (action.action) {
        return new Response(JSON.stringify({ type: 'multi_action', actions: [action] }), {
          headers: { ...CORS, 'content-type': 'application/json' },
        })
      }
    } catch (_) { /* fall through to text response */ }
  }

  return new Response(JSON.stringify({ type: 'text', text }), {
    headers: { ...CORS, 'content-type': 'application/json' },
  })
})

async function callLLM(
  config: { provider: string; model: string; api_key: string },
  prompt: string,
  image?: ImagePayload,
  accum?: UsageAccum,
): Promise<string> {
  if (config.provider === 'gemini') {
    // Build parts array — image first (if present) then text
    const parts: unknown[] = []
    if (image) {
      parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } })
    }
    parts.push({ text: prompt })

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.api_key}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          maxOutputTokens: 600,
          temperature: 0.5,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      const errMsg = data?.error?.message ?? `Gemini error ${res.status}`
      throw new Error(res.status === 429 ? `quota_exceeded: ${errMsg}` : errMsg)
    }
    if (accum) { accum.inputTokens += data.usageMetadata?.promptTokenCount ?? 0; accum.outputTokens += data.usageMetadata?.candidatesTokenCount ?? 0 }
    const resParts = (data.candidates?.[0]?.content?.parts ?? []) as { text?: string; thought?: boolean }[]
    return resParts.filter(p => !p.thought).map(p => p.text ?? '').join('')
  }

  if (config.provider === 'openai') {
    // Build message content — array if image present, string otherwise
    type OAIContent = string | { type: string; text?: string; image_url?: { url: string } }[]
    const content: OAIContent = image
      ? [
          { type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.data}` } },
          { type: 'text', text: prompt },
        ]
      : prompt

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.api_key}` },
      body: JSON.stringify({ model: config.model, messages: [{ role: 'user', content }], max_tokens: 600, temperature: 0.5 }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(res.status === 429 ? `quota_exceeded: ${data?.error?.message ?? 'OpenAI quota exceeded'}` : (data?.error?.message ?? `OpenAI error ${res.status}`))
    if (accum) { accum.inputTokens += data.usage?.prompt_tokens ?? 0; accum.outputTokens += data.usage?.completion_tokens ?? 0 }
    return data.choices?.[0]?.message?.content ?? ''
  }

  if (config.provider === 'anthropic') {
    type AnthropicContent = string | { type: string; text?: string; source?: { type: string; media_type: string; data: string } }[]
    const content: AnthropicContent = image
      ? [
          { type: 'image', source: { type: 'base64', media_type: image.mimeType, data: image.data } },
          { type: 'text', text: prompt },
        ]
      : prompt

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': config.api_key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: config.model, max_tokens: 600, messages: [{ role: 'user', content }] }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(res.status === 429 ? `quota_exceeded: ${data?.error?.message ?? 'Anthropic quota exceeded'}` : (data?.error?.message ?? `Anthropic error ${res.status}`))
    if (accum) { accum.inputTokens += data.usage?.input_tokens ?? 0; accum.outputTokens += data.usage?.output_tokens ?? 0 }
    return data.content?.[0]?.text ?? ''
  }

  return ''
}
