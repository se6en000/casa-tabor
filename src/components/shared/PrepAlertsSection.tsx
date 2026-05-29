import { motion, AnimatePresence } from 'framer-motion'
import { differenceInDays, parseISO } from 'date-fns'
import { usePrepItems, useDismissPrepItem, useSnoozePrepItem } from '../../hooks/usePrepItems'
import { cn } from '../../utils/cn'

const PRIORITY_BORDER: Record<number, string> = {
  3: 'border-red-200 bg-red-50',
  2: 'border-amber-200 bg-amber-50',
  1: 'border-blue-100 bg-blue-50',
}

function daysLabel(eventDate: string | null): string {
  if (!eventDate) return ''
  const days = differenceInDays(parseISO(eventDate), new Date())
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return `In ${days} days`
}

export default function PrepAlertsSection({ className }: { className?: string }) {
  const { data: items } = usePrepItems()
  const dismiss = useDismissPrepItem()
  const snooze = useSnoozePrepItem()

  if (!items || items.length === 0) return null

  return (
    <div className={cn('space-y-2', className)}>
      <h3 className="text-caption font-semibold uppercase tracking-wide text-casa-muted px-1">
        📋 Prep Needed
      </h3>
      <AnimatePresence initial={false}>
        {items.map((item) => {
          const borderBg = PRIORITY_BORDER[item.priority] ?? PRIORITY_BORDER[2]
          const days = daysLabel(item.event_date)
          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 4, height: 'auto' }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0, marginTop: 0, overflow: 'hidden' }}
              transition={{ duration: 0.2 }}
              className={cn(
                'flex items-start gap-3 px-4 py-3 rounded-card border text-body-sm',
                borderBg,
              )}
            >
              {/* Emoji */}
              <span className="shrink-0 mt-0.5 text-lg leading-none select-none">
                {item.emoji}
              </span>

              {/* Body */}
              <div className="flex-1 min-w-0">
                <p className="text-casa-text leading-snug">{item.description}</p>
                {item.event_title && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[11px] text-casa-muted truncate">{item.event_title}</span>
                    {days && (
                      <span className={cn(
                        'text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0',
                        item.priority === 3
                          ? 'bg-red-100 text-red-700'
                          : item.priority === 2
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-blue-100 text-blue-700',
                      )}>
                        {days}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="shrink-0 flex items-center gap-1">
                <button
                  onClick={() => snooze(item.id)}
                  className="text-[11px] font-medium px-2 py-1 rounded-md text-casa-muted hover:text-casa-navy hover:bg-white/60 transition-colors"
                  title="Snooze until tomorrow morning"
                >
                  Snooze
                </button>
                <span className="text-casa-border text-xs">|</span>
                <button
                  onClick={() => dismiss(item.id)}
                  className="text-[11px] font-medium px-2 py-1 rounded-md text-casa-muted hover:text-red-600 hover:bg-white/60 transition-colors"
                  title="Permanently dismiss"
                >
                  Dismiss
                </button>
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
