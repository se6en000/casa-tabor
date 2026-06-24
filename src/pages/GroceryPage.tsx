import { useEffect, useRef, useState } from 'react'
import { ShoppingCart, Trash2, CheckSquare, Square, X, Plus, RefreshCw } from 'lucide-react'
import { cn } from '../utils/cn'
import { useGroceryList, GROCERY_CATEGORIES, type GroceryItem } from '../hooks/useGroceryList'
import { supabase } from '../lib/supabase'

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  produce:   ['apple', 'banana', 'orange', 'grape', 'berry', 'lettuce', 'spinach', 'kale', 'broccoli', 'carrot', 'tomato', 'onion', 'garlic', 'pepper', 'cucumber', 'celery', 'avocado', 'lemon', 'lime', 'mango', 'strawberr', 'blueberr', 'salad', 'herb', 'basil', 'cilantro', 'parsley', 'zucchini', 'potato', 'yam', 'corn', 'bean', 'pea', 'mushroom'],
  dairy:     ['milk', 'cheese', 'butter', 'cream', 'yogurt', 'egg', 'sour cream', 'cottage', 'mozzarella', 'cheddar', 'parmesan', 'half and half', 'whipped'],
  meat:      ['chicken', 'beef', 'steak', 'pork', 'fish', 'salmon', 'tuna', 'shrimp', 'turkey', 'bacon', 'sausage', 'lamb', 'ground', 'ribs', 'wings', 'lobster', 'crab', 'tilapia'],
  bakery:    ['bread', 'bagel', 'muffin', 'croissant', 'bun', 'roll', 'cake', 'cookie', 'pie', 'tortilla', 'wrap', 'pita'],
  frozen:    ['frozen', 'ice cream', 'sorbet', 'pizza', 'waffle', 'fries', 'edamame'],
  pantry:    ['pasta', 'rice', 'cereal', 'oat', 'flour', 'sugar', 'salt', 'oil', 'vinegar', 'sauce', 'soup', 'broth', 'stock', 'can', 'bean', 'lentil', 'nut', 'peanut', 'almond', 'cashew', 'chip', 'cracker', 'popcorn', 'honey', 'jam', 'jelly', 'syrup', 'ketchup', 'mustard', 'mayo', 'spice', 'seasoning'],
  beverages: ['water', 'juice', 'soda', 'coffee', 'tea', 'beer', 'wine', 'sparkling', 'lemonade', 'smoothie', 'energy', 'drink'],
}

function detectCategory(name: string): string {
  const lower = name.toLowerCase()
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return cat
  }
  return 'other'
}

function ItemRow({ item, onToggle, onDelete }: {
  item: GroceryItem
  onToggle: (id: string, checked: boolean) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className={cn(
      'flex items-center gap-3 px-4 py-3 hover:bg-casa-bg/50 transition-colors group',
      item.checked && 'opacity-50'
    )}>
      <button
        type="button"
        onClick={() => onToggle(item.id, !item.checked)}
        className="flex-shrink-0 text-casa-navy/60 hover:text-casa-gold transition-colors"
      >
        {item.checked
          ? <CheckSquare size={20} className="text-emerald-500" />
          : <Square size={20} />}
      </button>
      <div className="flex-1 min-w-0">
        <span className={cn(
          'text-body text-casa-text',
          item.checked && 'line-through text-casa-muted'
        )}>
          {item.name}
        </span>
        {(item.quantity || item.unit) && (
          <span className="ml-2 text-caption text-casa-muted">
            {item.quantity}{item.unit ? ' ' + item.unit : ''}
          </span>
        )}
        {item.notes && (
          <p className="text-caption text-casa-muted truncate mt-0.5">{item.notes}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDelete(item.id)}
        className="opacity-0 group-hover:opacity-100 flex-shrink-0 text-casa-muted hover:text-red-500 transition-all"
      >
        <X size={15} />
      </button>
    </div>
  )
}

export default function GroceryPage() {
  const {
    items,
    defaultListId,
    uncheckedCount,
    checkedCount,
    isLoading,
    addItem,
    toggleItem,
    deleteItem,
    clearChecked,
  } = useGroceryList()

  const [inputValue, setInputValue] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const [lastSyncSummary, setLastSyncSummary] = useState<string>('Not synced yet')
  const inputRef = useRef<HTMLInputElement>(null)
  const syncCursorKey = 'grocery-sync-cursor-v1'
  const syncLastAtKey = 'grocery-sync-last-at-v1'
  const syncLastSummaryKey = 'grocery-sync-last-summary-v1'

  useEffect(() => {
    setLastSyncAt(localStorage.getItem(syncLastAtKey))
    setLastSyncSummary(localStorage.getItem(syncLastSummaryKey) ?? 'Not synced yet')
  }, [])

  const handleAddItem = () => {
    const name = inputValue.trim()
    if (!name || !defaultListId) return
    const category = detectCategory(name)
    addItem.mutate({ list_id: defaultListId, name, quantity: null, unit: null, category, checked: false, notes: null })
    setInputValue('')
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddItem()
    }
  }

  const handleSyncNow = async () => {
    setSyncing(true)
    setSyncError(null)
    try {
      const since = localStorage.getItem(syncCursorKey)
      const { data, error } = await supabase.functions.invoke('sync-casa-to-ios', {
        body: { since, limit: 300 },
      })
      if (error) throw error

      const deltas = Array.isArray(data?.deltas) ? data.deltas : []
      const deleted = deltas.filter((d: { deleted?: boolean }) => d.deleted).length
      const changed = deltas.length - deleted
      const summary = deltas.length === 0
        ? 'No new changes to sync'
        : `${changed} update${changed === 1 ? '' : 's'} and ${deleted} delete${deleted === 1 ? '' : 's'} ready`

      const nextCursor = typeof data?.next_cursor === 'string' ? data.next_cursor : null
      if (nextCursor) localStorage.setItem(syncCursorKey, nextCursor)

      const nowIso = new Date().toISOString()
      localStorage.setItem(syncLastAtKey, nowIso)
      localStorage.setItem(syncLastSummaryKey, summary)
      setLastSyncAt(nowIso)
      setLastSyncSummary(summary)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sync failed'
      setSyncError(message)
    } finally {
      setSyncing(false)
    }
  }

  // Show all items including checked, grouped by category
  const allItemsByCategory = GROCERY_CATEGORIES.map(cat => ({
    ...cat,
    items: items.filter(i => i.category === cat.key),
  })).filter(cat => cat.items.length > 0)

  return (
    <div className="min-h-screen bg-casa-bg pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-casa-surface border-b border-casa-border px-4 pt-safe-t">
        <div className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-casa-gold/10 flex items-center justify-center">
              <ShoppingCart size={20} className="text-casa-gold" />
            </div>
            <div>
              <h1 className="font-display text-heading text-casa-text">Grocery List</h1>
              <p className="text-caption text-casa-muted">
                {uncheckedCount} item{uncheckedCount !== 1 ? 's' : ''} remaining
                {checkedCount > 0 && ` · ${checkedCount} done`}
              </p>
              <p className="text-[11px] text-casa-muted">
                {lastSyncSummary}
                {lastSyncAt ? ` · ${new Date(lastSyncAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSyncNow}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-button text-caption font-medium text-casa-muted border border-casa-border hover:bg-casa-bg transition-colors disabled:opacity-60"
            >
              <RefreshCw size={13} className={cn(syncing && 'animate-spin')} />
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
            {checkedCount > 0 && (
              <button
                type="button"
                onClick={() => clearChecked.mutate()}
                disabled={clearChecked.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-button text-caption font-medium text-casa-muted border border-casa-border hover:bg-casa-bg hover:text-red-500 hover:border-red-300 transition-colors"
              >
                <Trash2 size={13} />
                Clear done
              </button>
            )}
          </div>
        </div>
        {syncError && (
          <p className="pb-3 text-[11px] text-red-600">Sync error: {syncError}</p>
        )}
      </div>

      {/* Content */}
      <div className="max-w-lg mx-auto">
        {isLoading ? (
          <div className="px-4 pt-6 space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-4 bg-casa-divider rounded w-24 mb-3" />
                {[...Array(3)].map((_, j) => (
                  <div key={j} className="h-12 bg-casa-surface rounded-xl mb-1" />
                ))}
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center px-8">
            <ShoppingCart size={40} className="text-casa-gold opacity-40" />
            <p className="text-body font-semibold text-casa-text">Your list is empty</p>
            <p className="text-body-sm text-casa-muted">Add items below or ask the AI.</p>
          </div>
        ) : (
          <div className="pt-2 pb-4">
            {allItemsByCategory.map(cat => (
              <div key={cat.key} className="mb-2">
                <div className="px-4 pt-4 pb-1">
                  <p className="text-caption font-semibold text-casa-muted uppercase tracking-wider">
                    {cat.label}
                  </p>
                </div>
                <div className="bg-casa-surface mx-4 rounded-2xl border border-casa-border divide-y divide-casa-divider overflow-hidden">
                  {cat.items.map(item => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      onToggle={(id, checked) => toggleItem.mutate({ id, checked })}
                      onDelete={(id) => deleteItem.mutate(id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick-add bar — pinned at bottom */}
      <div className="fixed bottom-[var(--spacing-nav-height,64px)] left-0 right-0 z-20 bg-casa-surface border-t border-casa-border px-4 py-3 pb-safe-b">
        <div className="max-w-lg mx-auto flex items-center gap-2 bg-casa-bg rounded-xl border border-casa-border px-3 py-2">
          <Plus size={16} className="text-casa-muted flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add an item…"
            className="flex-1 bg-transparent text-body text-casa-text placeholder:text-casa-muted outline-none"
          />
          <button
            type="button"
            onClick={handleAddItem}
            disabled={!inputValue.trim() || !defaultListId}
            className={cn(
              'flex-shrink-0 px-3 py-1 rounded-button text-caption font-semibold transition-all',
              inputValue.trim()
                ? 'bg-casa-gold text-white hover:brightness-110'
                : 'text-casa-muted'
            )}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  )
}
