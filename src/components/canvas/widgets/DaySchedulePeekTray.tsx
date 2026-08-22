import { Calendar, Clock, Sparkles, AlertTriangle, Check, ChevronUp, Loader2 } from 'lucide-react'
import { Button } from '../../ui'
import { cn } from '../../../utils/cn'
import { useDayEventsPeek } from '../../../hooks/useDayEventsPeek'
import { type ProposedActionSlot } from '../../../utils/daySchedulePeek'

export interface DaySchedulePeekTrayProps {
  action: ProposedActionSlot
  onClose: () => void
  className?: string
}

export function DaySchedulePeekTray({
  action,
  onClose,
  className,
}: DaySchedulePeekTrayProps) {
  const { data: schedule, isLoading } = useDayEventsPeek(action, true)

  if (isLoading) {
    return (
      <div className={cn(
        'p-3 sm:p-3.5 rounded-xl bg-casa-surface border border-casa-gold/40 shadow-inner flex items-center justify-center gap-2 text-caption text-casa-muted animate-in fade-in duration-150',
        className
      )}>
        <Loader2 size={14} className="animate-spin text-casa-gold" />
        <span>Loading {action.displayDate ? action.displayDate.split('·')[0].trim() : 'day'} schedule...</span>
      </div>
    )
  }

  if (!schedule) return null

  return (
    <div className={cn(
      'p-3 sm:p-3.5 rounded-xl bg-white/95 border border-casa-gold/50 shadow-sm space-y-2.5 animate-in slide-in-from-top-2 duration-200 text-casa-navy font-body w-full',
      className
    )}>
      <div className="flex items-center justify-between border-b border-casa-border/60 pb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <Calendar size={13} className="text-casa-gold shrink-0" />
          <span className="text-caption font-bold text-casa-navy truncate">
            {action.displayDate ? action.displayDate.split('·')[0].trim() : 'Day Schedule'}
          </span>
          <span className="text-3xs font-mono font-semibold px-2 py-0.5 rounded-full bg-casa-bg text-casa-muted shrink-0">
            {schedule.existingEventsCount === 0
              ? 'Clear Day'
              : `${schedule.existingEventsCount} Existing Event${schedule.existingEventsCount > 1 ? 's' : ''}`}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="text-3xs font-bold uppercase tracking-wider text-casa-muted hover:text-casa-navy h-auto py-0.5 px-2 min-h-0 flex items-center gap-1 cursor-pointer"
        >
          <span>Hide</span>
          <ChevronUp size={11} />
        </Button>
      </div>

      {schedule.isDayCompletelyClear ? (
        <div className="p-2.5 rounded-lg bg-emerald-50/80 border border-emerald-200/80 text-emerald-900 text-caption font-medium flex items-center gap-2">
          <Sparkles size={13} className="text-emerald-600 shrink-0" />
          <span>Your calendar is completely open on this date. No other family events scheduled.</span>
        </div>
      ) : (
        <div className="space-y-1.5">
          {schedule.timelineItems.map((item) => {
            if (item.isProposed) {
              return (
                <div
                  key={item.id}
                  className={cn(
                    'p-2.5 rounded-lg border-2 border-dashed transition-all flex items-start gap-2 shadow-2xs',
                    item.hasConflictWithProposed
                      ? 'bg-rose-50/80 border-rose-400 text-rose-950'
                      : 'bg-casa-gold/15 border-casa-gold/80 text-casa-navy'
                  )}
                >
                  <div className="w-5 h-5 rounded-md bg-casa-gold/20 text-casa-navy flex items-center justify-center shrink-0 mt-0.5 border border-casa-gold/40">
                    <Sparkles size={11} className="text-casa-gold" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-caption font-bold text-casa-navy">
                        {item.title}
                      </span>
                      <span className="text-3xs font-bold uppercase font-mono px-1.5 py-0.2 rounded bg-casa-navy text-casa-gold">
                        Proposed Slot
                      </span>
                    </div>
                    <div className="text-2xs font-medium text-casa-muted flex items-center gap-1.5">
                      <Clock size={10} className="text-casa-gold" />
                      <span>{item.timeRangeFormatted}</span>
                      {item.assignedMemberName && (
                        <span>· For {item.assignedMemberName}</span>
                      )}
                    </div>
                    {item.hasConflictWithProposed ? (
                      <div className="text-3xs font-bold text-rose-800 flex items-center gap-1 pt-0.5">
                        <AlertTriangle size={10} className="text-rose-600" />
                        <span>Warning: Overlaps with an existing commitment below</span>
                      </div>
                    ) : (
                      <div className="text-3xs font-semibold text-emerald-800 flex items-center gap-1 pt-0.5">
                        <Check size={10} className="text-emerald-600" />
                        <span>Fits cleanly into family schedule</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            }

            return (
              <div
                key={item.id}
                className={cn(
                  'p-2 rounded-lg border transition-all flex items-start gap-2',
                  item.hasConflictWithProposed
                    ? 'bg-rose-50/60 border-rose-300 text-rose-950'
                    : 'bg-casa-bg border-casa-border/80 text-casa-navy'
                )}
              >
                <span className="w-2 h-2 rounded-full shrink-0 mt-1.5 bg-casa-gold" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-body-sm font-semibold text-casa-navy truncate">
                      {item.title}
                    </div>
                    <span className="text-2xs font-mono text-casa-muted shrink-0 font-medium">
                      {item.timeRangeFormatted}
                    </span>
                  </div>
                  {item.assignedMemberName && (
                    <div className="text-2xs text-casa-muted">
                      {item.assignedMemberName}
                      {item.location ? ` · ${item.location}` : ''}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
