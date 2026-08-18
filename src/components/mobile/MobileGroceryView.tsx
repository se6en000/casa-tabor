import { useState, useRef, useCallback, type KeyboardEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ShoppingCart,
  Plus,
  Trash2,
  X,
  Mic,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { cn } from '../../utils/cn'
import { type GroceryItem } from '../../hooks/useGroceryList'
import { categoryIconBadgeClassName, getCategoryTone } from '../../utils/groceryVisuals'
import { useFieldDictation } from '../../hooks/useFieldDictation'
import { normalizeGroceryNameKey } from '../../utils/groceryPredictionDeferrals'
import { Button, Checkbox, Chip, Heading, IconButton } from '../ui'
import type { CategoryVisualDef } from '../grocery/GroceryAisleGrid'

const QUICK_STAPLES = [
  'Milk',
  'Eggs',
  'Bread',
  'Bananas',
  'Chicken',
  'Coffee',
  'Butter',
  'Avocados',
  'Apples',
  'Spinach',
]

export interface MobileCategoryGroup {
  key: string
  label: string
  items: GroceryItem[]
  visual: CategoryVisualDef
}

export interface MobileGroceryViewProps {
  items: GroceryItem[]
  activeCategories: MobileCategoryGroup[]
  completedItems: GroceryItem[]
  uncheckedCount: number
  checkedCount: number
  syncStatusLabel: string
  dismissingIds: Set<string>
  dismissingExitingIds: Set<string>
  deletingIds?: Set<string>
  spotlightedItemId: string | null
  onToggleItem: (id: string, checked: boolean) => void
  onDeleteItem: (id: string) => void
  onUndoDelete?: (id: string) => void
  onClearCompleted?: () => void
  onAddItem: (name: string, options?: { allowDuplicate?: boolean }) => void
}

export default function MobileGroceryView({
  items,
  activeCategories,
  completedItems,
  uncheckedCount,
  checkedCount,
  syncStatusLabel,
  dismissingIds,
  dismissingExitingIds,
  deletingIds,
  spotlightedItemId,
  onToggleItem,
  onDeleteItem,
  onUndoDelete,
  onClearCompleted,
  onAddItem,
}: MobileGroceryViewProps) {
  const [inputValue, setInputValue] = useState('')
  const [isCartOpen, setIsCartOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const triggerHaptic = (durationMs = 8) => {
    try {
      navigator.vibrate?.(durationMs)
    } catch {}
  }

  // Voice dictation
  const {
    supported: dictationSupported,
    listening,
    toggle: toggleDictation,
    resetBuffer: resetDictation,
  } = useFieldDictation({
    onText: (text) => setInputValue(text),
  })

  // Duplicate detection for input
  const activeItems = items.filter((i) => !i.checked && !i.deleted_at)
  const findDuplicate = useCallback(
    (name: string) => {
      const normalized = normalizeGroceryNameKey(name)
      if (!normalized) return null
      return (
        activeItems.find((i) => normalizeGroceryNameKey(i.name) === normalized) ||
        activeItems.find((i) => {
          const existing = normalizeGroceryNameKey(i.name)
          return existing.includes(normalized) || normalized.includes(existing)
        }) ||
        null
      )
    },
    [activeItems]
  )

  const trimmedInput = inputValue.trim()
  const duplicateSuggestion = trimmedInput ? findDuplicate(trimmedInput) : null

  const handleAddCurrentInput = (allowDuplicate = false) => {
    if (!trimmedInput) return
    triggerHaptic(10)
    onAddItem(trimmedInput, { allowDuplicate })
    setInputValue('')
    resetDictation('')
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddCurrentInput()
    }
  }

  const handleQuickStapleAdd = (stapleName: string) => {
    triggerHaptic(8)
    onAddItem(stapleName, { allowDuplicate: false })
  }

  return (
    <div className="flex flex-col min-h-full bg-casa-bg text-casa-text pb-44">
      {/* ── Sticky Top Header ── */}
      <header className="sticky top-0 z-sticky bg-casa-surface/98 backdrop-blur-xl border-b border-casa-border px-4 py-3 shadow-xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-casa-gold/20 text-casa-gold border border-casa-gold/30 shrink-0">
              <ShoppingCart size={16} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Heading role="display-sm" className="font-display text-lg font-bold text-casa-navy leading-none truncate">
                  Grocery List
                </Heading>
                <Chip tone="accent" size="sm" className="font-bold text-2xs px-2 py-0.5">
                  {uncheckedCount} left
                </Chip>
              </div>
              <p className="text-2xs text-casa-muted mt-0.5 truncate font-mono">
                {syncStatusLabel}
              </p>
            </div>
          </div>

          {checkedCount > 0 && onClearCompleted && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                triggerHaptic(12)
                onClearCompleted()
              }}
              leadingIcon={<Trash2 size={13} />}
              className="text-2xs font-semibold text-casa-error hover:bg-casa-error/10 shrink-0 px-2.5 h-8"
            >
              Clear cart ({checkedCount})
            </Button>
          )}
        </div>
      </header>

      {/* ── Main Checklist Content ── */}
      <main className="flex-1 px-3 pt-3 space-y-3">
        {activeCategories.length === 0 && completedItems.length === 0 ? (
          <div className="rounded-3xl border border-casa-border bg-casa-surface p-8 text-center space-y-2 mt-4">
            <div className="w-12 h-12 rounded-2xl bg-casa-gold/15 text-casa-gold flex items-center justify-center mx-auto">
              <ShoppingCart size={24} />
            </div>
            <p className="font-display text-base font-bold text-casa-navy">All Shopped Up!</p>
            <p className="text-caption text-casa-muted max-w-xs mx-auto">
              Your grocery basket is empty. Use the quick-add bar below or tap any common staple to add items.
            </p>
          </div>
        ) : (
          activeCategories.map((group) => {
            const CategoryIcon = group.visual.icon
            return (
              <section
                key={`mobile-group-${group.key}`}
                className="overflow-hidden rounded-2xl border border-casa-border/80 bg-casa-surface shadow-2xs"
              >
                {/* Category Header */}
                <div className="flex items-center justify-between border-b border-casa-border/70 bg-gradient-to-b from-casa-bg to-casa-bg-2 px-3.5 py-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={cn(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-casa-border/80 bg-white shadow-2xs text-casa-navy',
                        categoryIconBadgeClassName(getCategoryTone(group.key))
                      )}
                    >
                      <CategoryIcon size={14} />
                    </div>
                    <span className="truncate font-display text-body-sm font-semibold text-casa-navy">
                      {group.label}
                    </span>
                  </div>
                  <span className="text-3xs font-mono font-semibold text-casa-muted bg-casa-bg-2 px-2 py-0.5 rounded-full border border-casa-border/60">
                    {group.items.length}
                  </span>
                </div>

                {/* Items in Category */}
                <div className="divide-y divide-casa-divider/70">
                  {group.items.length === 0 ? (
                    <div className="px-3.5 py-3 text-center text-3xs font-mono text-casa-muted italic bg-casa-surface-subtle/50">
                      All provisions in cart ✓
                    </div>
                  ) : (
                    <AnimatePresence initial={false}>
                      {group.items.map((item) => {
                        const isDismissQueued = dismissingIds.has(item.id)
                        const isDismissExiting = dismissingExitingIds.has(item.id)
                        const isDeleting = deletingIds?.has(item.id) ?? false
                        const visualChecked = item.checked || isDismissQueued
                        const isSpotlighted = spotlightedItemId === item.id

                        return (
                          <motion.div
                            key={item.id}
                            id={`grocery-item-${item.id}`}
                            layout
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, height: 0, scale: 0.96 }}
                            transition={{ duration: 0.2 }}
                            className={cn(
                              'flex items-center gap-3 px-3.5 py-3 transition-colors duration-150',
                              (visualChecked || isDeleting) && 'opacity-50 bg-casa-surface-subtle',
                              isDismissExiting && 'opacity-0 scale-95',
                              isSpotlighted && 'bg-casa-accent-subtle'
                            )}
                          >
                            {/* Large 48px+ Brass Checkbox Touch Trigger */}
                            {!isDeleting && (
                              <IconButton
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  triggerHaptic(8)
                                  onToggleItem(item.id, !visualChecked)
                                }}
                                aria-label={visualChecked ? `Mark ${item.name} as needed` : `Mark ${item.name} as in cart`}
                                className="flex-shrink-0 -ml-1 p-0 hover:bg-transparent"
                                icon={
                                  <div
                                    className={cn(
                                      'w-[22px] h-[22px] rounded-lg border flex items-center justify-center transition-all duration-200',
                                      visualChecked
                                        ? 'bg-casa-gold border-casa-gold text-white shadow-2xs scale-95'
                                        : 'border-casa-border bg-white text-transparent'
                                    )}
                                  >
                                    <svg className="w-3.5 h-3.5 stroke-current stroke-[2.5]" viewBox="0 0 24 24" fill="none">
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                  </div>
                                }
                              />
                            )}

                            {/* Item Details */}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline gap-1.5 flex-wrap">
                                <span
                                  className={cn(
                                    'text-body-sm font-medium text-casa-navy leading-snug transition-all',
                                    (visualChecked || isDeleting) && 'line-through text-casa-muted/70'
                                  )}
                                >
                                  {item.name}
                                </span>

                                {isDeleting ? (
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="text-3xs font-mono font-medium text-casa-error bg-casa-error/10 px-2 py-0.5 rounded-full border border-casa-error/20">
                                      Deleted
                                    </span>
                                    {onUndoDelete && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => onUndoDelete(item.id)}
                                        className="text-3xs font-semibold text-casa-gold hover:underline p-0 h-auto min-h-0"
                                      >
                                        Undo
                                      </Button>
                                    )}
                                  </div>
                                ) : (
                                  (item.quantity || item.unit) && (
                                    <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-casa-bg-2 border border-casa-border/70 text-3xs font-mono font-medium text-casa-muted shrink-0">
                                      {item.quantity}
                                      {item.unit ? ` ${item.unit}` : ''}
                                    </span>
                                  )
                                )}
                              </div>
                              {item.notes && !isDeleting && (
                                <p className="text-3xs text-casa-muted/80 italic leading-tight truncate mt-0.5">
                                  {item.notes}
                                </p>
                              )}
                            </div>

                            {/* Delete Action (with 44px min hit area) */}
                            {!isDeleting && (
                              <IconButton
                                icon={<X size={15} />}
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  triggerHaptic(6)
                                  onDeleteItem(item.id)
                                }}
                                aria-label={`Delete ${item.name}`}
                                className="-mr-1.5 p-2 h-9 w-9 text-casa-muted/50 hover:text-casa-error hover:bg-casa-error/10 shrink-0 rounded-xl"
                              />
                            )}
                          </motion.div>
                        )
                      })}
                    </AnimatePresence>
                  )}
                </div>
              </section>
            )
          })
        )}

        {/* ── Collapsible "In Cart / Completed" Section ── */}
        {completedItems.length > 0 && (
          <section className="overflow-hidden rounded-2xl border border-casa-border bg-casa-surface/60 mt-4 shadow-2xs">
            <button
              type="button"
              onClick={() => {
                triggerHaptic(6)
                setIsCartOpen((prev) => !prev)
              }}
              className="w-full flex items-center justify-between px-4 py-3 bg-casa-surface/90 text-left transition-colors active:bg-casa-bg"
            >
              <div className="flex items-center gap-2">
                <span className="h-6 w-6 rounded-full bg-emerald-500/15 text-emerald-600 flex items-center justify-center">
                  <Check size={14} strokeWidth={2.5} />
                </span>
                <span className="text-body-sm font-bold text-casa-navy">
                  In Cart ({completedItems.length})
                </span>
              </div>
              <div className="flex items-center gap-1 text-casa-muted">
                <span className="text-2xs font-medium">
                  {isCartOpen ? 'Hide' : 'Show'}
                </span>
                {isCartOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
            </button>

            <AnimatePresence initial={false}>
              {isCartOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="divide-y divide-casa-divider border-t border-casa-divider overflow-hidden"
                >
                  {completedItems.map((item) => (
                    <div
                      key={`completed-${item.id}`}
                      className="flex items-center gap-3 px-3.5 py-2.5 opacity-60 hover:opacity-100 transition-opacity bg-casa-bg/30"
                    >
                      <div className="flex items-center justify-center -ml-1.5 p-1.5 shrink-0">
                        <Checkbox
                          checked={true}
                          onChange={() => {
                            triggerHaptic(8)
                            onToggleItem(item.id, false)
                          }}
                          label={`Return ${item.name} to list`}
                          className="min-h-0 shrink-0 gap-0 pt-0 [&>span:last-child]:sr-only"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-body-sm line-through text-casa-muted font-medium truncate block">
                          {item.name}
                        </span>
                      </div>
                      <IconButton
                        icon={<X size={14} />}
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          triggerHaptic(6)
                          onDeleteItem(item.id)
                        }}
                        aria-label={`Delete ${item.name}`}
                        className="-mr-1.5 h-8 w-8 text-casa-muted/50 hover:text-casa-error hover:bg-casa-error/10 shrink-0"
                      />
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        )}
      </main>

      {/* ── Sticky Bottom Quick-Add Bar (docked above bottom nav) ── */}
      <div className="fixed bottom-[calc(3.75rem+env(safe-area-inset-bottom))] left-0 right-0 z-sticky px-3 pb-1.5 pt-2 bg-casa-surface/98 backdrop-blur-xl border-t border-casa-border/80 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] pointer-events-auto">
        <div className="max-w-md mx-auto space-y-2">
          {/* Duplicate Alert Banner */}
          <AnimatePresence initial={false}>
            {duplicateSuggestion && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="flex items-center justify-between gap-2 rounded-xl border border-casa-gold/40 bg-casa-gold/10 px-3 py-1.5 mb-1">
                  <p className="text-2xs text-casa-navy truncate">
                    <span className="font-semibold">{duplicateSuggestion.name}</span> is already on your list
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleAddCurrentInput(true)}
                    className="h-6 text-3xs px-2 shrink-0 font-semibold"
                  >
                    Add anyway
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input & Voice Row */}
          <div className="flex items-center gap-1.5 bg-casa-bg rounded-2xl border border-casa-border px-3 h-12 shadow-inner focus-within:ring-2 focus-within:ring-casa-gold/40 focus-within:border-casa-gold/60 transition-all">
            <Plus size={18} className="text-casa-gold shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              enterKeyHint="done"
              autoComplete="off"
              autoCorrect="off"
              placeholder={listening ? 'Listening to voice…' : 'Add grocery item…'}
              className="flex-1 min-w-0 bg-transparent text-body-sm text-casa-text placeholder:text-casa-muted outline-none"
            />

            {dictationSupported && (
              <IconButton
                icon={<Mic size={17} />}
                variant={listening ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => {
                  triggerHaptic(10)
                  toggleDictation(inputValue)
                }}
                aria-label={listening ? 'Stop voice dictation' : 'Dictate grocery item'}
                className={cn('h-8 w-8 shrink-0', listening && 'animate-pulse text-casa-navy')}
              />
            )}

            <Button
              variant="champagne"
              size="sm"
              onClick={() => handleAddCurrentInput(false)}
              disabled={!trimmedInput}
              className="h-8 px-3 shrink-0 font-bold text-2xs"
            >
              Add
            </Button>
          </div>

          {/* Quick 1-Tap Staples Ribbon */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar -mx-1 px-1">
            <span className="text-3xs font-mono font-bold uppercase tracking-wider text-casa-gold shrink-0">
              Quick:
            </span>
            {QUICK_STAPLES.map((staple) => {
              const alreadyOnList = Boolean(findDuplicate(staple))
              return (
                <Chip
                  key={`mobile-staple-${staple}`}
                  tone="neutral"
                  size="sm"
                  onClick={() => handleQuickStapleAdd(staple)}
                  disabled={alreadyOnList}
                  className="shrink-0 text-3xs font-medium bg-casa-surface hover:border-casa-gold/40 py-0.5 px-2 cursor-pointer shadow-2xs"
                >
                  {alreadyOnList ? <Check size={11} className="inline mr-0.5 -mt-0.5" /> : '+ '}
                  {staple}
                </Chip>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
