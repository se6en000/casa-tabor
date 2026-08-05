/**
 * HomeRightPanel — redesigned desktop rail with week-jump, needs-you cards,
 * and inbox intelligence while reusing existing data/actions.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { addDays, differenceInDays, format, parseISO, startOfWeek } from 'date-fns'
import { Link, useNavigate } from 'react-router-dom'
import { Check, ChevronRight, MoreHorizontal, Sparkles, ThumbsDown, UserPlus } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '../../utils/cn'
import { useWeekEventIndex } from '../../hooks/useCalendarEvents'
import { useCompletePrepItem, useDownvotePrepItem, usePrepItems, useSnoozePrepItem } from '../../hooks/usePrepItems'
import { useFamilyMembers } from '../../hooks/useFamilyMembers'
import { supabase } from '../../lib/supabase'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import { useCalendarStore } from '../../stores/calendarStore'
import BounceScroll from '../shared/BounceScroll'
import type { PrepItem } from '../../types'
import { eventOverlapsDay } from '../../utils/eventTime'
import { summarizeGmailHealth, type GmailHealthSummary } from '../../utils/gmailHealth'
import { priorityVisual } from '../../utils/prepPriority'
import { Button, Chip, EmptyState, Heading, IconButton, PersonAvatarStack, SecondaryRail, Toast } from '../ui'

/** Undo window (ms) between tapping the check and the completion actually being committed. */
const MARK_DONE_UNDO_MS = 4000

interface Props {
  now: Date
  allTodayEvents: EventWithDetails[]
  onSelectPrepItem?: (item: PrepItem) => void
}

interface GmailConnectionStatus {
  family_member_id: string
  gmail_scan_enabled: boolean
  last_sync_at: string | null
  last_sync_error: string | null
  health_status: 'connected' | 'healthy' | 'degraded' | 'reauthorization_required' | 'disabled' | null
  reauthorization_required: boolean | null
}

interface GmailProcessedMessage {
  id: string
  family_member_id: string
  subject: string | null
  from_email: string | null
  intent: string | null
  created_event_id: string | null
  updated_event_id: string | null
  skipped_reason: string | null
  processed_at: string
}

interface ActivityHealth {
  scanned: number
  skipped: number
  gmailHealth: GmailHealthSummary
}

function daysUntil(eventDate: string | null): number {
  if (!eventDate) return 99
  return differenceInDays(parseISO(eventDate), new Date())
}

function urgencyLabel(days: number) {
  if (days <= 0) return { section: 'TODAY', badge: 'today', tone: 'danger' as const }
  if (days === 1) return { section: 'SOON', badge: 'tomorrow', tone: 'warning' as const }
  if (days <= 4) return { section: 'SOON', badge: `in ${days}d`, tone: 'warning' as const }
  return { section: 'LATER', badge: `in ${days}d`, tone: 'success' as const }
}

/** Maps an urgency tone to its background-color utility class for the avatar corner badge / plain leading dot. */
function urgencyDotClass(tone: 'danger' | 'warning' | 'success'): string {
  if (tone === 'danger') return 'bg-casa-error'
  if (tone === 'warning') return 'bg-casa-warning'
  return 'bg-casa-success'
}

function urgencyRank(days: number): number {
  if (days <= 0) return 0
  if (days <= 1) return 1
  if (days <= 4) return 2
  return 3
}

function sourceBadge(item: PrepItem) {
  if (item.source_type === 'reminder_manual') return { label: 'Reminder', tone: 'warning' as const }
  if (item.source_type === 'reminder_missed') return { label: 'Missed reminder', tone: 'danger' as const }
  if (item.source_type === 'gmail') return { label: 'Email', tone: 'info' as const }
  if (item.source_type === 'calendar_ai') return { label: 'Calendar', tone: 'accent' as const }
  return { label: 'System', tone: 'neutral' as const }
}

export default function HomeRightPanel({ now, allTodayEvents, onSelectPrepItem }: Props) {
  const navigate = useNavigate()
  const { data: prepItems = [] } = usePrepItems()
  const { data: familyMembers = [] } = useFamilyMembers()
  const completePrepItem = useCompletePrepItem()
  const snoozePrepItem = useSnoozePrepItem()
  const downvotePrepItem = useDownvotePrepItem()
  const { data: weekEventIndex = [] } = useWeekEventIndex(now)
  const setSelectedDate = useCalendarStore(s => s.setSelectedDate)
  const setActiveView = useCalendarStore(s => s.setActiveView)
  const [downvotingItemId, setDownvotingItemId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  // Optimistic "mark done": the row disappears immediately and an Undo toast appears;
  // the actual completion only commits to the server after the undo window elapses.
  const [pendingDoneIds, setPendingDoneIds] = useState<Set<string>>(new Set())
  const [doneToast, setDoneToast] = useState<{ id: string; description: string } | null>(null)
  const [revealedItemId, setRevealedItemId] = useState<string | null>(null)
  const pendingDoneTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    const timers = pendingDoneTimers.current
    return () => {
      // Unmounting mid-undo-window shouldn't silently drop the action -- commit immediately.
      timers.forEach((timer, id) => {
        clearTimeout(timer)
        completePrepItem(id).catch(() => {})
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const prioritizedPrepItems = useMemo(() => {
    return [...prepItems].sort((a, b) => {
      const aDays = daysUntil(a.event_date)
      const bDays = daysUntil(b.event_date)
      const aUrgency = urgencyRank(aDays)
      const bUrgency = urgencyRank(bDays)
      if (aUrgency !== bUrgency) return aUrgency - bUrgency

      if (a.priority !== b.priority) return b.priority - a.priority

      if (aDays !== bDays) return aDays - bDays

      const aDate = a.event_date ? parseISO(a.event_date).getTime() : Number.POSITIVE_INFINITY
      const bDate = b.event_date ? parseISO(b.event_date).getTime() : Number.POSITIVE_INFINITY
      if (aDate !== bDate) return aDate - bDate

      const aCreatedAt = a.created_at ? parseISO(a.created_at).getTime() : Number.POSITIVE_INFINITY
      const bCreatedAt = b.created_at ? parseISO(b.created_at).getTime() : Number.POSITIVE_INFINITY
      return aCreatedAt - bCreatedAt
    })
  }, [prepItems])

  // Hides items whose "mark done" undo window is still counting down.
  const visiblePrepItems = useMemo(
    () => prioritizedPrepItems.filter(item => !pendingDoneIds.has(item.id)),
    [prioritizedPrepItems, pendingDoneIds],
  )

  const weekStart = startOfWeek(now, { weekStartsOn: 0 })
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const { data: gmailActivity } = useQuery<ActivityHealth>({
    queryKey: ['recent-activity-health'],
    queryFn: async () => {
      const [
        { data: statuses, error: statusesError },
        { data: messages, error: messagesError },
      ] = await Promise.all([
        supabase.from('google_connection_status').select('family_member_id, gmail_scan_enabled, last_sync_at, last_sync_error, health_status, reauthorization_required'),
        supabase
          .from('gmail_processed_messages')
          .select('id, family_member_id, subject, from_email, intent, created_event_id, updated_event_id, skipped_reason, processed_at')
          .order('processed_at', { ascending: false })
          .limit(40),
      ])
      if (statusesError) throw statusesError
      if (messagesError) throw messagesError

      const statusRows = (statuses ?? []) as GmailConnectionStatus[]
      const messageRows = (messages ?? []) as GmailProcessedMessage[]
      const enabledMemberIds = new Set(statusRows.filter(s => s.gmail_scan_enabled).map(s => s.family_member_id))

      const activityWindowMs = 6 * 60 * 60 * 1000
      const recentMessages = messageRows.filter(m => (
        enabledMemberIds.has(m.family_member_id) &&
        (Date.now() - +new Date(m.processed_at)) <= activityWindowMs
      ))
      const skipped = recentMessages.filter(m => m.intent === 'skip' || !!m.skipped_reason).length

      return {
        scanned: recentMessages.length,
        skipped,
        gmailHealth: summarizeGmailHealth(statusRows),
      }
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

  const nextEvent = allTodayEvents.find(event => new Date(event.end_time) >= now) ?? null

  function commitDone(id: string) {
    pendingDoneTimers.current.delete(id)
    setPendingDoneIds(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    setActionError(null)
    completePrepItem(id).catch(error => {
      setActionError(error instanceof Error ? error.message : 'Casa could not complete this action.')
    })
  }

  function handleDone(item: PrepItem) {
    // Clear any prior pending-done timer for this id (defensive; shouldn't normally recur).
    const existing = pendingDoneTimers.current.get(item.id)
    if (existing) clearTimeout(existing)
    setPendingDoneIds(prev => new Set(prev).add(item.id))
    setDoneToast({ id: item.id, description: item.description })
    setRevealedItemId(current => (current === item.id ? null : current))
    const timer = setTimeout(() => commitDone(item.id), MARK_DONE_UNDO_MS)
    pendingDoneTimers.current.set(item.id, timer)
  }

  function undoDone(id: string) {
    const timer = pendingDoneTimers.current.get(id)
    if (timer) clearTimeout(timer)
    pendingDoneTimers.current.delete(id)
    setPendingDoneIds(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    setDoneToast(null)
  }

  async function handleDownvote(item: PrepItem) {
    setDownvotingItemId(item.id)
    await downvotePrepItem(item.id)
    setDownvotingItemId(null)
  }

  function handleWeekDayClick(day: Date) {
    setSelectedDate(day)
    setActiveView('stacked')
    navigate('/calendar')
  }

  return (
    <SecondaryRail className="flex-col border-l border-casa-border bg-surface-subtle self-stretch overflow-hidden">
      <BounceScroll className="flex-1 min-h-0">
        <section className="px-4 py-4">
          <div className="flex items-center justify-between">
            <Heading role="heading">This week</Heading>
            <Link to="/calendar" className="text-caption font-semibold text-casa-gold inline-flex items-center gap-1">
              See all <ChevronRight size={11} />
            </Link>
          </div>
          <div className="mt-3 grid grid-cols-7 gap-1.5">
            {days.map(day => {
              const isToday = day.toDateString() === now.toDateString()
              const eventCount = weekEventIndex.filter(event => (
                eventOverlapsDay(event, day)
              )).length

              return (
                <Button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => handleWeekDayClick(day)}
                  variant={isToday ? 'strong' : 'secondary'}
                  size="sm"
                  contentClassName="flex-col gap-0"
                  className={cn(
                    'min-w-0 px-1 py-2 text-center',
                    !isToday && 'bg-casa-bg',
                  )}
                >
                  <p className={cn('text-caption font-semibold uppercase', isToday ? 'text-white/70' : 'text-casa-muted')}>
                    {format(day, 'EEE')[0]}
                  </p>
                  <p className="text-body-sm font-semibold leading-tight mt-0.5">{format(day, 'd')}</p>
                  <p className={cn('text-caption mt-0.5 min-h-3', isToday ? 'text-casa-gold' : 'text-casa-muted')}>
                    {eventCount > 0 ? eventCount : ''}
                  </p>
                </Button>
              )
            })}
          </div>
        </section>

        <section className="px-4 py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <Heading role="heading">Needs you</Heading>
              <p className="text-caption text-casa-muted mt-0.5 truncate">
                {nextEvent ? `Up next: ${nextEvent.title}` : 'Nothing left today'}
              </p>
            </div>
            <Link to="/actions" className="text-caption font-semibold text-casa-gold whitespace-nowrap">
              See all
            </Link>
          </div>
          {prepItems.some(item => item.priority >= 2) && (
            <p className="text-caption text-casa-muted mt-2">
              <span className="inline-block w-2 h-2 rounded-full bg-casa-error align-middle mr-1" />Critical ·{' '}
              <span className="inline-block w-2 h-2 rounded-full bg-casa-warning align-middle mr-1 ml-1" />Important
            </p>
          )}

          {gmailActivity?.gmailHealth && gmailActivity.gmailHealth.status !== 'healthy' && gmailActivity.gmailHealth.status !== 'off' && (
            <Link
              to="/settings/google"
              className={cn(
                'mt-3 flex items-center justify-between gap-2 rounded-modal border px-3.5 py-3 transition',
                gmailActivity.gmailHealth.status === 'error'
                  ? 'border-casa-error/45 bg-casa-error/5 hover:bg-casa-error/10'
                  : 'border-casa-warning/45 bg-casa-warning/5 hover:bg-casa-warning/10',
              )}
            >
              <span className="text-body-sm font-semibold text-casa-text">{gmailActivity.gmailHealth.label}</span>
              <Chip size="sm" tone={gmailActivity.gmailHealth.tone}>Fix in Settings</Chip>
            </Link>
          )}

          {prepItems.length === 0 ? (
            <EmptyState className="mt-3" title="All clear" description="No urgent prep actions right now." />
          ) : (
            <div className="mt-3">
              {actionError && (
                <p role="alert" className="text-caption text-casa-error mb-2">
                  {actionError} The action is still active.
                </p>
              )}
              <div className="divide-y divide-casa-border/70">
                {visiblePrepItems.slice(0, 4).map(item => {
                  const urgency = urgencyLabel(daysUntil(item.event_date))
                  const source = sourceBadge(item)
                  const isDownvoting = downvotingItemId === item.id
                  const priority = priorityVisual(item.priority)
                  const isRevealed = revealedItemId === item.id
                  const assignee = item.assigned_to ? familyMembers.find(m => m.id === item.assigned_to) ?? null : null
                  const urgencyDot = urgencyDotClass(urgency.tone)

                  return (
                    <div key={item.id} className={priority.borderClass ? cn('pl-1.5 -ml-1.5', priority.borderClass) : undefined}>
                      <div className="flex items-start gap-2.5 py-2.5">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => onSelectPrepItem?.(item)}
                          className="shrink-0 mt-0.5 h-auto min-h-0 rounded-full p-0 hover:bg-transparent"
                          aria-label={assignee ? `Open details, assigned to ${assignee.name}` : 'Open details, unassigned'}
                        >
                          {assignee ? (
                            <PersonAvatarStack
                              people={[{ id: assignee.id, name: assignee.name, color: assignee.color_hex }]}
                              size="sm"
                              max={1}
                              badgeClassName={urgencyDot}
                            />
                          ) : (
                            <span className="flex size-7 items-center justify-center">
                              <span className={cn('size-2.5 rounded-full', urgencyDot)} />
                            </span>
                          )}
                        </Button>

                        <Button
                          type="button"
                          variant="ghost"
                          fullWidth
                          onClick={() => onSelectPrepItem?.(item)}
                          className="min-w-0 flex-1 h-auto min-h-0 p-0 text-left hover:bg-transparent"
                          contentClassName="w-full flex-col items-stretch gap-0"
                        >
                          <p className="!text-body-sm leading-snug text-casa-text line-clamp-3">
                            {item.description}
                          </p>
                          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                            <Chip size="sm" tone={source.tone}>{source.label}</Chip>
                            {priority.chip && (
                              <Chip size="sm" tone={priority.chip.tone}>{priority.chip.label}</Chip>
                            )}
                            {assignee ? (
                              <span className="text-caption text-casa-muted truncate">{assignee.name}</span>
                            ) : (
                              <Chip size="sm" tone="neutral" icon={<UserPlus size={11} />}>Assign</Chip>
                            )}
                          </div>
                        </Button>

                        <div className="flex shrink-0 items-center gap-1.5">
                          <IconButton
                            onClick={() => handleDone(item)}
                            variant="strong"
                            size="sm"
                            icon={<Check size={16} strokeWidth={2.5} />}
                            aria-label="Mark done"
                            title="Mark done"
                          />
                          <IconButton
                            onClick={() => setRevealedItemId(isRevealed ? null : item.id)}
                            variant="secondary"
                            size="sm"
                            icon={<MoreHorizontal size={16} />}
                            aria-label={isRevealed ? 'Hide more actions' : 'More actions'}
                            title="More actions"
                          />
                        </div>
                      </div>

                      {isRevealed && (
                        <div className="flex items-center gap-2 pb-2.5 pl-[2.375rem]">
                          <Button
                            onClick={() => { snoozePrepItem(item.id); setRevealedItemId(null) }}
                            variant="secondary"
                            size="sm"
                            title="Snooze until tomorrow"
                          >
                            Snooze
                          </Button>
                          <IconButton
                            onClick={() => handleDownvote(item)}
                            variant="danger"
                            size="sm"
                            disabled={isDownvoting}
                            icon={<ThumbsDown size={15} strokeWidth={2.1} />}
                            aria-label="Mark suggestion not relevant"
                            title="Not relevant"
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="mt-4 pt-4 border-t border-casa-border">
                <Link
                  to="/actions#recent-activity"
                  className="block rounded-modal bg-casa-navy px-3.5 pb-3.5 pt-4 text-white shadow-modal hover:brightness-105 transition"
                >
                  <div className="flex items-center gap-2.5">
                    <Sparkles size={15} className="text-white/90 shrink-0" />
                    <Heading role="heading" className="truncate !text-white">Casa sorted your inbox</Heading>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2.5">
                    <div className="rounded-3xl bg-white/10 px-3 py-4 text-center">
                      <p className="text-display-sm leading-none font-semibold">{gmailActivity?.scanned ?? 0}</p>
                      <p className="text-body-sm font-semibold text-white/70 mt-1">scanned</p>
                    </div>
                    <div className="rounded-3xl border border-casa-gold/65 bg-white/12 px-3 py-4 text-center">
                      <p className="text-display-sm leading-none font-semibold text-casa-gold">{prepItems.length}</p>
                      <p className="text-body-sm font-semibold text-white/80 mt-1">need you</p>
                    </div>
                    <div className="rounded-3xl bg-white/10 px-3 py-4 text-center">
                      <p className="text-display-sm leading-none font-semibold">{gmailActivity?.skipped ?? 0}</p>
                      <p className="text-body-sm font-semibold text-white/70 mt-1">filtered</p>
                    </div>
                  </div>
                  <div className="mt-3.5 min-h-control rounded-button border border-white/22 bg-white/9 text-white text-body-sm font-semibold inline-flex items-center justify-center w-full">
                    See what Casa filtered &rarr;
                  </div>
                </Link>
              </div>
            </div>
          )}
        </section>

      </BounceScroll>
      <Toast
        open={!!doneToast}
        message={doneToast ? `Marked "${doneToast.description}" done.` : ''}
        tone="success"
        onClose={() => setDoneToast(null)}
        actionLabel="Undo"
        onAction={() => { if (doneToast) undoDone(doneToast.id) }}
      />
    </SecondaryRail>
  )
}
