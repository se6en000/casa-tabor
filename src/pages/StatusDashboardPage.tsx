import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  CheckCircle2,
  CircleDashed,
  CircleDollarSign,
  Clock3,
  Gauge,
  Layers,
  Pause,
  Play,
  RefreshCw,
  Server,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Workflow,
  Zap,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { cn } from '../utils/cn'
import {
  Alert,
  Button,
  Card,
  Chip,
  DisclosureSection,
  IconButton,
  Progress,
  SegmentedControl,
  SkeletonRow,
} from '../components/ui'
import { SettingsPageHeader } from '../components/settings'

type TrustStatus = 'verified' | 'provisional' | 'incomplete' | 'stale' | 'error'

interface UsageTotals {
  calls: number
  input_tokens: number
  cached_input_tokens: number
  output_tokens: number
  deduplicated_calls: number
  estimated_cost_usd: number
  unknown_pricing_calls?: number
}

interface HourlyUsagePoint {
  hour_start: string
  hour_label: string
  hour_num: number
  calls: number
  user_calls: number
  background_calls: number
  error_count: number
  tokens: number
  estimated_cost_usd: number
}

interface CapabilityUsageItem {
  capability: string
  sample_function: string
  calls: number
  user_calls: number
  background_calls: number
  tokens: number
  estimated_cost_usd: number
  avg_latency_ms: number
  error_count: number
}

interface ModelUsageItem {
  provider: string
  model: string
  calls: number
  tokens: number
  estimated_cost_usd: number
}

interface TrafficClassItem {
  traffic_class: string
  calls: number
  tokens: number
  estimated_cost_usd: number
}

interface RateLimitHealth {
  status: 'healthy' | 'warning' | 'throttled'
  throttled_15m_count: number
  throttled_24h_count: number
  rpm_last_minute: number
  recent_throttles: Array<{
    occurred_at: string
    function_name: string
    model: string
    error_class: string
    latency_ms: number
  }>
}

interface CircuitBreakerConfig {
  paused: boolean
  pause_scope: 'none' | 'background' | 'all'
  pause_until: string | null
  daily_cost_cap_usd: number
}

interface DashboardSummary {
  trust: {
    status: TrustStatus
    coverage_pct: number
    known_paths: number
    logged_paths: number
    provider_logged_paths: number
    provider_coverage_pct: number
    unknown_pricing_calls: number
    application_fresh_at: string | null
    billing_fresh_through: string | null
    billing_finalized: boolean
    reconciliation_variance_usd: number | null
    reconciled_at: string | null
  }
  today: UsageTotals
  period: UsageTotals
  daily: Array<{
    date: string
    calls: number
    tokens: number
    estimated_cost_usd: number
  }>
  hourly: HourlyUsagePoint[]
  by_function: Array<{
    function_name: string
    calls: number
    tokens: number
    estimated_cost_usd: number
  }>
  by_capability: CapabilityUsageItem[]
  by_model: ModelUsageItem[]
  by_traffic_class: TrafficClassItem[]
  rate_limit_health: RateLimitHealth
  circuit_breaker: CircuitBreakerConfig
  billing: {
    actual_cost_usd: number | null
    line_count: number
    finalized: boolean
    latest_usage_date: string | null
  }
}

interface StatCardProps {
  label: string
  value: string
  sub: string
  icon: ReactNode
}

const trustCopy: Record<TrustStatus, { label: string; tone: 'success' | 'info' | 'warning' | 'danger' }> = {
  verified: { label: 'Verified', tone: 'success' },
  provisional: { label: 'Provisional', tone: 'info' },
  incomplete: { label: 'Incomplete', tone: 'warning' },
  stale: { label: 'Stale', tone: 'warning' },
  error: { label: 'Error', tone: 'danger' },
}

const trustGateToneClass = {
  success: 'text-casa-success-strong',
  info: 'text-casa-info-strong',
  warning: 'text-casa-warning',
}

const PAUSE_DURATION_OPTIONS = [
  { value: '15m', label: '15 mins' },
  { value: '1h', label: '1 hour' },
  { value: '4h', label: '4 hours' },
  { value: 'indefinite', label: 'Indefinite' },
] as const

const TIMEFRAME_OPTIONS = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
] as const

const CAPABILITY_FILTER_OPTIONS = [
  { value: 'all', label: 'All Capabilities' },
  { value: 'background', label: 'Background Crons' },
  { value: 'user', label: 'User Voice/Chat' },
] as const

function formatNumber(value: number) {
  return Number(value ?? 0).toLocaleString()
}

function formatEstimatedCost(value: number) {
  const amount = Number(value ?? 0)
  if (amount < 0.001) return '<$0.001'
  if (amount < 0.01) return '$' + amount.toFixed(4)
  return '$' + amount.toFixed(2)
}

function formatActualCost(value: number | null) {
  return value === null ? 'Not imported' : '$' + Number(value).toFixed(2)
}

function formatFreshness(value: string | null) {
  if (!value) return 'No data'
  return new Date(value).toLocaleString()
}

function StatCard({ label, value, sub, icon }: StatCardProps) {
  return (
    <Card padding="sm" className="flex items-start gap-3 min-h-[4.5rem]">
      <span className="mt-0.5 shrink-0 text-casa-muted" aria-hidden="true">{icon}</span>
      <div className="min-w-0">
        <p className="text-caption text-casa-muted font-medium">{label}</p>
        <p className="text-heading font-display text-casa-navy leading-tight">{value}</p>
        <p className="text-caption text-casa-muted mt-0.5">{sub}</p>
      </div>
    </Card>
  )
}

function TodayMetric({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="min-w-0 p-1">
      <div className="flex items-center gap-1.5 text-casa-text-secondary">
        {icon && <span className="shrink-0 text-casa-gold">{icon}</span>}
        <p className="text-caption font-medium uppercase tracking-wider">{label}</p>
      </div>
      <p className="mt-1 text-heading font-display leading-tight text-content-heading">{value}</p>
    </div>
  )
}

function TrustGate({
  icon,
  label,
  detail,
  status,
  tone,
}: {
  icon: ReactNode
  label: string
  detail: string
  status: string
  tone: 'success' | 'info' | 'warning'
}) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-3">
      <span className={trustGateToneClass[tone]} aria-hidden="true">{icon}</span>
      <div className="min-w-0">
        <p className="text-body-sm font-semibold text-content-heading">{label}</p>
        <p className="text-body-sm text-casa-text-secondary">{detail}</p>
      </div>
      <Chip tone={tone} size="sm">{status}</Chip>
    </div>
  )
}

export default function StatusDashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [llmConfig, setLlmConfig] = useState<{ provider: string; model: string } | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [selectedHour, setSelectedHour] = useState<HourlyUsagePoint | null>(null)
  const [timeframe, setTimeframe] = useState<'24h' | '7d' | '30d'>('30d')
  const [capabilityFilter, setCapabilityFilter] = useState<'all' | 'user' | 'background'>('all')
  const [circuitBreakerSaving, setCircuitBreakerSaving] = useState(false)
  const [pauseDuration, setPauseDuration] = useState<'15m' | '1h' | '4h' | 'indefinite'>('1h')
  const [liveStreamActive, setLiveStreamActive] = useState(false)

  const load = useCallback(async (selectedTf: '24h' | '7d' | '30d' = timeframe) => {
    setLoading(true)
    setError(null)
    const periodEnd = new Date()
    const ms = selectedTf === '24h' ? 24 * 60 * 60 * 1000 : selectedTf === '7d' ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000
    const periodStart = new Date(periodEnd.getTime() - ms)
    const [summaryRes, cfgRes] = await Promise.all([
      supabase.rpc('get_cost_dashboard_summary', {
        p_start: periodStart.toISOString(),
        p_end: periodEnd.toISOString(),
      }),
      supabase.from('settings').select('value').eq('key', 'llm_config').single(),
    ])

    if (summaryRes.error) {
      setSummary(null)
      setError('The cost summary could not be loaded: ' + summaryRes.error.message)
    } else {
      const data = summaryRes.data as DashboardSummary
      setSummary(data)
      if (data.hourly && data.hourly.length > 0) {
        setSelectedHour(data.hourly[data.hourly.length - 1] ?? null)
      }
    }
    if (cfgRes.data?.value) {
      setLlmConfig(cfgRes.data.value as { provider: string; model: string })
    }
    setLastRefresh(new Date())
    setLoading(false)
  }, [timeframe])

  useEffect(() => {
    void load()
  }, [load])

  // Optional Live Realtime Stream (with 5-minute auto-disable for kiosk protection)
  useEffect(() => {
    if (!liveStreamActive) return
    const channel = supabase
      .channel('ai-telemetry-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ai_provider_calls' },
        () => {
          void load()
        },
      )
      .subscribe()

    const timeout = setTimeout(() => {
      setLiveStreamActive(false)
    }, 5 * 60 * 1000)

    return () => {
      clearTimeout(timeout)
      void supabase.removeChannel(channel)
    }
  }, [liveStreamActive, load])

  async function handleToggleCircuitBreaker(paused: boolean, scope: 'background' | 'all' = 'background') {
    setCircuitBreakerSaving(true)
    let pauseUntil: string | null = null
    if (paused && pauseDuration !== 'indefinite') {
      const ms = pauseDuration === '15m' ? 15 * 60 * 1000 : pauseDuration === '4h' ? 4 * 60 * 60 * 1000 : 60 * 60 * 1000
      pauseUntil = new Date(Date.now() + ms).toISOString()
    }

    const payload: CircuitBreakerConfig = {
      paused,
      pause_scope: paused ? scope : 'none',
      pause_until: pauseUntil,
      daily_cost_cap_usd: summary?.circuit_breaker?.daily_cost_cap_usd ?? 2.0,
    }

    await supabase.from('settings').upsert({
      key: 'ai_circuit_breaker',
      value: payload,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' })

    setCircuitBreakerSaving(false)
    void load()
  }

  const lastSevenDays = useMemo(() => summary?.daily.slice(-7) ?? [], [summary])
  const maxDailyCost = useMemo(() => Math.max(...lastSevenDays.map((day) => day.estimated_cost_usd), 0.001), [lastSevenDays])

  // Hourly metrics calculation
  const hourlyData = useMemo(() => summary?.hourly ?? [], [summary])
  const maxHourlyCalls = useMemo(() => Math.max(...hourlyData.map((h) => h.calls), 1), [hourlyData])
  const peakHour = useMemo(() => {
    if (!hourlyData.length) return null
    return [...hourlyData].sort((a, b) => b.calls - a.calls)[0]
  }, [hourlyData])

  // Filtered capabilities
  const filteredCapabilities = useMemo(() => {
    const caps = summary?.by_capability ?? []
    if (capabilityFilter === 'user') return caps.filter((c) => c.user_calls > 0)
    if (capabilityFilter === 'background') return caps.filter((c) => c.background_calls > 0)
    return caps
  }, [summary?.by_capability, capabilityFilter])

  const maxCapabilityCalls = useMemo(() => {
    return Math.max(...(filteredCapabilities.map((c) => c.calls) ?? []), 1)
  }, [filteredCapabilities])

  // Model token volume sums
  const totalModelTokens = useMemo(() => {
    return summary?.by_model.reduce((acc, m) => acc + m.tokens, 0) || 1
  }, [summary?.by_model])

  if (loading && !summary) {
    return <div className="space-y-4"><SkeletonRow /><SkeletonRow /><SkeletonRow /></div>
  }

  const rateLimitStatus = summary?.rate_limit_health?.status ?? 'healthy'
  const isCircuitBreakerActive = summary?.circuit_breaker?.paused === true

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <SettingsPageHeader
          title="Cost & Usage"
          description="Google billing, AI telemetry, hourly consumption, and quota reconciliation"
        />
        <div className="flex items-center gap-2">
          <Button
            variant={liveStreamActive ? 'strong' : 'secondary'}
            size="sm"
            onClick={() => setLiveStreamActive(!liveStreamActive)}
            leadingIcon={<Activity size={14} className={liveStreamActive ? 'animate-pulse text-emerald-400' : ''} />}
          >
            {liveStreamActive ? 'Live Stream Active' : 'Live Stream'}
          </Button>
          <IconButton
            icon={<RefreshCw size={18} className={loading ? 'animate-spin motion-reduce:animate-none' : ''} />}
            aria-label="Refresh cost and usage dashboard"
            onClick={() => void load()}
            variant="ghost"
            disabled={loading}
          />
        </div>
      </div>

      {error && (
        <Alert tone="danger" title="Dashboard data is unavailable">
          <p>{error}</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            leadingIcon={<RefreshCw size={16} />}
            onClick={() => void load()}
            loading={loading}
          >
            Try again
          </Button>
        </Alert>
      )}

      {/* ── 1. RATE LIMIT & QUOTA HEALTH BANNER ──────────────────────── */}
      {summary && (
        <div className={cn(
          'rounded-card border p-4 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-card',
          rateLimitStatus === 'throttled'
            ? 'border-rose-300 bg-rose-50/90 text-rose-950'
            : rateLimitStatus === 'warning'
              ? 'border-amber-300 bg-amber-50/90 text-amber-950'
              : 'border-casa-border/80 bg-casa-surface text-casa-navy',
        )}>
          <div className="flex items-start gap-3 min-w-0">
            <div className={cn(
              'rounded-pill p-2 mt-0.5 shrink-0',
              rateLimitStatus === 'throttled' ? 'bg-rose-200 text-rose-800' : rateLimitStatus === 'warning' ? 'bg-amber-200 text-amber-800' : 'bg-emerald-100 text-emerald-800',
            )}>
              {rateLimitStatus === 'throttled' ? <AlertTriangle size={18} /> : rateLimitStatus === 'warning' ? <Gauge size={18} /> : <CheckCircle2 size={18} />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-body-sm font-semibold">
                  {rateLimitStatus === 'throttled'
                    ? 'AI Provider Rate Limit Alert (HTTP 429 Detected)'
                    : rateLimitStatus === 'warning'
                      ? 'Approaching Request Rate Headroom'
                      : 'AI Quota & Rate Limit Health: Healthy'}
                </p>
                <Chip size="sm" tone={rateLimitStatus === 'throttled' ? 'danger' : rateLimitStatus === 'warning' ? 'warning' : 'success'}>
                  {rateLimitStatus === 'throttled' ? (summary.rate_limit_health.throttled_15m_count + ' Throttled (15m)') : (summary.rate_limit_health.rpm_last_minute + ' RPM (Current)')}
                </Chip>
              </div>
              <p className="text-caption text-casa-muted mt-0.5">
                {rateLimitStatus === 'throttled'
                  ? 'One or more edge functions exceeded provider velocity limits. Automatic 15-minute backoff suppression engaged.'
                  : ('Current velocity: ' + summary.rate_limit_health.rpm_last_minute + ' requests/min. Zero 429 rate limits encountered in the past 24 hours.')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            {rateLimitStatus === 'throttled' && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => void handleToggleCircuitBreaker(true, 'background')}
                leadingIcon={<Pause size={14} />}
                disabled={circuitBreakerSaving}
              >
                Pause Background Crons
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── 2. DEV CIRCUIT BREAKER & SAFETY CONTROLS ───────────────── */}
      {summary && (
        <Card padding="sm" className="bg-casa-surface/90 border-casa-border shadow-card">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className={cn(
                'rounded-pill p-2 mt-0.5 shrink-0',
                isCircuitBreakerActive ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800',
              )}>
                {isCircuitBreakerActive ? <Pause size={18} /> : <Zap size={18} />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-body-sm font-semibold text-casa-navy">Dev AI Circuit Breaker</p>
                  <Chip size="sm" tone={isCircuitBreakerActive ? 'warning' : 'success'}>
                    {isCircuitBreakerActive ? ('Paused (' + summary.circuit_breaker.pause_scope + ')') : 'AI Live'}
                  </Chip>
                </div>
                <p className="text-caption text-casa-muted mt-0.5">
                  {isCircuitBreakerActive
                    ? ('AI requests return deterministic mock stubs until ' + (summary.circuit_breaker.pause_until ? new Date(summary.circuit_breaker.pause_until).toLocaleTimeString() : 'manually resumed') + '. Queues remain safe.')
                    : 'Pause background automation or all AI calls during heavy development to avoid burning API quota.'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 self-end lg:self-center">
              {!isCircuitBreakerActive ? (
                <>
                  <SegmentedControl
                    aria-label="Pause duration"
                    value={pauseDuration}
                    options={PAUSE_DURATION_OPTIONS}
                    onChange={(val) => setPauseDuration(val)}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void handleToggleCircuitBreaker(true, 'background')}
                    disabled={circuitBreakerSaving}
                    leadingIcon={<Pause size={14} />}
                  >
                    Pause Background
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void handleToggleCircuitBreaker(true, 'all')}
                    disabled={circuitBreakerSaving}
                    leadingIcon={<Pause size={14} />}
                  >
                    Pause All AI
                  </Button>
                </>
              ) : (
                <Button
                  variant="strong"
                  size="sm"
                  onClick={() => void handleToggleCircuitBreaker(false)}
                  disabled={circuitBreakerSaving}
                  leadingIcon={<Play size={14} />}
                >
                  Resume All AI
                </Button>
              )}
            </div>
          </div>
        </Card>
      )}

      {summary && (
        <div className="space-y-5">
          {/* ── 3. TODAY HERO METRICS ───────────────────────────────── */}
          <section aria-labelledby="today-heading">
            <div className="flex items-center justify-between mb-2">
              <h2 id="today-heading" className="text-subheading font-display text-content-heading">
                Today’s AI Activity
              </h2>
              <span className="text-caption text-casa-muted">
                Reset at 12:00 AM America/New_York
              </span>
            </div>
            <Card tone="accent" className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4 p-5">
              <TodayMetric
                label="Provider-backed requests"
                value={formatNumber(summary.today.calls)}
                icon={<Zap size={15} />}
              />
              <TodayMetric
                label="Input / output tokens"
                value={formatNumber(summary.today.input_tokens) + ' / ' + formatNumber(summary.today.output_tokens)}
                icon={<Layers size={15} />}
              />
              <TodayMetric
                label="Prompt tokens reused"
                value={formatNumber(summary.today.cached_input_tokens)}
                icon={<Sparkles size={15} />}
              />
              <TodayMetric
                label="Estimated AI cost"
                value={formatEstimatedCost(summary.today.estimated_cost_usd)}
                icon={<CircleDollarSign size={15} />}
              />
            </Card>
          </section>

          {/* ── 4. AWESOME CHART #1: 24-HOUR HOURLY BURN RATE ──────── */}
          <section aria-labelledby="hourly-heading">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <BarChart3 size={18} className="text-casa-gold" aria-hidden="true" />
                <h2 id="hourly-heading" className="text-subheading font-display text-content-heading">
                  24-Hour Live Burn Rate
                </h2>
              </div>
              {peakHour && (
                <span className="text-caption font-medium text-casa-muted">
                  Peak: <strong className="text-casa-navy">{peakHour.hour_label}</strong> ({formatNumber(peakHour.calls)} calls · {formatEstimatedCost(peakHour.estimated_cost_usd)})
                </span>
              )}
            </div>

            <Card className="p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 text-caption text-casa-muted border-b border-casa-border/50 pb-3">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-sm bg-casa-navy" aria-hidden="true" />
                    <span>Background Crons</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-sm bg-casa-gold" aria-hidden="true" />
                    <span>User Voice / Chat</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-sm bg-rose-500" aria-hidden="true" />
                    <span>Errors / 429s</span>
                  </div>
                </div>
                <span className="text-caption text-casa-muted">
                  Tap any bar to inspect hour
                </span>
              </div>

              {/* Stacked Interactive SVG / CSS Chart */}
              <div className="flex items-end gap-1.5 h-44 pt-4 px-1" aria-label="Hourly usage chart">
                {hourlyData.map((point) => {
                  const isSelected = selectedHour?.hour_start === point.hour_start
                  const total = point.calls + point.error_count
                  const heightPercent = total > 0 ? Math.max(8, (total / maxHourlyCalls) * 100) : 4
                  const bgPercent = total > 0 ? (point.background_calls / total) * 100 : 100
                  const userPercent = total > 0 ? (point.user_calls / total) * 100 : 0
                  const errPercent = total > 0 ? (point.error_count / total) * 100 : 0

                  return (
                    <div
                      key={point.hour_start}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedHour(point)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setSelectedHour(point)
                        }
                      }}
                      className={cn(
                        'flex-1 flex flex-col items-center justify-end h-full group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-casa-gold rounded-sm transition-all cursor-pointer',
                        isSelected ? 'opacity-100 scale-105' : 'opacity-80 hover:opacity-100',
                      )}
                      aria-label={point.hour_label + ': ' + point.calls + ' calls, ' + formatEstimatedCost(point.estimated_cost_usd)}
                    >
                      <div
                        className={cn(
                          'w-full max-w-7 rounded-t-sm flex flex-col-reverse overflow-hidden transition-all duration-300',
                          isSelected ? 'ring-2 ring-casa-gold shadow-md' : '',
                        )}
                        style={{ height: heightPercent + '%' }}
                      >
                        {/* Background Crons Segment */}
                        <div style={{ height: bgPercent + '%' }} className="bg-casa-navy w-full" />
                        {/* User Voice / Chat Segment */}
                        <div style={{ height: userPercent + '%' }} className="bg-casa-gold w-full" />
                        {/* Error Segment */}
                        {errPercent > 0 && <div style={{ height: errPercent + '%' }} className="bg-rose-500 w-full" />}
                      </div>
                      <span className={cn(
                        'text-caption mt-1.5 tracking-tighter tabular-nums',
                        isSelected ? 'font-bold text-casa-navy' : 'text-casa-muted',
                      )}>
                        {point.hour_num % 3 === 0 ? point.hour_label.split(' ')[0] : '·'}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Selected Hour Inspection Card */}
              {selectedHour && (
                <div className="rounded-card bg-casa-bg/80 border border-casa-border p-3 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Clock3 size={18} className="text-casa-gold shrink-0" />
                    <div>
                      <p className="text-body-sm font-semibold text-casa-navy">
                        {selectedHour.hour_label} Breakdown
                      </p>
                      <p className="text-caption text-casa-muted">
                        {formatNumber(selectedHour.calls)} total requests · {formatNumber(selectedHour.tokens)} tokens burned
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-body-sm">
                    <div>
                      <span className="text-caption text-casa-muted block">Background:</span>
                      <strong className="text-casa-navy">{formatNumber(selectedHour.background_calls)}</strong>
                    </div>
                    <div>
                      <span className="text-caption text-casa-muted block">User / Voice:</span>
                      <strong className="text-casa-gold">{formatNumber(selectedHour.user_calls)}</strong>
                    </div>
                    <div>
                      <span className="text-caption text-casa-muted block">Estimated Cost:</span>
                      <strong className="text-content-heading">{formatEstimatedCost(selectedHour.estimated_cost_usd)}</strong>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          </section>

          {/* ── 5. AWESOME CHART #2: CAPABILITY MATRIX & COST DRIVERS ── */}
          <section aria-labelledby="capability-heading">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <Workflow size={18} className="text-casa-gold" aria-hidden="true" />
                <div>
                  <h2 id="capability-heading" className="text-subheading font-display text-content-heading">
                    Capability Consumption Matrix
                  </h2>
                  <p className="text-caption text-casa-muted">
                    {timeframe === '24h' ? 'Showing past 24 hours consumption' : timeframe === '7d' ? 'Showing past 7 days consumption' : 'Showing past 30 days consumption'}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <SegmentedControl
                  aria-label="Timeframe"
                  value={timeframe}
                  options={TIMEFRAME_OPTIONS}
                  onChange={(val) => {
                    setTimeframe(val)
                    void load(val)
                  }}
                />
                <SegmentedControl
                  aria-label="Filter capabilities"
                  value={capabilityFilter}
                  options={CAPABILITY_FILTER_OPTIONS}
                  onChange={(val) => setCapabilityFilter(val)}
                />
              </div>
            </div>

            <Card padding="none" className="overflow-hidden">
              <div className="divide-y divide-casa-border">
                {filteredCapabilities.map((item) => (
                  <div key={item.capability} className="p-4 hover:bg-casa-bg/40 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-body-sm font-semibold text-content-heading capitalize">
                            {item.capability.replace(/-/g, ' ')}
                          </p>
                          <span className="font-mono text-caption text-casa-muted bg-surface-inset px-2 py-0.5 rounded-pill">
                            {item.sample_function}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-caption text-casa-text-secondary mt-1">
                          <span>{formatNumber(item.calls)} calls ({item.user_calls > 0 ? (item.user_calls + ' user') : '100% background'})</span>
                          <span>·</span>
                          <span>{formatNumber(item.tokens)} tokens</span>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1">
                            <Gauge size={12} /> {item.avg_latency_ms}ms avg latency
                          </span>
                          {item.error_count > 0 && (
                            <Chip size="sm" tone="danger">{item.error_count} errors</Chip>
                          )}
                        </div>
                      </div>
                      <p className="text-body font-semibold text-content-heading shrink-0 self-start sm:self-center">
                        {formatEstimatedCost(item.estimated_cost_usd)}
                      </p>
                    </div>
                    <div className="mt-2.5 h-2 overflow-hidden rounded-pill bg-surface-inset" aria-hidden="true">
                      <div
                        className="h-full rounded-pill bg-casa-navy transition-all duration-500"
                        style={{ width: Math.max(2, (item.calls / maxCapabilityCalls) * 100) + '%' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </section>

          {/* ── 6. AWESOME CHART #3: MODEL DISTRIBUTION & TRAFFIC SPLIT */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section aria-labelledby="model-dist-heading">
              <h2 id="model-dist-heading" className="text-subheading font-display text-content-heading mb-3 flex items-center gap-2">
                <Bot size={18} className="text-casa-gold" />
                Model Distribution
              </h2>
              <Card className="p-4 space-y-4">
                <div className="space-y-3">
                  {summary.by_model.map((m) => {
                    const pct = Math.round((m.tokens / totalModelTokens) * 100) || 0
                    return (
                      <div key={m.model} className="space-y-1">
                        <div className="flex items-center justify-between text-caption font-medium">
                          <span className="text-casa-navy font-semibold">{m.model}</span>
                          <span className="text-casa-muted">{formatNumber(m.calls)} calls · {formatEstimatedCost(m.estimated_cost_usd)}</span>
                        </div>
                        <Progress value={pct} max={100} label={m.model} showValue />
                      </div>
                    )
                  })}
                </div>
              </Card>
            </section>

            <section aria-labelledby="traffic-split-heading">
              <h2 id="traffic-split-heading" className="text-subheading font-display text-content-heading mb-3 flex items-center gap-2">
                <Server size={18} className="text-casa-gold" />
                Traffic Class Breakdown
              </h2>
              <Card className="p-4 space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  {summary.by_traffic_class.map((tc) => (
                    <div key={tc.traffic_class} className="rounded-card bg-casa-bg/60 border border-casa-border p-3">
                      <p className="text-caption font-semibold uppercase text-casa-muted">{tc.traffic_class}</p>
                      <p className="text-heading font-display text-casa-navy mt-1">{formatNumber(tc.calls)}</p>
                      <p className="text-caption text-casa-muted mt-0.5">{formatEstimatedCost(tc.estimated_cost_usd)}</p>
                    </div>
                  ))}
                </div>
              </Card>
            </section>
          </div>

          {/* ── 7. BILLING CONFIDENCE & 30-DAY TOTALS ────────────────── */}
          <Card padding="sm" aria-labelledby="billing-confidence-heading">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-casa-divider pb-3">
              <div className="flex items-center gap-3">
                {summary.trust.status === 'verified'
                  ? <ShieldCheck size={22} className="text-casa-success-strong" aria-hidden="true" />
                  : <ShieldAlert size={22} className="text-casa-warning" aria-hidden="true" />}
                <div>
                  <h2 id="billing-confidence-heading" className="text-body font-bold text-content-heading">
                    Billing Confidence
                  </h2>
                  <p className="text-body-sm text-casa-text-secondary">Three checks required for billing decisions</p>
                </div>
              </div>
              <Chip tone={trustCopy[summary.trust.status].tone}>
                {trustCopy[summary.trust.status].label}
              </Chip>
            </div>

            <div className="divide-y divide-casa-divider">
              <TrustGate
                icon={summary.trust.provider_coverage_pct === 100
                  ? <CheckCircle2 size={20} />
                  : <CircleDashed size={20} />}
                label="Application tracking"
                detail={summary.trust.provider_logged_paths + ' of ' + summary.trust.known_paths + ' active AI paths tracked'}
                status={summary.trust.provider_coverage_pct === 100 ? 'Complete' : 'Incomplete'}
                tone={summary.trust.provider_coverage_pct === 100 ? 'success' : 'warning'}
              />
              <TrustGate
                icon={summary.billing.line_count > 0 ? <CheckCircle2 size={20} /> : <Clock3 size={20} />}
                label="Google billing"
                detail={summary.billing.line_count > 0
                  ? ('Imported through ' + formatFreshness(summary.billing.latest_usage_date))
                  : 'Waiting for the first Google billing export'}
                status={summary.billing.line_count > 0
                  ? (summary.billing.finalized ? 'Finalized' : 'Imported')
                  : 'Waiting'}
                tone={summary.billing.line_count > 0
                  ? (summary.billing.finalized ? 'success' : 'info')
                  : 'warning'}
              />
              <TrustGate
                icon={summary.trust.reconciled_at ? <CheckCircle2 size={20} /> : <CircleDashed size={20} />}
                label="Reconciliation"
                detail={summary.trust.reconciled_at
                  ? ('Last checked ' + formatFreshness(summary.trust.reconciled_at))
                  : 'Application usage has not been matched to a closed Google billing period'}
                status={summary.trust.reconciled_at ? 'Checked' : 'Not run'}
                tone={summary.trust.reconciled_at ? 'success' : 'warning'}
              />
            </div>

            <p className="border-t border-casa-divider pt-3 text-body-sm text-casa-text-secondary">
              {summary.trust.status === 'verified'
                ? 'This closed period passed application-to-provider and provider-to-billing reconciliation.'
                : 'Directional only — estimated AI cost is useful for trends, but it is not the Google bill.'}
            </p>
          </Card>

          <section aria-labelledby="cost-summary-heading">
            <h2 id="cost-summary-heading" className="text-subheading font-display text-content-heading mb-3">
              {timeframe === '24h' ? 'Past 24 Hours' : timeframe === '7d' ? 'Past 7 Days' : 'Last 30 Days'} Cumulative
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatCard
                label="Actual Google cost"
                value={formatActualCost(summary.billing.actual_cost_usd)}
                sub={summary.billing.finalized ? 'Finalized billing import' : 'No finalized billing import'}
                icon={<CircleDollarSign size={18} />}
              />
              <StatCard
                label="Estimated logged AI"
                value={formatEstimatedCost(summary.period.estimated_cost_usd)}
                sub="Application telemetry only"
                icon={<TrendingUp size={18} />}
              />
              <StatCard
                label="Provider-backed requests"
                value={formatNumber(summary.period.calls)}
                sub={formatNumber(summary.period.input_tokens + summary.period.output_tokens) + ' logged tokens'}
                icon={<BarChart3 size={18} />}
              />
            </div>
          </section>

          {/* Daily 7-day spend bars */}
          <section aria-labelledby="trend-heading">
            <h2 id="trend-heading" className="text-subheading font-display text-content-heading mb-3">
              Daily Spend (Past 7 Days)
            </h2>
            <Card>
              <div className="flex items-end gap-2 h-36" aria-hidden="true">
                {lastSevenDays.map((day) => (
                  <div key={day.date} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
                    <span className="text-caption text-casa-navy font-medium">{formatEstimatedCost(day.estimated_cost_usd)}</span>
                    <div
                      className="w-full max-w-10 rounded-sm bg-casa-navy/80"
                      style={{ height: Math.max(4, (day.estimated_cost_usd / maxDailyCost) * 88) + 'px' }}
                    />
                    <span className="text-caption text-casa-muted">
                      {new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </section>

          {llmConfig && (
            <section aria-labelledby="configuration-heading">
              <h2 id="configuration-heading" className="text-subheading font-display text-content-heading mb-3">
                Configuration
              </h2>
              <Card tone="subtle" padding="sm" className="flex items-center gap-3">
                <Bot size={18} className="text-casa-gold shrink-0" aria-hidden="true" />
                <p className="text-body-sm text-content-heading font-medium">
                  Current model: {llmConfig.provider} — {llmConfig.model}
                </p>
                <Link
                  to="/settings/ai"
                  className="ml-auto inline-flex min-h-control items-center text-body-sm font-semibold text-casa-gold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-casa-gold"
                >
                  Configure Routing
                </Link>
              </Card>
            </section>
          )}

          {/* Data details disclosure */}
          <Card padding="none" className="overflow-hidden">
            <DisclosureSection
              title="Data details"
              summary={summary.trust.provider_logged_paths + '/' + summary.trust.known_paths + ' current paths tracked · ' + summary.trust.logged_paths + '/' + summary.trust.known_paths + ' historical paths'}
              icon={<CircleDollarSign size={20} aria-hidden="true" />}
              className="border-b-0"
            >
              <div className="space-y-5">
                <Progress
                  value={summary.trust.provider_coverage_pct}
                  max={100}
                  label="Current tracking coverage"
                  showValue
                />
                <Progress
                  value={summary.trust.coverage_pct}
                  max={100}
                  label="Historical estimate coverage"
                  showValue
                />
                <div className="grid grid-cols-1 gap-3 text-body-sm text-casa-text-secondary sm:grid-cols-3">
                  <p>Application fresh<br /><strong className="text-content-heading">{formatFreshness(summary.trust.application_fresh_at)}</strong></p>
                  <p>Billing through<br /><strong className="text-content-heading">{formatFreshness(summary.trust.billing_fresh_through)}</strong></p>
                  <p>Unpriced calls<br /><strong className="text-content-heading">{formatNumber(summary.trust.unknown_pricing_calls)}</strong></p>
                </div>
                <p className="text-body-sm text-casa-text-secondary">
                  Imported Google billing line items are the exact source of truth. Live application cost is an estimate
                  from logged tokens and effective-date pricing; Google can apply cached-token rules, SKU classification,
                  credits, rounding, and delayed adjustments later.
                </p>
              </div>
            </DisclosureSection>
          </Card>

          <p className="text-caption text-casa-muted text-center pb-4">
            <RefreshCw size={14} className="inline mr-1" aria-hidden="true" />
            {lastRefresh ? ('Last refreshed ' + lastRefresh.toLocaleTimeString()) : 'Not refreshed'}
          </p>
        </div>
      )}
    </div>
  )
}
