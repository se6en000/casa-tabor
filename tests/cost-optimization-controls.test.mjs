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
import { providerCallLedgerInternals } from '../supabase/functions/_shared/provider-call-ledger.mjs'
import { parseLastJsonObject } from '../supabase/functions/_shared/json-output.mjs'
import {
  buildGoogleBillingQuery,
  rowsFromBigQuery,
  validateBillingTableIdentifier,
} from '../supabase/functions/_shared/google-billing-query.mjs'

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
const costObservabilityMigration = source('supabase/migrations/20260803190000_cost_observability_foundation.sql')
const costDashboardTimezoneFixMigration = source('supabase/migrations/20260803213000_fix_cost_dashboard_local_day_boundary.sql')
const costDashboardProviderLedgerMigration = source('supabase/migrations/20260804020600_source_dashboard_from_provider_ledger.sql')
const statusDashboard = source('src/pages/StatusDashboardPage.tsx')
const providerCallLedger = source('supabase/functions/_shared/provider-call-ledger.mjs')
const providerCallingFunctions = [
  aiAssistant,
  source('supabase/functions/ai-agent-shadow/index.ts'),
  analyzePrep,
  enrichEvent,
  recipeExtract,
  generateBriefing,
  source('supabase/functions/meal-planner-assistant/index.ts'),
  normalizeGroceries,
  recipeEdit,
  scanGmail,
  scanTravel,
  smsWebhook,
]

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

test('cost dashboard uses server aggregation and discloses incomplete billing coverage', () => {
  assert.match(statusDashboard, /supabase\.rpc\('get_cost_dashboard_summary'/)
  assert.doesNotMatch(statusDashboard, /\.from\('ai_usage_log'\)/)
  assert.match(statusDashboard, /Directional only/)
  assert.match(statusDashboard, /Actual Google cost/)
  assert.match(statusDashboard, /Estimated logged AI/)
  assert.match(statusDashboard, /Current tracking coverage/)
  assert.match(statusDashboard, /Historical estimate coverage/)
  assert.match(statusDashboard, /Three checks required for billing decisions/)
  assert.ok(statusDashboard.indexOf('id="today-heading"') < statusDashboard.indexOf('billing-confidence-heading'))
})

test('cost observability foundation keeps exact billing separate from live estimates', () => {
  assert.match(costObservabilityMigration, /create table if not exists public\.ai_provider_calls/)
  assert.match(costObservabilityMigration, /create table if not exists public\.maps_provider_calls/)
  assert.match(costObservabilityMigration, /create table if not exists public\.app_ai_outcomes/)
  assert.match(costObservabilityMigration, /create table if not exists public\.billing_line_items/)
  assert.match(costObservabilityMigration, /create or replace function public\.get_cost_dashboard_summary/)
  assert.match(costObservabilityMigration, /'gemini-2\.5-flash', 0\.30, null, 2\.50/)
  assert.match(costObservabilityMigration, /count\(\*\) filter \(where legacy_usage_enabled\)/)
  assert.match(costObservabilityMigration, /dashboard period cannot exceed 366 days/)
})

test('cost dashboard day boundaries use the household local timezone, not UTC', () => {
  // The database session timezone is UTC. America/New_York is 4-5 hours
  // behind, so a bare date_trunc('day', now()) or date_trunc('day', <ts>)
  // silently rolls "today" over hours before local midnight. Every day
  // boundary the RPC computes must anchor to America/New_York explicitly.
  assert.match(costDashboardTimezoneFixMigration, /v_tz constant text := 'America\/New_York'/)
  assert.match(costDashboardTimezoneFixMigration, /date_trunc\('day', now\(\) at time zone v_tz\) at time zone v_tz/)
  assert.match(costDashboardTimezoneFixMigration, /date_trunc\('day', p_start at time zone v_tz\) at time zone v_tz/)
  assert.match(costDashboardTimezoneFixMigration, /date_trunc\('day', \(p_end - interval '1 microsecond'\) at time zone v_tz\) at time zone v_tz/)
  assert.match(costDashboardTimezoneFixMigration, /\(d\.day at time zone v_tz\)::date as date/)
  assert.doesNotMatch(costDashboardTimezoneFixMigration, /where created_at >= date_trunc\('day', now\(\)\)/)
  assert.match(costDashboardTimezoneFixMigration, /create or replace function public\.get_cost_dashboard_summary/)
})

test('cost dashboard sources live usage from the provider ledger, not the legacy 3-function log', () => {
  // Only ai-assistant, enrich-event, and scan-gmail-inbox write to
  // ai_usage_log. Every AI-calling function (including generate-briefing)
  // writes to ai_provider_calls via createTrackedProviderFetch, so the
  // dashboard's Today/period/daily/by-function numbers must read from
  // ai_provider_calls to reflect all AI usage, not just those 3 paths.
  assert.match(costDashboardProviderLedgerMigration, /from public\.ai_provider_calls c/)
  assert.doesNotMatch(costDashboardProviderLedgerMigration, /from public\.ai_usage_log u\b/)
  assert.match(costDashboardProviderLedgerMigration, /c\.occurred_at >= p_start/)
  assert.match(costDashboardProviderLedgerMigration, /and c\.status = 'success'/)
  // The legacy "Historical estimate coverage" metric (legacy_usage_enabled)
  // is a deliberate, separate banner field and must be left untouched.
  assert.match(costDashboardProviderLedgerMigration, /'coverage_pct', coalesce\(c\.coverage_pct, 0\)/)
  assert.match(costDashboardProviderLedgerMigration, /'logged_paths', coalesce\(c\.logged_paths, 0\)/)
  assert.match(costDashboardProviderLedgerMigration, /when c\.coverage_pct < 100 then 'incomplete'/)
})

test('known July cost centers replay to the exact billed total', () => {
  const gemini = 58.10
  const routes = Math.max(12_334 - 5_000, 0) * 10 / 1_000
  const geocoding = Math.max(12_766 - 10_000, 0) * 5 / 1_000

  assert.equal(routes, 73.34)
  assert.equal(geocoding, 13.83)
  assert.equal(Number((gemini + routes + geocoding).toFixed(2)), 145.27)
})

test('provider ledger preserves provider token classes including Gemini thoughts', () => {
  assert.deepEqual(providerCallLedgerInternals.extractUsage('gemini', {
    usageMetadata: {
      promptTokenCount: 120,
      cachedContentTokenCount: 40,
      thoughtsTokenCount: 15,
      candidatesTokenCount: 25,
      totalTokenCount: 160,
    },
  }), {
    inputTokens: 120,
    cachedInputTokens: 40,
    thoughtTokens: 15,
    outputTokens: 25,
    totalTokens: 160,
  })
  assert.match(providerCallLedger, /response\.clone\(\)/)
  assert.match(providerCallLedger, /runtime\?\.waitUntil/)
})

test('every known AI provider path uses the tracked provider gateway', () => {
  for (const functionSource of providerCallingFunctions) {
    assert.match(functionSource, /createTrackedProviderFetch/)
    assert.doesNotMatch(
      functionSource,
      /await fetch\([\s\S]{0,120}(?:generativelanguage\.googleapis\.com|api\.openai\.com|api\.anthropic\.com)/,
    )
  }
  assert.match(costObservabilityMigration, /set provider_ledger_enabled = true/)
  assert.match(costObservabilityMigration, /before update or delete on public\.ai_provider_calls/)
})

test('enrichment selects the final grounded JSON object without merging search metadata', () => {
  const parsed = parseLastJsonObject([
    'Search request: {"query":"school address"}',
    'The grounded result is:',
    '```json',
    '{"category":"school","address":"123 Main St","prep_notes":"Leave early"}',
    '```',
  ].join('\n'))

  assert.deepEqual(parsed, {
    category: 'school',
    address: '123 Main St',
    prep_notes: 'Leave early',
  })
  assert.throws(() => parseLastJsonObject(''), /provider_output_empty/)
  assert.throws(() => parseLastJsonObject('no structured result'), /provider_output_invalid_json/)
})

test('Google billing query imports net USD cost and parses BigQuery scalar rows', () => {
  const table = validateBillingTableIdentifier('casa-tabor.billing.gcp_billing_export_resource_v1_123')
  const query = buildGoogleBillingQuery(table)
  assert.match(query, /sum\(BilledCost\) as cost_usd/)
  assert.match(query, /BillingCurrency = 'USD'/)
  assert.match(query, /between @period_start and @period_end/)
  const detailedQuery = buildGoogleBillingQuery(table, 'detailed')
  assert.match(detailedQuery, /sum\(cost\) \+ sum\(ifnull/)
  assert.match(detailedQuery, /currency = 'USD'/)
  assert.throws(() => buildGoogleBillingQuery(table, 'unknown'), /unsupported_google_billing_schema/)
  assert.throws(() => validateBillingTableIdentifier('bad`; drop table events; --'), /invalid_google_billing_table/)

  const [row] = rowsFromBigQuery({
    schema: {
      fields: [
        { name: 'usage_date' },
        { name: 'project_id' },
        { name: 'service_name' },
        { name: 'sku_name' },
        { name: 'subtotal_usd' },
        { name: 'credits_usd' },
        { name: 'cost_usd' },
      ],
    },
    rows: [{
      f: [
        { v: '2026-07-20' },
        { v: 'gen-lang-client-0884609718' },
        { v: 'Gemini API' },
        { v: 'Gemini output tokens' },
        { v: '7.99' },
        { v: '0' },
        { v: '7.99' },
      ],
    }],
  })
  assert.equal(row.cost_usd, 7.99)
  assert.equal(row.project_id, 'gen-lang-client-0884609718')
})
