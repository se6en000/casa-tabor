/**
 * PrepActionSection — right-panel collapsible "Prep & Action" section.
 * Unified across sources (calendar AI + Gmail) with relevance feedback.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ClipboardList, ChevronDown, Moon, ThumbsDown, Mail, Bot, Check } from 'lucide-react'
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

interface PrepActionSectionProps {
  onSelectItem?: (item: PrepItem) => void
  seeAllHref?: string
}

export default function PrepActionSection({ onSelectItem, seeAllHref = '/actions' }: PrepActionSectionProps) {
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
      <div key={label} className="space-y-1">
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
              className={cn('py-2.5 border-b border-casa-divider last:border-0 group')}
            >
              <div className="flex items-start gap-2.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelectItem?.(item)
                  }}
                  className="flex-1 min-w-0 text-left"
                >
                  <div className="flex items-start gap-1.5">
                    <span className={cn('mt-1.5 h-2.5 w-2.5 rounded-full shrink-0', urg.dot)} />
                    <p
                      className={cn(
                        'text-body-sm leading-relaxed',
                        isDone && 'line-through text-casa-muted',
                      )}
                      style={{ fontFamily: "'DM Sans', system-ui, sans-serif", color: isDone ? undefined : 'var(--color-casa-text)' }}
                    >
                      {item.description}
                    </p>
                  </div>

                  <div className="mt-2 flex items-center gap-1.5 flex-wrap pl-4">
                    <span className={cn('inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border', src.tone)}>
                      <SourceIcon size={9} /> {src.label}
                    </span>
                    <span className={cn('text-[9px] font-bold leading-none px-1.5 py-0.5 rounded-full whitespace-nowrap shrink-0', urg.badge)}>
                      {urg.badgeText}
                    </span>
                  </div>
                </button>

                <div className="shrink-0 flex flex-col items-center gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleCheck(item.id)
                    }}
                    className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center border bg-white transition-colors',
                      isDone
                        ? 'border-green-500 text-green-600'
                        : 'border-casa-border text-casa-muted hover:text-casa-navy hover:bg-casa-bg',
                    )}
                    title="Mark done"
                  >
                    <Check size={15} strokeWidth={2.2} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      snooze(item.id)
                    }}
                    className="w-8 h-8 rounded-full flex items-center justify-center border border-casa-border bg-white text-casa-muted hover:text-casa-text hover:bg-casa-bg transition-colors"
                    title="Snooze until tomorrow"
                  >
                    <Moon size={15} strokeWidth={2.1} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDownvote(item.id)
                    }}
                    className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center border bg-white transition-colors',
                      isDownvoting
                        ? 'border-red-300 text-red-500'
                        : 'border-casa-border text-casa-muted hover:text-red-500 hover:bg-red-50',
                    )}
                    title="Not relevant — teach AI"
                  >
                    <ThumbsDown size={15} strokeWidth={2.1} />
                  </button>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="px-5 py-5 border-b border-casa-border">
      <div className="w-full flex items-center justify-between">
        <button
          onClick={() => setOpen(v => {
            const next = !v
            try {
              localStorage.setItem(PREP_SECTION_KEY, next ? '1' : '0')
            } catch {
              // ignore localStorage failures
            }
            return next
          })}
          className="flex-1 flex items-center gap-1.5 text-body font-semibold text-casa-text text-left"
        >
          <ClipboardList size={15} className="text-casa-gold" />
          Prep &amp; Action
          <span className="ml-1 text-caption font-bold bg-casa-gold/20 text-casa-gold px-1.5 py-0.5 rounded-full">
            {items.length}
          </span>
          <ChevronDown
            size={13}
            className={cn('ml-auto text-casa-muted transition-transform duration-200', open ? 'rotate-0' : '-rotate-90')}
          />
        </button>
        <Link to={seeAllHref} className="ml-2 text-caption text-casa-gold hover:brightness-110">
          See all <span aria-hidden>→</span>
        </Link>
      </div>

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
