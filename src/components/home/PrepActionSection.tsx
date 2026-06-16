/**
 * PrepActionSection — right-panel collapsible "Prep & Action" section.
 * Unified across sources (calendar AI + Gmail) with relevance feedback.
 */
import { useMemo, useState, type ElementType } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ClipboardList, ChevronDown, Gift, Plane, Stethoscope, CreditCard, ShoppingBag, Moon, ThumbsDown, Mail, Bot } from 'lucide-react'
import { differenceInDays, parseISO } from 'date-fns'
import { cn } from '../../utils/cn'
import { usePrepItems, useDismissPrepItem, useSnoozePrepItem, useDownvotePrepItem } from '../../hooks/usePrepItems'
import type { PrepItem } from '../../types'

const PREP_SECTION_KEY = 'casa-home-prep-section-open-v1'

function loadOpenState() {
  try {
    const raw = localStorage.getItem(PREP_SECTION_KEY)
    if (raw == null) return true
    return raw === '1'
  } catch {
    return true
  }
}

function daysUntil(eventDate: string | null): number {
  if (!eventDate) return 99
  return differenceInDays(parseISO(eventDate), new Date())
}

const TYPE_ICON: Record<string, ElementType> = {
  gift: Gift,
  travel: Plane,
  medical: Stethoscope,
  payment: CreditCard,
  delivery: ShoppingBag,
  return: ShoppingBag,
}

function PrepTypeIcon({ type }: { type: string }) {
  const Icon = TYPE_ICON[type] ?? ShoppingBag
  return <Icon size={12} className="text-casa-gold shrink-0 mt-[1px]" strokeWidth={1.8} />
}

function sourceBadge(item: PrepItem) {
  const source = item.source_type ?? 'calendar_ai'
  if (source === 'gmail') return { label: 'Email', icon: Mail, tone: 'text-purple-700 bg-purple-50 border-purple-200' }
  if (source === 'calendar_ai') return { label: 'Calendar', icon: Bot, tone: 'text-sky-700 bg-sky-50 border-sky-200' }
  return { label: 'System', icon: ClipboardList, tone: 'text-casa-muted bg-casa-bg border-casa-border' }
}

function urgencyConfig(days: number): {
  dot: string
  badge: string
  badgeText: string
  bucket: 'today' | 'soon' | 'later'
} {
  if (days <= 1) return { dot: 'bg-red-500', badge: 'bg-red-500 text-white', badgeText: days <= 0 ? 'Today' : 'Tomorrow', bucket: 'today' }
  if (days <= 4) return { dot: 'bg-amber-400', badge: 'bg-amber-400 text-white', badgeText: `In ${days}d`, bucket: 'soon' }
  return { dot: 'bg-green-400', badge: 'bg-green-400 text-white', badgeText: `In ${days}d`, bucket: 'later' }
}

function groupItems(items: PrepItem[]) {
  const grouped: Record<'today' | 'soon' | 'later', PrepItem[]> = { today: [], soon: [], later: [] }
  for (const item of items) {
    const days = daysUntil(item.event_date)
    grouped[urgencyConfig(days).bucket].push(item)
  }
  return grouped
}

export default function PrepActionSection() {
  const { data: items = [] } = usePrepItems()
  const dismiss = useDismissPrepItem()
  const snooze = useSnoozePrepItem()
  const downvote = useDownvotePrepItem()
  const [open, setOpen] = useState(loadOpenState)
  const [checking, setChecking] = useState<string | null>(null)
  const [downvoting, setDownvoting] = useState<string | null>(null)

  const grouped = useMemo(() => groupItems(items), [items])

  if (items.length === 0) return null

  async function handleCheck(id: string) {
    setChecking(id)
    await new Promise(r => setTimeout(r, 250))
    await dismiss(id)
    setChecking(null)
  }

  async function handleDownvote(id: string) {
    setDownvoting(id)
    await downvote(id)
    setDownvoting(null)
  }

  const renderGroup = (label: string, groupItems: PrepItem[]) => {
    if (groupItems.length === 0) return null

    return (
      <div key={label} className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-casa-muted px-0.5">{label}</p>
        {groupItems.map((item) => {
          const days = daysUntil(item.event_date)
          const urg = urgencyConfig(days)
          const src = sourceBadge(item)
          const isDone = checking === item.id
          const isDownvoting = downvoting === item.id
          const SourceIcon = src.icon

          return (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: isDone || isDownvoting ? 0.45 : 1, y: 0 }}
              exit={{ opacity: 0, height: 0, marginTop: 0, overflow: 'hidden' }}
              transition={{ duration: 0.25 }}
              className="flex items-start gap-2.5"
            >
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

              <div className="flex-1 min-w-0">
                <p
                  className={cn(isDone && 'line-through text-casa-muted')}
                  style={{ fontSize: '0.8125rem', lineHeight: '1.5', fontFamily: "'DM Sans', system-ui, sans-serif", color: isDone ? undefined : 'var(--color-casa-text)' }}
                >
                  <span className="mr-1 inline-flex"><PrepTypeIcon type={item.type} /></span>
                  {item.description}
                </p>

                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <span className={cn('inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border', src.tone)}>
                    <SourceIcon size={9} /> {src.label}
                  </span>
                  {item.event_title && (
                    <span className="text-caption text-casa-muted truncate max-w-[120px]">
                      {item.event_title}
                    </span>
                  )}
                  <span className={cn('text-[9px] font-bold leading-none px-1.5 py-0.5 rounded-full whitespace-nowrap shrink-0', urg.badge)}>
                    {urg.badgeText}
                  </span>
                </div>
              </div>

              <div className="shrink-0 flex items-center gap-0.5 mt-0.5">
                <button
                  onClick={() => snooze(item.id)}
                  className="text-casa-muted hover:text-casa-text transition-colors px-1"
                  title="Snooze until tomorrow"
                >
                  <Moon size={11} strokeWidth={1.8} />
                </button>
                <button
                  onClick={() => handleDownvote(item.id)}
                  className={cn(
                    'transition-colors px-1',
                    isDownvoting ? 'text-red-500' : 'text-casa-muted hover:text-red-500',
                  )}
                  title="Not relevant — teach AI"
                >
                  <ThumbsDown size={11} strokeWidth={1.8} />
                </button>
              </div>
            </motion.div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="px-5 py-5 border-b border-casa-border">
      <button
        onClick={() => setOpen(v => {
          const next = !v
          try { localStorage.setItem(PREP_SECTION_KEY, next ? '1' : '0') } catch {}
          return next
        })}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-1.5 text-body font-semibold text-casa-text">
          <ClipboardList size={15} className="text-casa-gold" />
          Prep &amp; Action
          <span className="ml-1 text-caption font-bold bg-casa-gold/20 text-casa-gold px-1.5 py-0.5 rounded-full">
            {items.length}
          </span>
        </div>
        <ChevronDown
          size={13}
          className={cn('text-casa-muted transition-transform duration-200', open ? 'rotate-0' : '-rotate-90')}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-3">
              <AnimatePresence initial={false}>
                {renderGroup('Today / Tomorrow', grouped.today)}
                {renderGroup('Soon', grouped.soon)}
                {renderGroup('Later', grouped.later)}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
