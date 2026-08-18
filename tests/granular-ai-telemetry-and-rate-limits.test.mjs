import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { providerCallLedgerInternals } from '../supabase/functions/_shared/provider-call-ledger.mjs'

const migrationSql = readFileSync(
  resolve('supabase/migrations/20260818150000_granular_ai_telemetry_and_rate_limits.sql'),
  'utf8',
)
const dashboardSource = readFileSync(
  resolve('src/pages/StatusDashboardPage.tsx'),
  'utf8',
)
const ledgerSource = readFileSync(
  resolve('supabase/functions/_shared/provider-call-ledger.mjs'),
  'utf8',
)

test('providerCallLedgerInternals: extractUsage correctly parses Gemini usageMetadata with thoughts & cached tokens', () => {
  const result = providerCallLedgerInternals.extractUsage('gemini', {
    usageMetadata: {
      promptTokenCount: 1500,
      cachedContentTokenCount: 400,
      thoughtsTokenCount: 120,
      candidatesTokenCount: 350,
      totalTokenCount: 1850,
    },
  }, 6000)

  assert.equal(result.inputTokens, 1500)
  assert.equal(result.cachedInputTokens, 400)
  assert.equal(result.thoughtTokens, 120)
  assert.equal(result.outputTokens, 350)
  assert.equal(result.totalTokens, 1850)
})

test('providerCallLedgerInternals: extractUsage approximates token counts for embeddings when usageMetadata is omitted', () => {
  // When calling gemini-embedding-001 via batchEmbedContents, usageMetadata is omitted.
  // The ledger must approximate input tokens from promptChars (~4 chars per token).
  const result = providerCallLedgerInternals.extractUsage('gemini', {}, 800)

  assert.equal(result.inputTokens, 200, '800 prompt characters should approximate to 200 tokens')
  assert.equal(result.outputTokens, 0)
  assert.equal(result.totalTokens, 200)

  const emptyPayloadResult = providerCallLedgerInternals.extractUsage('gemini', null, 124)
  assert.equal(emptyPayloadResult.inputTokens, 31, '124 prompt characters should approximate to 31 tokens')
  assert.equal(emptyPayloadResult.totalTokens, 31)
})

test('providerCallLedgerInternals: extractUsage supports OpenAI and Anthropic provider shapes', () => {
  const openaiResult = providerCallLedgerInternals.extractUsage('openai', {
    usage: {
      prompt_tokens: 500,
      completion_tokens: 150,
      total_tokens: 650,
    },
  })
  assert.equal(openaiResult.inputTokens, 500)
  assert.equal(openaiResult.outputTokens, 150)
  assert.equal(openaiResult.totalTokens, 650)

  const anthropicResult = providerCallLedgerInternals.extractUsage('anthropic', {
    usage: {
      input_tokens: 800,
      output_tokens: 220,
      cache_read_input_tokens: 100,
    },
  })
  assert.equal(anthropicResult.inputTokens, 800)
  assert.equal(anthropicResult.cachedInputTokens, 100)
  assert.equal(anthropicResult.outputTokens, 220)
  assert.equal(anthropicResult.totalTokens, 1020)
})

test('providerCallLedger: intercepts HTTP 429 errors and dispatches rate limit notifications with 15m deduplication', () => {
  assert.match(ledgerSource, /dispatchRateLimitNotification/)
  assert.match(ledgerSource, /response\.status === 429/)
  assert.match(ledgerSource, /notifications\?source=eq\.system&type=eq\.rate_limit_warning/)
  assert.match(ledgerSource, /15 \* 60 \* 1000/)
})

test('migration 20260818150000: seeds embedding pricing and registers all active AI telemetry sources', () => {
  assert.match(migrationSql, /'gemini-embedding-001', 0\.02/)
  assert.match(migrationSql, /'text-embedding-004', 0\.02/)
  assert.match(migrationSql, /'gemini-3\.6-flash', 1\.50/)
  assert.match(migrationSql, /'index-family-data', 'family-data-index'/)
  assert.match(migrationSql, /'scan-travel-emails', 'travel-email-scan'/)
  assert.match(migrationSql, /'ai-agent-shadow', 'assistant-shadow'/)
})

test('migration 20260818150000: implements high-performance hash-joined hourly, capability, and rate-limit aggregation', () => {
  assert.match(migrationSql, /create or replace function public\.get_cost_dashboard_summary/)
  assert.match(migrationSql, /v_tz constant text := 'America\/New_York'/)
  assert.match(migrationSql, /date_trunc\('hour', c\.occurred_at at time zone v_tz\)/)
  assert.match(migrationSql, /date_trunc\('day', c\.occurred_at at time zone v_tz\)/)
  assert.match(migrationSql, /'hourly'/)
  assert.match(migrationSql, /'by_capability'/)
  assert.match(migrationSql, /'by_model'/)
  assert.match(migrationSql, /'by_traffic_class'/)
  assert.match(migrationSql, /'rate_limit_health'/)
  assert.match(migrationSql, /'circuit_breaker'/)
})

test('StatusDashboardPage: renders rate limit banner, dev circuit breaker, hourly chart, and capability matrix', () => {
  assert.match(dashboardSource, /get_cost_dashboard_summary/)
  assert.match(dashboardSource, /AI Provider Rate Limit Alert \(HTTP 429 Detected\)/)
  assert.match(dashboardSource, /AI Quota & Rate Limit Health: Healthy/)
  assert.match(dashboardSource, /Dev AI Circuit Breaker/)
  assert.match(dashboardSource, /AI Live/)
  assert.match(dashboardSource, /Pause Background/)
  assert.match(dashboardSource, /Pause All AI/)
  assert.match(dashboardSource, /24-Hour Live Burn Rate/)
  assert.match(dashboardSource, /Background Crons/)
  assert.match(dashboardSource, /User Voice \/ Chat/)
  assert.match(dashboardSource, /Capability Consumption Matrix/)
  assert.match(dashboardSource, /Model Distribution/)
  assert.match(dashboardSource, /Traffic Class Breakdown/)
  assert.match(dashboardSource, /Live Stream/)
})

test('live Supabase database verification: get_cost_dashboard_summary RPC returns complete data', async (t) => {
  const envPath = resolve('.env.local')
  if (!existsSync(envPath)) {
    t.skip('Skipping live DB check — .env.local not found')
    return
  }

  const { createClient } = await import('@supabase/supabase-js')
  const envContent = readFileSync(envPath, 'utf8')
  const env = Object.fromEntries(
    envContent
      .split('\n')
      .filter((l) => l.includes('='))
      .map((l) => {
        const [k, ...v] = l.split('=')
        return [k.trim(), v.join('=').trim().replace(/^["']|["']$/g, '')]
      }),
  )

  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
    t.skip('Skipping live DB check — missing Supabase URL or Anon key')
    return
  }

  const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
  const pEnd = new Date()
  const pStart = new Date(pEnd.getTime() - 30 * 24 * 60 * 60 * 1000)

  const { data, error } = await client.rpc('get_cost_dashboard_summary', {
    p_start: pStart.toISOString(),
    p_end: pEnd.toISOString(),
  })

  assert.equal(error, null, 'RPC call must succeed without error')
  assert.ok(data, 'RPC must return valid summary object')

  // Top level keys
  for (const key of ['today', 'period', 'daily', 'hourly', 'by_capability', 'by_model', 'by_traffic_class', 'rate_limit_health', 'circuit_breaker']) {
    assert.ok(key in data, `Summary must contain ${key}`)
  }

  // 24-hour array
  assert.equal(data.hourly.length, 24, 'Hourly array must contain exactly 24 hour points')
  assert.ok(data.by_capability.length > 0, 'by_capability must contain logged capabilities')
  assert.ok(data.by_model.some((m) => m.model === 'gemini-embedding-001'), 'Must include embedding model in breakdown')
})
