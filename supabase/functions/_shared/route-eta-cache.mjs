import { computeTravelEta } from './travel-eta.mjs'

const CACHE_TABLE = 'route_eta_cache'

function normalizeLocation(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function cacheTtlMs({ arrivalTimeIso, departureTimeIso }, nowMs = Date.now()) {
  const targetMs = Date.parse(arrivalTimeIso ?? departureTimeIso ?? '')
  const remainingMs = Number.isFinite(targetMs) ? targetMs - nowMs : 0
  if (remainingMs > 6 * 60 * 60_000) return 60 * 60_000
  if (remainingMs > 90 * 60_000) return 15 * 60_000
  return 5 * 60_000
}

async function cacheKey(params) {
  const identity = JSON.stringify({
    origin: normalizeLocation(params.origin),
    destination: normalizeLocation(params.destination),
    arrival_time: params.arrivalTimeIso ?? null,
    departure_time: params.departureTimeIso ?? null,
    buffer_mins: params.bufferMins ?? 10,
  })
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function createSupabaseRouteEtaCache(sb) {
  return {
    async get(key) {
      const { data, error } = await sb
        .from(CACHE_TABLE)
        .select('response')
        .eq('cache_key', key)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle()
      if (error) throw new Error(`Route ETA cache read failed: ${error.message}`)
      return data?.response ?? null
    },
    async set(key, response, expiresAt) {
      const { error } = await sb
        .from(CACHE_TABLE)
        .upsert({
          cache_key: key,
          response,
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'cache_key' })
      if (error) throw new Error(`Route ETA cache write failed: ${error.message}`)
    },
  }
}

export async function computeCachedTravelEta(params, cache) {
  const key = await cacheKey(params)
  const cached = await cache.get(key)
  if (cached) return { ...cached, cache_status: 'hit' }

  const result = await computeTravelEta(params)
  const ttlMs = result.found ? cacheTtlMs(params) : 60_000
  await cache.set(key, result, new Date(Date.now() + ttlMs).toISOString())
  return { ...result, cache_status: 'miss' }
}

export const routeEtaCachePolicy = {
  cacheTtlMs,
  normalizeLocation,
}
