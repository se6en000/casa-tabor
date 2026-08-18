import type { ComponentType, PointerEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ShoppingCart } from 'lucide-react'
import { Button, Chip, Heading, Text } from '../ui'
import { cn } from '../../utils/cn'
import { GROCERY_CATEGORIES, type GroceryItem } from '../../hooks/useGroceryList'
import { categoryIconBadgeClassName, getCategoryTone } from '../../utils/groceryVisuals'
import GroceryItemRow, { splitCategoryLabel } from './GroceryItemRow'

export interface CategoryVisualDef {
  icon: ComponentType<{ size?: number; className?: string }>
  subtitle: string
}

export interface GrocerySectionData {
  key: string
  label: string
  items: GroceryItem[]
  dropKey: string | null
  visual: CategoryVisualDef
  reviewCount: number
}

export interface CompletedCategoryGroup {
  key: string
  label: string
  items: GroceryItem[]
}

export interface GroceryAisleGridProps {
  sections: GrocerySectionData[]
  completedSections: CompletedCategoryGroup[]
  showCompletedArchive: boolean
  onToggleCompletedArchive: () => void
  dragState: {
    itemId: string
    itemName: string
    fromCategory: string
    pointerId: number
    x: number
    y: number
  } | null
  dragOverCategory: string | null
  spotlightedItemId: string | null
  isItemJustMoved?: (id: string) => boolean
  dismissingIds: Set<string>
  dismissingExitingIds: Set<string>
  deletingIds?: Set<string>
  onToggleItem: (id: string, checked: boolean) => void
  onDeleteItem: (id: string) => void
  onUndoDelete?: (id: string) => void
  onRequestReview?: (id: string) => void
  onRecategorize?: (id: string, category: string) => void
  onMovePointerDown: (item: GroceryItem, category: string, e: PointerEvent<HTMLButtonElement>) => void
  onMovePointerMove: (e: PointerEvent<HTMLButtonElement>) => void
  onMovePointerUp: (e: PointerEvent<HTMLButtonElement>) => void
  onMovePointerCancel: (e: PointerEvent<HTMLButtonElement>) => void
  onClearCompleted?: () => void
}

export default function GroceryAisleGrid({
  sections,
  completedSections,
  showCompletedArchive,
  onToggleCompletedArchive,
  onClearCompleted,
  dragState,
  dragOverCategory,
  spotlightedItemId,
  isItemJustMoved,
  dismissingIds,
  dismissingExitingIds,
  deletingIds,
  onToggleItem,
  onDeleteItem,
  onUndoDelete,
  onRequestReview,
  onRecategorize,
  onMovePointerDown,
  onMovePointerMove,
  onMovePointerUp,
  onMovePointerCancel,
}: GroceryAisleGridProps) {
  return (
    <div className="w-full">
      {/* ── Drag drop-target banner ── */}
      {dragState && (
        <div className="mb-4 rounded-2xl border border-casa-gold/40 bg-casa-surface-subtle p-3.5 shadow-2xs">
          <p className="text-caption font-semibold text-casa-navy uppercase tracking-wider mb-2">
            Move to category:
          </p>
          <div className="flex flex-wrap gap-2">
            {GROCERY_CATEGORIES.map((cat) => (
              <Chip
                key={`drop-target-${cat.key}`}
                data-drop-category={cat.key}
                size="sm"
                selected={dragOverCategory === cat.key}
                className="cursor-pointer font-medium"
              >
                {splitCategoryLabel(cat.label)}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {sections.length === 0 ? (
        <div className="rounded-3xl border border-casa-border bg-casa-surface p-12 text-center space-y-3 shadow-2xs">
          <div className="w-14 h-14 rounded-2xl bg-casa-accent-soft border border-casa-gold/30 text-casa-gold flex items-center justify-center mx-auto">
            <ShoppingCart size={28} />
          </div>
          <p className="font-display text-display-sm font-semibold text-casa-navy">All Provisions Accounted For</p>
          <p className="text-body-sm text-casa-muted max-w-md mx-auto">
            Your market basket is clear. Use the composer above, choose from express rhythms, or import ingredients from planned meals.
          </p>
        </div>
      ) : (
        <div className="columns-1 gap-3 lg:columns-2 2xl:columns-3">
          <AnimatePresence initial={false}>
            {sections.map((section) => {
              const CategoryIcon = section.visual.icon
              return (
                <motion.div
                  key={section.key}
                  layout
                  initial={false}
                  exit={{ opacity: 0, scale: 0.96, height: 0, marginBottom: 0, transition: { duration: 0.32, ease: 'easeInOut' } }}
                  transition={{ layout: { duration: 0.28, ease: 'easeInOut' } }}
                  data-drop-category={section.dropKey ?? undefined}
                  className={cn(
                    'mb-4 overflow-hidden break-inside-avoid rounded-2xl',
                    section.dropKey && dragState && dragOverCategory === section.dropKey && 'bg-casa-gold/5 ring-2 ring-casa-gold/60',
                  )}
                >
                  {/* Belgian Linen Plinth Enclosure */}
                  <div className="overflow-hidden rounded-2xl border border-casa-border/85 bg-casa-surface shadow-card hover:shadow-card-hover transition-all duration-300">
                    {/* Plinth Header (Warm Belgian Linen Gradient) */}
                    <div className="flex items-center justify-between gap-3 border-b border-casa-border/70 bg-gradient-to-b from-casa-bg to-casa-bg-2 px-4 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className={cn(
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-casa-border/80 bg-white shadow-2xs text-casa-navy',
                            categoryIconBadgeClassName(getCategoryTone(section.key)),
                          )}
                        >
                          <CategoryIcon size={17} />
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate font-display text-body font-semibold leading-tight text-casa-navy">{section.label}</h3>
                          <p className="text-2xs font-mono uppercase tracking-wider text-casa-muted/90">{section.visual.subtitle}</p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {section.reviewCount > 0 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-semibold bg-casa-warning/15 text-casa-warning border border-casa-warning/30">
                            {section.reviewCount} suggested
                          </span>
                        )}
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-2xs font-semibold bg-casa-bg-2 text-casa-text border border-casa-border/60">
                          {section.items.length} {section.items.length === 1 ? 'item' : 'items'}
                        </span>
                      </div>
                    </div>

                    {/* Plinth Item Rows */}
                    {section.items.length === 0 ? (
                      <div className="px-4 py-3.5 text-center text-3xs font-mono text-casa-muted italic bg-casa-surface-subtle/50">
                        All provisions in cart ✓
                      </div>
                    ) : (
                      <div className="divide-y divide-casa-divider/70">
                        {section.items.map((item) => (
                          <div key={item.id} id={`grocery-item-${item.id}`}>
                            <GroceryItemRow
                              item={item}
                              dismissPhase={dismissingExitingIds.has(item.id) ? 'exiting' : dismissingIds.has(item.id) ? 'queued' : 'none'}
                              isDeleting={deletingIds?.has(item.id)}
                              isDragging={dragState?.itemId === item.id}
                              isSpotlighted={spotlightedItemId === item.id}
                              isJustMoved={isItemJustMoved?.(item.id)}
                              onRequestReview={onRequestReview}
                              onRecategorize={onRecategorize}
                              onToggle={onToggleItem}
                              onDelete={onDeleteItem}
                              onUndoDelete={onUndoDelete}
                              onMovePointerDown={(e: PointerEvent<HTMLButtonElement>) => onMovePointerDown(item, item.category, e)}
                              onMovePointerMove={onMovePointerMove}
                              onMovePointerUp={onMovePointerUp}
                              onMovePointerCancel={onMovePointerCancel}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}

      {/* ── SECTION: THE COMPLETED ARCHIVE LEDGER ── */}
      {completedSections.length > 0 && (
        <div className="mt-10 pt-5 border-t border-casa-border/60">
          <div className="flex items-center justify-between mb-3.5">
            <div>
              <Text role="caption" className="font-mono uppercase tracking-wider text-2xs font-bold text-casa-muted">
                Archive &amp; In-Cart
              </Text>
              <Heading role="display-sm" className="font-display text-body font-semibold text-casa-navy">
                The Procured Ledger
              </Heading>
            </div>
            <div className="flex items-center gap-2">
              {onClearCompleted && showCompletedArchive && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClearCompleted}
                  className="text-body-sm font-semibold text-casa-error hover:bg-casa-error/10"
                >
                  Clear all
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleCompletedArchive}
                className="text-body-sm font-semibold text-casa-muted hover:text-casa-navy"
              >
                {showCompletedArchive ? 'Hide' : `Show (${completedSections.reduce((sum, c) => sum + c.items.length, 0)})`}
              </Button>
            </div>
          </div>

          {showCompletedArchive && (
            <div className="space-y-4">
              {completedSections.map((cat) => (
                <div key={`completed-cat-${cat.key}`} className="rounded-2xl border border-casa-border bg-casa-surface/80 p-3.5 shadow-2xs">
                  <p className="text-caption font-mono uppercase font-bold text-2xs text-casa-muted mb-2">
                    {cat.label} ({cat.items.length})
                  </p>
                  <div className="divide-y divide-casa-divider/70">
                    {cat.items.map((item) => (
                      <div key={item.id} id={`grocery-item-${item.id}`}>
                        <GroceryItemRow
                          item={item}
                          isSpotlighted={spotlightedItemId === item.id}
                          onToggle={onToggleItem}
                          onDelete={onDeleteItem}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
