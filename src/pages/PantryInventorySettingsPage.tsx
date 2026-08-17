import { useEffect, useMemo, useState } from 'react'
import { Plus, Save, Trash2, PackageCheck, AlertTriangle, History, Layers } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatSupabaseError } from '../lib/formatSupabaseError'
import {
  appendPantryInventoryAudit,
  normalizePackageUnit,
  normalizePantryKey,
  sanitizePantryInventoryAudit,
  type PantryInventoryAuditEntry,
} from '../lib/pantryInventoryUtils'
import { Alert, Button, Card, Chip, EmptyState, Field, Heading, IconButton, Input, Select, SkeletonRow } from '../components/ui'
import { SettingsPageHeader } from '../components/settings'
import { cn } from '../utils/cn'

type PantryInventoryRow = {
  id: string
  name: string
  category: string
  package_unit: string
  package_size: string
  on_hand_packages: number
  low_stock_threshold: number
  updated_at: string
}

function pantryKey(name: string, category: string): string {
  return `${name.trim().toLowerCase()}::${category.trim().toLowerCase()}`
}

function sanitizeInventory(raw: unknown): PantryInventoryRow[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
  const rows: PantryInventoryRow[] = []
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const entry = value as Record<string, unknown>
    const onHand = Number(entry.on_hand_packages)
    if (!Number.isFinite(onHand) || onHand < 0) continue
    const threshold = Number(entry.low_stock_threshold)
    const name = String(entry.name ?? '').trim()
    const category = String(entry.category ?? '').trim().toLowerCase() || 'other'
    rows.push({
      id: key,
      name,
      category,
      package_unit: String(entry.package_unit ?? '').trim(),
      package_size: String(entry.package_size ?? '').trim(),
      on_hand_packages: Number(onHand.toFixed(2)),
      low_stock_threshold: Number.isFinite(threshold) && threshold >= 0 ? Number(threshold.toFixed(2)) : 0.5,
      updated_at: typeof entry.updated_at === 'string' ? entry.updated_at : new Date().toISOString(),
    })
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name))
}

export default function PantryInventorySettingsPage({ hideHeader = false }: { hideHeader?: boolean } = {}) {
  const [rows, setRows] = useState<PantryInventoryRow[]>([])
  const [baselineInventory, setBaselineInventory] = useState<Record<string, Omit<PantryInventoryRow, 'id'>>>({})
  const [auditLog, setAuditLog] = useState<PantryInventoryAuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [filterCategory, setFilterCategory] = useState<string>('all')

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const { data, error: loadError } = await supabase
          .from('settings')
          .select('key,value')
          .in('key', ['meal_planner_pantry_inventory', 'meal_planner_pantry_audit_log'])
        if (loadError) throw loadError
        if (!active) return
        const rowMap = new Map((data ?? []).map((row) => [row.key, row.value]))
        const nextRows = sanitizeInventory(rowMap.get('meal_planner_pantry_inventory'))
        setRows(nextRows)
        setBaselineInventory(
          Object.fromEntries(
            nextRows.map((row) => [
              row.id,
              {
                name: row.name,
                category: row.category,
                package_unit: row.package_unit,
                package_size: row.package_size,
                on_hand_packages: row.on_hand_packages,
                low_stock_threshold: row.low_stock_threshold,
                updated_at: row.updated_at,
              },
            ]),
          ),
        )
        setAuditLog(sanitizePantryInventoryAudit(rowMap.get('meal_planner_pantry_audit_log')))
      } catch (loadError) {
        if (!active) return
        setError(formatSupabaseError(loadError, 'Could not load pantry inventory'))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const lowStockCount = useMemo(
    () => rows.filter((row) => row.on_hand_packages <= row.low_stock_threshold).length,
    [rows],
  )

  const filteredRows = useMemo(() => {
    if (filterCategory === 'all') return rows
    if (filterCategory === 'low-stock') {
      return rows.filter((row) => row.on_hand_packages <= row.low_stock_threshold)
    }
    return rows.filter((row) => row.category === filterCategory)
  }, [rows, filterCategory])

  function addRow() {
    setRows((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        name: '',
        category: 'pantry',
        package_unit: 'pack',
        package_size: '',
        on_hand_packages: 1,
        low_stock_threshold: 0.5,
        updated_at: new Date().toISOString(),
      },
    ])
  }

  function updateRow(id: string, patch: Partial<PantryInventoryRow>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  function deleteRow(id: string) {
    setRows((current) => current.filter((row) => row.id !== id))
  }

  async function saveInventory() {
    setSaving(true)
    setError(null)
    setStatus(null)
    try {
      const payload: Record<string, Omit<PantryInventoryRow, 'id'>> = {}
      for (const row of rows) {
        const name = row.name.trim()
        if (!name) continue
        const category = row.category.trim().toLowerCase() || 'other'
        const key = pantryKey(name, category)
        payload[key] = {
          name,
          category,
          package_unit: row.package_unit.trim(),
          package_size: row.package_size.trim(),
          on_hand_packages: Number(Math.max(0, row.on_hand_packages).toFixed(2)),
          low_stock_threshold: Number(Math.max(0, row.low_stock_threshold).toFixed(2)),
          updated_at: new Date().toISOString(),
        }
      }
      const nowIso = new Date().toISOString()
      const manualAuditEntries: PantryInventoryAuditEntry[] = []
      for (const [key, nextRow] of Object.entries(payload)) {
        const previous = baselineInventory[key]
        const before = previous?.on_hand_packages ?? 0
        const after = nextRow.on_hand_packages
        if (Math.abs(after - before) < 0.001) continue
        manualAuditEntries.push({
          id: crypto.randomUUID(),
          created_at: nowIso,
          source: 'manual',
          reason: 'Updated in pantry inventory settings',
          item_key: normalizePantryKey(nextRow.name, nextRow.category),
          name: nextRow.name,
          category: nextRow.category,
          package_unit: normalizePackageUnit(nextRow.package_unit),
          package_size: nextRow.package_size || null,
          before_packages: Number(before.toFixed(2)),
          delta_packages: Number((after - before).toFixed(2)),
          after_packages: Number(after.toFixed(2)),
        })
      }
      for (const [key, previous] of Object.entries(baselineInventory)) {
        if (payload[key]) continue
        if (previous.on_hand_packages <= 0) continue
        manualAuditEntries.push({
          id: crypto.randomUUID(),
          created_at: nowIso,
          source: 'manual',
          reason: 'Removed pantry item in settings',
          item_key: normalizePantryKey(previous.name, previous.category),
          name: previous.name,
          category: previous.category,
          package_unit: normalizePackageUnit(previous.package_unit),
          package_size: previous.package_size || null,
          before_packages: Number(previous.on_hand_packages.toFixed(2)),
          delta_packages: Number((-previous.on_hand_packages).toFixed(2)),
          after_packages: 0,
        })
      }
      const nextAuditLog = appendPantryInventoryAudit(auditLog, manualAuditEntries)

      const { error: saveError } = await supabase.from('settings').upsert(
        [
          { key: 'meal_planner_pantry_inventory', value: payload, updated_at: nowIso },
          { key: 'meal_planner_pantry_audit_log', value: nextAuditLog, updated_at: nowIso },
        ],
        { onConflict: 'key' },
      )
      if (saveError) throw saveError
      const nextRows = sanitizeInventory(payload)
      setRows(nextRows)
      setBaselineInventory(
        Object.fromEntries(
          nextRows.map((row) => [
            row.id,
            {
              name: row.name,
              category: row.category,
              package_unit: row.package_unit,
              package_size: row.package_size,
              on_hand_packages: row.on_hand_packages,
              low_stock_threshold: row.low_stock_threshold,
              updated_at: row.updated_at,
            },
          ]),
        ),
      )
      setAuditLog(nextAuditLog)
      setStatus('Pantry inventory saved successfully.')
    } catch (saveError) {
      setError(formatSupabaseError(saveError, 'Could not save pantry inventory'))
    } finally {
      setSaving(false)
    }
  }

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
      {!hideHeader && (
        <SettingsPageHeader
          icon={Layers}
          title="Kitchen Pantry Inventory"
          description="Track package on-hand counts and low-stock thresholds used for Meal Planner AI deduction and automated grocery replenishment."
        />
      )}

      {error && (
        <Alert tone="danger" title="Could not save pantry inventory" className="shadow-sm">
          {error}
        </Alert>
      )}
      {!error && status && (
        <Alert tone="success" title={status} className="shadow-sm" />
      )}

      {/* Summary Header Card */}
      <Card tone="ambient" padding="md" className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-casa-gold/20 flex items-center justify-center text-casa-navy font-bold">
            <PackageCheck size={20} className="text-casa-gold" />
          </div>
          <div>
            <Heading role="heading" className="font-display text-heading font-bold text-casa-navy">
              {rows.length} Tracked Pantry Staples
            </Heading>
            <p className="text-body-sm text-casa-text-secondary">
              {lowStockCount > 0 ? (
                <span className="text-amber-700 font-semibold inline-flex items-center gap-1">
                  <AlertTriangle size={13} /> {lowStockCount} staple{lowStockCount === 1 ? '' : 's'} low on hand
                </span>
              ) : (
                'All staples adequately stocked'
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={addRow}
            leadingIcon={<Plus size={16} />}
            className="font-bold min-h-control"
          >
            Add item
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void saveInventory()}
            loading={saving}
            leadingIcon={<Save size={16} />}
            className="font-bold shadow-sm min-h-control px-4"
          >
            Save inventory
          </Button>
        </div>
      </Card>

      {/* Filter Chips */}
      <div className="flex items-center gap-2 flex-wrap">
        {[
          { id: 'all', label: `All (${rows.length})` },
          { id: 'low-stock', label: `Low stock (${lowStockCount})` },
          { id: 'pantry', label: 'Pantry' },
          { id: 'produce', label: 'Produce' },
          { id: 'dairy', label: 'Dairy' },
          { id: 'meat', label: 'Meat' },
          { id: 'bakery', label: 'Bakery' },
        ].map((filter) => (
          <Chip
            key={filter.id}
            onClick={() => setFilterCategory(filter.id)}
            selected={filterCategory === filter.id}
            tone={filter.id === 'low-stock' && lowStockCount > 0 ? 'accent' : 'neutral'}
          >
            {filter.label}
          </Chip>
        ))}
      </div>

      {/* Item List */}
      <div className="space-y-3">
        {filteredRows.map((row) => {
          const isLow = row.on_hand_packages <= row.low_stock_threshold
          return (
            <Card
              key={row.id}
              tone={isLow ? 'ambient' : 'surface'}
              padding="md"
              className={cn(
                'transition-all',
                isLow && 'border-amber-500/30 ring-1 ring-amber-500/20',
              )}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
                <Field label="Item name" className="lg:col-span-3">
                  <Input
                    value={row.name}
                    onChange={(event) => updateRow(row.id, { name: event.target.value })}
                    placeholder="e.g. Olive Oil"
                  />
                </Field>

                <Field label="Category" className="lg:col-span-2">
                  <Select
                    value={row.category}
                    onChange={(event) => updateRow(row.id, { category: event.target.value })}
                  >
                    <option value="pantry">Pantry</option>
                    <option value="produce">Produce</option>
                    <option value="dairy">Dairy</option>
                    <option value="meat">Meat</option>
                    <option value="bakery">Bakery</option>
                    <option value="other">Other</option>
                  </Select>
                </Field>

                <Field label="Pack unit" className="lg:col-span-2">
                  <Input
                    value={row.package_unit}
                    onChange={(event) => updateRow(row.id, { package_unit: event.target.value })}
                    placeholder="bottle, box, can"
                  />
                </Field>

                <Field label="Pack size" className="lg:col-span-2">
                  <Input
                    value={row.package_size}
                    onChange={(event) => updateRow(row.id, { package_size: event.target.value })}
                    placeholder="16 fl oz, 1 lb"
                  />
                </Field>

                <Field label="On hand" className="lg:col-span-1">
                  <Input
                    type="number"
                    min={0}
                    step={0.25}
                    value={row.on_hand_packages}
                    onChange={(event) => updateRow(row.id, { on_hand_packages: Number(event.target.value) })}
                  />
                </Field>

                <Field label="Low threshold" className="lg:col-span-1">
                  <Input
                    type="number"
                    min={0}
                    step={0.25}
                    value={row.low_stock_threshold}
                    onChange={(event) => updateRow(row.id, { low_stock_threshold: Number(event.target.value) })}
                  />
                </Field>

                <div className="lg:col-span-1 flex items-center justify-end pb-1">
                  <IconButton
                    icon={<Trash2 size={16} />}
                    variant="danger"
                    size="sm"
                    aria-label={`Remove ${row.name || 'item'}`}
                    onClick={() => deleteRow(row.id)}
                  />
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      {filteredRows.length === 0 && (
        <EmptyState
          title="No pantry items match filter"
          description="Add staples or switch filters to view your inventory."
        />
      )}

      {/* Standalone Audit Trail Log */}
      {auditLog.length > 0 && (
        <Card tone="subtle" padding="lg" className="space-y-3 mt-6">
          <div className="flex items-center gap-2 pb-2 border-b border-casa-border/60">
            <History size={18} className="text-casa-gold" />
            <Heading role="heading" className="font-display text-heading font-bold text-casa-navy">
              Pantry Inventory Audit History ({auditLog.length})
            </Heading>
          </div>
          <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
            {auditLog.slice(0, 30).map((entry) => (
              <div
                key={entry.id}
                className="rounded-xl border border-casa-border bg-casa-surface p-3 flex flex-wrap items-center justify-between gap-2"
              >
                <div>
                  <p className="text-body-sm font-semibold text-casa-navy">
                    {entry.name} ·{' '}
                    <span
                      className={cn(
                        'font-bold',
                        entry.delta_packages > 0 ? 'text-emerald-700' : 'text-amber-700',
                      )}
                    >
                      {entry.delta_packages >= 0 ? '+' : ''}
                      {entry.delta_packages} {entry.package_unit || 'packs'}
                    </span>{' '}
                    <span className="text-caption text-casa-muted">({entry.source})</span>
                  </p>
                  <p className="text-caption text-casa-text-secondary mt-0.5">
                    {entry.reason}
                  </p>
                </div>
                <span className="text-caption text-casa-muted font-mono">
                  {new Date(entry.created_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="flex items-center justify-between gap-3 pt-2">
        <Button
          variant="secondary"
          size="lg"
          onClick={addRow}
          leadingIcon={<Plus size={18} />}
          className="font-bold min-h-control"
        >
          Add pantry item
        </Button>
        <Button
          onClick={() => void saveInventory()}
          variant="primary"
          size="lg"
          disabled={saving}
          loading={saving}
          leadingIcon={<Save size={18} />}
          className="font-bold shadow-sm px-6 min-h-control"
        >
          Save pantry inventory
        </Button>
      </div>
    </div>
  )
}
