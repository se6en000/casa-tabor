import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  BACKGROUND_GEMINI_MODEL,
  resolveBackgroundLlmConfig,
} from '../supabase/functions/_shared/background-llm-model.mjs'
import {
  PRIMARY_GEMINI_MODEL,
  resolveProductionGeminiModel,
} from '../supabase/functions/_shared/llm-model-policy.mjs'
import { routeEtaCachePolicy } from '../supabase/functions/_shared/route-eta-cache.mjs'

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const aiAssistant = source('supabase/functions/ai-assistant/index.ts')
const enrichEvent = source('supabase/functions/enrich-event/index.ts')
const generateBriefing = source('supabase/functions/generate-briefing/index.ts')
const normalizeGroceries = source('supabase/functions/normalize-grocery-items/index.ts')
const analyzePrep = source('supabase/functions/analyze-prep/index.ts')
const scanGmail = source('supabase/functions/scan-gmail-inbox/index.ts')
const scanTravel = source('supabase/functions/scan-travel-emails/index.ts')
const recipeEdit = source('supabase/functions/recipe-edit-assistant/index.ts')
const recipeExtract = source('supabase/functions/extract-recipe-content/index.ts')
const smsWebhook = source('supabase/functions/sms-webhook/index.ts')
const geocodeEvent = source('supabase/functions/geocode-event-location/index.ts')
const geocodeMigration = source('supabase/migrations/20260802130000_reuse_event_geocodes.sql')
const routeEta = source('supabase/functions/route-eta/index.ts')
const travelEta = source('supabase/functions/_shared/travel-eta.mjs')
const routeCacheMigration = source('supabase/migrations/20260803150000_route_eta_cache.sql')
const eventDetailPanel = source('src/components/calendar/EventDetailPanel.tsx')

test('Gemini background work uses Flash Lite without changing other providers', () => {
  assert.equal(BACKGROUND_GEMINI_MODEL, 'gemini-2.5-flash-lite')
  assert.deepEqual(
    resolveBackgroundLlmConfig({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      api_key: 'test-key',
    }),
    {
      provider: 'gemini',
      model: 'gemini-2.5-flash-lite',
      api_key: 'test-key',
    },
  )
  assert.deepEqual(
    resolveBackgroundLlmConfig({
      provider: 'openai',
      model: 'gpt-4o-mini',
      api_key: 'test-key',
    }),
    {
      provider: 'openai',
      model: 'gpt-4o-mini',
      api_key: 'test-key',
    },
  )
})

test('production Gemini policy pins expensive and mutable aliases to 2.5 Flash', () => {
  assert.equal(PRIMARY_GEMINI_MODEL, 'gemini-2.5-flash')
  assert.equal(resolveProductionGeminiModel('gemini-2.5-flash-lite'), 'gemini-2.5-flash-lite')
  assert.equal(resolveProductionGeminiModel('gemini-3.5-flash'), 'gemini-2.5-flash')
  assert.equal(resolveProductionGeminiModel('gemini-flash-latest'), 'gemini-2.5-flash')
})

test('low-risk background functions use the shared model resolver but ai-assistant does not', () => {
  for (const backgroundSource of [
    enrichEvent,
    generateBriefing,
    normalizeGroceries,
    analyzePrep,
    scanGmail,
    scanTravel,
    recipeEdit,
    recipeExtract,
    smsWebhook,
  ]) {
    assert.match(backgroundSource, /resolveBackgroundLlmConfig/)
  }
  assert.doesNotMatch(aiAssistant, /resolveBackgroundLlmConfig/)
  assert.match(aiAssistant, /const DEFAULT_GEMINI_MODEL = PRIMARY_GEMINI_MODEL/)
})

test('routine assistant profiles disable thinking and use bounded output', () => {
  assert.match(aiAssistant, /thinking_budget: intentRouting\.profile === 'full' \? 512 : 0/)
  assert.match(aiAssistant, /intentRouting\.profile === 'general'\s+\? 1024\s+: 768/)
  assert.doesNotMatch(analyzePrep, /maxOutputTokens: 8192/)
})

test('event geocoding exits before Google when coordinates already exist or can be reused', () => {
  const existingCoordinates = geocodeEvent.indexOf("skipped: 'existing_coordinates'")
  const eventCache = geocodeEvent.indexOf("cached: true")
  const googlePlaces = geocodeEvent.indexOf("'https://places.googleapis.com/v1/places:searchText'")

  assert.ok(existingCoordinates >= 0)
  assert.ok(eventCache > existingCoordinates)
  assert.ok(googlePlaces > eventCache)
  assert.match(geocodeEvent, /\.neq\('id', eventId\)/)
  assert.match(geocodeEvent, /\.not\('lat', 'is', null\)/)
  assert.match(geocodeEvent, /\.not\('lng', 'is', null\)/)
})

test('database geocode triggers reuse matching event coordinates and suppress provider dispatch', () => {
  assert.match(geocodeMigration, /events_geocode_address_cache_idx/)
  assert.match(geocodeMigration, /events_geocode_location_cache_idx/)
  assert.match(geocodeMigration, /lower\(btrim\(event\.address\)\) = lower\(btrim\(new\.address\)\)/)
  assert.match(geocodeMigration, /lower\(btrim\(event\.location_name\)\) = lower\(btrim\(new\.location_name\)\)/)
  assert.match(geocodeMigration, /if new\.lat is not null and new\.lng is not null then\s+return new;/)
  assert.match(geocodeMigration, /if new\.record_kind = 'series_template' then/)
})

test('travel ETA avoids standalone geocoding and uses a durable adaptive cache', () => {
  assert.doesNotMatch(travelEta, /maps\.googleapis\.com\/maps\/api\/geocode/)
  assert.match(routeEta, /computeCachedTravelEta/)
  assert.match(routeCacheMigration, /create table if not exists public\.route_eta_cache/)
  assert.equal(routeEtaCachePolicy.cacheTtlMs({
    arrivalTimeIso: new Date(Date.now() + 30 * 60_000).toISOString(),
  }), 5 * 60_000)
  assert.equal(routeEtaCachePolicy.cacheTtlMs({
    arrivalTimeIso: new Date(Date.now() + 3 * 60 * 60_000).toISOString(),
  }), 15 * 60_000)
  assert.match(eventDetailPanel, /msUntilStart <= 90 \* 60_000\s+\? 5 \* 60_000/)
})
