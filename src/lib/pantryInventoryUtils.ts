export type PantryInventoryAuditSource = 'planner' | 'manual' | 'reconcile'

export type PantryInventoryAuditEntry = {
  id: string
  created_at: string
  source: PantryInventoryAuditSource
  reason: string
  item_key: string
  name: string
  category: string
  package_unit: string | null
  package_size: string | null
  before_packages: number
  delta_packages: number
  after_packages: number
}

const UNIT_ALIASES: Record<string, string> = {
  cans: 'can',
  can: 'can',
  bottle: 'bottle',
  bottles: 'bottle',
  jar: 'jar',
  jars: 'jar',
  bag: 'bag',
  bags: 'bag',
  box: 'box',
  boxes: 'box',
  carton: 'carton',
  cartons: 'carton',
  pack: 'pack',
  packs: 'pack',
  bunch: 'bunch',
  bunches: 'bunch',
  bottleful: 'bottle',
}

function normalizeKeyToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function normalizePantryKey(name: string, category: string): string {
  return `${normalizeKeyToken(name)}::${normalizeKeyToken(category || 'other')}`
}

export function normalizePackageUnit(unit: string | null | undefined): string | null {
  if (!unit) return null
  const normalized = normalizeKeyToken(unit)
  if (!normalized) return null
  return UNIT_ALIASES[normalized] ?? normalized
}

export function inferDefaultPackageMeta(name: string, category: string): { unit: string | null; size: string | null } {
  const n = normalizeKeyToken(name)
  if (/(oil|vinegar|soy sauce|hot sauce|syrup)/.test(n)) return { unit: 'bottle', size: '16 fl oz' }
  if (/(broth|stock)/.test(n)) return { unit: 'carton', size: '32 fl oz' }
  if (/(beans|corn|tomato|coconut milk|chickpeas)/.test(n)) return { unit: 'can', size: '15 oz' }
  if (/(rice|flour|sugar|oats|pasta)/.test(n)) return { unit: 'bag', size: '2 lb' }
  if (/(spice|paprika|cumin|oregano|garlic powder|chili powder|pepper)/.test(n)) return { unit: 'jar', size: '2 oz' }
  if (category === 'produce') return { unit: 'bunch', size: null }
  return { unit: 'pack', size: null }
}

export function sanitizePantryInventoryAudit(raw: unknown): PantryInventoryAuditEntry[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((row) => {
      if (!row || typeof row !== 'object') return null
      const item = row as Record<string, unknown>
      const id = String(item.id ?? '').trim()
      const name = String(item.name ?? '').trim()
      const category = String(item.category ?? 'other').trim().toLowerCase() || 'other'
      const itemKey = String(item.item_key ?? '').trim()
      const source = String(item.source ?? '').trim() as PantryInventoryAuditSource
      if (!id || !name || !itemKey || !['planner', 'manual', 'reconcile'].includes(source)) return null
      const before = Number(item.before_packages)
      const delta = Number(item.delta_packages)
      const after = Number(item.after_packages)
      if (!Number.isFinite(before) || !Number.isFinite(delta) || !Number.isFinite(after)) return null
      return {
        id,
        created_at: typeof item.created_at === 'string' ? item.created_at : new Date().toISOString(),
        source,
        reason: String(item.reason ?? '').trim() || source,
        item_key: itemKey,
        name,
        category,
        package_unit: typeof item.package_unit === 'string' ? item.package_unit : null,
        package_size: typeof item.package_size === 'string' ? item.package_size : null,
        before_packages: Number(before.toFixed(2)),
        delta_packages: Number(delta.toFixed(2)),
        after_packages: Number(after.toFixed(2)),
      } as PantryInventoryAuditEntry
    })
    .filter((row): row is PantryInventoryAuditEntry => row !== null)
    .slice(0, 300)
}

export function appendPantryInventoryAudit(
  existing: PantryInventoryAuditEntry[],
  incoming: PantryInventoryAuditEntry[],
  max = 300,
): PantryInventoryAuditEntry[] {
  return [...incoming, ...existing].slice(0, Math.max(1, max))
}
