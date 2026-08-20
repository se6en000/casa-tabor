import { cn } from '../../utils/cn'

interface SkeletonProps {
  className?: string
  count?: number
}

/**
 * Architectural skeleton plinth matching the exact physical 2-column geometry
 * of Casa Tabor's EventCard. Prevents Cumulative Layout Shift (CLS) on cold loads.
 */
export function EventCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'relative rounded-widget border border-casa-border/70 bg-casa-surface shadow-card overflow-hidden min-h-control grid grid-cols-[5.75rem_1fr] select-none animate-pulse',
        className,
      )}
    >
      {/* Straight Left Pillar Skeleton */}
      <div className="p-2.5 flex flex-col justify-between items-start border-r border-r-casa-divider bg-casa-bg/80 border-l-4 border-l-casa-gold/30 min-w-0">
        <div className="w-full space-y-1.5">
          <div className="h-4 w-12 rounded bg-casa-sand/40" />
          <div className="h-3 w-8 rounded bg-casa-sand/20" />
        </div>
        <div className="w-3 h-3 rounded-full bg-casa-sand/25 mt-2" />
      </div>

      {/* Right Content Deck Skeleton */}
      <div className="p-3 flex flex-col justify-between gap-2.5 min-w-0 bg-casa-surface">
        <div className="space-y-2 min-w-0">
          <div className="h-4 w-3/4 rounded bg-casa-sand/30" />
          <div className="h-3 w-2/5 rounded bg-casa-sand/20" />
        </div>

        {/* Footer: Avatar placeholder pills */}
        <div className="pt-1.5 border-t border-casa-divider flex items-center justify-between">
          <div className="h-4 w-16 rounded-full bg-casa-sand/25" />
          <div className="flex -space-x-1.5">
            <div className="size-5 rounded-full bg-casa-sand/30 border border-casa-surface" />
            <div className="size-5 rounded-full bg-casa-sand/20 border border-casa-surface" />
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Compact skeleton for All-Day and Reminder cards in Stacked/Month/Week views.
 */
export function CompactCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'relative w-full rounded-xl border border-casa-border/60 bg-casa-surface/70 shadow-2xs px-3 py-2.5 flex items-center justify-between gap-2.5 min-h-[44px] animate-pulse select-none',
        className,
      )}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <div className="h-3 w-12 rounded bg-casa-sand/40 shrink-0" />
        <div className="h-3.5 w-1/2 rounded bg-casa-sand/25 truncate" />
      </div>
      <div className="size-5 rounded-full bg-casa-sand/30 shrink-0" />
    </div>
  )
}

/**
 * Stack of multiple skeleton cards for feeds and column loaders.
 */
export function EventCardSkeletonStack({ count = 3, className }: SkeletonProps) {
  return (
    <div className={cn('space-y-2.5', className)} aria-label="Loading events...">
      {Array.from({ length: count }, (_, i) => (
        <EventCardSkeleton key={i} />
      ))}
    </div>
  )
}
