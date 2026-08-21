import { useState, useMemo } from 'react'
import { format, parseISO, differenceInMinutes, subMinutes } from 'date-fns'
import {
  MapPin,
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
  Navigation,
  ArrowRight,
  Gift,
  RotateCw,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useCalmKioskPresenter } from '../../hooks/useCalmKioskPresenter'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import { useAppStore } from '../../stores/appStore'
import { useCalendarStore } from '../../stores/calendarStore'
import { cn } from '../../utils/cn'
import { formatDurationLong } from '../../utils/eventTime'
import { Button, IconButton, PersonAvatarStack, JourneyProgressBar } from '../ui'
import { getDisplayMemberColor } from '../../design-system/memberColors'
import TomorrowPrepWidget from './widgets/TomorrowPrepWidget'
import MorningLaunchpadWidget from './widgets/MorningLaunchpadWidget'
import MiddayLogisticsWidget from './widgets/MiddayLogisticsWidget'
import { useFamilyRoutineIntelligence } from '../../hooks/useFamilyRoutineIntelligence'
import { resolveEventDriver } from '../../lib/driverConflictEngine'
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
    nextEvent,
    primaryHeroEvent,
    concurrentEvents,
    selectedHeroEventId,
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
    minutesUntilNext,
    driveTimeMins,
    leaveAt,
    minutesUntilLeave,
    isTravelEvent,
    originName,
    destinationName,
    returnDestinationName,
    driverName,
    driverFamilyMemberId,
    prepSummaryText,
    locationDisplayText,
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

  const routineIntel = useFamilyRoutineIntelligence(now)
  const isNextEventFarAway = !nextEvent || (minutesUntilNext !== null && minutesUntilNext > 90)
  const showMorningLaunchpad = routineIntel.isMorning && routineIntel.hasTodayDepartures && isNextEventFarAway

  const isLeaveNow = Boolean(
    isTravelEvent &&
      minutesUntilLeave !== null &&
      minutesUntilLeave <= 0 &&
      minutesUntilNext !== null &&
      minutesUntilNext > 0 &&
      minutesUntilNext <= 60,
  )
  const isPrepUrgent = Boolean(
    isTravelEvent &&
      minutesUntilLeave !== null &&
      minutesUntilLeave > 0 &&
      minutesUntilLeave <= 15 &&
      minutesUntilNext !== null &&
      minutesUntilNext <= 75,
  )

  // Concept A: Flight Deck Radar (Upcoming On-Deck Items within 2.5 hours)
  const upcomingOnDeck = useMemo(() => {
    if (!nextEvent) return []
    const items: Array<{
      id: string
      title: string
      subtitle?: string
      timeFormatted: string
      driverName: string
      driverColor: string
      leaveByText?: string
      event?: EventWithDetails
      minutesFromNow: number
    }> = []

    const currentEventStartTime = (() => {
      try {
        return parseISO(nextEvent.start_time).getTime()
      } catch {
        return now.getTime()
      }
    })()

    // 1. Other daytime appointments today starting after current event or within 2.5 hours
    for (const evt of upcomingAppointments) {
      if (evt.id === nextEvent.id) continue
      if (evt.all_day) continue
      if (evt.id?.startsWith('routine-')) continue
      try {
        const start = parseISO(evt.start_time).getTime()
        const minsAway = differenceInMinutes(parseISO(evt.start_time), now)
        if (start >= currentEventStartTime - 15 * 60 * 1000 && minsAway <= 180 && minsAway > -30) {
          const { name: dName } = resolveEventDriver(evt, familyMembers)
          const dMember = familyMembers.find((m) => m.name.toLowerCase() === dName.toLowerCase())
          const dColor = getDisplayMemberColor(dMember?.color_hex)
          const leaveBy = evt.enrichment?.departure_time
            ? `Leave by ${format(parseISO(evt.enrichment.departure_time), 'h:mm a')}`
            : minsAway > 0
            ? `Starts in ${formatDurationLong(minsAway)}`
            : 'Starting soon'

          items.push({
            id: evt.id,
            title: evt.title,
            subtitle: evt.location_name || evt.address || undefined,
            timeFormatted: format(parseISO(evt.start_time), 'h:mm a'),
            driverName: dName,
            driverColor: dColor,
            leaveByText: leaveBy,
            event: evt,
            minutesFromNow: minsAway,
          })
        }
      } catch {}
    }

    // 2. School dismissals within the next 3 hours
    const rawStatuses = routineIntel.ambientStatuses || []
    for (const status of rawStatuses) {
      const isBak = status.venueName.toLowerCase().includes('bak')
      const fallbackDriver = isBak ? 'Jake' : 'Giselle'
      const driver = status.pickupDriverName || fallbackDriver
      const dMember = familyMembers.find((m) => m.name.toLowerCase() === driver.toLowerCase())
      const dColor = getDisplayMemberColor(dMember?.color_hex)

      const dismissalTimeStr = status.endsAtFormatted
      const match = dismissalTimeStr.match(/(\d+):(\d+)\s*(AM|PM)/i)
      if (match) {
        let hours = parseInt(match[1], 10)
        const mins = parseInt(match[2], 10)
        const period = match[3].toUpperCase()
        if (period === 'PM' && hours !== 12) hours += 12
        if (period === 'AM' && hours === 12) hours = 0
        const dismissalMinutesFromMidnight = hours * 60 + mins
        const nowMinutesFromMidnight = now.getHours() * 60 + now.getMinutes()
        const diffMins = dismissalMinutesFromMidnight - nowMinutesFromMidnight

        if (diffMins > 0 && diffMins <= 210) {
          items.push({
            id: `dismissal-${status.venueName}`,
            title: status.venueName,
            subtitle: `${status.childName} · School Dismissal`,
            timeFormatted: status.endsAtFormatted,
            driverName: `${driver} drives`,
            driverColor: dColor,
            leaveByText: isBak ? 'Leave by 3:08 PM' : 'Leave by 1:42 PM',
            minutesFromNow: diffMins,
          })
        }
      }
    }

    const seen = new Set<string>()
    const deduped: typeof items = []
    for (const it of items) {
      const key = `${it.title}-${it.timeFormatted}`
      if (!seen.has(key)) {
        seen.add(key)
        deduped.push(it)
      }
    }
    return deduped.sort((a, b) => a.minutesFromNow - b.minutesFromNow).slice(0, 2)
  }, [nextEvent, upcomingAppointments, routineIntel.ambientStatuses, familyMembers, now])

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
          {heroManualView === 'tomorrow' ? (
            <TomorrowPrepWidget
              now={now}
              showViewToggle={true}
              onToggleTodayView={() => setHeroManualView('today')}
            />
          ) : showMorningLaunchpad ? (
            <MorningLaunchpadWidget now={now} />
          ) : routineIntel.isDaytime && (!nextEvent || (minutesUntilNext !== null && minutesUntilNext > 30) || nextEvent.all_day) ? (
            <MiddayLogisticsWidget
              now={now}
              todayEvents={upcomingAppointments}
              familyMembers={familyMembers}
              nextEvent={nextEvent}
              onOpenEvent={onOpenEvent}
              onToggleTomorrowView={() => setHeroManualView('tomorrow')}
              isTomorrowActive={false}
            />
          ) : nextEvent ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              data-calendar-event
              data-sidecar-loadable="true"
              data-event-id={nextEvent.id}
              className={cn(
                'w-full rounded-3xl p-6 sm:p-7 bg-gradient-to-br from-casa-navy via-slate-900 to-slate-950 text-white border border-white/10 shadow-xl relative overflow-hidden group cursor-pointer transition-all duration-300',
                isLeaveNow
                  ? 'ring-2 ring-amber-400/60 shadow-glow-gold'
                  : isPrepUrgent
                  ? 'ring-1 ring-amber-400/30'
                  : '',
              )}
              onClick={() => onOpenEvent(nextEvent)}
            >
              {/* Background ambient glow */}
              <div className="absolute top-0 right-0 w-96 h-96 bg-casa-gold/10 rounded-full blur-3xl pointer-events-none" />

              <div>
                <div className="flex items-center justify-between gap-2 mb-4">
                  {(() => {
                    let statusLabel = 'NEXT UP'
                    let dotClass = 'bg-casa-gold'

                    const isUnderway = minutesUntilNext !== null && minutesUntilNext <= 0 && minutesUntilNext > -180
                    const effectiveMinsToLeave = minutesUntilLeave !== null ? minutesUntilLeave : (minutesUntilNext !== null ? minutesUntilNext - 10 : null)
                    const isAmbient = !isUnderway && ((effectiveMinsToLeave !== null && effectiveMinsToLeave > 60) || (minutesUntilNext !== null && minutesUntilNext > 60))

                    if (nextEvent.all_day) {
                      statusLabel = 'ALL DAY EVENT'
                      dotClass = 'bg-emerald-400'
                    } else if (isUnderway) {
                      try {
                        const end = parseISO(nextEvent.end_time)
                        const minsToEnd = differenceInMinutes(end, now)
                        if (minsToEnd <= 0) {
                          statusLabel = 'CONCLUDED · WRAPPING UP'
                          dotClass = 'bg-emerald-400'
                        } else if (minsToEnd <= 10) {
                          statusLabel = `WRAPPING UP · ENDS IN ${formatDurationLong(minsToEnd)}`
                          dotClass = 'bg-amber-400 animate-pulse'
                        } else {
                          statusLabel = 'HAPPENING NOW'
                          dotClass = 'bg-emerald-400 animate-pulse'
                        }
                      } catch {
                        statusLabel = 'HAPPENING NOW'
                        dotClass = 'bg-emerald-400 animate-pulse'
                      }
                    } else if (isAmbient) {
                      // Ambient Mode (More than 60 minutes away) — Peaceful, quiet, no anxiety
                      try {
                        statusLabel = `TODAY AT ${format(parseISO(nextEvent.start_time), 'h:mm a')}`
                      } catch {
                        statusLabel = 'NEXT UP'
                      }
                      dotClass = 'bg-casa-gold/80'
                    } else if (isTravelEvent) {
                      // Active Departure Window (≤ 60m away)
                      if (minutesUntilLeave !== null && minutesUntilLeave <= 0) {
                        statusLabel = minutesUntilLeave >= -5 ? 'TIME TO LEAVE NOW' : `EN ROUTE · ${driveTimeMins ? `${driveTimeMins}M DRIVE` : 'IN TRANSIT'}`
                        dotClass = 'bg-amber-400 animate-pulse'
                      } else if (minutesUntilLeave !== null && minutesUntilLeave <= 15) {
                        statusLabel = `PREPARE TO LEAVE · ${formatDurationLong(minutesUntilLeave)} BUFFER`
                        dotClass = 'bg-amber-400 animate-pulse'
                      } else if (minutesUntilLeave !== null && minutesUntilLeave <= 60) {
                        statusLabel = `LEAVE IN ${formatDurationLong(minutesUntilLeave)}`
                        dotClass = 'bg-emerald-400'
                      } else {
                        statusLabel = `TODAY AT ${format(parseISO(nextEvent.start_time), 'h:mm a')}`
                        dotClass = 'bg-casa-gold/80'
                      }
                    } else if (minutesUntilNext !== null && minutesUntilNext > 0) {
                      statusLabel = `STARTS IN ${formatDurationLong(minutesUntilNext)}`
                      dotClass = 'bg-emerald-400'
                    }

                    return (
                      <div className="flex items-center gap-2">
                        <span className={cn('w-2.5 h-2.5 rounded-full', dotClass)} />
                        <span className="text-caption font-bold uppercase tracking-widest text-casa-gold">
                          {statusLabel}
                        </span>
                      </div>
                    )
                  })()}

                  <div className="flex items-center gap-2">
                    {selectedHeroEventId && selectedHeroEventId !== primaryHeroEvent?.id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedHeroEventId(null)
                        }}
                        className="text-3xs text-casa-gold hover:text-white underline font-semibold transition-colors mr-1 cursor-pointer h-7 px-2 min-h-0"
                        title="Reset to primary priority event"
                      >
                        Reset to Primary
                      </Button>
                    )}
                    <span className="text-caption text-white/80 font-mono bg-white/10 px-3 py-1 rounded-full border border-white/10">
                      {nextEvent.all_day
                        ? 'All Day'
                        : `${format(parseISO(nextEvent.start_time), 'h:mm a')} – ${format(parseISO(nextEvent.end_time), 'h:mm a')}`}
                    </span>
                  </div>
                </div>

                <h2 className="font-display text-display-sm sm:text-display-md font-bold !text-white tracking-tight leading-tight group-hover:text-casa-gold transition-colors">
                  {nextEvent.title}
                </h2>

                {nextEvent.description && (
                  <p className="text-white/70 text-body-sm mt-2.5 line-clamp-2 leading-relaxed">
                    {nextEvent.description}
                  </p>
                )}

                {locationDisplayText && (
                  <div className="flex items-center gap-2 text-white/80 mt-2.5 text-body-sm">
                    <MapPin size={15} className="text-casa-gold shrink-0" />
                    <span className="truncate">{locationDisplayText}</span>
                  </div>
                )}

                {prepSummaryText && (
                  <div className="flex items-center gap-2 text-slate-300/90 mt-2 text-caption">
                    <Gift size={15} className="text-casa-gold shrink-0" />
                    <span className="font-semibold text-white/90 shrink-0">Bring:</span>
                    <span className="text-white/75 truncate">{prepSummaryText}</span>
                  </div>
                )}

                {/* Logistics Bar: Live Journey Tracker (≤ 60m) vs Peaceful Ambient Route Preview (> 60m) */}
                <div className="mt-5">
                  {(() => {
                    const isUnderway = minutesUntilNext !== null && minutesUntilNext <= 0 && minutesUntilNext > -180
                    const effectiveMinsToLeave = minutesUntilLeave !== null ? minutesUntilLeave : (minutesUntilNext !== null ? minutesUntilNext - 10 : null)
                    const isAmbient = !isUnderway && ((effectiveMinsToLeave !== null && effectiveMinsToLeave > 60) || (minutesUntilNext !== null && minutesUntilNext > 60))

                    if (!isAmbient) {
                      return (
                        <JourneyProgressBar
                          now={now}
                          leaveAt={isTravelEvent ? leaveAt : null}
                          startTime={nextEvent.start_time}
                          endTime={nextEvent.end_time}
                          driveTimeMins={isTravelEvent ? driveTimeMins : null}
                          isAllDay={Boolean(nextEvent.all_day)}
                          showLabels={true}
                          originName={originName}
                          destinationName={destinationName}
                          returnDestinationName={returnDestinationName}
                        />
                      )
                    }

                    return (
                      <div className="flex flex-wrap items-center justify-between gap-3 py-2.5 px-4 rounded-2xl bg-white/[0.04] border border-white/10 text-caption text-white/70">
                        <div className="flex items-center gap-2">
                          <Car size={14} className="text-casa-gold" />
                          <span className="font-medium text-white/90">
                            {originName} → {destinationName}
                          </span>
                          {driveTimeMins ? (
                            <span className="text-2xs font-mono font-bold px-2 py-0.5 rounded-full bg-white/10 text-casa-gold border border-white/10">
                              ~{driveTimeMins} min
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-1.5 text-2xs font-medium text-white/50">
                          <Clock size={12} className="text-casa-gold/70" />
                          <span>
                            {leaveAt
                              ? `Live tracking begins at ${format(subMinutes(leaveAt, 60), 'h:mm a')}`
                              : 'Live tracking activates 60m before departure'}
                          </span>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </div>

              {/* Members and Logistics Footer */}
              <div className="pt-5 mt-5 border-t border-white/10 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2 flex-wrap">
                  {nextEvent.members.map((m) => {
                    const isDriver =
                      Boolean(isTravelEvent &&
                        ((driverFamilyMemberId && m.family_member?.id === driverFamilyMemberId) ||
                        (driverName && m.family_member?.name?.toLowerCase() === driverName.toLowerCase())))

                    return (
                      <span
                        key={m.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-caption font-semibold bg-white/10 text-white border border-white/10 transition-all"
                        style={{
                          borderLeft: `3px solid ${m.family_member?.color_hex ?? 'var(--color-casa-gold)'}`,
                        }}
                      >
                        {isDriver && <Car size={13} className="text-casa-gold shrink-0" />}
                        <span>{m.family_member?.name}</span>
                      </span>
                    )
                  })}
                  {isTravelEvent && (nextEvent.address || nextEvent.location_name) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        const dest = encodeURIComponent(nextEvent.address || nextEvent.location_name || '')
                        window.open(`https://www.google.com/maps/search/?api=1&query=${dest}`, '_blank')
                      }}
                      title="Open navigation directions"
                      className="h-8 px-3 rounded-xl bg-casa-gold/20 hover:bg-casa-gold/30 text-casa-gold text-caption font-bold flex items-center gap-1.5 shrink-0 border border-casa-gold/40"
                    >
                      <Navigation size={13} className="text-casa-gold" />
                      <span>Directions</span>
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-1 text-casa-gold font-bold text-body-sm group-hover:translate-x-1 transition-transform">
                  <span>View Details</span>
                  <ChevronRight size={16} />
                </div>
              </div>

              {/* ── Concurrent Companion Events (Simultaneous Family Activities) ── */}
              {concurrentEvents.length > 0 && (
                <div className="mt-5 pt-4 border-t border-white/10">
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-caption font-bold uppercase tracking-widest text-casa-gold">
                        {concurrentEvents.length === 1
                          ? 'Also Happening Right Now'
                          : `Also Active (${concurrentEvents.length})`}
                      </span>
                    </div>
                    <span className="text-3xs text-white/40 uppercase tracking-wider font-medium">
                      Tap card to focus
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {concurrentEvents.map((evt) => {
                      let isUnderway = false
                      try {
                        const start = parseISO(evt.start_time).getTime()
                        const end = parseISO(evt.end_time).getTime()
                        isUnderway = !evt.all_day && now.getTime() >= start && now.getTime() <= end
                      } catch {}

                      const evtMember = evt.members?.[0]?.family_member
                      const isEvtTravel = Boolean(
                        !evt.all_day &&
                          evt.event_type !== 'reminder' &&
                          (evt.address || evt.location_name) &&
                          !['home', 'at home'].includes((evt.location_name || '').toLowerCase())
                      )

                      let prepSummary: string | null = null
                      if (evt.checklist && evt.checklist.length > 0) {
                        const pending = evt.checklist.filter((item) => !item.checked)
                        const list = pending.length > 0 ? pending : evt.checklist
                        const labels = list.map((item) => item.label?.trim()).filter(Boolean)
                        if (labels.length > 0) prepSummary = labels.join(' · ')
                      } else if (evt.enrichment?.what_to_bring) {
                        const raw = evt.enrichment.what_to_bring as unknown
                        if (Array.isArray(raw) && raw.length > 0) prepSummary = raw.join(' · ')
                        else if (typeof raw === 'string' && raw.trim()) prepSummary = raw.trim()
                      }

                      return (
                        <div
                          key={evt.id}
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedHeroEventId(evt.id)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              e.stopPropagation()
                              setSelectedHeroEventId(evt.id)
                            }
                          }}
                          className="group/item flex items-center justify-between gap-3 p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-casa-gold/50 transition-all cursor-pointer shadow-2xs active:scale-[0.98]"
                          title={`Focus on ${evt.title}`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                              {evtMember && (
                                <span
                                  className="inline-flex items-center px-2 py-0.5 rounded-full text-3xs font-bold text-white bg-white/15"
                                  style={{
                                    borderLeft: `3px solid ${evtMember.color_hex || 'var(--color-casa-gold)'}`,
                                  }}
                                >
                                  {evtMember.name}
                                </span>
                              )}
                              <span className="text-3xs text-white/60 font-mono">
                                {evt.all_day ? 'All Day' : `${format(parseISO(evt.start_time), 'h:mm a')}`}
                              </span>
                              {isUnderway && (
                                <span className="inline-flex items-center gap-1 text-3xs font-bold text-emerald-400">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                  Now
                                </span>
                              )}
                              {isEvtTravel && evt.enrichment?.drive_time_mins && (
                                <span className="text-3xs text-casa-gold font-semibold flex items-center gap-0.5">
                                  <Car size={10} />
                                  {evt.enrichment.drive_time_mins}m drive
                                </span>
                              )}
                            </div>

                            <h4 className="text-caption font-semibold text-white truncate group-hover/item:text-casa-gold transition-colors">
                              {evt.title}
                            </h4>

                            {prepSummary ? (
                              <p className="text-2xs text-white/70 truncate mt-0.5 flex items-center gap-1.5 font-normal">
                                <Gift size={11} className="text-casa-gold shrink-0" />
                                <span className="font-semibold text-white/85 shrink-0">Bring:</span>
                                <span className="truncate">{prepSummary}</span>
                              </p>
                            ) : evt.location_name ? (
                              <p className="text-2xs text-white/60 truncate flex items-center gap-1 mt-0.5 font-normal">
                                <MapPin size={11} className="text-casa-gold shrink-0" />
                                <span>{evt.location_name}</span>
                              </p>
                            ) : null}
                          </div>

                          <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-casa-gold/15 group-hover/item:bg-casa-gold/25 text-casa-gold text-caption font-bold shrink-0 transition-all border border-casa-gold/30">
                            <span className="text-2xs">Focus</span>
                            <ChevronRight size={13} className="group-hover/item:translate-x-0.5 transition-transform" />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── Concept A: Flight Deck Radar (Up Next on Deck Horizon) ── */}
              {concurrentEvents.length === 0 && upcomingOnDeck.length > 0 && (
                <div className="mt-5 pt-4 border-t border-white/10 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Clock size={13} className="text-casa-gold" />
                      <span className="text-caption font-bold uppercase tracking-widest text-casa-gold">
                        Up Next on Deck ({upcomingOnDeck.length})
                      </span>
                    </div>
                    <span className="text-3xs text-white/40 uppercase tracking-wider font-medium">
                      Today's Follow-up Sequence
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {upcomingOnDeck.map((item) => (
                      <div
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (item.event) onOpenEvent(item.event)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            e.stopPropagation()
                            if (item.event) onOpenEvent(item.event)
                          }
                        }}
                        className="p-3 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 transition-all flex flex-col justify-between space-y-1.5 cursor-pointer shadow-2xs group/deck min-h-[44px]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-caption font-mono font-bold text-white bg-white/10 px-2 py-0.5 rounded-md border border-white/10">
                            {item.timeFormatted}
                          </span>
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-caption font-bold bg-white/10 border border-white/15 text-white shadow-2xs">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: item.driverColor }}
                            />
                            <span>{item.driverName}</span>
                          </span>
                        </div>

                        <div>
                          <div className="text-body-sm font-bold text-white group-hover/deck:text-casa-gold transition-colors truncate">
                            {item.title}
                          </div>
                          {item.subtitle && (
                            <div className="text-caption text-white/60 truncate">
                              {item.subtitle}
                            </div>
                          )}
                        </div>

                        {item.leaveByText && (
                          <div className="text-caption text-casa-gold font-medium flex items-center gap-1.5 pt-1 border-t border-white/10">
                            <Car size={12} className="text-casa-gold shrink-0" />
                            <span>{item.leaveByText}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          ) : (
            <TomorrowPrepWidget
              now={now}
              showViewToggle={true}
              onToggleTodayView={() => setHeroManualView('today')}
            />
          )}

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
              {overdueReminders.length > 0 && (
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
                        {overdueReminders.length} {overdueReminders.length === 1 ? 'item' : 'items'} pending from earlier today
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

                                <span className="font-mono text-caption font-bold text-amber-950 shrink-0 tabular-nums">
                                  {format(parseISO(evt.start_time), 'h:mm a')}
                                </span>
                                <span className="px-1.5 py-0.5 rounded text-3xs font-bold uppercase tracking-wider bg-amber-500/25 text-amber-950 border border-amber-500/35 shrink-0">
                                  Overdue
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
              )}

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
