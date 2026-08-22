import { useState } from 'react'
import { format, parseISO, startOfDay, isBefore } from 'date-fns'
import {
  Car,
  Utensils,
  ShoppingBag,
  Clock,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Check,
  Zap,
  Sparkles,
  Calendar,
  CheckCircle2,
  ArrowRight,
  RotateCw,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useCalmKioskPresenter } from '../../hooks/useCalmKioskPresenter'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import { useAppStore } from '../../stores/appStore'
import { useCalendarStore } from '../../stores/calendarStore'
import { cn } from '../../utils/cn'
import { getEventStartDate } from '../../utils/eventTime'
import { Button, IconButton, PersonAvatarStack } from '../ui'
import { getDisplayMemberColor } from '../../design-system/memberColors'
import TomorrowPrepWidget from './widgets/TomorrowPrepWidget'
import ImminentTransitWidget from './widgets/ImminentTransitWidget'
import { useHeroIntelligence } from '../../hooks/useHeroIntelligence'
import MorningLaunchpadWidget from './widgets/MorningLaunchpadWidget'
import MiddayLogisticsWidget from './widgets/MiddayLogisticsWidget'
import GmailSyncStatusIndicator from '../shared/GmailSyncStatusIndicator'
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
      // Expanded by default as requested!
      return localStorage.getItem('casa:calm:completed-todos-collapsed') === 'true'
    } catch {
      return false
    }
  })

  const toggleCompletedSection = () => {
    setCompletedSectionCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem('casa:calm:completed-todos-collapsed', String(next))
      } catch {}
      return next
    })
  }

  const toggleOverdueTodos = () => {
    setShowOverdueTodos((prev) => {
      const next = !prev
      try {
        localStorage.setItem('casa:calm:overdue-collapsed', String(!next))
      } catch {}
      return next
    })
  }

  const toggleTodosSection = () => {
    setTodosSectionCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem('casa:calm:todos-collapsed', String(next))
      } catch {}
      return next
    })
  }

  const toggleScheduleSection = () => {
    setScheduleSectionCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem('casa:calm:schedule-collapsed', String(next))
      } catch {}
      return next
    })
  }

  const toggleTomorrowSection = () => {
    setTomorrowSectionCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem('casa:calm:tomorrow-collapsed', String(next))
      } catch {}
      return next
    })
  }

  const {
    now,
    greeting,
    dailyBriefing,
    timeHorizonLabel,
    weather,
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
        <div className="lg:col-span-7">
          <h1 className="font-display text-display-lg sm:text-display-xl text-casa-navy font-semibold tracking-tight leading-none">
            {greeting}, <span className="italic font-normal">Tabor Family</span>
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <p className="text-body text-casa-text-secondary font-medium">
              {format(now, 'EEEE, MMMM d, yyyy')}
              {weather && ` · ${weather.condition || 'Clear'}, ${weather.temp}°F`}
            </p>
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

      {/* ── Main Middle Grid: Hero "Next Up" + Tonight's Dinner + Daily Schedule ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-4 pb-6 items-start">
        {/* Hero Next Up Card (7 cols) */}
        <div className={cn(
          'lg:col-span-7 flex-col justify-start space-y-4',
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

                    {/* Stylized Ambient Daily Briefing Prose */}
          {dailyBriefing && (
            <div className="px-1 py-1 flex items-start gap-3">
              <div className="p-1.5 rounded-xl bg-amber-500/15 text-casa-gold shrink-0 mt-0.5 border border-amber-500/20">
                <Sparkles size={16} className="text-casa-gold animate-pulse" />
              </div>
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-2xs uppercase tracking-widest font-sans font-bold text-amber-700">
                    {timeHorizonLabel}
                  </span>
                  <IconButton
                    variant="ghost"
                    size="sm"
                    aria-label="Refresh daily brief"
                    title="Refresh daily brief on demand"
                    onClick={() => void refreshBriefing()}
                    className="min-h-[44px] min-w-[44px] -my-2 -mr-2 text-amber-700/70 hover:text-amber-900 hover:bg-amber-500/10 transition-colors"
                    icon={
                      <RotateCw
                        size={13}
                        className={cn('transition-transform duration-500', isRefreshing && 'animate-spin')}
                      />
                    }
                  />
                </div>
                <p className="font-display text-body-lg sm:text-heading text-casa-navy font-medium leading-relaxed">
                  {dailyBriefing}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right Side (5 cols): Today's Schedule Stream (Top) + Tonight's Kitchen (Bottom) */}
        <div className="lg:col-span-5 flex flex-col gap-6">
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

          {/* 1. Today's To-Dos (if there are any) */}
          {todayReminders.length > 0 && (
            <div className={cn(
              'flex-col justify-start pb-3.5 border-b border-casa-border/50 space-y-1 px-1',
              mobileSubTab === 'schedule' ? 'flex' : 'hidden lg:flex'
            )}>
              <div
                role="button"
                tabIndex={0}
                onClick={toggleTodosSection}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    toggleTodosSection()
                  }
                }}
                className="w-full flex items-center justify-between px-1 py-1.5 -mx-1 rounded-xl hover:bg-casa-surface-subtle/70 transition-colors cursor-pointer select-none group min-h-[44px]"
                aria-expanded={!todosSectionCollapsed}
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-amber-500/15 text-amber-800 flex items-center justify-center font-bold shrink-0">
                    <Check size={13} strokeWidth={2.5} className="text-amber-700" />
                  </div>
                  <h3 className="font-sans text-body-sm font-bold text-casa-navy tracking-tight group-hover:text-amber-900 transition-colors">
                    Today's To-Dos
                  </h3>
                  <span className="px-1.5 py-0.5 rounded-full text-3xs font-semibold bg-amber-500/10 text-amber-900 border border-amber-500/20">
                    {completedReminders.length > 0
                      ? `${openReminders.length} left · ${completedReminders.length} done`
                      : `${todayReminders.length}`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {!todosSectionCollapsed && (
                    <span className="text-3xs text-casa-muted/80 font-medium uppercase tracking-wider hidden sm:inline">1-tap to complete</span>
                  )}
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center text-casa-muted group-hover:text-casa-navy transition-transform">
                    {todosSectionCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                  </div>
                </div>
              </div>

              <AnimatePresence initial={false}>
                {!todosSectionCollapsed && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden space-y-1"
                  >

              {/* ── Concept A: Collapsible Overdue Fold (Expanded by default when items exist) ── */}
              {overdueReminders.length > 0 && (() => {
                const hasPastDayOverdue = overdueReminders.some((evt) => isBefore(getEventStartDate(evt), startOfDay(now)))
                return (
                  <div className="mb-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      fullWidth
                      align="between"
                      onClick={toggleOverdueTodos}
                      className="min-h-[32px] h-8 py-0.5 px-2.5 rounded-lg bg-amber-500/[0.08] hover:bg-amber-500/[0.14] text-caption text-amber-900 border border-amber-500/25 transition-colors shadow-2xs"
                    >
                      <span className="inline-flex items-center gap-1.5 font-semibold text-caption text-amber-900">
                        <Clock size={12} className="text-amber-700 shrink-0" />
                        <span>
                          {hasPastDayOverdue
                            ? `${overdueReminders.length} overdue ${overdueReminders.length === 1 ? 'item' : 'items'} pending`
                            : `${overdueReminders.length} ${overdueReminders.length === 1 ? 'item' : 'items'} pending from earlier today`}
                        </span>
                      </span>
                      {showOverdueTodos ? <ChevronUp size={12} className="text-amber-800 shrink-0" /> : <ChevronDown size={12} className="text-amber-800 shrink-0" />}
                    </Button>

                    <AnimatePresence initial={false}>
                      {showOverdueTodos && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                          className="space-y-1 pt-1 overflow-hidden"
                        >
                          {overdueReminders.map((evt) => {
                            const avatarPeople = evt.members.map((m) => ({
                              id: m.family_member?.id || m.id,
                              name: m.family_member?.name || 'Member',
                              color: m.family_member?.color_hex || 'var(--color-casa-navy)',
                            }))
                            const startDate = getEventStartDate(evt)
                            const isPastDay = isBefore(startDate, startOfDay(now))

                            return (
                              <div
                                key={evt.id}
                                role="button"
                                tabIndex={0}
                                data-tactile="true"
                                data-calendar-event
                                data-sidecar-loadable="true"
                                data-event-id={evt.id}
                                onClick={() => onOpenEvent(evt)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    onOpenEvent(evt)
                                  }
                                }}
                                className="w-full flex items-center justify-between py-1.5 px-2.5 rounded-xl transition-all duration-150 cursor-pointer group gap-2.5 select-none active:scale-[0.99] min-h-[38px] bg-amber-500/[0.06] border border-amber-500/25 hover:bg-amber-500/[0.12] hover:border-amber-500/40 shadow-2xs"
                              >
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                  <IconButton
                                    size="sm"
                                    variant="ghost"
                                    onClick={async (e) => {
                                      e.stopPropagation()
                                      try {
                                        navigator.vibrate?.(10)
                                      } catch {}
                                      await handleToggleReminder(evt.id)
                                    }}
                                    className="rounded-full shrink-0 transition-all duration-150 text-casa-muted hover:text-casa-navy hover:bg-casa-surface-subtle h-6 w-6 min-h-0 p-0"
                                    aria-label={`Mark ${evt.title} done`}
                                    icon={
                                      <div className="w-4.5 h-4.5 rounded-full border-[1.5px] border-amber-600 hover:border-casa-navy bg-white shadow-2xs group-hover:scale-105 transition-transform" />
                                    }
                                  />

                                  {isPastDay ? (
                                    <span className="font-mono text-caption font-bold text-amber-950 shrink-0 tabular-nums">
                                      {evt.all_day ? format(startDate, 'MMM d') : format(startDate, 'MMM d · h:mm a')}
                                    </span>
                                  ) : (
                                    <span className="font-mono text-caption font-bold text-amber-950 shrink-0 tabular-nums">
                                      {format(parseISO(evt.start_time), 'h:mm a')}
                                    </span>
                                  )}

                                  <span className={cn(
                                    'px-1.5 py-0.5 rounded text-3xs font-bold uppercase tracking-wider shrink-0',
                                    isPastDay
                                      ? 'bg-rose-500/20 text-rose-950 border border-rose-500/30'
                                      : 'bg-amber-500/25 text-amber-950 border border-amber-500/35'
                                  )}>
                                    {isPastDay ? 'Missed' : 'Overdue'}
                                  </span>

                                  <span className="text-body-sm font-semibold text-casa-navy truncate transition-colors flex-1 group-hover:text-amber-950">
                                    {evt.title}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  {avatarPeople.length > 0 && <PersonAvatarStack people={avatarPeople} size="sm" max={2} />}
                                  <ChevronRight
                                    size={14}
                                    className="text-casa-muted/40 group-hover:text-casa-navy transition-transform group-hover:translate-x-0.5"
                                  />
                                </div>
                              </div>
                            )
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )
              })()}

              {/* ── Active & Upcoming To-Dos (Capped at 3 visible by default) ── */}
              {activeReminders.length > 0 && (
                <div className="space-y-0.5">
                  {(todosExpanded ? activeReminders : activeReminders.slice(0, 3)).map((evt) => {
                    const avatarPeople = evt.members.map((m) => ({
                      id: m.family_member?.id || m.id,
                      name: m.family_member?.name || 'Member',
                      color: m.family_member?.color_hex || 'var(--color-casa-navy)',
                    }))

                    return (
                      <div
                        key={evt.id}
                        role="button"
                        tabIndex={0}
                        data-tactile="true"
                        data-calendar-event
                        data-sidecar-loadable="true"
                        data-event-id={evt.id}
                        onClick={() => onOpenEvent(evt)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            onOpenEvent(evt)
                          }
                        }}
                        className="w-full flex items-center justify-between py-1 px-2 rounded-xl transition-all duration-150 cursor-pointer group gap-2.5 select-none active:scale-[0.99] min-h-[36px] hover:bg-casa-surface hover:shadow-2xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <IconButton
                            size="sm"
                            variant="ghost"
                            onClick={async (e) => {
                              e.stopPropagation()
                              try {
                                navigator.vibrate?.(10)
                              } catch {}
                              await handleToggleReminder(evt.id)
                            }}
                            className="rounded-full shrink-0 transition-all duration-150 h-6 w-6 min-h-0 p-0 text-casa-muted hover:text-casa-navy hover:bg-casa-surface-subtle"
                            aria-label={`Mark ${evt.title} done`}
                            icon={
                              <div className="w-4.5 h-4.5 rounded-full border-[1.5px] border-slate-300 hover:border-casa-navy bg-white shadow-2xs transition-colors" />
                            }
                          />

                          {evt.all_day ? (
                            <span className="font-sans text-caption font-semibold text-casa-muted/80 shrink-0">
                              All Day
                            </span>
                          ) : (
                            <span className="font-mono text-caption font-bold text-casa-navy shrink-0 tabular-nums">
                              {format(parseISO(evt.start_time), 'h:mm a')}
                            </span>
                          )}

                          <span className="text-body-sm font-normal text-casa-navy group-hover:text-casa-navy truncate transition-colors flex-1">
                            {evt.title}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {avatarPeople.length > 0 && <PersonAvatarStack people={avatarPeople} size="sm" max={2} />}
                          <ChevronRight
                            size={14}
                            className="text-casa-muted/40 group-hover:text-casa-navy transition-transform group-hover:translate-x-0.5"
                          />
                        </div>
                      </div>
                    )
                  })}

                  {activeReminders.length > 3 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setTodosExpanded(!todosExpanded)}
                      className="w-full flex items-center justify-center gap-1 py-1 text-caption font-medium text-casa-muted hover:text-casa-navy transition-colors min-h-[30px] h-7 rounded-lg hover:bg-casa-surface-subtle mt-0.5"
                    >
                      {todosExpanded ? (
                        <>
                          <span>Show less</span>
                          <ChevronUp size={13} />
                        </>
                      ) : (
                        <>
                          <span>+ {activeReminders.length - 3} more to-dos</span>
                          <ChevronDown size={13} />
                        </>
                      )}
                    </Button>
                  )}
                </div>
              )}

              {/* ── Option B: Completed Today Section (Expanded by default so family sees what's done) ── */}
              {completedReminders.length > 0 && (
                <div className="pt-2 border-t border-casa-border/40 mt-1.5">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={toggleCompletedSection}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        toggleCompletedSection()
                      }
                    }}
                    className="w-full flex items-center justify-between py-1 px-1.5 rounded-lg hover:bg-casa-surface-subtle/70 transition-colors cursor-pointer select-none group min-h-[32px] text-casa-muted mb-0.5"
                    aria-expanded={!completedSectionCollapsed}
                  >
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                      <span className="text-caption font-semibold text-casa-muted group-hover:text-casa-navy transition-colors">
                        Completed Today ({completedReminders.length})
                      </span>
                    </div>
                    <div className="w-5 h-5 rounded flex items-center justify-center text-casa-muted group-hover:text-casa-navy transition-transform">
                      {completedSectionCollapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
                    </div>
                  </div>

                  <AnimatePresence initial={false}>
                    {!completedSectionCollapsed && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        className="space-y-0.5 overflow-hidden"
                      >
                        {completedReminders.map((evt) => {
                          const avatarPeople = evt.members.map((m) => ({
                            id: m.family_member?.id || m.id,
                            name: m.family_member?.name || 'Member',
                            color: m.family_member?.color_hex || 'var(--color-casa-navy)',
                          }))

                          return (
                            <div
                              key={evt.id}
                              role="button"
                              tabIndex={0}
                              data-tactile="true"
                              data-calendar-event
                              data-sidecar-loadable="true"
                              data-event-id={evt.id}
                              onClick={() => onOpenEvent(evt)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  onOpenEvent(evt)
                                }
                              }}
                              className="w-full flex items-center justify-between py-1 px-2 rounded-xl transition-all duration-150 cursor-pointer group gap-2.5 select-none active:scale-[0.99] min-h-[36px] bg-emerald-500/[0.04] border border-emerald-500/15 hover:bg-emerald-500/[0.08]"
                            >
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <IconButton
                                  size="sm"
                                  variant="ghost"
                                  onClick={async (e) => {
                                    e.stopPropagation()
                                    try {
                                      navigator.vibrate?.(10)
                                    } catch {}
                                    await handleToggleReminder(evt.id)
                                  }}
                                  className="rounded-full shrink-0 transition-all duration-150 text-emerald-700 hover:text-emerald-900 bg-emerald-100/70 hover:bg-emerald-200 h-6 w-6 min-h-0 p-0"
                                  aria-label={`Mark ${evt.title} incomplete`}
                                  icon={<CheckCircle2 size={16} className="text-emerald-600" />}
                                />

                                {evt.all_day ? (
                                  <span className="font-sans text-caption font-semibold text-casa-muted/70 shrink-0">
                                    All Day
                                  </span>
                                ) : (
                                  <span className="font-mono text-caption font-semibold text-casa-muted/70 shrink-0 tabular-nums">
                                    {format(parseISO(evt.start_time), 'h:mm a')}
                                  </span>
                                )}

                                <span className="text-body-sm truncate transition-colors flex-1 line-through text-casa-muted/70">
                                  {evt.title}
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                                {avatarPeople.length > 0 && <PersonAvatarStack people={avatarPeople} size="sm" max={2} />}
                                <ChevronRight
                                  size={14}
                                  className="text-casa-muted/40 group-hover:text-casa-navy transition-transform group-hover:translate-x-0.5"
                                />
                              </div>
                            </div>
                          )
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* 3. Today's Schedule (Appointments + Past Completed Events) */}
          {(upcomingAppointments.length > 0 || pastEvents.length > 0) && (
            <div className={cn(
              'flex-col justify-start pt-3.5 pb-3.5 border-b border-casa-border/50 space-y-1 px-1',
              mobileSubTab === 'schedule' ? 'flex' : 'hidden lg:flex'
            )}>
              <div
                role="button"
                tabIndex={0}
                onClick={toggleScheduleSection}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    toggleScheduleSection()
                  }
                }}
                className="w-full flex items-center justify-between px-1 py-1.5 -mx-1 rounded-xl hover:bg-casa-surface-subtle/70 transition-colors cursor-pointer select-none group min-h-[44px]"
                aria-expanded={!scheduleSectionCollapsed}
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-casa-gold/20 text-casa-navy flex items-center justify-center font-bold shrink-0">
                    <Calendar size={13} className="text-casa-gold" />
                  </div>
                  <h3 className="font-sans text-body-sm font-bold text-casa-navy tracking-tight group-hover:text-casa-gold transition-colors">
                    Today's Schedule
                  </h3>
                  {upcomingAppointments.length > 0 ? (
                    <span className="px-1.5 py-0.5 rounded-full text-3xs font-semibold bg-casa-gold/15 text-casa-navy border border-casa-gold/30">
                      {upcomingAppointments.length}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-3xs font-semibold uppercase tracking-wider bg-emerald-500/15 text-emerald-800 border border-emerald-500/25">
                      <Check size={9} className="stroke-[3]" />
                      <span>Completed</span>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {upcomingAppointments.length > 0 && !scheduleSectionCollapsed && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        setCanvasSubmode('turbo')
                      }}
                      className="text-3xs font-semibold text-casa-gold uppercase tracking-wider hover:underline min-h-[30px] h-7 px-1.5"
                    >
                      Expand All
                    </Button>
                  )}
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center text-casa-muted group-hover:text-casa-navy transition-transform">
                    {scheduleSectionCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                  </div>
                </div>
              </div>

              <AnimatePresence initial={false}>
                {!scheduleSectionCollapsed && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden space-y-1"
                  >

              {/* Collapsible Past Events */}
              {pastEvents.length > 0 && (
                <div className="mb-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    fullWidth
                    align="between"
                    onClick={() => setShowPastEvents(!showPastEvents)}
                    className="min-h-[30px] h-8 py-0.5 px-2 rounded-lg bg-casa-surface-subtle/80 hover:bg-casa-surface-subtle text-caption text-casa-muted hover:text-casa-navy border border-casa-border/30 transition-colors"
                  >
                    <span className="inline-flex items-center gap-1.5 font-normal">
                      <CheckCircle2 size={12} className="text-emerald-600/80 shrink-0" />
                      <span>{pastEvents.length} completed earlier today</span>
                    </span>
                    {showPastEvents ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </Button>

                  <AnimatePresence>
                    {showPastEvents && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-0.5 pt-0.5 overflow-hidden"
                      >
                        {pastEvents.map((evt) => (
                          <div
                            key={evt.id}
                            data-calendar-event
                            data-sidecar-loadable="true"
                            data-event-id={evt.id}
                            onClick={() => onOpenEvent(evt)}
                            className="flex items-center justify-between px-2 py-1 rounded-xl opacity-45 hover:opacity-85 transition-all cursor-pointer bg-casa-bg/30 text-caption border border-casa-border/20 group min-h-[32px]"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {evt.all_day ? (
                                <span className="font-sans text-caption font-normal text-casa-muted shrink-0">
                                  All Day
                                </span>
                              ) : (
                                <span className="font-mono text-xs font-semibold text-casa-muted shrink-0 tabular-nums">
                                  {format(parseISO(evt.start_time), 'h:mm a')}
                                </span>
                              )}
                              <span className="truncate line-through text-casa-muted group-hover:text-casa-navy">
                                {evt.title}
                              </span>
                              {evt.location_name && (
                                <span className="text-2xs text-casa-muted truncate hidden sm:inline">
                                  · {evt.location_name}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {evt.members.map((m) => (
                                <span
                                  key={m.id}
                                  className="w-2 h-2 rounded-full"
                                  style={{
                                    backgroundColor: m.family_member?.color_hex || 'var(--color-casa-muted)',
                                  }}
                                  title={m.family_member?.name}
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Upcoming Appointments List */}
              {upcomingAppointments.length > 0 && (
                <div className="space-y-0.5">
                  {upcomingAppointments.map((evt) => {
                    let isNow = false
                    try {
                      const start = parseISO(evt.start_time).getTime()
                      const end = parseISO(evt.end_time).getTime()
                      const currentTime = now.getTime()
                      isNow = !evt.all_day && currentTime >= start && currentTime <= end
                    } catch {
                      // Ignore parse errors
                    }

                    const driverMember = evt.members.find(
                      (m) =>
                        m.family_member?.name &&
                        (evt.title.toLowerCase().includes(m.family_member.name.toLowerCase() + ' drives') ||
                          evt.title.toLowerCase().includes('picked up by ' + m.family_member.name.toLowerCase()) ||
                          m.role?.toLowerCase() === 'driver')
                    )

                    const avatarPeople = evt.members.map((m) => ({
                      id: m.family_member?.id || m.id,
                      name: m.family_member?.name || 'Member',
                      color: m.family_member?.color_hex || 'var(--color-casa-navy)',
                    }))

                    return (
                      <div
                        key={evt.id}
                        role="button"
                        tabIndex={0}
                        data-tactile="true"
                        data-calendar-event
                        data-sidecar-loadable="true"
                        data-event-id={evt.id}
                        onClick={() => onOpenEvent(evt)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            onOpenEvent(evt)
                          }
                        }}
                        className={cn(
                          'w-full flex items-center justify-between py-1 px-2 rounded-xl transition-all duration-150 cursor-pointer group gap-2.5 active:scale-[0.98] min-h-[36px]',
                          isNow
                            ? 'bg-emerald-500/8 hover:bg-emerald-500/12 border border-emerald-500/30'
                            : 'hover:bg-casa-surface hover:shadow-2xs'
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          {evt.all_day ? (
                            <span className="font-sans text-caption font-semibold text-casa-muted/80 shrink-0">
                              All Day
                            </span>
                          ) : (
                            <span className="font-mono text-caption font-bold text-casa-navy shrink-0 tabular-nums">
                              {format(parseISO(evt.start_time), 'h:mm a')}
                            </span>
                          )}
                          <span className="text-body-sm font-normal text-casa-navy truncate group-hover:text-casa-navy transition-colors">
                            {evt.title}
                          </span>
                          {evt.location_name && (
                            <span className="text-caption text-casa-muted font-normal truncate hidden md:inline">
                              · {evt.location_name}
                            </span>
                          )}
                          {isNow && (
                            <span className="inline-flex items-center gap-1 text-3xs font-bold uppercase tracking-wider text-emerald-800 bg-emerald-500/20 px-1.5 py-0.2 rounded-full shrink-0">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                              Now
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {driverMember?.family_member?.name && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-caption font-bold bg-white text-casa-navy border border-casa-border/60 shadow-2xs hidden sm:inline-flex">
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: driverMember.family_member.color_hex || 'var(--color-casa-navy)' }}
                              />
                              <span>{driverMember.family_member.name} drives</span>
                            </span>
                          )}
                          <PersonAvatarStack people={avatarPeople} size="sm" max={2} />
                          <ChevronRight
                            size={14}
                            className="text-casa-muted/40 group-hover:text-casa-navy transition-transform group-hover:translate-x-0.5"
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* 4. Tomorrow's Schedule Preview */}
          <div className={cn(
            'flex-col justify-start pt-3.5 pb-1 space-y-1 px-1',
            mobileSubTab === 'schedule' ? 'flex' : 'hidden lg:flex'
          )}>
            <div
              role="button"
              tabIndex={0}
              onClick={toggleTomorrowSection}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  toggleTomorrowSection()
                }
              }}
              className="w-full flex items-center justify-between px-1 py-1.5 -mx-1 rounded-xl hover:bg-casa-surface-subtle/70 transition-colors cursor-pointer select-none group min-h-[44px]"
              aria-expanded={!tomorrowSectionCollapsed}
            >
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-slate-500/10 text-slate-800 flex items-center justify-center font-bold shrink-0">
                  <Calendar size={13} className="text-slate-700" />
                </div>
                <h3 className="font-sans text-body-sm font-bold text-casa-navy tracking-tight group-hover:text-casa-navy transition-colors">
                  Tomorrow's Schedule
                </h3>
                <span className="px-1.5 py-0.5 rounded-full text-3xs font-semibold bg-slate-500/10 text-slate-800 border border-slate-500/20">
                  {tomorrowEvents.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {!tomorrowSectionCollapsed && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      setActiveView('stacked')
                      navigateTo('/calendar')
                    }}
                    className="text-3xs font-semibold text-casa-gold uppercase tracking-wider hover:underline min-h-[30px] h-7 px-1.5"
                  >
                    Full Calendar
                  </Button>
                )}
                <div className="w-6 h-6 rounded-lg flex items-center justify-center text-casa-muted group-hover:text-casa-navy transition-transform">
                  {tomorrowSectionCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                </div>
              </div>
            </div>

            <AnimatePresence initial={false}>
              {!tomorrowSectionCollapsed && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden space-y-1"
                >
                  {tomorrowEvents.length > 0 ? (
                    <div className="space-y-0.5">
                      {tomorrowEvents.map((evt) => {
                        const driverMember = evt.members.find(
                          (m) =>
                            m.family_member?.name &&
                            (evt.title.toLowerCase().includes(m.family_member.name.toLowerCase() + ' drives') ||
                              evt.title.toLowerCase().includes('picked up by ' + m.family_member.name.toLowerCase()) ||
                              m.role?.toLowerCase() === 'driver')
                        )

                        const avatarPeople = evt.members.map((m) => ({
                          id: m.family_member?.id || m.id,
                          name: m.family_member?.name || 'Member',
                          color: m.family_member?.color_hex || 'var(--color-casa-navy)',
                        }))

                        return (
                          <div
                            key={evt.id}
                            role="button"
                            tabIndex={0}
                            data-tactile="true"
                            data-calendar-event
                            data-sidecar-loadable="true"
                            data-event-id={evt.id}
                            onClick={() => onOpenEvent(evt)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                onOpenEvent(evt)
                              }
                            }}
                            className="w-full flex items-center justify-between py-1 px-2 rounded-xl transition-all duration-150 cursor-pointer group gap-2.5 hover:bg-casa-surface hover:shadow-2xs active:scale-[0.98] min-h-[36px]"
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              {evt.all_day ? (
                                <span className="font-sans text-caption font-semibold text-casa-muted/80 shrink-0">
                                  All Day
                                </span>
                              ) : (
                                <span className="font-mono text-caption font-bold text-casa-navy shrink-0 tabular-nums">
                                  {format(parseISO(evt.start_time), 'h:mm a')}
                                </span>
                              )}
                              <span className="text-body-sm font-normal text-casa-navy truncate group-hover:text-casa-navy transition-colors">
                                {evt.title}
                              </span>
                              {evt.location_name && (
                                <span className="text-caption text-casa-muted font-normal truncate hidden md:inline">
                                  · {evt.location_name}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {driverMember?.family_member?.name && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-semibold bg-amber-500/10 text-amber-900 border border-amber-500/20 hidden sm:inline-flex">
                                  <Car size={11} className="text-amber-800 shrink-0" />
                                  <span>{driverMember.family_member.name} drives</span>
                                </span>
                              )}
                              <PersonAvatarStack people={avatarPeople} size="sm" max={2} />
                              <ChevronRight
                                size={14}
                                className="text-casa-muted/40 group-hover:text-casa-navy transition-transform group-hover:translate-x-0.5"
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="py-2.5 px-3 text-center text-caption text-casa-muted">
                      No appointments scheduled for tomorrow.
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}
