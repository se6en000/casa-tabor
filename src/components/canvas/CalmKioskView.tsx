import { useState } from 'react'
import {
  Utensils,
  ShoppingBag,
  Clock,
  ChevronRight,
  Zap,
  Calendar,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useCalmKioskPresenter } from '../../hooks/useCalmKioskPresenter'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import { useAppStore } from '../../stores/appStore'
import { useCalendarStore } from '../../stores/calendarStore'
import { cn } from '../../utils/cn'
import { Button } from '../ui'
import { getDisplayMemberColor } from '../../design-system/memberColors'
import TomorrowPrepWidget from './widgets/TomorrowPrepWidget'
import ImminentTransitWidget from './widgets/ImminentTransitWidget'
import { useHeroIntelligence } from '../../hooks/useHeroIntelligence'
import MorningLaunchpadWidget from './widgets/MorningLaunchpadWidget'
import MiddayLogisticsWidget from './widgets/MiddayLogisticsWidget'
import GmailSyncStatusIndicator from '../shared/GmailSyncStatusIndicator'
import HouseholdDispatchCard from './widgets/HouseholdDispatchCard'
import TodaysScheduleWidget from './widgets/TodaysScheduleWidget'
import TodaysTodosWidget from './widgets/TodaysTodosWidget'
import TomorrowPreviewWidget from './widgets/TomorrowPreviewWidget'
interface CalmKioskViewProps {
  onOpenEvent: (event: EventWithDetails) => void
}

export default function CalmKioskView({ onOpenEvent }: CalmKioskViewProps) {
  const dinnerPlan = useAppStore((s) => s.dinnerPlan)
  const setActiveView = useCalendarStore((s) => s.setActiveView)
  const [showPastEvents, setShowPastEvents] = useState(false)
  const [showOverdueTodos, setShowOverdueTodos] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('casa:calm:overdue-collapsed')
      return stored === null ? true : stored !== 'true'
    } catch {
      return true
    }
  })
  const [todosExpanded, setTodosExpanded] = useState(false)
  const [mobileSubTab, setMobileSubTab] = useState<'schedule' | 'triage' | 'kitchen'>('schedule')
  const [heroManualView, setHeroManualView] = useState<'today' | 'tomorrow' | null>(null)

  // Collapsible section states with localStorage persistence
  const [todosSectionCollapsed, setTodosSectionCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('casa:calm:todos-collapsed') === 'true'
    } catch {
      return false
    }
  })
  const [scheduleSectionCollapsed, setScheduleSectionCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('casa:calm:schedule-collapsed') === 'true'
    } catch {
      return false
    }
  })
  const [tomorrowSectionCollapsed, setTomorrowSectionCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('casa:calm:tomorrow-collapsed') === 'true'
    } catch {
      return false
    }
  })
  const [completedSectionCollapsed, setCompletedSectionCollapsed] = useState<boolean>(() => {
    try {
      // Collapsed by default so completed items don't clutter the screen before midnight reset
      return localStorage.getItem('casa:calm:completed-todos-collapsed') !== 'false'
    } catch {
      return true
    }
  })

  const toggleCompletedSection = () => {
    setCompletedSectionCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem('casa:calm:completed-todos-collapsed', String(next))
      } catch {
        // ignore — best-effort localStorage write
      }
      return next
    })
  }

  const toggleOverdueTodos = () => {
    setShowOverdueTodos((prev) => {
      const next = !prev
      try {
        localStorage.setItem('casa:calm:overdue-collapsed', String(!next))
      } catch {
        // ignore — best-effort localStorage write
      }
      return next
    })
  }

  const toggleTodosSection = () => {
    setTodosSectionCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem('casa:calm:todos-collapsed', String(next))
      } catch {
        // ignore — best-effort localStorage write
      }
      return next
    })
  }

  const toggleScheduleSection = () => {
    setScheduleSectionCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem('casa:calm:schedule-collapsed', String(next))
      } catch {
        // ignore — best-effort localStorage write
      }
      return next
    })
  }

  const toggleTomorrowSection = () => {
    setTomorrowSectionCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem('casa:calm:tomorrow-collapsed', String(next))
      } catch {
        // ignore — best-effort localStorage write
      }
      return next
    })
  }

  const {
    now,
    greeting,
    dispatchHeadline,
    dispatchWeekDays,
    dispatchHorizon,
    timeHorizonLabel,
    setSelectedHeroEventId,
    pastEvents,
    upcomingAppointments,
    todayReminders,
    openReminders,
    overdueReminders,
    activeReminders,
    completedReminders,
    tomorrowEvents,
    isDinnerPast,
    totalAttentionCount,
    activeConflicts,
    activePrep,
    familyMembers,
    ambientRoutineStatuses,
    handleResolveConflict,
    handleCompletePrep,
    handleToggleReminder,
    setCanvasSubmode,
    navigateTo,
    isRefreshing,
    refreshBriefing,
  } = useCalmKioskPresenter()

  const heroIntel = useHeroIntelligence(now, upcomingAppointments, familyMembers, heroManualView || 'today')

  return (
    <div className="w-full h-full flex flex-col justify-start px-4 sm:px-6 lg:px-8 xl:px-10 pt-5 sm:pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-8 overflow-y-auto scrollbar-hide">
      {/* ── Gmail Sync Health Warning Banner ── */}
      <GmailSyncStatusIndicator variant="banner" className="mb-5 shrink-0" />

      {/* ── Top Section: 12-Col Grid Alignment (7 cols Greeting, 5 cols Tonight's Kitchen + Intake) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 xl:gap-10 pb-5 sm:pb-6 border-b border-casa-border/40 shrink-0 items-center">
        <div className="lg:col-span-7 flex flex-wrap items-center gap-2">
          <h1 className="font-display text-heading text-casa-navy font-semibold tracking-tight leading-none">
            {greeting}, <span className="italic font-normal">Tabor Family</span>
          </h1>
          {ambientRoutineStatuses.map((status, idx) => {
              const childMember = familyMembers.find((m) => m.name.toLowerCase() === status.childName.toLowerCase())
              const childDotColor = getDisplayMemberColor(childMember?.color_hex)
              return (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-casa-surface-subtle border border-casa-border/50 text-casa-navy text-caption font-medium shadow-2xs"
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: childDotColor }}
                  />
                  <span>{status.text}</span>
                </span>
              )
            })}
        </div>

        {/* ── Luxury Tonight's Kitchen Showcase (Sole Header Card, 5 cols) ── */}
        <div className="hidden lg:flex lg:col-span-5 flex-col justify-center">
          <div className="w-full flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-casa-surface to-amber-500/[0.08] border border-casa-gold/35 shadow-2xs transition-all hover:border-casa-gold/60">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-9 h-9 rounded-xl bg-casa-gold/20 text-casa-navy flex items-center justify-center font-bold shadow-2xs border border-casa-gold/30 shrink-0">
                {dinnerPlan.mode === 'takeout' ? (
                  <ShoppingBag size={17} className="text-amber-800" />
                ) : dinnerPlan.mode === 'leftovers' ? (
                  <Clock size={17} className="text-amber-800" />
                ) : (
                  <Utensils size={17} className="text-amber-800" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 mb-0.5 flex-nowrap overflow-hidden">
                  <span className="font-sans text-3xs sm:text-2xs font-bold uppercase tracking-wider text-amber-900 whitespace-nowrap shrink-0">
                    {dinnerPlan.mode === 'takeout'
                      ? "Tonight's Takeout"
                      : dinnerPlan.mode === 'leftovers'
                      ? "Tonight's Leftovers"
                      : "Tonight's Kitchen"}
                  </span>
                  <span className="text-casa-muted/60 text-3xs shrink-0">·</span>
                  <span className="text-3xs sm:text-2xs font-medium text-casa-text-secondary truncate shrink-0">
                    {isDinnerPast ? 'Dinner Completed' : dinnerPlan.targetTime || '6:30 PM Target'}
                  </span>
                </div>
                <h3
                  onClick={() => {
                    if (dinnerPlan.mode === 'cook') {
                      if (dinnerPlan.recipeId) {
                        navigateTo(`/cook?recipe=${encodeURIComponent(dinnerPlan.recipeId)}&autocook=true`)
                      } else {
                        navigateTo('/cook')
                      }
                    }
                  }}
                  className={cn(
                    'font-display text-heading sm:text-body-lg lg:text-heading font-semibold text-casa-navy truncate leading-tight',
                    dinnerPlan.mode === 'cook' && 'cursor-pointer hover:text-amber-900 transition-colors'
                  )}
                >
                  {dinnerPlan.title}
                </h3>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  document.dispatchEvent(
                    new CustomEvent('open-ai-chat', {
                      detail: {
                        launchId: crypto.randomUUID(),
                        agent: 'chef',
                        source: 'tonights-kitchen',
                        prompt: undefined,
                        autoSend: false,
                      },
                    })
                  )
                }}
                className="text-caption font-medium text-casa-muted hover:text-casa-navy transition-colors h-7 min-h-0 px-2 rounded-lg"
              >
                <span>Change</span>
              </Button>
              {dinnerPlan.mode === 'cook' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (dinnerPlan.recipeId) {
                      navigateTo(`/cook?recipe=${encodeURIComponent(dinnerPlan.recipeId)}&autocook=true`)
                    } else {
                      navigateTo('/cook')
                    }
                  }}
                  className="text-caption font-semibold text-casa-navy hover:text-casa-gold transition-colors h-7 min-h-0 px-2 rounded-lg flex items-center gap-1 group/recipe"
                >
                  <span>Recipe</span>
                  <ChevronRight size={13} className="text-casa-muted group-hover/recipe:text-casa-gold transition-colors" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Mobile View Switcher (Only visible on small screens < lg) ── */}
      <div className="lg:hidden flex items-center justify-between pb-3 mb-1 border-b border-casa-border/40 shrink-0">
        <div className="inline-flex p-1 rounded-2xl bg-casa-surface border border-casa-border/60 w-full justify-center gap-1 shadow-2xs">
          <Button
            size="sm"
            variant={mobileSubTab === 'schedule' ? 'primary' : 'ghost'}
            onClick={() => setMobileSubTab('schedule')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-caption font-bold transition-all min-h-[42px]',
              mobileSubTab === 'schedule'
                ? 'bg-casa-navy text-white shadow-2xs'
                : 'text-casa-muted hover:text-casa-navy'
            )}
          >
            <Calendar size={14} />
            <span>
              {upcomingAppointments.length > 0
                ? `Schedule (${upcomingAppointments.length})`
                : `Tomorrow (${tomorrowEvents.length})`}
            </span>
          </Button>

          <Button
            size="sm"
            variant={mobileSubTab === 'triage' ? 'primary' : 'ghost'}
            onClick={() => setMobileSubTab('triage')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-caption font-bold transition-all min-h-[42px]',
              mobileSubTab === 'triage'
                ? 'bg-amber-500 text-white shadow-2xs'
                : 'text-casa-muted hover:text-casa-navy'
            )}
          >
            <Zap size={14} className={mobileSubTab === 'triage' ? 'text-white' : 'text-amber-600'} />
            <span>Actions</span>
            {totalAttentionCount > 0 && (
              <span
                className={cn(
                  'px-1.5 py-0.5 rounded-full text-3xs font-bold leading-none',
                  mobileSubTab === 'triage' ? 'bg-white text-amber-600' : 'bg-amber-500 text-white'
                )}
              >
                {totalAttentionCount}
              </span>
            )}
          </Button>

          <Button
            size="sm"
            variant={mobileSubTab === 'kitchen' ? 'primary' : 'ghost'}
            onClick={() => setMobileSubTab('kitchen')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-caption font-bold transition-all min-h-[42px]',
              mobileSubTab === 'kitchen'
                ? 'bg-casa-gold text-casa-navy shadow-2xs'
                : 'text-casa-muted hover:text-casa-navy'
            )}
          >
            <Utensils size={14} />
            <span>Dinner</span>
          </Button>
        </div>
      </div>

      {/* ── Row 1: Hero + Today's Schedule, equal-weight split (home-hierarchy mock approved 2026-09-11) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-4 items-start">
        {/* Hero Next Up Card (5 cols) */}
        <div className={cn(
          'lg:col-span-5 flex-col justify-start',
          mobileSubTab === 'triage' ? 'hidden lg:flex' : 'flex'
        )}>
          <AnimatePresence mode="wait" initial={false}>
            {heroIntel.archetype === 'tomorrow_readiness' ? (
              <motion.div
                key="tomorrow-hero"
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -3 }}
                transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                className="w-full"
              >
                <TomorrowPrepWidget
                  now={now}
                  showViewToggle={true}
                  onToggleTodayView={() => setHeroManualView('today')}
                  onOpenEvent={onOpenEvent}
                />
              </motion.div>
            ) : heroIntel.archetype === 'morning_launchpad' ? (
              <motion.div
                key="launchpad-hero"
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -3 }}
                transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                className="w-full"
              >
                <MorningLaunchpadWidget now={now} onOpenEvent={onOpenEvent} />
              </motion.div>
            ) : heroIntel.archetype === 'imminent_transit' && heroIntel.imminentEvent ? (
              <motion.div
                key={`imminent-${heroIntel.imminentEvent.id}`}
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -3 }}
                transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                className="w-full"
              >
                <ImminentTransitWidget
                  now={now}
                  event={heroIntel.imminentEvent}
                  onOpenEvent={onOpenEvent}
                  minutesUntilNext={heroIntel.minutesUntilNext}
                  minutesUntilLeave={heroIntel.minutesUntilLeave}
                  driveTimeMins={heroIntel.driveTimeMins}
                  isTravelEvent={heroIntel.isTravelEvent}
                  isLeaveNow={heroIntel.isLeaveNow}
                  isPrepUrgent={heroIntel.isPrepUrgent}
                  concurrentEvents={heroIntel.concurrentEvents}
                  onSelectHeroEventId={(id) => setSelectedHeroEventId(id)}
                  schoolDropoffs={heroIntel.pendingSchoolDropoffs}
                  tomorrowSummary={heroIntel.tomorrowSummary}
                  onToggleTomorrowView={() => setHeroManualView('tomorrow')}
                />
              </motion.div>
            ) : (
              <motion.div
                key="today-logistics-hero"
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -3 }}
                transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                className="w-full"
              >
                <MiddayLogisticsWidget
                  now={now}
                  todayEvents={upcomingAppointments}
                  openReminders={openReminders}
                  todayReminders={todayReminders}
                  completedReminders={completedReminders}
                  onToggleReminder={handleToggleReminder}
                  tomorrowEvents={tomorrowEvents}
                  familyMembers={familyMembers}
                  nextEvent={heroIntel.imminentEvent}
                  onOpenEvent={onOpenEvent}
                  onToggleTomorrowView={() => setHeroManualView('tomorrow')}
                  isTomorrowActive={false}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Today's Schedule — promoted to a full-width timeline, equal billing with the Hero card (7 cols) */}
        <div className={cn(
          'lg:col-span-7',
          mobileSubTab === 'schedule' ? 'flex flex-col' : 'hidden lg:flex lg:flex-col'
        )}>
          <TodaysScheduleWidget
            now={now}
            pastEvents={pastEvents}
            upcomingAppointments={upcomingAppointments}
            showPastEvents={showPastEvents}
            onTogglePastEvents={() => setShowPastEvents(!showPastEvents)}
            collapsed={scheduleSectionCollapsed}
            onToggleCollapsed={toggleScheduleSection}
            onExpandAll={() => setCanvasSubmode('turbo')}
            onOpenEvent={onOpenEvent}
          />
        </div>
      </div>

          {/* Mobile Triage Card (Visible on mobile when triage tab is active) */}
          {mobileSubTab === 'triage' && (
            <div className="lg:hidden flex flex-col gap-3">
              {/* Header card */}
              <div className="rounded-3xl p-5 bg-casa-surface border border-amber-500/30 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-800 flex items-center justify-center font-bold">
                    <Zap size={18} className="text-amber-600" />
                  </div>
                  <div>
                    <h3 className="font-display text-body-lg font-bold text-casa-navy">
                      Household Actions ({totalAttentionCount})
                    </h3>
                    <p className="text-2xs text-casa-muted">1-tap resolution for urgent items</p>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigateTo('/actions')}
                  className="text-caption font-bold text-casa-gold hover:underline min-h-[44px] px-2.5"
                >
                  <span>Action Queue</span>
                  <ArrowRight size={13} className="ml-1" />
                </Button>
              </div>

              {/* Active Conflicts List */}
              {activeConflicts.map((conflict) => (
                <div
                  key={conflict.id}
                  className="rounded-3xl p-4 bg-casa-surface border border-amber-500/30 shadow-sm flex flex-col gap-2.5"
                >
                  <div className="flex items-center gap-1.5 text-amber-700 text-caption font-bold uppercase tracking-wider">
                    <Zap size={13} className="text-amber-600 shrink-0" />
                    <span>{conflict.conflict_type || 'Driver Needed'}</span>
                  </div>
                  <div>
                    <h4 className="text-body-sm font-bold text-casa-navy">
                      {conflict.event_a?.title || 'Upcoming Event'}
                    </h4>
                    <p className="text-caption text-casa-muted mt-0.5">{conflict.description}</p>
                  </div>
                  <div className="pt-2 border-t border-casa-border/50 flex flex-wrap items-center gap-1.5">
                    <span className="text-2xs font-semibold text-casa-muted mr-1">Assign:</span>
                    {familyMembers
                      .filter((m) => m.can_drive || m.role === 'parent' || m.role === 'caregiver')
                      .slice(0, 3)
                      .map((member) => (
                        <Button
                          key={member.id}
                          variant="secondary"
                          size="sm"
                          onClick={() => handleResolveConflict(conflict, `${member.name} assigned as driver`)}
                          className="min-h-[36px] px-3 py-1 rounded-xl text-caption font-bold bg-casa-bg hover:bg-casa-surface-subtle border-casa-border"
                        >
                          <span>{member.name}</span>
                        </Button>
                      ))}
                  </div>
                </div>
              ))}

              {/* Active Prep Items List */}
              {activePrep.map((prep) => (
                <div
                  key={prep.id}
                  className="rounded-3xl p-4 bg-casa-surface border border-emerald-500/30 shadow-sm flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-emerald-700 text-caption font-bold uppercase tracking-wider">
                      <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                      <span>{prep.type || 'Prep Item'}</span>
                    </div>
                    <p className="text-body-sm font-semibold text-casa-navy truncate mt-0.5">
                      {prep.description}
                    </p>
                    {prep.event_title && (
                      <p className="text-2xs text-casa-muted truncate">For {prep.event_title}</p>
                    )}
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleCompletePrep(prep)}
                    className="min-h-[38px] px-3.5 rounded-xl text-caption font-bold bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                  >
                    <span>Done</span>
                  </Button>
                </div>
              ))}

              {totalAttentionCount === 0 && (
                <div className="rounded-3xl p-6 bg-casa-surface border border-casa-border/50 text-center flex flex-col items-center justify-center gap-2">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-600 flex items-center justify-center">
                    <CheckCircle2 size={22} />
                  </div>
                  <h4 className="text-body-sm font-bold text-casa-navy">All Actions Up to Date!</h4>
                  <p className="text-caption text-casa-muted">
                    No urgent driver conflicts or prep tasks pending.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Mobile Kitchen Card (Visible on mobile when kitchen subtab is active) */}
          {mobileSubTab === 'kitchen' && (
            <div className="lg:hidden flex flex-col justify-start pb-3.5 border-b border-casa-border/40 px-1 space-y-2.5">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/15 text-amber-800 flex items-center justify-center font-bold">
                    {dinnerPlan.mode === 'takeout' ? (
                      <ShoppingBag size={15} />
                    ) : dinnerPlan.mode === 'leftovers' ? (
                      <Clock size={15} />
                    ) : (
                      <Utensils size={15} />
                    )}
                  </div>
                  <h3 className="font-sans text-body font-bold text-casa-navy">
                    {dinnerPlan.mode === 'takeout'
                      ? "Tonight's Takeout"
                      : dinnerPlan.mode === 'leftovers'
                      ? "Tonight's Leftovers"
                      : "Tonight's Kitchen"}
                  </h3>
                </div>
                <span className="text-caption font-semibold text-casa-muted">
                  {isDinnerPast ? 'Dinner Completed' : dinnerPlan.targetTime || '6:30 PM Target'}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4 px-1">
                <div className="min-w-0 flex-1">
                  <h4 className="font-display text-body-lg font-bold text-casa-navy truncate">
                    {dinnerPlan.title}
                  </h4>
                  <p className="text-caption text-casa-text-secondary truncate mt-0.5">
                    {isDinnerPast ? 'Dinner served · Kitchen closed' : dinnerPlan.subtitle}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      document.dispatchEvent(
                        new CustomEvent('open-ai-chat', {
                          detail: {
                            launchId: crypto.randomUUID(),
                            agent: 'chef',
                            source: 'tonights-kitchen',
                            prompt: undefined,
                            autoSend: false,
                          },
                        })
                      )
                    }}
                    className="text-caption font-semibold text-casa-muted hover:text-casa-navy transition-colors min-h-[36px] px-2"
                  >
                    <span>Change</span>
                  </Button>
                  {dinnerPlan.mode === 'cook' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        if (dinnerPlan.recipeId) {
                          navigateTo(`/cook?recipe=${encodeURIComponent(dinnerPlan.recipeId)}&autocook=true`)
                        } else {
                          navigateTo('/cook')
                        }
                      }}
                      className="text-caption font-bold text-casa-navy hover:text-casa-gold min-h-[36px] px-3 shadow-2xs"
                    >
                      <span>View Recipe</span>
                      <ChevronRight size={13} className="ml-0.5" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

      {/* ── Row 2: To-Dos, Ahead, and Tomorrow — quiet, secondary cards ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6 pb-6 items-start">
        <div className={cn(mobileSubTab === 'schedule' ? 'flex flex-col' : 'hidden lg:flex lg:flex-col')}>
          <TodaysTodosWidget
            now={now}
            todayReminders={todayReminders}
            openReminders={openReminders}
            overdueReminders={overdueReminders}
            activeReminders={activeReminders}
            completedReminders={completedReminders}
            collapsed={todosSectionCollapsed}
            onToggleCollapsed={toggleTodosSection}
            showOverdue={showOverdueTodos}
            onToggleOverdue={toggleOverdueTodos}
            expanded={todosExpanded}
            onToggleExpanded={() => setTodosExpanded(!todosExpanded)}
            completedCollapsed={completedSectionCollapsed}
            onToggleCompleted={toggleCompletedSection}
            onToggleReminder={handleToggleReminder}
            onOpenEvent={onOpenEvent}
          />
        </div>

        <div className={cn('flex-col', mobileSubTab === 'triage' ? 'hidden lg:flex' : 'flex')}>
          <HouseholdDispatchCard
            timeHorizonLabel={timeHorizonLabel}
            headline={dispatchHeadline}
            weekDays={dispatchWeekDays}
            horizon={dispatchHorizon}
            isRefreshing={isRefreshing}
            onRefresh={() => void refreshBriefing()}
          />
        </div>

        <div className={cn(mobileSubTab === 'schedule' ? 'flex flex-col' : 'hidden lg:flex lg:flex-col')}>
          <TomorrowPreviewWidget
            tomorrowEvents={tomorrowEvents}
            collapsed={tomorrowSectionCollapsed}
            onToggleCollapsed={toggleTomorrowSection}
            onViewFullCalendar={() => {
              setActiveView('stacked')
              navigateTo('/calendar')
            }}
            onOpenEvent={onOpenEvent}
          />
        </div>
      </div>
    </div>
  )
}
