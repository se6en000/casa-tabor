/**
 * PrepActionSection — right-panel collapsible "Prep & Action" section.
 * Shows upcoming prep tasks ordered by urgency with color-coded horizons.
 * Checkmark dismisses; snooze pushes to tomorrow morning.
 */
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ClipboardList, ChevronDown, Gift, Plane, Stethoscope, CreditCard, ShoppingBag, Moon } from 'lucide-react'
import { differenceInDays, parseISO } from 'date-fns'
import { cn } from '../../utils/cn'
import { usePrepItems, useDismissPrepItem, useSnoozePrepItem } from '../../hooks/usePrepItems'

function daysUntil(eventDate: string | null): number {
  if (!eventDate) return 99
  return differenceInDays(parseISO(eventDate), new Date())
}

const TYPE_ICON: Record<string, React.ElementType> = {
  gift:    Gift,
  travel:  Plane,
  medical: Stethoscope,
  payment: CreditCard,
}

function PrepTypeIcon({ type }: { type: string }) {
  const Icon = TYPE_ICON[type] ?? ShoppingBag
  return <Icon size={12} className="text-casa-gold shrink-0 mt-[1px]" strokeWidth={1.8} />
}

function urgencyConfig(days: number): {
  dot: string
  badge: string
  badgeText: string
  label: string
} {
  if (days <= 0) return { dot: 'bg-red-500', badge: 'bg-red-100 text-red-700', badgeText: 'Today', label: 'Today' }
  if (days === 1) return { dot: 'bg-red-500', badge: 'bg-red-100 text-red-700', badgeText: 'Tomorrow', label: 'Tomorrow' }
  if (days < 3)  return { dot: 'bg-red-400',  badge: 'bg-red-100 text-red-700',   badgeText: `In ${days}d`, label: `In ${days} days` }
  if (days < 7)  return { dot: 'bg-amber-400', badge: 'bg-amber-100 text-amber-700', badgeText: `In ${days}d`, label: `In ${days} days` }
  return           { dot: 'bg-green-400',  badge: 'bg-green-100 text-green-700',  badgeText: `In ${days}d`, label: `In ${days} days` }
}

export default function PrepActionSection() {
  const { data: items = [] } = usePrepItems()
  const dismiss = useDismissPrepItem()
  const snooze = useSnoozePrepItem()
  const [open, setOpen] = useState(true)
  const [checking, setChecking] = useState<string | null>(null)

  if (items.length === 0) return null

  async function handleCheck(id: string) {
    setChecking(id)
    await new Promise(r => setTimeout(r, 350)) // brief animation pause
    await dismiss(id)
    setChecking(null)
  }

  return (
    <div className="px-5 py-5 border-b border-casa-border">
      {/* Header */}
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-body font-medium text-casa-navy">
          <ClipboardList size={15} className="text-casa-gold" />
          Prep &amp; Action
          <span className="ml-1 text-[11px] font-bold bg-casa-gold/20 text-casa-gold px-1.5 py-0.5 rounded-full">
            {items.length}
          </span>
        </div>
        <ChevronDown
          size={13}
          className={cn('text-casa-muted transition-transform duration-200', open ? 'rotate-0' : '-rotate-90')}
        />
      </button>

      {/* Items */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-2">
              <AnimatePresence initial={false}>
                {items.map((item) => {
                  const days = daysUntil(item.event_date)
                  const urg = urgencyConfig(days)
                  const isDone = checking === item.id

                  return (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: isDone ? 0.4 : 1, y: 0 }}
                      exit={{ opacity: 0, height: 0, marginTop: 0, overflow: 'hidden' }}
                      transition={{ duration: 0.25 }}
                      className="flex items-start gap-2.5"
                    >
                      {/* Urgency dot + checkbox */}
                      <button
                        onClick={() => handleCheck(item.id)}
                        className="shrink-0 mt-0.5 flex flex-col items-center gap-1 group"
                        title="Mark done"
                      >
                        <div className={cn(
                          'w-4 h-4 rounded border-2 flex items-center justify-center transition-colors',
                          isDone
                            ? 'bg-green-500 border-green-500'
                            : 'border-casa-border group-hover:border-casa-gold bg-white',
                        )}>
                          {isDone && (
                            <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                              <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </div>
                        <div className={cn('w-1.5 h-1.5 rounded-full', urg.dot)} />
                      </button>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          'text-caption text-casa-text leading-snug',
                          isDone && 'line-through text-casa-muted',
                        )}>
                          <span className="mr-1 inline-flex"><PrepTypeIcon type={item.type} /></span>
                          {item.description}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {item.event_title && (
                            <span className="text-[10px] text-casa-muted truncate max-w-[120px]">
                              {item.event_title}
                            </span>
                          )}
                          <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0', urg.badge)}>
                            {urg.badgeText}
                          </span>
                        </div>
                      </div>

                      {/* Snooze */}
                      <button
                        onClick={() => snooze(item.id)}
                        className="shrink-0 text-casa-muted hover:text-casa-navy transition-colors mt-0.5 px-1"
                        title="Snooze until tomorrow"
                      >
                        <Moon size={11} strokeWidth={1.8} />
                      </button>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
