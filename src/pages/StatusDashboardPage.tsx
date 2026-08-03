import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  BarChart3,
  Bot,
  CircleDollarSign,
  Database,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  Alert,
  Button,
  Card,
  Chip,
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
  icon: React.ReactNode
}

const trustCopy: Record<TrustStatus, { label: string; tone: 'success' | 'info' | 'warning' | 'danger' }> = {
  verified: { label: 'Verified', tone: 'success' },
  provisional: { label: 'Provisional', tone: 'info' },
  incomplete: { label: 'Incomplete', tone: 'warning' },
  stale: { label: 'Stale', tone: 'warning' },
  error: { label: 'Error', tone: 'danger' },
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
  const maxCalls = Math.max(...lastSevenDays.map((day) => day.calls), 1)

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
          icon={<RefreshCw size={18} />}
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
        <>
          <Alert
            tone={trustCopy[summary.trust.status].tone}
            title={
              <span className="inline-flex flex-wrap items-center gap-2">
                <span>Billing decision status</span>
                <Chip tone={trustCopy[summary.trust.status].tone}>
                  {trustCopy[summary.trust.status].label}
                </Chip>
              </span>
            }
          >
            {summary.trust.status === 'verified'
              ? 'This closed period passed application-to-provider and provider-to-billing reconciliation.'
              : 'Directional only — do not use the estimated total as the Google bill. Exact cost appears only after Google billing data is imported and reconciled.'}
          </Alert>

          <Card tone="subtle" padding="sm" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Database size={18} className="text-casa-muted" aria-hidden="true" />
                <p className="text-body-sm font-semibold text-casa-navy">Displayed historical coverage</p>
              </div>
              <p className="text-body-sm font-semibold text-casa-navy">
                {summary.trust.logged_paths} of {summary.trust.known_paths} AI paths
              </p>
            </div>
            <Progress
              value={summary.trust.coverage_pct}
              max={100}
              label="Instrumented AI call-path coverage"
              showValue
            />
            <p className="text-caption text-casa-muted">
              New per-provider ledger: <strong className="text-casa-navy">
                {summary.trust.provider_logged_paths} of {summary.trust.known_paths} paths instrumented
              </strong>. It will replace the incomplete historical log after enough live validation.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-caption text-casa-muted">
              <p>Application fresh: <strong className="text-casa-navy">{formatFreshness(summary.trust.application_fresh_at)}</strong></p>
              <p>Billing through: <strong className="text-casa-navy">{formatFreshness(summary.trust.billing_fresh_through)}</strong></p>
              <p>Unpriced calls: <strong className="text-casa-navy">{formatNumber(summary.trust.unknown_pricing_calls)}</strong></p>
            </div>
          </Card>

          {llmConfig && (
            <Card tone="subtle" padding="sm" className="flex items-center gap-3">
              <Bot size={18} className="text-casa-gold shrink-0" aria-hidden="true" />
              <p className="text-body-sm text-casa-navy font-medium">
                Current model: {llmConfig.provider} — {llmConfig.model}
              </p>
              <Link to="/settings/ai" className="ml-auto text-body-sm text-casa-gold underline-offset-4 hover:underline">
                Change
              </Link>
            </Card>
          )}

          <section aria-labelledby="cost-summary-heading">
            <h2 id="cost-summary-heading" className="text-caption font-semibold text-casa-muted uppercase tracking-wide mb-3">
              Last 30 days
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
                label="Logged AI calls"
                value={formatNumber(summary.period.calls)}
                sub={`${formatNumber(summary.period.deduplicated_calls)} Application calls deduplicated`}
                icon={<Activity size={18} />}
              />
              <StatCard
                label="Logged tokens"
                value={formatNumber(summary.period.input_tokens + summary.period.output_tokens)}
                sub={`${formatNumber(summary.period.input_tokens)} in / ${formatNumber(summary.period.output_tokens)} out`}
                icon={<Zap size={18} />}
              />
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section aria-labelledby="today-heading">
              <h2 id="today-heading" className="text-caption font-semibold text-casa-muted uppercase tracking-wide mb-3">
                Today
              </h2>
              <Card className="space-y-3">
                <div className="flex justify-between gap-4 text-body-sm">
                  <span className="text-casa-muted">Logged provider-backed requests</span>
                  <strong className="text-casa-navy">{formatNumber(summary.today.calls)}</strong>
                </div>
                <div className="flex justify-between gap-4 text-body-sm">
                  <span className="text-casa-muted">Input / output tokens</span>
                  <strong className="text-casa-navy">
                    {formatNumber(summary.today.input_tokens)} / {formatNumber(summary.today.output_tokens)}
                  </strong>
                </div>
                <div className="flex justify-between gap-4 text-body-sm">
                  <span className="text-casa-muted">Gemini prompt tokens reused</span>
                  <strong className="text-casa-navy">{formatNumber(summary.today.cached_input_tokens)}</strong>
                </div>
                <div className="flex justify-between gap-4 text-body-sm">
                  <span className="text-casa-muted">Estimated logged AI cost</span>
                  <strong className="text-casa-navy">{formatEstimatedCost(summary.today.estimated_cost_usd)}</strong>
                </div>
              </Card>
            </section>

            <section aria-labelledby="trend-heading">
              <h2 id="trend-heading" className="text-caption font-semibold text-casa-muted uppercase tracking-wide mb-3">
                <BarChart3 size={14} className="inline mr-1.5" aria-hidden="true" />
                Calls by day
              </h2>
              <Card>
                <div className="flex items-end gap-2 h-36" aria-hidden="true">
                  {lastSevenDays.map((day) => (
                    <div key={day.date} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
                      <span className="text-caption text-casa-navy font-medium">{formatNumber(day.calls)}</span>
                      <div
                        className="w-full max-w-10 rounded-sm bg-casa-navy/25"
                        style={{ height: `${Math.max(4, (day.calls / maxCalls) * 88)}px` }}
                      />
                      <span className="text-caption text-casa-muted">
                        {new Date(`${day.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' })}
                      </span>
                    </div>
                  ))}
                </div>
                <table className="sr-only">
                  <caption>Logged AI calls by day for the last seven days</caption>
                  <thead><tr><th>Date</th><th>Calls</th><th>Tokens</th></tr></thead>
                  <tbody>
                    {lastSevenDays.map((day) => (
                      <tr key={day.date}>
                        <td>{day.date}</td>
                        <td>{day.calls}</td>
                        <td>{day.tokens}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </section>
          </div>

          <section aria-labelledby="function-heading">
            <h2 id="function-heading" className="text-caption font-semibold text-casa-muted uppercase tracking-wide mb-3">
              Logged cost by function
            </h2>
            {summary.by_function.length > 0 ? (
              <Card padding="none" className="overflow-hidden">
                <div className="divide-y divide-casa-border">
                  {summary.by_function.map((item) => (
                    <div key={item.function_name} className="flex items-center justify-between gap-4 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-body-sm font-medium text-casa-navy">{item.function_name}</p>
                        <p className="text-caption text-casa-muted">{formatNumber(item.tokens)} tokens</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-body-sm font-semibold text-casa-navy">{formatNumber(item.calls)} calls</p>
                        <p className="text-caption text-casa-muted">{formatEstimatedCost(item.estimated_cost_usd)} estimated</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ) : (
              <Alert tone="info" title="No logged AI usage in this period">
                This is not proof that no provider calls occurred while telemetry coverage is incomplete.
              </Alert>
            )}
          </section>

          <Alert tone="info" title="What is exact and what is estimated">
            <p>
              Imported Google billing line items are shown to the cent and remain the source of truth.
              Live application cost is an estimate from logged tokens and effective-date pricing; Google can
              apply cached-token rules, SKU classification, credits, rounding, and delayed adjustments later.
            </p>
          </Alert>

          <p className="text-caption text-casa-muted text-center pb-4">
            <ShieldAlert size={14} className="inline mr-1" aria-hidden="true" />
            {lastRefresh ? `Last refreshed ${lastRefresh.toLocaleTimeString()}` : 'Not refreshed'}
          </p>
        </>
      )}
    </>
  )
}
