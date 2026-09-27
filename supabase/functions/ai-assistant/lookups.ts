// The assistant's lookups — web search, places, weather, drive times — as plain functions both
// the old path's tool loop and version D's tools call (P3.17: moved out of the pipeline so they
// outlive it). The code is the pipeline's, moved as it was; its inputs are passed in.
import { computeCachedTravelEta } from '../_shared/route-eta-cache.mjs'

export interface LookupDeps {
  cid: string
  context: Record<string, any>
  apiKey: string
  model: string
  provider: string
  braveKey: string
  mapsKey: string
  homeAddress: string
  routeEtaCache: unknown
  providerFetch: (url: string, init: RequestInit, meta?: Record<string, unknown>) => Promise<Response>
  mapsFetch: (url: string, init: RequestInit, meta?: Record<string, unknown>) => Promise<Response>
  experienceMode: string
  latestUserText: string | null
  /** Which model call this is in the turn (for the usage log). */
  callIndex: number
}

export const LOOKUP_TOOL_NAMES = ['search_web', 'search_places', 'get_weather_forecast', 'get_travel_eta']

export function sanitizeTravelLocation(value: string): string {
  return value
    .replace(/\b(right now|now|today|tomorrow|tonight|please|thanks)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function inferTravelDestinationFromText(text: string): string | null {
  if (!text) return null
  const cleaned = text.replace(/\s+/g, ' ').trim()
  const toMatches = Array.from(cleaned.matchAll(/\bto\s+(.+?)(?=\s+(?:right now|now|today|tomorrow|tonight|when|how|what)\b|[?.!,]|$)/gi))
  const toCandidate = toMatches.length > 0 ? toMatches[toMatches.length - 1]?.[1] : null
  if (toCandidate) return sanitizeTravelLocation(toCandidate).replace(/^home\s+to\s+/i, '').replace(/^drive\s+from\s+/i, '').trim() || null
  const atMatch = cleaned.match(/\bat\s+(.+?)(?:\s+at\s+\d|\s+(?:today|tomorrow|tonight|when|how|what)\b|[?.!,]|$)/i)
  if (atMatch?.[1]) return sanitizeTravelLocation(atMatch[1]).trim() || null
  return null
}

export function inferTravelOriginFromText(text: string): string | null {
  if (!text) return null
  const cleaned = text.replace(/\s+/g, ' ').trim()
  const fromMatch = cleaned.match(/\bfrom\s+(.+?)\s+to\s+/i)
  if (!fromMatch?.[1]) return null
  const inferred = sanitizeTravelLocation(fromMatch[1])
  if (!inferred || /^home$/i.test(inferred)) return null
  return inferred
}

/** One lookup by tool name; null when the name isn't a lookup. */
export async function runLookup(name: string, args: Record<string, unknown>, deps: LookupDeps): Promise<Record<string, unknown> | null> {
  const { cid, context, apiKey, model, provider, braveKey, mapsKey, homeAddress, routeEtaCache, providerFetch, mapsFetch, experienceMode, latestUserText } = deps
  const llmTelemetry = { llm_calls: deps.callIndex - 1 }
  const stageStartMs = Date.now()
  if (name === 'search_places') {
    const query = args.query as string
    const city = (args.city as string) || (context.homeCity as string) || 'West Palm Beach'
    try {
      const res = await mapsFetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Goog-Api-Key': mapsKey,
          'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.location',
        },
        body: JSON.stringify({ textQuery: `${query} near ${city}`, maxResultCount: 3 }),
      }, { correlationId: cid })
      const data = await res.json()
      const places = (data.places ?? []).map((p: { displayName?: { text: string }; formattedAddress?: string; nationalPhoneNumber?: string }) => ({
        name: p.displayName?.text,
        address: p.formattedAddress,
        phone: p.nationalPhoneNumber,
      }))
      const payload = { places, count: places.length }
      console.log(`[ai-assistant][${cid}] stage=read_tool name=${name} ms=${Date.now() - stageStartMs} results=${payload.count}`)
      return payload
    } catch {
      console.log(`[ai-assistant][${cid}] stage=read_tool name=${name} ms=${Date.now() - stageStartMs} results=0 error=fetch_failed`)
      return { places: [], count: 0 }
    }
  }

  if (name === 'get_weather_forecast') {
    const rawLocation = String(args.location ?? '').trim()
    const location = rawLocation || String(context.homeCity ?? 'West Palm Beach')
    const requestedHours = Number(args.hours_ahead ?? 12)
    const hoursAhead = Number.isFinite(requestedHours) ? Math.max(1, Math.min(24, Math.round(requestedHours))) : 12

    const weatherCodeLabel = (code: number | null): string => {
      const map: Record<number, string> = {
        0: 'Clear sky',
        1: 'Mainly clear',
        2: 'Partly cloudy',
        3: 'Overcast',
        45: 'Fog',
        48: 'Depositing rime fog',
        51: 'Light drizzle',
        53: 'Moderate drizzle',
        55: 'Dense drizzle',
        56: 'Light freezing drizzle',
        57: 'Dense freezing drizzle',
        61: 'Slight rain',
        63: 'Moderate rain',
        65: 'Heavy rain',
        66: 'Light freezing rain',
        67: 'Heavy freezing rain',
        71: 'Slight snow',
        73: 'Moderate snow',
        75: 'Heavy snow',
        77: 'Snow grains',
        80: 'Slight rain showers',
        81: 'Moderate rain showers',
        82: 'Violent rain showers',
        85: 'Slight snow showers',
        86: 'Heavy snow showers',
        95: 'Thunderstorm',
        96: 'Thunderstorm with slight hail',
        99: 'Thunderstorm with heavy hail',
      }
      return map[code ?? -1] ?? 'Unknown'
    }

    try {
      const geoUrl = new URL('https://geocoding-api.open-meteo.com/v1/search')
      geoUrl.searchParams.set('name', location)
      geoUrl.searchParams.set('count', '1')
      geoUrl.searchParams.set('language', 'en')
      geoUrl.searchParams.set('format', 'json')
      const geoRes = await fetch(geoUrl.toString())
      const geoData = await geoRes.json()
      const place = geoData?.results?.[0]
      if (!place || !Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) {
        return { location, found: false, error: `Could not resolve weather location: ${location}` }
      }

      const forecastUrl = new URL('https://api.open-meteo.com/v1/forecast')
      forecastUrl.searchParams.set('latitude', String(place.latitude))
      forecastUrl.searchParams.set('longitude', String(place.longitude))
      forecastUrl.searchParams.set('timezone', 'auto')
      forecastUrl.searchParams.set('forecast_days', '3')
      forecastUrl.searchParams.set('temperature_unit', 'fahrenheit')
      forecastUrl.searchParams.set('windspeed_unit', 'mph')
      forecastUrl.searchParams.set('precipitation_unit', 'inch')
      forecastUrl.searchParams.set('current', 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,uv_index')
      forecastUrl.searchParams.set('hourly', 'temperature_2m,precipitation_probability,precipitation,weather_code')
      forecastUrl.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,sunrise,sunset')
      const fcRes = await fetch(forecastUrl.toString())
      const fcData = await fcRes.json()
      if (!fcRes.ok) {
        return { location, found: false, error: 'Weather provider request failed' }
      }

      const nowIso = String(fcData?.current?.time ?? '')
      const hourlyTime = Array.isArray(fcData?.hourly?.time) ? fcData.hourly.time : []
      const idxNow = Math.max(0, hourlyTime.findIndex((t: string) => t >= nowIso))
      const endIdx = Math.min(hourlyTime.length, idxNow + hoursAhead)

      const hourly = hourlyTime.slice(idxNow, endIdx).map((time: string, i: number) => {
        const at = idxNow + i
        return {
          time,
          temp_f: fcData?.hourly?.temperature_2m?.[at] ?? null,
          precip_probability: fcData?.hourly?.precipitation_probability?.[at] ?? null,
          precip_mm: fcData?.hourly?.precipitation?.[at] ?? null,
          weather_code: fcData?.hourly?.weather_code?.[at] ?? null,
          weather_label: weatherCodeLabel(fcData?.hourly?.weather_code?.[at] ?? null),
        }
      })

      const dailyTime = Array.isArray(fcData?.daily?.time) ? fcData.daily.time : []
      const daily = dailyTime.slice(0, 3).map((date: string, i: number) => ({
        date,
        temp_max_f: fcData?.daily?.temperature_2m_max?.[i] ?? null,
        temp_min_f: fcData?.daily?.temperature_2m_min?.[i] ?? null,
        precip_probability_max: fcData?.daily?.precipitation_probability_max?.[i] ?? null,
        uv_index_max: fcData?.daily?.uv_index_max?.[i] ?? null,
        weather_code: fcData?.daily?.weather_code?.[i] ?? null,
        weather_label: weatherCodeLabel(fcData?.daily?.weather_code?.[i] ?? null),
        sunrise: fcData?.daily?.sunrise?.[i] ?? null,
        sunset: fcData?.daily?.sunset?.[i] ?? null,
      }))

      const payload = {
        found: true,
        location: `${place.name}${place.admin1 ? `, ${place.admin1}` : ''}${place.country_code ? ` (${place.country_code})` : ''}`,
        latitude: place.latitude,
        longitude: place.longitude,
        timezone: fcData?.timezone ?? null,
        current: {
          time: fcData?.current?.time ?? null,
          temp_f: fcData?.current?.temperature_2m ?? null,
          feels_like_f: fcData?.current?.apparent_temperature ?? null,
          humidity: fcData?.current?.relative_humidity_2m ?? null,
          precip_mm: fcData?.current?.precipitation ?? null,
          wind_mph: fcData?.current?.wind_speed_10m ?? null,
          uv_index: fcData?.current?.uv_index ?? null,
          weather_code: fcData?.current?.weather_code ?? null,
          weather_label: weatherCodeLabel(fcData?.current?.weather_code ?? null),
        },
        hourly,
        daily,
        rain_expected_next_hours: hourly.some((h: { precip_probability?: number; precip_mm?: number }) => (h.precip_probability ?? 0) >= 40 || (h.precip_mm ?? 0) > 0.5),
        alerts: {
          provider: 'open-meteo',
          official_alerts_available: false,
          note: 'Open-Meteo endpoint used here does not provide official government warning feeds.',
        },
      }
      console.log(`[ai-assistant][${cid}] stage=read_tool name=${name} ms=${Date.now() - stageStartMs} results=${payload.daily.length}`)
      return payload
    } catch {
      console.log(`[ai-assistant][${cid}] stage=read_tool name=${name} ms=${Date.now() - stageStartMs} results=0 error=weather_fetch_failed`)
      return { location, found: false, error: 'Unable to reach weather provider' }
    }
  }

  if (name === 'get_travel_eta') {
    let destination = String(args.destination ?? '').trim()
    if (!destination && context.focusedEvent) {
      const fe = context.focusedEvent as { address?: string | null; location_name?: string | null; title?: string }
      destination = String(fe.address || fe.location_name || fe.title || '').trim()
    }
    if (!destination) return { found: false, error: 'Missing destination for travel ETA' }
    const origin = String(args.origin ?? '').trim() || homeAddress || String(context.homeCity ?? '')
    if (!origin) return { found: false, error: 'No origin available. Configure home address in Settings.' }

    const arrivalTimeIso = typeof args.arrival_time === 'string' ? String(args.arrival_time) : null
    const departureTimeIso = typeof args.departure_time === 'string' ? String(args.departure_time) : null
    const rawBuffer = Number(args.buffer_mins ?? 10)
    const bufferMins = Number.isFinite(rawBuffer) ? Math.max(0, Math.min(45, Math.round(rawBuffer))) : 10

    let payload = await computeCachedTravelEta({
      mapsKey,
      origin,
      destination,
      arrivalTimeIso,
      departureTimeIso,
      bufferMins,
    }, routeEtaCache)
    if (!payload.found && /no route found/i.test(String(payload.error ?? ''))) {
      const cleanedDestination = sanitizeTravelLocation(destination)
      const cleanedOriginRaw = sanitizeTravelLocation(origin)
      const cleanedOrigin = /^home$/i.test(cleanedOriginRaw) ? (homeAddress || String(context.homeCity ?? '')) : cleanedOriginRaw
      if ((cleanedDestination && cleanedDestination !== destination) || (cleanedOrigin && cleanedOrigin !== origin)) {
        payload = await computeCachedTravelEta({
          mapsKey,
          origin: cleanedOrigin || origin,
          destination: cleanedDestination || destination,
          arrivalTimeIso,
          departureTimeIso,
          bufferMins,
        }, routeEtaCache)
      }
    }
    if (!payload.found && /no route found/i.test(String(payload.error ?? ''))) {
      const inferredDestination = inferTravelDestinationFromText(String(latestUserText ?? ''))
      if (inferredDestination) {
        const inferredOrigin = inferTravelOriginFromText(String(latestUserText ?? ''))
        payload = await computeCachedTravelEta({
          mapsKey,
          origin: inferredOrigin || homeAddress || String(context.homeCity ?? '') || origin,
          destination: inferredDestination,
          arrivalTimeIso,
          departureTimeIso,
          bufferMins,
        }, routeEtaCache)
      }
    }
    console.log(`[ai-assistant][${cid}] stage=read_tool name=${name} ms=${Date.now() - stageStartMs} found=${payload.found ? 1 : 0}`)
    return payload
  }

  if (name === 'search_web') {
    const rawQuery = String(args.query ?? '').trim()
    const parsedMax = Number(args.max_results ?? 5)
    const maxResults = Number.isFinite(parsedMax) ? Math.max(1, Math.min(8, Math.round(parsedMax))) : 5
    if (!rawQuery) return { results: [], count: 0, error: 'Missing query' }

    let query = rawQuery
    if (context.focusedEvent) {
      const fe = context.focusedEvent as { location_name?: string | null; address?: string | null; title?: string }
      const venue = fe.location_name || fe.title || ''
      const address = fe.address || ''
      const deicticAnchor = [venue, address].filter(Boolean).join(' ')
      if (deicticAnchor && /\b(hotel|resort|venue|restaurant|clinic|doctor|school|stadium|park|here|nearby|around)\b/i.test(query)) {
        if (!query.toLowerCase().includes(venue.toLowerCase()) && (!address || !query.toLowerCase().includes(address.toLowerCase()))) {
          query = `${query} near ${deicticAnchor}`
        }
      }
    }

    // Server-side math interceptor: catch tip/percentage/arithmetic queries
    const mathIntercept =
      /^[\s\d.+\-*/x×÷()]+$/.test(query) ||
      /\b\d+\s*(percent|%)\s*(tip|off|of|on)\s+\$?\d+/i.test(query) ||
      /\btip\b.*\$?\d+/i.test(query) ||
      /\b(what\s+is|calc(ulate)?|compute|solve)\b.{0,30}\b\d+\b.{0,20}\b\d+\b/i.test(query) ||
      /\b\d+\s*(divided\s+by|times|plus|minus|multiplied)\s*\d+/i.test(query)
    if (mathIntercept) {
      return { results: [], count: 0, math_query: true, hint: 'This is a math/calculation query. Answer directly from reasoning — no web search needed.' }
    }

    if (!braveKey && provider === 'gemini' && apiKey) {
      try {
        const subUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
        const subRes = await providerFetch(subUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `Search the web and provide comprehensive, factual findings with key sources, dates, and locations for: ${query}` }] }],
            tools: [{ google_search: {} }],
            generationConfig: {
              maxOutputTokens: 1024,
              temperature: 0.3,
              thinkingConfig: { thinkingBudget: 0 },
            },
          }),
        }, { correlationId: cid, lane: experienceMode, callIndex: llmTelemetry.llm_calls + 1 })
        const subData = await subRes.json()
        if (!subRes.ok) {
          const message = subData?.error?.message ?? 'Google Search failed'
          console.log(`[ai-assistant][${cid}] stage=read_tool name=${name} ms=${Date.now() - stageStartMs} results=0 error=provider message=${message}`)
          return { results: [], count: 0, error: message }
        }
        const cand = subData?.candidates?.[0]
        const parts = cand?.content?.parts ?? []
        const text = parts.map((p: { text?: string }) => p.text ?? '').join('').trim()
        const metadata = cand?.groundingMetadata
        const chunks = (metadata?.groundingChunks ?? []) as Array<{ web?: { title?: string; uri?: string } }>
        const results = chunks.slice(0, maxResults).map((chunk, idx) => ({
          title: chunk.web?.title ?? `Source ${idx + 1}`,
          url: chunk.web?.uri ?? '',
          snippet: text.slice(0, 300),
          source: chunk.web?.title ?? 'Google Search',
          age: null,
        }))
        const payload = {
          results,
          count: results.length > 0 ? results.length : (text ? 1 : 0),
          query,
          findings: text,
        }
        console.log(`[ai-assistant][${cid}] stage=read_tool name=${name} ms=${Date.now() - stageStartMs} results=${payload.count} via=gemini_google_search`)
        return payload
      } catch {
        console.log(`[ai-assistant][${cid}] stage=read_tool name=${name} ms=${Date.now() - stageStartMs} results=0 error=gemini_google_search_failed`)
        return { results: [], count: 0, error: 'Google Search failed' }
      }
    }

    if (!braveKey) return { results: [], count: 0, error: 'Web search provider not configured' }

    try {
      const url = new URL('https://api.search.brave.com/res/v1/web/search')
      url.searchParams.set('q', query)
      url.searchParams.set('count', String(maxResults))
      url.searchParams.set('safesearch', 'moderate')

      const res = await fetch(url.toString(), {
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': braveKey,
        },
      })
      const data = await res.json()
      if (!res.ok) {
        const message = data?.error?.detail ?? data?.error ?? 'Brave search failed'
        const payload = { results: [], count: 0, error: message }
        console.log(`[ai-assistant][${cid}] stage=read_tool name=${name} ms=${Date.now() - stageStartMs} results=0 error=provider`)
        return payload
      }

      const results = (data?.web?.results ?? []).map((item: {
        title?: string
        url?: string
        description?: string
        age?: string
        page_age?: string
        profile?: { long_name?: string }
      }) => ({
        title: item.title ?? '',
        url: item.url ?? '',
        snippet: item.description ?? '',
        source: item.profile?.long_name ?? null,
        age: item.age ?? item.page_age ?? null,
      }))
      const payload = { results, count: results.length, query }
      console.log(`[ai-assistant][${cid}] stage=read_tool name=${name} ms=${Date.now() - stageStartMs} results=${payload.count}`)
      return payload
    } catch {
      console.log(`[ai-assistant][${cid}] stage=read_tool name=${name} ms=${Date.now() - stageStartMs} results=0 error=network`)
      return { results: [], count: 0, error: 'Unable to reach Brave Search' }
    }
  }
  return null
}
