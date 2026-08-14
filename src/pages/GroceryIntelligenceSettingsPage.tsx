import { useEffect, useMemo, useState } from 'react'
import { Brain, Layers3, RefreshCw, ScanSearch, ShieldCheck, Sparkles, Store } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { cn } from '../utils/cn'
import { Alert, Card, Heading, IconButton, Progress, SkeletonRow } from '../components/ui'
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
    <Card tone="surface" padding="md" className="space-y-1">
      <p className="text-caption text-casa-muted font-medium">{label}</p>
      <p className="font-display text-heading font-bold text-casa-navy leading-none">{value}</p>
      {sub && <p className="text-caption text-casa-muted">{sub}</p>}
    </Card>
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
    <Card
      tone={passed ? 'surface' : 'ambient'}
      padding="md"
      className={cn(
        'transition-all',
        passed
          ? 'border-emerald-500/20 bg-emerald-500/5'
          : 'border-amber-500/30 bg-amber-500/10 ring-1 ring-amber-500/20',
      )}
    >
      <p className="text-caption text-casa-muted font-medium">{label}</p>
      <p className="font-display text-heading font-bold text-casa-navy mt-1 leading-none">{value}</p>
      <p
        className={cn(
          'text-caption font-semibold mt-1.5',
          passed ? 'text-emerald-700' : 'text-amber-800',
        )}
      >
        Target: {target} · {passed ? 'On track' : 'Needs attention'}
      </p>
    </Card>
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
      setLastRefreshedAt(new Date().toISOString())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load grocery intelligence')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => {
      void load()
    })
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
    const avgConfidence =
      avgConfidenceValues.length > 0
        ? avgConfidenceValues.reduce((sum, value) => sum + value, 0) / avgConfidenceValues.length
        : 0
    const otherCount = active.filter((item) => item.category === 'other').length
    const newestEnhancedAt =
      all
        .map((item) => item.enhanced_at)
        .filter((value): value is string => Boolean(value))
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null
    const lastIosTouchAt =
      all
        .map((item) => item.ios_updated_at)
        .filter((value): value is string => Boolean(value))
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null

    const duplicateGroupsLocal = new Map<string, number>()
    active.forEach((item) => {
      const key = normalizeName(item.name)
      duplicateGroupsLocal.set(key, (duplicateGroupsLocal.get(key) ?? 0) + 1)
    })
    const duplicateGroupsDetected = Array.from(duplicateGroupsLocal.values()).filter(
      (count) => count > 1,
    ).length

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
        passed: metrics.totalItems > 0 && metrics.canonical / metrics.totalItems >= 0.7,
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
  }, [
    dryRunDedupe.duplicate_groups,
    metrics.avgConfidence,
    metrics.canonical,
    metrics.duplicateGroupsDetected,
    metrics.otherRate,
    metrics.totalItems,
  ])

  if (loading) {
    return (
      <div className="space-y-4 p-4 lg:p-6">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <SettingsPageHeader
          icon={Brain}
          title="Grocery Intelligence"
          description="Learning quality, catalog matching health, automated cleanup signals, and taxonomy precision."
        />
        <IconButton
          icon={<RefreshCw size={18} className={cn(refreshing && 'animate-spin')} />}
          aria-label="Refresh grocery intelligence"
          onClick={load}
          disabled={refreshing}
          variant="ghost"
          className="min-h-control min-w-[44px]"
        />
      </div>

      {error && (
        <Alert tone="danger" title="Could not load grocery intelligence">
          {error}
        </Alert>
      )}

      {/* Coverage Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Active Items" value={fmtNumber(metrics.activeItems)} sub={`${fmtNumber(metrics.totalItems)} total`} />
        <StatCard label="Enhanced Coverage" value={metrics.totalItems > 0 ? fmtPercent(metrics.enhanced / metrics.totalItems) : '0%'} sub={`${fmtNumber(metrics.enhanced)} enhanced`} />
        <StatCard label="Canonical Matches" value={metrics.totalItems > 0 ? fmtPercent(metrics.canonical / metrics.totalItems) : '0%'} sub={`${fmtNumber(metrics.canonical)} catalog items`} />
        <StatCard label="Avg Confidence" value={fmtPercent(metrics.avgConfidence)} sub="Across enhanced items" />
      </div>

      {/* Tagging Breakdown */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Store Section Tags" value={fmtNumber(metrics.sectionTagged)} sub="Mapped to aisle section" />
        <StatCard label="Subcategory Tags" value={fmtNumber(metrics.subcategoryTagged)} sub="Granular subcategories" />
        <StatCard label="Brand Tags" value={fmtNumber(metrics.brandTagged)} sub="Brand detection coverage" />
        <StatCard label="Still in Other" value={fmtNumber(metrics.otherCount)} sub="Active items left in Other" />
      </div>

      {/* Vocabulary & Dry Run Signals */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Catalog Vocabulary" value={fmtNumber(catalogCount)} sub="Canonical entries" />
        <StatCard label="Aisle Mappings" value={fmtNumber(aisleMapCount)} sub="Aisle rules configured" />
        <StatCard label="Dupes (dry run)" value={fmtNumber(dryRunDedupe.duplicate_groups ?? metrics.duplicateGroupsDetected)} sub={`${fmtNumber(dryRunDedupe.duplicate_rows ?? 0)} duplicate rows`} />
        <StatCard label="Needs Recategorize" value={fmtNumber(dryRunRecategorize.scanned_count ?? 0)} sub={`${fmtNumber(dryRunRecategorize.recategorized_count ?? 0)} to update`} />
      </div>

      {/* KPI Targets */}
      <div className="space-y-3">
        <Heading role="heading" className="font-display text-heading font-bold text-casa-navy">
          Intelligence KPI Targets
        </Heading>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {kpis.map((kpi) => (
            <KpiCard key={kpi.label} label={kpi.label} value={kpi.value} target={kpi.target} passed={kpi.passed} />
          ))}
        </div>
      </div>

      {/* Sync Freshness */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card tone="surface" padding="md">
          <p className="text-caption text-casa-muted font-medium mb-1">Last enhancement pass</p>
          <p className="font-display text-heading font-bold text-casa-navy">
            {metrics.newestEnhancedAt ? new Date(metrics.newestEnhancedAt).toLocaleString() : 'No enhancement run yet'}
          </p>
        </Card>
        <Card tone="surface" padding="md">
          <p className="text-caption text-casa-muted font-medium mb-1">Last iOS sync touch</p>
          <p className="font-display text-heading font-bold text-casa-navy">
            {metrics.lastIosTouchAt ? new Date(metrics.lastIosTouchAt).toLocaleString() : 'No iOS sync timestamp yet'}
          </p>
        </Card>
      </div>

      {/* Active Items by Category Progress */}
      <Card tone="surface" padding="lg" className="space-y-4">
        <Heading role="heading" className="font-display text-heading font-bold text-casa-navy">
          Active Items by Category
        </Heading>
        {categoryBars.length > 0 ? (
          <div className="space-y-3">
            {categoryBars.map(({ category, count, widthPct }) => (
              <div key={category} className="space-y-1">
                <div className="flex items-center justify-between text-body-sm text-casa-navy font-semibold">
                  <span className="capitalize">{category}</span>
                  <span className="font-mono text-caption text-casa-muted">{fmtNumber(count)}</span>
                </div>
                <Progress
                  value={widthPct}
                  aria-label={`${category} share of active grocery items`}
                  className="[&_.casa-progress]:h-2.5"
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-body-sm text-casa-muted">No active grocery items yet.</p>
        )}
      </Card>

      {/* What This Proves Section */}
      <Card tone="subtle" padding="lg" className="space-y-3">
        <Heading role="heading" className="font-display text-body-lg font-bold text-casa-navy">
          Intelligence Capabilities Verified
        </Heading>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-body-sm text-casa-text-secondary">
          <p className="flex items-center gap-2">
            <Brain size={16} className="text-casa-gold shrink-0" />
            <span>Catalog matching quality and confidence</span>
          </p>
          <p className="flex items-center gap-2">
            <Store size={16} className="text-casa-gold shrink-0" />
            <span>Store section/aisle metadata coverage</span>
          </p>
          <p className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-casa-gold shrink-0" />
            <span>Duplicate-prevention health via dry-run check</span>
          </p>
          <p className="flex items-center gap-2">
            <ScanSearch size={16} className="text-casa-gold shrink-0" />
            <span>Recategorization backlog visibility</span>
          </p>
          <p className="flex items-center gap-2">
            <Layers3 size={16} className="text-casa-gold shrink-0" />
            <span>Catalog + aisle rule base size tracking</span>
          </p>
          <p className="flex items-center gap-2">
            <Sparkles size={16} className="text-casa-gold shrink-0" />
            <span>Freshness via last enhancement & sync timestamps</span>
          </p>
        </div>
      </Card>

      <p className="text-caption text-casa-muted text-center font-mono">
        Last refreshed {lastRefreshedAt ? new Date(lastRefreshedAt).toLocaleTimeString() : '—'}
      </p>
    </div>
  )
}


