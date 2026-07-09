import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus, Mic, Undo2, Check, BookOpen } from 'lucide-react'
import { cn } from '../../utils/cn'
import { GROCERY_CATEGORIES, type GroceryItem } from '../../hooks/useGroceryList'
import { inferCategoryFromName } from '../../utils/groceryCategorization'
import { normalizeGroceryNameKey } from '../../utils/groceryPredictionDeferrals'

interface NewGroceryItemInput {
  list_id: string
  name: string
  quantity: string | null
  unit: string | null
  category: string
  checked: boolean
  notes: string | null
}

interface Props {
  open: boolean
  onClose: () => void
  /** Active + checked items, used for duplicate detection and undo lookup. */
  items: GroceryItem[]
  defaultListId: string | null
  /** Fire-and-forget add (page owns the single useGroceryList instance). */
  addItem: { mutate: (input: NewGroceryItemInput) => void }
  /** Soft-delete by id, used by per-item undo. */
  deleteItem: { mutate: (id: string) => void }
  /** Hand off to the full add panel (recipe import / saved recipes). */
  onOpenMore?: () => void
}

const QUICK_CHIPS = ['Milk', 'Eggs', 'Bread', 'Bananas', 'Chicken', 'Coffee', 'Butter', 'Onions']

const CATEGORY_LABEL = new Map(GROCERY_CATEGORIES.map((c) => [c.key, c.label]))

interface SessionAdd {
  key: string
  name: string
  category: string
}

/** Nearest active (unchecked, not-deleted) item matching the typed name, if any. */
function findDuplicateItem(items: GroceryItem[], name: string): GroceryItem | null {
  const normalized = normalizeGroceryNameKey(name)
  if (!normalized) return null
  const active = items.filter((i) => !i.checked && !i.deleted_at)
  const exact = active.find((i) => normalizeGroceryNameKey(i.name) === normalized)
  if (exact) return exact
  const fuzzy = active.find((i) => {
    const existing = normalizeGroceryNameKey(i.name)
    return existing.includes(normalized) || normalized.includes(existing)
  })
  return fuzzy ?? null
}

/**
 * Mobile-first quick-add for the grocery list. A keyboard-docked bottom sheet
 * built for speed: autofocus so the keyboard pops on open, Enter adds the item
 * and keeps focus so you can rip through "milk ↵ eggs ↵ bread ↵", a live aisle
 * chip that previews where the item lands, inline duplicate awareness, one-tap
 * common chips, and a satisfying "just added" stack with per-item undo.
 *
 * Data + mutations are passed in from the page's single useGroceryList instance
 * so this sheet never spins up a second normalization/enhancement loop.
 */
export default function GroceryQuickAddSheet({ open, onClose, items, defaultListId, addItem, deleteItem, onOpenMore }: Props) {
  const [value, setValue] = useState('')
  const [sessionAdds, setSessionAdds] = useState<SessionAdd[]>([])
  const [viewportHeight, setViewportHeight] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const findDuplicate = useCallback((name: string) => findDuplicateItem(items, name), [items])

  const trimmed = value.trim()
  const previewCategory = trimmed ? inferCategoryFromName(trimmed) : null
  const duplicate = trimmed ? findDuplicate(trimmed) : null

  // Reset session state each time the sheet opens (React's documented "adjust
  // state on prop change" pattern — avoids a set-state-in-effect cascade).
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setValue('')
      setSessionAdds([])
    }
  }

  // Autofocus so the keyboard pops on open (best-effort across platforms).
  useEffect(() => {
    if (!open) return
    const raf = requestAnimationFrame(() => inputRef.current?.focus())
    const timer = window.setTimeout(() => inputRef.current?.focus(), 340)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(timer)
    }
  }, [open])

  // Keyboard-aware height: dock the sheet above the on-screen keyboard.
  useEffect(() => {
    if (!open) return
    const vv = window.visualViewport
    const update = () => vv && setViewportHeight(vv.height)
    if (vv) {
      update()
      vv.addEventListener('resize', update)
      vv.addEventListener('scroll', update)
    }
    return () => {
      if (vv) {
        vv.removeEventListener('resize', update)
        vv.removeEventListener('scroll', update)
      }
      setViewportHeight(null)
    }
  }, [open])

  const submit = useCallback(
    (rawName: string, opts?: { force?: boolean }) => {
      const name = rawName.trim().replace(/\s+/g, ' ')
      if (!name || !defaultListId) return
      if (!opts?.force && findDuplicate(name)) return // duplicate guard; handled inline
      const category = inferCategoryFromName(name)
      addItem.mutate({ list_id: defaultListId, name, quantity: null, unit: null, category, checked: false, notes: null })
      navigator.vibrate?.(8)
      setSessionAdds((prev) => [
        { key: `${name}-${Date.now()}`, name, category },
        ...prev.filter((s) => normalizeGroceryNameKey(s.name) !== normalizeGroceryNameKey(name)),
      ])
      setValue('')
      inputRef.current?.focus()
    },
    [addItem, defaultListId, findDuplicate],
  )

  const undoAdd = useCallback(
    (entry: SessionAdd) => {
      const normalized = normalizeGroceryNameKey(entry.name)
      const match = items.find((i) => !i.deleted_at && normalizeGroceryNameKey(i.name) === normalized)
      if (match) deleteItem.mutate(match.id)
      setSessionAdds((prev) => prev.filter((s) => s.key !== entry.key))
    },
    [items, deleteItem],
  )

  const handleVoiceAdd = () => {
    document.dispatchEvent(
      new CustomEvent('open-ai-chat', {
        detail: {
          prompt: trimmed ? `Add these grocery items to the shopping list: ${trimmed}` : 'Add items to the grocery list.',
          autoSend: false,
          source: 'grocery-voice-add',
        },
      }),
    )
    onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="qa-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[65] casa-scrim"
            onClick={onClose}
          />

          <motion.div
            key="qa-sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 260 }}
            className="fixed left-0 right-0 z-[70] bg-casa-surface rounded-t-modal shadow-modal sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-lg sm:rounded-modal flex flex-col overflow-hidden"
            style={{
              bottom: 'max(0px, env(safe-area-inset-bottom))',
              maxHeight: viewportHeight ? `${Math.max(320, viewportHeight - 8)}px` : 'calc(100dvh - 8px)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-casa-border" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pb-3 pt-1 shrink-0">
              <div className="flex items-baseline gap-2">
                <h3 className="font-display text-display-sm text-casa-navy">Quick add</h3>
                {sessionAdds.length > 0 && (
                  <span className="text-body-sm font-semibold text-casa-info">
                    {sessionAdds.length} added
                  </span>
                )}
              </div>
              <button
                onClick={onClose}
                className="h-9 w-9 rounded-full border border-casa-border bg-casa-bg text-casa-muted hover:bg-casa-main transition-colors flex items-center justify-center"
                aria-label="Close quick add"
              >
                <X size={18} />
              </button>
            </div>

            {/* Input row */}
            <div className="px-5 shrink-0">
              <div className="flex items-center gap-2 bg-casa-bg rounded-2xl border border-casa-border px-4 h-14 focus-within:ring-2 focus-within:ring-casa-gold/40 transition-shadow">
                <Plus size={20} className="text-casa-muted shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      submit(value)
                    }
                  }}
                  enterKeyHint="done"
                  autoComplete="off"
                  autoCorrect="off"
                  placeholder="Add an item…"
                  className="flex-1 min-w-0 bg-transparent text-body text-casa-text placeholder:text-casa-muted outline-none"
                />
                {previewCategory && !duplicate && (
                  <span className="shrink-0 rounded-pill bg-casa-surface border border-casa-border px-2.5 py-1 text-caption font-semibold text-casa-navy whitespace-nowrap">
                    {CATEGORY_LABEL.get(previewCategory) ?? 'Other'}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => submit(value)}
                  disabled={!trimmed || !defaultListId || Boolean(duplicate)}
                  className={cn(
                    'shrink-0 h-10 px-4 rounded-button text-body-sm font-semibold transition-all',
                    trimmed && !duplicate ? 'bg-casa-gold text-casa-navy hover:brightness-110' : 'text-casa-muted',
                  )}
                >
                  Add
                </button>
              </div>

              {/* Duplicate awareness */}
              <AnimatePresence initial={false}>
                {duplicate && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-casa-gold/40 bg-casa-gold/10 px-3 py-2">
                      <p className="text-caption text-casa-navy min-w-0 truncate">
                        <span className="font-semibold">{duplicate.name}</span> is already on your list
                      </p>
                      <button
                        type="button"
                        onClick={() => submit(value, { force: true })}
                        className="shrink-0 px-2.5 py-1 rounded-full border border-casa-border bg-casa-surface text-caption font-medium text-casa-navy hover:bg-casa-bg transition-colors"
                      >
                        Add anyway
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Quick chips */}
            <div className="px-5 mt-3 shrink-0">
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                {QUICK_CHIPS.map((chip) => {
                  const already = Boolean(findDuplicate(chip))
                  return (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => submit(chip, { force: false })}
                      disabled={already}
                      className={cn(
                        'shrink-0 h-9 px-3.5 rounded-full border text-body-sm transition-colors',
                        already
                          ? 'border-casa-border bg-casa-bg text-casa-muted/60'
                          : 'border-casa-border bg-casa-bg text-casa-text hover:bg-casa-main',
                      )}
                    >
                      {already ? <Check size={13} className="inline mr-1 -mt-0.5" /> : '+ '}
                      {chip}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Just-added stack */}
            <div className="flex-1 min-h-0 overflow-y-auto px-5 mt-1 pb-3">
              <AnimatePresence initial={false}>
                {sessionAdds.map((entry) => (
                  <motion.div
                    key={entry.key}
                    layout
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    transition={{ type: 'spring', damping: 30, stiffness: 320 }}
                    className="flex items-center gap-3 py-2.5 border-b border-casa-divider last:border-0"
                  >
                    <span className="h-8 w-8 rounded-full bg-casa-info-soft text-casa-info-strong flex items-center justify-center shrink-0">
                      <Check size={16} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-body font-semibold text-casa-navy truncate">{entry.name}</p>
                      <p className="text-caption text-casa-muted truncate">
                        {CATEGORY_LABEL.get(entry.category) ?? 'Other'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => undoAdd(entry)}
                      className="shrink-0 inline-flex items-center gap-1 h-8 px-3 rounded-full border border-casa-border bg-casa-bg text-caption font-medium text-casa-muted hover:bg-casa-main transition-colors"
                    >
                      <Undo2 size={13} />
                      Undo
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>

              {sessionAdds.length === 0 && (
                <p className="text-center text-caption text-casa-muted py-6">
                  Type an item and hit <span className="font-semibold text-casa-navy">Enter</span> to keep adding.
                </p>
              )}
            </div>

            {/* Footer secondary actions */}
            <div className="px-5 py-3 border-t border-casa-divider shrink-0 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={handleVoiceAdd}
                  className="inline-flex items-center gap-2 h-10 px-4 rounded-button border border-casa-border bg-casa-bg text-body-sm font-medium text-casa-navy hover:bg-casa-main transition-colors"
                >
                  <Mic size={16} />
                  Voice add
                </button>
                {onOpenMore && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose()
                      onOpenMore()
                    }}
                    className="inline-flex items-center gap-1.5 h-10 px-3 rounded-button text-body-sm font-medium text-casa-text-secondary hover:text-casa-navy transition-colors"
                  >
                    <BookOpen size={15} />
                    Recipes &amp; import
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="h-10 px-5 rounded-button bg-casa-navy text-white text-body-sm font-semibold hover:bg-casa-navy/90 transition-colors shrink-0"
              >
                Done
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
