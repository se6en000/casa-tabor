import { format, parseISO, isWithinInterval, addMinutes } from 'date-fns'
import type { CalendarEvent, FamilyMember } from '../types'
import {
  type HouseholdWeekdayRhythm,
  type RoutineLeg,
  type DailyOverrides,
  getDailyOverrides,
  applyTimeToDate,
} from '../lib/familyRoutines'

export interface RoutineConflictAlert {
  id: string
  severity: 'high' | 'medium' | 'info'
  type: 'driver_conflict' | 'passenger_conflict' | 'caregiver_off_uncovered' | 'cutoff_warning'
  title: string
  description: string
  timeFormatted: string
  affectedMemberName: string
  affectedMemberId: string | null
  routineLeg?: RoutineLeg
  conflictingEvent?: CalendarEvent
  suggestedAction: string
}

/**
 * Detects conflicts between hard calendar events and scheduled routine legs for a specific date.
 */
export function detectRoutineConflicts(options: {
  rhythm: HouseholdWeekdayRhythm
  events: CalendarEvent[]
  members: FamilyMember[]
  targetDate?: Date
  overrides?: DailyOverrides
}): RoutineConflictAlert[] {
  const { rhythm, events, members, targetDate = new Date(), overrides: customOverrides } = options
  if (!rhythm.enabled) return []

  const dayOfWeek = targetDate.getDay()
  if (!rhythm.daysOfWeek.includes(dayOfWeek)) return []

  const dateKey = format(targetDate, 'yyyy-MM-dd')
  const overrides = customOverrides || getDailyOverrides(dateKey)
  const alerts: RoutineConflictAlert[] = []

  // 1. Check if Giselle is Off Today but afternoon pickup chain is enabled
  if (overrides.giselleOffToday) {
    const giselleLegs = rhythm.afternoonChain.legs.filter((l) => l.enabled && l.driverName.toLowerCase().includes('giselle'))
    if (giselleLegs.length > 0) {
      alerts.push({
        id: `routine-conflict-giselle-off-${dateKey}`,
        severity: 'high',
        type: 'caregiver_off_uncovered',
        title: 'Giselle Off Today — Coverage Needed',
        description: `Giselle is flagged off today. Afternoon chain (${giselleLegs.map(l => l.time).join(', ')}) requires a backup driver for Owen and Olivia.`,
        timeFormatted: '15:00 – 17:00',
        affectedMemberName: 'Giselle',
        affectedMemberId: giselleLegs[0].driverMemberId || null,
        suggestedAction: 'Assign Jake or Kelly to cover afternoon pickups',
      })
    }
  }

  // Filter events for target date (ignoring all-day and routine-generated events)
  const dayEvents = events.filter((ev) => {
    if (ev.all_day) return false
    if (ev.id.startsWith('routine-') || ev.source_member_id === 'routine') return false
    try {
      const evDate = parseISO(ev.start_time)
      return format(evDate, 'yyyy-MM-dd') === dateKey
    } catch {
      return false
    }
  })

  // 2. Combine all active routine legs (Morning + Afternoon)
  const allActiveLegs: RoutineLeg[] = [
    ...rhythm.morningLaunch.legs.filter((l) => l.enabled),
    ...rhythm.afternoonChain.legs.filter((l) => {
      if (!l.enabled) return false
      // If Emme is in bus mode, skip her carpool conflict checks
      if (l.transportMode === 'school_bus' && overrides.emmeTransportMode === 'giselle_carpool') return false
      return true
    }),
  ]

  for (const leg of allActiveLegs) {
    const legStartTime = applyTimeToDate(targetDate, leg.time)
    // Assume each routine leg requires a ~30 minute driving window
    const legWindow = {
      start: addMinutes(legStartTime, -10),
      end: addMinutes(legStartTime, 30),
    }

    // A. Check Driver Conflict
    if (leg.driverName && leg.driverName !== 'School Bus #14') {
      const driverMember = members.find(
        (m) => m.id === leg.driverMemberId || m.name.toLowerCase() === leg.driverName.toLowerCase(),
      )

      if (driverMember) {
        for (const ev of dayEvents) {
          // Check if driver is assigned or source member of this hard calendar event
          const isDriverInEvent =
            ev.source_member_id === driverMember.id ||
            (ev.members || []).some((m) => m.family_member_id === driverMember.id)

          if (isDriverInEvent) {
            try {
              const evStart = parseISO(ev.start_time)
              const evEnd = parseISO(ev.end_time)

              // Overlap check
              const overlaps =
                (evStart < legWindow.end && evEnd > legWindow.start) ||
                isWithinInterval(legStartTime, { start: evStart, end: evEnd })

              if (overlaps) {
                alerts.push({
                  id: `routine-conflict-drv-${leg.id}-${ev.id}`,
                  severity: 'high',
                  type: 'driver_conflict',
                  title: `${driverMember.name} Conflict @ ${format(legStartTime, 'h:mm a')}`,
                  description: `"${ev.title}" (${format(evStart, 'h:mm a')} – ${format(evEnd, 'h:mm a')}) overlaps with ${leg.label}.`,
                  timeFormatted: `${format(evStart, 'h:mm a')} – ${format(evEnd, 'h:mm a')}`,
                  affectedMemberName: driverMember.name,
                  affectedMemberId: driverMember.id,
                  routineLeg: leg,
                  conflictingEvent: ev,
                  suggestedAction: `Reassign ${leg.label} or reschedule ${ev.title}`,
                })
              }
            } catch {}
          }
        }
      }
    }
  }

  return alerts
}
