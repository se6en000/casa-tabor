import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { RefreshCw, Activity, AlertTriangle, CheckCircle2, Network, ListChecks } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { cn } from '../utils/cn'

type RunStatus = {
  ok: boolean
  error: string | null
  counts?: {
    nodes_upserted?: number | null
    edges_upserted?: number | null
    nodes_total?: number | null
    edges_total?: number | null
  } | null
}

type OrchestrationResponse = {
  ok: boolean
  runs?: {
    analyze_conflicts?: RunStatus
    analyze_prep?: RunStatus
    weather_pending?: RunStatus
    household_graph?: RunStatus
  }
  counts?: {
    conflicts?: number
    prep_items?: number
    action_queue?: number
    household_graph_nodes?: number | null
    household_graph_edges?: number | null
  }
}

function StatusPill({ label, ok }: { label: string; ok: boolean | undefined }) {
  const healthy = ok === true
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-medium',
        healthy ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-700',
      )}
    >
      {healthy ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
      {label}: {healthy ? 'OK' : 'Error'}
    </span>
  )
}

function ValueCard({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="bg-casa-surface rounded-card border border-casa-border p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <p className="text-caption text-casa-muted">{label}</p>
        <span className="text-casa-muted">{icon}</span>
      </div>
      <p className="font-display text-heading text-casa-navy mt-1">{value}</p>
    </div>
  )
}

export default function DataAnalyticsPage() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastRunAt, setLastRunAt] = useState<string | null>(null)
  const [graphLastSeenAt, setGraphLastSeenAt] = useState<string | null>(null)
  const [result, setResult] = useState<OrchestrationResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setRefreshing(true)
    setError(null)
    try {
      const [{ data, error: invokeError }, graphLastSeenRes] = await Promise.all([
        supabase.functions.invoke('orchestrate-household', { body: {} }),
        supabase
          .from('household_graph_edges')
          .select('last_seen_at')
          .order('last_seen_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      if (invokeError) throw invokeError
      setResult((data ?? null) as OrchestrationResponse | null)
      setLastRunAt(new Date().toISOString())
      setGraphLastSeenAt(graphLastSeenRes.data?.last_seen_at ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to refresh analytics')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => { void load() })
    return () => window.cancelAnimationFrame(raf)
  }, [])

  const moduleStatuses = useMemo(() => ([
    { label: 'Conflicts', ok: result?.runs?.analyze_conflicts?.ok },
    { label: 'Prep', ok: result?.runs?.analyze_prep?.ok },
    { label: 'Weather', ok: result?.runs?.weather_pending?.ok },
    { label: 'Graph', ok: result?.runs?.household_graph?.ok },
  ]), [result])

  const latestError = useMemo(() => {
    if (error) return error
    const runErrors = [
      result?.runs?.analyze_conflicts?.error,
      result?.runs?.analyze_prep?.error,
      result?.runs?.weather_pending?.error,
      result?.runs?.household_graph?.error,
    ].filter(Boolean) as string[]
    return runErrors[0] ?? null
  }, [result, error])

  if (loading) {
    return <div className="text-casa-muted animate-breathe">Loading analytics…</div>
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-display-md text-casa-navy mb-1">Data & Analytics</h1>
          <p className="text-body text-casa-muted">Household orchestration and graph health</p>
        </div>
        <button
          onClick={load}
          disabled={refreshing}
          className="p-2 rounded-button text-casa-muted hover:text-casa-navy hover:bg-casa-bg transition-colors disabled:opacity-60"
          title="Refresh analytics"
        >
          <RefreshCw size={16} className={cn(refreshing && 'animate-spin')} />
        </button>
      </div>

      <div className="bg-casa-bg/60 rounded-card border border-casa-border/50 p-4 space-y-3">
        <p className="text-caption font-semibold text-casa-muted uppercase tracking-wide">Module Health</p>
        <div className="flex flex-wrap gap-2">
          {moduleStatuses.map((m) => <StatusPill key={m.label} label={m.label} ok={m.ok} />)}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <ValueCard label="Conflicts" value={String(result?.counts?.conflicts ?? 0)} icon={<Activity size={16} />} />
        <ValueCard label="Prep Items" value={String(result?.counts?.prep_items ?? 0)} icon={<ListChecks size={16} />} />
        <ValueCard label="Action Queue" value={String(result?.counts?.action_queue ?? 0)} icon={<ListChecks size={16} />} />
        <ValueCard label="Graph Nodes" value={String(result?.counts?.household_graph_nodes ?? '—')} icon={<Network size={16} />} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-casa-surface rounded-card border border-casa-border p-4 shadow-card">
          <p className="text-caption text-casa-muted">Graph edges</p>
          <p className="font-display text-heading text-casa-navy">{String(result?.counts?.household_graph_edges ?? '—')}</p>
        </div>
        <div className="bg-casa-surface rounded-card border border-casa-border p-4 shadow-card">
          <p className="text-caption text-casa-muted">Graph last build</p>
          <p className="font-display text-heading text-casa-navy">
            {graphLastSeenAt ? new Date(graphLastSeenAt).toLocaleString() : 'No graph build yet'}
          </p>
        </div>
      </div>

      <div className="bg-casa-surface rounded-card border border-casa-border p-4 shadow-card">
        <p className="text-caption font-semibold text-casa-muted uppercase tracking-wide mb-2">Recent Error</p>
        <p className={cn('text-body-sm', latestError ? 'text-rose-700' : 'text-emerald-700')}>
          {latestError ?? 'No recent errors'}
        </p>
      </div>

      <p className="text-caption text-casa-muted text-center">
        Last orchestration run {lastRunAt ? new Date(lastRunAt).toLocaleTimeString() : '—'}
      </p>
    </div>
  )
}
