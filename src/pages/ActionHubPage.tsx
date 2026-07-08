import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, formatDistanceToNow } from 'date-fns'
import { ClipboardList, Bell, ChevronLeft, Mail, Bot, ThumbsDown, CalendarPlus, BellPlus, AlertTriangle } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '../utils/cn'
import { supabase } from '../lib/supabase'
import { usePrepItems, useDismissPrepItem, useDownvotePrepItem, useSnoozePrepItem } from '../hooks/usePrepItems'
import { useNotifications } from '../hooks/useNotifications'
import { useWeekConflicts } from '../hooks/useConflicts'
import type { PrepItem } from '../types'
import PrepItemDetailPanel from '../components/home/PrepItemDetailPanel'
import { useLiveClock } from '../hooks/useLiveClock'
import ConflictAlertsSection from '../components/shared/ConflictAlertsSection'

function sourceBadge(item: PrepItem) {
  const source = item.source_type ?? 'calendar_ai'
  if (source === 'gmail') return { label: 'Email', icon: Mail, tone: 'text-purple-700 bg-purple-50 border-purple-200' }
  if (source === 'calendar_ai') return { label: 'Calendar', icon: Bot, tone: 'text-sky-700 bg-sky-50 border-sky-200' }
  return { label: 'System', icon: ClipboardList, tone: 'text-casa-muted bg-casa-bg border-casa-border' }
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

export default function ActionHubPage() {
  const now = useLiveClock(60_000)
  const { data: prepItems = [] } = usePrepItems()
  const dismiss = useDismissPrepItem()
  const snooze = useSnoozePrepItem()
  const downvote = useDownvotePrepItem()
  const { notifications, unreadCount, markRead, clearAll } = useNotifications()
  const { data: conflicts = [] } = useWeekConflicts()
  const [selected, setSelected] = useState<PrepItem | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)

  const { data: gmailHealth } = useQuery({
    queryKey: ['actions-hub-gmail-health'],
    queryFn: async () => {
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
      const [{ data: status }, { data: processed }] = await Promise.all([
        supabase.from('google_connection_status').select('gmail_scan_enabled, last_sync_error, last_sync_at'),
        supabase.from('gmail_processed_messages').select('id, processed_at').gte('processed_at', sixHoursAgo),
      ])
      const enabled = (status ?? []).filter((s: { gmail_scan_enabled?: boolean }) => !!s.gmail_scan_enabled)
      const healthy = enabled.filter((s: { last_sync_error?: string | null }) => !s.last_sync_error).length
      const lastSyncAt = (status ?? [])
        .map((s: { last_sync_at?: string | null }) => s.last_sync_at)
        .filter((v): v is string => !!v)
        .sort()
        .at(-1) ?? null
      return {
        enabled: enabled.length,
        healthy,
        recentProcessed: (processed ?? []).length,
        lastSyncAt,
      }
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  const suggestions = useMemo(() => {
    const nowTs = now.getTime()
    const dueSoon = prepItems.filter(item => item.due_by && +new Date(item.due_by) - nowTs < 48 * 60 * 60 * 1000).length
    const billingQueue = prepItems.filter(item => item.type === 'billing' || item.type === 'payment').length
    const cancellations = prepItems.filter(item => item.type === 'cancellation').length
    return [
      `${dueSoon} due soon`,
      `${billingQueue} billing items`,
      `${cancellations} cancellations`,
      `${conflicts.length} heads up`,
      `${unreadCount} unread activity`,
      `${gmailHealth?.recentProcessed ?? 0} messages processed in 6h`,
    ]
  }, [prepItems, unreadCount, gmailHealth?.recentProcessed, now, conflicts.length])

  async function run(action: 'dismiss' | 'snooze' | 'downvote', id: string) {
    setActingId(id)
    try {
      if (action === 'dismiss') await dismiss(id)
      if (action === 'snooze') await snooze(id)
      if (action === 'downvote') await downvote(id)
      if (selected?.id === id) setSelected(null)
    } finally {
      setActingId(null)
    }
  }

  function launchCreate(item: PrepItem, kind: 'event' | 'reminder') {
    const prompt = kind === 'event'
      ? `Create a calendar event from this prep/action item as a draft and ask me to confirm before saving.\n\nTitle: ${item.event_title ?? item.description}\nDetails: ${item.description}\nDue by: ${item.due_by ?? 'unknown'}`
      : `Create a reminder from this prep/action item as a draft and ask me to confirm before saving.\n\nTitle: ${item.event_title ?? item.description}\nDetails: ${item.description}\nDue by: ${item.due_by ?? 'unknown'}`
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
        <div className="rounded-[1.2rem] border border-casa-border bg-casa-surface px-4 py-3.5 min-w-[180px] shadow-card">
          <p className="text-caption text-casa-muted">Scanner health</p>
          <p className="text-body-sm font-semibold text-casa-text mt-0.5">{gmailHealth?.healthy ?? 0}/{gmailHealth?.enabled ?? 0} healthy</p>
          <p className="text-caption text-casa-muted mt-1">
            {gmailHealth?.lastSyncAt ? `Synced ${formatDistanceToNow(new Date(gmailHealth.lastSyncAt), { addSuffix: true })}` : 'Waiting for sync'}
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-5">
        <section id="recent-activity" className="rounded-[1.2rem] border border-casa-border bg-casa-surface p-4 scroll-mt-6 shadow-card">
          <div className="flex items-center justify-between mb-3.5">
            <h2 className="font-display text-heading text-casa-navy flex items-center gap-2"><ClipboardList size={16} className="text-casa-gold" /> Prep &amp; Action</h2>
            <span className="text-caption font-semibold rounded-full bg-casa-gold/20 text-casa-gold px-2 py-0.5">{prepItems.length}</span>
          </div>
          <div className="space-y-2.5 pr-1 xl:max-h-[70vh] xl:overflow-y-auto">
            {prepItems.map((item) => {
              const src = sourceBadge(item)
              const SourceIcon = src.icon
              const busy = actingId === item.id
              const due = dueBadge(item, now)
              return (
                <div
                  key={item.id}
                  className={cn(
                    'rounded-[1rem] border border-casa-gold/35 bg-casa-gold/8 px-3.5 py-3',
                    'hover:shadow-card-hover transition-all',
                    busy && 'opacity-60',
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <button className="w-full text-left" onClick={() => setSelected(item)}>
                      <p className="text-body-sm font-semibold text-casa-text leading-snug line-clamp-2">{item.description}</p>
                    </button>
                    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                      <span className={cn('inline-flex items-center gap-1 text-body-sm font-semibold px-2 py-0.5 rounded-full border leading-none', src.tone)}>
                        <SourceIcon size={10} /> {src.label}
                      </span>
                      {due && (
                        <span className={cn('text-body-sm font-semibold px-2 py-0.5 rounded-full border leading-none', due.tone)}>
                          {due.label}
                        </span>
                      )}
                      <span className="text-body-sm text-casa-muted truncate">{item.event_title || 'Casa Tabor'}</span>
                    </div>
                    <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                      <button onClick={() => run('dismiss', item.id)} className="h-9 px-3 rounded-[0.8rem] bg-casa-navy text-white text-body-sm font-semibold hover:brightness-105 transition" title="Done">
                        Done
                      </button>
                      <button onClick={() => run('snooze', item.id)} className="h-9 px-3 rounded-[0.8rem] border border-casa-border bg-white text-casa-muted text-body-sm font-semibold hover:bg-casa-bg hover:text-casa-text transition-colors" title="Snooze">
                        Snooze
                      </button>
                      <button onClick={() => run('downvote', item.id)} className="h-9 w-9 rounded-[0.8rem] border border-casa-border bg-white text-casa-muted hover:text-red-500 hover:bg-red-50 transition-colors flex items-center justify-center" title="Downvote">
                        <ThumbsDown size={15} />
                      </button>
                      <button onClick={() => launchCreate(item, 'event')} className="h-9 px-3 rounded-[0.8rem] border border-casa-gold/40 bg-white text-casa-navy text-body-sm font-semibold hover:bg-casa-gold/10 transition-colors inline-flex items-center gap-1" title="Create event draft">
                        <CalendarPlus size={14} /> Event
                      </button>
                      <button onClick={() => launchCreate(item, 'reminder')} className="h-9 px-3 rounded-[0.8rem] border border-casa-gold/40 bg-white text-casa-navy text-body-sm font-semibold hover:bg-casa-gold/10 transition-colors inline-flex items-center gap-1" title="Create reminder draft">
                        <BellPlus size={14} /> Reminder
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
            {prepItems.length === 0 && <p className="text-body-sm text-casa-muted">No active prep items.</p>}
          </div>
        </section>

        <section className="rounded-[1.2rem] border border-casa-border bg-casa-surface p-4 shadow-card">
          <div className="flex items-center justify-between mb-3.5">
            <h2 className="font-display text-heading text-casa-navy flex items-center gap-2"><Bell size={16} className="text-casa-gold" /> Recent Activity</h2>
            <div className="flex items-center gap-2">
              <span className="text-caption font-semibold rounded-full bg-casa-gold/20 text-casa-gold px-2 py-0.5">{unreadCount}</span>
              {notifications.length > 0 && (
                <button onClick={() => clearAll.mutate()} className="h-8 px-2.5 rounded-button border border-casa-border text-caption text-casa-muted hover:text-red-500 hover:bg-red-50 transition-colors">Clear all</button>
              )}
            </div>
          </div>
          <div className="space-y-2.5 pr-1 xl:max-h-[70vh] xl:overflow-y-auto">
            {notifications.map((n) => (
              <div key={n.id} className={cn('border rounded-[1rem] p-3.5', n.read ? 'border-casa-border bg-casa-card' : 'border-casa-gold/45 bg-casa-gold/5')}>
                <p className={cn('text-body-sm leading-relaxed', n.read ? 'text-casa-text' : 'text-casa-text font-semibold')}>{n.body ?? n.title}</p>
                <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                  <span className="text-body-sm text-casa-muted">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</span>
                  <span className="text-body-sm text-casa-muted">•</span>
                  <span className="text-body-sm font-semibold px-1.5 py-0.5 rounded-full bg-casa-bg border border-casa-border text-casa-muted leading-none">{n.source ?? 'system'}</span>
                </div>
                {!n.read && (
                  <button onClick={() => markRead.mutate(n.id)} className="mt-2 text-body-sm font-semibold text-casa-navy hover:text-casa-gold">
                    Mark read
                  </button>
                )}
              </div>
            ))}
            {notifications.length === 0 && <p className="text-body-sm text-casa-muted">No recent activity.</p>}
          </div>
        </section>
      </div>

      <section className="mt-5 rounded-[1.2rem] border border-casa-border bg-casa-surface p-4 shadow-card">
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
