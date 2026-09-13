import { forwardRef } from 'react'
import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../utils/cn'

export type WidgetTier = 'structural' | 'ambient' | 'spotlight'

export interface WidgetContainerProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Optional icon rendered in the widget title bar. */
  icon?: ReactNode
  /** Widget header title. */
  title?: ReactNode
  /** Small-caps label above the title -- Ambient tier only (e.g. "Tonight's Kitchen"). */
  eyebrow?: ReactNode
  /** Badge or count rendered on the top right. */
  badge?: ReactNode
  /** Optional subheader actions or tabs. */
  actions?: ReactNode
  /**
   * Which of the three card materials this widget uses -- see the
   * "Card Material Tiers" reference approved 2026-09-12:
   * - structural (default): flat white, for anything you scan (lists, schedules).
   * - ambient: warm gold-wash gradient, for house/status chrome (Tonight's Kitchen).
   * - spotlight: solid navy + gold glow, for the single most urgent item on
   *   screen. Cap this at one per view -- two spotlights and neither means
   *   "most important" anymore.
   */
  tier?: WidgetTier
}

export const TIER_CARD: Record<WidgetTier, string> = {
  structural: 'bg-casa-surface border border-casa-border shadow-card',
  ambient: 'material-ambient border border-casa-gold/40',
  // Flat navy instead of a gradient -- part of the "strip GPU-heavy CSS"
  // scroll-perf experiment on the Pi kiosk (2026-09-12): a gradient fill
  // costs real GPU raster time on every scroll frame it's visible for,
  // a flat color costs effectively none.
  spotlight: 'bg-casa-navy border border-white/10 shadow-hero-dark text-white',
}

export const TIER_ICON_CHIP: Record<WidgetTier, string> = {
  structural: 'bg-casa-gold/15 text-casa-gold',
  ambient: 'bg-casa-gold/20 text-casa-gold-hover',
  spotlight: 'bg-white/10 text-casa-gold',
}

export const TIER_TITLE: Record<WidgetTier, string> = {
  structural: 'text-casa-navy',
  ambient: 'text-casa-navy',
  spotlight: 'text-white',
}

export const TIER_EYEBROW: Record<WidgetTier, string> = {
  structural: 'text-casa-gold-hover',
  ambient: 'text-casa-gold-hover',
  spotlight: 'text-casa-gold',
}

export const TIER_DIVIDER: Record<WidgetTier, string> = {
  structural: 'border-casa-border/40',
  ambient: 'border-casa-gold/25',
  spotlight: 'border-white/10',
}

/**
 * Canonical Living Canvas Widget Container.
 * Standardizes the 3-pane bento tile geometry (rounded-container, shadow-widget,
 * clean internal scroll containment, and consistent header hierarchy) across
 * all three card material tiers -- see the `tier` prop.
 */
export const WidgetContainer = forwardRef<HTMLDivElement, WidgetContainerProps>(
  function WidgetContainer(
    { icon, title, eyebrow, badge, actions, tier = 'structural', className, children, ...rest },
    ref,
  ) {
    return (
      <div
        ref={ref}
        className={cn(
          'flex flex-col rounded-container p-5 overflow-hidden',
          TIER_CARD[tier],
          className,
        )}
        {...rest}
      >
        {(title || badge || actions || eyebrow) && (
          <div className={cn('flex items-center justify-between pb-3 mb-3 border-b shrink-0 gap-2', TIER_DIVIDER[tier])}>
            <div className="flex flex-col min-w-0 gap-1">
              {eyebrow && (
                <span className={cn('text-3xs font-bold uppercase tracking-widest', TIER_EYEBROW[tier])}>
                  {eyebrow}
                </span>
              )}
              <div className="flex items-center gap-2 min-w-0">
                {icon && (
                  <span className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', TIER_ICON_CHIP[tier])}>
                    {icon}
                  </span>
                )}
                {title && (
                  <h2 className={cn('font-display text-body-lg font-bold truncate', TIER_TITLE[tier])}>
                    {title}
                  </h2>
                )}
              </div>
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
