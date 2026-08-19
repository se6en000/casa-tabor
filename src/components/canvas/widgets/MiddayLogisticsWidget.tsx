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
} from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '../../../utils/cn'
import type { EventWithDetails } from '../../../hooks/useCalendarEvents'
import type { FamilyMember } from '../../../types'
import { useFamilyRoutineIntelligence } from '../../../hooks/useFamilyRoutineIntelligence'
import { analyzeDriverSchedule, type DriverConflictItem } from '../../../lib/driverConflictEngine'

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

  // Find the most relevant next commitment today
  const effectiveNextEvent = useMemo(() => {
    if (nextEvent && !nextEvent.all_day) return nextEvent
    const candidates = todayEvents
      .filter((e) => {
        if (e.all_day) return false
        try {
          const end = parseISO(e.end_time)
          return end.getTime() > now.getTime()
        } catch {
          return true
        }
      })
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    return candidates[0] || nextEvent || null
  }, [nextEvent, todayEvents, now])

  // Filter today's afternoon pickups/dismissals (from 1:00 PM onwards, excluding the hero event itself)
  const afternoonPickups = useMemo(() => {
    return todayEvents.filter((evt) => {
      if (evt.all_day) return false
      if (effectiveNextEvent && evt.id === effectiveNextEvent.id) return false
      try {
        const start = parseISO(evt.start_time)
        const hour = start.getHours() + start.getMinutes() / 60
        return hour >= 13.0 && hour <= 17.5 // 1:00 PM to 5:30 PM
      } catch {
        return false
      }
    })
  }, [todayEvents, effectiveNextEvent])

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

      {/* ── Active Next Commitment or Afternoon Anchor ── */}
      {effectiveNextEvent ? (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => onOpenEvent && onOpenEvent(effectiveNextEvent)}
          className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-blue-50/80 via-indigo-50/40 to-casa-surface border border-blue-200/70 shadow-2xs cursor-pointer hover:border-blue-400 transition-all space-y-2.5"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-caption font-bold uppercase tracking-wider text-blue-800 bg-blue-100/80 px-2.5 py-0.5 rounded-full">
              <Clock size={13} />
              <span>Next Commitment</span>
            </span>
            <span className="text-caption font-mono font-bold text-casa-navy bg-white/80 px-2.5 py-0.5 rounded-full border border-blue-200/50">
              {format(parseISO(effectiveNextEvent.start_time), 'h:mm a')} – {format(parseISO(effectiveNextEvent.end_time), 'h:mm a')}
            </span>
          </div>

          <div>
            <h3 className="font-display text-body-lg sm:text-heading font-bold text-casa-navy">
              {effectiveNextEvent.title}
            </h3>
            {effectiveNextEvent.location_name && (
              <div className="flex items-center gap-1.5 text-caption text-casa-text-secondary mt-0.5">
                <MapPin size={13} className="text-blue-600 shrink-0" />
                <span className="truncate">{effectiveNextEvent.location_name}</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-blue-200/50 text-caption">
            <div className="flex items-center gap-2">
              <Car size={14} className="text-blue-700" />
              <span className="font-medium text-casa-text-secondary">
                {effectiveNextEvent.enrichment?.departure_time ? (
                  <>Leave by <strong className="text-casa-navy">{format(parseISO(effectiveNextEvent.enrichment.departure_time), 'h:mm a')}</strong></>
                ) : (
                  'Live travel buffer clear'
                )}
              </span>
            </div>

            {effectiveNextEvent.members && effectiveNextEvent.members.length > 0 && (
              <div className="flex items-center gap-1.5">
                {effectiveNextEvent.members.map((m) => (
                  <span
                    key={m.id}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-caption font-semibold bg-white border border-blue-200/80 text-casa-navy"
                  >
                    <span>{m.family_member?.name}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      ) : null}

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
        <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-950 flex items-center justify-between gap-3 text-caption">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <span className="font-medium text-emerald-900 truncate">
              Driver Logistics Clear: No schedule collisions detected.
            </span>
          </div>
          <span className="text-3xs font-bold uppercase tracking-wider text-emerald-800 bg-emerald-500/15 px-2 py-0.5 rounded-full shrink-0">
            Active
          </span>
        </div>
      )}

      {/* ── Afternoon Dismissals & Pickups Lineup ── */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between text-caption font-bold uppercase tracking-wider text-casa-muted">
          <span>Afternoon Dismissals &amp; Pickups</span>
          <span>{afternoonPickups.length > 0 ? `${afternoonPickups.length} scheduled` : 'School Pickups'}</span>
        </div>

        {afternoonPickups.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {afternoonPickups.map((evt) => {
              const driverObj = evt.members?.find((m) => m.role === 'driver')?.family_member
              const driverName = driverObj?.name || 'Giselle'

              return (
                <div
                  key={evt.id}
                  onClick={() => onOpenEvent && onOpenEvent(evt)}
                  className="p-3 rounded-2xl border border-casa-border/80 bg-casa-surface-subtle/70 hover:bg-casa-surface hover:border-casa-gold/60 transition-all flex items-center justify-between gap-2.5 cursor-pointer shadow-2xs"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-body-sm font-bold text-casa-navy font-mono">
                        {format(parseISO(evt.start_time), 'h:mm a')}
                      </span>
                    </div>
                    <div className="text-body-sm font-medium text-casa-navy truncate">
                      {evt.title}
                    </div>
                    <div className="text-caption text-casa-muted truncate">
                      {evt.location_name || evt.address || 'Local School'}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-3xs uppercase font-semibold text-casa-muted mb-0.5">Driver</div>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white border border-casa-border text-caption font-bold text-casa-navy">
                      <Car size={11} className="text-casa-gold" />
                      <span>{driverName}</span>
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="p-3.5 rounded-2xl border border-casa-border/60 bg-casa-surface-subtle/50 text-caption text-casa-muted flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Car size={14} className="text-casa-gold" />
              <span>Standard school dismissals (PB Public 2:00 PM · Bak MSOA 3:30 PM)</span>
            </div>
            <span className="font-semibold text-casa-navy">Drivers Confirmed</span>
          </div>
        )}
      </div>
    </div>
  )
}
