import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart3,
  Bot,
  CheckCircle2,
  CircleDashed,
  CircleDollarSign,
  Clock3,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  Alert,
  Button,
  Card,
  Chip,
  DisclosureSection,
  IconButton,
  Progress,
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
  by_function: Array<{
    function_name: string
    calls: number
    tokens: number
    estimated_cost_usd: number
  }>
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

function formatNumber(value: number) {
  return Number(value ?? 0).toLocaleString()
}

function formatEstimatedCost(value: number) {
  const amount = Number(value ?? 0)
  if (amount < 0.001) return '<$0.001'
  if (amount < 0.01) return `$${amount.toFixed(4)}`
  return `$${amount.toFixed(2)}`
}

function formatActualCost(value: number | null) {
  return value === null ? 'Not imported' : `$${Number(value).toFixed(2)}`
}

function formatFreshness(value: string | null) {
  if (!value) return 'No data'
  return new Date(value).toLocaleString()
}

function StatCard({ label, value, sub, icon }: StatCardProps) {
  return (
    <Card padding="sm" className="flex items-start gap-3">
      <span className="mt-0.5 shrink-0 text-casa-muted" aria-hidden="true">{icon}</span>
      <div className="min-w-0">
        <p className="text-caption text-casa-muted">{label}</p>
        <p className="text-heading font-display text-casa-navy leading-tight">{value}</p>
        <p className="text-caption text-casa-muted mt-0.5">{sub}</p>
      </div>
    </Card>
  )
}

function TodayMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-body-sm text-casa-text-secondary">{label}</p>
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

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const periodEnd = new Date()
    const periodStart = new Date(periodEnd.getTime() - 30 * 24 * 60 * 60 * 1000)
    const [summaryRes, cfgRes] = await Promise.all([
      supabase.rpc('get_cost_dashboard_summary', {
        p_start: periodStart.toISOString(),
        p_end: periodEnd.toISOString(),
      }),
      supabase.from('settings').select('value').eq('key', 'llm_config').single(),
    ])

    if (summaryRes.error) {
      setSummary(null)
      setError(`The cost summary could not be loaded: ${summaryRes.error.message}`)
    } else {
      setSummary(summaryRes.data as DashboardSummary)
    }
    if (cfgRes.data?.value) {
      setLlmConfig(cfgRes.data.value as { provider: string; model: string })
    }
    setLastRefresh(new Date())
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const lastSevenDays = useMemo(() => summary?.daily.slice(-7) ?? [], [summary])
  const maxDailyCost = Math.max(...lastSevenDays.map((day) => day.estimated_cost_usd), 0.001)
  const maxFunctionCost = Math.max(...(summary?.by_function.map((item) => item.estimated_cost_usd) ?? []), 0.001)

  if (loading && !summary) {
    return <div className="space-y-4"><SkeletonRow /><SkeletonRow /><SkeletonRow /></div>
  }

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <SettingsPageHeader
          title="Cost & Usage"
          description="Google billing, AI usage, coverage, and reconciliation"
        />
        <IconButton
          icon={<RefreshCw size={18} className={loading ? 'animate-spin motion-reduce:animate-none' : ''} />}
          aria-label="Refresh cost and usage dashboard"
          onClick={() => void load()}
          variant="ghost"
          disabled={loading}
        />
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

      {summary && (
        <div className="space-y-3">
          <section aria-labelledby="today-heading">
            <h2 id="today-heading" className="text-subheading font-display text-content-heading mb-3">
              Today
            </h2>
            <Card tone="accent" className="grid grid-cols-2 gap-x-5 gap-y-5 lg:grid-cols-4">
              <TodayMetric
                label="Provider-backed requests"
                value={formatNumber(summary.today.calls)}
              />
              <TodayMetric
                label="Input / output tokens"
                value={`${formatNumber(summary.today.input_tokens)} / ${formatNumber(summary.today.output_tokens)}`}
              />
              <TodayMetric
                label="Prompt tokens reused"
                value={formatNumber(summary.today.cached_input_tokens)}
              />
              <TodayMetric
                label="Estimated AI cost"
                value={formatEstimatedCost(summary.today.estimated_cost_usd)}
              />
            </Card>
          </section>

          <Card padding="sm" aria-labelledby="billing-confidence-heading">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-casa-divider pb-3">
              <div className="flex items-center gap-3">
                {summary.trust.status === 'verified'
                  ? <ShieldCheck size={22} className="text-casa-success-strong" aria-hidden="true" />
                  : <ShieldAlert size={22} className="text-casa-warning" aria-hidden="true" />}
                <div>
                  <h2 id="billing-confidence-heading" className="text-body font-bold text-content-heading">
                    Billing confidence
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
                detail={`${summary.trust.provider_logged_paths} of ${summary.trust.known_paths} current AI paths`}
                status={summary.trust.provider_coverage_pct === 100 ? 'Complete' : 'Incomplete'}
                tone={summary.trust.provider_coverage_pct === 100 ? 'success' : 'warning'}
              />
              <TrustGate
                icon={summary.billing.line_count > 0 ? <CheckCircle2 size={20} /> : <Clock3 size={20} />}
                label="Google billing"
                detail={summary.billing.line_count > 0
                  ? `Imported through ${formatFreshness(summary.billing.latest_usage_date)}`
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
                  ? `Last checked ${formatFreshness(summary.trust.reconciled_at)}`
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
              Last 30 days
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
                sub={`${formatNumber(summary.period.input_tokens + summary.period.output_tokens)} logged tokens`}
                icon={<BarChart3 size={18} />}
              />
            </div>
          </section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <section aria-labelledby="trend-heading">
              <h2 id="trend-heading" className="text-subheading font-display text-content-heading mb-3">
                <BarChart3 size={14} className="inline mr-1.5" aria-hidden="true" />
                Estimated spend by day
              </h2>
              <Card>
                <div className="flex items-end gap-2 h-36" aria-hidden="true">
                  {lastSevenDays.map((day) => (
                    <div key={day.date} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
                      <span className="text-caption text-casa-navy font-medium">{formatEstimatedCost(day.estimated_cost_usd)}</span>
                      <div
                        className="w-full max-w-10 rounded-sm bg-casa-navy/70"
                        style={{ height: `${Math.max(4, (day.estimated_cost_usd / maxDailyCost) * 88)}px` }}
                      />
                      <span className="text-caption text-casa-muted">
                        {new Date(`${day.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' })}
                      </span>
                    </div>
                  ))}
                </div>
                <table className="sr-only">
                  <caption>Estimated AI spend by day for the last seven days</caption>
                  <thead><tr><th>Date</th><th>Estimated cost</th><th>Calls</th><th>Tokens</th></tr></thead>
                  <tbody>
                    {lastSevenDays.map((day) => (
                      <tr key={day.date}>
                        <td>{day.date}</td>
                        <td>{formatEstimatedCost(day.estimated_cost_usd)}</td>
                        <td>{day.calls}</td>
                        <td>{day.tokens}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </section>

            <section aria-labelledby="function-heading">
              <h2 id="function-heading" className="text-subheading font-display text-content-heading mb-3">
                Cost drivers
              </h2>
              {summary.by_function.length > 0 ? (
                <Card padding="none" className="overflow-hidden">
                  <div className="divide-y divide-casa-border">
                    {summary.by_function.map((item) => (
                      <div key={item.function_name} className="px-4 py-3">
                        <div className="flex items-center justify-between gap-4">
                          <div className="min-w-0">
                            <p className="text-body-sm font-semibold text-content-heading">{item.function_name}</p>
                            <p className="text-caption text-casa-text-secondary">
                              {formatNumber(item.calls)} calls · {formatNumber(item.tokens)} tokens
                            </p>
                          </div>
                          <p className="shrink-0 text-body-sm font-semibold text-content-heading">
                            {formatEstimatedCost(item.estimated_cost_usd)}
                          </p>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-pill bg-surface-inset" aria-hidden="true">
                          <div
                            className="h-full rounded-pill bg-casa-navy/70"
                            style={{ width: `${Math.max(2, (item.estimated_cost_usd / maxFunctionCost) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              ) : (
                <Alert tone="info" title="No logged AI usage in this period">
                  This is not proof that no provider calls occurred while historical telemetry coverage is incomplete.
                </Alert>
              )}
            </section>
          </div>

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
                  Change
                </Link>
              </Card>
            </section>
          )}

          <Card padding="none" className="overflow-hidden">
            <DisclosureSection
              title="Data details"
              summary={`${summary.trust.provider_logged_paths}/${summary.trust.known_paths} current paths tracked · ${summary.trust.logged_paths}/${summary.trust.known_paths} historical paths`}
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
            {lastRefresh ? `Last refreshed ${lastRefresh.toLocaleTimeString()}` : 'Not refreshed'}
          </p>
        </div>
      )}
    </>
  )
}
