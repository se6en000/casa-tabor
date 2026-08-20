import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles,
  Check,
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
import { Button, IconButton } from '../ui'
import { type ParsedVoiceGroceryItem } from '../../utils/groceryBatchVoiceParser.ts'
import { type GroceryCategoryKey } from '../../utils/groceryCategorization.ts'
import { categoryIconBadgeClassName, getCategoryTone } from '../../utils/groceryVisuals.ts'

const CATEGORY_ICONS: Record<GroceryCategoryKey, LucideIcon> = {
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

interface GroceryVoiceStagingRibbonProps {
  items: ParsedVoiceGroceryItem[]
  onRemoveItem: (id: string) => void
  onCommitAll: (items: ParsedVoiceGroceryItem[]) => void
  onCancel: () => void
  autoCommitSeconds?: number
}

export default function GroceryVoiceStagingRibbon({
  items,
  onRemoveItem,
  onCommitAll,
  onCancel,
  autoCommitSeconds = 5,
}: GroceryVoiceStagingRibbonProps) {
  const [secondsRemaining, setSecondsRemaining] = useState(autoCommitSeconds)
  const [isPaused, setIsPaused] = useState(false)

  // Countdown timer for automatic batch ingestion
  useEffect(() => {
    if (items.length === 0 || isPaused) return

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          onCommitAll(items)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [items, isPaused, onCommitAll])

  if (items.length === 0) return null

  const progressPercent = ((autoCommitSeconds - secondsRemaining) / autoCommitSeconds) * 100

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.96 }}
      transition={{ duration: 0.24, ease: 'easeOut' }}
      className="relative overflow-hidden rounded-2xl border border-casa-gold/45 bg-gradient-to-br from-casa-surface via-casa-surface-subtle to-casa-surface p-4 shadow-card"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={() => setIsPaused(true)}
    >
      {/* Auto-Commit Progress Line */}
      {!isPaused && secondsRemaining > 0 && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-casa-border/40 overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-casa-gold to-casa-accent-warm"
            initial={{ width: '0%' }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.9, ease: 'linear' }}
          />
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-casa-border/60">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-casa-gold/20 text-casa-top-pick-band border border-casa-gold/30">
            <Sparkles size={14} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display text-body-sm font-semibold text-casa-navy">
                Staged Provisions
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-3xs font-mono font-semibold bg-casa-accent-soft text-casa-top-pick-band border border-casa-gold/30">
                {items.length} detected
              </span>
            </div>
            <p className="text-3xs text-casa-muted mt-0.5">
              {isPaused
                ? 'Review or adjust detected items. Tap Add All when ready.'
                : `Auto-adding in ${secondsRemaining}s... tap any item to edit or pause.`}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="text-2xs font-medium text-casa-muted hover:text-casa-error hover:bg-casa-error/10"
          >
            Discard
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => onCommitAll(items)}
            className="flex items-center gap-1.5 shadow-2xs"
          >
            <Check size={14} />
            <span>Add All Now</span>
          </Button>
        </div>
      </div>

      {/* Detected Provision Chips */}
      <div className="flex flex-wrap gap-2 pt-3">
        <AnimatePresence>
          {items.map((item) => {
            const CatIcon = CATEGORY_ICONS[item.category] ?? ShoppingCart
            const tone = getCategoryTone(item.category)

            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ duration: 0.18 }}
                className={cn(
                  'group flex items-center gap-2 rounded-xl border border-casa-border/90 bg-white px-3 py-1.5 shadow-2xs',
                  'hover:border-casa-gold/70 transition-all'
                )}
              >
                {/* Category Icon Badge */}
                <div
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-casa-border/60 text-casa-navy',
                    categoryIconBadgeClassName(tone)
                  )}
                >
                  <CatIcon size={11} />
                </div>

                {/* Name and Quantity */}
                <span className="text-body-sm font-medium text-casa-navy">
                  {item.name}
                </span>

                {(item.quantity || item.unit) && (
                  <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-casa-bg-2 border border-casa-border/70 text-3xs font-mono font-medium text-casa-muted">
                    {item.quantity}
                    {item.unit ? ` ${item.unit}` : ''}
                  </span>
                )}

                {/* Discard Chip Button */}
                <IconButton
                  icon={<X size={12} />}
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemoveItem(item.id)}
                  aria-label={`Remove ${item.name} from staging`}
                  className="-mr-1 text-casa-muted/60 hover:text-casa-error hover:bg-casa-error/15 transition-colors"
                />
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
