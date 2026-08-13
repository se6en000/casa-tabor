import { useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import {
  Sparkles,
  Zap,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  Check,
  ThumbsDown,
  Plus,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { useLiveClock } from '../../hooks/useLiveClock'
import { useTodayEvents, type EventWithDetails } from '../../hooks/useCalendarEvents'
import { useWeekConflicts, useResolveConflict } from '../../hooks/useConflicts'
import {
  usePrepItems,
  useCompletePrepItem,
  useDownvotePrepItem,
  useSnoozePrepItem,
} from '../../hooks/usePrepItems'
import { useAttentionStore } from '../../stores/attentionStore'
import { useAppStore } from '../../stores/appStore'
import { cn } from '../../utils/cn'
import { Button, IconButton } from '../ui'
import type { PrepItem, Conflict } from '../../types'

interface TurboCanvasViewProps {
  onOpenEvent: (event: EventWithDetails) => void
  onQuickCreate: () => void
}

export default function TurboCanvasView({ onOpenEvent, onQuickCreate }: TurboCanvasViewProps) {
  const { setCanvasSubmode } = useAppStore()
  const now = useLiveClock(10_000)
  const { data: todayEvents = [] } = useTodayEvents(now)
  const { data: conflicts = [] } = useWeekConflicts()
  const { data: prepItems = [] } = usePrepItems()

  const resolveConflict = useResolveConflict()
  const completePrep = useCompletePrepItem()
  const downvotePrep = useDownvotePrepItem()
  const snoozePrep = useSnoozePrepItem()

  const {
    highlightedEventId,
    setHighlightedEventId,
    pendingDismissalIds,
    scheduleUndoableAction,
  } = useAttentionStore()

  // Filter out pending dismissed items optimistically
  const activeConflicts = useMemo(
    () => conflicts.filter((c) => !c.resolved && !pendingDismissalIds.has(`conflict-${c.id}`)),
    [conflicts, pendingDismissalIds]
  )

  const activePrep = useMemo(
    () => prepItems.filter((p) => !p.dismissed && !pendingDismissalIds.has(`prep-${p.id}`)),
    [prepItems, pendingDismissalIds]
  )

  // 1-Click Action Handlers with 4000ms Undo Window
  const handleResolveConflict = (conflict: Conflict, resolution: string) => {
    const toastId = `conflict-${conflict.id}`
    scheduleUndoableAction({
      id: toastId,
      title: 'Resolved conflict',
      actionLabel: resolution,
      onCommit: () => resolveConflict(conflict.id, resolution),
      onUndo: () => {
        // Rolled back from pending dismissals automatically
      },
    })
  }

  const handleCompletePrep = (item: PrepItem) => {
    const toastId = `prep-${item.id}`
    const label = item.description || item.event_title || 'Prep Item'
    scheduleUndoableAction({
      id: toastId,
      title: 'Completed task',
      actionLabel: label,
      onCommit: () => completePrep(item.id),
      onUndo: () => {},
    })
  }

  const handleDownvotePrep = (item: PrepItem) => {
    const toastId = `prep-${item.id}`
    const label = item.description || item.event_title || 'Prep Item'
    scheduleUndoableAction({
      id: toastId,
      title: 'Marked not relevant',
      actionLabel: label,
      onCommit: () => downvotePrep(item.id),
      onUndo: () => {},
    })
  }

  return (
    <div className="w-full h-full flex flex-col p-4 sm:p-6 overflow-hidden">
      {/* ── Subheader Bar ── */}
      <div className="flex items-center justify-between pb-4 mb-4 border-b border-casa-border/50 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
            <h1 className="font-display text-heading font-bold text-casa-navy">
              Living Canvas <span className="text-amber-600 font-medium">· Turbo Triage</span>
            </h1>
          </div>
          <span className="text-caption text-casa-muted hidden sm:inline">
            3 synchronized panes · Instant 1-click household operations
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="primary"
            size="sm"
            onClick={onQuickCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-casa-gold text-casa-navy hover:bg-amber-400 text-caption font-bold transition-all shadow-sm min-h-[36px]"
          >
            <Plus size={14} strokeWidth={2.5} />
            <span>New Event</span>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setCanvasSubmode('calm')}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-casa-surface border border-casa-border hover:border-casa-navy text-casa-navy text-caption font-semibold transition-all shadow-sm min-h-[36px]"
          >
            <span>Return to Calm Mode 🌿</span>
          </Button>
        </div>
      </div>

      {/* ── 3-Pane Living Canvas Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-0 items-stretch overflow-hidden">
        {/* ── PANE 1: Daily Briefing & Logistics (4 cols) ── */}
        <div className="lg:col-span-4 flex flex-col rounded-3xl bg-casa-surface border border-casa-border/60 shadow-sm p-5 overflow-hidden">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-casa-border/40 shrink-0">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-casa-gold" />
              <h2 className="font-display text-body-lg font-bold text-casa-navy">
                Daily Briefing
              </h2>
            </div>
            <span className="text-caption text-casa-muted font-mono">
              {format(now, 'EEE, MMM d')}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto pr-1 space-y-4">
            {/* Narrative Overview Card */}
            <div className="rounded-2xl p-4 bg-gradient-to-br from-casa-navy/5 via-casa-surface to-casa-gold/5 border border-casa-gold/20">
              <p className="text-caption uppercase font-bold tracking-wider text-casa-gold mb-1">
                Household Status
              </p>
              <p className="text-body-sm text-casa-navy font-medium leading-relaxed">
                {todayEvents.length > 0
                  ? `Today features ${todayEvents.length} events across the family. Sarah handles morning gymnastics run, while Luke covers soccer pickup at 5:15 PM.`
                  : 'No scheduled appointments today. Great time for meal prep or family downtime.'}
              </p>
            </div>

            {/* Logistics Handoffs Card */}
            <div>
              <h3 className="text-caption font-bold uppercase tracking-wider text-casa-muted mb-2.5">
                Logistics & Handoffs
              </h3>
              <div className="space-y-2">
                {todayEvents.filter(e => !e.all_day).slice(0, 3).map((evt) => (
                  <div
                    key={evt.id}
                    onMouseEnter={() => setHighlightedEventId(evt.id)}
                    onMouseLeave={() => setHighlightedEventId(null)}
                    onClick={() => onOpenEvent(evt)}
                    className={cn(
                      'p-3 rounded-2xl border transition-all cursor-pointer group',
                      highlightedEventId === evt.id
                        ? 'border-casa-navy bg-casa-gold/15 shadow-sm'
                        : 'border-casa-border/50 bg-casa-bg/40 hover:bg-casa-surface'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-caption font-bold text-casa-navy">
                        {format(parseISO(evt.start_time), 'h:mm a')}
                      </span>
                      <div className="flex items-center gap-1">
                        {evt.members.map((m) => (
                          <span
                            key={m.id}
                            className="text-caption font-bold px-2 py-0.5 rounded-full border"
                            style={{
                              borderColor: m.family_member?.color_hex ?? 'var(--color-casa-gold)',
                              color: m.family_member?.color_hex ?? 'var(--color-casa-gold)',
                            }}
                          >
                            {m.family_member?.name}
                          </span>
                        ))}
                      </div>
                    </div>
                    <p className="text-body-sm font-semibold text-casa-navy group-hover:text-casa-gold transition-colors mt-1">
                      {evt.title}
                    </p>
                    {evt.location_name && (
                      <p className="text-caption text-casa-text-secondary truncate mt-0.5">
                        📍 {evt.location_name}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* AI Assistant Quick Suggestions */}
            <div className="p-3.5 rounded-2xl bg-casa-gold/10 border border-casa-gold/30">
              <div className="flex items-center gap-2 mb-1.5">
                <Sparkles size={14} className="text-casa-gold" />
                <span className="text-caption font-bold text-casa-navy">Copilot Tip</span>
              </div>
              <p className="text-caption text-casa-text-secondary">
                Rain expected starting around 4:00 PM. Recommend umbrellas for soccer pickup.
              </p>
            </div>
          </div>
        </div>

        {/* ── PANE 2: Today's Real-Time Timeline (4 cols) ── */}
        <div className="lg:col-span-4 flex flex-col rounded-3xl bg-casa-surface border border-casa-border/60 shadow-sm p-5 overflow-hidden">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-casa-border/40 shrink-0">
            <div className="flex items-center gap-2">
              <Calendar size={16} className="text-casa-navy" />
              <h2 className="font-display text-body-lg font-bold text-casa-navy">
                Today's Schedule
              </h2>
            </div>
            <span className="text-caption font-semibold px-2.5 py-0.5 rounded-full bg-casa-bg text-casa-navy">
              {todayEvents.length} Events
            </span>
          </div>

          <div className="flex-1 overflow-y-auto pr-1 space-y-2.5">
            {todayEvents.length > 0 ? (
              todayEvents.map((evt) => {
                const isHighlighted = highlightedEventId === evt.id
                return (
                  <motion.div
                    key={evt.id}
                    onMouseEnter={() => setHighlightedEventId(evt.id)}
                    onMouseLeave={() => setHighlightedEventId(null)}
                    onClick={() => onOpenEvent(evt)}
                    layout
                    className={cn(
                      'p-4 rounded-2xl border transition-all cursor-pointer relative group',
                      isHighlighted
                        ? 'border-casa-navy bg-casa-navy text-white shadow-md'
                        : 'border-casa-border/50 bg-casa-bg/50 hover:border-casa-gold hover:bg-casa-surface'
                    )}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span
                        className={cn(
                          'font-mono text-caption font-semibold',
                          isHighlighted ? 'text-casa-gold' : 'text-casa-muted'
                        )}
                      >
                        {evt.all_day
                          ? 'All Day'
                          : `${format(parseISO(evt.start_time), 'h:mm a')} – ${format(
                              parseISO(evt.end_time),
                              'h:mm a'
                            )}`}
                      </span>

                      <div className="flex items-center gap-1.5">
                        {evt.members.map((m) => (
                          <span
                            key={m.id}
                            className="w-2.5 h-2.5 rounded-full"
                            style={{
                              backgroundColor: m.family_member?.color_hex ?? 'var(--color-casa-gold)',
                            }}
                            title={m.family_member?.name}
                          />
                        ))}
                      </div>
                    </div>

                    <h4
                      className={cn(
                        'text-body-sm font-bold truncate leading-snug',
                        isHighlighted ? 'text-white' : 'text-casa-navy group-hover:text-casa-gold'
                      )}
                    >
                      {evt.title}
                    </h4>

                    {evt.location_name && (
                      <div
                        className={cn(
                          'flex items-center gap-1 text-caption truncate mt-1',
                          isHighlighted ? 'text-white/70' : 'text-casa-text-secondary'
                        )}
                      >
                        <MapPin size={12} className="shrink-0" />
                        <span className="truncate">{evt.location_name}</span>
                      </div>
                    )}
                  </motion.div>
                )
              })
            ) : (
              <div className="flex flex-col items-center justify-center h-48 text-center">
                <CheckCircle2 size={32} className="text-emerald-500 mb-2" />
                <p className="text-body-sm font-semibold text-casa-navy">No Events Today</p>
                <p className="text-caption text-casa-muted mt-0.5">Your schedule is wide open.</p>
              </div>
            )}
          </div>
        </div>

        {/* ── PANE 3: Attention Hub & 1-Click Resolvers (4 cols) ── */}
        <div className="lg:col-span-4 flex flex-col rounded-3xl bg-casa-surface border border-casa-border/60 shadow-sm p-5 overflow-hidden">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-casa-border/40 shrink-0">
            <div className="flex items-center gap-2">
              <Zap size={16} className="text-amber-500" />
              <h2 className="font-display text-body-lg font-bold text-casa-navy">
                Attention Hub
              </h2>
            </div>
            <span className="text-caption font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900">
              {activeConflicts.length + activePrep.length} Actionable
            </span>
          </div>

          <div className="flex-1 overflow-y-auto pr-1 space-y-3">
            {/* 1. Schedule Conflicts */}
            {activeConflicts.map((c) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="p-4 rounded-2xl bg-amber-50/60 border border-amber-300/60 shadow-sm relative"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <AlertTriangle size={15} className="text-amber-600 shrink-0" />
                  <span className="text-caption font-bold text-amber-900 uppercase tracking-wide">
                    {c.conflict_type === 'drive_time' ? 'Ride Needed' : 'Schedule Conflict'}
                  </span>
                </div>

                <p className="text-body-sm font-semibold text-casa-navy leading-snug">
                  {c.description || 'Simultaneous events require driver coordination'}
                </p>

                {/* 1-Click Resolvers */}
                <div className="mt-3 pt-3 border-t border-amber-200/60 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => handleResolveConflict(c, 'Assigned Sarah as driver')}
                    className="px-3 py-1.5 rounded-xl bg-amber-500 text-white hover:bg-amber-600 text-caption font-bold shadow-sm transition-all min-h-[32px]"
                  >
                    Assign Sarah
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleResolveConflict(c, 'Assigned Luke as driver')}
                    className="px-3 py-1.5 rounded-xl bg-casa-navy text-white hover:bg-slate-800 text-caption font-bold shadow-sm transition-all min-h-[32px]"
                  >
                    Assign Luke
                  </Button>
                </div>
              </motion.div>
            ))}

            {/* 2. Prep & Action Items */}
            {activePrep.map((item) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="p-4 rounded-2xl bg-casa-bg/60 border border-casa-border/70 hover:border-casa-gold/60 transition-all shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="text-caption font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-casa-gold/15 text-casa-navy">
                      {item.source_type || 'Prep Task'}
                    </span>
                    <h4 className="text-body-sm font-bold text-casa-navy mt-1.5 leading-snug">
                      {item.description || item.event_title || 'Prep Item'}
                    </h4>
                  </div>
                </div>

                {/* 1-Click Action Buttons with Undo Toast */}
                <div className="mt-3 pt-3 border-t border-casa-border/40 flex items-center justify-between gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => handleCompletePrep(item)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 text-caption font-bold transition-all shadow-sm min-h-[32px]"
                  >
                    <Check size={13} strokeWidth={2.5} />
                    <span>Done</span>
                  </Button>

                  <div className="flex items-center gap-1">
                    <IconButton
                      variant="ghost"
                      size="sm"
                      aria-label="Mark not relevant"
                      onClick={() => handleDownvotePrep(item)}
                      className="p-1.5 rounded-lg text-casa-muted hover:text-rose-600 hover:bg-rose-50 transition-colors"
                      icon={<ThumbsDown size={14} />}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => snoozePrep(item.id, 'tomorrow')}
                      aria-label="Snooze 1 day"
                      className="text-caption font-medium px-2.5 py-1 rounded-lg text-casa-muted hover:text-casa-navy hover:bg-casa-surface transition-colors min-h-[32px]"
                    >
                      Snooze 1d
                    </Button>
                  </div>
                </div>
              </motion.div>
            ))}

            {/* Zero State */}
            {activeConflicts.length === 0 && activePrep.length === 0 && (
              <div className="flex flex-col items-center justify-center h-56 text-center p-6 bg-emerald-50/50 rounded-2xl border border-emerald-200">
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
        </div>
      </div>
    </div>
  )
}
