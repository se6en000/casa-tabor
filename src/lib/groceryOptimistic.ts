// A grocery added shows on the list at once (Jake, Oct 2: "experiential responsiveness"): it used to wait for its own
// insert and then a reload, one item after another. Its stand-in id is replaced when the list is fetched again.

export const ADDING_PREFIX = 'adding-'

interface CachedList { lists: unknown[]; items: Array<Record<string, unknown> & { id: string; name: string; checked: boolean }> }

/** The cached list with a just-added item on it (once: not if an open item already has that name). */
export function withAddedGrocery(old: CachedList | undefined, item: { list_id: string; name: string; quantity: string | null; unit: string | null; category: string; notes?: string | null }, id: string): CachedList | undefined {
  if (!old) return old
  const name = item.name.trim().replace(/\s+/g, ' ')
  if (!name || old.items.some((i) => !i.checked && i.name.toLowerCase() === name.toLowerCase())) return old
  const now = new Date().toISOString()
  return {
    ...old,
    items: [...old.items, {
      id, list_id: item.list_id, name, quantity: item.quantity, unit: item.unit, category: item.category, checked: false, notes: item.notes ?? null,
      created_at: now, updated_at: now, deleted_at: null, ios_reminder_id: null, ios_updated_at: null, sync_version: 0, last_modified_source: 'casa',
      canonical_item_id: null, subcategory: null, brand: null, store_section: null, enhancement_confidence: null, enhanced_at: null,
    }],
  }
}
