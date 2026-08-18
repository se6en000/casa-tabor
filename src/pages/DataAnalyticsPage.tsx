import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Network,
  ListChecks,
  Calendar,
  CloudSun,
  Share2,
  RefreshCw,
  ArrowRight,
  Users,
  MapPin,
  UserCheck,
  Repeat,
  CalendarDays,
  Clock,
  ChevronDown,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { cn } from '../utils/cn'
import { Alert, Button, Card, Chip, IconButton, SkeletonRow } from '../components/ui'
import { SettingsPageHeader } from '../components/settings'

type SubEngineKey = 'analyze_conflicts' | 'analyze_prep' | 'weather_pending' | 'household_graph'

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
    relevance_feedback_30d?: number
    suppressed_patterns?: number
    household_graph_nodes?: number | null
    household_graph_edges?: number | null
  }
}

type TelemetryCounts = {
  conflicts: number
  prepItems: number
  actionQueue: number
  downvotes30d: number
  suppressedPatterns: number
  graphNodes: number
  graphEdges: number
  graphLastSeenAt: string | null
  nodeTypeBreakdown: {
    member: number
    place: number
    contact: number
    event: number
    routine: number
  }
}

const INITIAL_COUNTS: TelemetryCounts = {
  conflicts: 0,
  prepItems: 0,
  actionQueue: 0,
  downvotes30d: 0,
  suppressedPatterns: 0,
  graphNodes: 0,
  graphEdges: 0,
  graphLastSeenAt: null,
  nodeTypeBreakdown: {
    member: 0,
    place: 0,
    contact: 0,
    event: 0,
    routine: 0,
  },
}

type FeedbackItem = {
  id: string
  created_at: string
  rule_id: string | null
  source_pattern_key: string | null
  reason: string | null
}

type SuppressionItem = {
  id: string
  pattern_label: string | null
  hard_suppressed: boolean
  strength: number
}

function formatRelativeTime(dateIso: string | null): string {
  if (!dateIso) return 'No sync recorded'
  const date = new Date(dateIso)
  const diffMs = Date.now() - date.getTime()
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  if (diffMinutes < 1) return 'Just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

export default function DataAnalyticsPage() {
  const navigate = useNavigate()
  const [initialLoading, setInitialLoading] = useState(true)
  const [runningPipeline, setRunningPipeline] = useState(false)
  const [testingSubEngine, setTestingSubEngine] = useState<SubEngineKey | null>(null)
  const [lastRunAt, setLastRunAt] = useState<string | null>(null)
  const [runDurationMs, setRunDurationMs] = useState<number | null>(null)
  const [telemetry, setTelemetry] = useState<TelemetryCounts>(INITIAL_COUNTS)
  const [pipelineError, setPipelineError] = useState<string | null>(null)

  // Granular sub-engine states
  const [subEngineStatuses, setSubEngineStatuses] = useState<
    Record<SubEngineKey, { tested: boolean; ok: boolean; error: string | null; lastTestedAt?: string }>
  >({
    analyze_conflicts: { tested: false, ok: true, error: null },
    analyze_prep: { tested: false, ok: true, error: null },
    weather_pending: { tested: false, ok: true, error: null },
    household_graph: { tested: false, ok: true, error: null },
  })

  // Disclosure drawers
  const [showRlhfDetails, setShowRlhfDetails] = useState(false)
  const [feedbackRows, setFeedbackRows] = useState<FeedbackItem[]>([])
  const [suppressionRows, setSuppressionRows] = useState<SuppressionItem[]>([])
  const [rlhfLoading, setRlhfLoading] = useState(false)

  // ── Instant Telemetry Load (Direct DB Queries) ───────────────────────────
  const loadDatabaseTelemetry = useCallback(async () => {
    try {
      const now = new Date()
      const nowIso = now.toISOString()
      const feedbackWindowStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

      const [
        conflictsRes,
        prepRes,
        feedbackRes,
        suppressionsRes,
        graphEdgesRes,
        graphLastSeenRes,
        graphNodesRes,
        memberNodesRes,
        placeNodesRes,
        contactNodesRes,
        routineNodesRes,
        eventNodesRes,
      ] = await Promise.all([
        supabase
          .from('conflicts')
          .select('id', { count: 'exact', head: true })
          .eq('resolved', false)
          .or(`snoozed_until.is.null,snoozed_until.lte.${nowIso}`),
        supabase
          .from('prep_items')
          .select('id', { count: 'exact', head: true })
          .eq('dismissed', false)
          .or(`snoozed_until.is.null,snoozed_until.lte.${nowIso}`),
        supabase
          .from('prep_item_feedback')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', feedbackWindowStart),
        supabase
          .from('prep_item_suppressions')
          .select('id, hard_suppressed, strength'),
        supabase
          .from('household_graph_edges')
          .select('id', { count: 'exact', head: true }),
        supabase
          .from('household_graph_edges')
          .select('last_seen_at')
          .order('last_seen_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('household_graph_nodes')
          .select('id', { count: 'exact', head: true }),
        supabase
          .from('household_graph_nodes')
          .select('id', { count: 'exact', head: true })
          .eq('node_type', 'member'),
        supabase
          .from('household_graph_nodes')
          .select('id', { count: 'exact', head: true })
          .eq('node_type', 'place'),
        supabase
          .from('household_graph_nodes')
          .select('id', { count: 'exact', head: true })
          .eq('node_type', 'contact'),
        supabase
          .from('household_graph_nodes')
          .select('id', { count: 'exact', head: true })
          .eq('node_type', 'routine'),
        supabase
          .from('household_graph_nodes')
          .select('id', { count: 'exact', head: true })
          .eq('node_type', 'event'),
      ])

      const breakdown = {
        member: memberNodesRes.count ?? 0,
        place: placeNodesRes.count ?? 0,
        contact: contactNodesRes.count ?? 0,
        event: eventNodesRes.count ?? 0,
        routine: routineNodesRes.count ?? 0,
      }

      const activeSuppressed = (suppressionsRes.data ?? []).filter(
        (r) => r.hard_suppressed || (r.strength ?? 0) >= 2,
      ).length

      const conflictsCount = conflictsRes.count ?? 0
      const prepCount = prepRes.count ?? 0
      const estimatedActionQueue = conflictsCount + prepCount

      setTelemetry({
        conflicts: conflictsCount,
        prepItems: prepCount,
        actionQueue: estimatedActionQueue,
        downvotes30d: feedbackRes.count ?? 0,
        suppressedPatterns: activeSuppressed,
        graphNodes: graphNodesRes.count ?? 0,
        graphEdges: graphEdgesRes.count ?? 0,
        graphLastSeenAt: graphLastSeenRes.data?.last_seen_at ?? null,
        nodeTypeBreakdown: breakdown,
      })
    } catch (err) {
      console.error('Failed to load DB telemetry:', err)
    } finally {
      setInitialLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDatabaseTelemetry()
  }, [loadDatabaseTelemetry])

  // ── Run Full Orchestration Pipeline ──────────────────────────────────────
  const runFullPipeline = useCallback(async () => {
    setRunningPipeline(true)
    setPipelineError(null)
    const startTime = performance.now()

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('orchestrate-household', {
        body: {},
      })

      const elapsed = Math.round(performance.now() - startTime)
      setRunDurationMs(elapsed)
      setLastRunAt(new Date().toISOString())

      if (invokeError) throw invokeError

      const response = data as OrchestrationResponse

      // Update sub-engine statuses
      if (response.runs) {
        setSubEngineStatuses({
          analyze_conflicts: {
            tested: true,
            ok: response.runs.analyze_conflicts?.ok ?? true,
            error: response.runs.analyze_conflicts?.error ?? null,
            lastTestedAt: new Date().toISOString(),
          },
          analyze_prep: {
            tested: true,
            ok: response.runs.analyze_prep?.ok ?? true,
            error: response.runs.analyze_prep?.error ?? null,
            lastTestedAt: new Date().toISOString(),
          },
          weather_pending: {
            tested: true,
            ok: response.runs.weather_pending?.ok ?? true,
            error: response.runs.weather_pending?.error ?? null,
            lastTestedAt: new Date().toISOString(),
          },
          household_graph: {
            tested: true,
            ok: response.runs.household_graph?.ok ?? true,
            error: response.runs.household_graph?.error ?? null,
            lastTestedAt: new Date().toISOString(),
          },
        })
      }

      // Refresh DB counts after orchestration writes
      await loadDatabaseTelemetry()
    } catch (e) {
      setPipelineError(e instanceof Error ? e.message : 'Orchestration pipeline invocation failed')
    } finally {
      setRunningPipeline(false)
    }
  }, [loadDatabaseTelemetry])

  // ── Run Isolated Sub-Engine Test ─────────────────────────────────────────
  const runSubEngineTest = useCallback(
    async (key: SubEngineKey) => {
      setTestingSubEngine(key)
      const functionNameMap: Record<SubEngineKey, string> = {
        analyze_conflicts: 'analyze-conflicts',
        analyze_prep: 'analyze-prep',
        weather_pending: 'weather-pending',
        household_graph: 'build-household-graph',
      }

      try {
        const { data, error: invokeError } = await supabase.functions.invoke(functionNameMap[key], {
          body: {},
        })

        const isOk = !invokeError && (data ? data.ok !== false : true)
        const errorMsg = invokeError?.message ?? (data?.ok === false ? data.error : null)

        setSubEngineStatuses((prev) => ({
          ...prev,
          [key]: {
            tested: true,
            ok: isOk,
            error: errorMsg,
            lastTestedAt: new Date().toISOString(),
          },
        }))

        await loadDatabaseTelemetry()
      } catch (err) {
        setSubEngineStatuses((prev) => ({
          ...prev,
          [key]: {
            tested: true,
            ok: false,
            error: err instanceof Error ? err.message : 'Execution failed',
            lastTestedAt: new Date().toISOString(),
          },
        }))
      } finally {
        setTestingSubEngine(null)
      }
    },
    [loadDatabaseTelemetry],
  )

  // ── Load RLHF Details on Demand ──────────────────────────────────────────
  const toggleRlhfDetails = useCallback(async () => {
    const nextState = !showRlhfDetails
    setShowRlhfDetails(nextState)
    if (nextState && feedbackRows.length === 0 && suppressionRows.length === 0) {
      setRlhfLoading(true)
      try {
        const [fb, sp] = await Promise.all([
          supabase
            .from('prep_item_feedback')
            .select('id, created_at, rule_id, source_pattern_key, reason')
            .order('created_at', { ascending: false })
            .limit(10),
          supabase
            .from('prep_item_suppressions')
            .select('id, pattern_label, hard_suppressed, strength')
            .order('strength', { ascending: false })
            .limit(10),
        ])
        setFeedbackRows((fb.data ?? []) as FeedbackItem[])
        setSuppressionRows((sp.data ?? []) as SuppressionItem[])
      } catch (e) {
        console.error('Failed to load RLHF details:', e)
      } finally {
        setRlhfLoading(false)
      }
    }
  }, [showRlhfDetails, feedbackRows.length, suppressionRows.length])

  // Identify any active failure
  const activeError = useMemo(() => {
    if (pipelineError) return { title: 'Pipeline Invocation Error', message: pipelineError }
    for (const [key, status] of Object.entries(subEngineStatuses)) {
      if (status.tested && !status.ok && status.error) {
        const names: Record<string, string> = {
          analyze_conflicts: 'Conflict Engine',
          analyze_prep: 'Prep Assistant',
          weather_pending: 'Weather Monitor',
          household_graph: 'Knowledge Graph',
        }
        return {
          title: `${names[key] ?? key} Failed`,
          message: status.error,
          moduleKey: key as SubEngineKey,
        }
      }
    }
    return null
  }, [pipelineError, subEngineStatuses])

  if (initialLoading) {
    return (
      <div className="space-y-4">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <SettingsPageHeader
          title="Orchestration & Graph Health"
          description="Household orchestration pipeline and semantic graph health"
        />
        <div className="flex items-center gap-3 self-start sm:self-auto">
          {lastRunAt && (
            <span className="text-caption text-casa-muted hidden md:inline-block">
              Ran {formatRelativeTime(lastRunAt)}
              {runDurationMs !== null && ` (${runDurationMs}ms)`}
            </span>
          )}
          <Button
            variant="primary"
            size="md"
            leadingIcon={<RefreshCw size={16} className={cn(runningPipeline && 'animate-spin')} />}
            onClick={runFullPipeline}
            disabled={runningPipeline}
            className="min-h-[48px] px-4 font-semibold"
          >
            {runningPipeline ? 'Running Pipeline...' : 'Run Full Pipeline'}
          </Button>
        </div>
      </div>

      {/* ── Active Error Alert (if present) ─────────────────────────────────── */}
      {activeError && (
        <Alert
          tone="danger"
          title={activeError.title}
          className="border-rose-300 bg-rose-50/80 text-rose-900"
        >
          <div className="space-y-2 mt-1">
            <p className="font-mono text-caption text-rose-800 break-all">{activeError.message}</p>
            <div className="flex items-center gap-3 pt-1">
              {activeError.moduleKey && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => runSubEngineTest(activeError.moduleKey!)}
                  disabled={testingSubEngine === activeError.moduleKey}
                  leadingIcon={
                    <RefreshCw
                      size={14}
                      className={cn(testingSubEngine === activeError.moduleKey && 'animate-spin')}
                    />
                  }
                  className="min-h-[36px] text-rose-800 border-rose-300 hover:bg-rose-100"
                >
                  Retry {activeError.title.replace(' Failed', '')}
                </Button>
              )}
              <span className="text-caption text-rose-700">
                Check Supabase Edge Function logs or model API quota.
              </span>
            </div>
          </div>
        </Alert>
      )}

      {/* ── Module Health (4 Sub-Engines) ───────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-caption font-bold text-casa-muted uppercase tracking-wider">
            Sub-Engine Telemetry
          </p>
          <span className="text-2xs text-casa-muted">Click individual refresh to test in isolation</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* 1. Conflict Engine */}
          <Card className="p-4 flex flex-col justify-between space-y-3 border-casa-border hover:border-casa-border/80 transition-colors">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Calendar size={18} className="text-casa-gold shrink-0" />
                <div>
                  <p className="text-body-sm font-semibold text-casa-navy">Conflict Engine</p>
                  <p className="text-2xs text-casa-muted">Double-bookings & overlaps</p>
                </div>
              </div>
              <IconButton
                size="sm"
                variant="ghost"
                aria-label="Test Conflict Engine"
                icon={
                  <RefreshCw
                    size={14}
                    className={cn(testingSubEngine === 'analyze_conflicts' && 'animate-spin')}
                  />
                }
                onClick={() => runSubEngineTest('analyze_conflicts')}
                disabled={testingSubEngine === 'analyze_conflicts'}
              />
            </div>
            <div className="flex items-center justify-between pt-1">
              <Chip
                tone={
                  !subEngineStatuses.analyze_conflicts.tested
                    ? 'neutral'
                    : subEngineStatuses.analyze_conflicts.ok
                      ? 'success'
                      : 'danger'
                }
                size="sm"
                icon={
                  !subEngineStatuses.analyze_conflicts.tested ? (
                    <Clock size={12} />
                  ) : subEngineStatuses.analyze_conflicts.ok ? (
                    <CheckCircle2 size={12} />
                  ) : (
                    <AlertTriangle size={12} />
                  )
                }
              >
                {!subEngineStatuses.analyze_conflicts.tested
                  ? 'Idle'
                  : subEngineStatuses.analyze_conflicts.ok
                    ? 'Healthy'
                    : 'Error'}
              </Chip>
              <span className="text-2xs text-casa-muted">
                {subEngineStatuses.analyze_conflicts.lastTestedAt
                  ? formatRelativeTime(subEngineStatuses.analyze_conflicts.lastTestedAt)
                  : 'Ready'}
              </span>
            </div>
          </Card>

          {/* 2. Prep Assistant */}
          <Card className="p-4 flex flex-col justify-between space-y-3 border-casa-border hover:border-casa-border/80 transition-colors">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <ListChecks size={18} className="text-casa-gold shrink-0" />
                <div>
                  <p className="text-body-sm font-semibold text-casa-navy">Prep Assistant</p>
                  <p className="text-2xs text-casa-muted">Gear, reminders & snacks</p>
                </div>
              </div>
              <IconButton
                size="sm"
                variant="ghost"
                aria-label="Test Prep Assistant"
                icon={
                  <RefreshCw
                    size={14}
                    className={cn(testingSubEngine === 'analyze_prep' && 'animate-spin')}
                  />
                }
                onClick={() => runSubEngineTest('analyze_prep')}
                disabled={testingSubEngine === 'analyze_prep'}
              />
            </div>
            <div className="flex items-center justify-between pt-1">
              <Chip
                tone={
                  !subEngineStatuses.analyze_prep.tested
                    ? 'neutral'
                    : subEngineStatuses.analyze_prep.ok
                      ? 'success'
                      : 'danger'
                }
                size="sm"
                icon={
                  !subEngineStatuses.analyze_prep.tested ? (
                    <Clock size={12} />
                  ) : subEngineStatuses.analyze_prep.ok ? (
                    <CheckCircle2 size={12} />
                  ) : (
                    <AlertTriangle size={12} />
                  )
                }
              >
                {!subEngineStatuses.analyze_prep.tested
                  ? 'Idle'
                  : subEngineStatuses.analyze_prep.ok
                    ? 'Healthy'
                    : 'Error'}
              </Chip>
              <span className="text-2xs text-casa-muted">
                {subEngineStatuses.analyze_prep.lastTestedAt
                  ? formatRelativeTime(subEngineStatuses.analyze_prep.lastTestedAt)
                  : 'Ready'}
              </span>
            </div>
          </Card>

          {/* 3. Weather Monitor */}
          <Card className="p-4 flex flex-col justify-between space-y-3 border-casa-border hover:border-casa-border/80 transition-colors">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <CloudSun size={18} className="text-casa-gold shrink-0" />
                <div>
                  <p className="text-body-sm font-semibold text-casa-navy">Weather Monitor</p>
                  <p className="text-2xs text-casa-muted">Forecasts & rain risk</p>
                </div>
              </div>
              <IconButton
                size="sm"
                variant="ghost"
                aria-label="Test Weather Monitor"
                icon={
                  <RefreshCw
                    size={14}
                    className={cn(testingSubEngine === 'weather_pending' && 'animate-spin')}
                  />
                }
                onClick={() => runSubEngineTest('weather_pending')}
                disabled={testingSubEngine === 'weather_pending'}
              />
            </div>
            <div className="flex items-center justify-between pt-1">
              <Chip
                tone={
                  !subEngineStatuses.weather_pending.tested
                    ? 'neutral'
                    : subEngineStatuses.weather_pending.ok
                      ? 'success'
                      : 'danger'
                }
                size="sm"
                icon={
                  !subEngineStatuses.weather_pending.tested ? (
                    <Clock size={12} />
                  ) : subEngineStatuses.weather_pending.ok ? (
                    <CheckCircle2 size={12} />
                  ) : (
                    <AlertTriangle size={12} />
                  )
                }
              >
                {!subEngineStatuses.weather_pending.tested
                  ? 'Idle'
                  : subEngineStatuses.weather_pending.ok
                    ? 'Healthy'
                    : 'Error'}
              </Chip>
              <span className="text-2xs text-casa-muted">
                {subEngineStatuses.weather_pending.lastTestedAt
                  ? formatRelativeTime(subEngineStatuses.weather_pending.lastTestedAt)
                  : 'Ready'}
              </span>
            </div>
          </Card>

          {/* 4. Knowledge Graph */}
          <Card className="p-4 flex flex-col justify-between space-y-3 border-casa-border hover:border-casa-border/80 transition-colors">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Network size={18} className="text-casa-gold shrink-0" />
                <div>
                  <p className="text-body-sm font-semibold text-casa-navy">Knowledge Graph</p>
                  <p className="text-2xs text-casa-muted">Entity & edge indexing</p>
                </div>
              </div>
              <IconButton
                size="sm"
                variant="ghost"
                aria-label="Rebuild Knowledge Graph"
                icon={
                  <RefreshCw
                    size={14}
                    className={cn(testingSubEngine === 'household_graph' && 'animate-spin')}
                  />
                }
                onClick={() => runSubEngineTest('household_graph')}
                disabled={testingSubEngine === 'household_graph'}
              />
            </div>
            <div className="flex items-center justify-between pt-1">
              <Chip
                tone={
                  !subEngineStatuses.household_graph.tested
                    ? 'neutral'
                    : subEngineStatuses.household_graph.ok
                      ? 'success'
                      : 'danger'
                }
                size="sm"
                icon={
                  !subEngineStatuses.household_graph.tested ? (
                    <Clock size={12} />
                  ) : subEngineStatuses.household_graph.ok ? (
                    <CheckCircle2 size={12} />
                  ) : (
                    <AlertTriangle size={12} />
                  )
                }
              >
                {!subEngineStatuses.household_graph.tested
                  ? 'Idle'
                  : subEngineStatuses.household_graph.ok
                    ? 'Healthy'
                    : 'Error'}
              </Chip>
              <span className="text-2xs text-casa-muted">
                {subEngineStatuses.household_graph.lastTestedAt
                  ? formatRelativeTime(subEngineStatuses.household_graph.lastTestedAt)
                  : 'Ready'}
              </span>
            </div>
          </Card>
        </div>
      </div>

      {/* ── Key Metrics with Drill-Down Actions ─────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-caption font-bold text-casa-muted uppercase tracking-wider">
            Operational Counts & Intelligence
          </p>
          <span className="text-2xs text-casa-muted">Tap cards to navigate or inspect</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Conflicts */}
          <Card
            interactive
            onClick={() => navigate('/actions')}
            className="p-4 flex flex-col justify-between min-h-[110px]"
          >
            <div className="flex items-start justify-between gap-1">
              <p className="text-caption text-casa-muted font-medium">Conflicts</p>
              <Activity size={16} className="text-casa-muted" />
            </div>
            <div>
              <p className="font-display text-heading text-casa-navy leading-none">
                {telemetry.conflicts}
              </p>
              <span className="text-2xs text-casa-gold font-semibold flex items-center gap-1 mt-1.5">
                Action Hub <ArrowRight size={10} />
              </span>
            </div>
          </Card>

          {/* Prep Items */}
          <Card
            interactive
            onClick={() => navigate('/actions')}
            className="p-4 flex flex-col justify-between min-h-[110px]"
          >
            <div className="flex items-start justify-between gap-1">
              <p className="text-caption text-casa-muted font-medium">Prep Items</p>
              <ListChecks size={16} className="text-casa-muted" />
            </div>
            <div>
              <p className="font-display text-heading text-casa-navy leading-none">
                {telemetry.prepItems}
              </p>
              <span className="text-2xs text-casa-gold font-semibold flex items-center gap-1 mt-1.5">
                Action Hub <ArrowRight size={10} />
              </span>
            </div>
          </Card>

          {/* Action Queue */}
          <Card
            interactive
            onClick={() => navigate('/actions')}
            className="p-4 flex flex-col justify-between min-h-[110px]"
          >
            <div className="flex items-start justify-between gap-1">
              <p className="text-caption text-casa-muted font-medium">Action Queue</p>
              <Share2 size={16} className="text-casa-muted" />
            </div>
            <div>
              <p className="font-display text-heading text-casa-navy leading-none">
                {telemetry.actionQueue}
              </p>
              <span className="text-2xs text-casa-gold font-semibold flex items-center gap-1 mt-1.5">
                Action Hub <ArrowRight size={10} />
              </span>
            </div>
          </Card>

          {/* Downvotes (30d) */}
          <Card
            interactive
            onClick={toggleRlhfDetails}
            className="p-4 flex flex-col justify-between min-h-[110px]"
          >
            <div className="flex items-start justify-between gap-1">
              <p className="text-caption text-casa-muted font-medium">Downvotes (30d)</p>
              <AlertTriangle size={16} className="text-casa-muted" />
            </div>
            <div>
              <p className="font-display text-heading text-casa-navy leading-none">
                {telemetry.downvotes30d}
              </p>
              <span className="text-2xs text-casa-gold font-semibold flex items-center gap-1 mt-1.5">
                {showRlhfDetails ? 'Hide' : 'Inspect'} <ChevronDown size={10} className={cn(showRlhfDetails && 'rotate-180')} />
              </span>
            </div>
          </Card>

          {/* Suppressed Patterns */}
          <Card
            interactive
            onClick={toggleRlhfDetails}
            className="p-4 flex flex-col justify-between min-h-[110px]"
          >
            <div className="flex items-start justify-between gap-1">
              <p className="text-caption text-casa-muted font-medium">Suppressed</p>
              <CheckCircle2 size={16} className="text-casa-muted" />
            </div>
            <div>
              <p className="font-display text-heading text-casa-navy leading-none">
                {telemetry.suppressedPatterns}
              </p>
              <span className="text-2xs text-casa-gold font-semibold flex items-center gap-1 mt-1.5">
                {showRlhfDetails ? 'Hide' : 'Rules'} <ChevronDown size={10} className={cn(showRlhfDetails && 'rotate-180')} />
              </span>
            </div>
          </Card>

          {/* Graph Nodes */}
          <Card className="p-4 flex flex-col justify-between min-h-[110px]">
            <div className="flex items-start justify-between gap-1">
              <p className="text-caption text-casa-muted font-medium">Graph Nodes</p>
              <Network size={16} className="text-casa-gold" />
            </div>
            <div>
              <p className="font-display text-heading text-casa-navy leading-none">
                {telemetry.graphNodes.toLocaleString()}
              </p>
              <span className="text-2xs text-casa-muted mt-1.5 block">
                {telemetry.graphEdges.toLocaleString()} edges
              </span>
            </div>
          </Card>
        </div>
      </div>

      {/* ── RLHF Feedback & Suppressions Inspector (Expandable) ──────────────── */}
      {showRlhfDetails && (
        <Card className="p-5 space-y-4 border-casa-gold/30 bg-casa-gold/5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-body font-semibold text-casa-navy">Reinforcement Learning & Suppression Rules</p>
              <p className="text-caption text-casa-muted">
                How Casa Tabor learns from dismissals to suppress irrelevant or repetitive suggestions.
              </p>
            </div>
            <IconButton
              size="sm"
              variant="ghost"
              aria-label="Refresh feedback rules"
              icon={<RefreshCw size={14} className={cn(rlhfLoading && 'animate-spin')} />}
              onClick={toggleRlhfDetails}
              disabled={rlhfLoading}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Suppressions */}
            <div className="bg-casa-surface rounded-card border border-casa-border p-4 space-y-2">
              <p className="text-caption font-bold text-casa-navy uppercase tracking-wide">
                Active Suppression Rules
              </p>
              {suppressionRows.length === 0 ? (
                <p className="text-caption text-casa-muted">No patterns actively suppressed.</p>
              ) : (
                <ul className="space-y-1.5 divide-y divide-casa-border/50">
                  {suppressionRows.map((s) => (
                    <li key={s.id} className="pt-1.5 flex items-center justify-between text-caption">
                      <span className="font-medium text-casa-navy">{s.pattern_label || 'Unnamed rule'}</span>
                      <span className="font-mono text-2xs px-2 py-0.5 rounded bg-casa-bg text-casa-muted">
                        {s.hard_suppressed ? 'Hard blocked' : `Strength ${s.strength}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Recent Feedback */}
            <div className="bg-casa-surface rounded-card border border-casa-border p-4 space-y-2">
              <p className="text-caption font-bold text-casa-navy uppercase tracking-wide">
                Recent Downvote Signals (30d)
              </p>
              {feedbackRows.length === 0 ? (
                <p className="text-caption text-casa-muted">No negative feedback recorded recently.</p>
              ) : (
                <ul className="space-y-1.5 divide-y divide-casa-border/50">
                  {feedbackRows.map((f) => (
                    <li key={f.id} className="pt-1.5 flex items-start justify-between text-caption gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-casa-navy truncate">{f.source_pattern_key || f.reason || 'Dismissal'}</p>
                        {f.reason && <p className="text-2xs text-casa-muted truncate">{f.reason}</p>}
                      </div>
                      <span className="text-2xs text-casa-muted shrink-0">
                        {formatRelativeTime(f.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* ── Knowledge Graph Entity Deep-Dive ───────────────────────────────── */}
      <Card className="p-5 space-y-4 border-casa-border shadow-card">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-casa-border pb-3">
          <div>
            <p className="text-body font-semibold text-casa-navy">Semantic Knowledge Graph Architecture</p>
            <p className="text-caption text-casa-muted">
              Live index connecting family routines, saved locations, contacts, and calendar history.
            </p>
          </div>
          <div className="text-left sm:text-right shrink-0">
            <p className="text-caption font-semibold text-casa-navy">
              Last Graph Index
            </p>
            <p className="text-2xs text-casa-muted">
              {telemetry.graphLastSeenAt
                ? `${new Date(telemetry.graphLastSeenAt).toLocaleString()} (${formatRelativeTime(telemetry.graphLastSeenAt)})`
                : 'No build timestamp available'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-1">
          <div className="bg-casa-bg/60 rounded-lg p-3 border border-casa-border/50">
            <div className="flex items-center gap-1.5 text-casa-muted mb-1">
              <Users size={14} className="text-casa-gold" />
              <span className="text-caption font-medium">Family</span>
            </div>
            <p className="font-display text-title font-semibold text-casa-navy">
              {telemetry.nodeTypeBreakdown.member}
            </p>
          </div>

          <div className="bg-casa-bg/60 rounded-lg p-3 border border-casa-border/50">
            <div className="flex items-center gap-1.5 text-casa-muted mb-1">
              <MapPin size={14} className="text-casa-gold" />
              <span className="text-caption font-medium">Places</span>
            </div>
            <p className="font-display text-title font-semibold text-casa-navy">
              {telemetry.nodeTypeBreakdown.place}
            </p>
          </div>

          <div className="bg-casa-bg/60 rounded-lg p-3 border border-casa-border/50">
            <div className="flex items-center gap-1.5 text-casa-muted mb-1">
              <UserCheck size={14} className="text-casa-gold" />
              <span className="text-caption font-medium">Contacts</span>
            </div>
            <p className="font-display text-title font-semibold text-casa-navy">
              {telemetry.nodeTypeBreakdown.contact}
            </p>
          </div>

          <div className="bg-casa-bg/60 rounded-lg p-3 border border-casa-border/50">
            <div className="flex items-center gap-1.5 text-casa-muted mb-1">
              <Repeat size={14} className="text-casa-gold" />
              <span className="text-caption font-medium">Routines</span>
            </div>
            <p className="font-display text-title font-semibold text-casa-navy">
              {telemetry.nodeTypeBreakdown.routine}
            </p>
          </div>

          <div className="bg-casa-bg/60 rounded-lg p-3 border border-casa-border/50">
            <div className="flex items-center gap-1.5 text-casa-muted mb-1">
              <CalendarDays size={14} className="text-casa-gold" />
              <span className="text-caption font-medium">Events</span>
            </div>
            <p className="font-display text-title font-semibold text-casa-navy">
              {telemetry.nodeTypeBreakdown.event.toLocaleString()}
            </p>
          </div>

          <div className="bg-casa-bg/60 rounded-lg p-3 border border-casa-border/50">
            <div className="flex items-center gap-1.5 text-casa-muted mb-1">
              <Share2 size={14} className="text-casa-gold" />
              <span className="text-caption font-medium">Edges</span>
            </div>
            <p className="font-display text-title font-semibold text-casa-navy">
              {telemetry.graphEdges.toLocaleString()}
            </p>
          </div>
        </div>
      </Card>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <div className="text-center pt-2 pb-6">
        <p className="text-caption text-casa-muted">
          Orchestration runs on scheduled crons, pull-to-refresh on Home, and manual triggers.
        </p>
      </div>
    </div>
  )
}

