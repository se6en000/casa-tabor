import { useEffect, useMemo, useState } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatSupabaseError } from '../lib/formatSupabaseError'
import {
  appendPantryInventoryAudit,
  normalizePackageUnit,
  normalizePantryKey,
  sanitizePantryInventoryAudit,
  type PantryInventoryAuditEntry,
} from '../lib/pantryInventoryUtils'
import { Alert, Button, Card, EmptyState, Field, Heading, Input, Select, SkeletonRow, Text } from '../components/ui'
import { SettingsPageHeader } from '../components/settings'

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

export default function PantryInventorySettingsPage() {
  const [rows, setRows] = useState<PantryInventoryRow[]>([])
  const [baselineInventory, setBaselineInventory] = useState<Record<string, Omit<PantryInventoryRow, 'id'>>>({})
  const [auditLog, setAuditLog] = useState<PantryInventoryAuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

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
        setBaselineInventory(Object.fromEntries(nextRows.map((row) => [row.id, {
          name: row.name,
          category: row.category,
          package_unit: row.package_unit,
          package_size: row.package_size,
          on_hand_packages: row.on_hand_packages,
          low_stock_threshold: row.low_stock_threshold,
          updated_at: row.updated_at,
        }])))
        setAuditLog(sanitizePantryInventoryAudit(rowMap.get('meal_planner_pantry_audit_log')))
      } catch (loadError) {
        if (!active) return
        setError(formatSupabaseError(loadError, 'Could not load pantry inventory'))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  const lowStockCount = useMemo(
    () => rows.filter((row) => row.on_hand_packages <= row.low_stock_threshold).length,
    [rows],
  )

  function addRow() {
    setRows((current) => ([
      ...current,
      {
        id: crypto.randomUUID(),
        name: '',
        category: 'pantry',
        package_unit: '',
        package_size: '',
        on_hand_packages: 1,
        low_stock_threshold: 0.5,
        updated_at: new Date().toISOString(),
      },
    ]))
  }

  function updateRow(id: string, patch: Partial<PantryInventoryRow>) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row))
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

      const { error: saveError } = await supabase.from('settings').upsert([
        { key: 'meal_planner_pantry_inventory', value: payload, updated_at: nowIso },
        { key: 'meal_planner_pantry_audit_log', value: nextAuditLog, updated_at: nowIso },
      ], { onConflict: 'key' })
      if (saveError) throw saveError
      const nextRows = sanitizeInventory(payload)
      setRows(nextRows)
      setBaselineInventory(Object.fromEntries(nextRows.map((row) => [row.id, {
        name: row.name,
        category: row.category,
        package_unit: row.package_unit,
        package_size: row.package_size,
        on_hand_packages: row.on_hand_packages,
        low_stock_threshold: row.low_stock_threshold,
        updated_at: row.updated_at,
      }])))
      setAuditLog(nextAuditLog)
      setStatus('Pantry inventory saved.')
    } catch (saveError) {
      setError(formatSupabaseError(saveError, 'Could not save pantry inventory'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="space-y-4"><SkeletonRow /><SkeletonRow /><SkeletonRow /></div>

  return (
    <div className="space-y-5">
      <SettingsPageHeader title="Pantry Inventory" description="Track package counts and low-stock thresholds used by Meal Planner AI." />
      <Card>
        <Text role="caption" muted>{rows.length} tracked item{rows.length === 1 ? '' : 's'} · {lowStockCount} currently low</Text>
        <Text role="caption" muted>Audit trail: {auditLog.length} recent inventory change{auditLog.length === 1 ? '' : 's'}</Text>
      </Card>

      <div className="space-y-2">
        {rows.map((row) => (
          <Card key={row.id}>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
              <Field label="Item" className="md:col-span-3">
                <Input
                  value={row.name}
                  onChange={(event) => updateRow(row.id, { name: event.target.value })}
                />
              </Field>
              <Field label="Category" className="md:col-span-2">
                <Select
                  value={row.category}
                  onChange={(event) => updateRow(row.id, { category: event.target.value })}
                >
                  <option value="pantry">pantry</option>
                  <option value="produce">produce</option>
                  <option value="dairy">dairy</option>
                  <option value="meat">meat</option>
                  <option value="bakery">bakery</option>
                  <option value="other">other</option>
                </Select>
              </Field>
              <Field label="Pack unit" className="md:col-span-2">
                <Input
                  value={row.package_unit}
                  onChange={(event) => updateRow(row.id, { package_unit: event.target.value })}
                  placeholder="bottle"
                />
              </Field>
              <Field label="Pack size" className="md:col-span-2">
                <Input
                  value={row.package_size}
                  onChange={(event) => updateRow(row.id, { package_size: event.target.value })}
                  placeholder="16 fl oz"
                />
              </Field>
              <Field label="On hand" className="md:col-span-2">
                <Input
                  type="number"
                  min={0}
                  step={0.25}
                  value={row.on_hand_packages}
                  onChange={(event) => updateRow(row.id, { on_hand_packages: Number(event.target.value) })}
                />
              </Field>
              <Field label="Low at" className="md:col-span-2">
                <Input
                  type="number"
                  min={0}
                  step={0.25}
                  value={row.low_stock_threshold}
                  onChange={(event) => updateRow(row.id, { low_stock_threshold: Number(event.target.value) })}
                />
              </Field>
              <div className="md:col-span-12 flex justify-end">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => deleteRow(row.id)}
                  leadingIcon={<Trash2 size={16} />}
                >
                  Remove
                </Button>
              </div>

              {auditLog.length > 0 && (
                <Card className="md:col-span-12">
                  <Heading role="heading">Recent inventory activity</Heading>
                  <div className="mt-2 max-h-52 space-y-1.5 overflow-y-auto pr-1">
                    {auditLog.slice(0, 20).map((entry) => (
                      <div key={entry.id} className="rounded-lg border border-casa-border bg-casa-bg px-2.5 py-2">
                        <Text role="caption">
                          {entry.name} · {entry.delta_packages >= 0 ? '+' : ''}{entry.delta_packages} ({entry.source})
                        </Text>
                        <Text role="caption" muted>
                          {entry.reason} · {new Date(entry.created_at).toLocaleString()}
                        </Text>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          </Card>
        ))}
      </div>

      {rows.length === 0 && <EmptyState title="No pantry items yet" description="Add the staples you want Meal Planner AI to track." />}
      {error && <Alert tone="danger" title="Could not save pantry inventory">{error}</Alert>}
      {!error && status && <Alert tone="success" title={status} />}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          onClick={addRow}
          leadingIcon={<Plus size={16} />}
        >
          Add pantry item
        </Button>
        <Button
          onClick={() => void saveInventory()}
          loading={saving}
          leadingIcon={<Save size={16} />}
        >
          Save pantry inventory
        </Button>
      </div>
    </div>
  )
}
