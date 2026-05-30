import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Activity, Zap, DollarSign, BarChart3, RefreshCw, Bot, TrendingUp } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { cn } from '../utils/cn'

interface UsageRow {
  function_name: string
  provider: string
  model: string
  input_tokens: number
  output_tokens: number
  cached: boolean
  created_at: string
}

interface DayBucket { date: string; calls: number; tokens: number }

// Pricing per 1M tokens (input, output) — paid tier estimates
const PRICING: Record<string, [number, number]> = {
  'gemini-2.5-flash': [0.075, 0.30],
  'gemini-2.0-flash': [0.10, 0.40],
  'gemini-2.5-pro':   [1.25, 10],
  'gpt-4o-mini':      [0.15, 0.60],
  'gpt-4.1-nano':     [0.10, 0.40],
  'gpt-4o':           [2.50, 10],
  'claude-haiku-4-5': [0.80, 4],
  'claude-sonnet-4-5':[3,    15],
  'claude-opus-4-5':  [15,   75],
}

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const [inp, out] = PRICING[model] ?? [0.10, 0.40]
  return (inputTokens * inp + outputTokens * out) / 1_000_000
}

function fmt(n: number) { return n.toLocaleString() }
function fmtCost(n: number) {
  if (n < 0.001) return '<$0.001'
  if (n < 0.01) return `$${n.toFixed(4)}`
  return `$${n.toFixed(3)}`
}

interface StatCardProps { label: string; value: string; sub?: string; icon: React.ReactNode; accent?: boolean }
function StatCard({ label, value, sub, icon, accent }: StatCardProps) {
  return (
    <div className={cn(
      'bg-casa-surface rounded-card border p-4 shadow-card flex items-start gap-3',
      accent ? 'border-casa-gold/40' : 'border-casa-border',
    )}>
      <span className={cn('mt-0.5 shrink-0', accent ? 'text-casa-gold' : 'text-casa-muted')}>{icon}</span>
      <div className="min-w-0">
        <p className="text-caption text-casa-muted">{label}</p>
        <p className="text-heading font-display text-casa-navy leading-tight">{value}</p>
        {sub && <p className="text-caption text-casa-muted mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

export default function StatusDashboardPage() {
  const [rows, setRows] = useState<UsageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [llmConfig, setLlmConfig] = useState<{ provider: string; model: string } | null>(null)
  const [lastRefresh, setLastRefresh] = useState(new Date())

  async function load() {
    setLoading(true)
    const [usageRes, cfgRes] = await Promise.all([
      supabase
        .from('ai_usage_log')
        .select('function_name,provider,model,input_tokens,output_tokens,cached,created_at')
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false }),
      supabase.from('settings').select('value').eq('key', 'llm_config').single(),
    ])
    setRows((usageRes.data ?? []) as UsageRow[])
    if (cfgRes.data?.value) setLlmConfig(cfgRes.data.value as { provider: string; model: string })
    setLoading(false)
    setLastRefresh(new Date())
  }

  useEffect(() => { load() }, [])

  // ── Derived stats ──
  const todayStr = new Date().toISOString().slice(0, 10)
  const todayRows = rows.filter(r => r.created_at.slice(0, 10) === todayStr)
  const monthRows = rows  // already filtered to last 30 days

  function sumStats(rs: UsageRow[]) {
    const actual = rs.filter(r => !r.cached)
    const cached = rs.filter(r => r.cached)
    const calls = actual.length
    const inputTokens = actual.reduce((s, r) => s + (r.input_tokens ?? 0), 0)
    const outputTokens = actual.reduce((s, r) => s + (r.output_tokens ?? 0), 0)
    const cost = actual.reduce((s, r) => s + estimateCost(r.model, r.input_tokens ?? 0, r.output_tokens ?? 0), 0)
    return { calls, inputTokens, outputTokens, cost, cached: cached.length }
  }

  const today = sumStats(todayRows)
  const month = sumStats(monthRows)

  // Cache hit rate
  const totalToday = todayRows.length
  const hitRateToday = totalToday > 0 ? Math.round((today.cached / totalToday) * 100) : 0

  // By function breakdown (last 30 days, non-cached only)
  const byFunction: Record<string, { calls: number; tokens: number; cost: number }> = {}
  monthRows.filter(r => !r.cached).forEach(r => {
    const fn = r.function_name
    if (!byFunction[fn]) byFunction[fn] = { calls: 0, tokens: 0, cost: 0 }
    byFunction[fn].calls++
    byFunction[fn].tokens += (r.input_tokens ?? 0) + (r.output_tokens ?? 0)
    byFunction[fn].cost += estimateCost(r.model, r.input_tokens ?? 0, r.output_tokens ?? 0)
  })

  // Last 7 days bar chart
  const last7: DayBucket[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().slice(0, 10)
    const dayRows = rows.filter(r => r.created_at.slice(0, 10) === dateStr && !r.cached)
    last7.push({
      date: d.toLocaleDateString('en-US', { weekday: 'short' }),
      calls: dayRows.length,
      tokens: dayRows.reduce((s, r) => s + (r.input_tokens ?? 0) + (r.output_tokens ?? 0), 0),
    })
  }
  const maxCalls = Math.max(...last7.map(d => d.calls), 1)

  const isGeminiFree = llmConfig?.provider === 'gemini'
  const GEMINI_FREE_LIMIT = 10_000

  if (loading) return <div className="p-6 text-casa-muted animate-breathe">Loading…</div>

  return (
    <div className="flex-1 overflow-y-auto">
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <Link to="/settings" className="inline-flex items-center gap-1 text-body-sm text-casa-muted hover:text-casa-navy mb-4">
          <ChevronLeft size={16} /> Settings
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-display-md text-casa-navy mb-1">Status Dashboard</h1>
            <p className="text-body text-casa-muted">AI usage, tokens, and cost estimates</p>
          </div>
          <button
            onClick={load}
            className="p-2 rounded-button text-casa-muted hover:text-casa-navy hover:bg-casa-bg transition-colors"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Current config */}
      {llmConfig && (
        <div className="bg-casa-bg/60 rounded-card border border-casa-border/50 px-4 py-3 flex items-center gap-3">
          <Bot size={16} className="text-casa-gold shrink-0" />
          <div>
            <p className="text-body-sm text-casa-navy font-medium">
              {llmConfig.provider.charAt(0).toUpperCase() + llmConfig.provider.slice(1)} — {llmConfig.model}
            </p>
            {isGeminiFree && (
              <p className="text-caption text-casa-muted">Free tier: {fmt(GEMINI_FREE_LIMIT)} requests/day limit</p>
            )}
          </div>
          <Link to="/settings/ai" className="ml-auto text-caption text-casa-gold hover:underline">Change →</Link>
        </div>
      )}

      {/* Today — 4 stat cards in a row on desktop, 2×2 on mobile */}
      <div>
        <p className="text-caption font-semibold text-casa-muted uppercase tracking-wide mb-3">Today</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="AI Calls"
            value={fmt(today.calls)}
            sub={isGeminiFree ? `of ${fmt(GEMINI_FREE_LIMIT)} free/day` : undefined}
            icon={<Activity size={16} />}
            accent={isGeminiFree && today.calls > GEMINI_FREE_LIMIT * 0.7}
          />
          <StatCard
            label="Tokens Used"
            value={today.inputTokens + today.outputTokens > 0
              ? fmt(today.inputTokens + today.outputTokens)
              : '—'}
            sub={today.inputTokens > 0 ? `${fmt(today.inputTokens)} in / ${fmt(today.outputTokens)} out` : undefined}
            icon={<Zap size={16} />}
          />
          <StatCard
            label="Est. Cost"
            value={today.calls > 0 ? fmtCost(today.cost) : '—'}
            sub={isGeminiFree ? 'Free tier — no charge' : undefined}
            icon={<DollarSign size={16} />}
          />
          <StatCard
            label="Cache Hits"
            value={`${hitRateToday}%`}
            sub={`${today.cached} saved / ${totalToday} total`}
            icon={<TrendingUp size={16} />}
            accent={hitRateToday >= 50}
          />
        </div>
      </div>

      {/* Middle row: Last 30 days table + 7-day bar chart side by side on desktop */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* This Month */}
        <div>
          <p className="text-caption font-semibold text-casa-muted uppercase tracking-wide mb-3">Last 30 Days</p>
          <div className="bg-casa-surface rounded-card border border-casa-border p-4 shadow-card space-y-3 h-full">
            <div className="flex justify-between text-body-sm">
              <span className="text-casa-muted">Total AI calls</span>
              <span className="font-semibold text-casa-navy">{fmt(month.calls)}</span>
            </div>
            <div className="flex justify-between text-body-sm">
              <span className="text-casa-muted">Input tokens</span>
              <span className="font-semibold text-casa-navy">{fmt(month.inputTokens)}</span>
            </div>
            <div className="flex justify-between text-body-sm">
              <span className="text-casa-muted">Output tokens</span>
              <span className="font-semibold text-casa-navy">{fmt(month.outputTokens)}</span>
            </div>
            <div className="flex justify-between text-body-sm">
              <span className="text-casa-muted">Cache hits saved</span>
              <span className="font-semibold text-emerald-700">{fmt(month.cached)} calls</span>
            </div>
            <div className="h-px bg-casa-border" />
            <div className="flex justify-between text-body-sm">
              <span className="text-casa-muted">Est. cost</span>
              <span className="font-semibold text-casa-navy">{month.calls > 0 ? fmtCost(month.cost) : '—'}</span>
            </div>
            {isGeminiFree && (
              <p className="text-caption text-casa-muted bg-casa-bg/60 rounded px-2 py-1.5">
                💡 Gemini free tier — no charges apply. Cost shown is what you'd pay on a paid plan.
              </p>
            )}
          </div>
        </div>

        {/* Last 7 days chart */}
        <div>
          <p className="text-caption font-semibold text-casa-muted uppercase tracking-wide mb-3">
            <BarChart3 size={12} className="inline mr-1.5 mb-0.5" />Calls by Day (last 7)
          </p>
          <div className="bg-casa-surface rounded-card border border-casa-border p-4 shadow-card h-full flex flex-col justify-between">
            <div className="flex items-end gap-2 h-32">
              {last7.map(d => (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className={cn(
                      'w-full rounded-sm transition-all',
                      d.date === new Date().toLocaleDateString('en-US', { weekday: 'short' })
                        ? 'bg-casa-gold'
                        : 'bg-casa-navy/20',
                    )}
                    style={{ height: `${Math.max(4, (d.calls / maxCalls) * 100)}px` }}
                    title={`${d.calls} calls`}
                  />
                  <span className="text-casa-muted" style={{ fontSize: 10 }}>{d.date}</span>
                </div>
              ))}
            </div>
            <p className="text-caption text-casa-muted mt-3 text-center">
              {last7.reduce((s, d) => s + d.calls, 0)} total calls this week
            </p>
          </div>
        </div>
      </div>

      {/* Bottom row: By function + Tips side by side on desktop */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* By function */}
        <div>
          <p className="text-caption font-semibold text-casa-muted uppercase tracking-wide mb-3">By Function (30 days)</p>
          {Object.keys(byFunction).length > 0 ? (
            <div className="bg-casa-surface rounded-card border border-casa-border shadow-card divide-y divide-casa-border">
              {Object.entries(byFunction)
                .sort((a, b) => b[1].calls - a[1].calls)
                .map(([fn, stats]) => (
                  <div key={fn} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-body-sm font-medium text-casa-navy">{fn}</p>
                      <p className="text-caption text-casa-muted">{fmt(stats.tokens)} tokens</p>
                    </div>
                    <div className="text-right">
                      <p className="text-body-sm font-semibold text-casa-navy">{stats.calls} calls</p>
                      <p className="text-caption text-casa-muted">{fmtCost(stats.cost)}</p>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="bg-casa-surface rounded-card border border-casa-border p-6 shadow-card text-center text-casa-muted text-body-sm">
              No AI calls yet — data appears here after first use.
            </div>
          )}
        </div>

        {/* Tips */}
        <div>
          <p className="text-caption font-semibold text-casa-muted uppercase tracking-wide mb-3">Cost Control Tips</p>
          <div className="bg-casa-bg/60 rounded-card border border-casa-border/50 p-4 space-y-2">
            <ul className="text-caption text-casa-muted space-y-2 list-disc list-inside">
              <li>Gemini 2.5 Flash is the cheapest capable model (~$0.075/1M input)</li>
              <li>Cache hits are free — high hit rate means dedup is working well</li>
              <li>AI chat replies are capped at ~600 tokens each</li>
              <li>Enrichment only re-runs if the event content actually changes</li>
            </ul>
          </div>
        </div>
      </div>

      <p className="text-caption text-casa-muted text-center pb-4">
        Last refreshed {lastRefresh.toLocaleTimeString()}
      </p>
    </div>
    </div>
  )
}
