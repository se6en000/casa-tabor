import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, formatDistanceToNow } from 'date-fns'
import { ClipboardList, Bell, BellOff, ChevronLeft, Mail, Calendar as CalendarIcon, Sparkles, ThumbsDown, CalendarPlus, BellPlus, AlertTriangle, ExternalLink } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '../utils/cn'
import { buildAiDraftPrompt } from '../utils/eventTime'
import { supabase } from '../lib/supabase'
import { usePrepItems, useCompletePrepItem, useDownvotePrepItem, useSnoozePrepItem } from '../hooks/usePrepItems'
import { useFamilyMembers } from '../hooks/useFamilyMembers'
import { useNotifications } from '../hooks/useNotifications'
import type { Notification } from '../hooks/useNotifications'
import { useWeekConflicts } from '../hooks/useConflicts'
import type { PrepItem } from '../types'
import { PREP_CATEGORIES, getPrepCategoryConfig } from '../utils/prepCategories'
import { humanizeNotificationSource } from '../utils/notificationSource'
import { summarizeGmailHealth } from '../utils/gmailHealth'
import { openEventDetails } from '../utils/openEventDetails'
import { priorityVisual } from '../utils/prepPriority'
import PrepItemDetailPanel from '../components/home/PrepItemDetailPanel'
import PrepItemAssigneeChip from '../components/shared/PrepItemAssigneeChip'
import { useLiveClock } from '../hooks/useLiveClock'
import ConflictAlertsSection from '../components/shared/ConflictAlertsSection'
import { Button, Chip } from '../components/ui'

function sourceBadge(item: PrepItem) {
  const source = item.source_type ?? 'calendar_ai'
  if (source === 'reminder_manual') return { label: 'Reminder', icon: Bell }
  if (source === 'reminder_missed') return { label: 'Missed reminder', icon: BellOff }
  if (source === 'gmail') return { label: 'Email', icon: Mail }
  if (source === 'calendar_ai') return { label: 'Calendar', icon: CalendarIcon }
  return { label: 'System', icon: Sparkles }
}

function dueBadge(item: PrepItem, now: Date): { label: string; tone: string } | null {
  if (!item.due_by) return null
  const due = new Date(item.due_by)
  const diff = due.getTime() - now.getTime()
  if (diff < 0) return { label: 'Overdue', tone: 'text-red-700 bg-red-50 border-red-200' }
  if (diff < 24 * 60 * 60 * 1000) return { label: 'Due today', tone: 'text-amber-700 bg-amber-50 border-amber-200' }
  if (diff < 48 * 60 * 60 * 1000) return { label: 'Due tomorrow', tone: 'text-casa-gold bg-casa-gold/15 border-casa-gold/35' }
  return { label: `Due ${format(due, 'EEE h:mm a')}`, tone: 'text-casa-muted bg-casa-bg border-casa-border' }
}

/** Pulls just the `text-*` utility out of a dueBadge tone string, for the plain-text
 * (no pill) due label used on the unified prep-item card face. */
function dueTextClass(tone: string): string {
  return tone.split(' ').find((cls) => cls.startsWith('text-')) ?? 'text-casa-muted'
}

function eventDateBadge(n: Notification, now: Date): { label: string; tone: string } | null {
  if (!n.event?.start_time) return null
  const start = new Date(n.event.start_time)
  const diff = start.getTime() - now.getTime()
  if (diff < 0) return { label: `Was ${format(start, 'EEE, MMM d')}`, tone: 'text-casa-muted bg-casa-bg border-casa-border' }
  if (diff < 24 * 60 * 60 * 1000) return { label: `Today ${format(start, 'h:mm a')}`, tone: 'text-amber-700 bg-amber-50 border-amber-200' }
  if (diff < 48 * 60 * 60 * 1000) return { label: `Tomorrow ${format(start, 'h:mm a')}`, tone: 'text-casa-gold bg-casa-gold/15 border-casa-gold/35' }
  return { label: format(start, 'EEE, MMM d · h:mm a'), tone: 'text-casa-muted bg-casa-bg border-casa-border' }
}

type PrepFilterKey = 'all' | (typeof PREP_CATEGORIES)[number]['key']

const PREP_FILTERS: { key: PrepFilterKey; label: string; match: (item: PrepItem) => boolean }[] = [
  { key: 'all', label: 'All', match: () => true },
  ...PREP_CATEGORIES.map((cat) => ({
    key: cat.key as PrepFilterKey,
    label: cat.label,
    match: (item: PrepItem) => getPrepCategoryConfig(item).key === cat.key,
  })),
]

type PrepSourceKey = 'all' | 'gmail' | 'calendar_ai' | 'reminder'

const PREP_SOURCE_FILTERS: { key: PrepSourceKey; label: string; match: (item: PrepItem) => boolean }[] = [
  { key: 'all', label: 'All sources', match: () => true },
  { key: 'gmail', label: 'Email', match: (item) => item.source_type === 'gmail' },
  { key: 'calendar_ai', label: 'Calendar', match: (item) => (item.source_type ?? 'calendar_ai') === 'calendar_ai' },
  {
    key: 'reminder',
    label: 'Reminders',
    match: (item) => item.source_type === 'reminder_manual' || item.source_type === 'reminder_missed',
  },
]

export default function ActionHubPage() {
  const now = useLiveClock(60_000)
  const { data: prepItems = [] } = usePrepItems()
  const { data: familyMembers = [] } = useFamilyMembers()
  const complete = useCompletePrepItem()
  const snooze = useSnoozePrepItem()
  const downvote = useDownvotePrepItem()
  const { notifications, unreadCount, markRead, clearAll } = useNotifications()
  const { data: conflicts = [] } = useWeekConflicts()
  const [selected, setSelected] = useState<PrepItem | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<PrepFilterKey>('all')
  const [sourceFilter, setSourceFilter] = useState<PrepSourceKey>('all')

  const { data: gmailHealth } = useQuery({
    queryKey: ['actions-hub-gmail-health'],
    queryFn: async () => {
      const { data: status } = await supabase
        .from('google_connection_status')
        .select('gmail_scan_enabled, health_status, reauthorization_required, last_sync_error, last_sync_at')
      return summarizeGmailHealth(status ?? [])
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  const filteredPrepItems = useMemo(() => {
    const typeMatch = PREP_FILTERS.find(f => f.key === typeFilter)?.match ?? (() => true)
    const sourceMatch = PREP_SOURCE_FILTERS.find(f => f.key === sourceFilter)?.match ?? (() => true)
    return prepItems.filter(item => typeMatch(item) && sourceMatch(item))
  }, [prepItems, typeFilter, sourceFilter])

  // Conflicts/policy_conflict rows reference a decision that still needs to be made elsewhere
  // (Heads Up section) — everything else in `notifications` is inherently FYI/audit history.
  const needsAttentionNotifications = useMemo(
    () => notifications.filter(n => !n.read && (n.type === 'conflict' || n.type === 'policy_conflict')),
    [notifications],
  )
  const activityLogNotifications = useMemo(
    () => notifications.filter(n => !(!n.read && (n.type === 'conflict' || n.type === 'policy_conflict'))),
    [notifications],
  )

  const suggestions = useMemo(() => {
    const nowTs = now.getTime()
    const overdue = prepItems.filter(item => item.due_by && +new Date(item.due_by) - nowTs < 0).length
    const dueSoon = prepItems.filter(item => {
      if (!item.due_by) return false
      const diff = +new Date(item.due_by) - nowTs
      return diff >= 0 && diff < 48 * 60 * 60 * 1000
    }).length
    const billingQueue = prepItems.filter(item => getPrepCategoryConfig(item).key === 'bills_payments').length
    return [
      overdue > 0 ? `${overdue} overdue` : null,
      `${dueSoon} due soon`,
      `${billingQueue} billing items`,
      `${conflicts.length} heads up`,
      `${unreadCount} unread activity`,
    ].filter((s): s is string => s !== null)
  }, [prepItems, unreadCount, now, conflicts.length])

  async function run(action: 'complete' | 'snooze' | 'downvote', id: string) {
    setActingId(id)
    setActionError(null)
    try {
      if (action === 'complete') await complete(id)
      if (action === 'snooze') await snooze(id)
      if (action === 'downvote') await downvote(id)
      if (selected?.id === id) setSelected(null)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Casa could not update this action.')
    } finally {
      setActingId(null)
    }
  }

  function launchCreate(item: PrepItem, kind: 'event' | 'reminder') {
    const prompt = buildAiDraftPrompt({
      kind,
      title: item.event_title ?? item.description,
      details: item.description,
      dueBy: item.due_by,
    })
    document.dispatchEvent(new CustomEvent('open-ai-chat', { detail: { prompt, autoSend: true } }))
  }

  return (
    <div className="h-full overflow-y-auto touch-pan-y max-w-7xl mx-auto p-4 sm:p-6 pb-28 lg:pb-6">
      <Link to="/" className="inline-flex items-center gap-1 text-body-sm text-casa-muted hover:text-casa-navy mb-4">
        <ChevronLeft size={16} /> Home
      </Link>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="rounded-[1.2rem] border border-casa-border bg-casa-surface px-4 py-3.5 shadow-card flex-1 min-w-[320px]">
          <h1 className="font-display text-display-sm text-casa-navy">Action &amp; Activity Hub</h1>
          <p className="text-body-sm text-casa-muted mt-1">Process prep quickly, keep context visible, and stay ahead of what automation is doing.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {suggestions.map((text) => (
              <span key={text} className="text-caption font-semibold rounded-full bg-casa-gold/15 text-casa-navy px-2 py-0.5 border border-casa-gold/25">{text}</span>
            ))}
          </div>
        </div>
        <Link
          to="/settings/google"
          className={cn(
            'rounded-[1.2rem] border px-4 py-3.5 min-w-[180px] shadow-card flex flex-col justify-center transition',
            gmailHealth?.status === 'error'
              ? 'border-casa-error/50 bg-casa-error/5 hover:bg-casa-error/10'
              : gmailHealth?.status === 'stale'
                ? 'border-casa-warning/50 bg-casa-warning/5 hover:bg-casa-warning/10'
                : 'border-casa-border bg-casa-surface hover:bg-casa-bg',
          )}
        >
          <p className="text-caption text-casa-muted">Email connection</p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <Chip size="sm" tone={gmailHealth?.tone ?? 'neutral'}>
              {gmailHealth?.label ?? 'Checking…'}
            </Chip>
          </div>
          <p className="text-caption text-casa-muted mt-1.5">
            {gmailHealth?.lastSyncAt ? `Synced ${formatDistanceToNow(new Date(gmailHealth.lastSyncAt), { addSuffix: true })}` : (gmailHealth?.status === 'off' ? 'Not connected' : 'Waiting for sync')}
          </p>
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-5">
        <section id="recent-activity" className="rounded-[1.2rem] border border-casa-border bg-casa-surface p-4 scroll-mt-6 shadow-card">
          <div className="flex items-center justify-between mb-3.5">
            <h2 className="font-display text-heading text-casa-navy flex items-center gap-2"><ClipboardList size={16} className="text-casa-gold" /> Prep &amp; Action</h2>
            <span className="text-caption font-semibold rounded-full bg-casa-gold/20 text-casa-gold px-2 py-0.5">
              {typeFilter === 'all' && sourceFilter === 'all' ? prepItems.length : `${filteredPrepItems.length}/${prepItems.length}`}
            </span>
          </div>
          <p className="text-caption text-casa-muted mb-3 -mt-1.5">
            Priority: <span className="inline-block w-2 h-2 rounded-full bg-casa-error align-middle mr-1" />Critical ·{' '}
            <span className="inline-block w-2 h-2 rounded-full bg-casa-warning align-middle mr-1 ml-1" />Important ·{' '}
            <span className="inline-block w-2 h-2 rounded-full bg-casa-border align-middle mr-1 ml-1" />Standard
          </p>
          <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter by type">
            {PREP_FILTERS.map((f) => {
              const count = f.key === 'all' ? prepItems.length : prepItems.filter(f.match).length
              if (f.key !== 'all' && count === 0) return null
              const active = typeFilter === f.key
              return (
                <Button
                  key={f.key}
                  variant="ghost"
                  onClick={() => setTypeFilter(f.key)}
                  aria-pressed={active}
                  className={cn(
                    'h-7 px-2.5 rounded-full border text-caption font-semibold transition-colors',
                    active
                      ? 'bg-casa-navy text-white border-casa-navy'
                      : 'bg-white border-casa-border text-casa-muted hover:bg-casa-bg hover:text-casa-text',
                  )}
                >
                  {f.label} <span className={cn('ml-1', active ? 'text-white/70' : 'text-casa-muted/70')}>{count}</span>
                </Button>
              )
            })}
          </div>
          <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter by source">
            {PREP_SOURCE_FILTERS.map((f) => {
              const count = f.key === 'all' ? prepItems.length : prepItems.filter(f.match).length
              if (f.key !== 'all' && count === 0) return null
              const active = sourceFilter === f.key
              return (
                <Button
                  key={f.key}
                  variant="ghost"
                  onClick={() => setSourceFilter(f.key)}
                  aria-pressed={active}
                  className={cn(
                    'h-7 px-2.5 rounded-full border text-caption font-semibold transition-colors',
                    active
                      ? 'bg-casa-gold text-casa-navy border-casa-gold'
                      : 'bg-white border-casa-border text-casa-muted hover:bg-casa-bg hover:text-casa-text',
                  )}
                >
                  {f.label} <span className={cn('ml-1', active ? 'text-casa-navy/70' : 'text-casa-muted/70')}>{count}</span>
                </Button>
              )
            })}
          </div>
          {actionError && (
            <p role="alert" className="mb-3 text-body-sm text-casa-error">
              {actionError} The action is still active.
            </p>
          )}
          <div className="space-y-2.5 pr-1 xl:max-h-[70vh] xl:overflow-y-auto">
            {filteredPrepItems.map((item) => {
              const src = sourceBadge(item)
              const SourceIcon = src.icon
              const category = getPrepCategoryConfig(item)
              const CategoryIcon = category.icon
              const busy = actingId === item.id
              const due = dueBadge(item, now)
              const priority = priorityVisual(item.priority)
              return (
                <div
                  key={item.id}
                  className={cn(
                    'rounded-card border border-casa-border bg-casa-bg px-3.5 py-3 transition-opacity',
                    busy && 'opacity-60',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <Button variant="ghost" className="min-w-0 flex-1 h-auto min-h-0 p-0 text-left hover:bg-transparent" contentClassName="w-full justify-start" onClick={() => setSelected(item)}>
                      <p className="text-body-sm font-semibold text-casa-text leading-snug line-clamp-2">{item.description}</p>
                    </Button>
                    {due && (
                      <span className={cn('text-body-sm font-semibold whitespace-nowrap shrink-0 mt-0.5', dueTextClass(due.tone))}>
                        {due.label}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                    <span role="img" aria-label={src.label} title={src.label} className="inline-flex shrink-0 text-casa-navy">
                      <SourceIcon size={14} strokeWidth={2.2} />
                    </span>
                    <span role="img" aria-label={category.label} title={category.label} className="inline-flex shrink-0 text-casa-navy">
                      <CategoryIcon size={14} strokeWidth={2.2} />
                    </span>
                    {priority.chip && (
                      <span
                        role="img"
                        aria-label={priority.chip.label}
                        title={priority.chip.label}
                        className={cn('inline-flex shrink-0', priority.chip.tone === 'danger' ? 'text-casa-error' : 'text-casa-warning')}
                      >
                        <AlertTriangle size={14} strokeWidth={2.2} />
                      </span>
                    )}
                    <PrepItemAssigneeChip item={item} familyMembers={familyMembers} onNudge={() => setSelected(item)} />
                    <span className="text-body-sm text-casa-muted truncate">{item.event_title || 'Casa Tabor'}</span>
                  </div>
                  <div className="mt-2.5 pt-2.5 border-t border-casa-border/70 flex items-center gap-1.5 flex-wrap">
                    <Button variant="ghost" onClick={() => run('complete', item.id)} className="h-9 px-3 rounded-[0.8rem] bg-casa-navy text-white text-body-sm font-semibold hover:brightness-105 transition" title="Done">
                      Done
                    </Button>
                    <Button variant="ghost" onClick={() => run('snooze', item.id)} className="h-9 px-3 rounded-[0.8rem] border border-casa-border bg-white text-casa-muted text-body-sm font-semibold hover:bg-casa-bg hover:text-casa-text transition-colors" title="Snooze">
                      Snooze
                    </Button>
                    {item.event_id ? (
                      <Button variant="ghost" onClick={() => openEventDetails(item.event_id!)} className="h-9 px-3 rounded-[0.8rem] border border-casa-gold/40 bg-white text-casa-navy text-body-sm font-semibold hover:bg-casa-gold/10 transition-colors inline-flex items-center gap-1" title="View the linked calendar event">
                        <ExternalLink size={14} /> View event
                      </Button>
                    ) : (
                      <Button variant="ghost" onClick={() => launchCreate(item, 'event')} className="h-9 px-3 rounded-[0.8rem] border border-casa-gold/40 bg-white text-casa-navy text-body-sm font-semibold hover:bg-casa-gold/10 transition-colors inline-flex items-center gap-1" title="Create event draft">
                        <CalendarPlus size={14} /> Event
                      </Button>
                    )}
                    <Button variant="ghost" onClick={() => launchCreate(item, 'reminder')} className="h-9 px-3 rounded-[0.8rem] border border-casa-gold/40 bg-white text-casa-navy text-body-sm font-semibold hover:bg-casa-gold/10 transition-colors inline-flex items-center gap-1" title="Create reminder draft">
                      <BellPlus size={14} /> Reminder
                    </Button>
                    <Button variant="ghost" onClick={() => run('downvote', item.id)} className="ml-auto size-control rounded-button border border-casa-border bg-white text-casa-muted hover:text-red-500 hover:bg-red-50 transition-colors flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-casa-gold" title="Downvote" aria-label="Downvote">
                      <ThumbsDown size={15} />
                    </Button>
                  </div>
                </div>
              )
            })}
            {prepItems.length === 0 && <p className="text-body-sm text-casa-muted">No active prep items.</p>}
            {prepItems.length > 0 && filteredPrepItems.length === 0 && (
              <p className="text-body-sm text-casa-muted">No prep items match this filter.</p>
            )}
          </div>
        </section>

        <section className="rounded-[1.2rem] border border-casa-border bg-casa-surface p-4 shadow-card">
          <div className="flex items-center justify-between mb-3.5">
            <h2 className="font-display text-heading text-casa-navy flex items-center gap-2"><Bell size={16} className="text-casa-gold" /> Recent Activity</h2>
            <div className="flex items-center gap-2">
              <span className="text-caption font-semibold rounded-full bg-casa-gold/20 text-casa-gold px-2 py-0.5">{unreadCount}</span>
              {activityLogNotifications.length > 0 && (
                <Button variant="ghost" onClick={() => clearAll.mutate()} className="h-8 px-2.5 rounded-button border border-casa-border text-caption text-casa-muted hover:text-red-500 hover:bg-red-50 transition-colors">Clear all</Button>
              )}
            </div>
          </div>
          <div className="space-y-4 pr-1 xl:max-h-[70vh] xl:overflow-y-auto">
            {needsAttentionNotifications.length > 0 && (
              <div>
                <p className="text-caption font-semibold text-casa-error mb-2 flex items-center gap-1.5">
                  <AlertTriangle size={12} /> Needs Your Attention
                </p>
                <div className="space-y-2.5">
                  {needsAttentionNotifications.map((n) => {
                    const badge = eventDateBadge(n, now)
                    return (
                      <div key={n.id} className="border border-casa-error/45 bg-casa-error/5 rounded-[1rem] p-3.5">
                        <p className="text-body-sm leading-relaxed text-casa-text font-semibold">{n.body ?? n.title}</p>
                        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                          <span className="text-body-sm text-casa-muted">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</span>
                          <span className="text-body-sm text-casa-muted">•</span>
                          <span className="text-body-sm font-semibold px-1.5 py-0.5 rounded-full bg-casa-bg border border-casa-border text-casa-muted leading-none">{humanizeNotificationSource(n.source)}</span>
                          {badge && (
                            <span className={cn('text-body-sm font-semibold px-1.5 py-0.5 rounded-full border leading-none', badge.tone)}>
                              {badge.label}
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex items-center gap-3">
                          <Link to="#heads-up" className="text-body-sm font-semibold text-casa-navy hover:text-casa-gold">
                            View in Heads Up
                          </Link>
                          <Button variant="ghost" onClick={() => markRead.mutate(n.id)} className="text-body-sm font-semibold text-casa-navy hover:text-casa-gold">
                            Acknowledge
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            <div>
              {needsAttentionNotifications.length > 0 && (
                <p className="text-caption font-semibold text-casa-muted mb-2">Activity Log</p>
              )}
              <div className="space-y-2.5">
                {activityLogNotifications.map((n) => {
                  const badge = eventDateBadge(n, now)
                  return (
                  <div key={n.id} className={cn('border rounded-[1rem] p-3.5', n.read ? 'border-casa-border bg-casa-card' : 'border-casa-gold/45 bg-casa-gold/5')}>
                    <p className={cn('text-body-sm leading-relaxed', n.read ? 'text-casa-text' : 'text-casa-text font-semibold')}>{n.body ?? n.title}</p>
                    <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                      <span className="text-body-sm text-casa-muted">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</span>
                      <span className="text-body-sm text-casa-muted">•</span>
                      <span className="text-body-sm font-semibold px-1.5 py-0.5 rounded-full bg-casa-bg border border-casa-border text-casa-muted leading-none">{humanizeNotificationSource(n.source)}</span>
                      {badge && (
                        <span className={cn('text-body-sm font-semibold px-1.5 py-0.5 rounded-full border leading-none', badge.tone)}>
                          {badge.label}
                        </span>
                      )}
                    </div>
                    {!n.read && (
                      <Button variant="ghost" onClick={() => markRead.mutate(n.id)} className="mt-2 text-body-sm font-semibold text-casa-navy hover:text-casa-gold">
                        Mark read
                      </Button>
                    )}
                  </div>
                  )
                })}
                {notifications.length === 0 && <p className="text-body-sm text-casa-muted">No recent activity.</p>}
              </div>
            </div>
          </div>
        </section>
      </div>

      <section id="heads-up" className="mt-5 rounded-[1.2rem] border border-casa-border bg-casa-surface p-4 shadow-card scroll-mt-6">
        <div className="flex items-center justify-between mb-3.5">
          <h2 className="font-display text-heading text-casa-navy flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-500" />
            Heads Up
          </h2>
          <span className="text-caption font-semibold rounded-full bg-casa-gold/20 text-casa-gold px-2 py-0.5">
            {conflicts.length}
          </span>
        </div>
        {conflicts.length > 0 ? (
          <ConflictAlertsSection />
        ) : (
          <p className="text-body-sm text-casa-muted">No active heads up right now.</p>
        )}
      </section>

      <PrepItemDetailPanel item={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
