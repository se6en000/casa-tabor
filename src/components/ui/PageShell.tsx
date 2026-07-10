import type { ReactNode } from 'react'
import { cn } from '../../utils/cn'

export interface PageShellProps {
  title?: ReactNode
  subtitle?: ReactNode
  /** Header-row actions (buttons, filters) aligned opposite the title. */
  actions?: ReactNode
  children: ReactNode
  className?: string
  /** Class applied to the content wrapper below the header. Defaults to vertical section spacing. */
  contentClassName?: string
}

/**
 * Canonical page layout wrapper: consistent max-width, fluid page-gutter/
 * section-gap spacing (src/design-system/tokens.mjs), and an optional
 * title/subtitle/actions header row. Purely structural — does not fetch
 * data or own any page-specific state.
 */
export function PageShell({ title, subtitle, actions, children, className, contentClassName }: PageShellProps) {
  return (
    <div className={cn('mx-auto w-full max-w-6xl px-page-gutter py-section-gap', className)}>
      {(title || subtitle || actions) && (
        <div className="flex items-start justify-between gap-4 mb-section-gap flex-wrap">
          <div className="min-w-0">
            {title && <h1 className="font-display text-display-sm text-casa-navy">{title}</h1>}
            {subtitle && <p className="text-body-sm text-casa-muted mt-1">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
        </div>
      )}
      <div className={cn('space-y-section-gap', contentClassName)}>{children}</div>
    </div>
  )
}
