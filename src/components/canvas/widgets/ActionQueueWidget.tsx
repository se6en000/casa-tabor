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
  ChevronUp,
  RotateCcw,
  Calendar,
  Moon,
  Sun,
  ExternalLink,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button, IconButton, StatusDot } from '../../ui'
import { cn } from '../../../utils/cn'
import type { PrepItem, Conflict, FamilyMember } from '../../../types'
import type { SnoozeDuration } from '../../../utils/snoozeDuration'
import type { DriverAvailability } from '../../../hooks/useTurboCanvasPresenter'
import { sourceBadge } from '../../../utils/prepSourceBadge'
import { detectSuggestedEvent } from '../../../utils/actionInspectionSynthesis'

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

function resolveButtonLabel(item: PrepItem): string {
  const text = (item.description || item.event_title || '').toLowerCase()
  if (extractAmount(item.description || item.event_title)) {
    return 'Mark Paid & Done'
  }
  if (text.includes('payment') || text.includes('invoice') || text.includes('premium')) {
    return 'Mark Paid & Done'
  }
  return 'Mark Done'
}

function shortTitle(raw?: string | null, maxLen = 22): string {
  if (!raw) return 'Event'
  const stripped = raw.includes(' | ') ? raw.split(' | ').slice(1).join(' | ') : raw
  return stripped.length > maxLen ? `${stripped.slice(0, maxLen - 1)}…` : stripped
}

import { useAppStore } from '../../../stores/appStore'

export default function ActionQueueWidget({
  activeConflicts,
  activePrep,
  pushedPrep,
  getDriverAvailabilities,
  handleResolveConflict,
  handleCompletePrep,
  handleDownvotePrep,
  handleSnoozePrep,
  handlePushPrep,
  handleRestorePushedPrep,
  handleBatchAutoTriage,
  openCopilotForConflict,
}: ActionQueueWidgetProps) {
  const { openActionInSidecar, selectedSidecarActionId, sidecarTab } = useAppStore()
  const [pushedExpanded, setPushedExpanded] = useState(false)
  const [openSnoozeId, setOpenSnoozeId] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [optimisticDismissedIds, setOptimisticDismissedIds] = useState<Set<string>>(new Set())
  const [spotlightItemId, setSpotlightItemId] = useState<string | null>(null)

  // Instant 0ms client-side filter
  const visibleConflicts = useMemo(
    () => activeConflicts.filter((c) => !optimisticDismissedIds.has(`conflict-${c.id}`)),
    [activeConflicts, optimisticDismissedIds]
  )

  const visiblePrep = useMemo(
    () => activePrep.filter((p) => !optimisticDismissedIds.has(`prep-${p.id}`)),
    [activePrep, optimisticDismissedIds]
  )

  const { heroItem, microItems } = useMemo(() => {
    if (visiblePrep.length === 0) {
      return { heroItem: null, microItems: [] }
    }
    const spotlightIndex = spotlightItemId
      ? visiblePrep.findIndex((p) => p.id === spotlightItemId)
      : -1

    if (spotlightIndex >= 0) {
      const hero = visiblePrep[spotlightIndex]
      const micro = visiblePrep.filter((_, idx) => idx !== spotlightIndex)
      return { heroItem: hero, microItems: micro }
    }

    return { heroItem: visiblePrep[0], microItems: visiblePrep.slice(1) }
  }, [visiblePrep, spotlightItemId])

  const totalUrgent = visibleConflicts.length
  const totalTasks = visiblePrep.length
  const totalActionable = totalUrgent + totalTasks

  const onInstantComplete = (item: PrepItem) => {
    setOptimisticDismissedIds((prev) => new Set(prev).add(`prep-${item.id}`))
    setOpenSnoozeId(null)
    setOpenMenuId(null)
    handleCompletePrep(item)
  }

  const onInstantSnooze = (item: PrepItem, period: SnoozeDuration) => {
    setOptimisticDismissedIds((prev) => new Set(prev).add(`prep-${item.id}`))
    setOpenSnoozeId(null)
    setOpenMenuId(null)
    handleSnoozePrep(item.id, period)
  }

  const onInstantDownvote = (item: PrepItem) => {
    setOptimisticDismissedIds((prev) => new Set(prev).add(`prep-${item.id}`))
    setOpenMenuId(null)
    handleDownvotePrep(item)
  }

  const onInstantPush = (item: PrepItem, bucket: 'later_today' | 'tomorrow' | 'weekend') => {
    setOptimisticDismissedIds((prev) => new Set(prev).add(`prep-${item.id}`))
    setOpenSnoozeId(null)
    setOpenMenuId(null)
    handlePushPrep(item, bucket)
  }

  const onInstantResolveConflict = (conflict: Conflict, resolution: string) => {
    setOptimisticDismissedIds((prev) => new Set(prev).add(`conflict-${conflict.id}`))
    handleResolveConflict(conflict, resolution)
  }

  return (
    <div className="w-full h-full flex flex-col bg-transparent overflow-hidden min-h-0 relative">
      {/* ── Global Click-Away Invisible Backdrop for menus ── */}
      {openMenuId && (
        <div
          className="fixed inset-0 z-30 bg-transparent cursor-default"
          onClick={() => setOpenMenuId(null)}
          aria-hidden="true"
        />
      )}

      {/* ── Widget Header: Matches Quiet Luxury Typography ── */}
      <div className="flex items-center justify-between pb-3 mb-1 shrink-0 px-0.5">
        <div>
          <h2 className="font-display text-display-sm font-bold text-casa-navy leading-none tracking-tight">
            Action Queue
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
              className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-casa-gold/15 hover:bg-casa-gold/25 text-casa-navy text-caption font-bold border border-casa-gold/30 transition-all shadow-xs min-h-[38px]"
              title="Automatically assign available drivers and optimize logistics"
            >
              <Sparkles size={13} className="text-casa-gold" />
              <span>Auto-Triage</span>
            </Button>
          )}

          <span
            className={cn(
              'text-caption font-mono font-bold px-3.5 py-1 rounded-full border shadow-2xs tracking-wide',
              totalActionable > 0
                ? 'bg-casa-accent-subtle text-casa-top-pick-band border-casa-accent-subtle-border'
                : 'bg-emerald-100/90 text-emerald-950 border-emerald-300/80'
            )}
          >
            {totalActionable} Actionable
          </span>
        </div>
      </div>

      {/* ── Scrollable Action Container ── */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-3.5 min-h-0 touch-pan-y overscroll-contain pb-6">
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
                    className="p-4.5 rounded-2xl bg-amber-50/80 border border-amber-300/90 shadow-card relative"
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
                        className="p-2.5 rounded-xl text-casa-gold hover:bg-casa-gold/20 min-h-[44px] min-w-[44px] shrink-0 flex items-center justify-center"
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
                                className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-caption font-bold shadow-sm transition-all min-h-[44px] flex items-center gap-2"
                              >
                                <Car size={15} />
                                <span>Assign {recommended.member.name} (Recommended)</span>
                              </Button>
                            )}

                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openCopilotForConflict(c)}
                              className="px-3.5 py-2 rounded-xl text-amber-900 hover:bg-amber-200/60 text-caption font-semibold transition-all min-h-[44px] flex items-center gap-1.5"
                            >
                              <Sparkles size={14} className="text-amber-700" />
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
                                    'px-3 py-2 rounded-xl text-caption font-semibold transition-all min-h-[44px] flex items-center gap-1.5',
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
                            className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-caption font-bold shadow-sm transition-all min-h-[44px] flex items-center gap-1.5"
                          >
                            <Car size={14} />
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
                            className="px-3.5 py-2 rounded-xl text-amber-900 hover:bg-amber-200/60 text-caption font-semibold transition-all min-h-[44px] flex items-center gap-1.5"
                          >
                            <Sparkles size={14} className="text-amber-700" />
                            <span>Reschedule with Copilot</span>
                          </Button>

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onInstantResolveConflict(c, 'Acknowledged overlap')}
                            className="px-3 py-2 rounded-xl text-casa-muted hover:text-casa-navy hover:bg-black/5 text-caption font-semibold transition-all min-h-[44px]"
                          >
                            Acknowledge
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => onInstantResolveConflict(c, 'Resolved')}
                          className="px-3.5 py-2 rounded-xl bg-amber-500 text-white hover:bg-amber-600 text-caption font-bold shadow-sm transition-all min-h-[44px] flex items-center gap-1.5"
                        >
                          <Check size={14} />
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

        {/* ── SECTION 2: PALM BEACH TRAVERTINE PLINTH & SPOTLIGHT FOCUS ── */}
        <div className="space-y-3.5">
          <AnimatePresence mode="popLayout">
            {heroItem && (
              (() => {
                const heroBadge = sourceBadge(heroItem)
                const HeroBadgeIcon = heroBadge.icon
                const heroAmount = extractAmount(heroItem.description || heroItem.event_title)
                const heroDoneLabel = resolveButtonLabel(heroItem)
                const isHeroSnoozeOpen = openSnoozeId === heroItem.id
                const isHeroMenuOpen = openMenuId === heroItem.id
                const heroSuggestedEvent = detectSuggestedEvent(heroItem)

                return (
                  <motion.div
                    key={heroItem.id}
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
                      'p-5 sm:p-6 rounded-3xl bg-casa-surface transition-all flex flex-col gap-4 relative border-2',
                      selectedSidecarActionId === heroItem.id && sidecarTab === 'action'
                        ? 'border-casa-gold shadow-card-hover'
                        : 'border-casa-gold/25 hover:border-casa-gold/60 shadow-card'
                    )}
                  >
                    {/* ── Top Context & Category Strip ── */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1.5 text-caption font-semibold px-3 py-1 rounded-full bg-casa-accent-subtle text-casa-top-pick-band border border-casa-accent-subtle-border tracking-wide">
                          <HeroBadgeIcon size={12} className="text-casa-gold shrink-0" />
                          <span>{heroBadge.label}</span>
                        </span>
                        <span className="inline-flex items-center gap-1 text-caption font-semibold px-2.5 py-1 rounded-full bg-casa-gold/15 text-casa-top-pick-band border border-casa-gold/30">
                          <Sparkles size={11} className="text-casa-gold" />
                          <span>Priority Focus</span>
                        </span>
                        {heroSuggestedEvent && (
                          <span className="inline-flex items-center gap-1.5 text-caption font-semibold px-2.5 py-1 rounded-full bg-amber-100/90 text-amber-900 border border-amber-300/80 shadow-2xs">
                            <Calendar size={12} className="text-amber-700 shrink-0" />
                            <span>Suggests {heroSuggestedEvent.displayDate}</span>
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2.5">
                        {heroItem.due_by ? (
                          <span className="text-caption text-casa-error font-semibold px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200/80">
                            Due Today
                          </span>
                        ) : (
                          <span className="text-caption text-casa-muted font-mono font-medium">
                            Receipt Match
                          </span>
                        )}

                        <div className="relative">
                          <IconButton
                            variant="ghost"
                            size="sm"
                            aria-label="Inspect email & details in sidecar"
                            title="Inspect in sidecar"
                            onClick={(e) => {
                              e.stopPropagation()
                              openActionInSidecar(heroItem.id)
                            }}
                            className="text-casa-muted hover:text-casa-navy transition-colors opacity-70 hover:opacity-100 min-h-[44px] min-w-[44px]"
                            icon={<ExternalLink size={15} />}
                          />

                          {/* Overflow / Downvote Menu */}
                          {isHeroMenuOpen && (
                            <div className="absolute right-0 top-full mt-1 w-44 bg-casa-surface rounded-xl border border-casa-border shadow-modal p-1.5 z-40 flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-150">
                              <Button
                                variant="ghost"
                                size="sm"
                                align="start"
                                onClick={() => onInstantDownvote(heroItem)}
                                className="w-full text-caption text-casa-error hover:bg-rose-50 transition-colors font-medium min-h-[44px]"
                                leadingIcon={<ThumbsDown size={13} />}
                              >
                                <span>Mark Not Relevant</span>
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* ── Synthesized Content Body (Clickable to inspect in Sidecar) ── */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => openActionInSidecar(heroItem.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          openActionInSidecar(heroItem.id)
                        }
                      }}
                      className="min-w-0 flex flex-col gap-1.5 pl-0.5 cursor-pointer group"
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
                        <span>Tap to view email &amp; analysis</span>
                        <span>›</span>
                      </div>
                    </div>

                    {/* ── Universal 2-Anchor Footer: [ Done ] vs [ Snooze ▾ ] ── */}
                    <div className="pt-3.5 border-t border-casa-border/60 flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
                      {/* Primary Anchor 1: Done (Navy strong action with guaranteed white text) */}
                      <Button
                        size="sm"
                        variant="strong"
                        onClick={() => onInstantComplete(heroItem)}
                        className="px-5 py-2.5 rounded-full min-h-[48px] text-body-sm font-bold shadow-card flex items-center gap-2 shrink-0 hover:brightness-110"
                        leadingIcon={<Check size={16} strokeWidth={2.5} className="text-emerald-400" />}
                      >
                        <span>{heroDoneLabel}</span>
                      </Button>

                      {/* Primary Anchor 2: Split Snooze Pill with Expandable Presets */}
                      <div className="inline-flex items-stretch rounded-full bg-casa-surface border border-casa-border hover:border-casa-gold transition-all shadow-xs shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onInstantSnooze(heroItem, 'tomorrow')}
                          className="px-4 py-2 text-body-sm font-semibold text-casa-navy hover:text-casa-gold-hover transition-colors min-h-[48px] rounded-l-full rounded-r-none border-none flex items-center gap-2"
                          title="Snooze to tomorrow morning"
                          leadingIcon={<Clock size={14} className="text-casa-gold" />}
                        >
                          <span>Snooze Tomorrow</span>
                        </Button>

                        <IconButton
                          size="sm"
                          variant="ghost"
                          onClick={() => setOpenSnoozeId(isHeroSnoozeOpen ? null : heroItem.id)}
                          aria-label="More snooze options"
                          title="More snooze options"
                          className="px-3 border-l border-casa-border/70 text-casa-muted hover:text-casa-navy hover:bg-casa-gold/10 transition-colors rounded-r-full rounded-l-none min-h-[48px] min-w-[40px]"
                          icon={
                            <ChevronDown
                              size={15}
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
                          <div className="pt-2.5 mt-1 border-t border-dashed border-casa-border/60 grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              align="start"
                              onClick={() => onInstantSnooze(heroItem, '3h')}
                              className="w-full px-3 py-2 rounded-xl bg-casa-surface hover:bg-casa-gold/15 border border-casa-border/70 text-caption text-casa-navy transition-colors font-medium min-h-[40px]"
                              leadingIcon={<Moon size={13} className="text-casa-gold" />}
                            >
                              <span className="flex-1 text-left text-caption font-semibold">Tonight (+3h)</span>
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              align="start"
                              onClick={() => onInstantSnooze(heroItem, 'tomorrow')}
                              className="w-full px-3 py-2 rounded-xl bg-casa-surface hover:bg-casa-gold/15 border border-casa-border/70 text-caption text-casa-navy transition-colors font-medium min-h-[40px]"
                              leadingIcon={<Sun size={13} className="text-casa-gold" />}
                            >
                              <span className="flex-1 text-left text-caption font-semibold">Tomorrow (9 AM)</span>
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              align="start"
                              onClick={() => onInstantPush(heroItem, 'weekend')}
                              className="w-full px-3 py-2 rounded-xl bg-casa-surface hover:bg-casa-gold/15 border border-casa-border/70 text-caption text-casa-navy transition-colors font-medium min-h-[40px]"
                              leadingIcon={<Calendar size={13} className="text-casa-gold" />}
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

          {/* ── QUIET MINIMALIST MICRO-QUEUE: Subsequent Matters ── */}
          {microItems.length > 0 && (
            <div className="p-4 sm:p-5 rounded-3xl bg-casa-surface border border-casa-border/80 shadow-sm space-y-2">
              <div className="flex items-center justify-between pb-2 border-b border-casa-border/50">
                <span className="text-caption font-bold uppercase tracking-wider text-casa-muted">
                  Queued Household Matters ({microItems.length})
                </span>
                <span className="text-caption text-casa-gold font-medium">
                  Tap row to focus
                </span>
              </div>

              <div className="divide-y divide-casa-border/40">
                {microItems.map((item) => {
                  const badge = sourceBadge(item)
                  const BadgeIcon = badge.icon
                  const amount = extractAmount(item.description || item.event_title)
                  const microSuggestedEvent = detectSuggestedEvent(item)

                  return (
                    <div
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      data-tactile="true"
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
                        'py-3 px-3 -mx-1.5 rounded-2xl flex items-start justify-between gap-3 group cursor-pointer transition-all duration-150 active:scale-[0.97] active:opacity-75 border-2',
                        selectedSidecarActionId === item.id && sidecarTab === 'action'
                          ? 'bg-casa-gold/10 border-casa-gold shadow-xs'
                          : 'hover:bg-casa-bg/80 border-transparent hover:border-casa-border/60'
                      )}
                    >
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <IconButton
                          variant="secondary"
                          size="sm"
                          aria-label={`Mark ${item.description || item.event_title || 'item'} done`}
                          onClick={(e) => {
                            e.stopPropagation()
                            onInstantComplete(item)
                          }}
                          className="min-w-[44px] min-h-[44px] rounded-full border border-casa-border hover:border-casa-gold hover:bg-casa-bg flex items-center justify-center text-casa-muted hover:text-casa-gold shrink-0 transition-all shadow-2xs group-hover:border-casa-gold/60 mt-0.5"
                          icon={<Check size={16} strokeWidth={2.5} />}
                        />

                        <div className="min-w-0 flex-1 pt-0.5">
                          <div className="text-body-sm font-semibold text-casa-navy line-clamp-3 leading-snug break-words">
                            {item.description || item.event_title}
                          </div>
                          <div className="flex items-center gap-2 text-caption text-casa-muted mt-1 flex-wrap">
                            <span className="inline-flex items-center gap-1">
                              <BadgeIcon size={12} className="text-casa-gold shrink-0" />
                              <span>{badge.label}</span>
                            </span>
                            {microSuggestedEvent && (
                              <>
                                <span>·</span>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100/90 text-amber-900 text-2xs font-semibold border border-amber-300/80">
                                  <Calendar size={10} className="text-amber-700 shrink-0" />
                                  <span>Suggests {microSuggestedEvent.displayDate}</span>
                                </span>
                              </>
                            )}
                            <span>·</span>
                            <span className="text-casa-error font-medium">
                              {item.due_by ? 'Due Today' : 'Receipt Match'}
                            </span>
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
                            onInstantSnooze(item, 'tomorrow')
                          }}
                          className="px-3 py-1.5 text-caption font-semibold text-casa-navy hover:bg-casa-bg border border-casa-border/70 rounded-full min-h-[40px] flex items-center gap-1.5 shadow-2xs"
                          leadingIcon={<Clock size={12} className="text-casa-gold" />}
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

          {visiblePrep.length === 0 && visibleConflicts.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 text-center p-6 bg-emerald-50/50 rounded-2xl border border-emerald-200">
              <CheckCircle2 size={36} className="text-emerald-600 mb-2" />
              <h4 className="font-display text-body-lg font-bold text-emerald-900">
                Household in Harmony
              </h4>
              <p className="text-caption text-emerald-700 mt-1 max-w-xs">
                Zero pending conflicts or overdue preparation tasks.
              </p>
            </div>
          )}
        </div>

        {/* ── SECTION 3: PUSHED TO LATER (BACKLOG DRAWER) ── */}
        {pushedPrep.length > 0 && (
          <div className="pt-2 border-t border-casa-border/40">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPushedExpanded((p) => !p)}
              className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-casa-bg/80 text-caption font-bold text-casa-muted hover:text-casa-navy transition-colors min-h-[44px]"
            >
              <div className="flex items-center gap-2">
                <Clock size={14} />
                <span>Pushed to Later ({pushedPrep.length})</span>
              </div>
              {pushedExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </Button>

            <AnimatePresence>
              {pushedExpanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-2 mt-2"
                >
                  {pushedPrep.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-xl bg-casa-surface border border-casa-border/60 flex items-center justify-between gap-3 text-caption"
                    >
                      <div className="min-w-0 flex-1 truncate">
                        <span className="font-bold text-casa-navy">
                          {item.description || item.event_title}
                        </span>
                        <span className="text-casa-muted block text-2xs">Deferred</span>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleRestorePushedPrep(item.id)}
                        className="px-2.5 py-1 rounded-lg text-casa-navy hover:bg-casa-bg text-2xs font-bold border border-casa-border/60 flex items-center gap-1 min-h-[44px]"
                      >
                        <RotateCcw size={11} />
                        <span>Move to Today</span>
                      </Button>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  )
}
