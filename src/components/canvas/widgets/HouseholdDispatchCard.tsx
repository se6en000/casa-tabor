import { Sparkles, RotateCw, Cloud } from 'lucide-react'
import { cn } from '../../../utils/cn'
import { IconButton } from '../../ui'
import type { DispatchBucket, DispatchDay, DispatchHorizonItem } from '../../../hooks/useCalmKioskPresenter'

interface HouseholdDispatchCardProps {
  timeHorizonLabel: string
  headline: string
  weatherLabel: string | null
  weekDays: DispatchDay[]
  horizon: DispatchHorizonItem[]
  isRefreshing: boolean
  onRefresh: () => void
}

const BUCKET_DOT: Record<DispatchBucket, string> = {
  sports: 'bg-casa-success',
  school: 'bg-casa-info',
  social: 'bg-casa-gold',
  travel: 'bg-casa-text-tertiary',
  other: 'bg-casa-text-tertiary',
}

const BUCKET_TAG: Record<DispatchBucket, string> = {
  sports: 'bg-casa-success-soft text-casa-success-strong',
  school: 'bg-casa-info-soft text-casa-info-strong',
  social: 'bg-casa-gold/15 text-amber-800',
  travel: 'bg-casa-bg-2 text-casa-muted',
  other: 'bg-casa-bg-2 text-casa-muted',
}

const BUCKET_ORDER: DispatchBucket[] = ['sports', 'school', 'social', 'travel', 'other']

const LEGEND: Array<{ bucket: DispatchBucket; label: string }> = [
  { bucket: 'sports', label: 'Sports' },
  { bucket: 'school', label: 'School' },
  { bucket: 'social', label: 'Social' },
  { bucket: 'other', label: 'Household' },
]

/**
 * The home screen's daily digest — replaces the old single run-on sentence
 * ("83°F, on the radar: X and Y...") with a scannable week ribbon (signal,
 * not every routine event) plus a curated 30-day milestone ledger. Designed
 * to be legible at rest, no tap required — see design concept approved
 * 2026-09-11 (household-dispatch mockup).
 */
export default function HouseholdDispatchCard({
  timeHorizonLabel,
  headline,
  weatherLabel,
  weekDays,
  horizon,
  isRefreshing,
  onRefresh,
}: HouseholdDispatchCardProps) {
  const activeBuckets = new Set(weekDays.flatMap((d) => d.categories))
  // travel and other share the same neutral dot color (there's nothing left
  // to distinguish them with once sports/school/social have their own hue),
  // so both activate the single "Household" legend row rather than needing
  // two identical-looking dots explained by two different labels.
  const visibleLegend = LEGEND.filter((l) =>
    l.bucket === 'other' ? activeBuckets.has('other') || activeBuckets.has('travel') : activeBuckets.has(l.bucket)
  )

  return (
    <div className="rounded-3xl bg-casa-surface border border-casa-border/80 shadow-card px-5 py-4 sm:px-6 sm:py-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="text-2xs uppercase tracking-widest font-sans font-bold text-amber-700 flex items-center gap-1.5">
          <Sparkles size={13} className="text-casa-gold" />
          {timeHorizonLabel}
        </span>
        <div className="flex items-center gap-2">
          {weatherLabel && (
            <span className="font-mono text-caption text-casa-muted flex items-center gap-1.5 bg-casa-bg-2 border border-casa-border rounded-full px-2.5 py-1">
              <Cloud size={13} className="text-amber-700" />
              {weatherLabel}
            </span>
          )}
          <IconButton
            variant="ghost"
            size="sm"
            aria-label="Refresh daily brief"
            title="Refresh daily brief on demand"
            onClick={onRefresh}
            className="min-h-[44px] min-w-[44px] text-casa-muted hover:text-casa-navy hover:bg-casa-gold/10 transition-colors"
            icon={<RotateCw size={13} className={cn('transition-transform duration-500', isRefreshing && 'animate-spin')} />}
          />
        </div>
      </div>

      {headline && (
        <p className="font-display text-body-lg sm:text-heading text-casa-navy font-medium leading-relaxed mb-4">
          {headline}
        </p>
      )}

      <hr className="border-casa-border/60 mb-4" />

      <p className="text-2xs uppercase tracking-widest font-sans font-bold text-casa-muted mb-2.5">This Week</p>
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {weekDays.map((day) => {
          const orderedCategories = BUCKET_ORDER.filter((b) => day.categories.includes(b))
          return (
            <div
              key={day.date.toISOString()}
              className={cn(
                'flex flex-col items-center gap-1 rounded-xl py-2 px-0.5 border',
                day.isToday
                  ? 'bg-casa-surface border-casa-gold ring-2 ring-casa-gold/25'
                  : 'bg-casa-bg-2 border-transparent'
              )}
            >
              <span className={cn('font-mono text-3xs uppercase tracking-wide', day.isToday ? 'text-amber-700 font-bold' : 'text-casa-text-tertiary')}>
                {day.dayName}
              </span>
              <span className="font-mono text-body-sm font-semibold text-casa-navy tabular-nums">{day.dayNum}</span>
              <span className="flex items-center gap-0.5 h-1.5">
                {orderedCategories.slice(0, 3).map((bucket) => (
                  <span key={bucket} className={cn('w-1.5 h-1.5 rounded-full', BUCKET_DOT[bucket])} />
                ))}
              </span>
            </div>
          )
        })}
      </div>
      {visibleLegend.length > 0 && (
        <div className="flex flex-wrap gap-x-3.5 gap-y-1 mt-2.5 text-caption text-casa-muted">
          {visibleLegend.map((l) => (
            <span key={l.bucket} className="flex items-center gap-1.5">
              <span className={cn('w-1.5 h-1.5 rounded-full', BUCKET_DOT[l.bucket])} />
              {l.label}
            </span>
          ))}
        </div>
      )}

      {horizon.length > 0 && (
        <>
          <hr className="border-casa-border/60 my-4" />
          <p className="text-2xs uppercase tracking-widest font-sans font-bold text-casa-muted mb-1">On the Horizon</p>
          <div className="flex flex-col">
            {horizon.map((item, idx) => (
              <div
                key={item.id}
                className={cn('grid grid-cols-[48px_1fr] gap-3 py-2.5', idx > 0 && 'border-t border-casa-border/60')}
              >
                <span className="font-mono text-caption font-bold text-amber-700 leading-tight pt-0.5">
                  {item.daysAway}d
                  <span className="block text-3xs font-medium uppercase tracking-wide text-casa-text-tertiary">{item.dateLabel}</span>
                </span>
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-display text-body font-semibold text-casa-navy">{item.title}</span>
                    <span className={cn('text-3xs font-bold uppercase tracking-wide px-2 py-0.5 rounded-full whitespace-nowrap', BUCKET_TAG[item.bucket])}>
                      {item.categoryLabel}
                    </span>
                  </div>
                  {item.prepPhrase && (
                    <p className="text-caption text-casa-muted mt-0.5">{item.prepPhrase}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
