/**
 * PrepActionSection — right-panel collapsible "Prep & Action" section.
 * Unified across sources (calendar AI + Gmail) with relevance feedback.
 */
import { useMemo, useState, type ElementType } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ClipboardList, ChevronDown, Gift, Plane, Stethoscope, CreditCard, ShoppingBag, Ban, Moon, ThumbsDown, Mail, Bot, Check, Bell } from 'lucide-react'
import { differenceInDays, parseISO } from 'date-fns'
import { cn } from '../../utils/cn'
import { usePrepItems, useCompletePrepItem, useSnoozePrepItem, useDownvotePrepItem } from '../../hooks/usePrepItems'
import type { PrepItem } from '../../types'
import { Button, CalendarPill, IconButton, Text } from '../ui'

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
  billing: CreditCard,
  cancellation: Ban,
  delivery: ShoppingBag,
  return: ShoppingBag,
}

function PrepTypeIcon({ type }: { type: string }) {
  const Icon = TYPE_ICON[type] ?? ShoppingBag
  return <Icon size={12} className="text-casa-gold shrink-0 mt-[1px]" strokeWidth={1.8} />
}

function sourceBadge(item: PrepItem) {
  const source = item.source_type ?? 'calendar_ai'
  if (source === 'reminder_manual') return { label: 'Reminder', icon: Bell, tone: 'text-amber-700 bg-amber-50 border-amber-200' }
  if (source === 'reminder_missed') return { label: 'Missed', icon: Bell, tone: 'text-orange-700 bg-orange-50 border-orange-200' }
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
  const complete = useCompletePrepItem()
  const snooze = useSnoozePrepItem()
  const downvote = useDownvotePrepItem()
  const [open, setOpen] = useState(loadOpenState)
  const [checking, setChecking] = useState<string | null>(null)
  const [snoozingId, setSnoozingId] = useState<string | null>(null)
  const [downvoting, setDownvoting] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const grouped = useMemo(() => groupItems(items), [items])

  if (items.length === 0) return null

  async function handleCheck(id: string) {
    setChecking(id)
    setActionError(null)
    try {
      await complete(id)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Casa could not complete this action.')
    } finally {
      setChecking(null)
    }
  }

  async function handleSnooze(id: string) {
    setSnoozingId(id)
    await new Promise(r => setTimeout(r, 300))
    await snooze(id)
    await new Promise(r => setTimeout(r, 180))
    setSnoozingId(null)
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
        <Text role="caption" muted className="px-0.5 font-bold uppercase tracking-wide">{label}</Text>
        {groupItems.map((item) => {
          const days = daysUntil(item.event_date)
          const urg = urgencyConfig(days)
          const src = sourceBadge(item)
          const isDone = checking === item.id
          const isSnoozed = snoozingId === item.id
          const isDownvoting = downvoting === item.id
          const isDismissing = isDone || isSnoozed
          const SourceIcon = src.icon

          return (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 4 }}
             animate={isDismissing ? { opacity: 0, scale: 0.95, x: -8 } : (isDownvoting ? { opacity: 0.45 } : { opacity: 1, y: 0 })}
              exit={{ opacity: 0, height: 0, marginTop: 0, overflow: 'hidden' }}
             transition={{ duration: isDismissing ? 0.3 : 0.25 }}
             className={cn('py-2.5 border-b border-casa-divider last:border-0 group')}
            >
              <div className="flex items-start gap-2.5">
                <Button
                  type="button"
                  variant="ghost"
                  fullWidth
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelectItem?.(item)
                  }}
                  className="flex-1 min-w-0 p-0 text-left hover:bg-transparent"
                  contentClassName="w-full flex-col items-stretch gap-0"
                >
                  <div className="flex items-start gap-1.5">
                    <span className={cn('mt-1.5 h-2.5 w-2.5 rounded-full shrink-0', urg.dot)} />
                    <Text
                      role="body-sm"
                      className={cn(
                        'leading-relaxed text-casa-text',
                        isDone && 'line-through text-casa-muted',
                      )}
                    >
                      <span className="mr-1 inline-flex align-top"><PrepTypeIcon type={item.type} /></span>
                      {item.description}
                    </Text>
                  </div>

                  <div className="mt-2 flex items-center gap-1.5 flex-wrap pl-4">
                    <CalendarPill className={cn('gap-1', src.tone)}>
                      <SourceIcon size={9} /> {src.label}
                    </CalendarPill>
                    {item.event_title && (
                      <span className="text-caption text-casa-muted truncate max-w-[150px]">
                        {item.event_title}
                      </span>
                    )}
                    <CalendarPill className={urg.badge}>
                      {urg.badgeText}
                    </CalendarPill>
                  </div>
                </Button>

                <div className="shrink-0 flex flex-col items-center gap-1">
                  <IconButton
                    onClick={(e) => {
                      e.stopPropagation()
                      handleCheck(item.id)
                    }}
                    variant="secondary"
                    className={isDone ? 'border-casa-success text-casa-success' : undefined}
                    title="Mark done"
                    aria-label="Mark done"
                    icon={<Check size={15} strokeWidth={2.2} />}
                  />
                  <IconButton
                    onClick={(e) => {
                      e.stopPropagation()
                      handleSnooze(item.id)
                    }}
                    variant="secondary"
                    title="Snooze until tomorrow"
                    aria-label="Snooze until tomorrow"
                    icon={<Moon size={15} strokeWidth={2.1} />}
                  />
                  <IconButton
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDownvote(item.id)
                    }}
                    variant="danger"
                    className={isDownvoting ? 'border border-casa-error/40' : undefined}
                    title="Not relevant — teach AI"
                    aria-label="Not relevant — teach AI"
                    icon={<ThumbsDown size={15} strokeWidth={2.1} />}
                  />
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
        <Button
          variant="ghost"
          fullWidth
          onClick={() => setOpen(v => {
            const next = !v
            try {
              localStorage.setItem(PREP_SECTION_KEY, next ? '1' : '0')
            } catch {
              // ignore localStorage failures
            }
            return next
          })}
          className="flex-1 justify-start p-0 text-body font-semibold text-casa-text hover:bg-transparent"
          contentClassName="w-full gap-1.5"
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
        </Button>
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
              {actionError && (
                <p role="alert" className="text-caption text-casa-error">
                  {actionError} The action is still active.
                </p>
              )}
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
