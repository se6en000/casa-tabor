import { useEffect, useMemo, useState } from 'react'
import { Brain, Layers3, RefreshCw, ScanSearch, ShieldCheck, Sparkles, Store } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { cn } from '../utils/cn'
import { Alert, IconButton, SkeletonRow } from '../components/ui'
import { SettingsPageHeader } from '../components/settings'

type GroceryItemLite = {
  id: string
  name: string
  category: string
  checked: boolean
  created_at: string
  updated_at: string
  ios_updated_at: string | null
  canonical_item_id: string | null
  subcategory: string | null
  brand: string | null
  store_section: string | null
  enhancement_confidence: number | null
  enhanced_at: string | null
}

type DryRunDedupe = {
  duplicate_groups?: number
  duplicate_rows?: number
}

type DryRunRecategorize = {
  scanned_count?: number
  recategorized_count?: number
}

type DryRunLearning = {
  scanned_count?: number
  candidate_rules?: number
  applied_count?: number
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function fmtPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function fmtNumber(value: number): string {
  return value.toLocaleString()
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-casa-surface rounded-card border border-casa-border p-4 shadow-card">
      <p className="text-caption text-casa-muted">{label}</p>
      <p className="font-display text-heading text-casa-navy mt-1">{value}</p>
      {sub && <p className="text-caption text-casa-muted mt-1">{sub}</p>}
    </div>
  )
}

function KpiCard({
  label,
  value,
  target,
  passed,
}: {
  label: string
  value: string
  target: string
  passed: boolean
}) {
  return (
    <div className={cn(
      'rounded-card border p-4 shadow-card',
      passed ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/70',
    )}>
      <p className="text-caption text-casa-muted">{label}</p>
      <p className="font-display text-heading text-casa-navy mt-1">{value}</p>
      <p className={cn('text-caption mt-1', passed ? 'text-emerald-700' : 'text-amber-700')}>
        Target: {target} · {passed ? 'On track' : 'Needs attention'}
      </p>
    </div>
  )
}

export default function GroceryIntelligenceSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null)
  const [items, setItems] = useState<GroceryItemLite[]>([])
  const [catalogCount, setCatalogCount] = useState(0)
  const [aisleMapCount, setAisleMapCount] = useState(0)
  const [dryRunDedupe, setDryRunDedupe] = useState<DryRunDedupe>({})
  const [dryRunRecategorize, setDryRunRecategorize] = useState<DryRunRecategorize>({})
  const [dryRunLearning, setDryRunLearning] = useState<DryRunLearning>({})

  async function load() {
    setRefreshing(true)
    setError(null)

    try {
      const [itemsRes, catalogRes, aisleRes, dedupeRes, recategorizeRes, learningRes] = await Promise.all([
        supabase
          .from('grocery_items')
          .select('id,name,category,checked,created_at,updated_at,ios_updated_at,canonical_item_id,subcategory,brand,store_section,enhancement_confidence,enhanced_at')
          .is('deleted_at', null)
          .order('updated_at', { ascending: false })
          .limit(3000),
        supabase.from('grocery_catalog_items').select('id', { count: 'exact', head: true }),
        supabase.from('grocery_aisle_mappings').select('id', { count: 'exact', head: true }),
        supabase.functions.invoke('dedupe-grocery-items', { body: { dry_run: true } }),
        supabase.functions.invoke('recategorize-grocery-items', { body: { dry_run: true, limit: 2000 } }),
        supabase.functions.invoke('learn-grocery-corrections', { body: { dry_run: true, limit: 400, min_votes: 2, lookback_days: 45 } }),
      ])

      if (itemsRes.error) throw itemsRes.error
      if (catalogRes.error) throw catalogRes.error
      if (aisleRes.error) throw aisleRes.error
      if (dedupeRes.error) throw dedupeRes.error
      if (recategorizeRes.error) throw recategorizeRes.error
      if (learningRes.error) throw learningRes.error

      setItems((itemsRes.data ?? []) as GroceryItemLite[])
      setCatalogCount(catalogRes.count ?? 0)
      setAisleMapCount(aisleRes.count ?? 0)
      setDryRunDedupe((dedupeRes.data ?? {}) as DryRunDedupe)
      setDryRunRecategorize((recategorizeRes.data ?? {}) as DryRunRecategorize)
      setDryRunLearning((learningRes.data ?? {}) as DryRunLearning)
      setLastRefreshedAt(new Date().toISOString())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load grocery intelligence')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => { void load() })
    return () => window.cancelAnimationFrame(raf)
  }, [])

  const metrics = useMemo(() => {
    const active = items.filter((item) => !item.checked)
    const all = items
    const canonical = all.filter((item) => item.canonical_item_id).length
    const enhanced = all.filter((item) => item.enhanced_at).length
    const sectionTagged = all.filter((item) => item.store_section).length
    const subcategoryTagged = all.filter((item) => item.subcategory).length
    const brandTagged = all.filter((item) => item.brand).length
    const avgConfidenceValues = all
      .map((item) => item.enhancement_confidence)
      .filter((value): value is number => typeof value === 'number')
    const avgConfidence = avgConfidenceValues.length > 0
      ? avgConfidenceValues.reduce((sum, value) => sum + value, 0) / avgConfidenceValues.length
      : 0
    const otherCount = active.filter((item) => item.category === 'other').length
    const newestEnhancedAt = all
      .map((item) => item.enhanced_at)
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null
    const lastIosTouchAt = all
      .map((item) => item.ios_updated_at)
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null

    const duplicateGroupsLocal = new Map<string, number>()
    active.forEach((item) => {
      const key = normalizeName(item.name)
      duplicateGroupsLocal.set(key, (duplicateGroupsLocal.get(key) ?? 0) + 1)
    })
    const duplicateGroupsDetected = Array.from(duplicateGroupsLocal.values()).filter((count) => count > 1).length

    const categoryCounts = active.reduce<Record<string, number>>((acc, item) => {
      acc[item.category] = (acc[item.category] ?? 0) + 1
      return acc
    }, {})

    return {
      totalItems: all.length,
      activeItems: active.length,
      canonical,
      enhanced,
      sectionTagged,
      subcategoryTagged,
      brandTagged,
      avgConfidence,
      otherCount,
      otherRate: active.length > 0 ? otherCount / active.length : 0,
      newestEnhancedAt,
      lastIosTouchAt,
      duplicateGroupsDetected,
      categoryCounts,
    }
  }, [items])

  const categoryBars = useMemo(() => {
    const entries = Object.entries(metrics.categoryCounts).sort((a, b) => b[1] - a[1])
    const max = entries[0]?.[1] ?? 1
    return entries.map(([category, count]) => ({
      category,
      count,
      widthPct: Math.max(8, Math.round((count / max) * 100)),
    }))
  }, [metrics.categoryCounts])

  const kpis = useMemo(() => {
    const duplicateGroups = dryRunDedupe.duplicate_groups ?? metrics.duplicateGroupsDetected
    return [
      {
        label: 'Other bucket rate',
        value: fmtPercent(metrics.otherRate),
        target: '<= 8%',
        passed: metrics.otherRate <= 0.08,
      },
      {
        label: 'Canonical coverage',
        value: metrics.totalItems > 0 ? fmtPercent(metrics.canonical / metrics.totalItems) : '0%',
        target: '>= 70%',
        passed: metrics.totalItems > 0 && (metrics.canonical / metrics.totalItems) >= 0.7,
      },
      {
        label: 'Average confidence',
        value: fmtPercent(metrics.avgConfidence),
        target: '>= 86%',
        passed: metrics.avgConfidence >= 0.86,
      },
      {
        label: 'Duplicate groups',
        value: fmtNumber(duplicateGroups),
        target: '= 0',
        passed: duplicateGroups === 0,
      },
    ]
  }, [dryRunDedupe.duplicate_groups, metrics.avgConfidence, metrics.canonical, metrics.duplicateGroupsDetected, metrics.otherRate, metrics.totalItems])

  if (loading) return <div className="space-y-4"><SkeletonRow /><SkeletonRow /><SkeletonRow /></div>

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <SettingsPageHeader title="Grocery Intelligence" description="Learning quality, cleanup health, and automation signals" />
        <IconButton
          icon={<RefreshCw size={18} className={cn(refreshing && 'animate-spin')} />}
          aria-label="Refresh grocery intelligence"
          onClick={load}
          disabled={refreshing}
          variant="ghost"
        />
      </div>

      {error && (
        <Alert tone="danger" title="Could not load grocery intelligence">{error}</Alert>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Active Items" value={fmtNumber(metrics.activeItems)} sub={`${fmtNumber(metrics.totalItems)} total`} />
        <StatCard label="Enhanced Coverage" value={metrics.totalItems > 0 ? fmtPercent(metrics.enhanced / metrics.totalItems) : '0%'} sub={`${fmtNumber(metrics.enhanced)} with enhanced metadata`} />
        <StatCard label="Canonical Matches" value={metrics.totalItems > 0 ? fmtPercent(metrics.canonical / metrics.totalItems) : '0%'} sub={`${fmtNumber(metrics.canonical)} linked to catalog`} />
        <StatCard label="Avg Confidence" value={fmtPercent(metrics.avgConfidence)} sub="Across enhanced items" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Store Section Tags" value={fmtNumber(metrics.sectionTagged)} sub="Items mapped to aisle section" />
        <StatCard label="Subcategory Tags" value={fmtNumber(metrics.subcategoryTagged)} sub="Fruit, beef, canned goods, etc." />
        <StatCard label="Brand Tags" value={fmtNumber(metrics.brandTagged)} sub="Brand detection coverage" />
        <StatCard label="Still in Other" value={fmtNumber(metrics.otherCount)} sub="Active items left in Other" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Catalog Vocabulary" value={fmtNumber(catalogCount)} sub="Canonical grocery entries" />
        <StatCard label="Aisle Mappings" value={fmtNumber(aisleMapCount)} sub="Store/category aisle rules" />
        <StatCard label="Dupes (dry run)" value={fmtNumber(dryRunDedupe.duplicate_groups ?? metrics.duplicateGroupsDetected)} sub={`${fmtNumber(dryRunDedupe.duplicate_rows ?? 0)} duplicate rows`} />
        <StatCard label="Needs Recategorize" value={fmtNumber(dryRunRecategorize.scanned_count ?? 0)} sub={`${fmtNumber(dryRunRecategorize.recategorized_count ?? 0)} would be changed`} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Learning Queue (dry run)"
          value={fmtNumber(dryRunLearning.candidate_rules ?? 0)}
          sub={`${fmtNumber(dryRunLearning.scanned_count ?? 0)} correction signals scanned`}
        />
        <StatCard
          label="Learning Apply Estimate"
          value={fmtNumber(dryRunLearning.applied_count ?? 0)}
          sub="Catalog rules ready to apply"
        />
      </div>

      <div className="space-y-2">
        <p className="text-caption font-semibold text-casa-muted uppercase tracking-wide">KPI Targets</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {kpis.map((kpi) => (
            <KpiCard key={kpi.label} label={kpi.label} value={kpi.value} target={kpi.target} passed={kpi.passed} />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-casa-surface rounded-card border border-casa-border p-4 shadow-card">
          <p className="text-caption text-casa-muted mb-1">Last enhancement pass</p>
          <p className="font-display text-heading text-casa-navy">
            {metrics.newestEnhancedAt ? new Date(metrics.newestEnhancedAt).toLocaleString() : 'No enhancement run yet'}
          </p>
        </div>
        <div className="bg-casa-surface rounded-card border border-casa-border p-4 shadow-card">
          <p className="text-caption text-casa-muted mb-1">Last iOS sync touch</p>
          <p className="font-display text-heading text-casa-navy">
            {metrics.lastIosTouchAt ? new Date(metrics.lastIosTouchAt).toLocaleString() : 'No iOS sync timestamp yet'}
          </p>
        </div>
      </div>

      <div className="bg-casa-surface rounded-card border border-casa-border p-4 shadow-card">
        <p className="text-caption font-semibold text-casa-muted uppercase tracking-wide mb-3">Active Items by Category</p>
        {categoryBars.length > 0 ? (
          <div className="space-y-2">
            {categoryBars.map(({ category, count, widthPct }) => (
              <div key={category}>
                <div className="flex items-center justify-between text-caption text-casa-muted mb-1">
                  <span className="capitalize">{category}</span>
                  <span>{fmtNumber(count)}</span>
                </div>
                <div className="h-2 rounded-full bg-casa-bg">
                  <div className="h-2 rounded-full bg-casa-gold/70" style={{ width: `${widthPct}%` }} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-body-sm text-casa-muted">No active grocery items yet.</p>
        )}
      </div>

      <div className="bg-casa-bg/60 rounded-card border border-casa-border/50 p-4">
        <p className="text-caption font-semibold text-casa-muted uppercase tracking-wide mb-3">What this proves</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-body-sm text-casa-muted">
          <p className="flex items-center gap-2"><Brain size={14} className="text-casa-gold" />Catalog matching quality and confidence</p>
          <p className="flex items-center gap-2"><Store size={14} className="text-casa-gold" />Store section/aisle metadata coverage</p>
          <p className="flex items-center gap-2"><ShieldCheck size={14} className="text-casa-gold" />Duplicate-prevention health via dry-run check</p>
          <p className="flex items-center gap-2"><ScanSearch size={14} className="text-casa-gold" />Recategorization backlog visibility</p>
          <p className="flex items-center gap-2"><Layers3 size={14} className="text-casa-gold" />Catalog + aisle rule base size tracking</p>
          <p className="flex items-center gap-2"><Sparkles size={14} className="text-casa-gold" />Freshness via last enhancement/sync timestamps</p>
        </div>
      </div>

      <p className="text-caption text-casa-muted text-center">
        Last refreshed {lastRefreshedAt ? new Date(lastRefreshedAt).toLocaleTimeString() : '—'}
      </p>
    </div>
  )
}
