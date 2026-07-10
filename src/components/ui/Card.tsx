import { forwardRef } from 'react'
import type { HTMLAttributes } from 'react'
import { cn } from '../../utils/cn'
import { cardClassName, type CardPadding, type CardTone } from '../../design-system/variants.mjs'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: CardPadding
  tone?: CardTone
  /** Adds hover/focus affordances for tappable cards (e.g. list rows that navigate on tap). */
  interactive?: boolean
}

/**
 * Canonical surface container (rounded-card / shadow-card / casa-border),
 * matching the convention already used across Settings, Home, and the
 * design-system gallery. Purely presentational — composes any content.
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { padding, tone, interactive = false, className, tabIndex, role, onKeyDown, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      tabIndex={interactive ? (tabIndex ?? 0) : tabIndex}
      role={interactive ? (role ?? 'button') : role}
      onKeyDown={interactive ? (event) => {
        onKeyDown?.(event)
        if (!event.defaultPrevented && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          event.currentTarget.click()
        }
      } : onKeyDown}
      className={cn(cardClassName({ padding, tone, interactive }), className)}
      {...rest}
    />
  )
})
