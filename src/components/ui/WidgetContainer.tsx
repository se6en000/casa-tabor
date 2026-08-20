import { forwardRef } from 'react'
import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../utils/cn'

export interface WidgetContainerProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Optional icon rendered in the widget title bar. */
  icon?: ReactNode
  /** Widget header title. */
  title?: ReactNode
  /** Badge or count rendered on the top right. */
  badge?: ReactNode
  /** Optional subheader actions or tabs. */
  actions?: ReactNode
}

/**
 * Canonical Living Canvas Widget Container.
 * Standardizes the 3-pane bento tile geometry (rounded-container, shadow-widget,
 * clean internal scroll containment, and consistent header hierarchy).
 */
export const WidgetContainer = forwardRef<HTMLDivElement, WidgetContainerProps>(
  function WidgetContainer(
    { icon, title, badge, actions, className, children, ...rest },
    ref,
  ) {
    return (
      <div
        ref={ref}
        className={cn(
          'flex flex-col rounded-container bg-casa-surface border border-casa-border/60 shadow-widget p-5 overflow-hidden',
          className,
        )}
        {...rest}
      >
        {(title || badge || actions) && (
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-casa-border/40 shrink-0 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {icon}
              {title && (
                <h2 className="font-display text-body-lg font-bold text-casa-navy truncate">
                  {title}
                </h2>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {badge}
              {actions}
            </div>
          </div>
        )}
        {children}
      </div>
    )
  },
)
