import { forwardRef } from 'react'
import type { ReactNode } from 'react'
import { motion, type HTMLMotionProps } from 'framer-motion'
import { cn } from '../../utils/cn'

export type ActionCardTone = 'warning' | 'danger' | 'accent' | 'neutral' | 'success'

export interface ActionCardProps extends HTMLMotionProps<'div'> {
  /** Optional header category label (e.g. "RIDE NEEDED", "PREP ITEM"). */
  category?: string
  /** Leading icon for the category. */
  icon?: ReactNode
  /** Main message or description. */
  description: ReactNode
  /** Optional secondary subtitle or timestamp. */
  subtitle?: ReactNode
  /** Slot for 1-click resolver action buttons. */
  actions?: ReactNode
  /** Slot for utility actions (snooze, dismiss, downvote). */
  utilities?: ReactNode
  /** Color tone of the card container. */
  tone?: ActionCardTone
}

const TONE_CLASSES: Record<ActionCardTone, { container: string; category: string; border: string }> = {
  warning: {
    container: 'bg-amber-50/60 border-amber-300/60 text-casa-navy',
    category: 'text-amber-900',
    border: 'border-amber-200/60',
  },
  danger: {
    container: 'bg-red-50/60 border-red-300/60 text-casa-navy',
    category: 'text-red-900',
    border: 'border-red-200/60',
  },
  accent: {
    container: 'bg-casa-accent-subtle/70 border-casa-accent-soft-border text-casa-navy',
    category: 'text-casa-navy',
    border: 'border-casa-accent-soft-border/60',
  },
  neutral: {
    container: 'bg-casa-bg border-casa-border text-casa-navy',
    category: 'text-casa-text-secondary',
    border: 'border-casa-border/60',
  },
  success: {
    container: 'bg-emerald-50/60 border-emerald-300/60 text-casa-navy',
    category: 'text-emerald-900',
    border: 'border-emerald-200/60',
  },
}

/**
 * Canonical Actionable Triage Card.
 * Used for schedule conflicts, 1-click resolvers, attention hub tasks,
 * and departure risk alerts with touch-first buttons.
 */
export const ActionCard = forwardRef<HTMLDivElement, ActionCardProps>(
  function ActionCard(
    {
      category,
      icon,
      description,
      subtitle,
      actions,
      utilities,
      tone = 'warning',
      className,
      ...rest
    },
    ref,
  ) {
    const toneConfig = TONE_CLASSES[tone] || TONE_CLASSES.warning

    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className={cn(
          'p-4 rounded-widget border shadow-sm relative flex flex-col justify-between',
          toneConfig.container,
          className,
        )}
        {...rest}
      >
        <div>
          {/* Header Category + Utility actions */}
          {(category || icon || utilities) && (
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-1.5">
                {icon}
                {category && (
                  <span
                    className={cn(
                      'text-caption font-bold uppercase tracking-wider',
                      toneConfig.category,
                    )}
                  >
                    {category}
                  </span>
                )}
              </div>
              {utilities && <div className="flex items-center gap-1">{utilities}</div>}
            </div>
          )}

          {/* Description */}
          <div className="text-body-sm font-semibold leading-snug text-casa-navy">
            {description}
          </div>

          {subtitle && (
            <div className="text-caption text-casa-text-secondary mt-1">
              {subtitle}
            </div>
          )}
        </div>

        {/* 1-Click Action Resolvers (44px Minimum Touch Targets) */}
        {actions && (
          <div
            className={cn(
              'mt-3 pt-3 border-t flex flex-wrap items-center gap-2',
              toneConfig.border,
            )}
          >
            {actions}
          </div>
        )}
      </motion.div>
    )
  },
)
