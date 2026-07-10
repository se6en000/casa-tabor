import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../utils/cn'

export interface CalendarPillProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode
  color?: string
}

/**
 * Compact, read-only metadata for dense calendar cards. This is intentionally
 * not interactive; tappable pills must use Chip and its full touch target.
 */
export function CalendarPill({ children, color, className, style, ...rest }: CalendarPillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-pill border px-2 py-0.5 text-caption font-bold leading-none',
        color ? 'border-transparent text-white' : 'border-casa-border bg-casa-bg text-casa-muted',
        className,
      )}
      style={{ ...style, backgroundColor: color ?? style?.backgroundColor }}
      {...rest}
    >
      {children}
    </span>
  )
}
