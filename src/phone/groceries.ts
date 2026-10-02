import { parseGroceryVoiceBatch, parseSingleVoiceItem } from '../utils/groceryBatchVoiceParser.ts'
import { GROCERY_CATEGORY_KEYS, normalizeComparableName, type GroceryCategoryKey } from '../utils/groceryCategorization.ts'

// Groceries on the phone (canvas 33d/33e, Jake, Oct 2): the list for one moment, standing in a store with one hand free.
// What's left, by aisle in store order; the amount right by the name; a tick stays put until a pause after your last
// one (as iPhone Reminders does), so several can be ticked before the list moves. Pure, so it's tested without a database.

export interface ShopItem {
  id: string
  name: string
  quantity: string | null
  unit: string | null
  category: string
  checked: boolean
}

const LABELS: Record<GroceryCategoryKey, string> = {
  produce: 'PRODUCE',
  dairy: 'DAIRY & EGGS',
  meat: 'MEAT & SEAFOOD',
  bakery: 'BAKERY',
  frozen: 'FROZEN',
  pantry: 'PANTRY',
  beverages: 'DRINKS',
  snacks: 'SNACKS',
  deli: 'DELI',
  household: 'HOUSEHOLD',
  'personal-care': 'PERSONAL CARE',
  baby: 'BABY',
  pet: 'PET',
  other: 'OTHER',
}

export interface Aisle { key: string; label: string; items: ShopItem[] }

/** Every aisle in store order, for moving an item to the right one (hold and drag, Jake Oct 2). */
export const ALL_AISLES: Array<{ key: string; label: string }> = GROCERY_CATEGORY_KEYS.map((key) => ({ key, label: LABELS[key] }))

/** The aisles in store order, what's left in each (and what was ticked a moment ago, still in place), and what's done. */
export function aisles(items: ShopItem[], held: Set<string>): { groups: Aisle[]; done: ShopItem[] } {
  const byName = (a: ShopItem, b: ShopItem) => a.name.localeCompare(b.name)
  const keyOf = (i: ShopItem) => ((GROCERY_CATEGORY_KEYS as readonly string[]).includes(i.category) ? i.category : 'other')
  const shown = items.filter((i) => !i.checked || held.has(i.id))
  const groups = GROCERY_CATEGORY_KEYS
    .map((key) => ({ key, label: LABELS[key], items: shown.filter((i) => keyOf(i) === key).sort(byName) }))
    .filter((g) => g.items.length > 0)
  return { groups, done: items.filter((i) => i.checked && !held.has(i.id)).sort(byName) }
}

/** "3", "1 gallon" — nothing for a plain one. */
export function amountOf(item: ShopItem): string {
  const q = item.quantity?.trim() ?? ''
  const u = item.unit?.trim() ?? ''
  if (!q && !u) return ''
  if (q === '1' && !u) return ''
  return [q, u].filter(Boolean).join(' ')
}

export type AddPlan =
  | { kind: 'new'; name: string; quantity: string | null; unit: string | null; category: string }
  | { kind: 'again'; id: string; name: string }
  | { kind: 'already'; id: string; name: string }

/**
 * "paper towels, 2 limes and milk": each item into its aisle; one already on the list isn't doubled; a ticked one comes
 * back. Typed, only commas and "and" split ("chocolate milk" is one thing); spoken, a run-on list is split too.
 */
export function planAdds(text: string, items: ShopItem[], { spoken = false }: { spoken?: boolean } = {}): AddPlan[] {
  const seen = new Map(items.map((i) => [sameKey(i.name), i]))
  const parsed = spoken
    ? parseGroceryVoiceBatch(text)
    : text.split(/\s*[,;\n]\s*(?:and\s+)?|\s+(?:and|plus)\s+/i).map((seg) => parseSingleVoiceItem(seg.trim())).filter((p): p is NonNullable<typeof p> => Boolean(p && p.name.length >= 2))
  return parsed.map((p) => {
    const there = seen.get(sameKey(p.name))
    if (there) return there.checked ? { kind: 'again', id: there.id, name: there.name } : { kind: 'already', id: there.id, name: there.name }
    return { kind: 'new', name: p.name, quantity: p.quantity, unit: p.unit, category: p.category }
  })
}

/** One item however it's written: "Milk, 2%" and "milk", "Limes" and "lime" (numbers and plurals set aside). */
function sameKey(name: string): string {
  return normalizeComparableName(name).split(' ')
    .filter((w) => w && !/^\d+$/.test(w))
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
    .join(' ')
}

/** The usual items, most bought first, leaving out what's already on the list. */
export function usuals(history: string[], open: ShopItem[], limit = 8): string[] {
  const openNames = new Set(open.filter((i) => !i.checked).map((i) => normalizeComparableName(i.name)))
  const count = new Map<string, { name: string; n: number; first: number }>()
  history.forEach((name, at) => {
    const key = normalizeComparableName(name)
    if (!key || openNames.has(key)) return
    const was = count.get(key)
    if (was) was.n += 1
    else count.set(key, { name: name.trim().replace(/^\w/, (c) => c.toUpperCase()), n: 1, first: at })
  })
  return [...count.values()].sort((a, b) => b.n - a.n || a.first - b.first).slice(0, limit).map((c) => c.name)
}
