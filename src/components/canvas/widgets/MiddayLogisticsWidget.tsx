import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import {
  Sun,
  Moon,
  Clock,
  Car,
  MapPin,
  ShieldCheck,
  AlertTriangle,
  GraduationCap,
  House,
  RefreshCw,
  ExternalLink,
  Sparkles,
  Calendar,
  ArrowRight,
  ListTodo,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '../../../utils/cn'
import type { EventWithDetails } from '../../../hooks/useCalendarEvents'
import type { FamilyMember } from '../../../types'
import { useFamilyRoutineIntelligence } from '../../../hooks/useFamilyRoutineIntelligence'
import { useHeroTheme } from '../../../hooks/useHeroTheme'
import { analyzeDriverSchedule, resolveEventDriver, isEventAtHome, type DriverConflictItem } from '../../../lib/driverConflictEngine'
import { resolveCanonicalDeparture } from '../../../lib/canonicalEventDeparture'
import { supabase } from '../../../lib/supabase'
import {
  updateEventVenue,
  materializeSyntheticRoutineEvent,
  invalidateAllCalendarQueries,
} from '../../../lib/eventMutations'
import { saveEventTransportationOverride } from '../../../lib/eventPlanOverrides'
import { applyEventAggregatePatch } from '../../../lib/eventAggregateCache'

import { Button, IconButton } from '../../ui'

interface MiddayLogisticsWidgetProps {
  now?: Date
  todayEvents?: EventWithDetails[]
  openReminders?: EventWithDetails[]
  todayReminders?: EventWithDetails[]
  completedReminders?: EventWithDetails[]
  onToggleReminder?: (id: string) => void
  tomorrowEvents?: EventWithDetails[]
  familyMembers?: FamilyMember[]
  nextEvent?: EventWithDetails | null
  onOpenEvent?: (event: EventWithDetails) => void
  onToggleTomorrowView?: () => void
  isTomorrowActive?: boolean
  className?: string
}

interface SchoolDismissalGroup {
  id: string
  venueName: string
  dismissalTimeFormatted: string
  minutesFromMidnight: number
  childrenNames: string[]
  driverName: string
  driverColor?: string
  leaveByFormatted?: string
}

export default function MiddayLogisticsWidget({
  now = new Date(),
  todayEvents = [],
  openReminders = [],
  todayReminders = [],
  completedReminders = [],
  onToggleReminder,
  tomorrowEvents = [],
  familyMembers = [],
  nextEvent: _nextEvent = null,
  onOpenEvent,
  onToggleTomorrowView,
  isTomorrowActive = false,
  className,
}: MiddayLogisticsWidgetProps) {
  const queryClient = useQueryClient()
  const [resolvingActionId, setResolvingActionId] = useState<string | null>(null)
  const [dismissedConflictIds, setDismissedConflictIds] = useState<Set<string>>(new Set())
  const routineIntel = useFamilyRoutineIntelligence(now)
  const { heroTheme } = useHeroTheme(now)
  const isNavy = heroTheme === 'navy'

  // Driver conflict calculation
  const driverAnalysis = useMemo(() => {
    return analyzeDriverSchedule(todayEvents, familyMembers)
  }, [todayEvents, familyMembers])

  const primaryConflict: DriverConflictItem | undefined = useMemo(() => {
    return driverAnalysis.conflicts.find((c) => {
      if (dismissedConflictIds.has(c.eventA.eventId) || dismissedConflictIds.has(c.eventB.eventId)) {
        return false
      }
      if (isEventAtHome(c.eventA.rawEvent) || isEventAtHome(c.eventB.rawEvent)) {
        return false
      }
      return true
    })
  }, [driverAnalysis.conflicts, dismissedConflictIds])

  // Alternative driver candidate for quick 1-tap reassignment
  const alternativeDriver = useMemo(() => {
    if (!primaryConflict) return null
    return (
      familyMembers.find(
        (m) =>
          m.can_drive &&
          m.name.toLowerCase() !== primaryConflict.driverName.toLowerCase(),
      ) || null
    )
  }, [familyMembers, primaryConflict])

  // Quick Action 1: Mark an event as At Home (No Drive Needed)
  const handleQuickMarkAtHome = async (targetEvent: EventWithDetails) => {
    if (!targetEvent?.id || resolvingActionId) return
    const actionKey = `home-${targetEvent.id}`
    setResolvingActionId(actionKey)

    // 1. Immediately dismiss conflict from local state
    setDismissedConflictIds((prev) => {
      const next = new Set(prev)
      next.add(targetEvent.id)
      if (primaryConflict?.eventA?.eventId) next.add(primaryConflict.eventA.eventId)
      return next
    })

    // 2. Immediately apply optimistic cache patch so all cards refresh instantly
    applyEventAggregatePatch(queryClient, targetEvent.id, {
      location_name: 'Home',
      address: '',
      plan_override: {
        ...(targetEvent.plan_override ?? {
          event_id: targetEvent.id,
          verified: true,
          waits: false,
          mode_override: null,
          two_driver_confirmed: false,
          driver_overrides: null,
          location_projection_blocked: false,
          updated_at: new Date().toISOString(),
        }),
        transportation_plan: {
          version: 1,
          source: 'manual',
          waitOnSite: false,
          legs: [],
        },
        location_signature: 'home|',
        updated_at: new Date().toISOString(),
      },
      enrichment: targetEvent.enrichment
        ? {
            ...targetEvent.enrichment,
            drive_time_mins: 0,
            departure_time: null,
            route_summary: null,
            updated_at: new Date().toISOString(),
          }
        : null,
    })

    try {
      if (targetEvent.id.startsWith('routine-')) {
        await materializeSyntheticRoutineEvent(
          supabase,
          queryClient,
          targetEvent,
          {
            travelBehavior: 'none',
            venue: { name: 'Home', address: '', driveMinutes: 0, distanceMiles: 0 },
          },
          { familyMembers, homeAddress: '3209 Washington Road, West Palm Beach, FL' },
        )
      } else {
        await updateEventVenue(
          supabase,
          queryClient,
          targetEvent,
          { name: 'Home', address: '', driveMinutes: 0, distanceMiles: 0 },
          { familyMembers },
        )
        await saveEventTransportationOverride({
          supabase,
          queryClient,
          event: targetEvent,
          transportationPlan: {
            version: 1,
            source: 'manual',
            waitOnSite: false,
            legs: [],
          },
        })
      }
      invalidateAllCalendarQueries(queryClient, targetEvent.id)
    } catch (err) {
      console.warn('[MiddayLogisticsWidget] Failed to mark event at home:', err)
      setDismissedConflictIds((prev) => {
        const next = new Set(prev)
        next.delete(targetEvent.id)
        return next
      })
    } finally {
      setResolvingActionId(null)
    }
  }

  // Quick Action 2: Reassign conflicting driving leg to another family driver
  const handleQuickReassignDriver = async (
    targetEvent: EventWithDetails,
    newDriver: FamilyMember,
  ) => {
    if (!targetEvent?.id || resolvingActionId) return
    const actionKey = `driver-${targetEvent.id}`
    setResolvingActionId(actionKey)

    // 1. Immediately dismiss conflict from local state
    setDismissedConflictIds((prev) => {
      const next = new Set(prev)
      next.add(targetEvent.id)
      return next
    })

    // 2. Immediately apply optimistic cache patch
    applyEventAggregatePatch(queryClient, targetEvent.id, {
      members: [
        ...(targetEvent.members?.filter((m) => m.role !== 'driver') ?? []),
        {
          id: `driver-override-${newDriver.id}`,
          role: 'driver',
          family_member: newDriver,
        },
      ],
      plan_override: {
        ...(targetEvent.plan_override ?? {
          event_id: targetEvent.id,
          verified: true,
          waits: false,
          mode_override: null,
          two_driver_confirmed: false,
          driver_overrides: null,
          transportation_plan: null,
          location_signature: null,
          location_projection_blocked: false,
          updated_at: new Date().toISOString(),
        }),
        driver_overrides: { 0: newDriver.id },
        updated_at: new Date().toISOString(),
      },
    })

    try {
      if (targetEvent.id.startsWith('routine-')) {
        await materializeSyntheticRoutineEvent(
          supabase,
          queryClient,
          targetEvent,
          {
            driverLeg1: newDriver.name,
            driverLeg2: newDriver.name,
          },
          { familyMembers, homeAddress: '3209 Washington Road, West Palm Beach, FL' },
        )
      } else {
        await saveEventTransportationOverride({
          supabase,
          queryClient,
          event: targetEvent,
          driverOverrides: { 0: newDriver.id },
        })
      }
      invalidateAllCalendarQueries(queryClient, targetEvent.id)
    } catch (err) {
      console.warn('[MiddayLogisticsWidget] Failed to reassign driver:', err)
      setDismissedConflictIds((prev) => {
        const next = new Set(prev)
        next.delete(targetEvent.id)
        return next
      })
    } finally {
      setResolvingActionId(null)
    }
  }

  // Filter midday/afternoon commitments today
  const middayCommitments = useMemo(() => {
    return todayEvents
      .filter((evt) => {
        if (evt.all_day) return false
        const title = (evt.title || '').toLowerCase()
        if (title.startsWith('cook:') || title.startsWith("tonight's kitchen:") || title.startsWith('recipe:')) {
          return false
        }
        try {
          const end = parseISO(evt.end_time)
          if (end.getTime() < now.getTime() - 30 * 60 * 1000) return false
          return true
        } catch {
          return false
        }
      })
      .sort((a, b) => {
        try {
          return parseISO(a.start_time).getTime() - parseISO(b.start_time).getTime()
        } catch {
          return 0
        }
      })
      .slice(0, 2)
  }, [todayEvents, now])

  // Split open reminders into overdue vs upcoming today
  const overdueReminders = useMemo(() => {
    const startOfTodayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const nowMs = now.getTime()
    return openReminders.filter((evt) => {
      try {
        const startMs = parseISO(evt.start_time).getTime()
        const isPastDay = startMs < startOfTodayMs
        const isEarlierToday = !evt.all_day && startMs < nowMs
        return isPastDay || isEarlierToday
      } catch {
        return false
      }
    })
  }, [openReminders, now])

  // Tomorrow's highlighted events for weekend radar
  const tomorrowHighlightEvents = useMemo(() => {
    return (tomorrowEvents || [])
      .filter((e) => {
        const title = (e.title || '').toLowerCase()
        if (title.startsWith('cook:') || title.startsWith("tonight's kitchen:") || title.startsWith('recipe:')) {
          return false
        }
        return true
      })
      .sort((a, b) => {
        if (a.all_day && !b.all_day) return -1
        if (!a.all_day && b.all_day) return 1
        try {
          return parseISO(a.start_time).getTime() - parseISO(b.start_time).getTime()
        } catch {
          return 0
        }
      })
      .slice(0, 2)
  }, [tomorrowEvents])

  // Helper to parse time string into minutes from midnight
  const parseMinutes = (timeStr: string): number => {
    try {
      const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i)
      if (!match) return 0
      let h = parseInt(match[1], 10)
      const m = parseInt(match[2], 10)
      const meridian = match[3]?.toUpperCase()
      if (meridian === 'PM' && h < 12) h += 12
      if (meridian === 'AM' && h === 12) h = 0
      return h * 60 + m
    } catch {
      return 0
    }
  }

  // Group active school routines by venue & dismissal time, sorted chronologically ascending
  const schoolDismissals = useMemo<SchoolDismissalGroup[]>(() => {
    if (routineIntel.isTodayWeekend || !routineIntel.isTodaySchoolDay) {
      return []
    }

    const rawStatuses = routineIntel.ambientStatuses || []
    if (rawStatuses.length === 0) {
      return []
    }

    const map = new Map<string, SchoolDismissalGroup>()

    const calculateLeaveBy = (dismissalTimeFormatted: string, isBak: boolean): string => {
      const mins = parseMinutes(dismissalTimeFormatted)
      const drive = isBak ? 20 : 10
      const leaveMins = mins - drive
      const h = Math.floor(leaveMins / 60)
      const m = leaveMins % 60
      const period = h >= 12 ? 'PM' : 'AM'
      const displayH = h > 12 ? h - 12 : (h === 0 ? 12 : h)
      return `${displayH}:${String(m).padStart(2, '0')} ${period}`
    }

    for (const status of rawStatuses) {
      const isBak = status.venueName.toLowerCase().includes('bak')
      const fallbackDriver = isBak ? 'Jake' : 'Giselle'
      const driver = status.pickupDriverName || fallbackDriver

      const key = `${status.venueName}-${status.endsAtFormatted}`
      const existing = map.get(key)
      if (existing) {
        if (!existing.childrenNames.includes(status.childName)) {
          existing.childrenNames.push(status.childName)
        }
      } else {
        map.set(key, {
          id: key,
          venueName: status.venueName,
          dismissalTimeFormatted: status.endsAtFormatted,
          minutesFromMidnight: parseMinutes(status.endsAtFormatted),
          childrenNames: [status.childName],
          driverName: driver,
          leaveByFormatted: calculateLeaveBy(status.endsAtFormatted, isBak),
        })
      }
    }

    return Array.from(map.values()).sort((a, b) => a.minutesFromMidnight - b.minutesFromMidnight)
  }, [routineIntel.isTodayWeekend, routineIntel.isTodaySchoolDay, routineIntel.ambientStatuses])

  return (
    <div
      className={cn(
        'w-full rounded-3xl p-6 sm:p-7 relative overflow-hidden flex flex-col justify-between space-y-5 transition-all duration-300',
        isNavy
          ? 'bg-gradient-to-br from-casa-navy via-slate-900 to-slate-950 text-white border border-white/10 shadow-xl'
          : 'bg-casa-surface text-casa-navy border border-casa-border shadow-card',
        className,
      )}
    >
      {/* Background ambient glow */}
      {isNavy && (
        <div className="absolute top-0 right-0 w-96 h-96 bg-casa-gold/10 rounded-full blur-3xl pointer-events-none" />
      )}

      {/* ── Top Header Row with Status Badge & 1-Tap View Switcher ── */}
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-3 pb-3 relative z-10 border-b',
          isNavy ? 'border-white/10' : 'border-casa-divider/60',
        )}
      >
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border transition-colors',
              isNavy
                ? 'bg-white/10 text-casa-gold border-white/10'
                : 'bg-amber-500/15 text-amber-700 border-amber-400/30',
            )}
          >
            {routineIntel.isTodayWeekend ? (
              <Sparkles size={20} strokeWidth={2} className={isNavy ? 'text-amber-400' : 'text-casa-gold'} />
            ) : (
              <Sun size={20} strokeWidth={2.2} />
            )}
          </div>
          <div>
            <div
              className={cn(
                'text-caption font-bold uppercase tracking-widest flex items-center gap-1.5',
                isNavy ? 'text-amber-400' : 'text-amber-800',
              )}
            >
              <span>{routineIntel.isTodayWeekend ? 'Weekend Flow & Household Focus' : 'Midday & Afternoon Logistics'}</span>
            </div>
            <div
              className={cn(
                'text-body font-serif font-semibold',
                isNavy ? 'text-white' : 'text-casa-navy',
              )}
            >
              {format(now, 'EEEE, MMMM d')}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Dynamic Status Capsule (Real State Awareness) */}
          {!primaryConflict && (
            <span
              className={cn(
                'hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-caption font-semibold shadow-2xs border',
                isNavy
                  ? 'bg-white/10 border-white/10 text-white/80'
                  : 'bg-casa-surface-subtle border-casa-border/60 text-casa-text-secondary',
              )}
            >
              {overdueReminders.length > 0 ? (
                <>
                  <AlertTriangle size={13} className="text-amber-500" />
                  <span>{overdueReminders.length} Overdue · {openReminders.length} Open</span>
                </>
              ) : openReminders.length > 0 ? (
                <>
                  <Clock size={13} className={isNavy ? 'text-amber-400' : 'text-casa-gold'} />
                  <span>{openReminders.length} Open Task{openReminders.length > 1 ? 's' : ''}</span>
                </>
              ) : middayCommitments.length > 0 ? (
                <>
                  <Car size={13} className={isNavy ? 'text-amber-400' : 'text-casa-gold'} />
                  <span>{middayCommitments.length} Staged</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={14} className="text-emerald-500" />
                  <span>{routineIntel.isTodayWeekend ? 'Weekend Flow Clear' : 'Logistics Clear'}</span>
                </>
              )}
            </span>
          )}

          {/* 1-Tap Mode Toggle (Today vs Tomorrow) */}
          {onToggleTomorrowView && (
            <div
              className={cn(
                'inline-flex items-center p-1 rounded-full border shadow-2xs',
                isNavy ? 'bg-white/5 border-white/10' : 'bg-casa-surface-subtle border-casa-border',
              )}
            >
              <Button
                variant={!isTomorrowActive ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => isTomorrowActive && onToggleTomorrowView()}
                className={cn(
                  'px-3.5 py-1.5 rounded-full text-caption font-bold transition-all min-h-[44px] flex items-center gap-1.5',
                  !isTomorrowActive
                    ? isNavy
                      ? 'bg-casa-gold text-casa-navy shadow-2xs'
                      : 'bg-casa-navy text-white shadow-2xs'
                    : isNavy
                    ? 'text-white/60 hover:text-white'
                    : 'text-casa-muted hover:text-casa-navy',
                )}
              >
                <Sun size={13} />
                <span>Today's Flow</span>
              </Button>
              <Button
                variant={isTomorrowActive ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => !isTomorrowActive && onToggleTomorrowView()}
                className={cn(
                  'px-3.5 py-1.5 rounded-full text-caption font-bold transition-all min-h-[44px] flex items-center gap-1.5',
                  isTomorrowActive
                    ? isNavy
                      ? 'bg-casa-gold text-casa-navy shadow-2xs'
                      : 'bg-casa-navy text-white shadow-2xs'
                    : isNavy
                    ? 'text-white/60 hover:text-white'
                    : 'text-casa-muted hover:text-casa-navy',
                )}
              >
                <Moon size={13} />
                <span>
                  Tomorrow ({routineIntel.completedCount}/{routineIntel.totalPrepCount || (routineIntel.isTomorrowWeekend ? 2 : 3)} Ready)
                </span>
              </Button>
            </div>
          )}


        </div>
      </div>

      {/* ── Driver Collision Alert (Prominent only when a real collision occurs) ── */}
      {primaryConflict && (
        <div
          className={cn(
            'p-3.5 sm:p-4 rounded-2xl border flex flex-col gap-3',
            isNavy
              ? 'bg-amber-500/15 border-amber-400/40 text-amber-100'
              : 'bg-amber-500/10 border-amber-400/50 text-amber-950',
          )}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className={isNavy ? 'text-amber-400 shrink-0 mt-0.5' : 'text-amber-700 shrink-0 mt-0.5'} />
            <div className="min-w-0 flex-1">
              <div
                className={cn(
                  'text-caption font-bold uppercase tracking-wide flex items-center justify-between',
                  isNavy ? 'text-amber-300' : 'text-amber-900',
                )}
              >
                <span>Driver Transit Buffer Crunch · {primaryConflict.driverName}</span>
                <span
                  className={cn(
                    'text-caption font-bold px-2 py-0.5 rounded-md border',
                    isNavy
                      ? 'text-amber-200 bg-amber-950/80 border-amber-400/40'
                      : 'text-amber-800 bg-amber-100/80 border-amber-300/60',
                  )}
                >
                  Direct Conflict
                </span>
              </div>
              <p className={cn('text-body-sm mt-0.5 leading-snug', isNavy ? 'text-amber-100/90' : 'text-amber-950/90')}>
                {primaryConflict.message}
              </p>
            </div>
          </div>

          {/* 1-Tap Quick Action Resolution Chips */}
          <div
            className={cn(
              'pt-2 border-t flex flex-wrap items-center gap-2',
              isNavy ? 'border-amber-400/20' : 'border-amber-400/30',
            )}
          >
            <span
              className={cn(
                'text-caption font-bold uppercase tracking-wider text-2xs mr-1',
                isNavy ? 'text-amber-300/90' : 'text-amber-900/80',
              )}
            >
              1-Tap Fix:
            </span>

            {primaryConflict.eventB?.rawEvent && (
              <Button
                variant="secondary"
                size="sm"
                loading={resolvingActionId === `home-${primaryConflict.eventB.rawEvent.id}`}
                disabled={Boolean(resolvingActionId)}
                leadingIcon={<House size={13} className={isNavy ? 'text-amber-300' : 'text-amber-700'} />}
                onClick={() => handleQuickMarkAtHome(primaryConflict.eventB.rawEvent)}
                className={cn(
                  'rounded-xl text-caption font-bold shadow-2xs',
                  isNavy
                    ? 'bg-slate-900 hover:bg-slate-800 border-amber-400/30 text-amber-100'
                    : 'bg-white hover:bg-amber-50 border-amber-300 text-amber-950',
                )}
              >
                "{primaryConflict.eventB.title}" is At Home (No Drive)
              </Button>
            )}

            {alternativeDriver && primaryConflict.eventB?.rawEvent && (
              <Button
                variant="secondary"
                size="sm"
                loading={resolvingActionId === `driver-${primaryConflict.eventB.rawEvent.id}`}
                disabled={Boolean(resolvingActionId)}
                leadingIcon={<RefreshCw size={13} className={isNavy ? 'text-amber-300' : 'text-amber-700'} />}
                onClick={() =>
                  handleQuickReassignDriver(
                    primaryConflict.eventB.rawEvent,
                    alternativeDriver,
                  )
                }
                className={cn(
                  'rounded-xl text-caption font-bold shadow-2xs',
                  isNavy
                    ? 'bg-slate-900 hover:bg-slate-800 border-amber-400/30 text-amber-100'
                    : 'bg-white hover:bg-amber-50 border-amber-300 text-amber-950',
                )}
              >
                Assign {alternativeDriver.name} to Drive
              </Button>
            )}

            {onOpenEvent && primaryConflict.eventB?.rawEvent && (
              <Button
                variant="ghost"
                size="sm"
                leadingIcon={<ExternalLink size={13} className={isNavy ? 'text-amber-300' : 'text-amber-800'} />}
                onClick={() => onOpenEvent(primaryConflict.eventB.rawEvent)}
                className={cn(
                  'rounded-xl text-caption font-bold',
                  isNavy
                    ? 'bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/30 text-amber-200'
                    : 'bg-amber-500/10 hover:bg-amber-500/20 border border-amber-400/40 text-amber-950',
                )}
              >
                Open Details
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── Section B: Weekend Flow Momentum OR Weekday Active Tasks ── */}
      {routineIntel.isTodayWeekend ? (
        // On weekends: High-level Household Pulse & Momentum summary (Zero raw list duplication with right sidebar)
        <div className="space-y-3">
          {overdueReminders.length > 0 && (
            <div className={cn(
              'p-4 rounded-2xl border shadow-2xs flex items-center justify-between gap-3.5 transition-all',
              isNavy
                ? 'bg-amber-500/10 border-amber-400/30 text-amber-200'
                : 'bg-amber-500/8 border-amber-400/40 text-amber-950'
            )}>
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className={cn(
                  'w-9 h-9 rounded-xl flex items-center justify-center font-bold shrink-0',
                  isNavy ? 'bg-amber-500/20 text-amber-300' : 'bg-amber-500/15 text-amber-800'
                )}>
                  <AlertTriangle size={18} className="text-amber-600 shrink-0 animate-pulse" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-3xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/25 border border-amber-500/35 text-amber-950">
                      Priority Focus
                    </span>
                    <span className="text-caption font-semibold truncate text-amber-900">
                      {overdueReminders[0].title}
                    </span>
                  </div>
                  <p className={cn('text-caption mt-0.5 truncate', isNavy ? 'text-white/70' : 'text-casa-muted')}>
                    {overdueReminders.length === 1 ? '1 item requiring attention from earlier today' : `${overdueReminders.length} items pending attention`}
                  </p>
                </div>
              </div>

              <IconButton
                size="sm"
                variant="ghost"
                onClick={async (e) => {
                  e.stopPropagation()
                  if (onToggleReminder && overdueReminders[0]) {
                    try { navigator.vibrate?.(10) } catch {}
                    await onToggleReminder(overdueReminders[0].id)
                  }
                }}
                className={cn(
                  'rounded-full shrink-0 transition-all min-h-[38px] min-w-[38px] p-0 flex items-center justify-center',
                  isNavy ? 'hover:bg-amber-400/20 text-amber-300' : 'hover:bg-emerald-100 text-slate-500 hover:text-emerald-700'
                )}
                aria-label={`Mark ${overdueReminders[0].title} complete`}
                icon={
                  <div className="w-6 h-6 rounded-full border-2 border-amber-600/80 hover:border-emerald-600 bg-white/10 flex items-center justify-center transition-colors shadow-2xs">
                    <div className="w-3 h-3 rounded-full bg-current opacity-40 hover:opacity-100 transition-opacity" />
                  </div>
                }
              />
            </div>
          )}

          {/* Weekend Household Momentum Bar */}
          <div className={cn(
            'p-4 rounded-2xl border shadow-2xs flex flex-wrap items-center justify-between gap-3',
            isNavy ? 'bg-white/5 border-white/10 text-white' : 'bg-casa-surface-subtle/80 border-casa-border/80 text-casa-navy'
          )}>
            <div className="flex items-center gap-3">
              <div className={cn(
                'w-9 h-9 rounded-xl flex items-center justify-center font-bold shrink-0',
                isNavy ? 'bg-white/10 text-amber-400' : 'bg-casa-gold/20 text-casa-navy'
              )}>
                <ListTodo size={17} className={isNavy ? 'text-amber-400' : 'text-casa-gold'} />
              </div>
              <div>
                <h4 className={cn('font-sans text-body-sm font-bold', isNavy ? 'text-white' : 'text-casa-navy')}>
                  Weekend Household Flow
                </h4>
                <p className={cn('text-caption', isNavy ? 'text-white/70' : 'text-casa-text-secondary')}>
                  {completedReminders.length} of {todayReminders.length || openReminders.length + completedReminders.length} tasks completed today
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className={cn(
                'text-caption font-bold px-3 py-1 rounded-full border shadow-2xs',
                isNavy ? 'bg-slate-900 border-white/15 text-amber-300' : 'bg-white border-casa-border/60 text-casa-navy'
              )}>
                {openReminders.length === 0 ? 'All Clear' : `${openReminders.length} Open`}
              </span>
            </div>
          </div>
        </div>
      ) : openReminders.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span
              className={cn(
                'text-caption font-bold uppercase tracking-wider flex items-center gap-1.5',
                isNavy ? 'text-amber-400' : 'text-amber-800',
              )}
            >
              <ListTodo size={14} className={isNavy ? 'text-amber-400' : 'text-casa-gold'} />
              <span>Today's Active Focus & Tasks</span>
            </span>
            <span
              className={cn(
                'text-caption font-semibold',
                isNavy ? 'text-white/60' : 'text-casa-muted',
              )}
            >
              {openReminders.length} Open · {completedReminders.length} Done
            </span>
          </div>

          <div
            className={cn(
              'grid gap-3',
              openReminders.length > 1 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1',
            )}
          >
            {openReminders.slice(0, 4).map((task) => {
              const assignedName = task.members?.[0]?.family_member?.name || 'Family'
              const isOverdue = overdueReminders.some((r) => r.id === task.id)
              const formattedTime = task.all_day
                ? 'All Day'
                : (() => {
                    try {
                      return format(parseISO(task.start_time), 'h:mm a')
                    } catch {
                      return 'Today'
                    }
                  })()

              return (
                <motion.div
                  key={task.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => onOpenEvent && onOpenEvent(task)}
                  className={cn(
                    'p-4 rounded-2xl border shadow-2xs cursor-pointer transition-all flex flex-col justify-between space-y-3 group',
                    isNavy
                      ? 'bg-white/5 border-white/10 hover:border-amber-400/40 text-white'
                      : isOverdue
                      ? 'bg-gradient-to-br from-amber-500/5 via-casa-surface to-casa-surface border-amber-400/50 text-casa-navy hover:border-amber-500/80'
                      : 'bg-casa-surface-subtle/80 border-casa-border/80 hover:border-casa-gold/60 text-casa-navy',
                  )}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-caption font-mono font-bold border shadow-2xs',
                          isOverdue
                            ? isNavy
                              ? 'bg-amber-950/80 border-amber-400/40 text-amber-300'
                              : 'bg-amber-100/90 border-amber-300 text-amber-900'
                            : isNavy
                            ? 'bg-slate-900 border-white/15 text-white/90'
                            : 'bg-white border-casa-border/60 text-casa-navy',
                        )}
                      >
                        {isOverdue && <AlertTriangle size={11} className="text-amber-500 shrink-0" />}
                        <span>{formattedTime}</span>
                        {isOverdue && <span className="text-3xs uppercase font-extrabold ml-0.5">OVERDUE</span>}
                      </span>

                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-caption font-bold border shadow-2xs',
                          isNavy
                            ? 'bg-slate-900 border-white/15 text-white'
                            : 'bg-white border-casa-border/60 text-casa-navy',
                        )}
                      >
                        <span className={cn('w-2 h-2 rounded-full shrink-0', isNavy ? 'bg-amber-400' : 'bg-casa-gold')} />
                        <span>{assignedName}</span>
                      </span>
                    </div>

                    <div className={cn('font-display text-body font-bold leading-snug truncate pt-0.5', isNavy ? 'text-white' : 'text-casa-navy')}>
                      {task.title}
                    </div>
                  </div>

                  <div
                    className={cn(
                      'flex items-center justify-between pt-2 border-t text-caption',
                      isNavy ? 'border-white/10' : 'border-casa-border/40',
                    )}
                  >
                    <span className={cn('text-caption font-medium', isNavy ? 'text-white/60' : 'text-casa-muted')}>
                      1-Tap to Complete
                    </span>

                    <IconButton
                      size="sm"
                      variant="ghost"
                      onClick={async (e) => {
                        e.stopPropagation()
                        if (onToggleReminder) {
                          try {
                            navigator.vibrate?.(10)
                          } catch {}
                          await onToggleReminder(task.id)
                        }
                      }}
                      className={cn(
                        'rounded-full shrink-0 transition-all min-h-[32px] min-w-[32px] p-0 flex items-center justify-center',
                        isNavy
                          ? 'hover:bg-amber-400/20 text-amber-300'
                          : 'hover:bg-emerald-100 text-slate-500 hover:text-emerald-700',
                      )}
                      aria-label={`Mark ${task.title} complete`}
                      icon={
                        <div className="w-5 h-5 rounded-full border-2 border-slate-400/80 hover:border-emerald-600 bg-white/10 flex items-center justify-center transition-colors">
                          <div className="w-2.5 h-2.5 rounded-full bg-current opacity-40 hover:opacity-100 transition-opacity" />
                        </div>
                      }
                    />
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Midday Commitments Section (Editorial Schedule Cards) ── */}
      {middayCommitments.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span
              className={cn(
                'text-caption font-bold uppercase tracking-wider',
                isNavy ? 'text-amber-400' : 'text-casa-text-secondary',
              )}
            >
              {routineIntel.isTodayWeekend ? "Today's Schedule & Activities" : "Today's Midday Commitments"}
            </span>
            <span
              className={cn(
                'text-caption font-semibold',
                isNavy ? 'text-white/60' : 'text-casa-muted',
              )}
            >
              {middayCommitments.length} Upcoming
            </span>
          </div>

          <div
            className={cn(
              'grid gap-3.5',
              middayCommitments.length > 1 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1',
            )}
          >
            {middayCommitments.map((evt, idx) => {
              const driverResolution = resolveEventDriver(evt, familyMembers)
              const depInfo = resolveCanonicalDeparture(evt, { now })
              const assignedName =
                driverResolution.name ||
                evt.members?.[0]?.family_member?.name ||
                'Family'

              return (
                <motion.div
                  key={evt.id || idx}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => onOpenEvent && onOpenEvent(evt)}
                  className={cn(
                    'p-4 sm:p-5 rounded-2xl border shadow-2xs cursor-pointer transition-all space-y-2.5 flex flex-col justify-between',
                    isNavy
                      ? 'bg-white/5 border-white/10 hover:border-amber-400/40 text-white'
                      : 'bg-casa-surface-subtle/80 border-casa-border/80 hover:border-casa-gold/60 text-casa-navy',
                  )}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 text-caption font-mono font-bold px-2.5 py-0.5 rounded-lg border shadow-2xs',
                          isNavy
                            ? 'bg-slate-900 border-white/15 text-white'
                            : 'bg-white border-casa-border/50 text-casa-navy',
                        )}
                      >
                        <Clock size={13} className={isNavy ? 'text-amber-400' : 'text-casa-gold'} />
                        <span>{format(parseISO(evt.start_time), 'h:mm a')} – {format(parseISO(evt.end_time), 'h:mm a')}</span>
                      </span>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-caption font-bold border shadow-2xs',
                          isNavy
                            ? 'bg-slate-900 border-white/15 text-white'
                            : 'bg-white border-casa-border/60 text-casa-navy',
                        )}
                      >
                        <span className={cn('w-2 h-2 rounded-full shrink-0', isNavy ? 'bg-amber-400' : 'bg-casa-gold')} />
                        <span>{assignedName}</span>
                      </span>
                    </div>

                    <div>
                      <h3
                        className={cn(
                          'font-display text-body-lg sm:text-heading font-bold leading-snug',
                          isNavy ? 'text-white' : 'text-casa-navy',
                        )}
                      >
                        {evt.title}
                      </h3>
                      {evt.location_name && (
                        <div
                          className={cn(
                            'flex items-center gap-1.5 text-caption mt-0.5',
                            isNavy ? 'text-white/70' : 'text-casa-text-secondary',
                          )}
                        >
                          <MapPin size={13} className={isNavy ? 'text-amber-400 shrink-0' : 'text-casa-gold shrink-0'} />
                          <span className="truncate">{evt.location_name}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div
                    className={cn(
                      'flex items-center justify-between pt-2 border-t text-caption',
                      isNavy ? 'border-white/10' : 'border-casa-border/40',
                    )}
                  >
                    {depInfo.isAtHome ? (
                      <div
                        className={cn(
                          'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-caption font-medium border',
                          isNavy
                            ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-300'
                            : 'bg-emerald-50 border-emerald-200/80 text-emerald-800',
                        )}
                      >
                        <House size={13} className={isNavy ? 'text-emerald-400' : 'text-emerald-600'} />
                        <span>At Home · No Drive</span>
                      </div>
                    ) : depInfo.isDriving && depInfo.formattedLeaveBy ? (
                      <div
                        className={cn(
                          'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-caption font-medium border',
                          isNavy
                            ? 'bg-white/10 border-white/15 text-white/80'
                            : 'bg-white border-casa-border/50 text-casa-text-secondary',
                        )}
                      >
                        <Car size={13} className={isNavy ? 'text-amber-400' : 'text-casa-gold'} />
                        <span>
                          Leave by <strong className={isNavy ? 'text-white font-bold' : 'text-casa-navy font-bold'}>{depInfo.formattedLeaveBy}</strong>
                          <span className={isNavy ? 'text-white/60 ml-1 font-normal' : 'text-casa-muted ml-1 font-normal'}>({depInfo.driveMinutes}m drive)</span>
                        </span>
                      </div>
                    ) : (
                      <div
                        className={cn(
                          'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-caption font-medium border',
                          isNavy
                            ? 'bg-white/10 border-white/15 text-white/80'
                            : 'bg-white border-casa-border/50 text-casa-text-secondary',
                        )}
                      >
                        <Car size={13} className={isNavy ? 'text-amber-400' : 'text-casa-gold'} />
                        <span>Live travel buffer clear</span>
                      </div>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Tomorrow's Weekend Horizon Radar (Preview of Sunday / Weekend Schedule) ── */}
      {routineIntel.isTodayWeekend && tomorrowHighlightEvents.length > 0 && (
        <div
          className={cn(
            'pt-3 space-y-2.5 border-t',
            isNavy ? 'border-white/10' : 'border-casa-border/60',
          )}
        >
          <div className="flex items-center justify-between text-caption font-bold uppercase tracking-wider">
            <span className={cn('flex items-center gap-1.5', isNavy ? 'text-amber-400' : 'text-casa-text-secondary')}>
              <Calendar size={14} className={isNavy ? 'text-amber-400' : 'text-casa-gold'} />
              <span>Tomorrow's Weekend Schedule</span>
            </span>
            <span className={cn('font-semibold', isNavy ? 'text-white/60' : 'text-casa-muted')}>
              {tomorrowEvents?.length || 2} Scheduled
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {tomorrowHighlightEvents.map((evt) => {
              const formattedTime = evt.all_day
                ? 'All Day'
                : (() => {
                    try {
                      return format(parseISO(evt.start_time), 'h:mm a')
                    } catch {
                      return 'Tomorrow'
                    }
                  })()

              return (
                <div
                  key={evt.id}
                  onClick={() => onOpenEvent && onOpenEvent(evt)}
                  className={cn(
                    'p-3.5 rounded-2xl border flex flex-col justify-between space-y-2 cursor-pointer transition-all shadow-2xs group',
                    isNavy
                      ? 'bg-white/5 border-white/10 hover:border-amber-400/40 text-white'
                      : 'bg-casa-surface-subtle/80 border-casa-border/80 hover:border-casa-gold/60 text-casa-navy',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        'text-caption font-mono font-bold px-2.5 py-0.5 rounded-lg border shadow-2xs',
                        isNavy
                          ? 'bg-slate-900 border-white/15 text-white'
                          : 'bg-white border-casa-border/60 text-casa-navy',
                      )}
                    >
                      {formattedTime}
                    </span>
                    {evt.location_name && (
                      <span className={cn('text-caption truncate text-2xs max-w-[140px]', isNavy ? 'text-white/60' : 'text-casa-muted')}>
                        {evt.location_name}
                      </span>
                    )}
                  </div>

                  <div className={cn('font-display font-bold text-body-sm truncate', isNavy ? 'text-white' : 'text-casa-navy')}>
                    {evt.title}
                  </div>
                </div>
              )
            })}
          </div>

          {onToggleTomorrowView && (
            <div className="pt-1">
              <Button
                variant="secondary"
                size="sm"
                onClick={onToggleTomorrowView}
                trailingIcon={<ArrowRight size={13} />}
                className={cn(
                  'w-full rounded-xl text-caption font-bold shadow-2xs py-2 min-h-[38px] justify-between',
                  isNavy
                    ? 'bg-white/10 hover:bg-white/15 border-white/15 text-white'
                    : 'bg-casa-surface-subtle hover:bg-casa-surface border-casa-border text-casa-navy',
                )}
              >
                <span>View Tomorrow's Readiness & Prep Checklist ({routineIntel.completedCount}/{routineIntel.totalPrepCount || (routineIntel.isTomorrowWeekend ? 2 : 3)} Ready)</span>
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Reassuring Open / Clear Logistics State (ONLY when truly NO tasks, NO schedule, NO dismissals) ── */}
      {openReminders.length === 0 && middayCommitments.length === 0 && schoolDismissals.length === 0 && !primaryConflict && (
        <div
          className={cn(
            'p-4 sm:p-5 rounded-2xl border flex items-center gap-3.5 shadow-2xs transition-all',
            isNavy
              ? 'bg-white/5 border-white/10 text-white'
              : 'bg-casa-surface-subtle/80 border-casa-border/80 text-casa-navy',
          )}
        >
          <div
            className={cn(
              'w-10 h-10 rounded-xl border flex items-center justify-center shrink-0',
              isNavy
                ? 'bg-amber-400/10 border-amber-400/20 text-amber-300'
                : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700',
            )}
          >
            <ShieldCheck size={20} />
          </div>
          <div className="space-y-0.5">
            <div className={cn('text-body-sm font-bold', isNavy ? 'text-white' : 'text-casa-navy')}>
              {routineIntel.isTodayWeekend ? 'Weekend schedule is open & all daily tasks complete' : 'Afternoon logistics are clear'}
            </div>
            <div className={cn('text-caption leading-relaxed', isNavy ? 'text-white/70' : 'text-casa-text-secondary')}>
              {routineIntel.isTodayWeekend
                ? `All ${todayReminders.length || 0} to-dos completed. Enjoy family time and weekend flow.`
                : 'No additional school dismissals or transit pickups staged for today.'}
            </div>
          </div>
        </div>
      )}

      {/* ── Dedicated Afternoon School Dismissals Roster (Rendered ONLY on school days with active dismissals) ── */}
      {schoolDismissals.length > 0 && (
        <div
          className={cn(
            'pt-2 space-y-2.5 border-t',
            isNavy ? 'border-white/10' : 'border-casa-border/60',
          )}
        >
          <div className="flex items-center justify-between text-caption font-bold uppercase tracking-wider">
            <span className={cn('flex items-center gap-1.5', isNavy ? 'text-amber-400' : 'text-casa-text-secondary')}>
              <GraduationCap size={15} className={isNavy ? 'text-amber-400' : 'text-casa-gold'} />
              <span>Afternoon School Dismissals</span>
            </span>
            <span className={cn('font-semibold', isNavy ? 'text-white/60' : 'text-casa-muted')}>
              {schoolDismissals.length} Staged
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {schoolDismissals.map((dismissal) => (
              <div
                key={dismissal.id}
                className={cn(
                  'p-3.5 sm:p-4 rounded-2xl border flex flex-col justify-between space-y-2.5 transition-all shadow-2xs',
                  isNavy
                    ? 'bg-white/5 border-white/10 hover:border-amber-400/40 text-white'
                    : 'bg-casa-surface-subtle/80 border-casa-border/80 hover:border-casa-gold/60 text-casa-navy',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      'text-body-sm font-mono font-bold px-2.5 py-0.5 rounded-lg border shadow-2xs',
                      isNavy
                        ? 'bg-slate-900 border-white/15 text-white'
                        : 'bg-white border-casa-border/60 text-casa-navy',
                    )}
                  >
                    {dismissal.dismissalTimeFormatted}
                  </span>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-caption font-bold border shadow-2xs',
                      isNavy
                        ? 'bg-slate-900 border-white/15 text-white'
                        : 'bg-white border-casa-border/60 text-casa-navy',
                    )}
                  >
                    <span className={cn('w-2 h-2 rounded-full shrink-0', isNavy ? 'bg-amber-400' : 'bg-casa-navy')} />
                    <span>{dismissal.driverName} drives</span>
                  </span>
                </div>

                <div>
                  <div className={cn('font-sans font-bold text-body-sm truncate', isNavy ? 'text-white' : 'text-casa-navy')}>
                    {dismissal.venueName}
                  </div>
                  <div className={cn('text-caption font-medium', isNavy ? 'text-white/70' : 'text-casa-text-secondary')}>
                    {dismissal.childrenNames.join(' & ')}
                  </div>
                </div>

                {dismissal.leaveByFormatted && (
                  <div
                    className={cn(
                      'text-caption font-medium flex items-center gap-1.5 pt-1.5 border-t',
                      isNavy ? 'border-white/10 text-white/70' : 'border-casa-border/40 text-casa-text-secondary',
                    )}
                  >
                    <Car size={12} className={isNavy ? 'text-amber-400 shrink-0' : 'text-casa-gold shrink-0'} />
                    <span>
                      Leave by <strong className={isNavy ? 'text-white font-bold' : 'text-casa-navy font-bold'}>{dismissal.leaveByFormatted}</strong>
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
