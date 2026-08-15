import type { PointerEvent } from 'react'
import { GripVertical, Sparkles, X } from 'lucide-react'
import { cn } from '../../utils/cn'
import { GROCERY_CATEGORIES, type GroceryItem } from '../../hooks/useGroceryList'
import { Checkbox, Chip, IconButton } from '../ui'

export const LOW_CONFIDENCE_REVIEW_THRESHOLD = 0.82

export function splitCategoryLabel(raw: string): string {
  const parts = raw.split('/')
  return parts[0]?.trim() || raw
}

export interface GroceryItemRowProps {
  item: GroceryItem
  dismissPhase?: 'queued' | 'exiting' | 'none'
  isDragging?: boolean
  isSpotlighted?: boolean
  onToggle: (id: string, checked: boolean) => void
  onDelete: (id: string) => void
  onRequestReview?: (id: string) => void
  onMovePointerDown?: (e: PointerEvent<HTMLButtonElement>) => void
  onMovePointerMove?: (e: PointerEvent<HTMLButtonElement>) => void
  onMovePointerUp?: (e: PointerEvent<HTMLButtonElement>) => void
  onMovePointerCancel?: (e: PointerEvent<HTMLButtonElement>) => void
}

export default function GroceryItemRow({
  item,
  dismissPhase = 'none',
  isDragging = false,
  isSpotlighted = false,
  onToggle,
  onDelete,
  onRequestReview,
  onMovePointerDown,
  onMovePointerMove,
  onMovePointerUp,
  onMovePointerCancel,
}: GroceryItemRowProps) {
  const visualChecked = item.checked || dismissPhase !== 'none'
  const categoryLabel = splitCategoryLabel(
    GROCERY_CATEGORIES.find((category) => category.key === item.category)?.label ?? item.category,
  )
  const metaParts = [
    item.store_section?.trim() || categoryLabel,
    item.subcategory?.trim(),
    item.brand?.trim(),
  ].filter((value): value is string => Boolean(value))
  const needsConfidenceReview =
    !item.checked &&
    typeof item.enhancement_confidence === 'number' &&
    item.enhancement_confidence < LOW_CONFIDENCE_REVIEW_THRESHOLD

  return (
    <div
      className={cn(
        'flex items-start gap-3 px-4 py-3 hover:bg-casa-bg/60 transition-all duration-200 ease-out group will-change-transform',
        visualChecked && 'opacity-55',
        dismissPhase === 'queued' && 'bg-casa-gold/8',
        dismissPhase === 'exiting' && 'opacity-0 translate-y-1 scale-[0.985] max-h-0 py-0',
        isDragging && 'opacity-30',
        isSpotlighted && 'ring-2 ring-casa-gold/60 bg-casa-gold/10',
      )}
    >
      {onMovePointerDown && (
        <IconButton
          icon={<GripVertical size={16} />}
          variant="ghost"
          size="sm"
          onPointerDown={onMovePointerDown}
          onPointerMove={onMovePointerMove}
          onPointerUp={onMovePointerUp}
          onPointerCancel={onMovePointerCancel}
          className="-ml-2 flex-shrink-0 text-casa-muted/60 hover:text-casa-navy touch-none"
          aria-label={`Move ${item.name}`}
        />
      )}
      <Checkbox
        checked={visualChecked}
        onChange={() => onToggle(item.id, !visualChecked)}
        label={visualChecked ? `Mark ${item.name} as not done` : `Mark ${item.name} as done`}
        className="min-h-0 shrink-0 gap-0 pt-0.5 [&>span:last-child]:sr-only"
      />
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex items-baseline gap-2">
            <span
              className={cn(
                'text-body font-semibold text-casa-text leading-tight transition-all',
                visualChecked && 'line-through text-casa-muted',
              )}
            >
              {item.name}
            </span>
            {(item.quantity || item.unit) && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-casa-bg border border-casa-border text-2xs font-mono font-medium text-casa-muted shrink-0">
                {item.quantity}{item.unit ? ' ' + item.unit : ''}
              </span>
            )}
          </div>
          {needsConfidenceReview && (
            <Chip
              tone="info"
              size="sm"
              icon={<Sparkles size={11} />}
              onClick={() => onRequestReview?.(item.id)}
              title={`Suggested placement (${Math.round((item.enhancement_confidence ?? 0) * 100)}% confidence). Tap to recategorize.`}
              className="shrink-0"
            >
              Suggested
            </Chip>
          )}
        </div>
        <p className="mt-0.5 text-caption leading-relaxed text-casa-muted font-normal">
          {metaParts.join(' · ')}
        </p>
        {item.notes && (
          <p className="text-caption text-casa-muted/80 italic mt-0.5">{item.notes}</p>
        )}
      </div>
      <IconButton
        icon={<X size={15} />}
        variant="ghost"
        size="sm"
        onClick={() => onDelete(item.id)}
        aria-label={`Delete ${item.name}`}
        className="-mr-2 flex-shrink-0 text-casa-muted/50 hover:text-casa-error hover:bg-casa-error/10"
      />
    </div>
  )
}
