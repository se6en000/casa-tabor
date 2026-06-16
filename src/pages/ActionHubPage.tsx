import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, formatDistanceToNow } from 'date-fns'
import { ClipboardList, Bell, ChevronLeft, Mail, Bot, Moon, Check, ThumbsDown, CalendarPlus, BellPlus } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '../utils/cn'
import { supabase } from '../lib/supabase'
import { usePrepItems, useDismissPrepItem, useDownvotePrepItem, useSnoozePrepItem } from '../hooks/usePrepItems'
import { useNotifications } from '../hooks/useNotifications'
import type { PrepItem } from '../types'
import PrepItemDetailPanel from '../components/home/PrepItemDetailPanel'
import { useLiveClock } from '../hooks/useLiveClock'

function sourceBadge(item: PrepItem) {
  const source = item.source_type ?? 'calendar_ai'
  if (source === 'gmail') return { label: 'Email', icon: Mail, tone: 'text-purple-700 bg-purple-50 border-purple-200' }
  if (source === 'calendar_ai') return { label: 'Calendar', icon: Bot, tone: 'text-sky-700 bg-sky-50 border-sky-200' }
  return { label: 'System', icon: ClipboardList, tone: 'text-casa-muted bg-casa-bg border-casa-border' }
}

export default function ActionHubPage() {
  const now = useLiveClock(60_000)
  const { data: prepItems = [] } = usePrepItems()
  const dismiss = useDismissPrepItem()
  const snooze = useSnoozePrepItem()
  const downvote = useDownvotePrepItem()
  const { notifications, unreadCount, markRead, clearAll } = useNotifications()
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
      return {
        enabled: enabled.length,
        healthy,
        recentProcessed: (processed ?? []).length,
      }
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  const suggestions = useMemo(() => {
    const nowTs = now.getTime()
    const dueSoon = prepItems.filter(item => item.due_by && +new Date(item.due_by) - nowTs < 48 * 60 * 60 * 1000).length
    return [
      `${dueSoon} due soon`,
      `${unreadCount} unread activity`,
      `${gmailHealth?.recentProcessed ?? 0} messages processed in 6h`,
    ]
  }, [prepItems, unreadCount, gmailHealth?.recentProcessed, now])

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
    <div className="max-w-7xl mx-auto p-6">
      <Link to="/" className="inline-flex items-center gap-1 text-body-sm text-casa-muted hover:text-casa-navy mb-4">
        <ChevronLeft size={16} /> Home
      </Link>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-display-md text-casa-navy">Action &amp; Activity Hub</h1>
          <p className="text-body-sm text-casa-muted mt-1">Process prep items quickly, review context, and monitor what automation is doing.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestions.map((text) => (
              <span key={text} className="text-caption rounded-full bg-casa-gold/15 text-casa-navy px-2 py-0.5">{text}</span>
            ))}
          </div>
        </div>
        <div className="rounded-card border border-casa-border bg-casa-surface px-4 py-3">
          <p className="text-caption text-casa-muted">Scanner health</p>
          <p className="text-body-sm font-semibold text-casa-text">{gmailHealth?.healthy ?? 0}/{gmailHealth?.enabled ?? 0} healthy</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-5">
        <section className="rounded-card border border-casa-border bg-casa-surface p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-casa-navy flex items-center gap-2"><ClipboardList size={16} className="text-casa-gold" /> Prep &amp; Action</h2>
            <span className="text-caption rounded-full bg-casa-gold/20 text-casa-gold px-2 py-0.5">{prepItems.length}</span>
          </div>
          <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
            {prepItems.map((item) => {
              const src = sourceBadge(item)
              const SourceIcon = src.icon
              const busy = actingId === item.id
              return (
                <div key={item.id} className={cn('border border-casa-border rounded-xl p-3', busy && 'opacity-60')}>
                  <button className="text-left w-full" onClick={() => setSelected(item)}>
                    <p className="text-body-sm text-casa-text leading-relaxed">{item.description}</p>
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border', src.tone)}>
                        <SourceIcon size={10} /> {src.label}
                      </span>
                      {item.due_by && (
                        <span className="text-caption text-casa-muted">
                          Due {format(new Date(item.due_by), 'EEE h:mm a')}
                        </span>
                      )}
                    </div>
                  </button>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button onClick={() => run('snooze', item.id)} className="text-caption px-2 py-1 rounded-md border border-casa-border text-casa-muted hover:text-casa-text"><Moon size={11} className="inline mr-1" />Snooze</button>
                    <button onClick={() => run('dismiss', item.id)} className="text-caption px-2 py-1 rounded-md border border-casa-border text-casa-muted hover:text-casa-text"><Check size={11} className="inline mr-1" />Dismiss</button>
                    <button onClick={() => run('downvote', item.id)} className="text-caption px-2 py-1 rounded-md border border-red-200 text-red-600 hover:bg-red-50"><ThumbsDown size={11} className="inline mr-1" />Downvote</button>
                    <button onClick={() => launchCreate(item, 'event')} className="text-caption px-2 py-1 rounded-md border border-casa-gold/40 text-casa-navy hover:bg-casa-gold/10"><CalendarPlus size={11} className="inline mr-1" />Event</button>
                    <button onClick={() => launchCreate(item, 'reminder')} className="text-caption px-2 py-1 rounded-md border border-casa-gold/40 text-casa-navy hover:bg-casa-gold/10"><BellPlus size={11} className="inline mr-1" />Reminder</button>
                  </div>
                </div>
              )
            })}
            {prepItems.length === 0 && <p className="text-caption text-casa-muted">No active prep items.</p>}
          </div>
        </section>

        <section className="rounded-card border border-casa-border bg-casa-surface p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-casa-navy flex items-center gap-2"><Bell size={16} className="text-casa-gold" /> Recent Activity</h2>
            <div className="flex items-center gap-2">
              <span className="text-caption rounded-full bg-casa-gold/20 text-casa-gold px-2 py-0.5">{unreadCount}</span>
              {notifications.length > 0 && (
                <button onClick={() => clearAll.mutate()} className="text-caption text-casa-muted hover:text-red-500">Clear all</button>
              )}
            </div>
          </div>
          <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
            {notifications.map((n) => (
              <div key={n.id} className={cn('border rounded-xl p-3', n.read ? 'border-casa-border' : 'border-casa-gold/50 bg-casa-gold/5')}>
                <p className={cn('text-body-sm leading-relaxed', n.read ? 'text-casa-muted' : 'text-casa-text font-medium')}>{n.body ?? n.title}</p>
                <p className="text-caption text-casa-muted mt-1">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })} · {n.source ?? 'system'}</p>
                {!n.read && (
                  <button onClick={() => markRead.mutate(n.id)} className="mt-2 text-caption text-casa-navy hover:text-casa-gold">
                    Mark read
                  </button>
                )}
              </div>
            ))}
            {notifications.length === 0 && <p className="text-caption text-casa-muted">No recent activity.</p>}
          </div>
        </section>
      </div>

      <PrepItemDetailPanel item={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
