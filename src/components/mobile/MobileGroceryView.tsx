import { useState, useRef, useCallback, type KeyboardEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ShoppingCart,
  Trash2,
  X,
  Mic,
  Check,
  ChevronDown,
  ChevronUp,
  RotateCcw,
} from 'lucide-react'
import { cn } from '../../utils/cn'
import { type GroceryItem } from '../../hooks/useGroceryList'
import { categoryIconBadgeClassName, getCategoryTone } from '../../utils/groceryVisuals'
import { useFieldDictation } from '../../hooks/useFieldDictation'
import { normalizeGroceryNameKey } from '../../utils/groceryPredictionDeferrals'
import { Button, Chip, Heading, IconButton } from '../ui'
import type { CategoryVisualDef } from '../grocery/GroceryAisleGrid'

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

/** Helper to split batch comma/newline inputs into distinct items */
function splitBatchGroceryInput(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
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
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | null>(null)
  const [localDeletingIds, setLocalDeletingIds] = useState<Set<string>>(new Set())
  const inputRef = useRef<HTMLInputElement>(null)

  const triggerHaptic = (durationMs = 8) => {
    try {
      navigator.vibrate?.(durationMs)
    } catch {}
  }

  const handleDelete = (id: string) => {
    triggerHaptic(10)
    setLocalDeletingIds((prev) => new Set(prev).add(id))
    onDeleteItem(id)
  }

  const handleUndo = (id: string) => {
    triggerHaptic(8)
    setLocalDeletingIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    onUndoDelete?.(id)
  }

  // Voice dictation (Strictly Press-and-Hold / Tap-to-Speak)
  const [isPressingMic, setIsPressingMic] = useState(false)
  const {
    supported: dictationSupported,
    listening,
    start: startDictation,
    stop: stopDictation,
    resetBuffer: resetDictation,
  } = useFieldDictation({
    onText: (text) => setInputValue(text),
  })

  const handleMicPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {}
    triggerHaptic(10)
    setIsPressingMic(true)
    setInputValue('')
    void startDictation('')
  }

  const handleMicPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!isPressingMic) return
    e.preventDefault()
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
    } catch {}
    triggerHaptic(8)
    setIsPressingMic(false)
    const captured = stopDictation()
    const textToAdd = (captured || inputValue).trim()
    if (textToAdd) {
      const parts = splitBatchGroceryInput(textToAdd)
      if (parts.length > 1) {
        parts.forEach((p) => onAddItem(p, { allowDuplicate: false }))
      } else {
        onAddItem(textToAdd, { allowDuplicate: false })
      }
      setInputValue('')
      resetDictation('')
    }
  }

  const handleMicPointerCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!isPressingMic) return
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
    } catch {}
    setIsPressingMic(false)
    const captured = stopDictation()
    const textToAdd = (captured || inputValue).trim()
    if (textToAdd) {
      const parts = splitBatchGroceryInput(textToAdd)
      if (parts.length > 1) {
        parts.forEach((p) => onAddItem(p, { allowDuplicate: false }))
      } else {
        onAddItem(textToAdd, { allowDuplicate: false })
      }
      setInputValue('')
      resetDictation('')
    }
  }

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
    const batch = splitBatchGroceryInput(trimmedInput)
    if (batch.length > 1) {
      batch.forEach((item) => {
        onAddItem(item, { allowDuplicate })
      })
    } else {
      onAddItem(trimmedInput, { allowDuplicate })
    }
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

  // Filtered categories based on selected pill
  const visibleCategories = selectedCategoryFilter
    ? activeCategories.filter((c) => c.key === selectedCategoryFilter)
    : activeCategories

  return (
    <div className="flex flex-col min-h-full bg-casa-bg text-casa-text pb-36">
      {/* ── Sticky Top Header with Safe-Area Inset (Concept A: Streamliner) ── */}
      <header className="sticky top-0 z-sticky bg-casa-surface/96 backdrop-blur-xl border-b border-casa-border/80 px-4 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] pb-3 shadow-xs">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-casa-gold/15 text-casa-gold border border-casa-gold/30 shrink-0 shadow-2xs">
              <ShoppingCart size={17} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Heading role="display-sm" className="font-serif text-lg font-bold text-casa-navy leading-none tracking-tight truncate">
                  Provisions
                </Heading>
                <Chip tone="accent" size="sm" className="font-bold text-2xs px-2 py-0.5 shadow-2xs">
                  {uncheckedCount} to buy
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
              className="text-2xs font-semibold text-casa-error hover:bg-casa-error/10 shrink-0 px-2.5 h-8 border border-casa-error/20 rounded-xl"
            >
              Clear cart ({checkedCount})
            </Button>
          )}
        </div>

        {/* Category Quick-Filter Ribbon */}
        {activeCategories.length > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pt-2.5 pb-0.5 no-scrollbar -mx-1 px-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                triggerHaptic(6)
                setSelectedCategoryFilter(null)
              }}
              className={cn(
                'px-2.5 py-1 rounded-lg text-2xs font-medium shrink-0 transition-all border shadow-2xs h-auto min-h-0',
                selectedCategoryFilter === null
                  ? 'bg-casa-navy text-white border-casa-navy font-semibold hover:bg-casa-navy hover:text-white'
                  : 'bg-casa-surface text-casa-muted border-casa-border hover:border-casa-gold/40'
              )}
            >
              All ({uncheckedCount})
            </Button>
            {activeCategories.map((cat) => {
              const isSelected = selectedCategoryFilter === cat.key
              return (
                <Button
                  key={`filter-${cat.key}`}
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    triggerHaptic(6)
                    setSelectedCategoryFilter(isSelected ? null : cat.key)
                  }}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-2xs font-medium shrink-0 transition-all border shadow-2xs flex items-center gap-1.5 h-auto min-h-0',
                    isSelected
                      ? 'bg-casa-gold text-white border-casa-gold font-semibold shadow-xs hover:bg-casa-gold hover:text-white'
                      : 'bg-casa-surface text-casa-muted border-casa-border hover:border-casa-gold/40'
                  )}
                >
                  <span>{cat.label}</span>
                  <span className={cn('text-3xs font-mono', isSelected ? 'text-white/90' : 'text-casa-muted/70')}>
                    {cat.items.length}
                  </span>
                </Button>
              )
            })}
          </div>
        )}
      </header>

      {/* ── Main Checklist Content: High-Density Continuous Canvas (Concept A) ── */}
      <main className="flex-1 px-3 pt-3 space-y-4">
        {activeCategories.length === 0 && completedItems.length === 0 ? (
          <div className="rounded-3xl border border-casa-border bg-casa-surface p-8 text-center space-y-2.5 mt-4 shadow-xs">
            <div className="w-12 h-12 rounded-2xl bg-casa-gold/15 text-casa-gold flex items-center justify-center mx-auto shadow-2xs">
              <ShoppingCart size={24} />
            </div>
            <p className="font-serif text-lg font-bold text-casa-navy">All Shopped Up!</p>
            <p className="text-caption text-casa-muted max-w-xs mx-auto">
              Your grocery basket is empty. Type an item below or dictate using the mic.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-casa-border/80 bg-casa-surface overflow-hidden shadow-xs divide-y divide-casa-divider/60">
            {visibleCategories.map((group) => {
              const CategoryIcon = group.visual.icon
              return (
                <section key={`mobile-group-${group.key}`} className="overflow-hidden">
                  {/* Category Header (Subtle Section Divider) */}
                  <div className="flex items-center justify-between bg-casa-bg/60 px-3.5 py-2 border-b border-casa-border/40">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={cn(
                          'flex h-5 w-5 shrink-0 items-center justify-center rounded border border-casa-border/60 bg-white shadow-2xs text-casa-navy',
                          categoryIconBadgeClassName(getCategoryTone(group.key))
                        )}
                      >
                        <CategoryIcon size={12} />
                      </div>
                      <span className="truncate font-mono text-2xs font-bold uppercase tracking-wider text-casa-navy">
                        {group.label}
                      </span>
                    </div>
                    <span className="text-3xs font-mono font-semibold text-casa-muted bg-white/80 px-2 py-0.5 rounded-full border border-casa-border/60 shadow-2xs">
                      {group.items.length}
                    </span>
                  </div>

                  {/* High-Density Typographic Items */}
                  <div className="divide-y divide-casa-divider/40">
                    {group.items.length === 0 ? (
                      <div className="px-3.5 py-2.5 text-center text-3xs font-mono text-casa-muted italic bg-casa-surface-subtle/30">
                        All provisions in cart ✓
                      </div>
                    ) : (
                      <AnimatePresence initial={false}>
                        {group.items.map((item) => {
                          const isDismissQueued = dismissingIds.has(item.id)
                          const isDismissExiting = dismissingExitingIds.has(item.id)
                          const isDeleting = (deletingIds?.has(item.id) ?? false) || localDeletingIds.has(item.id)
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
                              transition={{ duration: 0.18 }}
                              className={cn(
                                'flex items-center gap-3 px-3 py-2.5 transition-colors duration-150',
                                (visualChecked || isDeleting) && 'opacity-50 bg-casa-surface-subtle/60',
                                isDismissExiting && 'opacity-0 scale-95',
                                isSpotlighted && 'bg-casa-gold/15'
                              )}
                            >
                              {/* 44px+ Round Brass Checkbox Trigger */}
                              {!isDeleting && (
                                <IconButton
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    triggerHaptic(8)
                                    onToggleItem(item.id, !visualChecked)
                                  }}
                                  aria-label={visualChecked ? `Mark ${item.name} as needed` : `Mark ${item.name} as in cart`}
                                  className="flex-shrink-0 -ml-1.5 p-0 hover:bg-transparent"
                                  icon={
                                    <div
                                      className={cn(
                                        'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200',
                                        visualChecked
                                          ? 'bg-casa-gold border-casa-gold text-white shadow-2xs scale-95'
                                          : 'border-casa-border hover:border-casa-gold/60 bg-casa-surface text-transparent'
                                      )}
                                    >
                                      <Check size={11} strokeWidth={3} />
                                    </div>
                                  }
                                />
                              )}

                              {/* Item Details */}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-baseline gap-1.5 flex-wrap">
                                  <span
                                    className={cn(
                                      'text-body-sm font-medium text-casa-navy leading-tight transition-all',
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
                                          onClick={() => handleUndo(item.id)}
                                          className="text-3xs font-semibold text-casa-gold hover:underline p-0 h-auto min-h-0 flex items-center gap-1"
                                        >
                                          <RotateCcw size={10} />
                                          Undo
                                        </Button>
                                      )}
                                    </div>
                                  ) : (
                                    (item.quantity || item.unit) && (
                                      <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-casa-bg border border-casa-border/70 text-3xs font-mono font-medium text-casa-muted shrink-0 shadow-2xs">
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

                              {/* Quick Delete Action (44px min hit area) */}
                              {!isDeleting && (
                                <IconButton
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDelete(item.id)}
                                  aria-label={`Delete ${item.name}`}
                                  icon={<X size={15} />}
                                  className="-mr-1.5 text-casa-muted/40 hover:text-casa-error hover:bg-casa-error/10 rounded-xl"
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
            })}
          </div>
        )}

        {/* ── Collapsible "In Cart / Completed" Drawer ── */}
        {completedItems.length > 0 && (
          <section className="overflow-hidden rounded-2xl border border-casa-border bg-casa-surface/80 mt-4 shadow-2xs">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                triggerHaptic(6)
                setIsCartOpen((prev) => !prev)
              }}
              className="w-full flex items-center justify-between px-4 py-3 bg-casa-surface text-left transition-colors active:bg-casa-bg h-auto min-h-0 rounded-none"
            >
              <div className="flex items-center gap-2">
                <span className="h-6 w-6 rounded-full bg-emerald-500/15 text-emerald-600 flex items-center justify-center shadow-2xs">
                  <Check size={13} strokeWidth={2.5} />
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
            </Button>

            <AnimatePresence initial={false}>
              {isCartOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="divide-y divide-casa-divider/50 border-t border-casa-divider overflow-hidden"
                >
                  {completedItems.map((item) => (
                    <div
                      key={`completed-${item.id}`}
                      className="flex items-center gap-3 px-3.5 py-2.5 opacity-60 hover:opacity-100 transition-opacity bg-casa-bg/30"
                    >
                      <IconButton
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          triggerHaptic(8)
                          onToggleItem(item.id, false)
                        }}
                        aria-label={`Return ${item.name} to list`}
                        className="flex-shrink-0 -ml-1.5 p-0 hover:bg-transparent"
                        icon={
                          <div className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-2xs">
                            <Check size={11} strokeWidth={3} />
                          </div>
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <span className="text-body-sm line-through text-casa-muted font-medium truncate block">
                          {item.name}
                        </span>
                      </div>
                      <IconButton
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(item.id)}
                        aria-label={`Delete ${item.name}`}
                        icon={<X size={14} />}
                        className="-mr-1.5 text-casa-muted/40 hover:text-casa-error hover:bg-casa-error/10"
                      />
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        )}
      </main>

      {/* ── Docked Super-Input Bar (Keyboard-Aware Flush Docking, No Quick Chips) ── */}
      <div
        className={cn(
          'fixed left-3 right-3 max-w-md mx-auto z-sticky px-2.5 py-2 floating-dock-glass border border-casa-gold/30 rounded-2xl shadow-[0_8px_28px_rgba(27,42,74,0.1)] pointer-events-auto transition-all duration-250 ease-out',
          isInputFocused
            ? 'bottom-[calc(0.5rem+env(safe-area-inset-bottom))]'
            : 'bottom-[calc(4.25rem+env(safe-area-inset-bottom))]'
        )}
      >
        <div className="max-w-md mx-auto space-y-1.5">
          {/* Duplicate Alert Banner */}
          <AnimatePresence initial={false}>
            {duplicateSuggestion && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="flex items-center justify-between gap-2 rounded-xl border border-casa-gold/40 bg-casa-gold/15 px-3 py-1.5 mb-1 shadow-2xs">
                  <p className="text-2xs text-casa-navy truncate font-medium">
                    <span className="font-bold">{duplicateSuggestion.name}</span> is already on your list
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleAddCurrentInput(true)}
                    className="h-6 text-3xs px-2 shrink-0 font-bold bg-white text-casa-navy border border-casa-gold/40"
                  >
                    Add anyway
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Unified Input Container */}
          <div className="flex items-center gap-1.5 bg-casa-surface/90 rounded-xl border border-casa-border px-2.5 h-11 shadow-inner focus-within:ring-2 focus-within:ring-casa-gold/40 focus-within:border-casa-gold/60 transition-all">
            {dictationSupported && (
              <IconButton
                icon={<Mic size={16} />}
                variant={listening ? 'primary' : 'ghost'}
                size="sm"
                onPointerDown={handleMicPointerDown}
                onPointerUp={handleMicPointerUp}
                onPointerCancel={handleMicPointerCancel}
                aria-label={listening ? 'Release to add grocery items' : 'Hold to speak grocery items'}
                title={listening ? 'Listening... release to add' : 'Press and hold to speak'}
                className={cn(
                  'h-8 w-8 shrink-0 touch-none select-none transition-all duration-200',
                  listening ? 'bg-casa-gold text-white shadow-2xs scale-105' : 'text-casa-gold hover:text-casa-navy hover:bg-casa-accent-soft'
                )}
              />
            )}

            {/* Tactile Waveform when speaking */}
            {listening && (
              <div className="tactile-waveform shrink-0 mr-1" aria-label="Listening audio waveform">
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
            )}

            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => setIsInputFocused(false)}
              onKeyDown={handleKeyDown}
              enterKeyHint="done"
              autoComplete="off"
              autoCorrect="off"
              placeholder={listening ? 'Listening… release to add' : 'Add grocery item (Enter to batch)…'}
              className="flex-1 min-w-0 bg-transparent text-body-sm text-casa-navy placeholder:text-casa-muted/70 outline-none"
            />

            <Button
              variant="champagne"
              size="sm"
              onClick={() => handleAddCurrentInput(false)}
              disabled={!trimmedInput}
              className="h-8 px-3 shrink-0 font-bold text-2xs bg-casa-gold text-white shadow-2xs hover:bg-casa-gold/90"
            >
              Add
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
