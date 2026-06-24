import { useCallback, useEffect, useRef, useState } from 'react'
import { ShoppingCart, Trash2, CheckSquare, Square, X, Plus, RefreshCw, Mic } from 'lucide-react'
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

const SYNC_CURSOR_KEY = 'grocery-sync-cursor-v1'
const SYNC_LAST_AT_KEY = 'grocery-sync-last-at-v1'
const SYNC_LAST_SUMMARY_KEY = 'grocery-sync-last-summary-v1'
const AUTO_SYNC_INTERVAL_MS = 45_000
const QUICK_ADD_TOUCH_ITEMS = ['Milk', 'Eggs', 'Bread', 'Bananas', 'Chicken', 'Coffee']
const CHECKED_ITEM_DISMISS_MS = 1_500

function detectCategory(name: string): string {
  const lower = name.toLowerCase()
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return cat
  }
  return 'other'
}

function ItemRow({ item, onToggle, onDelete, isDismissing = false }: {
  item: GroceryItem
  onToggle: (id: string, checked: boolean) => void
  onDelete: (id: string) => void
  isDismissing?: boolean
}) {
  const visualChecked = item.checked || Boolean(isDismissing)

  return (
    <div className={cn(
      'flex items-center gap-3 px-4 py-3 hover:bg-casa-bg/50 transition-colors group',
      visualChecked && 'opacity-50'
    )}>
      <button
        type="button"
        onClick={() => onToggle(item.id, !visualChecked)}
        className="flex-shrink-0 text-casa-navy/60 hover:text-casa-gold transition-colors"
      >
        {visualChecked
          ? <CheckSquare size={20} className="text-emerald-500" />
          : <Square size={20} />}
      </button>
      <div className="flex-1 min-w-0">
        <span className={cn(
          'text-body text-casa-text',
          visualChecked && 'line-through text-casa-muted'
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
        className="opacity-70 lg:opacity-0 lg:group-hover:opacity-100 flex-shrink-0 text-casa-muted hover:text-red-500 transition-all"
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
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(() => localStorage.getItem(SYNC_LAST_AT_KEY))
  const [lastSyncSummary, setLastSyncSummary] = useState<string>(() => localStorage.getItem(SYNC_LAST_SUMMARY_KEY) ?? 'Not synced yet')
  const [showCompletedArchive, setShowCompletedArchive] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const syncInFlightRef = useRef(false)
  const completionTimersRef = useRef<Map<string, number>>(new Map())
  const [dismissingIds, setDismissingIds] = useState<Set<string>>(new Set())

  const handleAddItem = () => {
    const name = inputValue.trim()
    if (!name || !defaultListId) return
    const category = detectCategory(name)
    addItem.mutate({ list_id: defaultListId, name, quantity: null, unit: null, category, checked: false, notes: null })
    setInputValue('')
    inputRef.current?.focus()
  }

  const handleQuickAdd = (name: string) => {
    if (!defaultListId) return
    const trimmed = name.trim()
    if (!trimmed) return
    const category = detectCategory(trimmed)
    addItem.mutate({ list_id: defaultListId, name: trimmed, quantity: null, unit: null, category, checked: false, notes: null })
  }

  const handleVoiceAdd = () => {
    const prompt = inputValue.trim()
      ? `Add these grocery items to the shopping list: ${inputValue.trim()}`
      : 'Add items to the grocery list.'
    document.dispatchEvent(new CustomEvent('open-ai-chat', {
      detail: {
        prompt,
        autoSend: false,
        source: 'grocery-voice-add',
      },
    }))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddItem()
    }
  }

  useEffect(() => {
    const timers = completionTimersRef.current
    return () => {
      for (const timeoutId of timers.values()) {
        window.clearTimeout(timeoutId)
      }
      timers.clear()
    }
  }, [])

  const handleToggle = (id: string, checked: boolean) => {
    const existingTimer = completionTimersRef.current.get(id)
    if (existingTimer) {
      window.clearTimeout(existingTimer)
      completionTimersRef.current.delete(id)
    }

    if (!checked) {
      setDismissingIds(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      toggleItem.mutate({ id, checked: false })
      return
    }

    setDismissingIds(prev => new Set(prev).add(id))

    const timeoutId = window.setTimeout(() => {
      completionTimersRef.current.delete(id)
      toggleItem.mutate(
        { id, checked: true },
        {
          onSettled: () => {
            setDismissingIds(prev => {
              const next = new Set(prev)
              next.delete(id)
              return next
            })
          },
        }
      )
    }, CHECKED_ITEM_DISMISS_MS)
    completionTimersRef.current.set(id, timeoutId)
  }

  const handleSyncNow = useCallback(async () => {
    if (syncInFlightRef.current) return
    syncInFlightRef.current = true
    setSyncing(true)
    setSyncError(null)
    try {
      const since = localStorage.getItem(SYNC_CURSOR_KEY)
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
      if (nextCursor) localStorage.setItem(SYNC_CURSOR_KEY, nextCursor)

      const nowIso = new Date().toISOString()
      localStorage.setItem(SYNC_LAST_AT_KEY, nowIso)
      localStorage.setItem(SYNC_LAST_SUMMARY_KEY, summary)
      setLastSyncAt(nowIso)
      setLastSyncSummary(summary)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sync failed'
      setSyncError(message)
    } finally {
      syncInFlightRef.current = false
      setSyncing(false)
    }
  }, [])

  useEffect(() => {
    const kickoff = window.setTimeout(() => {
      void handleSyncNow()
    }, 1_500)

    const intervalId = window.setInterval(() => {
      void handleSyncNow()
    }, AUTO_SYNC_INTERVAL_MS)

    const handleFocus = () => {
      if (document.visibilityState === 'visible') {
        void handleSyncNow()
      }
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleFocus)

    return () => {
      window.clearTimeout(kickoff)
      window.clearInterval(intervalId)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleFocus)
    }
  }, [handleSyncNow])

  const activeItemsByCategory = GROCERY_CATEGORIES.map(cat => ({
    ...cat,
    items: items.filter(i => i.category === cat.key && !i.checked),
  })).filter(cat => cat.items.length > 0)

  const completedItemsByCategory = GROCERY_CATEGORIES.map(cat => ({
    ...cat,
    items: items.filter(i => i.category === cat.key && i.checked),
  })).filter(cat => cat.items.length > 0)

  return (
    <div className="h-full min-h-0 bg-casa-bg flex flex-col overflow-hidden">
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
      <div className="flex-1 min-h-0 overflow-y-auto touch-pan-y">
        <div className="max-w-6xl mx-auto px-4">
        {isLoading ? (
            <div className="pt-6 space-y-4">
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
            <div className="pt-3 pb-6">
              {activeItemsByCategory.length === 0 ? (
                <div className="mb-4 rounded-2xl border border-casa-border bg-casa-surface p-4 text-sm text-casa-muted">
                  Active list is clear. Completed items are hidden in the archive.
                </div>
              ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
                {activeItemsByCategory.map(cat => (
                  <div key={cat.key}>
                    <div className="px-1 pb-1">
                  <p className="text-caption font-semibold text-casa-muted uppercase tracking-wider">
                    {cat.label}
                  </p>
                </div>
                    <div className="bg-casa-surface rounded-2xl border border-casa-border divide-y divide-casa-divider overflow-hidden">
                  {cat.items.map(item => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      isDismissing={dismissingIds.has(item.id)}
                      onToggle={handleToggle}
                      onDelete={(id) => deleteItem.mutate(id)}
                    />
                  ))}
                </div>
              </div>
                ))}
              </div>
              )}

              {completedItemsByCategory.length > 0 && (
                <div className="mt-5">
                  <button
                    type="button"
                    onClick={() => setShowCompletedArchive(prev => !prev)}
                    className="px-1 pb-2 text-caption font-semibold text-casa-muted uppercase tracking-wider hover:text-casa-text transition-colors"
                  >
                    {showCompletedArchive ? 'Hide completed archive' : `Show completed archive (${checkedCount})`}
                  </button>
                  {showCompletedArchive && (
                    <div className="space-y-3">
                      {completedItemsByCategory.map(cat => (
                      <div key={`completed-${cat.key}`}>
                        <div className="px-1 pb-1">
                          <p className="text-[11px] font-semibold text-casa-muted uppercase tracking-wider">
                            {cat.label}
                          </p>
                        </div>
                        <div className="bg-casa-surface rounded-2xl border border-casa-border divide-y divide-casa-divider overflow-hidden">
                          {cat.items.map(item => (
                            <ItemRow
                              key={item.id}
                              item={item}
                              onToggle={handleToggle}
                              onDelete={(id) => deleteItem.mutate(id)}
                            />
                          ))}
                        </div>
                      </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="sticky bottom-0 z-20 mt-5 border-t border-casa-border bg-casa-surface/95 backdrop-blur px-3 py-3 pb-safe-b rounded-t-2xl">
                <div className="flex items-center gap-2 bg-casa-bg rounded-2xl border border-casa-border px-4 py-3 min-h-14 shadow-sm">
                  <Plus size={18} className="text-casa-muted flex-shrink-0" />
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
                      'flex-shrink-0 min-h-10 px-4 rounded-button text-body-sm font-semibold transition-all',
                      inputValue.trim()
                        ? 'bg-casa-gold text-white hover:brightness-110'
                        : 'text-casa-muted'
                    )}
                  >
                    Add
                  </button>
                </div>
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                  <button
                    type="button"
                    onClick={handleVoiceAdd}
                    className="flex-shrink-0 min-h-9 px-3 rounded-full border border-casa-gold/40 bg-casa-gold/10 text-body-sm text-casa-navy hover:bg-casa-gold/20 transition-colors inline-flex items-center gap-1.5"
                  >
                    <Mic size={14} />
                    Voice add
                  </button>
                  {QUICK_ADD_TOUCH_ITEMS.map(item => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => handleQuickAdd(item)}
                      className="flex-shrink-0 min-h-9 px-3 rounded-full border border-casa-border bg-casa-bg text-body-sm text-casa-text hover:bg-casa-main transition-colors"
                    >
                      + {item}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-casa-muted">
                  Tip: tap Voice add, then say “add milk, eggs, and bananas.”
                </p>
              </div>
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
