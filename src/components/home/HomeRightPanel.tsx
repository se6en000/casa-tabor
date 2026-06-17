/**
 * HomeRightPanel — redesigned desktop rail with week-jump, needs-you cards,
 * and inbox intelligence while reusing existing data/actions.
 */
import { useMemo, useState } from 'react'
import { addDays, differenceInDays, format, formatDistanceToNow, parseISO, startOfWeek } from 'date-fns'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, Bot, ChevronRight, ThumbsDown, ThumbsUp, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '../../utils/cn'
import { useNotifications } from '../../hooks/useNotifications'
import { useWeekEvents } from '../../hooks/useCalendarEvents'
import { useDismissPrepItem, useDownvotePrepItem, usePrepItems, useSnoozePrepItem } from '../../hooks/usePrepItems'
import { useWeekConflicts } from '../../hooks/useConflicts'
import { supabase } from '../../lib/supabase'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import { useCalendarStore } from '../../stores/calendarStore'
import BounceScroll from '../shared/BounceScroll'
import ConflictAlertsSection from '../shared/ConflictAlertsSection'
import type { PrepItem } from '../../types'

interface Props {
  now: Date
  allTodayEvents: EventWithDetails[]
  onSelectPrepItem?: (item: PrepItem) => void
}

type ActivityOutcome = 'Created' | 'Updated' | 'Skipped' | 'Conflict' | 'Alert' | 'Completed' | 'Snoozed' | 'Error' | 'Info'

interface GmailConnectionStatus {
  family_member_id: string
  gmail_scan_enabled: boolean
  last_sync_at: string | null
  last_sync_error: string | null
}

interface FamilyMemberSummary {
  id: string
  name: string
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

interface ActivityEntry {
  id: string
  title: string
  source: string
  createdAt: string
  outcome: ActivityOutcome
  reason: string | null
  summary: string | null
  read: boolean
  count: number
  notificationId?: string
}

interface ActivityHealth {
  scannersEnabled: number
  scannersHealthy: number
  scannersWithErrors: number
  lastScanAt: string | null
  scanned: number
  created: number
  updated: number
  skipped: number
  memberStates: string[]
  entries: ActivityEntry[]
}

const OUTCOME_STYLES: Record<ActivityOutcome, string> = {
  Created: 'bg-emerald-100 text-emerald-700',
  Updated: 'bg-blue-100 text-blue-700',
  Skipped: 'bg-slate-100 text-slate-600',
  Conflict: 'bg-red-100 text-red-700',
  Alert: 'bg-amber-100 text-amber-700',
  Completed: 'bg-emerald-100 text-emerald-700',
  Snoozed: 'bg-purple-100 text-purple-700',
  Error: 'bg-red-100 text-red-700',
  Info: 'bg-slate-100 text-slate-600',
}

function sourceLabel(source: string | null): string {
  switch (source) {
    case 'gmail': return 'Gmail'
    case 'ai': return 'AI'
    case 'policy': return 'Policy'
    case 'google_sync': return 'Google Sync'
    case 'sms': return 'SMS'
    case 'system': return 'System'
    case 'manual': return 'Manual'
    default: return 'System'
  }
}

function outcomeFromNotificationType(type: string): ActivityOutcome {
  if (type.includes('error')) return 'Error'
  if (type.includes('conflict')) return 'Conflict'
  if (type.includes('snooze')) return 'Snoozed'
  if (type.includes('done')) return 'Completed'
  if (type.includes('updated')) return 'Updated'
  if (type.includes('added') || type.includes('import')) return 'Created'
  if (type.startsWith('push_') || type.includes('reminder') || type.includes('prep')) return 'Alert'
  return 'Info'
}

function summaryFromNotificationType(type: string): string | null {
  if (type.includes('added') || type === 'gmail_import') return '+1 event'
  if (type.includes('updated')) return 'event changed'
  if (type.includes('conflict')) return 'conflict flagged'
  if (type.includes('prep')) return 'prep escalation'
  if (type.startsWith('push_')) return 'push sent'
  return null
}

function normalizeActivityTitle(title: string): string {
  return title
    .replace(/^(new event added|event updated|upcoming:|starting soon:|reminder soon:|reminder now:|conflict:|prep due:)\s*/i, '')
    .trim()
    .toLowerCase()
}

function groupActivities(entries: ActivityEntry[]): ActivityEntry[] {
  const sorted = [...entries].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
  const grouped: ActivityEntry[] = []
  const indexByKey = new Map<string, number>()
  const windowMs = 90 * 60 * 1000

  for (const entry of sorted) {
    const key = `${entry.outcome}|${entry.source}|${normalizeActivityTitle(entry.title)}`
    const groupedIdx = indexByKey.get(key)
    if (groupedIdx == null) {
      indexByKey.set(key, grouped.length)
      grouped.push(entry)
      continue
    }

    const candidate = grouped[groupedIdx]
    if (Math.abs(+new Date(candidate.createdAt) - +new Date(entry.createdAt)) > windowMs) {
      indexByKey.set(`${key}|${entry.createdAt}`, grouped.length)
      grouped.push(entry)
      continue
    }

    grouped[groupedIdx] = {
      ...candidate,
      count: candidate.count + 1,
      reason: candidate.reason ?? entry.reason,
      read: candidate.read && entry.read,
    }
  }

  return grouped
}

function daysUntil(eventDate: string | null): number {
  if (!eventDate) return 99
  return differenceInDays(parseISO(eventDate), new Date())
}

function urgencyLabel(days: number) {
  if (days <= 0) return { section: 'TODAY', badge: 'today', dotTone: 'bg-red-500', badgeTone: 'bg-red-100 text-red-700' }
  if (days === 1) return { section: 'SOON', badge: 'tomorrow', dotTone: 'bg-amber-500', badgeTone: 'bg-amber-100 text-amber-700' }
  if (days <= 4) return { section: 'SOON', badge: `in ${days}d`, dotTone: 'bg-amber-500', badgeTone: 'bg-amber-100 text-amber-700' }
  return { section: 'LATER', badge: `in ${days}d`, dotTone: 'bg-emerald-500', badgeTone: 'bg-emerald-100 text-emerald-700' }
}

function sourceBadge(item: PrepItem) {
  if (item.source_type === 'gmail') return { label: 'Email', tone: 'text-purple-700 bg-purple-50 border-purple-200' }
  if (item.source_type === 'calendar_ai') return { label: 'Calendar', tone: 'text-sky-700 bg-sky-50 border-sky-200' }
  return { label: 'System', tone: 'text-casa-muted bg-casa-bg border-casa-border' }
}

export default function HomeRightPanel({ now, allTodayEvents, onSelectPrepItem }: Props) {
  const navigate = useNavigate()
  const { notifications, markRead } = useNotifications()
  const { data: conflicts = [] } = useWeekConflicts()
  const { data: prepItems = [] } = usePrepItems()
  const dismissPrepItem = useDismissPrepItem()
  const snoozePrepItem = useSnoozePrepItem()
  const downvotePrepItem = useDownvotePrepItem()
  const { data: weekEvents } = useWeekEvents(now)
  const setSelectedDate = useCalendarStore(s => s.setSelectedDate)
  const setActiveView = useCalendarStore(s => s.setActiveView)
  const [checkingItemId, setCheckingItemId] = useState<string | null>(null)
  const [downvotingItemId, setDownvotingItemId] = useState<string | null>(null)

  const weekStart = startOfWeek(now, { weekStartsOn: 0 })
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const notificationEntries = useMemo<ActivityEntry[]>(() => (
    notifications.map(n => ({
      id: `notif:${n.id}`,
      title: n.body ?? n.title,
      source: sourceLabel(n.source),
      createdAt: n.created_at,
      outcome: outcomeFromNotificationType(n.type),
      reason: n.body && n.title !== n.body ? n.title : null,
      summary: summaryFromNotificationType(n.type),
      read: n.read,
      count: 1,
      notificationId: n.id,
    }))
  ), [notifications])

  const { data: gmailActivity } = useQuery<ActivityHealth>({
    queryKey: ['recent-activity-health'],
    queryFn: async () => {
      const [
        { data: statuses, error: statusesError },
        { data: members, error: membersError },
        { data: messages, error: messagesError },
      ] = await Promise.all([
        supabase.from('google_connection_status').select('family_member_id, gmail_scan_enabled, last_sync_at, last_sync_error'),
        supabase.from('family_members').select('id, name'),
        supabase
          .from('gmail_processed_messages')
          .select('id, family_member_id, subject, from_email, intent, created_event_id, updated_event_id, skipped_reason, processed_at')
          .order('processed_at', { ascending: false })
          .limit(40),
      ])
      if (statusesError) throw statusesError
      if (membersError) throw membersError
      if (messagesError) throw messagesError

      const statusRows = (statuses ?? []) as GmailConnectionStatus[]
      const memberRows = (members ?? []) as FamilyMemberSummary[]
      const messageRows = (messages ?? []) as GmailProcessedMessage[]
      const memberById = new Map(memberRows.map(m => [m.id, m.name]))
      const enabled = statusRows.filter(s => s.gmail_scan_enabled)

      const healthyThresholdMs = 90 * 60 * 1000
      const scannersHealthy = enabled.filter(s => {
        if (s.last_sync_error) return false
        if (!s.last_sync_at) return false
        return (Date.now() - +new Date(s.last_sync_at)) <= healthyThresholdMs
      }).length

      const memberStates = enabled.map(s => {
        const name = memberById.get(s.family_member_id) ?? 'Unknown'
        if (s.last_sync_error) return `${name} error`
        if (!s.last_sync_at || (Date.now() - +new Date(s.last_sync_at)) > healthyThresholdMs) return `${name} stale`
        return `${name} ok`
      })

      const activityWindowMs = 6 * 60 * 60 * 1000
      const recentMessages = messageRows.filter(m => (Date.now() - +new Date(m.processed_at)) <= activityWindowMs)
      const created = recentMessages.filter(m => !!m.created_event_id).length
      const updated = recentMessages.filter(m => !!m.updated_event_id).length
      const skipped = recentMessages.filter(m => m.intent === 'skip' || !!m.skipped_reason).length

      const entries: ActivityEntry[] = recentMessages.map(m => {
        const outcome: ActivityOutcome = m.created_event_id
          ? 'Created'
          : m.updated_event_id
          ? 'Updated'
          : (m.intent === 'skip' || m.skipped_reason)
          ? 'Skipped'
          : 'Info'
        return {
          id: `gmail:${m.id}`,
          title: m.subject?.trim() || '(no subject)',
          source: `Gmail • ${memberById.get(m.family_member_id) ?? 'Unknown'}`,
          createdAt: m.processed_at,
          outcome,
          reason: m.skipped_reason ?? m.from_email ?? null,
          summary: m.created_event_id ? '+1 event' : m.updated_event_id ? 'event updated' : null,
          read: true,
          count: 1,
        }
      })

      const lastScanAt = enabled
        .map(s => s.last_sync_at)
        .filter((value): value is string => !!value)
        .sort((a, b) => +new Date(b) - +new Date(a))[0] ?? null

      return {
        scannersEnabled: enabled.length,
        scannersHealthy,
        scannersWithErrors: enabled.filter(s => !!s.last_sync_error).length,
        lastScanAt,
        scanned: recentMessages.length,
        created,
        updated,
        skipped,
        memberStates,
        entries,
      }
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

  const activityEntries = useMemo(
    () => groupActivities([...notificationEntries, ...(gmailActivity?.entries ?? [])]).slice(0, 6),
    [notificationEntries, gmailActivity],
  )

  const nextEvent = allTodayEvents.find(event => new Date(event.end_time) >= now) ?? null

  async function handleDone(item: PrepItem) {
    setCheckingItemId(item.id)
    await dismissPrepItem(item.id)
    setCheckingItemId(null)
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
    <aside className="hidden lg:flex w-[22rem] flex-shrink-0 flex-col border-l border-casa-border bg-casa-rail self-stretch overflow-hidden">
      <BounceScroll className="flex-1 min-h-0">
        <section className="px-4 py-4 border-b border-casa-border">
          <div className="flex items-center justify-between">
            <h3 className="text-body-sm font-semibold text-casa-text tracking-wide uppercase">This week</h3>
            <Link to="/calendar" className="text-caption font-semibold text-casa-gold inline-flex items-center gap-1">
              See all <ChevronRight size={11} />
            </Link>
          </div>
          <div className="mt-3 grid grid-cols-7 gap-1.5">
            {days.map(day => {
              const isToday = day.toDateString() === now.toDateString()
              const eventCount = weekEvents?.filter(event => (
                new Date(event.start_time).toDateString() === day.toDateString()
              )).length ?? 0

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => handleWeekDayClick(day)}
                  className={cn(
                    'rounded-xl px-1 py-2 text-center border transition-colors',
                    isToday
                      ? 'bg-casa-navy border-casa-navy text-white'
                      : 'bg-casa-main border-casa-divider text-casa-text hover:bg-casa-card',
                  )}
                >
                  <p className={cn('text-caption font-semibold uppercase', isToday ? 'text-white/70' : 'text-casa-muted')}>
                    {format(day, 'EEE')[0]}
                  </p>
                  <p className="text-body-sm font-semibold leading-tight mt-0.5">{format(day, 'd')}</p>
                  <p className={cn('text-caption mt-0.5 min-h-3', isToday ? 'text-casa-gold' : 'text-casa-muted')}>
                    {eventCount > 0 ? eventCount : ''}
                  </p>
                </button>
              )
            })}
          </div>
        </section>

        <section className="px-4 py-4 border-b border-casa-border">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-body-sm font-semibold text-casa-text tracking-wide uppercase">Needs you</h3>
              <p className="text-caption text-casa-muted mt-0.5 truncate">
                {nextEvent ? `Up next: ${nextEvent.title}` : 'Nothing left today'}
              </p>
            </div>
            <Link to="/actions" className="text-caption font-semibold text-casa-gold whitespace-nowrap">
              See all
            </Link>
          </div>

          {prepItems.length === 0 ? (
            <div className="mt-3 rounded-2xl border border-casa-border bg-casa-card px-3 py-3">
              <p className="text-caption text-casa-muted">All clear. No urgent prep actions right now.</p>
            </div>
          ) : (
            <div className="mt-3 space-y-2.5">
              {prepItems.slice(0, 4).map(item => {
                const urgency = urgencyLabel(daysUntil(item.event_date))
                const source = sourceBadge(item)
                const isDone = checkingItemId === item.id
                const isDownvoting = downvotingItemId === item.id

                return (
                  <div
                    key={item.id}
                    className={cn(
                      'rounded-[1.35rem] border border-casa-border/85 bg-casa-card px-3.5 py-3.5 shadow-sm',
                      (isDone || isDownvoting) && 'opacity-60',
                    )}
                  >
                    <button type="button" onClick={() => onSelectPrepItem?.(item)} className="w-full text-left">
                      <div className="flex items-center justify-between gap-2">
                        <div className="inline-flex items-center gap-2">
                          <span className={cn('h-2.5 w-2.5 rounded-full', urgency.dotTone)} />
                          <span className="text-body-sm font-semibold tracking-[0.14em] text-casa-muted">{urgency.section}</span>
                        </div>
                        <span className={cn('text-[11px] font-semibold px-2.5 py-1 rounded-pill capitalize', urgency.badgeTone)}>
                          {urgency.badge}
                        </span>
                      </div>
                      <div className="mt-2.5">
                        <p className={cn('text-heading leading-snug text-casa-text', isDone && 'line-through text-casa-muted')}>
                          {item.description}
                        </p>
                      </div>
                      <div className="mt-2.5 flex items-center gap-2.5">
                        <span className={cn('text-body-sm font-semibold px-2.5 py-1 rounded-button border', source.tone)}>
                          {source.label}
                        </span>
                        <span className="text-[1rem] text-casa-muted truncate">
                          {item.event_title || 'Casa Tabor'}
                        </span>
                      </div>
                    </button>
                    <div className="mt-3 border-t border-casa-border/80 pt-3">
                      <div className="grid grid-cols-[1.7fr_0.85fr_auto_auto_auto] items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleDone(item)}
                          className="h-9 rounded-[0.9rem] bg-casa-navy text-white font-semibold text-body hover:brightness-105 transition"
                          title="Mark done"
                        >
                          Mark done
                        </button>
                        <button
                          type="button"
                          onClick={() => snoozePrepItem(item.id)}
                          className="h-9 rounded-[0.9rem] border border-casa-border bg-casa-card text-casa-muted font-semibold text-body hover:text-casa-text transition-colors"
                          title="Snooze until tomorrow"
                        >
                          Snooze
                        </button>
                        <div className="h-7 w-px bg-casa-border/80 mx-1" />
                        <button
                          type="button"
                          onClick={() => handleDone(item)}
                          className="h-9 w-9 rounded-[0.9rem] border border-casa-border bg-casa-card text-casa-gold hover:bg-casa-main transition-colors flex items-center justify-center"
                          title="Helpful"
                        >
                          <ThumbsUp size={15} strokeWidth={2.1} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownvote(item)}
                          className="h-9 w-9 rounded-[0.9rem] border border-casa-border bg-casa-card text-casa-muted hover:text-red-500 hover:bg-casa-main transition-colors flex items-center justify-center"
                          title="Not relevant"
                        >
                          <ThumbsDown size={15} strokeWidth={2.1} />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
              <Link
                to="/actions#recent-activity"
                className="h-11 rounded-[1rem] border border-casa-border bg-casa-navy/90 text-white text-[1.06rem] font-semibold inline-flex items-center justify-center w-full hover:bg-casa-navy transition-colors"
              >
                See what Casa filtered &rarr;
              </Link>
            </div>
          )}
        </section>

        {conflicts.length > 0 && (
          <section className="px-4 py-4 border-b border-casa-border">
            <div className="flex items-center gap-2 mb-2.5">
              <AlertTriangle size={14} className="text-amber-500" />
              <h3 className="text-body-sm font-semibold text-casa-text tracking-wide uppercase">Heads up</h3>
              <span className="text-caption font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">{conflicts.length}</span>
            </div>
            <ConflictAlertsSection />
          </section>
        )}

        <section className="px-4 py-4">
          <div className="rounded-2xl border border-casa-border bg-gradient-to-b from-casa-surface to-casa-bg px-3 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-body-sm font-semibold text-casa-text">Casa sorted your inbox</h3>
                <p className="text-caption text-casa-muted mt-0.5 truncate">
                  {gmailActivity?.lastScanAt
                    ? `Last scan ${formatDistanceToNow(new Date(gmailActivity.lastScanAt), { addSuffix: true })}`
                    : 'Waiting for scanner activity'}
                </p>
              </div>
              <Link to="/actions" className="text-caption font-semibold text-casa-gold whitespace-nowrap">
                See all
              </Link>
            </div>

            {gmailActivity && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <span className="text-caption rounded-full bg-slate-200/70 text-slate-700 px-2 py-0.5">{gmailActivity.scanned} scanned</span>
                <span className="text-caption rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5">{gmailActivity.created} created</span>
                <span className="text-caption rounded-full bg-blue-100 text-blue-700 px-2 py-0.5">{gmailActivity.updated} updated</span>
                <span className="text-caption rounded-full bg-slate-100 text-slate-600 px-2 py-0.5">{gmailActivity.skipped} skipped</span>
              </div>
            )}

            <div className="mt-3 space-y-2">
              {activityEntries.length === 0 ? (
                <p className="text-caption text-casa-muted">No recent inbox or notification activity.</p>
              ) : (
                activityEntries.map(entry => (
                  <div key={entry.id} className="rounded-xl border border-casa-divider bg-casa-card px-2.5 py-2">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className={cn('text-caption font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide', OUTCOME_STYLES[entry.outcome])}>
                            {entry.outcome}
                          </span>
                          {entry.count > 1 && (
                            <span className="text-caption font-semibold px-1.5 py-0.5 rounded-full bg-casa-gold/20 text-casa-gold">
                              x{entry.count}
                            </span>
                          )}
                        </div>
                        <p className={cn('text-body-sm font-medium leading-snug truncate', entry.read ? 'text-casa-muted' : 'text-casa-text')}>
                          {entry.title}
                        </p>
                        <p className="text-caption text-casa-muted mt-0.5">
                          {entry.source} · {format(new Date(entry.createdAt), 'h:mm a')}
                        </p>
                      </div>
                      {entry.notificationId && !entry.read && (
                        <button
                          type="button"
                          onClick={() => markRead.mutate(entry.notificationId!)}
                          className="shrink-0 text-casa-muted hover:text-red-400 transition-colors"
                          title="Dismiss"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {gmailActivity?.memberStates.length ? (
              <p className="text-caption text-casa-muted mt-2.5 pt-2 border-t border-casa-divider truncate inline-flex items-center gap-1.5 w-full">
                <Bot size={10} className="text-casa-gold shrink-0" />
                {gmailActivity.memberStates.join(' • ')}
              </p>
            ) : null}
          </div>
        </section>
      </BounceScroll>
    </aside>
  )
}
