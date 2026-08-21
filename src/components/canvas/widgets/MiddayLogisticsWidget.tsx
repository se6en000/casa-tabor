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
} from 'lucide-react'
import { motion } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '../../../utils/cn'
import type { EventWithDetails } from '../../../hooks/useCalendarEvents'
import type { FamilyMember } from '../../../types'
import { useFamilyRoutineIntelligence } from '../../../hooks/useFamilyRoutineIntelligence'
import { analyzeDriverSchedule, resolveEventDriver, type DriverConflictItem } from '../../../lib/driverConflictEngine'
import { getDisplayMemberColor } from '../../../design-system/memberColors'
import { supabase } from '../../../lib/supabase'
import { updateEventVenue, invalidateAllCalendarQueries } from '../../../lib/eventMutations'
import { saveEventTransportationOverride } from '../../../lib/eventPlanOverrides'

import { Button } from '../../ui'

interface MiddayLogisticsWidgetProps {
  now?: Date
  todayEvents?: EventWithDetails[]
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
  familyMembers = [],
  nextEvent = null,
  onOpenEvent,
  onToggleTomorrowView,
  isTomorrowActive = false,
  className,
}: MiddayLogisticsWidgetProps) {
  const queryClient = useQueryClient()
  const [resolvingActionId, setResolvingActionId] = useState<string | null>(null)
  const routineIntel = useFamilyRoutineIntelligence(now)

  // Driver conflict calculation
  const driverAnalysis = useMemo(() => {
    return analyzeDriverSchedule(todayEvents, familyMembers)
  }, [todayEvents, familyMembers])

  const primaryConflict: DriverConflictItem | undefined = driverAnalysis.conflicts[0]

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
    setResolvingActionId(`home-${targetEvent.id}`)
    try {
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
      invalidateAllCalendarQueries(queryClient, targetEvent.id)
    } catch (err) {
      console.warn('[MiddayLogisticsWidget] Failed to mark event at home:', err)
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
    setResolvingActionId(`driver-${targetEvent.id}`)
    try {
      await saveEventTransportationOverride({
        supabase,
        queryClient,
        event: targetEvent,
        driverOverrides: { 0: newDriver.id },
      })
      invalidateAllCalendarQueries(queryClient, targetEvent.id)
    } catch (err) {
      console.warn('[MiddayLogisticsWidget] Failed to reassign driver:', err)
    } finally {
      setResolvingActionId(null)
    }
  }

  // Find all upcoming midday commitments today (excluding pure routine items)
  const middayCommitments = useMemo<EventWithDetails[]>(() => {
    const candidates = todayEvents
      .filter((e) => {
        if (e.all_day) return false
        if (e.id?.startsWith('routine-')) return false
        try {
          const end = parseISO(e.end_time)
          return end.getTime() > now.getTime()
        } catch {
          return true
        }
      })
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())

    if (candidates.length > 0) return candidates.slice(0, 2)
    if (nextEvent && !nextEvent.all_day) return [nextEvent]
    return []
  }, [todayEvents, nextEvent, now])

  // Helper to parse minutes from midnight for strict chronological sorting
  const parseMinutes = (timeStr: string): number => {
    try {
      const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i)
      if (!match) return 0
      let hours = parseInt(match[1], 10)
      const mins = parseInt(match[2], 10)
      const period = match[3].toUpperCase()
      if (period === 'PM' && hours !== 12) hours += 12
      if (period === 'AM' && hours === 12) hours = 0
      return hours * 60 + mins
    } catch {
      return 0
    }
  }

  // Group active school routines by venue & dismissal time, sorted chronologically ascending
  const schoolDismissals = useMemo<SchoolDismissalGroup[]>(() => {
    const rawStatuses = routineIntel.ambientStatuses || []
    const map = new Map<string, SchoolDismissalGroup>()

    if (rawStatuses.length === 0) {
      return [
        {
          id: 'pbp-dismissal',
          venueName: 'Palm Beach Public Elementary School',
          dismissalTimeFormatted: '2:00 PM',
          minutesFromMidnight: 14 * 60,
          childrenNames: ['Emme', 'Owen'],
          driverName: 'Giselle',
          driverColor: getDisplayMemberColor(familyMembers.find((m) => m.name.toLowerCase() === 'giselle')?.color_hex),
          leaveByFormatted: '1:42 PM',
        },
        {
          id: 'bak-dismissal',
          venueName: 'Bak Middle School of the Arts',
          dismissalTimeFormatted: '3:30 PM',
          minutesFromMidnight: 15 * 60 + 30,
          childrenNames: ['Liv'],
          driverName: 'Jake',
          driverColor: getDisplayMemberColor(familyMembers.find((m) => m.name.toLowerCase() === 'jake')?.color_hex),
          leaveByFormatted: '3:08 PM',
        },
      ]
    }

    for (const status of rawStatuses) {
      const isBak = status.venueName.toLowerCase().includes('bak')
      const fallbackDriver = isBak ? 'Jake' : 'Giselle'
      const driver = status.pickupDriverName || fallbackDriver
      const driverMember = familyMembers.find((m) => m.name.toLowerCase() === driver.toLowerCase())
      const driverColor = getDisplayMemberColor(driverMember?.color_hex)

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
          driverColor,
          leaveByFormatted: isBak ? '3:08 PM' : '1:42 PM',
        })
      }
    }

    return Array.from(map.values()).sort((a, b) => a.minutesFromMidnight - b.minutesFromMidnight)
  }, [routineIntel.ambientStatuses, familyMembers])

  return (
    <div
      className={cn(
        'w-full rounded-3xl p-6 sm:p-7 bg-white text-casa-navy border border-casa-border/80 shadow-md relative overflow-hidden flex flex-col justify-between space-y-5 transition-all duration-300',
        className,
      )}
    >
      {/* ── Top Header Row with Quiet Logistics Badge & 1-Tap View Switcher ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-casa-border/60 pb-3 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/15 flex items-center justify-center text-amber-700 border border-amber-400/30 shrink-0">
            <Sun size={20} strokeWidth={2.2} />
          </div>
          <div>
            <div className="text-caption font-bold uppercase tracking-widest text-amber-800 flex items-center gap-1.5">
              <span>Midday &amp; Afternoon Logistics</span>
            </div>
            <div className="text-body font-serif font-semibold text-casa-navy">
              {format(now, 'EEEE, MMMM d')}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Quiet Luxury Logistics Status (No giant billboard) */}
          {!primaryConflict && (
            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-casa-surface-subtle border border-casa-border/60 text-caption font-semibold text-casa-text-secondary shadow-2xs">
              <ShieldCheck size={14} className="text-casa-gold" />
              <span>Logistics Clear</span>
            </span>
          )}

          {/* 1-Tap Mode Toggle (Today vs Tomorrow) */}
          {onToggleTomorrowView && (
            <div className="inline-flex items-center p-1 rounded-full bg-casa-surface-subtle border border-casa-border shadow-2xs">
              <Button
                variant={!isTomorrowActive ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => isTomorrowActive && onToggleTomorrowView()}
                className={cn(
                  'px-3.5 py-1.5 rounded-full text-caption font-bold transition-all min-h-[36px] flex items-center gap-1.5',
                  !isTomorrowActive
                    ? 'bg-casa-navy text-white shadow-2xs'
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
                  'px-3.5 py-1.5 rounded-full text-caption font-bold transition-all min-h-[36px] flex items-center gap-1.5',
                  isTomorrowActive
                    ? 'bg-casa-navy text-white shadow-2xs'
                    : 'text-casa-muted hover:text-casa-navy',
                )}
              >
                <Moon size={13} />
                <span>
                  Tomorrow ({routineIntel.completedCount}/{routineIntel.totalPrepCount || 5} Ready)
                </span>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── Midday Commitments Section (Warm Linen Editorial Cards) ── */}
      {middayCommitments.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-caption font-bold uppercase tracking-wider text-casa-text-secondary">
              Today's Midday Commitments
            </span>
            <span className="text-caption font-semibold text-casa-muted">
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
              const assignedName =
                driverResolution.name ||
                evt.members?.[0]?.family_member?.name ||
                'Family'
              const memberObj = familyMembers.find((m) => m.name.toLowerCase() === assignedName.toLowerCase())
              const memberDotColor = getDisplayMemberColor(memberObj?.color_hex)

              return (
                <motion.div
                  key={evt.id || idx}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => onOpenEvent && onOpenEvent(evt)}
                  className="p-4 sm:p-5 rounded-2xl bg-casa-surface-subtle/80 border border-casa-border/80 hover:border-casa-gold/60 shadow-2xs cursor-pointer transition-all space-y-2.5 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-caption font-mono font-bold text-casa-navy bg-white px-2.5 py-0.5 rounded-lg border border-casa-border/50 shadow-2xs">
                        <Clock size={13} className="text-casa-gold" />
                        <span>{format(parseISO(evt.start_time), 'h:mm a')} – {format(parseISO(evt.end_time), 'h:mm a')}</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-caption font-bold bg-white border border-casa-border/60 text-casa-navy shadow-2xs">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: memberDotColor }}
                        />
                        <span>{assignedName}</span>
                      </span>
                    </div>

                    <div>
                      <h3 className="font-display text-body-lg sm:text-heading font-bold text-casa-navy leading-snug">
                        {evt.title}
                      </h3>
                      {evt.location_name && (
                        <div className="flex items-center gap-1.5 text-caption text-casa-text-secondary mt-0.5">
                          <MapPin size={13} className="text-casa-gold shrink-0" />
                          <span className="truncate">{evt.location_name}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-casa-border/40 text-caption">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white border border-casa-border/50 text-caption font-medium text-casa-text-secondary">
                      <Car size={13} className="text-casa-gold" />
                      <span>
                        {evt.enrichment?.departure_time ? (
                          <>Leave by <strong className="text-casa-navy">{format(parseISO(evt.enrichment.departure_time), 'h:mm a')}</strong></>
                        ) : (
                          'Live travel buffer clear'
                        )}
                      </span>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Driver Collision Alert (Prominent only when a real collision occurs) ── */}
      {primaryConflict && (
        <div className="p-3.5 sm:p-4 rounded-2xl bg-amber-500/10 border border-amber-400/50 text-amber-950 flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-amber-700 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="text-caption font-bold uppercase tracking-wide text-amber-900 flex items-center justify-between">
                <span>Driver Transit Buffer Crunch · {primaryConflict.driverName}</span>
                <span className="text-caption font-bold text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-md border border-amber-300/60">
                  Direct Conflict
                </span>
              </div>
              <p className="text-body-sm text-amber-950/90 mt-0.5 leading-snug">
                {primaryConflict.message}
              </p>
            </div>
          </div>

          {/* 1-Tap Quick Action Resolution Chips */}
          <div className="pt-2 border-t border-amber-400/30 flex flex-wrap items-center gap-2">
            <span className="text-caption font-bold uppercase tracking-wider text-amber-900/80 text-2xs mr-1">
              1-Tap Fix:
            </span>

            {/* Quick Action: Mark Event B as At Home if appropriate */}
            {primaryConflict.eventB?.rawEvent && (
              <Button
                variant="secondary"
                size="sm"
                loading={resolvingActionId === `home-${primaryConflict.eventB.rawEvent.id}`}
                disabled={Boolean(resolvingActionId)}
                leadingIcon={<House size={13} className="text-amber-700" />}
                onClick={() => handleQuickMarkAtHome(primaryConflict.eventB.rawEvent)}
                className="rounded-xl bg-white hover:bg-amber-50 border border-amber-300 text-amber-950 shadow-2xs text-caption font-bold"
              >
                "{primaryConflict.eventB.title}" is At Home (No Drive)
              </Button>
            )}

            {/* Quick Action: Reassign Driver to alternative parent/caregiver */}
            {alternativeDriver && primaryConflict.eventB?.rawEvent && (
              <Button
                variant="secondary"
                size="sm"
                loading={resolvingActionId === `driver-${primaryConflict.eventB.rawEvent.id}`}
                disabled={Boolean(resolvingActionId)}
                leadingIcon={<RefreshCw size={13} className="text-amber-700" />}
                onClick={() =>
                  handleQuickReassignDriver(
                    primaryConflict.eventB.rawEvent,
                    alternativeDriver,
                  )
                }
                className="rounded-xl bg-white hover:bg-amber-50 border border-amber-300 text-amber-950 shadow-2xs text-caption font-bold"
              >
                Assign {alternativeDriver.name} to Drive
              </Button>
            )}

            {/* Open Details Button */}
            {onOpenEvent && primaryConflict.eventB?.rawEvent && (
              <Button
                variant="ghost"
                size="sm"
                leadingIcon={<ExternalLink size={13} className="text-amber-800" />}
                onClick={() => onOpenEvent(primaryConflict.eventB.rawEvent)}
                className="rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-400/40 text-amber-950 text-caption font-bold"
              >
                Open Details
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── Dedicated Afternoon School Dismissals Roster (Strict Left-to-Right Ascending) ── */}
      <div className="pt-2 border-t border-casa-border/60 space-y-2.5">
        <div className="flex items-center justify-between text-caption font-bold text-casa-text-secondary uppercase tracking-wider">
          <span className="flex items-center gap-1.5">
            <GraduationCap size={15} className="text-casa-gold" />
            <span>Afternoon School Dismissals</span>
          </span>
          <span className="font-semibold text-casa-muted">
            {schoolDismissals.length} Staged
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {schoolDismissals.map((dismissal) => (
            <div
              key={dismissal.id}
              className="p-3.5 sm:p-4 rounded-2xl bg-casa-surface-subtle/80 border border-casa-border/80 hover:border-casa-gold/60 flex flex-col justify-between space-y-2.5 transition-all shadow-2xs"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-body-sm font-mono font-bold text-casa-navy bg-white px-2.5 py-0.5 rounded-lg border border-casa-border/60 shadow-2xs">
                  {dismissal.dismissalTimeFormatted}
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-caption font-bold bg-white border border-casa-border/60 text-casa-navy shadow-2xs">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: dismissal.driverColor || 'var(--color-casa-navy)' }}
                  />
                  <span>{dismissal.driverName} drives</span>
                </span>
              </div>

              <div>
                <div className="font-sans font-bold text-body-sm text-casa-navy truncate">
                  {dismissal.venueName}
                </div>
                <div className="text-caption text-casa-text-secondary font-medium">
                  {dismissal.childrenNames.join(' & ')}
                </div>
              </div>

              {dismissal.leaveByFormatted && (
                <div className="text-caption text-casa-text-secondary font-medium flex items-center gap-1.5 pt-1.5 border-t border-casa-border/40">
                  <Car size={12} className="text-casa-gold shrink-0" />
                  <span>Leave by <strong className="text-casa-navy">{dismissal.leaveByFormatted}</strong></span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
