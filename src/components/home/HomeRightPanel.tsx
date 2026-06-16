/**
 * HomeRightPanel — shown on tablet (lg:) to the right of today's timeline.
 * Week strip, daily briefing, alerts, recent activity — all collapsible.
 */
import { useEffect, useState, useCallback, useMemo } from 'react'
import { format, formatDistanceToNow, startOfWeek, addDays } from 'date-fns'
import { Link } from 'react-router-dom'
import { AlertTriangle, Sun, ChevronRight, Bot, CalendarDays, Bell, ChevronDown, Plane, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '../../utils/cn'
import { useNotifications } from '../../hooks/useNotifications'
import { useWeekEvents } from '../../hooks/useCalendarEvents'
import { supabase } from '../../lib/supabase'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import { useUpcomingTrips } from '../../hooks/useTrips'
import TripCard from './TripCard'
import ConflictAlertsSection from '../shared/ConflictAlertsSection'
import { useWeekConflicts } from '../../hooks/useConflicts'
import PrepActionSection from './PrepActionSection'
import { useCalendarStore } from '../../stores/calendarStore'
import BounceScroll from '../shared/BounceScroll'
import type { PrepItem } from '../../types'

interface Props {
  now: Date
  allTodayEvents: EventWithDetails[]
  onSelectPrepItem?: (item: PrepItem) => void
}

interface Briefing {
  summary_text: string | null
  generated_by: string | null
}

interface HomePanelSectionState {
  trips: boolean
  week: boolean
  briefing: boolean
  alerts: boolean
  activity: boolean
}

const HOME_PANEL_SECTIONS_KEY = 'casa-home-right-panel-sections-v1'
const DEFAULT_SECTION_STATE: HomePanelSectionState = {
  trips: true,
  week: false,
  briefing: true,
  alerts: true,
  activity: false,
}

function loadSectionState(): HomePanelSectionState {
  try {
    const raw = localStorage.getItem(HOME_PANEL_SECTIONS_KEY)
    if (!raw) return DEFAULT_SECTION_STATE
    return { ...DEFAULT_SECTION_STATE, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_SECTION_STATE
  }
}

/** Shared collapsible section header — gold icon + label + chevron */
function SectionHeader({
  icon, label, open, onToggle, action, badge,
}: {
  icon: React.ReactNode
  label: string
  open: boolean
  onToggle: () => void
  action?: React.ReactNode
  badge?: number
}) {
  return (
    <div className="w-full flex items-center justify-between">
      <button onClick={onToggle} className="flex-1 flex items-center gap-1.5 text-body font-semibold text-casa-text text-left">
        {icon}
        {label}
        {badge != null && badge > 0 && (
          <span className="ml-1 text-caption font-bold bg-casa-gold/20 text-casa-gold px-1.5 py-0.5 rounded-full">
            {badge}
          </span>
        )}
        <ChevronDown
          size={13}
          className={cn('ml-auto text-casa-muted transition-transform duration-200', open ? 'rotate-0' : '-rotate-90')}
        />
      </button>
      {action && <div className="ml-2 shrink-0">{action}</div>}
    </div>
  )
}

function wordCount(text: string) { return text.trim().split(/\s+/).length }

function truncateToWords(paragraphs: string[], limit = 500) {
  let count = 0
  let cutIdx = paragraphs.length
  for (let i = 0; i < paragraphs.length; i++) {
    const w = wordCount(paragraphs[i])
    if (count + w > limit && i > 0) { cutIdx = i; break }
    count += w
  }
  return { visible: paragraphs.slice(0, cutIdx), rest: paragraphs.slice(cutIdx) }
}

function parseParagraphs(text: string): string[] {
  if (text.includes('\n\n')) {
    return text.split('\n\n').map(p => p.replace(/\n/g, ' ').trim()).filter(Boolean)
  }
  const sentences = text.match(/[^.!?]+[.!?]+["']?/g) ?? [text]
  const chunks: string[] = []
  for (let i = 0; i < sentences.length; i += 2) {
    chunks.push(sentences.slice(i, i + 2).join(' ').trim())
  }
  return chunks.filter(Boolean)
}

type ActivityOutcome = 'Created' | 'Updated' | 'Skipped' | 'Conflict' | 'Alert' | 'Completed' | 'Snoozed' | 'Error' | 'Info'

interface GmailConnectionStatus {
  family_member_id: string
  google_email: string
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

export default function HomeRightPanel({ now, allTodayEvents, onSelectPrepItem }: Props) {
  const { notifications, markRead, clearAll } = useNotifications()
  const { data: conflicts = [] } = useWeekConflicts()
  const weekStart = startOfWeek(now, { weekStartsOn: 0 })
  const { data: weekEvents } = useWeekEvents(now)
  const { data: upcomingTrips } = useUpcomingTrips()
  const [briefing, setBriefing] = useState<Briefing | null>(null)
  const [briefingExpanded, setBriefingExpanded] = useState(false)
  const setActiveView = useCalendarStore(s => s.setActiveView)

  const [sectionState, setSectionState] = useState<HomePanelSectionState>(loadSectionState)
  const { trips: openTrips, week: openWeek, briefing: openBriefing, alerts: openAlerts, activity: openActivity } = sectionState

  const handleSeeAllWeek = useCallback(() => {
    setActiveView('stacked')
  }, [setActiveView])

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    supabase
      .from('daily_briefings')
      .select('summary_text, generated_by')
      .eq('briefing_date', today)
      .maybeSingle()
      .then(({ data }) => { if (data) setBriefing(data as Briefing) })
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(HOME_PANEL_SECTIONS_KEY, JSON.stringify(sectionState))
    } catch {
      // Ignore storage failures.
    }
  }, [sectionState])

  const paragraphs = briefing?.summary_text ? parseParagraphs(briefing.summary_text) : []
  const { visible, rest } = truncateToWords(paragraphs)
  const hasMore = rest.length > 0
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
        supabase.from('google_connection_status').select('family_member_id, google_email, gmail_scan_enabled, last_sync_at, last_sync_error'),
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
    () => groupActivities([...notificationEntries, ...(gmailActivity?.entries ?? [])]).slice(0, 10),
    [notificationEntries, gmailActivity],
  )

  return (
    <aside className="hidden lg:flex w-72 flex-shrink-0 flex-col border-l border-casa-border bg-casa-surface self-stretch overflow-hidden">
      <BounceScroll className="flex-1 min-h-0">

      {/* ── Upcoming Trips ────────────────────────────────────── */}
      {upcomingTrips && upcomingTrips.length > 0 && (
        <div className="px-5 pt-6 pb-5 border-b border-casa-border">
          <SectionHeader
            icon={<Plane size={15} className="text-casa-gold" />}
            label="Upcoming Trips"
            open={openTrips}
            onToggle={() => setSectionState(v => ({ ...v, trips: !v.trips }))}
          />
          {openTrips && (
            <div className="mt-3 space-y-2.5">
              {upcomingTrips.map(trip => (
                <TripCard key={trip.id} trip={trip} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── This Week ─────────────────────────────────────────── */}
      <div className="px-5 pt-6 pb-5 border-b border-casa-border">
        <SectionHeader
          icon={<CalendarDays size={15} className="text-casa-gold" />}
          label="This Week"
          open={openWeek}
          onToggle={() => setSectionState(v => ({ ...v, week: !v.week }))}
          action={
            <Link
              to="/calendar"
              onClick={handleSeeAllWeek}
              className="text-caption text-casa-gold hover:brightness-110 flex items-center gap-0.5"
            >
              See all <ChevronRight size={11} />
            </Link>
          }
        />
        {openWeek && (
          <div className="flex gap-1.5 mt-4">
            {days.map((d, i) => {
              const isToday = d.toDateString() === now.toDateString()
              const count = weekEvents?.filter(e =>
                new Date(e.start_time).toDateString() === d.toDateString()
              ).length ?? 0
              return (
                <div key={i} className={cn(
                  'flex-1 flex flex-col items-center py-2.5 rounded-xl text-center cursor-pointer transition-colors',
                  isToday ? 'bg-casa-navy' : 'hover:bg-casa-bg',
                )}>
                  <span className={cn('text-caption uppercase tracking-wide font-semibold', isToday ? 'text-white/70' : 'text-casa-text')}>
                    {format(d, 'EEE')[0]}
                  </span>
                  <span className={cn('text-body font-semibold mt-1', isToday ? 'text-white' : 'text-casa-text')}>
                    {format(d, 'd')}
                  </span>
                  <span className={cn('text-caption font-bold mt-0.5 h-3.5', isToday ? 'text-casa-gold' : 'text-casa-muted')}>
                    {count > 0 ? count : ''}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Daily Briefing ────────────────────────────────────── */}
      <div className="px-5 py-5 border-b border-casa-border">
        <SectionHeader
          icon={<Sun size={15} className="text-casa-gold" />}
          label="Daily Briefing"
          open={openBriefing}
          onToggle={() => setSectionState(v => ({ ...v, briefing: !v.briefing }))}
          action={
            <Link to="/briefing" className="text-caption text-casa-gold hover:brightness-110">Full →</Link>
          }
        />
        {openBriefing && (
          <div className="mt-3">
            {paragraphs.length > 0 ? (
              <div className="space-y-2.5">
                {visible.map((p, i) => (
                  <p key={i} className="text-body-sm text-casa-text leading-relaxed">{p}</p>
                ))}
                {hasMore && briefingExpanded && rest.map((p, i) => (
                  <p key={`r${i}`} className="text-body-sm text-casa-text leading-relaxed">{p}</p>
                ))}
                {hasMore && (
                  <button
                    onClick={() => setBriefingExpanded(e => !e)}
                    className="text-caption text-casa-gold hover:brightness-110 font-medium flex items-center gap-1"
                  >
                    {briefingExpanded ? '↑ Show less' : '↓ Show more'}
                  </button>
                )}
                {briefing?.generated_by && (
                  <p className="text-caption text-casa-muted flex items-center gap-1 pt-2 border-t border-casa-divider">
                    <Bot size={10} className="text-casa-gold" />
                    {briefing.generated_by}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-body-sm text-casa-muted italic leading-relaxed">
                {allTodayEvents.length} event{allTodayEvents.length !== 1 ? 's' : ''} scheduled today.{' '}
                <Link to="/briefing" className="text-casa-gold hover:brightness-110">Generate briefing →</Link>
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Prep & Action ─────────────────────────────────────── */}
      <PrepActionSection onSelectItem={onSelectPrepItem} />

      {/* ── Heads Up (only when active conflicts exist) ───────── */}
      {conflicts.length > 0 && (
        <div className="px-5 py-5 border-b border-casa-border">
          <SectionHeader
            icon={<AlertTriangle size={15} className="text-amber-500" />}
            label="Heads Up"
            badge={conflicts.length}
            open={openAlerts}
            onToggle={() => setSectionState(v => ({ ...v, alerts: !v.alerts }))}
          />
          {openAlerts && (
            <div className="mt-3">
              <ConflictAlertsSection />
            </div>
          )}
        </div>
      )}

      {/* ── Recent Activity ───────────────────────────────────── */}
      <div className="px-5 py-5 flex-1">
        <SectionHeader
          icon={<Bell size={15} className="text-casa-gold" />}
          label="Recent Activity"
          badge={notifications.filter(n => !n.read).length || undefined}
          open={openActivity}
          onToggle={() => setSectionState(v => ({ ...v, activity: !v.activity }))}
          action={(
            <div className="flex items-center gap-2">
              <Link to="/actions" className="text-caption text-casa-gold hover:brightness-110">See all</Link>
              {notifications.length > 0 && (
                <button
                  onClick={() => clearAll.mutate()}
                  className="text-caption text-casa-muted hover:text-red-500 transition-colors font-medium"
                >
                  Clear all
                </button>
              )}
            </div>
          )}
        />
        {openActivity && (
          <div className="mt-3">
            {gmailActivity && (
              <div className="mb-3 rounded-xl border border-casa-border bg-casa-bg px-3 py-2.5">
                <p className="text-caption text-casa-text">
                  Last scan {gmailActivity.lastScanAt ? formatDistanceToNow(new Date(gmailActivity.lastScanAt), { addSuffix: true }) : 'not available'}
                </p>
                <p className="text-caption text-casa-muted mt-0.5">
                  Scanners {gmailActivity.scannersHealthy}/{gmailActivity.scannersEnabled} healthy
                  {gmailActivity.scannersWithErrors > 0 && ` · ${gmailActivity.scannersWithErrors} error`}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="text-caption rounded-full bg-slate-200/70 text-slate-700 px-2 py-0.5">{gmailActivity.scanned} scanned</span>
                  <span className="text-caption rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5">{gmailActivity.created} created</span>
                  <span className="text-caption rounded-full bg-blue-100 text-blue-700 px-2 py-0.5">{gmailActivity.updated} updated</span>
                  <span className="text-caption rounded-full bg-slate-100 text-slate-600 px-2 py-0.5">{gmailActivity.skipped} skipped</span>
                </div>
                {gmailActivity.memberStates.length > 0 && (
                  <p className="text-caption text-casa-muted mt-2 truncate">
                    {gmailActivity.memberStates.join(' • ')}
                  </p>
                )}
              </div>
            )}
            {activityEntries.length === 0 ? (
              <p className="text-caption text-casa-muted">No recent activity</p>
            ) : (
              <div>
                {activityEntries.map(item => (
                  <div key={item.id} className="py-2.5 border-b border-casa-divider last:border-0 flex items-start gap-2 group">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide', OUTCOME_STYLES[item.outcome])}>
                          {item.outcome}
                        </span>
                        {item.count > 1 && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-casa-gold/20 text-casa-gold">
                            x{item.count}
                          </span>
                        )}
                      </div>
                      <p className={cn('text-body-sm font-medium leading-snug truncate', item.read ? 'text-casa-muted' : 'text-casa-text')}>
                        {item.title}
                      </p>
                      {item.reason && (
                        <p className="text-caption text-casa-muted/90 mt-0.5 line-clamp-2">{item.reason}</p>
                      )}
                      <p className="text-caption text-casa-muted mt-0.5">
                        {item.source} · {format(new Date(item.createdAt), 'h:mm a')}
                      </p>
                      {item.summary && (
                        <p className="text-caption text-casa-muted mt-0.5">{item.summary}</p>
                      )}
                    </div>
                    {item.notificationId && !item.read && (
                      <button
                        onClick={() => {
                          if (item.notificationId) markRead.mutate(item.notificationId)
                        }}
                        className="shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity text-casa-muted hover:text-red-400"
                        title="Dismiss"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      </BounceScroll>
    </aside>
  )
}
