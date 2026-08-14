import { useState } from 'react'
import {
  Zap,
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
  ArrowRight,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button, IconButton, Checkbox, StatusDot } from '../../ui'
import { cn } from '../../../utils/cn'
import type { PrepItem, Conflict, FamilyMember } from '../../../types'
import type { SnoozeDuration } from '../../../utils/snoozeDuration'
import type { DriverAvailability } from '../../../hooks/useTurboCanvasPresenter'

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

function shortTitle(raw?: string | null, maxLen = 22): string {
  if (!raw) return 'Event'
  const stripped = raw.includes(' | ') ? raw.split(' | ').slice(1).join(' | ') : raw
  return stripped.length > maxLen ? `${stripped.slice(0, maxLen - 1)}…` : stripped
}

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
  const [pushedExpanded, setPushedExpanded] = useState(false)

  const totalUrgent = activeConflicts.length
  const totalTasks = activePrep.length
  const totalActionable = totalUrgent + totalTasks

  return (
    <div className="lg:col-span-7 xl:col-span-7 flex flex-col rounded-3xl bg-casa-surface border border-casa-border/70 shadow-sm p-4 sm:p-5 overflow-hidden min-h-0">
      {/* ── Widget Header ── */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-casa-border/40 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-amber-500/15 text-amber-600">
            <Zap size={18} className="text-amber-600" />
          </div>
          <div>
            <h2 className="font-display text-body-lg font-bold text-casa-navy leading-tight">
              Action Queue & Operations
            </h2>
            <p className="text-caption text-casa-muted">
              {totalActionable === 0
                ? 'All operations clear and resolved'
                : `${totalUrgent} urgent triage · ${totalTasks} daily task${totalTasks === 1 ? '' : 's'}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {totalUrgent > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleBatchAutoTriage}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-casa-gold/15 hover:bg-casa-gold/25 text-casa-navy text-caption font-bold border border-casa-gold/30 transition-all shadow-xs min-h-[44px]"
              title="Automatically assign available drivers and optimize logistics"
            >
              <Sparkles size={14} className="text-casa-gold" />
              <span>Auto-Triage</span>
            </Button>
          )}

          <span
            className={cn(
              'text-caption font-bold px-2.5 py-1 rounded-full border',
              totalActionable > 0
                ? 'bg-amber-100/80 text-amber-900 border-amber-300/60'
                : 'bg-emerald-100/80 text-emerald-900 border-emerald-300/60'
            )}
          >
            {totalActionable} Actionable
          </span>
        </div>
      </div>

      {/* ── Scrollable Action Container ── */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-4 min-h-0">
        {/* ── SECTION 1: URGENT LOGISTICS & CONFLICTS ── */}
        {activeConflicts.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <h3 className="text-caption font-bold uppercase tracking-wider text-casa-muted">
                Urgent Logistics Triage ({activeConflicts.length})
              </h3>
            </div>

            {activeConflicts.map((c) => {
              const isDriveTime = c.conflict_type === 'drive_time'
              const isOverlap = c.conflict_type === 'double_book' || c.conflict_type === 'overlap'
              const availabilities = getDriverAvailabilities(c)
              const recommended = availabilities.find((a) => a.isAvailable) || availabilities[0]

              return (
                <motion.div
                  key={c.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.2 }}
                  className="p-4 rounded-2xl bg-amber-50/70 border border-amber-300/80 shadow-xs relative"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="inline-flex items-center gap-1 text-caption font-bold px-2 py-0.5 rounded-full bg-amber-200/80 text-amber-950 uppercase tracking-wide">
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
                              <Zap size={12} />
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

                  {/* ── 1-Tap Driver & Resolution Controls ── */}
                  <div className="mt-3 pt-3 border-t border-amber-200/70">
                    {isDriveTime ? (
                      <div className="space-y-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          {/* Recommended Driver (1-Tap Primary) */}
                          {recommended && (
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() =>
                                handleResolveConflict(
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

                        {/* Direct Driver Avatar Row */}
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
                                  handleResolveConflict(
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
                            handleResolveConflict(c, 'Split transport: 2 drivers assigned')
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
                              handleResolveConflict(c, `Kept: ${c.event_a?.title || 'Event A'}`)
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
                          onClick={() => handleResolveConflict(c, 'Acknowledged overlap')}
                          className="px-3 py-2 rounded-xl text-casa-muted hover:text-casa-navy hover:bg-black/5 text-caption font-semibold transition-all min-h-[44px]"
                        >
                          Acknowledge
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => handleResolveConflict(c, 'Resolved')}
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
          </div>
        )}

        {/* ── SECTION 2: DAILY TASKS & TO-DOS ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <h3 className="text-caption font-bold uppercase tracking-wider text-casa-muted">
                Tasks & Daily To-Dos ({activePrep.length})
              </h3>
            </div>
          </div>

          {activePrep.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="p-3.5 sm:p-4 rounded-2xl bg-casa-bg/70 border border-casa-border/80 hover:border-casa-gold/60 transition-all shadow-xs"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {/* Interactive Checkbox with full task content */}
                  <Checkbox
                    checked={false}
                    onChange={() => handleCompletePrep(item)}
                    label={
                      <div className="min-w-0 flex-1 ml-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-caption font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-casa-gold/15 text-casa-navy">
                            {item.source_type || 'Household Task'}
                          </span>
                          {item.due_by && (
                            <span className="text-caption text-casa-muted font-mono flex items-center gap-1">
                              <Clock size={11} />
                              Due today
                            </span>
                          )}
                        </div>
                        <h4 className="text-body-sm font-bold text-casa-navy leading-snug">
                          {item.description || item.event_title || 'Prep Item'}
                        </h4>
                      </div>
                    }
                  />
                </div>

                {/* Quick Done Button */}
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => handleCompletePrep(item)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 text-caption font-bold transition-all shadow-sm min-h-[44px] shrink-0"
                >
                  <Check size={14} strokeWidth={2.5} />
                  <span>Done</span>
                </Button>
              </div>

              {/* Snooze / Push Actions */}
              <div className="mt-3 pt-2.5 border-t border-casa-border/40 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="text-caption text-casa-muted font-medium">Snooze:</span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleSnoozePrep(item.id, '1h')}
                    className="text-caption font-semibold px-2.5 py-1.5 rounded-xl bg-casa-surface border border-casa-border/60 hover:border-casa-navy text-casa-navy transition-colors min-h-[44px]"
                  >
                    +1h
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleSnoozePrep(item.id, '3h')}
                    className="text-caption font-semibold px-2.5 py-1.5 rounded-xl bg-casa-surface border border-casa-border/60 hover:border-casa-navy text-casa-navy transition-colors min-h-[44px]"
                  >
                    +3h
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleSnoozePrep(item.id, 'tomorrow')}
                    className="text-caption font-semibold px-2.5 py-1.5 rounded-xl bg-casa-surface border border-casa-border/60 hover:border-casa-navy text-casa-navy transition-colors min-h-[44px]"
                  >
                    Tomorrow
                  </Button>
                </div>

                <div className="flex items-center gap-1.5">
                  {/* Push to Backlog */}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handlePushPrep(item, 'weekend')}
                    title="Push task out of today to this weekend"
                    className="text-caption font-semibold px-3 py-1.5 rounded-xl bg-casa-surface hover:bg-casa-gold/15 text-casa-muted hover:text-casa-navy border border-casa-border/60 transition-colors min-h-[44px] flex items-center gap-1"
                  >
                    <span>Push to Weekend</span>
                    <ArrowRight size={12} />
                  </Button>

                  <IconButton
                    variant="ghost"
                    size="sm"
                    aria-label="Mark not relevant"
                    title="Mark not relevant"
                    onClick={() => handleDownvotePrep(item)}
                    className="p-2 rounded-xl text-casa-muted hover:text-rose-600 hover:bg-rose-50 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                    icon={<ThumbsDown size={14} />}
                  />
                </div>
              </div>
            </motion.div>
          ))}

          {activePrep.length === 0 && activeConflicts.length === 0 && (
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
