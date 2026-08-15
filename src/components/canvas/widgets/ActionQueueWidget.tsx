import { useState } from 'react'
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
  const [openSnoozeId, setOpenSnoozeId] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  const totalUrgent = activeConflicts.length
  const totalTasks = activePrep.length
  const totalActionable = totalUrgent + totalTasks

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

        {/* ── SECTION 2: LUXURY UNIVERSAL CARDS ON SOLID CANVAS ── */}
        <div className="space-y-3.5">
          <AnimatePresence mode="popLayout">
            {activePrep.map((item) => {
              const badge = sourceBadge(item)
              const BadgeIcon = badge.icon
              const amount = extractAmount(item.description || item.event_title)
              const doneLabel = resolveButtonLabel(item)
              const isSnoozeOpen = openSnoozeId === item.id
              const isMenuOpen = openMenuId === item.id

              return (
                <motion.article
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 28, scale: 0.96 }}
                  transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
                  className="p-5 rounded-2xl bg-casa-surface border border-casa-border/90 hover:border-casa-gold/60 transition-all shadow-card hover:shadow-card-hover flex flex-col gap-3.5 relative"
                >
                  {/* ── Top Context & Category Strip ── */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-caption font-semibold px-3 py-1 rounded-full bg-casa-accent-subtle text-casa-top-pick-band border border-casa-accent-subtle-border tracking-wide">
                      <BadgeIcon size={12} className="text-casa-gold shrink-0" />
                      <span>{badge.label}</span>
                    </span>

                    <div className="flex items-center gap-2.5">
                      {item.due_by ? (
                        <span className="text-caption text-casa-error font-mono font-semibold flex items-center gap-1">
                          <span>Due Today</span>
                        </span>
                      ) : (
                        <span className="text-caption text-casa-muted font-mono">
                          Receipt Match
                        </span>
                      )}

                      <div className="relative">
                        <IconButton
                          variant="ghost"
                          size="sm"
                          aria-label="Options"
                          title="Options"
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpenMenuId(isMenuOpen ? null : item.id)
                          }}
                          className="text-casa-muted hover:text-casa-navy transition-colors opacity-70 hover:opacity-100 min-h-[32px] min-w-[32px]"
                          icon={<ExternalLink size={13} />}
                        />

                        {/* Discreet Overflow / Downvote Menu */}
                        {isMenuOpen && (
                          <div className="absolute right-0 top-full mt-1 w-44 bg-casa-surface rounded-xl border border-casa-border shadow-modal p-1.5 z-40 flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-150">
                            <Button
                              variant="ghost"
                              size="sm"
                              align="start"
                              onClick={() => {
                                handleDownvotePrep(item)
                                setOpenMenuId(null)
                              }}
                              className="w-full text-caption text-casa-error hover:bg-rose-50 transition-colors font-medium min-h-[38px]"
                              leadingIcon={<ThumbsDown size={13} />}
                            >
                              <span>Mark Not Relevant</span>
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ── Synthesized Content Body ── */}
                  <div className="min-w-0 flex flex-col gap-1">
                    <h4 className="font-body text-body-sm font-bold text-casa-navy leading-snug">
                      {item.description || item.event_title || 'Prep Item'}
                    </h4>
                    {amount && (
                      <span className="font-mono text-body font-bold text-casa-navy mt-0.5">
                        {amount}
                      </span>
                    )}
                  </div>

                  {/* ── Universal 2-Anchor Footer: [ Done ] vs [ Snooze ▾ ] ── */}
                  <div className="pt-3 border-t border-casa-border/50 flex items-center justify-between gap-2.5 flex-nowrap">
                    {/* Primary Anchor 1: Done (Clean, light, high-contrast readable pill) */}
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleCompletePrep(item)}
                      className="px-3.5 sm:px-4 py-1.5 rounded-full bg-casa-bg hover:bg-emerald-50 text-casa-navy hover:text-emerald-950 border border-casa-border hover:border-emerald-500/80 text-caption font-bold shadow-2xs transition-all min-h-[38px] shrink-0"
                      leadingIcon={<Check size={14} strokeWidth={2.5} className="text-emerald-600" />}
                    >
                      <span>{doneLabel}</span>
                    </Button>

                    {/* Primary Anchor 2: Split Snooze Pill with Expandable Presets */}
                    <div className="inline-flex items-stretch rounded-full bg-casa-bg border border-casa-border hover:border-casa-gold/80 transition-all shadow-2xs shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleSnoozePrep(item.id, 'tomorrow')}
                        className="px-3 sm:px-3.5 py-1.5 text-caption font-semibold text-casa-navy hover:text-casa-gold-hover transition-colors min-h-[38px] rounded-l-full rounded-r-none border-none"
                        title="Snooze to tomorrow morning"
                        leadingIcon={<Clock size={13} className="text-casa-gold" />}
                      >
                        <span>Snooze Tomorrow</span>
                      </Button>

                      <IconButton
                        size="sm"
                        variant="ghost"
                        onClick={() => setOpenSnoozeId(isSnoozeOpen ? null : item.id)}
                        aria-label="More snooze options"
                        title="More snooze options"
                        className="px-2 border-l border-casa-border/70 text-casa-muted hover:text-casa-navy hover:bg-casa-gold/10 transition-colors rounded-r-full rounded-l-none min-h-[38px] min-w-[34px]"
                        icon={
                          <ChevronDown
                            size={13}
                            className={cn('transition-transform duration-200', isSnoozeOpen && 'rotate-180')}
                          />
                        }
                      />
                    </div>
                  </div>

                  {/* ── In-Flow Expandable Snooze Presets (Zero Clipping, Zero Overflow) ── */}
                  <AnimatePresence>
                    {isSnoozeOpen && (
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
                            onClick={() => {
                              handleSnoozePrep(item.id, '3h')
                              setOpenSnoozeId(null)
                            }}
                            className="w-full px-2.5 py-1.5 rounded-xl bg-casa-bg hover:bg-casa-gold/15 border border-casa-border/60 text-caption text-casa-navy transition-colors font-medium min-h-[36px]"
                            leadingIcon={<Moon size={13} className="text-casa-gold" />}
                          >
                            <span className="flex-1 text-left text-2xs sm:text-caption">Tonight (+3h)</span>
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            align="start"
                            onClick={() => {
                              handleSnoozePrep(item.id, 'tomorrow')
                              setOpenSnoozeId(null)
                            }}
                            className="w-full px-2.5 py-1.5 rounded-xl bg-casa-bg hover:bg-casa-gold/15 border border-casa-border/60 text-caption text-casa-navy transition-colors font-medium min-h-[36px]"
                            leadingIcon={<Sun size={13} className="text-casa-gold" />}
                          >
                            <span className="flex-1 text-left text-2xs sm:text-caption">Tomorrow (9 AM)</span>
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            align="start"
                            onClick={() => {
                              handlePushPrep(item, 'weekend')
                              setOpenSnoozeId(null)
                            }}
                            className="w-full px-2.5 py-1.5 rounded-xl bg-casa-bg hover:bg-casa-gold/15 border border-casa-border/60 text-caption text-casa-navy transition-colors font-medium min-h-[36px]"
                            leadingIcon={<Calendar size={13} className="text-casa-gold" />}
                          >
                            <span className="flex-1 text-left text-2xs sm:text-caption">This Weekend</span>
                          </Button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.article>
              )
            })}
          </AnimatePresence>

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
