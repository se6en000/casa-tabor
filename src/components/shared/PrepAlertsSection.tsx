import { motion, AnimatePresence } from 'framer-motion'
import { differenceInDays, parseISO } from 'date-fns'
import { usePrepItems, useDismissPrepItem, useSnoozePrepItem } from '../../hooks/usePrepItems'
import { useLiveClock } from '../../hooks/useLiveClock'
import { getPrepItemDisplayDescription } from '../../utils/reminderLateness'
import { cn } from '../../utils/cn'
import { Button } from '../ui'
import SnoozeMenu from './SnoozeMenu'
import { clusterPrepItems } from '../../utils/prepItemClusters'

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
  // Keeps a missed reminder's "(Nm/h/d late)" text live instead of frozen at
  // whatever it said when this section first mounted.
  const now = useLiveClock(60_000)

  const clusteredItems = clusterPrepItems(items ?? [])

  if (clusteredItems.length === 0) return null

  return (
    <div className={cn('space-y-2', className)}>
      <h3 className="text-caption font-semibold uppercase tracking-wide text-casa-muted px-1">
        📋 Prep Needed
      </h3>
      <AnimatePresence initial={false}>
        {clusteredItems.map((cluster) => {
          const item = cluster.item
          const days = daysLabel(item.event_date)
          const accent = item.priority === 3 ? 'border-l-casa-error' : item.priority === 2 ? 'border-l-casa-warning' : 'border-l-casa-info'
          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 4, height: 'auto' }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0, marginTop: 0, overflow: 'hidden' }}
              transition={{ duration: 0.2 }}
              className={cn(
                'flex items-start gap-3 px-4 py-3 rounded-card border border-l-4 text-body-sm shadow-card',
                'bg-casa-surface border-casa-border',
                accent,
              )}
            >
              {/* Emoji */}
              <span className="shrink-0 mt-0.5 font-display text-heading leading-none select-none">
                {item.emoji}
              </span>

              {/* Body */}
              <div className="flex-1 min-w-0">
                <p className="text-casa-text leading-snug">{getPrepItemDisplayDescription(item.description, item.source_type, item.event_date, now)}</p>
                {item.event_title && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-caption text-casa-muted truncate">{item.event_title}</span>
                    {days && (
                      <span className={cn(
                        'text-caption font-semibold px-1.5 py-0.5 rounded-full shrink-0',
                        item.priority === 3
                          ? 'bg-red-500 text-white'
                          : item.priority === 2
                          ? 'bg-amber-400 text-white'
                          : 'bg-blue-500 text-white',
                      )}>
                        {days}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="shrink-0 flex items-center gap-1">
                <SnoozeMenu
                  onSnooze={(duration) => Promise.all(cluster.itemIds.map((id) => snooze(id, duration, item.event_date)))}
                  eventDateIso={item.event_date}
                  triggerVariant="ghost"
                  triggerClassName="text-caption font-medium px-2 py-1 rounded-md text-casa-muted transition-colors hover:text-casa-text hover:bg-casa-bg"
                />
                <span className="text-casa-border text-caption">|</span>
                <Button variant="ghost"
                  onClick={() => Promise.all(cluster.itemIds.map((id) => dismiss(id)))}
                  className="text-caption font-medium px-2 py-1 rounded-md text-casa-muted transition-colors hover:text-red-500 hover:bg-casa-bg"
                  title="Permanently dismiss"
                >
                  Dismiss
                </Button>
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
