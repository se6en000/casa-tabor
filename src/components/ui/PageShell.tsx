import type { ReactNode } from 'react'
import { cn } from '../../utils/cn'
import { Heading, Text } from './Typography'

export type PageShellWidth = 'narrow' | 'default' | 'wide' | 'full'

export interface PageShellProps {
  title?: ReactNode
  subtitle?: ReactNode
  /** Header-row actions (buttons, filters) aligned opposite the title. */
  actions?: ReactNode
  children: ReactNode
  className?: string
  /** Class applied to the content wrapper below the header. Defaults to vertical section spacing. */
  contentClassName?: string
  /** Semantic content measure for forms, standard pages, dashboards, or edge-to-edge tools. */
  width?: PageShellWidth
}

const WIDTH_CLASSES: Record<PageShellWidth, string> = {
  narrow: 'max-w-page-narrow',
  default: 'max-w-page',
  wide: 'max-w-page-wide',
  full: 'max-w-none',
}

/**
 * Canonical page layout wrapper: consistent max-width, fluid page-gutter/
 * section-gap spacing (src/design-system/tokens.mjs), and an optional
 * title/subtitle/actions header row. Purely structural — does not fetch
 * data or own any page-specific state.
 */
export function PageShell({ title, subtitle, actions, children, className, contentClassName, width = 'default' }: PageShellProps) {
  return (
    <div className={cn('mx-auto min-w-0 w-full px-page-gutter py-section-gap', WIDTH_CLASSES[width], className)}>
      {(title || subtitle || actions) && (
        <div className="flex min-w-0 flex-col items-stretch gap-3 mb-section-gap sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {title && <Heading role="display-sm">{title}</Heading>}
            {subtitle && <Text role="body-sm" muted className="mt-1">{subtitle}</Text>}
          </div>
          {actions && <div className="flex min-w-0 flex-wrap items-center gap-2 sm:flex-shrink-0">{actions}</div>}
        </div>
      )}
      <div className={cn('min-w-0 space-y-section-gap', contentClassName)}>{children}</div>
    </div>
  )
}
