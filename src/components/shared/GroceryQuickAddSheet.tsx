import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus, Mic, Undo2, Check, BookOpen, Keyboard } from 'lucide-react'
import { cn } from '../../utils/cn'
import { GROCERY_CATEGORIES, type GroceryItem } from '../../hooks/useGroceryList'
import { inferCategoryFromName } from '../../utils/groceryCategorization'
import { normalizeGroceryNameKey } from '../../utils/groceryPredictionDeferrals'
import { useFieldDictation } from '../../hooks/useFieldDictation'
import { Button, Chip, Heading, IconButton, Sheet, Text } from '../ui'

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
 * built for speed: autofocus keeps the field ready, Enter adds the item
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

  // In-field dictation: fills the same input you type into, keeping the sheet open.
  const { supported: dictationSupported, listening, toggle: toggleDictation, stop: stopDictation, resetBuffer: resetDictation } =
    useFieldDictation({ onText: setValue })

  // On the Pi kiosk (touch + large screen) the custom TouchKeyboard is used.
  // We suppress its auto-open (data-touch-keyboard="ignore") and instead offer a
  // deliberate keyboard button, so opening the sheet doesn't crowd the screen
  // with a keyboard the user may not want. Mirrors TouchKeyboard's own enable rule.
  const [usesCustomKeyboard, setUsesCustomKeyboard] = useState(false)
  useEffect(() => {
    const check = () => {
      const touch = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
      setUsesCustomKeyboard(touch && window.innerWidth >= 1024)
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const toggleCustomKeyboard = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    el.focus()
    document.dispatchEvent(
      new CustomEvent('touch-keyboard:control', { detail: { toggle: true, target: el } }),
    )
  }, [])

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
      // Keep the mic listening (if on) but clear its buffer so the next spoken
      // item starts fresh. Mic stays on until the sheet closes or is toggled off.
      resetDictation('')
      setValue('')
      inputRef.current?.focus()
    },
    [addItem, defaultListId, findDuplicate, resetDictation],
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

  const handleClose = useCallback(() => {
    stopDictation()
    document.dispatchEvent(new CustomEvent('touch-keyboard:control', { detail: { close: true } }))
    onClose()
  }, [stopDictation, onClose])

  return (
    <Sheet
      open={open}
      onClose={handleClose}
      title="Quick add groceries"
      showHeader={false}
      showHandle
      transition={{ type: 'spring', damping: 32, stiffness: 260 }}
      panelClassName="overflow-hidden sm:left-[calc(50%-16rem)] sm:right-[calc(50%-16rem)] sm:rounded-modal"
      contentClassName="flex flex-col overflow-hidden p-0"
      panelStyle={{
        bottom: 'max(0px, env(safe-area-inset-bottom))',
        maxHeight: viewportHeight ? `${Math.max(320, viewportHeight - 8)}px` : 'calc(100dvh - 8px)',
      }}
    >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pb-3 pt-1 shrink-0">
              <div className="flex items-baseline gap-2">
                <Heading role="display-sm" as="h2">Quick add</Heading>
                {sessionAdds.length > 0 && (
                  <Text as="span" role="body-sm" className="font-semibold text-casa-info">
                    {sessionAdds.length} added
                  </Text>
                )}
              </div>
              <IconButton
                icon={<X size={18} />}
                variant="secondary"
                size="sm"
                onClick={handleClose}
                aria-label="Close quick add"
              />
            </div>

            {/* Input row */}
            <div className="px-5 shrink-0" data-touch-keyboard="ignore">
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
                  placeholder={listening ? 'Listening…' : 'Add an item…'}
                  className="flex-1 min-w-0 bg-transparent text-body text-casa-text placeholder:text-casa-muted outline-none"
                />
                {previewCategory && !duplicate && !listening && (
                  <Chip tone="neutral" size="sm" className="shrink-0">
                    {CATEGORY_LABEL.get(previewCategory) ?? 'Other'}
                  </Chip>
                )}
                {usesCustomKeyboard && (
                  <IconButton
                    icon={<Keyboard size={18} />}
                    variant="ghost"
                    size="sm"
                    onClick={toggleCustomKeyboard}
                    aria-label="Show keyboard"
                    className="shrink-0"
                  />
                )}
                {dictationSupported && (
                  <IconButton
                    icon={<Mic size={18} />}
                    variant={listening ? 'primary' : 'ghost'}
                    size="sm"
                    onClick={() => toggleDictation(value)}
                    aria-label={listening ? 'Stop dictation' : 'Dictate item'}
                    aria-pressed={listening}
                    className={cn('shrink-0', listening && 'animate-pulse text-casa-navy')}
                  />
                )}
                <Button
                  size="sm"
                  onClick={() => submit(value)}
                  disabled={!trimmed || !defaultListId || Boolean(duplicate)}
                  className="shrink-0"
                >
                  Add
                </Button>
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
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => submit(value, { force: true })}
                        className="shrink-0"
                      >
                        Add anyway
                      </Button>
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
                    <Chip
                      key={chip}
                      tone="neutral"
                      size="md"
                      onClick={() => submit(chip, { force: false })}
                      disabled={already}
                      className="shrink-0"
                    >
                      {already ? <Check size={13} className="inline mr-1 -mt-0.5" /> : '+ '}
                      {chip}
                    </Chip>
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
                    <Button
                      variant="secondary"
                      size="sm"
                      leadingIcon={<Undo2 size={13} />}
                      onClick={() => undoAdd(entry)}
                      className="shrink-0"
                    >
                      Undo
                    </Button>
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
                {onOpenMore && (
                  <Button
                    variant="ghost"
                    size="sm"
                    leadingIcon={<BookOpen size={15} />}
                    onClick={() => {
                      handleClose()
                      onOpenMore()
                    }}
                  >
                    Recipes &amp; import
                  </Button>
                )}
              </div>
              <Button
                size="sm"
                onClick={handleClose}
                className="shrink-0 bg-casa-navy hover:bg-casa-navy/90"
              >
                Done
              </Button>
            </div>
    </Sheet>
  )
}
