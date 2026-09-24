import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Activity, Bug, CalendarClock, CheckCircle2, HeartPulse, Pause, Play, RefreshCw, Server, Zap } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { describeBreaker, type AiCircuitBreakerState } from '../lib/systemHealth.mjs'
import { Alert, Button, Card, Chip, EmptyState, IconButton, Progress, SkeletonRow } from '../components/ui'
import { SettingsPageHeader } from '../components/settings'

interface SystemAlertRow {
  id: string
  alert_key: string
  category: string
  severity: 'warning' | 'critical'
  title: string
  detail: string
  opened_at: string
  last_seen_at: string
  resolved_at: string | null
}

interface ClientErrorGroup {
  message: string
  source: string | null
  occurrences: number
  devices: number
  last_seen: string
  last_url: string | null
}

interface SystemHealthSummary {
  breaker: Required<Pick<AiCircuitBreakerState, 'daily_cost_cap_usd' | 'hourly_cost_cap_usd' | 'hourly_token_cap' | 'hourly_call_cap'>> & AiCircuitBreakerState
  spend: { hour_cost_usd: number; hour_tokens: number; hour_calls: number; day_cost_usd: number }
  last_check: {
    checked_at: string
    calendar_feed: { mean_ms: number | null; baseline_ms: number }
    background_calls: { total: number; errors: number; timeouts: number }
    client_errors_last_hour: number
  } | null
  open_alerts: SystemAlertRow[]
  recent_alerts: SystemAlertRow[]
  client_errors: { last_24h: number; last_7d: number; top: ClientErrorGroup[] }
}

const SUMMARY_KEY = ['system-health', 'summary'] as const

function ago(iso: string | null | undefined) {
  return iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : 'never'
}

function usd(value: number) {
  return `$${value.toFixed(value < 1 ? 3 : 2)}`
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-body font-bold text-casa-navy">
      <span className="text-casa-muted" aria-hidden="true">{icon}</span>
      {children}
    </h2>
  )
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-card border border-casa-border bg-casa-bg p-3">
      <p className="text-caption font-medium text-casa-muted">{label}</p>
      <p className="text-heading font-display leading-tight text-casa-navy">{value}</p>
      {sub && <p className="mt-0.5 text-caption text-casa-muted">{sub}</p>}
    </div>
  )
}

export default function SystemHealthPage() {
  const queryClient = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const { data, isPending, error, refetch, isFetching } = useQuery({
    queryKey: SUMMARY_KEY,
    queryFn: async (): Promise<SystemHealthSummary> => {
      const { data: summary, error: rpcError } = await supabase.rpc('get_system_health_summary')
      if (rpcError) throw rpcError
      return summary as SystemHealthSummary
    },
    refetchInterval: 60_000,
  })

  async function setBreaker(paused: boolean, scope: 'background' | 'all' = 'background') {
    setSaving(true)
    setActionError(null)
    const { error: rpcError } = await supabase.rpc('set_ai_circuit_breaker', { p_paused: paused, p_scope: scope })
    setSaving(false)
    if (rpcError) {
      setActionError(rpcError.message)
      return
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: SUMMARY_KEY }),
      queryClient.invalidateQueries({ queryKey: ['system-alerts'] }),
    ])
  }

  if (isPending) {
    return <div className="space-y-4"><SkeletonRow /><SkeletonRow /><SkeletonRow /></div>
  }

  if (error || !data) {
    return (
      <div className="space-y-5">
        <SettingsPageHeader icon={HeartPulse} title="System Health" description="Alerts, AI circuit breaker, and app error log" />
        <Alert tone="danger" title="System health could not be loaded">
          {error instanceof Error ? error.message : 'Unknown error'}
        </Alert>
      </div>
    )
  }

  const { breaker, spend, last_check: check, open_alerts: openAlerts, recent_alerts: recentAlerts, client_errors: clientErrors } = data
  const breakerInfo = describeBreaker(breaker)
  const feedMs = check?.calendar_feed.mean_ms ?? null

  return (
    <div className="space-y-5">
      <SettingsPageHeader
        icon={HeartPulse}
        title="System Health"
        description="Alerts, AI circuit breaker, and app error log. Checks run every 15 minutes."
        actions={
          <IconButton
            icon={<RefreshCw size={16} className={isFetching ? 'animate-spin' : undefined} />}
            aria-label="Refresh system health"
            variant="ghost"
            onClick={() => void refetch()}
          />
        }
      />

      {/* ── AI circuit breaker ─────────────────────────────────────── */}
      <Card padding="sm" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <SectionTitle icon={<Zap size={18} />}>AI circuit breaker</SectionTitle>
              <Chip size="sm" tone={breakerInfo.active ? (breakerInfo.auto ? 'danger' : 'warning') : 'success'}>
                {breakerInfo.active ? breakerInfo.headline : 'AI live'}
              </Chip>
            </div>
            <p className="mt-1 text-body-sm text-casa-text-secondary">
              {breakerInfo.active
                ? breakerInfo.detail
                : `Trips automatically if AI usage runs away. Limits: ${usd(breaker.hourly_cost_cap_usd)}/hour, ${usd(breaker.daily_cost_cap_usd)}/day, ${breaker.hourly_token_cap.toLocaleString()} tokens/hour, ${breaker.hourly_call_cap} calls/hour.`}
            </p>
            {breakerInfo.active && breaker.tripped_at && (
              <p className="mt-1 text-caption text-casa-muted">Paused {ago(breaker.tripped_at)}</p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {breakerInfo.active ? (
              <Button variant="strong" size="sm" leadingIcon={<Play size={14} />} loading={saving} onClick={() => void setBreaker(false)}>
                Resume AI
              </Button>
            ) : (
              <>
                <Button variant="secondary" size="sm" leadingIcon={<Pause size={14} />} disabled={saving} onClick={() => void setBreaker(true, 'background')}>
                  Pause background
                </Button>
                <Button variant="secondary" size="sm" leadingIcon={<Pause size={14} />} disabled={saving} onClick={() => void setBreaker(true, 'all')}>
                  Pause all AI
                </Button>
              </>
            )}
          </div>
        </div>
        {actionError && <Alert tone="danger" title="Could not change the breaker">{actionError}</Alert>}

        <div className="grid gap-3 sm:grid-cols-2">
          <Progress
            label={`Today: ${usd(spend.day_cost_usd)} of ${usd(breaker.daily_cost_cap_usd)}`}
            value={spend.day_cost_usd}
            max={breaker.daily_cost_cap_usd}
          />
          <Progress
            label={`Last hour: ${usd(spend.hour_cost_usd)} of ${usd(breaker.hourly_cost_cap_usd)}`}
            value={spend.hour_cost_usd}
            max={breaker.hourly_cost_cap_usd}
          />
          <Progress
            label={`Last hour: ${spend.hour_tokens.toLocaleString()} tokens`}
            value={spend.hour_tokens}
            max={breaker.hourly_token_cap}
          />
          <Progress
            label={`Last hour: ${spend.hour_calls} AI calls`}
            value={spend.hour_calls}
            max={breaker.hourly_call_cap}
          />
        </div>
      </Card>

      {/* ── Active alerts ──────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionTitle icon={<Activity size={18} />}>Active alerts</SectionTitle>
        {openAlerts.length === 0 ? (
          <EmptyState icon={<CheckCircle2 size={28} />} title="All clear" description={`Last checked ${ago(check?.checked_at)}.`} />
        ) : (
          openAlerts.map((alert) => (
            <Alert key={alert.id} tone={alert.severity === 'critical' ? 'danger' : 'warning'} title={alert.title}>
              <p>{alert.detail}</p>
              <p className="mt-1 text-caption text-casa-muted">Opened {ago(alert.opened_at)} · last seen {ago(alert.last_seen_at)}</p>
            </Alert>
          ))
        )}
      </section>

      {/* ── Health checks ──────────────────────────────────────────── */}
      <Card padding="sm" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <SectionTitle icon={<Server size={18} />}>Latest checks</SectionTitle>
          <span className="text-caption text-casa-muted">{ago(check?.checked_at)}</span>
        </div>
        {check ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric
              label="Calendar feed"
              value={feedMs === null ? 'n/a' : `${Math.round(feedMs)} ms`}
              sub={feedMs === null ? 'Not enough loads since the last check' : `Average per load · normal ~${check.calendar_feed.baseline_ms} ms`}
            />
            <Metric
              label="Background jobs (last hour)"
              value={`${check.background_calls.errors} errors`}
              sub={`${check.background_calls.total} calls · ${check.background_calls.timeouts} slow (over 10s, usually still finish)`}
            />
            <Metric
              label="App errors (last hour)"
              value={String(check.client_errors_last_hour)}
              sub="Crashes and unhandled errors on any device"
            />
          </div>
        ) : (
          <p className="text-body-sm text-casa-muted">No checks have run yet. The first one runs within 15 minutes.</p>
        )}
      </Card>

      {/* ── App error log ──────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <SectionTitle icon={<Bug size={18} />}>App error log</SectionTitle>
          <span className="text-caption text-casa-muted">{clientErrors.last_24h} in 24h · {clientErrors.last_7d} in 7 days</span>
        </div>
        {clientErrors.top.length === 0 ? (
          <EmptyState icon={<CheckCircle2 size={28} />} title="No app errors this week" />
        ) : (
          <Card padding="sm" className="divide-y divide-casa-border">
            {clientErrors.top.map((group) => (
              <div key={`${group.source}:${group.message}`} className="py-3 first:pt-0 last:pb-0">
                <p className="break-words font-mono text-body-sm text-casa-navy">{group.message}</p>
                <p className="mt-1 text-caption text-casa-muted">
                  {group.occurrences}× on {group.devices} device{group.devices === 1 ? '' : 's'} · last {ago(group.last_seen)}
                  {group.source ? ` · ${group.source}` : ''}
                  {group.last_url ? ` · ${group.last_url}` : ''}
                </p>
              </div>
            ))}
          </Card>
        )}
      </section>

      {/* ── Recently resolved ──────────────────────────────────────── */}
      {recentAlerts.length > 0 && (
        <section className="space-y-3">
          <SectionTitle icon={<CalendarClock size={18} />}>Resolved in the last 7 days</SectionTitle>
          <Card padding="sm" className="divide-y divide-casa-border">
            {recentAlerts.map((alert) => (
              <div key={alert.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-body-sm font-semibold text-casa-navy">{alert.title}</p>
                  <p className="text-caption text-casa-muted">{alert.detail}</p>
                </div>
                <span className="shrink-0 text-caption text-casa-muted">{ago(alert.opened_at)}</span>
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  )
}
