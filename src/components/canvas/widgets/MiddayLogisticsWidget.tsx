import { useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import {
  Sun,
  Moon,
  Clock,
  Car,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  GraduationCap,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '../../../utils/cn'
import type { EventWithDetails } from '../../../hooks/useCalendarEvents'
import type { FamilyMember } from '../../../types'
import { useFamilyRoutineIntelligence } from '../../../hooks/useFamilyRoutineIntelligence'
import { analyzeDriverSchedule, resolveEventDriver, type DriverConflictItem } from '../../../lib/driverConflictEngine'

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
  childrenNames: string[]
  driverName: string
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
  const routineIntel = useFamilyRoutineIntelligence(now)

  // Driver conflict calculation
  const driverAnalysis = useMemo(() => {
    return analyzeDriverSchedule(todayEvents, familyMembers)
  }, [todayEvents, familyMembers])

  const primaryConflict: DriverConflictItem | undefined = driverAnalysis.conflicts[0]

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

  // Group active school routines by venue & dismissal time
  const schoolDismissals = useMemo<SchoolDismissalGroup[]>(() => {
    const rawStatuses = routineIntel.ambientStatuses || []
    if (rawStatuses.length === 0) {
      return [
        {
          id: 'pbp-dismissal',
          venueName: 'Palm Beach Public Elementary School',
          dismissalTimeFormatted: '2:00 PM',
          childrenNames: ['Emme', 'Owen'],
          driverName: 'Giselle',
          leaveByFormatted: '1:42 PM',
        },
        {
          id: 'bak-dismissal',
          venueName: 'Bak Middle School of the Arts',
          dismissalTimeFormatted: '3:30 PM',
          childrenNames: ['Liv'],
          driverName: 'Jake',
          leaveByFormatted: '3:08 PM',
        },
      ]
    }

    const map = new Map<string, SchoolDismissalGroup>()
    for (const status of rawStatuses) {
      const key = `${status.venueName}-${status.endsAtFormatted}`
      const existing = map.get(key)
      const driver =
        status.pickupDriverName ||
        (status.venueName.toLowerCase().includes('bak') ? 'Jake' : 'Giselle')
      if (existing) {
        if (!existing.childrenNames.includes(status.childName)) {
          existing.childrenNames.push(status.childName)
        }
      } else {
        map.set(key, {
          id: key,
          venueName: status.venueName,
          dismissalTimeFormatted: status.endsAtFormatted,
          childrenNames: [status.childName],
          driverName: driver,
          leaveByFormatted: status.venueName.toLowerCase().includes('bak') ? '3:08 PM' : '1:42 PM',
        })
      }
    }
    return Array.from(map.values())
  }, [routineIntel.ambientStatuses])

  return (
    <div
      className={cn(
        'w-full rounded-3xl p-6 sm:p-7 bg-white text-casa-navy border border-casa-border/80 shadow-md relative overflow-hidden flex flex-col justify-between space-y-5 transition-all duration-300',
        className,
      )}
    >
      {/* ── Top Header Row with 1-Tap View Switcher ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-casa-border/60 pb-3 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/15 flex items-center justify-center text-amber-700 border border-amber-400/30">
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

      {/* ── Midday Commitments Section (Dual or Single Card Grid) ── */}
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

              return (
                <motion.div
                  key={evt.id || idx}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => onOpenEvent && onOpenEvent(evt)}
                  className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-blue-50/80 via-indigo-50/40 to-casa-surface border border-blue-200/70 shadow-2xs cursor-pointer hover:border-blue-400 transition-all space-y-2.5 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-caption font-bold uppercase tracking-wider text-blue-800 bg-blue-100/80 px-2.5 py-0.5 rounded-full">
                        <Clock size={13} />
                        <span>{format(parseISO(evt.start_time), 'h:mm a')} – {format(parseISO(evt.end_time), 'h:mm a')}</span>
                      </span>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-caption font-bold bg-white border border-blue-200/80 text-casa-navy shadow-2xs">
                        {assignedName}
                      </span>
                    </div>

                    <div>
                      <h3 className="font-display text-body-lg sm:text-heading font-bold text-casa-navy leading-snug">
                        {evt.title}
                      </h3>
                      {evt.location_name && (
                        <div className="flex items-center gap-1.5 text-caption text-casa-text-secondary mt-0.5">
                          <MapPin size={13} className="text-blue-600 shrink-0" />
                          <span className="truncate">{evt.location_name}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-blue-200/50 text-caption">
                    <div className="flex items-center gap-1.5 font-medium text-casa-text-secondary">
                      <Car size={13} className="text-blue-700" />
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

      {/* ── Driver-Aware Clearance & Collision Banner ── */}
      {primaryConflict ? (
        <div className="p-3.5 sm:p-4 rounded-2xl bg-amber-500/10 border border-amber-400/50 text-amber-950 flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-700 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="text-caption font-bold uppercase tracking-wide text-amber-900">
              Driver Transit Alert · {primaryConflict.driverName}
            </div>
            <p className="text-body-sm text-amber-950/90 mt-0.5 leading-snug">
              {primaryConflict.message}
            </p>
          </div>
        </div>
      ) : (
        <div className="p-3.5 sm:p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-950 flex items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
            <span className="text-caption sm:text-body-sm font-medium text-emerald-900">
              Driver Logistics Clear: No schedule collisions detected.
            </span>
          </div>
          <span className="px-2.5 py-0.5 rounded-full text-caption font-bold bg-emerald-600/15 text-emerald-800 border border-emerald-500/30 uppercase tracking-wider text-3xs">
            Active
          </span>
        </div>
      )}

      {/* ── Dedicated Afternoon School Dismissals Roster ── */}
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
              className="p-3.5 sm:p-4 rounded-2xl bg-casa-surface-subtle/80 border border-casa-border/80 flex flex-col justify-between space-y-2 hover:bg-casa-surface-subtle transition-all"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-body-sm font-mono font-bold text-casa-navy bg-white px-2.5 py-0.5 rounded-lg border border-casa-border/60 shadow-2xs">
                  {dismissal.dismissalTimeFormatted}
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-caption font-bold bg-casa-navy text-white shadow-2xs">
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
                <div className="text-caption text-emerald-800 font-semibold flex items-center gap-1 pt-1 border-t border-casa-border/30">
                  <Car size={12} className="text-emerald-700" />
                  <span>Leave by {dismissal.leaveByFormatted}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
