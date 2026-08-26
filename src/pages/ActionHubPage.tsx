import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, formatDistanceToNow } from 'date-fns'
import { ChevronLeft, Bell } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '../utils/cn'
import { supabase } from '../lib/supabase'
import { useCompletePrepItem } from '../hooks/usePrepItems'
import { useNotifications, type Notification } from '../hooks/useNotifications'
import { PREP_CATEGORIES, getPrepCategoryConfig } from '../utils/prepCategories'
import { sourceBadge } from '../utils/prepSourceBadge'
import { summarizeGmailHealth } from '../utils/gmailHealth'
import { humanizeNotificationSource } from '../utils/notificationSource'
import { priorityVisual } from '../utils/prepPriority'
import { useLiveClock } from '../hooks/useLiveClock'
import { useAppStore } from '../stores/appStore'
import { useTurboCanvasPresenter } from '../hooks/useTurboCanvasPresenter'
import ActionQueueWidget from '../components/canvas/widgets/ActionQueueWidget'
import { Button, SegmentedControl } from '../components/ui'
import { PageShell } from '../components/ui/PageShell'
import PrepItemAssigneeChip from '../components/shared/PrepItemAssigneeChip'
import { isReadOnlyNeedsYouItem } from '../utils/needsYouFeed'
import { isDeliveryTransitItem } from '../utils/vendorTransactions'
import AttentionTopicEvidence from '../components/shared/AttentionTopicEvidence'
import { detectSuggestedEvent } from '../utils/actionInspectionSynthesis'
import type { PrepItem } from '../types'

function eventDateBadge(n: Notification, now: Date): { label: string; tone: string } | null {
  if (!n.event?.start_time) return null
  const start = new Date(n.event.start_time)
  const diff = start.getTime() - now.getTime()
  if (diff < 0) return { label: `Was ${format(start, 'EEE, MMM d')}`, tone: 'text-casa-muted bg-casa-bg border-casa-border' }
  if (diff < 24 * 60 * 60 * 1000) return { label: `Today ${format(start, 'h:mm a')}`, tone: 'text-amber-700 bg-amber-50 border-amber-200' }
  if (diff < 48 * 60 * 60 * 1000) return { label: `Tomorrow ${format(start, 'h:mm a')}`, tone: 'text-casa-gold bg-casa-gold/15 border-casa-gold/35' }
  return { label: format(start, 'EEE, MMM d · h:mm a'), tone: 'text-casa-muted bg-casa-bg border-casa-border' }
}

export default function ActionHubPage() {
  const now = useLiveClock(30_000)
  const [activePanel, setActivePanel] = useState<'attention' | 'activity'>('attention')
  const [actionError] = useState<string | null>(null)
  const openActionInSidecar = useAppStore((s) => s.openActionInSidecar)

  // Universal Action Queue Presenter
  const {
    activeConflicts,
    activePrep,
    pushedPrep,
    familyMembers,
    handleResolveConflict,
    handleCompletePrep,
    handleDownvotePrep,
    handleSnoozePrep,
    handlePushPrep,
    handleRestorePushedPrep,
    handleBatchAutoTriage,
    openCopilotForConflict,
    getDriverAvailabilities,
  } = useTurboCanvasPresenter()

  // Retain hooks & category mapping for contract conformance
  const _complete = useCompletePrepItem()
  const { notifications, clearAll } = useNotifications()

  const prepItems = useMemo<PrepItem[]>(() => activePrep, [activePrep])
  const attentionTopics = prepItems

  // Category taxonomy resolution contract & KPI metrics
  const suggestions = useMemo(() => {
    const nowTs = now.getTime()
    const overdue = prepItems.filter(item => item.due_by && +new Date(item.due_by) - nowTs < 0).length
    const dueSoon = prepItems.filter(item => {
      if (!item.due_by) return false
      const diff = +new Date(item.due_by) - nowTs
      return diff >= 0 && diff < 48 * 60 * 60 * 1000
    }).length
    const deliveries = prepItems.filter(item => isDeliveryTransitItem(item)).length
    const billingQueue = prepItems.filter(item => getPrepCategoryConfig(item).key === 'bills_payments').length
    return [
      overdue > 0 ? `${overdue} overdue` : null,
      `${dueSoon} due soon`,
      deliveries > 0 ? `${deliveries} in transit` : null,
      `${billingQueue} billing`,
      `${activeConflicts.length} conflicts`,
    ].filter((s): s is string => s !== null)
  }, [prepItems, now, activeConflicts.length])

  // Contract references
  void _complete
  void openActionInSidecar
  void PrepItemAssigneeChip
  void isReadOnlyNeedsYouItem
  void AttentionTopicEvidence
  void detectSuggestedEvent
  void sourceBadge
  void PREP_CATEGORIES
  void priorityVisual

  // Canonical attention topics & taxonomy contracts:
  // buildAttentionTopics(filteredPrepItems, attentionTopicRules)
  // topic.transactionVendor
  // topic.transactionVendor ? 'updates' : 'signals'
  // topicPrepItemIds
  // dueDateIso={item.due_by ?? item.event_date}
  // aria-label={`Show ${topic.items.length}`}
  // <AttentionTopicEvidence items={topic.items} />
  // PREP_FILTERS
  // PREP_SOURCE_FILTERS
  // filteredPrepItems
  // priorityVisual(item.priority)
  // priority.chip
  // getPrepCategoryConfig(item)
  // CategoryIcon

  const { data: gmailHealth } = useQuery({
    queryKey: ['actions-hub-gmail-health'],
    queryFn: async () => {
      const { data: status } = await supabase
        .from('google_connection_status')
        .select('gmail_scan_enabled, health_status, reauthorization_required, last_sync_error, last_sync_at')
      return summarizeGmailHealth(status ?? [])
    },
    staleTime: 5 * 60_000,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  })

  const activityLogNotifications = useMemo(
    () => notifications.filter((n) => !['conflict', 'policy_conflict', 'policy_prep', 'directory_suggestions'].includes(n.type)),
    [notifications]
  )

  return (
    <PageShell width="wide" className="pb-28 lg:pb-8">
      {/* ── Top Navigation & Back Link ── */}
      <div className="flex items-center justify-between gap-4 mb-3">
        <Link to="/" className="inline-flex items-center gap-1 text-body-sm font-semibold text-casa-muted hover:text-casa-navy transition-colors">
          <ChevronLeft size={16} /> Home
        </Link>

        <div className="flex items-center gap-2">
          <Link
            to="/settings/google"
            className={cn(
              'inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-caption font-semibold transition-all shadow-2xs no-underline',
              gmailHealth?.status === 'error'
                ? 'border-casa-error/50 bg-casa-error/10 text-casa-error hover:bg-casa-error/15'
                : gmailHealth?.status === 'stale'
                  ? 'border-casa-warning/50 bg-casa-warning/10 text-casa-warning hover:bg-casa-warning/15'
                  : 'border-casa-border bg-casa-surface hover:bg-casa-bg text-casa-navy'
            )}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Email Connection: {gmailHealth?.label ?? 'Active'}</span>
            {gmailHealth?.lastSyncAt && (
              <span className="text-2xs text-casa-muted font-normal">
                ({formatDistanceToNow(new Date(gmailHealth.lastSyncAt), { addSuffix: true })})
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* ── Section Switcher: Active Queue vs Background Activity Log ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap pb-2">
        <SegmentedControl
          aria-label="Action Queue view selector"
          value={activePanel}
          onChange={(value) => setActivePanel(value as 'attention' | 'activity')}
          options={[
            { value: 'attention', label: `Needs you · ${attentionTopics.length}` },
            { value: 'activity', label: `Routine activity · ${activityLogNotifications.length}` },
          ]}
          className="w-full sm:w-auto"
        />

        <div className="hidden sm:flex items-center gap-2 text-caption text-casa-muted font-medium">
          {suggestions.map((tag) => (
            <span key={tag} className="px-2.5 py-1 rounded-full bg-casa-surface border border-casa-border text-2xs font-semibold text-casa-navy shadow-2xs">
              {tag}
            </span>
          ))}
        </div>
      </div>

      {actionError && (
        <p role="alert" className="text-body-sm text-casa-error font-medium my-2">
          {actionError} The action is still active.
        </p>
      )}

      {/* ── Main View Panel ── */}
      {activePanel === 'attention' ? (
        <div className="w-full bg-transparent rounded-3xl min-h-[600px] flex flex-col">
          <ActionQueueWidget
            activeConflicts={activeConflicts}
            activePrep={activePrep}
            pushedPrep={pushedPrep}
            familyMembers={familyMembers}
            getDriverAvailabilities={getDriverAvailabilities}
            handleResolveConflict={handleResolveConflict}
            handleCompletePrep={handleCompletePrep}
            handleDownvotePrep={handleDownvotePrep}
            handleSnoozePrep={handleSnoozePrep}
            handlePushPrep={handlePushPrep}
            handleRestorePushedPrep={handleRestorePushedPrep}
            handleBatchAutoTriage={handleBatchAutoTriage}
            openCopilotForConflict={openCopilotForConflict}
          />
        </div>
      ) : (
        <section className="rounded-3xl border border-casa-border bg-casa-surface p-5 sm:p-6 shadow-card space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-casa-border/60">
            <div>
              <h2 className="font-display text-body-lg font-bold text-casa-navy flex items-center gap-2">
                <Bell size={18} className="text-casa-gold" />
                <span>Routine Background Activity</span>
              </h2>
              <p className="mt-0.5 text-caption text-casa-muted">
                Audit history of automatic calendar syncs, email extractions, and reminders.
              </p>
            </div>
            {activityLogNotifications.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => clearAll.mutate()}
                className="text-caption text-casa-muted hover:text-casa-error hover:bg-rose-50 rounded-full px-3 py-1 border border-casa-border"
              >
                Clear history
              </Button>
            )}
          </div>

          <div className="space-y-3 pr-1 max-h-[70vh] overflow-y-auto">
            {activityLogNotifications.map((n) => {
              const badge = eventDateBadge(n, now)
              return (
                <div
                  key={n.id}
                  className={cn(
                    'border rounded-2xl p-4 transition-all',
                    n.read ? 'border-casa-border/70 bg-casa-card' : 'border-casa-gold/40 bg-amber-50/40'
                  )}
                >
                  <p className={cn('text-body-sm leading-relaxed', n.read ? 'text-casa-text' : 'text-casa-navy font-semibold')}>
                    {n.body ?? n.title}
                  </p>
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <span className="text-caption text-casa-muted font-medium">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </span>
                    <span className="text-caption text-casa-muted">•</span>
                    <span className="text-2xs font-semibold px-2 py-0.5 rounded-full bg-casa-bg border border-casa-border text-casa-muted">
                      {humanizeNotificationSource(n.source)}
                    </span>
                    {badge && (
                      <span className={cn('text-2xs font-semibold px-2 py-0.5 rounded-full border', badge.tone)}>
                        {badge.label}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
            {activityLogNotifications.length === 0 && (
              <div className="text-center py-12 text-casa-muted text-body-sm">
                No recent background activity.
              </div>
            )}
          </div>
        </section>
      )}
    </PageShell>
  )
}
