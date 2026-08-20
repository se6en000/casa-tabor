import { useState, type PointerEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  GripVertical,
  Sparkles,
  X,
  Leaf,
  Milk,
  Beef,
  Croissant,
  Snowflake,
  Package,
  Coffee,
  Popcorn,
  Sandwich,
  House,
  HeartPulse,
  Baby as BabyIcon,
  PawPrint,
  ShoppingCart,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '../../utils/cn'
import { GROCERY_CATEGORIES, type GroceryItem } from '../../hooks/useGroceryList'
import {
  Button,
  Chip,
  IconButton,
  TactileSheenBeam,
  TactileSwapBadge,
} from '../ui'
import {
  TACTILE_SPRING_TRANSITION,
  TACTILE_SWAP_SCALE_ANIMATION,
} from '../ui/TactileSwap'

export const LOW_CONFIDENCE_REVIEW_THRESHOLD = 0.82

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  produce: Leaf,
  dairy: Milk,
  meat: Beef,
  bakery: Croissant,
  frozen: Snowflake,
  pantry: Package,
  beverages: Coffee,
  snacks: Popcorn,
  deli: Sandwich,
  household: House,
  'personal-care': HeartPulse,
  baby: BabyIcon,
  pet: PawPrint,
  other: ShoppingCart,
}

export function splitCategoryLabel(raw: string): string {
  return raw.replace(/[\p{Emoji}\p{Extended_Pictographic}\uFE0F\u200D\u20E3]/gu, '').trim()
}

export interface GroceryItemRowProps {
  item: GroceryItem
  dismissPhase?: 'queued' | 'exiting' | 'none'
  isDeleting?: boolean
  isDragging?: boolean
  isSpotlighted?: boolean
  isJustMoved?: boolean
  onToggle: (id: string, checked: boolean) => void
  onDelete: (id: string) => void
  onUndoDelete?: (id: string) => void
  onRequestReview?: (id: string) => void
  onRecategorize?: (id: string, category: string) => void
  onMovePointerDown?: (e: PointerEvent<HTMLButtonElement>) => void
  onMovePointerMove?: (e: PointerEvent<HTMLButtonElement>) => void
  onMovePointerUp?: (e: PointerEvent<HTMLButtonElement>) => void
  onMovePointerCancel?: (e: PointerEvent<HTMLButtonElement>) => void
}

export default function GroceryItemRow({
  item,
  dismissPhase = 'none',
  isDeleting = false,
  isDragging = false,
  isSpotlighted = false,
  isJustMoved = false,
  onToggle,
  onDelete,
  onUndoDelete,
  onRequestReview,
  onRecategorize,
  onMovePointerDown,
  onMovePointerMove,
  onMovePointerUp,
  onMovePointerCancel,
}: GroceryItemRowProps) {
  const [isRecatOpen, setIsRecatOpen] = useState(false)

  const visualChecked = item.checked || dismissPhase === 'queued' || dismissPhase === 'exiting'
  const currentCategoryLabel = splitCategoryLabel(
    GROCERY_CATEGORIES.find((category) => category.key === item.category)?.label ?? item.category,
  )
  const needsConfidenceReview =
    !item.checked &&
    !isDeleting &&
    typeof item.enhancement_confidence === 'number' &&
    item.enhancement_confidence < LOW_CONFIDENCE_REVIEW_THRESHOLD

  return (
    <motion.div
      layout
      transition={TACTILE_SPRING_TRANSITION}
      animate={isJustMoved ? TACTILE_SWAP_SCALE_ANIMATION : undefined}
      className={cn(
        'flex flex-col px-4 py-3 hover:bg-casa-surface-subtle transition-all duration-200 ease-out group will-change-transform relative',
        (visualChecked || isDeleting) && 'opacity-50 bg-stone-50/50',
        dismissPhase === 'queued' && 'bg-casa-accent-subtle',
        dismissPhase === 'exiting' && 'opacity-0 translate-y-1 scale-[0.985] max-h-0 py-0',
        isDragging && 'opacity-30',
        isSpotlighted && 'bg-casa-accent-subtle',
        isJustMoved && 'bg-casa-accent-subtle',
      )}
    >
      {/* Radiant Sheen Beam on Move */}
      {isJustMoved && <TactileSheenBeam />}

      {/* Main Row Content */}
      <div className="flex items-center gap-3 w-full">
        {onMovePointerDown && !isDeleting && (
          <IconButton
            icon={<GripVertical size={15} />}
            variant="ghost"
            size="sm"
            onPointerDown={onMovePointerDown}
            onPointerMove={onMovePointerMove}
            onPointerUp={onMovePointerUp}
            onPointerCancel={onMovePointerCancel}
            className="-ml-2 flex-shrink-0 text-casa-muted/40 hover:text-casa-navy touch-none opacity-40 group-hover:opacity-100 transition-opacity"
            aria-label={`Move ${item.name}`}
          />
        )}

        {/* Bespoke Tactile Brass Check Trigger (48px Hit Area) */}
        {!isDeleting && (
          <IconButton
            variant="ghost"
            size="sm"
            onClick={() => onToggle(item.id, !visualChecked)}
            aria-label={visualChecked ? `Mark ${item.name} as not done` : `Mark ${item.name} as done`}
            className="flex-shrink-0 p-0 -ml-1 hover:bg-transparent"
            icon={
              <div
                className={cn(
                  'w-[22px] h-[22px] rounded-lg border flex items-center justify-center transition-all duration-200',
                  visualChecked
                    ? 'bg-casa-gold border-casa-gold text-white shadow-2xs scale-95'
                    : 'border-casa-border bg-white group-hover:border-casa-gold text-transparent'
                )}
              >
                <svg className="w-3.5 h-3.5 stroke-current stroke-[2.5]" viewBox="0 0 24 24" fill="none">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            }
          />
        )}

        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-baseline justify-between gap-2">
            <div className="min-w-0 flex items-baseline gap-2 flex-wrap">
              <span
                className={cn(
                  'text-body font-medium text-casa-navy leading-tight transition-all',
                  (visualChecked || isDeleting) && 'line-through text-casa-muted/70',
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
                <>
                  {(item.quantity || item.unit) && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-casa-bg-2 border border-casa-border/70 text-2xs font-mono font-medium text-casa-muted shrink-0">
                      {item.quantity}{item.unit ? ' ' + item.unit : ''}
                    </span>
                  )}
                  <AnimatePresence>
                    {isJustMoved && <TactileSwapBadge type="move" />}
                  </AnimatePresence>
                </>
              )}
            </div>

            {/* Suggested Chip Toggle */}
            {needsConfidenceReview && (
              <Chip
                tone="accent"
                size="sm"
                icon={<Sparkles size={11} />}
                onClick={() => setIsRecatOpen((prev) => !prev)}
                selected={isRecatOpen}
                title={`Suggested placement (${Math.round((item.enhancement_confidence ?? 0) * 100)}% match). Tap to recategorize.`}
                className="shrink-0"
              >
                Suggested
              </Chip>
            )}
          </div>

          {item.notes && !isDeleting && (
            <p className="text-caption text-casa-muted/80 italic mt-0.5">{item.notes}</p>
          )}
        </div>

        {/* Delete Action (Touch friendly) */}
        {!isDeleting && (
          <IconButton
            icon={<X size={15} />}
            variant="ghost"
            size="sm"
            onClick={() => onDelete(item.id)}
            aria-label={`Delete ${item.name}`}
            className="-mr-2 flex-shrink-0 text-casa-muted/40 hover:text-casa-error hover:bg-casa-error/10 opacity-60 group-hover:opacity-100 transition-all"
          />
        )}
      </div>

      {/* Inline Smooth Expandable Recategorize Tray */}
      <AnimatePresence>
        {isRecatOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: 'auto', marginTop: 10 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="w-full overflow-hidden"
          >
            <div className="rounded-xl border border-casa-gold/30 bg-casa-surface-subtle p-3 shadow-inner">
              <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-casa-border/50">
                <div className="flex items-center gap-1.5 text-casa-top-pick-band">
                  <Sparkles size={12} />
                  <span className="font-semibold text-2xs uppercase tracking-wider">
                    Move from {currentCategoryLabel}:
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (onRecategorize) onRecategorize(item.id, item.category)
                    setIsRecatOpen(false)
                  }}
                  className="text-3xs font-semibold text-casa-top-pick-band hover:underline p-0 h-auto min-h-0"
                >
                  Looks right ✓
                </Button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {GROCERY_CATEGORIES.filter((c) => c.key !== item.category).map((cat) => {
                  const CatIcon = CATEGORY_ICONS[cat.key] ?? ShoppingCart
                  return (
                    <Chip
                      key={`inline-recat-${cat.key}`}
                      onClick={() => {
                        if (onRecategorize) {
                          onRecategorize(item.id, cat.key)
                        } else {
                          onRequestReview?.(item.id)
                        }
                        setIsRecatOpen(false)
                      }}
                      size="sm"
                      tone="neutral"
                      icon={<CatIcon size={12} />}
                      className="cursor-pointer font-medium"
                    >
                      {splitCategoryLabel(cat.label)}
                    </Chip>
                  )
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
