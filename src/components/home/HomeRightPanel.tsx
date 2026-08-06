/**
 * HomeRightPanel — redesigned desktop rail with week-jump, needs-you cards,
 * and inbox intelligence while reusing existing data/actions.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { addDays, differenceInDays, format, parseISO, startOfWeek } from 'date-fns'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, Check, ChevronDown, ChevronRight, ShieldCheck, Sparkles, ThumbsDown, UserPlus } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { needsYouAccent } from '../../utils/needsYouAccent'
import { conflictMetaLine, directorySuggestionMetaLine, prepMetaLine } from '../../utils/needsYouMeta'
import { isReadOnlyNeedsYouItem, mergeNeedsYouItems } from '../../utils/needsYouFeed'
import { shouldSuppressPriorityChipIcon } from '../../utils/conflictResolution'
import ConflictNeedsYouActions from '../shared/ConflictNeedsYouActions'
import DirectorySuggestionActions from '../shared/DirectorySuggestionActions'
import ExpandPanel from '../shared/ExpandPanel'
import { useQuery } from '@tanstack/react-query'
import { cn } from '../../utils/cn'
import { useWeekEventIndex } from '../../hooks/useCalendarEvents'
import { useCompletePrepItem, useDownvotePrepItem, usePrepItems, useSetPrepItemAssignee, useSnoozePrepItem } from '../../hooks/usePrepItems'
import { useFamilyMembers } from '../../hooks/useFamilyMembers'
import { useNotifications } from '../../hooks/useNotifications'
import { useResolveConflict, useWeekConflicts } from '../../hooks/useConflicts'
import { supabase } from '../../lib/supabase'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import { useCalendarStore } from '../../stores/calendarStore'
import BounceScroll from '../shared/BounceScroll'
import type { PrepItem } from '../../types'
import { eventOverlapsDay } from '../../utils/eventTime'
import { summarizeGmailHealth, type GmailHealthSummary } from '../../utils/gmailHealth'
import { priorityVisual } from '../../utils/prepPriority'
import { Button, Chip, EmptyState, Heading, IconButton, PersonAvatarStack, SecondaryRail, Toast } from '../ui'

/** Undo window (ms) between tapping an action (mark done / not relevant) and it
 * actually being committed to the server. */
const UNDO_WINDOW_MS = 4000

/** Home rail shows only the top-N Needs You cards (already sorted by urgency); the
 * rest are one tap away via the "More…" link so the rail stays glanceable and fits
 * the kiosk screen without scrolling. */
const NEEDS_YOU_HOME_RAIL_LIMIT = 5

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

function urgencyRank(days: number): number {
  if (days <= 0) return 0
  if (days <= 1) return 1
  if (days <= 4) return 2
  return 3
}

interface AssignPickerMember {
  id: string
  name: string
  color_hex: string
}

/**
 * Inline "Assign" control for a Needs You row: shows an Assign chip (unassigned) or the
 * assignee's name (assigned) as the trigger, and opens a small anchored popover listing every
 * family member so tapping one immediately assigns/reassigns the prep item — no full detail
 * sheet required.
 */
function PrepAssignPicker({
  assignee,
  familyMembers,
  onAssign,
}: {
  assignee: AssignPickerMember | null
  familyMembers: AssignPickerMember[]
  onAssign: (familyMemberId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (evt: MouseEvent | TouchEvent) => {
      if (!containerRef.current || containerRef.current.contains(evt.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
    }
  }, [open])

  return (
    <div className={cn('relative inline-flex', open && 'z-popover')} ref={containerRef}>
      {assignee ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={(evt) => { evt.stopPropagation(); setOpen((prev) => !prev) }}
          className="h-auto min-h-0 p-0 hover:bg-transparent"
          contentClassName="text-caption text-casa-muted truncate hover:text-casa-text hover:underline underline-offset-2"
        >
          {assignee.name}
        </Button>
      ) : (
        <Chip
          size="sm"
          tone="neutral"
          icon={<UserPlus size={11} />}
          onClick={(evt) => { evt.stopPropagation(); setOpen((prev) => !prev) }}
        >
          Assign
        </Chip>
      )}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            className="absolute left-0 top-[calc(100%+6px)] z-popover min-w-[170px] max-h-64 overflow-y-auto overscroll-contain rounded-card border border-casa-border bg-casa-surface p-1.5 shadow-modal"
          >
            {familyMembers.map((member) => {
              const selected = assignee?.id === member.id
              return (
                <Button
                  key={member.id}
                  type="button"
                  variant="ghost"
                  size="sm"
                  fullWidth
                  onClick={(evt) => { evt.stopPropagation(); onAssign(member.id); setOpen(false) }}
                  className={cn('rounded-lg px-2 py-1.5 text-left', selected && 'bg-casa-bg')}
                  contentClassName="w-full justify-start gap-2"
                  aria-pressed={selected}
                  title={selected ? `${member.name} (assigned — tap to unassign)` : member.name}
                >
                  <PersonAvatarStack people={[{ id: member.id, name: member.name, color: member.color_hex }]} size="sm" max={1} />
                  {member.name}
                </Button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function HomeRightPanel({ now, allTodayEvents, onSelectPrepItem }: Props) {
  const navigate = useNavigate()
  const { data: rawPrepItems = [] } = usePrepItems()
  const { data: familyMembers = [] } = useFamilyMembers()
  const { notifications, markRead } = useNotifications()
  const { data: conflicts = [] } = useWeekConflicts()
  const resolveConflict = useResolveConflict()
  const completePrepItem = useCompletePrepItem()
  const snoozePrepItem = useSnoozePrepItem()
  const downvotePrepItem = useDownvotePrepItem()
  const setPrepItemAssignee = useSetPrepItemAssignee()
  const { data: weekEventIndex = [] } = useWeekEventIndex(now)
  const setSelectedDate = useCalendarStore(s => s.setSelectedDate)
  const setActiveView = useCalendarStore(s => s.setActiveView)
  const [actionError, setActionError] = useState<string | null>(null)
  // Optimistic "mark done" / "not relevant": the row disappears immediately and an
  // Undo toast appears; the actual server action only commits after the undo window
  // elapses, so a mis-tap is fully recoverable.
  const [pendingRemovalIds, setPendingRemovalIds] = useState<Set<string>>(new Set())
  const [actionToast, setActionToast] = useState<{ id: string; description: string; kind: 'done' | 'downvote' } | null>(null)
  const [revealedItemId, setRevealedItemId] = useState<string | null>(null)
  const pendingRemovalTimers = useRef<Map<string, { timer: ReturnType<typeof setTimeout>; kind: 'done' | 'downvote' }>>(new Map())

  // Shared "needs you" card tap behavior: a collapsed card always expands first
  // (revealing conflict/prep/directory actions inline). Only once a prep/action
  // card is already expanded does tapping it open the full detail sheet — for
  // conflict/directory cards, tapping again while expanded does nothing extra
  // (they have no detail sheet; the chevron still collapses them).
  function handleNeedsYouCardClick(item: PrepItem) {
    if (revealedItemId !== item.id) {
      setRevealedItemId(item.id)
      return
    }
    if (!isReadOnlyNeedsYouItem(item)) {
      onSelectPrepItem?.(item)
    }
  }


  useEffect(() => {
    const timers = pendingRemovalTimers.current
    return () => {
      // Unmounting mid-undo-window shouldn't silently drop the action -- commit immediately.
      timers.forEach(({ timer, kind }, id) => {
        clearTimeout(timer)
        const commit = kind === 'done' ? completePrepItem : downvotePrepItem
        commit(id).catch(() => {})
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Merged Needs You feed: prep items plus unresolved conflicts and unseen directory
  // suggestions, normalized into the same PrepItem shape (Phase 1 of feed unification).
  // Conflicts/suggestions render read-only for now — see isReadOnlyNeedsYouItem.
  const directorySuggestionNotifications = useMemo(
    () => notifications.filter(n => n.type === 'directory_suggestions'),
    [notifications],
  )
  const prepItems = useMemo(
    () => mergeNeedsYouItems(rawPrepItems, conflicts, directorySuggestionNotifications),
    [rawPrepItems, conflicts, directorySuggestionNotifications],
  )

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

  // Hides items whose "mark done" / "not relevant" undo window is still counting down.
  const visiblePrepItems = useMemo(
    () => prioritizedPrepItems.filter(item => !pendingRemovalIds.has(item.id)),
    [prioritizedPrepItems, pendingRemovalIds],
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

  function commitRemoval(id: string, kind: 'done' | 'downvote') {
    pendingRemovalTimers.current.delete(id)
    setPendingRemovalIds(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    // Only clear the toast if it's still showing for this item -- avoids clobbering
    // a newer toast if the user acted on a second item before this timer fired.
    setActionToast(current => (current?.id === id ? null : current))
    setActionError(null)
    const commit = kind === 'done' ? completePrepItem : downvotePrepItem
    commit(id).catch(error => {
      setActionError(error instanceof Error ? error.message : 'Casa could not complete this action.')
    })
  }

  function scheduleRemoval(item: PrepItem, kind: 'done' | 'downvote') {
    // Clear any prior pending timer for this id (defensive; shouldn't normally recur).
    const existing = pendingRemovalTimers.current.get(item.id)
    if (existing) clearTimeout(existing.timer)
    setPendingRemovalIds(prev => new Set(prev).add(item.id))
    setActionToast({ id: item.id, description: item.description, kind })
    setRevealedItemId(current => (current === item.id ? null : current))
    const timer = setTimeout(() => commitRemoval(item.id, kind), UNDO_WINDOW_MS)
    pendingRemovalTimers.current.set(item.id, { timer, kind })
  }

  function handleDone(item: PrepItem) {
    scheduleRemoval(item, 'done')
  }

  function undoRemoval(id: string) {
    const existing = pendingRemovalTimers.current.get(id)
    if (existing) clearTimeout(existing.timer)
    pendingRemovalTimers.current.delete(id)
    setPendingRemovalIds(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    setActionToast(null)
  }

  function handleDownvote(item: PrepItem) {
    scheduleRemoval(item, 'downvote')
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
              <div className="space-y-2">
                {visiblePrepItems.slice(0, NEEDS_YOU_HOME_RAIL_LIMIT).map(item => {
                  const accent = needsYouAccent(item)
                  const priority = priorityVisual(item.priority)
                  const isRevealed = revealedItemId === item.id
                  const assignee = item.assigned_to ? familyMembers.find(m => m.id === item.assigned_to) ?? null : null
                  const readOnly = isReadOnlyNeedsYouItem(item)
                  const conflict = item.source_type === 'conflict' ? conflicts.find((c) => c.id === item.source_ref) : undefined
                  // Readable meta line (due date / "via {source}" / conflict time range /
                  // directory auto-detected copy) — matches the approved mockup, which
                  // shows text on every card instead of an icon-only source badge.
                  const meta =
                    item.source_type === 'conflict'
                      ? conflictMetaLine(conflict)
                      : item.source_type === 'directory_suggestion'
                        ? directorySuggestionMetaLine
                        : prepMetaLine(item, assignee?.name)

                  return (
                    <div key={item.id} className="rounded-card border border-casa-border bg-casa-bg px-3 py-2.5">
                      <div className="flex items-start gap-2.5">
                        {/* Left icon slot: coarse 3-icon accent (conflict / prep / directory)
                            instead of the assignee avatar — assignment is shown inline in the
                            meta row below via PrepAssignPicker, so this slot stays a stable,
                            glanceable category cue regardless of who's assigned. */}
                        {readOnly ? (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => handleNeedsYouCardClick(item)}
                            className="shrink-0 h-auto min-h-0 rounded-full p-0 hover:bg-transparent"
                            aria-label={isRevealed ? 'Hide more actions' : 'Show more actions'}
                          >
                            <span className={cn('flex size-8 items-center justify-center rounded-full', accent.bgClass, accent.textClass)}>
                              <accent.icon size={16} strokeWidth={2.2} aria-hidden="true" />
                            </span>
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => handleNeedsYouCardClick(item)}
                            className="shrink-0 h-auto min-h-0 rounded-full p-0 hover:bg-transparent"
                            aria-label={assignee ? `Open details, assigned to ${assignee.name}` : 'Open details, unassigned'}
                          >
                            <span className={cn('flex size-8 items-center justify-center rounded-full', accent.bgClass, accent.textClass)}>
                              <accent.icon size={16} strokeWidth={2.2} aria-hidden="true" />
                            </span>
                          </Button>
                        )}

                        <div className="min-w-0 flex-1">
                          {readOnly ? (
                            <Button
                              type="button"
                              variant="ghost"
                              fullWidth
                              onClick={() => handleNeedsYouCardClick(item)}
                              className="h-auto min-h-0 p-0 text-left hover:bg-transparent"
                              contentClassName="w-full justify-start"
                            >
                              <p className={cn('!text-body-sm leading-snug text-casa-text', !isRevealed && 'line-clamp-2')}>
                                {item.description}
                              </p>
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              fullWidth
                              onClick={() => handleNeedsYouCardClick(item)}
                              className="h-auto min-h-0 p-0 text-left hover:bg-transparent"
                              contentClassName="w-full justify-start"
                            >
                              <p className={cn('!text-body-sm leading-snug text-casa-text', !isRevealed && 'line-clamp-2')}>
                                {item.description}
                              </p>
                            </Button>
                          )}
                          <div className="mt-1.5 flex items-center gap-1.5">
                            <span
                              role="img"
                              aria-label={meta.label}
                              title={meta.label}
                              className="inline-flex shrink-0 text-casa-muted"
                            >
                              <meta.icon size={13} strokeWidth={2.2} />
                            </span>
                            {/* Truncates instead of wrapping so the assignee control at the
                                end of the row never gets pushed onto its own line. */}
                            <span className="min-w-0 flex-1 truncate text-caption text-casa-muted">{meta.text}</span>
                            {priority.chip && !shouldSuppressPriorityChipIcon(item) && (
                              <span
                                role="img"
                                aria-label={priority.chip.label}
                                title={priority.chip.label}
                                className={cn(
                                  'inline-flex shrink-0',
                                  priority.chip.tone === 'danger' ? 'text-casa-error' : 'text-casa-warning',
                                )}
                              >
                                <AlertTriangle size={14} strokeWidth={2.2} />
                              </span>
                            )}
                            {!readOnly && (
                              <div className="shrink-0">
                                <PrepAssignPicker
                                  assignee={assignee}
                                  familyMembers={familyMembers}
                                  onAssign={(familyMemberId) => {
                                    void setPrepItemAssignee(item.id, assignee?.id === familyMemberId ? null : familyMemberId)
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Unified header icon cluster: a primary "resolve" icon (when this
                            item has one) plus a single expand/collapse toggle shared by every
                            card type. ShieldCheck (conflict) is deliberately distinct from the
                            solid navy Check (prep "mark done") so it never reads as "fixed" —
                            the conflicting events are still both on the calendar. Directory
                            suggestions get no primary icon at all: there's no single
                            meaningful "confirm all" action. */}
                        <div className="flex shrink-0 items-center gap-1.5">
                          {item.source_type === 'conflict' && item.source_ref && (
                            <IconButton
                              onClick={() => resolveConflict(item.source_ref!, 'acknowledged_no_change')}
                              variant="secondary"
                              size="sm"
                              icon={<ShieldCheck size={16} strokeWidth={2.3} />}
                              aria-label="Resolved, no schedule change"
                              title="Resolved, no schedule change"
                              className="border-casa-warning/45 text-casa-warning hover:bg-casa-warning/10"
                            />
                          )}
                          {!readOnly && (
                            <IconButton
                              onClick={() => handleDone(item)}
                              variant="strong"
                              size="sm"
                              icon={<Check size={16} strokeWidth={2.5} />}
                              aria-label="Mark done"
                              title="Mark done"
                            />
                          )}
                          <IconButton
                            onClick={() => setRevealedItemId(isRevealed ? null : item.id)}
                            variant="secondary"
                            size="sm"
                            icon={
                              <ChevronDown
                                size={16}
                                className={cn('transition-transform duration-200 ease-out', isRevealed && 'rotate-180')}
                              />
                            }
                            aria-label={
                              isRevealed
                                ? 'Hide more actions'
                                : item.source_type === 'conflict'
                                  ? 'View both events'
                                  : item.source_type === 'directory_suggestion'
                                    ? 'Review suggestions'
                                    : 'More actions'
                            }
                            title={isRevealed ? 'Hide more actions' : 'More actions'}
                          />
                        </div>
                      </div>

                      {/* Expand/collapse panel: shared ExpandPanel keeps content mounted so the
                          CSS grid-rows transition can animate open/closed instead of popping
                          content in/out instantly. */}
                      <ExpandPanel isOpen={isRevealed}>
                        {item.source_type === 'conflict' && (() => {
                          const conflict = conflicts.find((c) => c.id === item.source_ref)
                          return conflict ? <ConflictNeedsYouActions conflict={conflict} /> : null
                        })()}

                        {item.source_type === 'directory_suggestion' && (
                          <DirectorySuggestionActions
                            enabled={isRevealed}
                            onDismiss={item.source_ref ? () => markRead.mutate(item.source_ref!) : undefined}
                          />
                        )}

                        {!readOnly && item.source_type !== 'conflict' && item.source_type !== 'directory_suggestion' && (
                          <div className="flex items-center gap-2 pt-2.5 pl-[2.375rem]">
                            <Button
                              onClick={() => { snoozePrepItem(item.id); setRevealedItemId(null) }}
                              variant="secondary"
                              size="sm"
                              title="Snooze until tomorrow"
                            >
                              Snooze
                            </Button>
                            <Button
                              onClick={() => handleDownvote(item)}
                              variant="secondary"
                              size="sm"
                              leadingIcon={<ThumbsDown size={13} strokeWidth={2.1} />}
                              className="border-transparent bg-casa-error/10 text-casa-error hover:bg-casa-error/15"
                              title="Not relevant"
                            >
                              Not relevant
                            </Button>
                          </div>
                        )}
                      </ExpandPanel>
                    </div>
                  )
                })}
              </div>

              {visiblePrepItems.length > NEEDS_YOU_HOME_RAIL_LIMIT && (
                <Link
                  to="/actions"
                  className="mt-2 flex items-center justify-center gap-1 rounded-card border border-casa-border py-2 text-caption font-semibold text-casa-muted hover:bg-casa-bg hover:text-casa-text transition-colors"
                >
                  More ({visiblePrepItems.length - NEEDS_YOU_HOME_RAIL_LIMIT}) <ChevronRight size={12} />
                </Link>
              )}

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
        open={!!actionToast}
        message={
          actionToast
            ? actionToast.kind === 'done'
              ? `Marked "${actionToast.description}" done.`
              : `"${actionToast.description}" marked not relevant.`
            : ''
        }
        tone={actionToast?.kind === 'downvote' ? 'info' : 'success'}
        onClose={() => setActionToast(null)}
        actionLabel="Undo"
        onAction={() => { if (actionToast) undoRemoval(actionToast.id) }}
      />
    </SecondaryRail>
  )
}
