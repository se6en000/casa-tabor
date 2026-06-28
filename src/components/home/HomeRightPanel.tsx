/**
 * HomeRightPanel — redesigned desktop rail with week-jump, needs-you cards,
 * and inbox intelligence while reusing existing data/actions.
 */
import { useState } from 'react'
import { addDays, differenceInDays, format, parseISO, startOfWeek } from 'date-fns'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, ChevronRight, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '../../utils/cn'
import { useWeekEvents } from '../../hooks/useCalendarEvents'
import { useDismissPrepItem, useDownvotePrepItem, usePrepItems, useSnoozePrepItem } from '../../hooks/usePrepItems'
import { useWeekConflicts } from '../../hooks/useConflicts'
import { supabase } from '../../lib/supabase'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import { useCalendarStore } from '../../stores/calendarStore'
import BounceScroll from '../shared/BounceScroll'
import ConflictAlertsSection from '../shared/ConflictAlertsSection'
import type { PrepItem } from '../../types'
import { eventOverlapsDay } from '../../utils/eventTime'

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

  const { data: gmailActivity } = useQuery<ActivityHealth>({
    queryKey: ['recent-activity-health'],
    queryFn: async () => {
      const [
        { data: statuses, error: statusesError },
        { data: messages, error: messagesError },
      ] = await Promise.all([
        supabase.from('google_connection_status').select('family_member_id, gmail_scan_enabled, last_sync_at, last_sync_error'),
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
      }
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

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
        <section className="px-4 py-4">
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
                eventOverlapsDay(event, day)
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

        <section className="px-4 py-4">
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
                          <span className="text-body-sm font-semibold text-casa-muted">{urgency.section}</span>
                        </div>
                        <span className={cn('text-[16px] font-semibold leading-none whitespace-nowrap px-1.5 py-px rounded-full capitalize', urgency.badgeTone)}>
                          {urgency.badge}
                        </span>
                      </div>
                      <div className="mt-2.5">
                        <p className={cn('!text-body-sm leading-snug text-casa-text', isDone && 'line-through text-casa-muted')}>
                          {item.description}
                        </p>
                      </div>
                      <div className="mt-2.5 flex items-center gap-2.5">
                        <span className={cn('!text-body-sm font-semibold leading-none whitespace-nowrap px-2 py-0.5 rounded-full border', source.tone)}>
                          {source.label}
                        </span>
                        <span className="!text-body-sm text-casa-muted truncate">
                          {item.event_title || 'Casa Tabor'}
                        </span>
                      </div>
                    </button>
                    <div className="mt-3 border-t border-casa-border/80 pt-3">
                      <div className="grid grid-cols-[1.7fr_0.85fr_auto_auto_auto] items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleDone(item)}
                          className="h-9 rounded-[0.9rem] bg-casa-navy text-white font-semibold text-body-sm hover:brightness-105 transition"
                          title="Mark done"
                        >
                          Mark done
                        </button>
                        <button
                          type="button"
                          onClick={() => snoozePrepItem(item.id)}
                          className="h-9 rounded-[0.9rem] border border-casa-border bg-casa-card text-casa-muted font-semibold text-body-sm hover:text-casa-text transition-colors"
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
              <div className="mt-4 pt-4 border-t border-casa-border">
                <Link
                  to="/actions#recent-activity"
                  className="block rounded-[1.8rem] bg-casa-navy px-3.5 pb-3.5 pt-4 text-white shadow-md hover:brightness-[1.04] transition"
                >
                  <div className="flex items-center gap-2.5">
                    <Sparkles size={15} className="text-white/90 shrink-0" />
                    <h4 className="text-body-sm leading-tight font-semibold tracking-tight truncate">Casa sorted your inbox</h4>
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
                  <div className="mt-3.5 h-11 rounded-[1rem] border border-white/22 bg-white/9 text-white text-body-sm font-semibold inline-flex items-center justify-center w-full">
                    See what Casa filtered &rarr;
                  </div>
                </Link>
              </div>
            </div>
          )}
        </section>

        {conflicts.length > 0 && (
          <section className="px-4 py-4">
            <div className="flex items-center gap-2 mb-2.5">
              <AlertTriangle size={14} className="text-amber-500" />
              <h3 className="text-body-sm font-semibold text-casa-text tracking-wide uppercase">Heads up</h3>
              <span className="text-caption font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">{conflicts.length}</span>
            </div>
            <ConflictAlertsSection />
          </section>
        )}

      </BounceScroll>
    </aside>
  )
}
