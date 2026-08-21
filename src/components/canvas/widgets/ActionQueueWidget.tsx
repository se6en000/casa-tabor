import { useState, useMemo } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Check,
  ThumbsDown,
  Sparkles,
  Clock,
  Car,
  ChevronDown,
  Calendar,
  CalendarPlus,
  CheckSquare,
  Square,
  Moon,
  Sun,
  ExternalLink,
  CreditCard,
  FileText,
  Package,
  Layers,
  Loader2,
  Tag,
  Mail,
  RefreshCw,
  CloudOff,
  ShieldAlert,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button, IconButton, StatusDot } from '../../ui'
import { cn } from '../../../utils/cn'
import type { PrepItem, Conflict, FamilyMember } from '../../../types'
import type { SnoozeDuration } from '../../../utils/snoozeDuration'
import type { DriverAvailability } from '../../../hooks/useTurboCanvasPresenter'
import { sourceBadge } from '../../../utils/prepSourceBadge'
import {
  detectSuggestedEvent,
  detectSuggestedActionBundle,
  type SuggestedEventPlan,
  type SuggestedActionBundle,
} from '../../../utils/actionInspectionSynthesis'
import { clusterPrepItems, buildGmailWebUrl, type PrepItemCluster } from '../../../utils/prepItemClusters'
import { splitActionableAndTransitItems } from '../../../utils/needsYouFeed'
import { computeDueDateBadge } from '../../../utils/calendarEventMatcher'
import { useCreateSuggestedEvent } from '../../../hooks/useCreateSuggestedEvent'
import { useAppStore } from '../../../stores/appStore'
import { useGoogleSyncTriage, formatSyncError } from '../../../hooks/useGoogleSyncTriage'

interface ActionQueueWidgetProps {
  activeConflicts: Conflict[]
  activePrep: PrepItem[]
  pushedPrep: PrepItem[]
  familyMembers?: FamilyMember[]
  getDriverAvailabilities: (conflict: Conflict) => DriverAvailability[]
  handleResolveConflict: (conflict: Conflict, resolution: string) => void
  handleCompletePrep: (item: PrepItem) => void
  handleDownvotePrep: (item: PrepItem) => void
  handleSnoozePrep: (id: string, period: SnoozeDuration) => void
  handlePushPrep: (item: PrepItem, bucket: 'later_today' | 'tomorrow' | 'weekend') => void
  handleRestorePushedPrep: (itemId: string) => void
  handleBatchAutoTriage: () => void
  openCopilotForConflict: (conflict: Conflict) => void
}

function extractAmount(text?: string | null): string | null {
  if (!text) return null
  const match = text.match(/\$[\d,]+(\.\d{2})?/)
  return match ? match[0] : null
}

function resolveButtonConfig(item: PrepItem): {
  label: string
  Icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>
} {
  const text = (item.description || item.event_title || '').toLowerCase()
  const amount = extractAmount(item.description || item.event_title)

  if (amount || item.type === 'payment' || text.includes('payment') || text.includes('invoice') || text.includes('bill') || text.includes('premium')) {
    return {
      label: amount ? `Mark Paid (${amount})` : 'Mark Paid & Done',
      Icon: CreditCard,
    }
  }

  if (item.type === 'forms' || text.includes('waiver') || text.includes('release') || text.includes('consent form') || text.includes('permission slip') || text.includes('aktivate')) {
    return {
      label: 'Mark Signed & Done',
      Icon: FileText,
    }
  }

  if (item.type === 'delivery' || text.includes('delivered') || text.includes('delivery') || text.includes('package') || text.includes('shipped')) {
    return {
      label: 'Mark Received',
      Icon: Package,
    }
  }

  return {
    label: 'Mark Done',
    Icon: Check,
  }
}

function shortTitle(raw?: string | null, maxLen = 22): string {
  if (!raw) return 'Event'
  const stripped = raw.includes(' | ') ? raw.split(' | ').slice(1).join(' | ') : raw
  return stripped.length > maxLen ? `${stripped.slice(0, maxLen - 1)}…` : stripped
}

export default function ActionQueueWidget({
  activeConflicts,
  activePrep,
  pushedPrep: _pushedPrep,
  familyMembers = [],
  getDriverAvailabilities,
  handleResolveConflict,
  handleCompletePrep,
  handleDownvotePrep,
  handleSnoozePrep,
  handlePushPrep,
  handleRestorePushedPrep: _handleRestorePushedPrep,
  handleBatchAutoTriage,
  openCopilotForConflict,
}: ActionQueueWidgetProps) {
  const { openActionInSidecar, selectedSidecarActionId, sidecarTab } = useAppStore()
  const [openSnoozeId, setOpenSnoozeId] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [optimisticDismissedIds, setOptimisticDismissedIds] = useState<Set<string>>(new Set())
  const [spotlightItemId, setSpotlightItemId] = useState<string | null>(null)
  const [eventAddedItemIds, setEventAddedItemIds] = useState<Set<string>>(new Set())

  const [selectedBundleActionIds, setSelectedBundleActionIds] = useState<Record<string, string[]>>({})

  const { createSuggestedEvent, createSuggestedActionBundle, isCreating } = useCreateSuggestedEvent()

  const getSelectedActionIds = (bundle: SuggestedActionBundle) => {
    if (selectedBundleActionIds[bundle.bundleId]) {
      return selectedBundleActionIds[bundle.bundleId]
    }
    return bundle.actions.filter((a) => a.defaultSelected).map((a) => a.id)
  }

  const toggleBundleAction = (bundle: SuggestedActionBundle, actionId: string) => {
    const current = getSelectedActionIds(bundle)
    const next = current.includes(actionId)
      ? current.filter((id) => id !== actionId)
      : [...current, actionId]
    setSelectedBundleActionIds((prev) => ({ ...prev, [bundle.bundleId]: next }))
  }

  const handle1TapAddBundle = async (item: PrepItem, bundle: SuggestedActionBundle) => {
    const selectedIds = getSelectedActionIds(bundle)
    if (selectedIds.length === 0) return
    const res = await createSuggestedActionBundle(bundle, selectedIds, item)
    if (res.success) {
      setEventAddedItemIds((prev) => new Set(prev).add(item.id))
      setTimeout(() => {
        handleCompletePrep(item)
      }, 850)
    }
  }

  // Instant 0ms client-side filter
  const visibleConflicts = useMemo(
    () => activeConflicts.filter((c) => !optimisticDismissedIds.has(`conflict-${c.id}`)),
    [activeConflicts, optimisticDismissedIds]
  )

  const visiblePrep = useMemo(
    () => activePrep.filter((p) => !optimisticDismissedIds.has(`prep-${p.id}`)),
    [activePrep, optimisticDismissedIds]
  )

  // Separate pure Action Items from passive In-Transit Deliveries
  const { actionableItems } = useMemo(
    () => splitActionableAndTransitItems(visiblePrep),
    [visiblePrep]
  )

  // Smart Thread-Clustered Prep Items (Pure Action Items only)
  const clusteredPrep = useMemo(() => clusterPrepItems(actionableItems), [actionableItems])

  const { heroCluster, microClusters } = useMemo(() => {
    if (clusteredPrep.length === 0) {
      return { heroCluster: null, microClusters: [] }
    }
    const spotlightIndex = spotlightItemId
      ? clusteredPrep.findIndex((c) => c.itemIds.includes(spotlightItemId))
      : -1

    if (spotlightIndex >= 0) {
      const hero = clusteredPrep[spotlightIndex]
      const micro = clusteredPrep.filter((_, idx) => idx !== spotlightIndex)
      return { heroCluster: hero, microClusters: micro }
    }

    return { heroCluster: clusteredPrep[0], microClusters: clusteredPrep.slice(1) }
  }, [clusteredPrep, spotlightItemId])

  const heroItem = heroCluster?.item ?? null

  const { failedJobs, retrySync, keepLocalOnly } = useGoogleSyncTriage()

  const totalUrgent = visibleConflicts.length + failedJobs.length
  const totalTasks = clusteredPrep.length
  const totalActionable = totalUrgent + totalTasks

  const onInstantCompleteCluster = (cluster: PrepItemCluster) => {
    setOptimisticDismissedIds((prev) => {
      const next = new Set(prev)
      for (const id of cluster.itemIds) next.add(`prep-${id}`)
      return next
    })
    setOpenSnoozeId(null)
    setOpenMenuId(null)
    for (const id of cluster.itemIds) {
      const found = visiblePrep.find((p) => p.id === id) || cluster.item
      handleCompletePrep(found)
    }
  }

  const onInstantSnoozeCluster = (cluster: PrepItemCluster, period: SnoozeDuration) => {
    setOptimisticDismissedIds((prev) => {
      const next = new Set(prev)
      for (const id of cluster.itemIds) next.add(`prep-${id}`)
      return next
    })
    setOpenSnoozeId(null)
    setOpenMenuId(null)
    for (const id of cluster.itemIds) {
      handleSnoozePrep(id, period)
    }
  }

  const onInstantDownvoteCluster = (cluster: PrepItemCluster) => {
    setOptimisticDismissedIds((prev) => {
      const next = new Set(prev)
      for (const id of cluster.itemIds) next.add(`prep-${id}`)
      return next
    })
    setOpenMenuId(null)
    for (const id of cluster.itemIds) {
      const found = visiblePrep.find((p) => p.id === id) || cluster.item
      handleDownvotePrep(found)
    }
  }

  const onInstantPushCluster = (cluster: PrepItemCluster, bucket: 'later_today' | 'tomorrow' | 'weekend') => {
    setOptimisticDismissedIds((prev) => {
      const next = new Set(prev)
      for (const id of cluster.itemIds) next.add(`prep-${id}`)
      return next
    })
    setOpenSnoozeId(null)
    setOpenMenuId(null)
    for (const id of cluster.itemIds) {
      const found = visiblePrep.find((p) => p.id === id) || cluster.item
      handlePushPrep(found, bucket)
    }
  }

  const onInstantResolveConflict = (conflict: Conflict, resolution: string) => {
    setOptimisticDismissedIds((prev) => new Set(prev).add(`conflict-${conflict.id}`))
    handleResolveConflict(conflict, resolution)
  }

  const handle1TapAddCalendar = async (item: PrepItem, plan: SuggestedEventPlan) => {
    const res = await createSuggestedEvent(plan, item)
    if (res.success) {
      setEventAddedItemIds((prev) => new Set(prev).add(item.id))
      setTimeout(() => {
        handleCompletePrep(item)
      }, 700)
    }
  }

  return (
    <div className="w-full h-full flex flex-col bg-casa-surface border border-casa-border/80 shadow-card rounded-3xl p-5 sm:p-6 overflow-hidden min-h-0 relative">
      {/* ── Global Click-Away Invisible Backdrop for menus ── */}
      {openMenuId && (
        <div
          className="fixed inset-0 z-30 bg-transparent cursor-default"
          onClick={() => setOpenMenuId(null)}
          aria-hidden="true"
        />
      )}

      {/* ── BroadSheet Header ── */}
      <div className="flex items-start justify-between pb-3.5 border-b border-casa-border/60 shrink-0">
        <div>
          <h2 className="font-display text-display-sm font-bold text-casa-navy leading-none tracking-tight">
            Executive Action Queue
          </h2>
          <p className="text-caption text-casa-muted mt-1 font-medium">
            Universal Done &amp; Snooze Engine
          </p>
        </div>

        <div className="flex items-center gap-2">
          {totalUrgent > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleBatchAutoTriage}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-casa-gold/15 hover:bg-casa-gold/25 text-casa-navy text-caption font-bold border border-casa-gold/30 transition-all shadow-xs min-h-[36px]"
              title="Automatically assign available drivers and optimize logistics"
            >
              <Sparkles size={12} className="text-casa-gold" />
              <span>Auto-Triage</span>
            </Button>
          )}

          <span
            className={cn(
              'text-caption font-mono font-bold px-3 py-1 rounded-full border tracking-wide',
              totalActionable > 0
                ? 'bg-casa-accent-subtle text-casa-top-pick-band border-casa-accent-subtle-border'
                : 'bg-emerald-100/90 text-emerald-950 border-emerald-300/80'
            )}
          >
            {totalActionable} Actionable
          </span>
        </div>
      </div>

      {/* ── Scrollable Broadsheet Flow ── */}
      <div className="flex-1 overflow-y-auto pr-0.5 space-y-5 min-h-0 touch-pan-y overscroll-contain pt-3 pb-4">
        {/* ── SECTION 0: GOOGLE CALENDAR SYNC TRIAGE ── */}
        {failedJobs.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
              <h3 className="text-caption font-bold uppercase tracking-wider text-rose-700">
                Google Calendar Sync Triage ({failedJobs.length})
              </h3>
            </div>

            <AnimatePresence mode="popLayout">
              {failedJobs.map((job) => {
                const title = job.event?.title || 'Calendar Event'
                const isRetrying = retrySync.isPending && retrySync.variables === job.event_id
                const isKeepingLocal = keepLocalOnly.isPending && keepLocalOnly.variables === job.event_id
                const errorInfo = formatSyncError(job.last_error)

                return (
                  <motion.div
                    key={job.id}
                    layout
                    initial={{ opacity: 0, y: 12, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 90, scale: 0.94 }}
                    className="p-4 sm:p-5 rounded-2xl bg-rose-50/90 border border-rose-300 shadow-2xs space-y-3.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-2.5 py-0.5 text-2xs font-bold text-rose-800 border border-rose-300">
                            <ShieldAlert size={12} className="text-rose-600 shrink-0" />
                            <span>SYNC DESYNCED</span>
                          </span>
                          <span className="text-body-sm font-bold text-casa-navy truncate">
                            {title}
                          </span>
                        </div>
                        <p className="text-caption font-semibold text-rose-950">
                          {errorInfo.title}
                        </p>
                        <p className="text-caption text-rose-900/80 line-clamp-2 leading-relaxed">
                          {errorInfo.detail}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 pt-1">
                      <Button
                        size="md"
                        variant="primary"
                        disabled={isRetrying || isKeepingLocal}
                        onClick={() => retrySync.mutate(job.event_id)}
                        className="bg-rose-600 hover:bg-rose-700 text-white min-h-[48px] px-4 font-bold rounded-xl shadow-xs transition-all flex items-center gap-2"
                        leadingIcon={<RefreshCw size={15} className={isRetrying ? 'animate-spin' : ''} />}
                      >
                        {isRetrying ? 'Retrying Push…' : 'Retry Push'}
                      </Button>
                      <Button
                        size="md"
                        variant="secondary"
                        disabled={isRetrying || isKeepingLocal}
                        onClick={() => keepLocalOnly.mutate(job.event_id)}
                        className="border-rose-300 bg-white hover:bg-rose-100/70 text-casa-navy min-h-[48px] px-4 font-semibold rounded-xl transition-all flex items-center gap-2"
                        leadingIcon={<CloudOff size={15} />}
                      >
                        {isKeepingLocal ? 'Saving…' : 'Keep Casa Only'}
                      </Button>
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}

        {/* ── SECTION 1: URGENT LOGISTICS & CONFLICTS ── */}
        {visibleConflicts.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <h3 className="text-caption font-bold uppercase tracking-wider text-casa-muted">
                Urgent Logistics Triage ({visibleConflicts.length})
              </h3>
            </div>

            <AnimatePresence mode="popLayout">
              {visibleConflicts.map((c) => {
                const isDriveTime = c.conflict_type === 'drive_time'
                const isOverlap = c.conflict_type === 'double_book' || c.conflict_type === 'overlap'
                const availabilities = getDriverAvailabilities(c)
                const recommended = availabilities.find((a) => a.isAvailable) || availabilities[0]

                return (
                  <motion.div
                    key={c.id}
                    layout
                    initial={{ opacity: 0, y: 12, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{
                      opacity: 0,
                      x: 90,
                      scale: 0.94,
                      transition: { duration: 0.22, ease: [0.32, 0.72, 0, 1] },
                    }}
                    transition={{
                      layout: { duration: 0.28, ease: [0.25, 1, 0.5, 1] },
                    }}
                    className="p-4.5 rounded-2xl bg-amber-50/80 border border-amber-300/90 shadow-2xs relative"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="inline-flex items-center gap-1 text-caption font-bold px-2 py-0.5 rounded-full bg-amber-200/90 text-amber-950 uppercase tracking-wide">
                            {isDriveTime ? (
                              <>
                                <Car size={12} />
                                Ride Needed
                              </>
                            ) : isOverlap ? (
                              <>
                                <AlertTriangle size={12} />
                                Schedule Conflict
                              </>
                            ) : (
                              <>
                                <Sparkles size={12} />
                                Attention Needed
                              </>
                            )}
                          </span>
                        </div>

                        <p className="text-body-sm font-bold text-casa-navy leading-snug">
                          {c.description || 'Household logistics need coordination'}
                        </p>
                      </div>

                      <IconButton
                        variant="ghost"
                        size="sm"
                        title="Solve with Copilot"
                        aria-label="Solve with Copilot"
                        onClick={() => openCopilotForConflict(c)}
                        className="p-2 rounded-xl text-casa-gold hover:bg-casa-gold/20 min-h-[40px] min-w-[40px] shrink-0 flex items-center justify-center"
                        icon={<Sparkles size={16} />}
                      />
                    </div>

                    {/* ── Driver & Resolution Controls ── */}
                    <div className="mt-3 pt-3 border-t border-amber-200/70">
                      {isDriveTime ? (
                        <div className="space-y-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            {recommended && (
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() =>
                                  onInstantResolveConflict(
                                    c,
                                    `Assigned ${recommended.member.name} as driver`
                                  )
                                }
                                className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-caption font-bold shadow-xs transition-all min-h-[44px] flex items-center gap-2"
                              >
                                <Car size={14} />
                                <span>Assign {recommended.member.name} (Recommended)</span>
                              </Button>
                            )}

                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openCopilotForConflict(c)}
                              className="px-3.5 py-2 rounded-xl text-amber-900 hover:bg-amber-200/60 text-caption font-semibold transition-all min-h-[44px] flex items-center gap-1.5"
                            >
                              <Sparkles size={13} className="text-amber-700" />
                              <span>Ask Copilot</span>
                            </Button>
                          </div>

                          <div className="flex items-center gap-1.5 pt-1">
                            <span className="text-caption text-casa-muted font-medium mr-1">
                              Or assign:
                            </span>
                            <div className="flex items-center gap-2 flex-wrap">
                              {availabilities.map(({ member, isAvailable }) => (
                                <Button
                                  key={member.id}
                                  size="sm"
                                  variant="secondary"
                                  onClick={() =>
                                    onInstantResolveConflict(
                                      c,
                                      `Assigned ${member.name} as driver`
                                    )
                                  }
                                  title={`${member.name}: ${isAvailable ? 'Free' : 'Has conflict'}`}
                                  className={cn(
                                    'px-3 py-1.5 rounded-xl text-caption font-semibold transition-all min-h-[40px] flex items-center gap-1.5',
                                    isAvailable
                                      ? 'bg-casa-surface border-casa-border hover:border-casa-navy text-casa-navy'
                                      : 'bg-casa-surface/60 border-casa-border/50 text-casa-muted opacity-80'
                                  )}
                                >
                                  <StatusDot
                                    variant={isAvailable ? 'active' : 'warning'}
                                    size="sm"
                                    pulse={false}
                                  />
                                  <span>{member.name}</span>
                                </Button>
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : isOverlap ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() =>
                              onInstantResolveConflict(c, 'Split transport: 2 drivers assigned')
                            }
                            className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-caption font-bold shadow-xs transition-all min-h-[44px] flex items-center gap-1.5"
                          >
                            <Car size={13} />
                            <span>Assign 2nd Driver</span>
                          </Button>

                          {c.event_a && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() =>
                                onInstantResolveConflict(c, `Kept: ${c.event_a?.title || 'Event A'}`)
                              }
                              className="px-3 py-2 rounded-xl bg-casa-surface border border-casa-border hover:border-casa-navy text-casa-navy text-caption font-semibold transition-all min-h-[44px]"
                            >
                              Prioritize {shortTitle(c.event_a.title, 14)}
                            </Button>
                          )}

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openCopilotForConflict(c)}
                            className="px-3 py-2 rounded-xl text-amber-900 hover:bg-amber-200/60 text-caption font-semibold transition-all min-h-[44px] flex items-center gap-1.5"
                          >
                            <Sparkles size={13} className="text-amber-700" />
                            <span>Reschedule</span>
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => onInstantResolveConflict(c, 'Resolved')}
                          className="px-3.5 py-2 rounded-xl bg-amber-500 text-white hover:bg-amber-600 text-caption font-bold shadow-xs transition-all min-h-[44px] flex items-center gap-1.5"
                        >
                          <Check size={13} />
                          <span>Acknowledge & Clear</span>
                        </Button>
                      )}
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}

        {/* ── SECTION 2: HERO ACTION FOCUS ── */}
        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {heroCluster && heroItem && (
              (() => {
                const heroBadge = sourceBadge(heroItem)
                const HeroBadgeIcon = heroBadge.icon
                const heroAmount = extractAmount(heroItem.description || heroItem.event_title)
                const heroActionBundle = detectSuggestedActionBundle(heroItem)
                const heroSuggestedEvent = detectSuggestedEvent(heroItem)
                const selectedHeroActionIds = heroActionBundle ? getSelectedActionIds(heroActionBundle) : []
                const { label: heroDoneLabel, Icon: HeroDoneIcon } = resolveButtonConfig(heroItem)
                const isHeroSnoozeOpen = openSnoozeId === heroItem.id
                const isHeroMenuOpen = openMenuId === heroItem.id
                const isEventAdded = eventAddedItemIds.has(heroItem.id)

                return (
                  <motion.div
                    key={heroCluster.itemIds.join('-')}
                    layout="position"
                    initial={{ opacity: 0, y: 12, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{
                      opacity: 0,
                      x: -24,
                      scale: 0.94,
                      transition: { duration: 0.22, ease: [0.32, 0.72, 0, 1] },
                    }}
                    transition={{
                      layout: { duration: 0.28, ease: [0.25, 1, 0.5, 1] },
                    }}
                    className={cn(
                      'p-4.5 sm:p-5 rounded-2xl transition-all flex flex-col gap-3.5 relative overflow-hidden',
                      selectedSidecarActionId === heroItem.id && sidecarTab === 'action'
                        ? 'bg-casa-gold/15 border-2 border-casa-gold ring-2 ring-casa-gold/30'
                        : 'bg-casa-surface-subtle/70 border border-casa-border/80 hover:border-casa-gold/60'
                    )}
                  >
                    {/* ── Top Context & Category Strip ── */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1 text-caption font-semibold px-2.5 py-0.5 rounded-full bg-casa-accent-subtle text-casa-top-pick-band border border-casa-accent-subtle-border tracking-wide">
                          <HeroBadgeIcon size={11} className="text-casa-gold shrink-0" />
                          <span>{heroBadge.label}</span>
                        </span>

                        {heroCluster.relatedCount > 0 && (
                          <span className="inline-flex items-center gap-1 text-caption font-semibold px-2 py-0.5 rounded-full bg-sky-100 text-sky-900 border border-sky-200">
                            <Layers size={10} className="text-sky-700" />
                            <span>{heroCluster.relatedCount + 1} updates</span>
                          </span>
                        )}

                        {heroItem.is_user_labeled && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-100 text-purple-900 text-caption font-semibold border border-purple-200">
                            <Tag size={10} className="text-purple-700" />
                            <span>Casa Labeled</span>
                          </span>
                        )}

                        <span className="inline-flex items-center gap-1 text-caption font-semibold px-2 py-0.5 rounded-full bg-casa-gold/15 text-casa-top-pick-band border border-casa-gold/30">
                          <Sparkles size={10} className="text-casa-gold" />
                          <span>Priority Focus</span>
                        </span>

                        {(heroItem.source_type === 'gmail' || heroItem.source_ref?.startsWith('gmail:')) && (
                          <a
                            href={buildGmailWebUrl(heroItem, null, familyMembers)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-3xs font-bold text-red-900 bg-red-50 hover:bg-red-100 border border-red-200 px-2 py-0.5 rounded-full transition-colors no-underline min-h-[26px]"
                            title="Open email directly in Gmail"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Mail size={10} className="text-red-600 shrink-0" />
                            <span>Gmail</span>
                            <ExternalLink size={8} className="text-red-500 shrink-0" />
                          </a>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {(() => {
                          const badge = computeDueDateBadge(heroItem.due_by)
                          return (
                            <span className={badge.className}>
                              {badge.label}
                            </span>
                          )
                        })()}

                        <div className="relative">
                          <IconButton
                            variant="ghost"
                            size="sm"
                            aria-label="Inspect in sidecar"
                            title="Inspect in sidecar"
                            data-sidecar-trigger="true"
                            data-sidecar-loadable="true"
                            onClick={(e) => {
                              e.stopPropagation()
                              openActionInSidecar(heroItem.id)
                            }}
                            className="text-casa-muted hover:text-casa-navy transition-colors min-h-[36px] min-w-[36px]"
                            icon={<ExternalLink size={14} />}
                          />

                          {/* Overflow / Downvote Menu */}
                          {isHeroMenuOpen && (
                            <div className="absolute right-0 top-full mt-1 w-48 bg-casa-surface rounded-xl border border-casa-border shadow-modal p-1.5 z-40 flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-150">
                              <Button
                                variant="ghost"
                                size="sm"
                                align="start"
                                onClick={() => onInstantDownvoteCluster(heroCluster)}
                                className="w-full text-caption text-casa-error hover:bg-rose-50 transition-colors font-medium min-h-[40px]"
                                leadingIcon={<ThumbsDown size={12} />}
                              >
                                <span>Mark Not Relevant</span>
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* ── Synthesized Content Body ── */}
                    <div
                      role="button"
                      tabIndex={0}
                      data-action-card="true"
                      data-sidecar-loadable="true"
                      data-action-id={heroItem.id}
                      onClick={() => openActionInSidecar(heroItem.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          openActionInSidecar(heroItem.id)
                        }
                      }}
                      className="min-w-0 flex flex-col gap-1 cursor-pointer group"
                    >
                      <h4 className="font-body text-body sm:text-body-lg font-bold text-casa-navy group-hover:text-casa-gold-hover leading-snug transition-colors">
                        {heroItem.description || heroItem.event_title || 'Prep Item'}
                      </h4>
                      {heroAmount && (
                        <span className="font-mono text-title-sm font-bold text-casa-navy mt-0.5 inline-flex items-center gap-1.5 text-casa-gold-hover">
                          {heroAmount}
                        </span>
                      )}
                      <div className="flex items-center gap-1 text-caption text-casa-gold font-medium mt-0.5 opacity-80 group-hover:opacity-100 transition-opacity">
                        <span>Tap to view full thread details</span>
                        <span>›</span>
                      </div>
                    </div>

                    {/* ── Compound Multi-Action Bundle / Proactive Suggestions ── */}
                    {heroActionBundle && heroActionBundle.actions.length > 0 ? (
                      <div className="p-3 sm:p-3.5 rounded-xl bg-amber-50/75 border border-amber-200/90 flex flex-col gap-2.5 shadow-2xs">
                        <div className="flex items-center justify-between gap-2 border-b border-amber-200/60 pb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-5 h-5 rounded-md bg-amber-500/15 text-amber-900 flex items-center justify-center font-bold shrink-0">
                              <Sparkles size={12} className="text-amber-700" />
                            </div>
                            <span className="text-caption font-bold text-amber-950 uppercase tracking-wider block leading-none">
                              Suggested Plan ({heroActionBundle.actions.length})
                            </span>
                          </div>

                          <span className="text-3xs font-semibold px-2 py-0.5 rounded-full bg-amber-200/70 text-amber-900 shrink-0">
                            {selectedHeroActionIds.length} of {heroActionBundle.actions.length} Selected
                          </span>
                        </div>

                        {/* List of Actions */}
                        <div className="space-y-1.5">
                          {heroActionBundle.actions.map((act) => {
                            const isSelected = selectedHeroActionIds.includes(act.id)
                            const isReminder = act.type === 'reminder'
                            const isLink = act.type === 'link'

                            return (
                              <div
                                key={act.id}
                                onClick={() => {
                                  if (!isLink) toggleBundleAction(heroActionBundle, act.id)
                                }}
                                className={cn(
                                  'p-2.5 rounded-lg border transition-all flex items-start justify-between gap-2 text-left',
                                  isLink
                                    ? 'bg-casa-surface border-casa-border/70 shadow-2xs'
                                    : (isSelected
                                      ? 'bg-casa-surface border-amber-400 shadow-2xs cursor-pointer'
                                      : 'bg-casa-surface/60 border-casa-border/60 opacity-65 hover:opacity-90 cursor-pointer')
                                )}
                              >
                                <div className="flex items-start gap-2 min-w-0 flex-1">
                                  {!isLink ? (
                                    <button
                                      type="button"
                                      aria-label={`Toggle ${act.title}`}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        toggleBundleAction(heroActionBundle, act.id)
                                      }}
                                      className={cn(
                                        'min-w-[32px] min-h-[32px] -m-1 flex items-center justify-center rounded transition-colors shrink-0',
                                        isSelected ? 'text-amber-600' : 'text-casa-muted hover:text-casa-navy'
                                      )}
                                    >
                                      {isSelected ? (
                                        <CheckSquare size={16} className="text-amber-600 shrink-0" />
                                      ) : (
                                        <Square size={16} className="text-casa-muted/60 shrink-0" />
                                      )}
                                    </button>
                                  ) : (
                                    <div className="w-4 h-4 flex items-center justify-center text-purple-700 shrink-0 mt-0.5">
                                      <ExternalLink size={13} />
                                    </div>
                                  )}

                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                                      <span
                                        className={cn(
                                          'text-3xs font-bold uppercase tracking-wider px-1.5 py-0.2 rounded border',
                                          isReminder
                                            ? 'bg-sky-100 text-sky-900 border-sky-200'
                                            : isLink
                                            ? 'bg-purple-100 text-purple-900 border-purple-200'
                                            : 'bg-amber-100 text-amber-950 border-amber-300'
                                        )}
                                      >
                                        {act.badgeLabel || (isReminder ? 'PREP TASK' : 'CALENDAR EVENT')}
                                      </span>

                                      <span className="text-caption font-bold text-casa-navy">
                                        {act.displayDate}
                                      </span>
                                    </div>

                                    <h5 className="text-body-sm font-bold text-casa-navy leading-snug">
                                      {act.title}
                                    </h5>
                                  </div>
                                </div>

                                {isLink && act.url && (
                                  <a
                                    href={act.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="px-2 py-1 rounded bg-casa-surface border border-casa-border hover:border-casa-navy text-casa-navy text-caption font-bold shadow-2xs inline-flex items-center gap-1 shrink-0 no-underline min-h-[32px]"
                                  >
                                    <span>Portal</span>
                                    <ExternalLink size={10} className="text-casa-muted" />
                                  </a>
                                )}
                              </div>
                            )
                          })}
                        </div>

                        {/* Multi-Action Execution Bar */}
                        <div className="pt-1 border-t border-amber-200/60 flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-3xs text-amber-900/80 font-medium">
                            Adds synchronized schedule blocks
                          </span>

                          {isEventAdded ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-100 text-emerald-900 text-caption font-bold border border-emerald-300 shadow-2xs">
                              <Check size={13} className="text-emerald-700" />
                              <span>Added to Schedule</span>
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              variant="primary"
                              disabled={isCreating || selectedHeroActionIds.length === 0}
                              onClick={() => handle1TapAddBundle(heroItem, heroActionBundle)}
                              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-caption font-bold shadow-xs transition-all min-h-[40px] flex items-center gap-1.5 shrink-0"
                            >
                              {isCreating ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <CalendarPlus size={13} />
                              )}
                              <span>
                                {selectedHeroActionIds.length === heroActionBundle.actions.length
                                  ? `+ Add Both (${selectedHeroActionIds.length})`
                                  : selectedHeroActionIds.length > 0
                                  ? `+ Add Selected (${selectedHeroActionIds.length})`
                                  : 'Select an Action'}
                              </span>
                            </Button>
                          )}
                        </div>
                      </div>
                    ) : heroSuggestedEvent ? (
                      <div className="p-3 rounded-xl bg-amber-50/90 border border-amber-200 flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2 min-w-0">
                          <Calendar size={15} className="text-amber-700 shrink-0" />
                          <span className="text-caption font-bold text-amber-950 truncate">
                            Suggests: {heroSuggestedEvent.title} ({heroSuggestedEvent.displayDate})
                          </span>
                        </div>

                        {isEventAdded ? (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-emerald-100 text-emerald-900 text-caption font-bold border border-emerald-200">
                            <Check size={13} className="text-emerald-700" />
                            <span>Added</span>
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={isCreating}
                            onClick={() => handle1TapAddCalendar(heroItem, heroSuggestedEvent)}
                            className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-caption font-bold shadow-xs transition-all min-h-[40px] flex items-center gap-1.5 shrink-0"
                          >
                            {isCreating ? <Loader2 size={12} className="animate-spin" /> : <CalendarPlus size={13} />}
                            <span>+ Add to Calendar ({heroSuggestedEvent.displayDate})</span>
                          </Button>
                        )}
                      </div>
                    ) : null}

                    {/* ── Universal 2-Anchor Footer: [ Done ] vs [ Snooze ▾ ] ── */}
                    <div className="pt-3 border-t border-casa-border/50 flex items-center justify-between gap-2.5 flex-wrap">
                      {/* Primary Anchor 1: Contextual Action Button */}
                      <Button
                        size="sm"
                        variant="strong"
                        onClick={() => onInstantCompleteCluster(heroCluster)}
                        className="px-4 py-2 rounded-full min-h-[44px] text-body-sm font-bold shadow-xs flex items-center gap-2 shrink-0 hover:brightness-110"
                        leadingIcon={<HeroDoneIcon size={15} strokeWidth={2.5} className="text-emerald-400" />}
                      >
                        <span>{heroDoneLabel}</span>
                      </Button>

                      {/* Primary Anchor 2: Split Snooze Pill */}
                      <div className="inline-flex items-stretch rounded-full bg-casa-surface border border-casa-border hover:border-casa-gold transition-all shadow-xs shrink-0 max-w-full overflow-hidden">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onInstantSnoozeCluster(heroCluster, 'tomorrow')}
                          className="px-3.5 py-1.5 text-caption font-semibold text-casa-navy hover:text-casa-gold-hover transition-colors min-h-[44px] rounded-l-full rounded-r-none border-none flex items-center gap-1.5"
                          title="Snooze to tomorrow morning"
                          leadingIcon={<Clock size={13} className="text-casa-gold shrink-0" />}
                        >
                          <span>Snooze Tomorrow</span>
                        </Button>

                        <IconButton
                          size="sm"
                          variant="ghost"
                          onClick={() => setOpenSnoozeId(isHeroSnoozeOpen ? null : heroItem.id)}
                          aria-label="More snooze options"
                          title="More snooze options"
                          className="px-2.5 border-l border-casa-border/70 text-casa-muted hover:text-casa-navy hover:bg-casa-gold/10 transition-colors rounded-r-full rounded-l-none min-h-[44px] min-w-[34px] flex items-center justify-center shrink-0"
                          icon={
                            <ChevronDown
                              size={14}
                              className={cn('transition-transform duration-200', isHeroSnoozeOpen && 'rotate-180')}
                            />
                          }
                        />
                      </div>
                    </div>

                    {/* ── In-Flow Expandable Snooze Presets ── */}
                    <AnimatePresence>
                      {isHeroSnoozeOpen && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
                          className="overflow-hidden"
                        >
                          <div className="pt-2 mt-1 border-t border-dashed border-casa-border/60 grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              align="start"
                              onClick={() => onInstantSnoozeCluster(heroCluster, '3h')}
                              className="w-full px-3 py-1.5 rounded-xl bg-casa-surface hover:bg-casa-gold/15 border border-casa-border/70 text-caption text-casa-navy transition-colors font-medium min-h-[40px]"
                              leadingIcon={<Moon size={12} className="text-casa-gold" />}
                            >
                              <span className="flex-1 text-left text-caption font-semibold">Tonight (+3h)</span>
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              align="start"
                              onClick={() => onInstantSnoozeCluster(heroCluster, 'tomorrow')}
                              className="w-full px-3 py-1.5 rounded-xl bg-casa-surface hover:bg-casa-gold/15 border border-casa-border/70 text-caption text-casa-navy transition-colors font-medium min-h-[40px]"
                              leadingIcon={<Sun size={12} className="text-casa-gold" />}
                            >
                              <span className="flex-1 text-left text-caption font-semibold">Tomorrow (9 AM)</span>
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              align="start"
                              onClick={() => onInstantPushCluster(heroCluster, 'weekend')}
                              className="w-full px-3 py-1.5 rounded-xl bg-casa-surface hover:bg-casa-gold/15 border border-casa-border/70 text-caption text-casa-navy transition-colors font-medium min-h-[40px]"
                              leadingIcon={<Calendar size={12} className="text-casa-gold" />}
                            >
                              <span className="flex-1 text-left text-caption font-semibold">This Weekend</span>
                            </Button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )
              })()
            )}
          </AnimatePresence>

          {/* ── EDITORIAL MICRO-QUEUE: Subsequent Matters ── */}
          {microClusters.length > 0 && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between pb-1 border-b border-casa-border/50">
                <span className="text-caption font-bold uppercase tracking-wider text-casa-navy">
                  Queued Household Matters ({microClusters.length})
                </span>
                <span className="text-3xs text-casa-muted font-medium">
                  Tap row to focus
                </span>
              </div>

              <div className="divide-y divide-casa-border/30">
                {microClusters.map((cluster) => {
                  const item = cluster.item
                  const badge = sourceBadge(item)
                  const BadgeIcon = badge.icon
                  const amount = extractAmount(item.description || item.event_title)
                  const microActionBundle = detectSuggestedActionBundle(item)
                  const microSuggestedEvent = detectSuggestedEvent(item)
                  const isMicroEventAdded = eventAddedItemIds.has(item.id)

                  return (
                    <div
                      key={cluster.itemIds.join('-')}
                      role="button"
                      tabIndex={0}
                      data-tactile="true"
                      data-action-card="true"
                      data-sidecar-loadable="true"
                      data-action-id={item.id}
                      onClick={() => {
                        setSpotlightItemId(item.id)
                        openActionInSidecar(item.id)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setSpotlightItemId(item.id)
                          openActionInSidecar(item.id)
                        }
                      }}
                      className={cn(
                        'py-2.5 px-2 rounded-xl flex items-start justify-between gap-3 group cursor-pointer transition-all duration-150 min-h-[48px]',
                        selectedSidecarActionId === item.id && sidecarTab === 'action'
                          ? 'bg-casa-gold/15 shadow-2xs'
                          : 'hover:bg-casa-surface-subtle/80'
                      )}
                    >
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <IconButton
                          variant="secondary"
                          size="sm"
                          aria-label={`Mark ${item.description || item.event_title || 'item'} done`}
                          onClick={(e) => {
                            e.stopPropagation()
                            onInstantCompleteCluster(cluster)
                          }}
                          className="min-w-[38px] min-h-[38px] rounded-full border border-casa-border hover:border-casa-gold hover:bg-casa-bg flex items-center justify-center text-casa-muted hover:text-casa-gold shrink-0 transition-all shadow-2xs group-hover:border-casa-gold/60 mt-0.5"
                          icon={<Check size={14} strokeWidth={2.5} />}
                        />

                        <div className="min-w-0 flex-1 pt-0.5">
                          <div className="text-body-sm font-semibold text-casa-navy line-clamp-2 leading-snug break-words">
                            {item.description || item.event_title}
                          </div>
                          <div className="flex items-center gap-2 text-caption text-casa-muted mt-0.5 flex-wrap">
                            <span className="inline-flex items-center gap-1">
                              <BadgeIcon size={11} className="text-casa-gold shrink-0" />
                              <span>{badge.label}</span>
                            </span>

                            {cluster.relatedCount > 0 && (
                              <>
                                <span>·</span>
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full bg-sky-100 text-sky-900 text-3xs font-semibold border border-sky-200">
                                  <Layers size={9} className="text-sky-700" />
                                  <span>{cluster.relatedCount + 1} updates</span>
                                </span>
                              </>
                            )}

                            {microActionBundle && microActionBundle.actions.length > 1 ? (
                              <>
                                <span>·</span>
                                {isMicroEventAdded ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded-full bg-emerald-100 text-emerald-900 text-3xs font-semibold border border-emerald-200">
                                    <Check size={9} className="text-emerald-700" />
                                    <span>Plan Added ({microActionBundle.actions.length})</span>
                                  </span>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handle1TapAddBundle(item, microActionBundle)
                                    }}
                                    className="h-auto p-0 hover:bg-transparent"
                                  >
                                    <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded-full bg-amber-100/90 text-amber-900 text-3xs font-semibold border border-amber-300/80 hover:bg-amber-200 transition-colors">
                                      <Sparkles size={9} className="text-amber-700 shrink-0" />
                                      <span>+ Add Plan ({microActionBundle.actions.length} items)</span>
                                    </span>
                                  </Button>
                                )}
                              </>
                            ) : microSuggestedEvent ? (
                              <>
                                <span>·</span>
                                {isMicroEventAdded ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded-full bg-emerald-100 text-emerald-900 text-3xs font-semibold border border-emerald-200">
                                    <Check size={9} className="text-emerald-700" />
                                    <span>Added ({microSuggestedEvent.displayDate})</span>
                                  </span>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handle1TapAddCalendar(item, microSuggestedEvent)
                                    }}
                                    className="h-auto p-0 hover:bg-transparent"
                                  >
                                    <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded-full bg-amber-100/90 text-amber-900 text-3xs font-semibold border border-amber-300/80 hover:bg-amber-200 transition-colors">
                                      <CalendarPlus size={9} className="text-amber-700 shrink-0" />
                                      <span>+ Add to Calendar ({microSuggestedEvent.displayDate})</span>
                                    </span>
                                  </Button>
                                )}
                              </>
                            ) : null}

                            {item.due_by ? (
                              (() => {
                                const badge = computeDueDateBadge(item.due_by)
                                return (
                                  <>
                                    <span>·</span>
                                    <span
                                      className={cn(
                                        'font-medium',
                                        badge.tone === 'overdue' || badge.tone === 'today'
                                          ? 'text-casa-error'
                                          : badge.tone === 'tomorrow'
                                            ? 'text-casa-gold'
                                            : 'text-casa-navy'
                                      )}
                                    >
                                      {badge.label}
                                    </span>
                                  </>
                                )
                              })()
                            ) : null}

                            {(item.source_type === 'gmail' || item.source_ref?.startsWith('gmail:')) && (
                              <>
                                <span>·</span>
                                <a
                                  href={buildGmailWebUrl(item, null, familyMembers)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-3xs font-bold text-red-900 bg-red-50 hover:bg-red-100 border border-red-200 px-1.5 py-0.2 rounded-full transition-colors no-underline"
                                  title="Open original email in Gmail"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Mail size={9} className="text-red-600 shrink-0" />
                                  <span>Gmail</span>
                                </a>
                              </>
                            )}

                            {amount && (
                              <>
                                <span>·</span>
                                <span className="font-mono font-bold text-casa-navy">{amount}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0 pt-0.5">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={(e) => {
                            e.stopPropagation()
                            onInstantSnoozeCluster(cluster, 'tomorrow')
                          }}
                          className="px-3 py-1 text-caption font-semibold text-casa-navy hover:bg-casa-bg border border-casa-border/70 rounded-full min-h-[36px] flex items-center gap-1 shadow-2xs"
                          leadingIcon={<Clock size={11} className="text-casa-gold" />}
                        >
                          <span>Snooze</span>
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {clusteredPrep.length === 0 && visibleConflicts.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 text-center p-6 space-y-2">
              <CheckCircle2 size={36} className="text-emerald-600 mb-1" />
              <h4 className="font-display text-body-lg font-bold text-emerald-900">
                Household in Harmony
              </h4>
              <p className="text-caption text-emerald-700 max-w-xs">
                Zero pending conflicts or overdue preparation tasks.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
