import { useState, useCallback, useEffect, useMemo } from 'react'
import { format, isAfter, isBefore, isSameDay, parseISO } from 'date-fns'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Clock, MapPin, Navigation,
  Calendar, AlertTriangle, ClipboardList, Bell,
} from 'lucide-react'
import { cn } from '../../utils/cn'
import { useCalendarStore } from '../../stores/calendarStore'
import { useWeekEvents } from '../../hooks/useCalendarEvents'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import { useLiveClock } from '../../hooks/useLiveClock'
import { useFamilyMembers } from '../../hooks/useFamilyMembers'
import { usePrepItems, useDismissPrepItem, useSnoozePrepItem } from '../../hooks/usePrepItems'
import { useWeekConflicts, useResolveConflict } from '../../hooks/useConflicts'
import EventDetailPanel from './EventDetailPanel'
import { WeatherIcon } from '../shared/WeatherIcon'
import { LeaveByCard } from '../shared/LeaveByCard'
import { BirthdayCardDecoration } from '../shared/BirthdayCardDecoration'
import { differenceInDays } from 'date-fns'
import { isHoliday, isReminder, isTimedReminder } from '../../utils/holidays'
import { supabase } from '../../lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import BounceScroll from '../shared/BounceScroll'
import { eventOverlapsDay, getEventEndDate, getEventStartDate } from '../../utils/eventTime'
import { useReminderNeedsYouActions } from '../../hooks/useReminderNeedsYouActions'
import {
  getPersistedPlanOverrides,
  resolveEventMode,
} from '../../lib/eventPlanOverrides'
import { derivePlan, type DerivedPerson } from '../../lib/eventCommandCenter'
import type { FamilyMember } from '../../types'
import { cleanEventTitle, isBirthdayEvent } from '../../utils/eventTitle'

const SHARED_GOLD = '#C9A96E'

function eventColor(ev: EventWithDetails): string {
  if (!ev.members || ev.members.length === 0) return SHARED_GOLD
  if (ev.members.length >= 4) return SHARED_GOLD
  return ev.members[0].family_member?.color_hex ?? SHARED_GOLD
}

function fallbackResponsiblePerson(event: EventWithDetails): DerivedPerson | null {
  const fallbackMember = event.members.find((m) => m.role === 'primary')?.family_member
    ?? event.members[0]?.family_member
    ?? null
  if (!fallbackMember) return null
  return {
    id: fallbackMember.id,
    name: fallbackMember.name,
    initial: fallbackMember.name?.[0]?.toUpperCase() ?? '?',
    color: fallbackMember.color_hex ?? SHARED_GOLD,
    role: fallbackMember.role,
  }
}

function toDerivedPersonFromMember(member: FamilyMember | undefined | null): DerivedPerson | null {
  if (!member) return null
  return {
    id: member.id,
    name: member.name,
    initial: member.name?.[0]?.toUpperCase() ?? '?',
    color: member.color_hex ?? SHARED_GOLD,
    role: member.role,
  }
}

function applyPersistedDriverOverrides(
  event: EventWithDetails,
  legs: ReturnType<typeof derivePlan>['legs'],
  household: FamilyMember[],
  driverOverrides: Record<number, string>,
  waitsOverride: boolean | null,
) {
  const attendeeById = new Map(event.members.map((m) => [m.family_member.id, m.family_member]))
  const householdById = new Map(household.map((m) => [m.id, m]))
  const withDriverOverrides = legs.map((leg, index) => {
    const overrideDriverId = driverOverrides[index]
    if (!overrideDriverId || !leg.driver) return leg
    const familyMember = attendeeById.get(overrideDriverId) ?? householdById.get(overrideDriverId)
    const overrideDriver = toDerivedPersonFromMember(familyMember)
    return overrideDriver ? { ...leg, driver: overrideDriver } : leg
  })
  const waits = waitsOverride ?? Boolean(withDriverOverrides.find((leg) => leg.kind === 'stay')?.waits)
  return withDriverOverrides.map((leg) => {
    if (leg.kind !== 'stay') return leg
    if (!waits) return { ...leg, waits: false }
    const driveLeg = withDriverOverrides.find((item) => item.kind === 'drop' || item.kind === 'depart')
    return { ...leg, waits: true, title: `${driveLeg?.driver?.name ?? 'Driver'} waits on site` }
  })
}

function deriveHomeCardResponsibility(event: EventWithDetails, mode: ReturnType<typeof resolveEventMode>, household: FamilyMember[]) {
  const plan = derivePlan(event, mode, { household })
  const persisted = getPersistedPlanOverrides(event)
  const effectiveLegs = applyPersistedDriverOverrides(event, plan.legs, household, persisted.driverOverrides ?? {}, persisted.waits ?? null)
  const transportLeg = effectiveLegs.find((leg) => leg.kind === 'drop' || leg.kind === 'depart' || leg.kind === 'pickup' || leg.kind === 'return')
  const firstDriverLeg = transportLeg ?? effectiveLegs.find((leg) => leg.driver)
  const responsible = firstDriverLeg?.driver ?? fallbackResponsiblePerson(event)
  const attendees = (() => {
    if (!responsible) return event.members
    const withoutResponsible = event.members.filter((m) => m.family_member.id !== responsible.id)
    return withoutResponsible.length > 0 ? withoutResponsible : event.members
  })()
  const name = responsible?.name ?? (mode === 'hosted' ? 'Caregiver' : 'Driver')
  const stayLeg = effectiveLegs.find((leg) => leg.kind === 'stay')
  const hasDropOrDepart = effectiveLegs.some((leg) => leg.kind === 'drop' || leg.kind === 'depart')
  const hasPickupOrReturn = effectiveLegs.some((leg) => leg.kind === 'pickup' || leg.kind === 'return')
  const summary = mode === 'hosted'
    ? `${name} supervising`
    : stayLeg?.waits
      ? `${name} drives & stays`
      : hasDropOrDepart && hasPickupOrReturn
        ? `${name} drives`
        : hasDropOrDepart
          ? `${name} drops off`
          : hasPickupOrReturn
            ? `${name} picks up`
            : `${name} drives`
  return {
    responsible,
    attendees,
    summary,
    roleBadge: mode === 'hosted' ? 'supervise' as const : 'drive' as const,
  }
}

// ── Day event card (matched to Home timeline cards) ─────────────────

function DayEventCard({
  event,
  now,
  index,
  household,
  onOpen,
  onComplete,
  onSnooze,
  onSendToNeedsYou,
}: {
  event: EventWithDetails
  now: Date
  index: number
  household: FamilyMember[]
  onOpen: () => void
  onComplete?: (id: string) => void
  onSnooze?: (event: EventWithDetails) => void | Promise<void>
  onSendToNeedsYou?: (event: EventWithDetails) => void | Promise<void>
}) {
  const start = getEventStartDate(event)
  const end = getEventEndDate(event)
  const past = isBefore(end, now)
  const happening = isBefore(start, now) && isAfter(end, now)
  const color = eventColor(event)
  const timed = isTimedReminder(event)
  const mode = resolveEventMode(event)
  const isHosted = mode === 'hosted'

  const [checking, setChecking] = useState(false)
  const [snoozing, setSnoozing] = useState(false)
  const [movingToNeedsYou, setMovingToNeedsYou] = useState(false)
  const [overrideVersion, setOverrideVersion] = useState(0)
  const cleanTitle = cleanEventTitle(event.title)
  const isBirthday = isBirthdayEvent(event)

  useEffect(() => {
    function handleOverridesUpdated(e: Event) {
      const detail = (e as CustomEvent<{ eventId?: string }>).detail
      if (!detail?.eventId || detail.eventId === event.id) {
        setOverrideVersion((v) => v + 1)
      }
    }
    window.addEventListener('casa:overrides-updated', handleOverridesUpdated)
    return () => window.removeEventListener('casa:overrides-updated', handleOverridesUpdated)
  }, [event.id])

  const responsibility = useMemo(
    () => deriveHomeCardResponsibility(event, mode, household),
    [event, household, mode, overrideVersion],
  )
  const showLiveLeaveBy = !event.all_day && !happening && !isHosted && Boolean(event.address || event.location_name)
  const showFallbackLeaveBy = !event.all_day && !happening && !isHosted && !(event.address || event.location_name) && Boolean(event.enrichment?.departure_time)
  const fallbackDepartureAt = event.enrichment?.departure_time ? new Date(event.enrichment.departure_time) : null

  if (timed) {
    async function handleCheck(e: React.MouseEvent) {
      e.stopPropagation()
      if (checking || snoozing || movingToNeedsYou || !onComplete) return
      setChecking(true)
      await new Promise((r) => setTimeout(r, 320))
      onComplete(event.id)
    }
    async function handleSnooze(e: React.MouseEvent) {
      e.stopPropagation()
      if (checking || snoozing || movingToNeedsYou || !onSnooze) return
      setSnoozing(true)
      try {
        await onSnooze(event)
      } finally {
        setSnoozing(false)
      }
    }
    async function handleMoveToNeedsYou(e: React.MouseEvent) {
      e.stopPropagation()
      if (checking || snoozing || movingToNeedsYou || !onSendToNeedsYou) return
      setMovingToNeedsYou(true)
      try {
        await onSendToNeedsYou(event)
      } finally {
        setMovingToNeedsYou(false)
      }
    }
    return (
      <motion.li
        layout
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: past ? 0.4 : 1, x: 0 }}
        exit={{ opacity: 0, height: 0, marginBottom: 0, overflow: 'hidden' }}
        transition={{ duration: 0.3, delay: index * 0.04 }}
        className="cursor-pointer list-none"
        onClick={(e) => { e.stopPropagation(); onOpen() }}
      >
        <div className="relative w-full overflow-hidden rounded-card border border-casa-accent-soft-border bg-casa-accent-subtle px-4 py-2.5">
          <span className="absolute left-0 top-0 bottom-0 w-[8px] rounded-l-card bg-casa-warning" />
          <div className="flex items-center gap-2 pl-1 text-caption font-semibold text-casa-top-pick-band">
            <button
              onClick={handleCheck}
              disabled={checking || snoozing || movingToNeedsYou}
              className={`shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                checking ? 'bg-green-500 border-green-500' : 'border-casa-accent-soft-border hover:border-casa-success bg-transparent'
              }`}
              title="Mark done"
            >
              {checking && (
                <svg width="8" height="6" viewBox="0 0 9 7" fill="none">
                  <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
            <button
              onClick={handleSnooze}
              disabled={checking || snoozing || movingToNeedsYou || !onSnooze}
              className="shrink-0 w-5 h-5 rounded border border-casa-accent-soft-border bg-white/80 text-casa-muted hover:text-casa-text hover:bg-white transition-colors inline-flex items-center justify-center disabled:opacity-40"
              title="Snooze 1 hour"
            >
              <SnoozeOneHourIcon className={cn('w-3 h-3', snoozing && 'animate-pulse')} />
            </button>
            <button
              onClick={handleMoveToNeedsYou}
              disabled={checking || snoozing || movingToNeedsYou || !onSendToNeedsYou}
              className="shrink-0 w-5 h-5 rounded border border-casa-accent-soft-border bg-white/80 text-casa-muted hover:text-casa-text hover:bg-white transition-colors inline-flex items-center justify-center disabled:opacity-40"
              title="Move to Needs you"
            >
              <NeedsYouTransferIcon className={cn('w-3 h-3', movingToNeedsYou && 'animate-pulse')} />
            </button>
            <Bell size={13} className="shrink-0 text-casa-warning" />
            <span className="text-casa-muted tabular-nums">
              {format(start, 'h:mm a')}
            </span>
            <span className={cn(checking && 'line-through opacity-50')}>{event.title}</span>
            {event.members.length > 0 && (
              <div className="flex gap-1 ml-0.5">
                {event.members.slice(0, 3).map((m) => (
                  <span
                    key={m.id}
                    className="px-1.5 py-0.5 rounded-pill text-white text-[9px] font-bold leading-none whitespace-nowrap"
                    style={{ backgroundColor: m.family_member?.color_hex ?? SHARED_GOLD }}
                  >
                    {m.family_member?.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.li>
    )
  }

  return (
    <motion.li
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: past ? 0.45 : 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
      className="cursor-pointer list-none"
      onClick={(e) => { e.stopPropagation(); onOpen() }}
    >
      <div className={cn(
        'relative w-full min-w-0 overflow-hidden rounded-card border border-casa-border px-4 py-3 shadow-card',
        isBirthday ? 'bg-gradient-to-br from-[#FDF1F6] via-casa-surface to-[#FFFBEE]' : 'bg-casa-surface',
      )}>
        {isBirthday && <BirthdayCardDecoration />}
        <span
          className={cn('absolute left-0 top-0 bottom-0 w-[12px] rounded-l-card', happening && 'animate-pulse-gold')}
          style={{ backgroundColor: color }}
        />
        <div className="relative z-10 flex items-start gap-3">
          <div className="relative shrink-0 pl-1 pt-0.5">
            <span
              className={cn(
                'w-12 h-12 rounded-full text-white flex items-center justify-center text-[18px] font-bold shadow-card',
                responsibility.responsible?.role === 'caregiver' && 'ring-2 ring-casa-gold/55 ring-offset-2 ring-offset-casa-surface',
              )}
              style={{ backgroundColor: responsibility.responsible?.color ?? 'var(--color-casa-gold)' }}
              aria-label={responsibility.responsible ? `${responsibility.responsible.name} is responsible` : 'Responsible adult'}
            >
              {responsibility.responsible?.initial ?? '?'}
            </span>
            <span
              className={cn(
                'absolute right-[-2px] bottom-[-2px] w-5 h-5 rounded-full border-2 border-casa-surface flex items-center justify-center',
                responsibility.roleBadge === 'drive' ? 'bg-casa-navy' : 'bg-casa-success-strong',
              )}
              aria-label={responsibility.roleBadge === 'drive' ? 'Driving role' : 'Supervising role'}
            >
              {responsibility.roleBadge === 'drive' ? <DrivingBadgeIcon /> : <SupervisingBadgeIcon />}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-body font-semibold text-casa-text truncate md:overflow-visible md:text-clip md:whitespace-normal">
                  {isBirthday && <span className="mr-1" aria-hidden="true">🎂</span>}
                  {cleanTitle}
                </p>
                <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-1">
                  <span className="flex items-center gap-1 text-caption text-casa-muted tabular-nums">
                    <Clock size={11} className="shrink-0" />
                    {event.all_day ? 'All day' : `${format(start, 'h:mm a')} – ${format(end, 'h:mm a')}`}
                    {event.location_name && (
                      <WeatherIcon condition={event.enrichment?.weather_at_event} size={12} />
                    )}
                  </span>
                  {event.location_name && (
                    isHosted ? (
                      <span className="text-caption font-semibold uppercase tracking-wide text-casa-muted">At home</span>
                    ) : (
                      <span className="flex items-center gap-1 text-caption text-casa-muted truncate max-w-[180px] md:max-w-none md:overflow-visible md:text-clip md:whitespace-normal">
                        <MapPin size={11} className="shrink-0 text-casa-error" />
                        {event.location_name}
                      </span>
                    )
                  )}
                  {isHosted && !event.location_name && (
                    <span className="text-caption font-semibold uppercase tracking-wide text-casa-muted">At home</span>
                  )}
                </div>
              </div>

              {responsibility.attendees.length > 0 && (
                <div className="flex items-center gap-1 shrink-0">
                  {responsibility.attendees.slice(0, 3).map((m) => (
                    <span
                      key={m.id}
                      className="px-2 py-0.5 rounded-pill text-white text-caption font-bold leading-none whitespace-nowrap"
                      style={{ backgroundColor: m.family_member?.color_hex ?? SHARED_GOLD }}
                    >
                      {m.family_member?.name}
                    </span>
                  ))}
                  {responsibility.attendees.length > 3 && (
                    <span className="px-1.5 py-0.5 rounded-pill bg-casa-bg text-casa-muted text-caption font-bold leading-none">
                      +{responsibility.attendees.length - 3}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className={cn(
                'text-caption font-semibold',
                isHosted ? 'text-casa-success-strong' : 'text-casa-gold',
              )}>
                {responsibility.summary}
              </span>
              {showLiveLeaveBy && (
                <>
                  <span className="text-casa-text-faint text-caption">·</span>
                  <LeaveByCard
                    destination={event.address ?? event.location_name}
                    eventStartIso={event.start_time}
                    compact
                    className="!text-casa-gold"
                  />
                </>
              )}
              {showFallbackLeaveBy && (
                <>
                  <span className="text-casa-text-faint text-caption">·</span>
                  <span className="flex items-center gap-1 text-caption font-semibold text-casa-gold">
                    <Navigation size={11} className="shrink-0" />
                    {fallbackDepartureAt ? `Leave by ${format(fallbackDepartureAt, 'h:mm a')}` : 'Leave by soon'}
                    {event.enrichment?.drive_time_mins && ` · ${event.enrichment.drive_time_mins} min`}
                  </span>
                </>
              )}
            </div>

            {(isHosted || !event.enrichment?.departure_time) && event.enrichment?.prep_notes && (
              <p className="text-caption text-casa-muted mt-1 line-clamp-1 md:line-clamp-none">{event.enrichment.prep_notes}</p>
            )}
          </div>
        </div>
      </div>
    </motion.li>
  )
}

function DrivingBadgeIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.5" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="12" r="2" stroke="white" strokeWidth="2" />
      <path d="M12 3.5v6M5.8 16.6l4.1-2.7M18.2 16.6l-4.1-2.7" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function SupervisingBadgeIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3l7 2.6v5.2c0 4.3-3 7.3-7 8.4-4-1.1-7-4.1-7-8.4V5.6z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SnoozeOneHourIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="12" cy="13" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 9.8v3.4l2.2 1.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.2 3.8h7.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M5.7 6.2h2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function NeedsYouTransferIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M4.5 6.5h10.5M4.5 11.5h8M4.5 16.5h6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M14.2 9.2l4.3 3.3-4.3 3.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Sidecar: Prep items for this day's events ──────────────────────

function DaySidecar({ dayEvents, selectedDate }: { dayEvents: EventWithDetails[]; selectedDate: Date }) {
  const { data: allPrep } = usePrepItems()
  const { data: allConflicts } = useWeekConflicts()
  const dismiss = useDismissPrepItem()
  const snooze = useSnoozePrepItem()
  const resolveConflict = useResolveConflict()

  const dayEventIds = new Set(dayEvents.map(e => e.id))

  // Prep items tied to today's events
  const dayPrep = (allPrep ?? []).filter(p => p.event_id && dayEventIds.has(p.event_id))

  // Conflicts tied to today
  const dayConflicts = (allConflicts ?? []).filter(c => {
    const eventDate = c.event_a?.start_time ? parseISO(c.event_a.start_time) : null
    return eventDate && isSameDay(eventDate, selectedDate)
  })

  // Logistics hints for today's away events
  const awayEvents = dayEvents.filter(e => e.location_name && e.enrichment?.departure_time)

  const hasAnything = dayPrep.length > 0 || dayConflicts.length > 0 || awayEvents.length > 0

  return (
    <div className="w-80 shrink-0 border-l border-casa-border bg-casa-bg overflow-hidden">
      <BounceScroll className="h-full" innerClassName="p-4 space-y-4">

        {/* Logistics */}
        {awayEvents.length > 0 && (
          <div>
            <p className="text-caption font-semibold uppercase tracking-wide text-casa-muted mb-2 flex items-center gap-1.5">
              <Navigation size={12} /> Logistics
            </p>
            <div className="space-y-2">
              {awayEvents.map(e => (
                <div key={e.id} className="px-3 py-2.5 rounded-lg bg-casa-surface border border-casa-border">
                  <p className="text-body-sm font-medium text-casa-text leading-snug">{e.title}</p>
                  <p className="text-caption text-casa-gold font-semibold mt-0.5 flex items-center gap-1">
                    <Clock size={11} />
                    Leave by {format(parseISO(e.enrichment!.departure_time!), 'h:mm a')}
                    {e.enrichment?.drive_time_mins && ` · ${e.enrichment.drive_time_mins} min drive`}
                  </p>
                  {e.location_name && (
                    <p className="text-caption text-casa-muted mt-0.5 flex items-center gap-1">
                      <MapPin size={11} /> {e.location_name}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Conflicts */}
        {dayConflicts.length > 0 && (
          <div>
            <p className="text-caption font-semibold uppercase tracking-wide text-casa-muted mb-2 flex items-center gap-1.5">
              <AlertTriangle size={12} /> Conflicts
            </p>
            <div className="space-y-2">
              {dayConflicts.map(c => (
                <div key={c.id} className="px-3 py-2.5 rounded-lg bg-casa-surface border border-casa-border border-l-4 border-l-casa-error">
                  <p className="text-body-sm text-casa-text leading-snug">{c.description}</p>
                  <button
                    onClick={() => resolveConflict(c.id, 'dismissed from day view')}
                    className="text-caption text-casa-muted hover:text-red-500 mt-1 transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Prep items */}
        {dayPrep.length > 0 && (
          <div>
            <p className="text-caption font-semibold uppercase tracking-wide text-casa-muted mb-2 flex items-center gap-1.5">
              <ClipboardList size={12} /> Prep Needed
            </p>
            <div className="space-y-2">
              {dayPrep.map(item => {
                const days = item.event_date
                  ? differenceInDays(parseISO(item.event_date), new Date())
                  : null
                const daysLabel = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days !== null ? `In ${days} days` : ''
                return (
                  <div
                    key={item.id}
                    className={cn(
                      'px-3 py-2.5 rounded-lg border border-l-4 bg-casa-surface border-casa-border',
                      item.priority === 3 ? 'border-l-casa-error' :
                      item.priority === 2 ? 'border-l-casa-gold' :
                      'border-l-blue-500'
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-base leading-none shrink-0 mt-0.5">{item.emoji}</span>
                      <p className="text-body-sm text-casa-text leading-snug flex-1">{item.description}</p>
                    </div>
                    {daysLabel && (
                      <p className="text-caption text-casa-muted mt-1 ml-6">{daysLabel}</p>
                    )}
                    <div className="flex gap-2 mt-2 ml-6">
                      <button
                        onClick={() => snooze(item.id)}
                        className="text-caption text-casa-muted hover:text-casa-text transition-colors"
                      >
                        Snooze
                      </button>
                      <span className="text-casa-border text-caption">|</span>
                      <button
                        onClick={() => dismiss(item.id)}
                        className="text-caption text-casa-muted hover:text-red-600 transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {!hasAnything && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Calendar size={28} className="text-casa-divider mb-3" />
            <p className="text-body-sm text-casa-muted font-medium">All clear</p>
            <p className="text-caption text-casa-muted mt-1">No conflicts or prep needed for this day</p>
          </div>
        )}
      </BounceScroll>
    </div>
  )
}

// ── Main DayView ──────────────────────────────────────────────────

export default function DayView() {
  const { selectedDate, visibleMembers } = useCalendarStore()
  const now = useLiveClock(15_000)
  const { data: family } = useFamilyMembers()
  const { snoozeReminderOneHour, moveReminderToNeedsYou } = useReminderNeedsYouActions()

  // Use the week that contains the selected date to get events
  const { data: weekEvents } = useWeekEvents(selectedDate)
  const qc = useQueryClient()

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)

  const allEvents = (weekEvents ?? []).filter(e =>
    isHoliday(e) || isReminder(e) || visibleMembers.length === 0 || e.members.some(m => visibleMembers.includes(m.family_member?.id ?? ''))
  )

  // Events for the currently selected day
  const dayEvents = allEvents
    .filter(e => eventOverlapsDay(e, selectedDate))
    .sort((a, b) => {
      const aAllDay = Boolean(a.all_day)
      const bAllDay = Boolean(b.all_day)
      if (aAllDay && !bAllDay) return -1
      if (!aAllDay && bAllDay) return 1
      return getEventStartDate(a).getTime() - getEventStartDate(b).getTime()
    })

  const selectedEvent = selectedEventId ? (dayEvents.find(e => e.id === selectedEventId) ?? null) : null
  const completeReminder = useCallback(async (id: string) => {
    await supabase.from('events').update({ status: 'cancelled' }).eq('id', id)
    qc.invalidateQueries({ queryKey: ['events'] })
  }, [qc])

  return (
    <div className="flex h-full overflow-hidden" onClick={() => setSelectedEventId(null)}>

      {/* ── Main column ─────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Events list */}
        <BounceScroll
          className="flex-1"
          innerClassName="px-5 py-4"
          onClick={() => setSelectedEventId(null)}
        >
          {dayEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-casa-muted gap-2">
              <Calendar size={32} className="text-casa-divider" />
              <p className="text-body font-semibold">Nothing scheduled</p>
              <p className="text-caption">
                {'No events on this day.'}
              </p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              <ol className="space-y-2" onClick={e => e.stopPropagation()}>
                {dayEvents.map((event, index) => (
                  <DayEventCard
                    key={event.id}
                    event={event}
                    now={now}
                    index={index}
                    household={family ?? []}
                    onOpen={() => setSelectedEventId(event.id)}
                    onComplete={completeReminder}
                    onSnooze={(targetEvent) => {
                      void snoozeReminderOneHour(targetEvent).catch((error) => {
                        console.error('DayView: failed to snooze reminder by 1 hour', error)
                      })
                    }}
                    onSendToNeedsYou={(targetEvent) => {
                      void moveReminderToNeedsYou(targetEvent).catch((error) => {
                        console.error('DayView: failed to move reminder to Needs you', error)
                      })
                    }}
                  />
                ))}
              </ol>
            </AnimatePresence>
          )}
        </BounceScroll>
      </div>

      {/* ── Sidecar ─────────────────────────────────── */}
      <div className="hidden md:block">
        <DaySidecar dayEvents={dayEvents} selectedDate={selectedDate} />
      </div>

      <div onClick={e => e.stopPropagation()}>
        <EventDetailPanel
          event={selectedEvent}
          onClose={() => setSelectedEventId(null)}
        />
      </div>
    </div>
  )
}
