import { useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
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
import { motion, AnimatePresence, useMotionValue, animate } from 'framer-motion'
import { useCalmKioskPresenter } from '../../hooks/useCalmKioskPresenter'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import { useAppStore } from '../../stores/appStore'
import { useCalendarStore } from '../../stores/calendarStore'
import { cn } from '../../utils/cn'
import { Button, IconButton, Skeleton, SkeletonRow } from '../ui'
import { getDisplayMemberColor } from '../../design-system/memberColors'
import TomorrowPrepWidget from './widgets/TomorrowPrepWidget'
import ImminentTransitWidget from './widgets/ImminentTransitWidget'
import { useHeroIntelligence } from '../../hooks/useHeroIntelligence'
import MorningLaunchpadWidget from './widgets/MorningLaunchpadWidget'
import MiddayLogisticsWidget from './widgets/MiddayLogisticsWidget'
import GmailSyncStatusIndicator from '../shared/GmailSyncStatusIndicator'
import BounceScroll from '../shared/BounceScroll'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import SystemHealthBanner from '../shared/SystemHealthBanner'
import HouseholdDispatchCard from './widgets/HouseholdDispatchCard'
import TodaysScheduleWidget from './widgets/TodaysScheduleWidget'
import TodaysTodosWidget from './widgets/TodaysTodosWidget'
import TomorrowPreviewWidget from './widgets/TomorrowPreviewWidget'
import HeroFlybyCard from './widgets/HeroFlybyCard'
interface CalmKioskViewProps {
  onOpenEvent: (event: EventWithDetails) => void
}

export default function CalmKioskView({ onOpenEvent }: CalmKioskViewProps) {
  const dinnerPlan = useAppStore((s) => s.dinnerPlan)
  const setActiveView = useCalendarStore((s) => s.setActiveView)
  // Which event card should show the gold "open" ring -- mirrors StackedView's own
  // derivation exactly, so a card looks identically selected wherever it's tapped from.
  const { selectedSidecarEventId, aiDrawerOpen, sidecarTab } = useAppStore()
  const activeEventId = aiDrawerOpen && sidecarTab === 'event' ? selectedSidecarEventId : null
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

  // 2026-09-24: desktop/kiosk right rail (Schedule/To-Dos/Tomorrow) scrolls
  // independently of the left rail (Hero/Ahead) -- a real separate overflow
  // container per rail, not a shared-page-scroll sticky trick, so scrolling one
  // rail genuinely cannot move the other. Tracks its own scroll edges to fade a
  // top/bottom cue in and out as a scroll affordance.
  //
  // The functional setState form below is load-bearing, not stylistic: a
  // native `scroll` event fires on essentially every frame during a touch-
  // drag or momentum scroll, and `onScroll` -> setState with a fresh object
  // every time would re-render this entire (large) component that many times
  // per scroll gesture. Returning the SAME object reference when atTop/
  // atBottom haven't actually changed lets React bail out of re-rendering for
  // every one of those in-between ticks -- only the two real transitions
  // (leaving top, reaching bottom) cause a render.
  // 2026-09-24 follow-up: the rail's iOS-style rubber-band bounce (BounceScroll)
  // only makes sense at the lg: breakpoint where this rail is actually its own
  // scroll container -- at mobile widths it's a plain block participating in
  // the page's own scroll (see the mobileSubTab tab layout below), and
  // BounceScroll's own touch listeners would call preventDefault() on every
  // touchmove there (its "cannotScroll" edge case is always true when nothing
  // constrains this div's height), breaking native mobile scroll entirely.
  // isDesktop gates which wrapper actually mounts, rather than trying to make
  // BounceScroll itself responsive via CSS alone.
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const scheduleRailRef = useRef<HTMLDivElement | null>(null)
  const [scheduleRailEdge, setScheduleRailEdge] = useState({ atTop: true, atBottom: true })
  const handleScheduleRailScroll = useCallback(() => {
    const el = scheduleRailRef.current
    if (!el) return
    const atTop = el.scrollTop <= 2
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 2
    setScheduleRailEdge((prev) => (prev.atTop === atTop && prev.atBottom === atBottom ? prev : { atTop, atBottom }))
  }, [])
  useEffect(() => {
    const el = scheduleRailRef.current
    if (!el) return
    handleScheduleRailScroll()
    const observer = new ResizeObserver(() => handleScheduleRailScroll())
    observer.observe(el)
    return () => observer.disconnect()
  }, [handleScheduleRailScroll])

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

  // useCallback so TomorrowPreviewWidget's React.memo actually skips
  // re-rendering on the home screen's every-10-second clock tick (2026-09-13).
  const toggleTomorrowSection = useCallback(() => {
    setTomorrowSectionCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem('casa:calm:tomorrow-collapsed', String(next))
      } catch {
        // ignore — best-effort localStorage write
      }
      return next
    })
  }, [])

  const {
    now,
    isTodayEventsPending,
    dispatchHeadline,
    dispatchWeekDays,
    dispatchHorizon,
    timeHorizonLabel,
    pastEvents,
    upcomingAppointments,
    todayReminders,
    openReminders,
    overdueReminders,
    activeReminders,
    completedReminders,
    todayTimedReminders,
    tomorrowTimedReminders,
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

  // Stable references so HouseholdDispatchCard/TomorrowPreviewWidget's
  // React.memo can actually skip re-rendering (2026-09-13).
  const handleViewFullCalendar = useCallback(() => {
    setActiveView('stacked')
    navigateTo('/calendar')
  }, [setActiveView, navigateTo])
  const handleRefreshDispatch = useCallback(() => {
    void refreshBriefing()
  }, [refreshBriefing])

  const heroIntel = useHeroIntelligence(now, upcomingAppointments, familyMembers, heroManualView || 'today')

  // Today's remaining events the Hero swipe deck can page through, beyond
  // whichever one the archetype system is already spotlighting as slide one.
  const heroFlybyEvents = useMemo(
    () => upcomingAppointments.filter((e) => e.id !== heroIntel.imminentEvent?.id),
    [upcomingAppointments, heroIntel.imminentEvent],
  )
  const heroPrimaryKey = `${heroIntel.archetype}-${heroIntel.imminentEvent?.id ?? ''}`

  // Bug found 2026-09-23 while chasing a Playwright failure: an empty
  // upcomingAppointments array looks identical whether the day is genuinely
  // clear or the events query just hasn't resolved yet, and every widget
  // below treats it as "clear". Confirmed live (Playwright clock pinned to a
  // real departure window): at t=0 right after page load, this screen was
  // confidently rendering "Afternoon Logistics Clear" for a day that in fact
  // had a real appointment 24 minutes from its leave-by time -- for the
  // single highest-stakes card in the app ("when do I need to leave"), a
  // confident wrong answer is worse than a visible loading state. Gate on
  // isPending (all hooks above have already run, so this early return is
  // Rules-of-Hooks safe) rather than adding loading checks to every widget
  // individually.
  if (isTodayEventsPending) {
    return (
      <div className="w-full h-full flex flex-col justify-start px-4 sm:px-6 lg:px-8 xl:px-10 pt-5 sm:pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-8 overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-4 items-start">
          <div className="flex flex-col gap-8">
            <Skeleton className="w-full h-72 rounded-3xl" />
            <Skeleton className="w-full h-40 rounded-3xl" />
          </div>
          <div className="flex flex-col gap-3">
            <Skeleton className="w-full h-10 rounded-2xl mb-2" />
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        </div>
      </div>
    )
  }

  // Shared between the desktop BounceScroll wrapper and the plain mobile
  // wrapper below -- defined once so the two don't drift out of sync.
  const scheduleRailItems = (
    <>
      {/* Today's Schedule — leads the right column, side by side with Hero at the top */}
      <div className={cn(
        mobileSubTab === 'schedule' ? 'flex flex-col' : 'hidden lg:flex lg:flex-col'
      )}>
        <TodaysScheduleWidget
          now={now}
          pastEvents={pastEvents}
          upcomingAppointments={upcomingAppointments}
          reminders={todayTimedReminders}
          household={familyMembers}
          activeEventId={activeEventId}
          collapsed={scheduleSectionCollapsed}
          onToggleCollapsed={toggleScheduleSection}
          onExpandAll={() => setCanvasSubmode('turbo')}
          onOpenEvent={onOpenEvent}
        />
      </div>

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

      <div className={cn(mobileSubTab === 'schedule' ? 'flex flex-col' : 'hidden lg:flex lg:flex-col')}>
        <TomorrowPreviewWidget
          now={now}
          tomorrowEvents={tomorrowEvents}
          reminders={tomorrowTimedReminders}
          household={familyMembers}
          activeEventId={activeEventId}
          collapsed={tomorrowSectionCollapsed}
          onToggleCollapsed={toggleTomorrowSection}
          onViewFullCalendar={handleViewFullCalendar}
          onOpenEvent={onOpenEvent}
        />
      </div>
    </>
  )

  return (
    <div className="w-full h-full flex flex-col justify-start px-4 sm:px-6 lg:px-8 xl:px-10 pt-5 sm:pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-0 overflow-y-auto overscroll-contain touch-pan-y scrollbar-hide lg:overflow-hidden">
      {/* ── Gmail Sync Health Warning Banner ── */}
      <GmailSyncStatusIndicator variant="banner" className="mb-5 shrink-0" />
      <SystemHealthBanner className="mb-5 shrink-0" />

      {/* ── Ambient status strip: only the real-time child-location badges,
          no greeting text/heading -- removed per live feedback 2026-09-12
          ("remove Good Morning, move everything up"). Renders nothing when
          there's no live status to show. ── */}
      {ambientRoutineStatuses.length > 0 && (
        <div className="hidden lg:flex flex-wrap items-center gap-2 pb-4 shrink-0">
          {ambientRoutineStatuses.map((status, idx) => {
            const childMember = familyMembers.find((m) => m.name.toLowerCase() === status.childName.toLowerCase())
            const childDotColor = getDisplayMemberColor(childMember?.color_hex)
            return (
              <span
                key={idx}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-casa-surface-subtle border border-casa-border/50 text-casa-navy text-caption font-medium"
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
      )}

      {/* ── Mobile View Switcher (Only visible on small screens < lg) ── */}
      <div className="lg:hidden flex items-center justify-between pb-3 mb-1 border-b border-casa-border/40 shrink-0">
        <div className="inline-flex p-1 rounded-2xl bg-casa-surface border border-casa-border/60 w-full justify-center gap-1">
          <Button
            size="sm"
            variant={mobileSubTab === 'schedule' ? 'primary' : 'ghost'}
            onClick={() => setMobileSubTab('schedule')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-caption font-bold transition-all min-h-[42px]',
              mobileSubTab === 'schedule'
                ? 'bg-casa-navy text-white'
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
                ? 'bg-amber-500 text-white'
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
                ? 'bg-casa-gold text-casa-navy'
                : 'text-casa-muted hover:text-casa-navy'
            )}
          >
            <Utensils size={14} />
            <span>Dinner</span>
          </Button>
        </div>
      </div>

      {/* ── Two independent columns, not a shared-row grid (2026-09-13): a card's
          height should hug its own content, never stretch to match whatever's
          taller in the same row -- CSS Grid's shared row-track height does
          exactly that (and `items-stretch`/`items-start` both suffer it, since
          row height is set by the tallest occupant either way), so each side
          gets its own flex column instead. Every card keeps the same gap-8
          to whatever comes next in ITS column, regardless of the other
          column's total height. Left: Hero, Ahead. Right: Schedule,
          To-Dos, Tomorrow -- Hero and Schedule still land side by side at the
          top since each leads its own column. (Tonight's Kitchen removed
          from this column 2026-09-18, per direct request -- the flex-col
          gap-8 column closes up automatically with nothing else needed.)
          At lg:, this row fills the remaining viewport height (flex-1 +
          min-h-0 on the grid, itself inside the outer lg:overflow-hidden
          container) and the two columns get genuinely SEPARATE scroll
          contexts (2026-09-24, per direct request, replacing an earlier
          position:sticky version): left column (Hero + Ahead) never
          scrolls at all, right column (Schedule/To-Dos/Tomorrow) gets its
          own `overflow-y-auto`. Scrolling one can never move the other --
          they aren't sharing a scroll surface the way a sticky sidebar
          would. `items-stretch` at lg: (the grid default) is what gives
          both columns the full row height to work with; mobile keeps
          `items-start` since it's a single stacked column there. Mobile is
          otherwise untouched -- it already renders a completely different
          single-column tab layout via mobileSubTab, gated lg:hidden/lg:flex
          throughout this block. ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-4 items-start lg:items-stretch lg:flex-1 lg:min-h-0">
        <div className="flex flex-col gap-8">
        {/* Hero Next Up Card */}
        <div className={cn(
          'flex-col justify-start',
          mobileSubTab === 'triage' ? 'hidden lg:flex' : 'flex'
        )}>
          <HeroSwipeDeck
            now={now}
            primaryKey={heroPrimaryKey}
            flybyEvents={heroFlybyEvents}
            onOpenEvent={onOpenEvent}
            primarySlide={
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
            }
          />
        </div>

        <div className={cn('flex-col', mobileSubTab === 'triage' ? 'hidden lg:flex' : 'flex')}>
          <HouseholdDispatchCard
            timeHorizonLabel={timeHorizonLabel}
            headline={dispatchHeadline}
            weekDays={dispatchWeekDays}
            horizon={dispatchHorizon}
            isRefreshing={isRefreshing}
            onRefresh={handleRefreshDispatch}
          />
        </div>
        </div>

        {/* lg:flex-1 lg:min-h-0 here is load-bearing, not decorative: this div's
            own parent is `flex flex-col` (the right grid column), and a
            flex-col's default cross-axis stretch only affects WIDTH, not
            height -- a plain block child with no flex-basis of its own just
            sizes to its own content instead of filling the available height,
            which BounceScroll's `h-full` then has nothing real to resolve
            against. Without this, the rail's true scrollable height is
            whatever it happens to compute to rather than a guaranteed match
            for the actual available viewport space (found 2026-09-24, after
            a user report of content being unreachable at the bottom of the
            rail -- this was the most likely structural cause). */}
        <div className="relative lg:min-h-0 lg:flex-1">
        {isDesktop ? (
          <BounceScroll
            className="lg:h-full"
            innerClassName="flex flex-col gap-8 lg:pr-1 lg:pb-16 scrollbar-hide"
            innerRef={scheduleRailRef}
            onScroll={handleScheduleRailScroll}
          >
            {scheduleRailItems}
          </BounceScroll>
        ) : (
          <div className="flex flex-col gap-8">{scheduleRailItems}</div>
        )}
        {/* Top/bottom scroll-edge fades -- desktop/kiosk only, purely a scroll
            affordance so it's obvious there's more above/below. Real gradient
            overlays, not a scrollbar, to match the app's chrome-light feel
            elsewhere (the outer page container hides its own scrollbar too). */}
        <div
          aria-hidden="true"
          className={cn(
            'hidden lg:block pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-casa-bg to-transparent transition-opacity duration-200',
            scheduleRailEdge.atTop ? 'opacity-0' : 'opacity-100',
          )}
        />
        <div
          aria-hidden="true"
          className={cn(
            'hidden lg:block pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-casa-bg to-transparent transition-opacity duration-200',
            scheduleRailEdge.atBottom ? 'opacity-0' : 'opacity-100',
          )}
        />
        </div>
      </div>

          {/* Mobile Triage Card (Visible on mobile when triage tab is active) */}
          {mobileSubTab === 'triage' && (
            <div className="lg:hidden flex flex-col gap-3">
              {/* Header card */}
              <div className="rounded-3xl p-5 bg-casa-surface border border-amber-500/30 flex items-center justify-between">
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
                  className="rounded-3xl p-4 bg-casa-surface border border-amber-500/30 flex flex-col gap-2.5"
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
                  className="rounded-3xl p-4 bg-casa-surface border border-emerald-500/30 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-emerald-700 text-caption font-bold uppercase tracking-wider">
                      <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                      <span>{prep.type || 'Prep Item'}</span>
                    </div>
                    <p className="text-body-sm font-semibold text-casa-navy line-clamp-2 mt-0.5">
                      {prep.description}
                    </p>
                    {prep.event_title && (
                      <p className="text-caption text-casa-muted">For {prep.event_title}</p>
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
                  <h4 className="font-display text-body-lg font-bold text-casa-navy line-clamp-2">
                    {dinnerPlan.title}
                  </h4>
                  <p className="text-caption text-casa-text-secondary mt-0.5">
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
                      className="text-caption font-bold text-casa-navy hover:text-casa-gold min-h-[36px] px-3"
                    >
                      <span>View Recipe</span>
                      <ChevronRight size={13} className="ml-0.5" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

    </div>
  )
}

// How long the hero waits after the user swipes away before snapping back to
// the algorithmically-chosen "live" slide (slide zero). Matches the resting
// pattern already proven on the classic Home page's own hero carousel.
const HERO_IDLE_REVERT_MS = 9000
const HERO_SLIDE_GAP = 20

/**
 * Wraps the existing archetype-selected Hero (unchanged, always slide zero)
 * in a horizontal swipe deck so the rest of today's events can be paged
 * through as HeroFlybyCard slides. Ports the drag/spring/resting-index
 * mechanics from HomePage.tsx's HeroCarousel rather than reinventing them.
 */
function HeroSwipeDeck({
  now,
  primaryKey,
  primarySlide,
  flybyEvents,
  onOpenEvent,
}: {
  now: Date
  primaryKey: string
  primarySlide: ReactNode
  flybyEvents: EventWithDetails[]
  onOpenEvent: (event: EventWithDetails) => void
}) {
  const slideCount = 1 + flybyEvents.length
  const multi = slideCount > 1

  // 2026-09-24 DIAGNOSTIC (see casa_tabor_pi_ux_lag_investigation memory): the
  // 2026-09-13 CDP investigation isolated THIS component specifically as the
  // remaining source of kiosk touch-scroll jank after ruling out shadows/CPU
  // load. Framer Motion's drag="x" below means a non-passive gesture listener
  // is live on this surface any time there's more than one slide (nearly
  // always) -- its mere presence, not any per-event cost, is a known cause of
  // the browser falling off the compositor-thread scroll fast path onto the
  // main thread, which matches the "~91% idle but still janky" profile from
  // that investigation far better than a raw CPU cost would. Forcing drag off
  // here is a live test of that theory, same spirit as the shadow-removal
  // test just before it (revert by deleting this block and restoring the
  // original `multi && viewportWidth > 0 ? 'x' : false` below) -- it does
  // disable the flyby swipe gesture while this test is live.
  const DIAGNOSTIC_DISABLE_HERO_DRAG = true

  // `override` holds the user's manually-swiped-to slide. While null, the
  // deck simply rests on slide zero (the live archetype view). A debounced
  // timer clears the override so an idle kiosk always drifts back to truth.
  const [override, setOverride] = useState<number | null>(null)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const effectiveIndex = Math.max(0, Math.min(slideCount - 1, override ?? 0))

  useEffect(() => () => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
  }, [])

  // The "live" slide changed identity (a new event became imminent, the
  // archetype flipped, the day rolled over) -- drop any stale swipe position
  // rather than stranding the user on a slide that no longer makes sense.
  useEffect(() => {
    setOverride(null)
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
  }, [primaryKey])

  const [viewportWidth, setViewportWidth] = useState(0)
  const roRef = useRef<ResizeObserver | null>(null)
  const setViewportEl = useCallback((el: HTMLDivElement | null) => {
    if (roRef.current) {
      roRef.current.disconnect()
      roRef.current = null
    }
    if (!el) return
    setViewportWidth(el.offsetWidth)
    const ro = new ResizeObserver(() => setViewportWidth(el.offsetWidth))
    ro.observe(el)
    roRef.current = ro
  }, [])

  const x = useMotionValue(0)
  const hasPositionedRef = useRef(false)

  const goTo = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(slideCount - 1, next))
      setOverride(clamped)
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
      idleTimerRef.current = setTimeout(() => setOverride(null), HERO_IDLE_REVERT_MS)
    },
    [slideCount],
  )

  const springTo = useCallback(
    (index: number) => {
      if (viewportWidth === 0) return
      const target = -index * (viewportWidth + HERO_SLIDE_GAP)
      if (!hasPositionedRef.current) {
        hasPositionedRef.current = true
        x.set(target)
        return
      }
      return animate(x, target, { type: 'spring', stiffness: 300, damping: 34, mass: 0.9 })
    },
    [x, viewportWidth],
  )

  useEffect(() => {
    const controls = springTo(effectiveIndex)
    return () => controls?.stop()
  }, [effectiveIndex, springTo])

  return (
    <div className="relative w-full">
      <div ref={setViewportEl} className="overflow-hidden">
        <motion.div
          className="flex items-stretch"
          style={{ x, gap: HERO_SLIDE_GAP }}
          drag={DIAGNOSTIC_DISABLE_HERO_DRAG ? false : multi && viewportWidth > 0 ? 'x' : false}
          dragConstraints={{ left: -(slideCount - 1) * (viewportWidth + HERO_SLIDE_GAP), right: 0 }}
          dragElastic={0.14}
          dragMomentum={false}
          onDragEnd={(_e, info) => {
            if (!multi) return
            const threshold = Math.max(60, viewportWidth * 0.18)
            const flung = Math.abs(info.velocity.x) > 520
            let target = effectiveIndex
            if ((info.offset.x < -threshold || (flung && info.velocity.x < 0)) && effectiveIndex < slideCount - 1) {
              target = effectiveIndex + 1
            } else if ((info.offset.x > threshold || (flung && info.velocity.x > 0)) && effectiveIndex > 0) {
              target = effectiveIndex - 1
            }
            springTo(target)
            goTo(target)
          }}
        >
          {/* min-w-0 is load-bearing: without it, a flex item defaults to
              min-width:auto, so any descendant text wide enough (e.g. a long
              unwrapped location string) forces the slide wider than its own
              basis-full -- the overflow-hidden viewport then hard-clips the
              slide's right edge instead of the text wrapping inside it. Found
              2026-09-24 live: the primary slide was rendering ~1400px wide
              inside an 1182px viewport for exactly this reason. */}
          <div className="shrink-0 grow-0 basis-full min-w-0">{primarySlide}</div>
          {flybyEvents.map((evt) => (
            <div key={evt.id} className="shrink-0 grow-0 basis-full min-w-0">
              <HeroFlybyCard now={now} event={evt} onOpenEvent={onOpenEvent} />
            </div>
          ))}
        </motion.div>
      </div>

      {multi && (
        <div className="flex items-center justify-center gap-1 mt-3">
          {Array.from({ length: slideCount }).map((_, i) => (
            <IconButton
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Go to hero slide ${i + 1} of ${slideCount}`}
              aria-current={i === effectiveIndex}
              size="sm"
              variant="ghost"
              className="rounded-full"
              icon={
                <span
                  className={cn(
                    'mx-auto block h-1.5 rounded-full transition-all',
                    i === effectiveIndex ? 'w-6 bg-casa-gold' : 'w-1.5 bg-casa-text/25',
                  )}
                />
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
