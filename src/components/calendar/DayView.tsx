import { useState, useEffect, useMemo } from 'react'
import { format, isAfter, isBefore, isSameDay, parseISO, differenceInMinutes } from 'date-fns'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Clock, MapPin, Navigation,
  Calendar, AlertTriangle, ClipboardList, Bell, Check,
} from 'lucide-react'
import { cn } from '../../utils/cn'
import { useCalendarStore } from '../../stores/calendarStore'
import { useAppStore } from '../../stores/appStore'
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
import { Button, CalendarPill, IconButton, PersonAvatarStack } from '../ui'
import { EventProvenanceBadge } from './EventProvenanceBadge'
import { EventSyncStatusDot } from './EventSyncStatusDot'
import SnoozeMenu from '../shared/SnoozeMenu'
import type { SnoozeDuration } from '../../utils/snoozeDuration'
import { differenceInDays } from 'date-fns'
import { isHoliday, isReminder, isTimedReminder } from '../../utils/holidays'
import BounceScroll from '../shared/BounceScroll'
import { eventOverlapsDay, getEventEndDate, getEventStartDate } from '../../utils/eventTime'
import { useReminderNeedsYouActions } from '../../hooks/useReminderNeedsYouActions'
import {
  resolveEventMode,
} from '../../lib/eventPlanOverrides'
import type { FamilyMember } from '../../types'
import { cleanEventTitle, isBirthdayEvent } from '../../utils/eventTitle'
import { deriveCalendarCardResponsibility } from '../../lib/calendarResponsibility'
import { useCalendarQuickCreateGesture } from '../../hooks/useCalendarQuickCreateGesture'
import QuickCreateSheet from '../shared/QuickCreateSheet'

export const SHARED_GOLD = 'var(--color-casa-gold)'

export function eventColor(ev: EventWithDetails): string {
  if (!ev.members || ev.members.length === 0) return SHARED_GOLD
  if (ev.members.length >= 4) return SHARED_GOLD
  return ev.members[0].family_member?.color_hex ?? SHARED_GOLD
}

export interface DayEventCardProps {
  event: EventWithDetails
  now: Date
  index?: number
  household: FamilyMember[]
  onOpen: () => void
  onComplete?: (id: string) => void
  onSnooze?: (event: EventWithDetails, duration: SnoozeDuration) => void | Promise<void>
  onSendToNeedsYou?: (event: EventWithDetails) => void | Promise<void>
  isHighlighted?: boolean
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  className?: string
}

// ── Day event card (matched to Home timeline cards & Turbo Canvas) ────

export function DayEventCard({
  event,
  now,
  index = 0,
  household,
  onOpen,
  onComplete,
  onSnooze,
  onSendToNeedsYou,
  isHighlighted = false,
  onMouseEnter,
  onMouseLeave,
  className,
}: DayEventCardProps) {
  const start = getEventStartDate(event)
  const end = getEventEndDate(event)
  const past = isBefore(end, now)
  const happening = isBefore(start, now) && isAfter(end, now)
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
    function handleEventUpdated(e: Event) {
      const detail = (e as CustomEvent<{ eventId?: string }>).detail
      if (!detail?.eventId || detail.eventId === event.id) {
        setOverrideVersion((v) => v + 1)
      }
    }
    window.addEventListener('casa:event-updated', handleEventUpdated)
    window.addEventListener('casa:overrides-updated', handleOverridesUpdated)
    return () => {
      window.removeEventListener('casa:event-updated', handleEventUpdated)
      window.removeEventListener('casa:overrides-updated', handleOverridesUpdated)
    }
  }, [event.id])

  const responsibility = useMemo(
    () => deriveCalendarCardResponsibility(event, household, now),
    [event, household, now, overrideVersion],
  )
  const hasNoRide = Boolean(event.plan_override?.transportation_plan && Array.isArray(event.plan_override.transportation_plan.legs) && event.plan_override.transportation_plan.legs.length === 0)
  const fallbackDepartureAt = useMemo(() => {
    if (event.all_day || hasNoRide) return null
    if (event.enrichment?.departure_time) return new Date(event.enrichment.departure_time)
    if (event.enrichment?.drive_time_mins && event.start_time) {
      return new Date(new Date(event.start_time).getTime() - (event.enrichment.drive_time_mins + 5) * 60_000)
    }
    return null
  }, [event.enrichment?.departure_time, event.enrichment?.drive_time_mins, event.start_time, event.all_day, hasNoRide])
  const showLiveLeaveBy = !event.all_day && !happening && !isHosted && !hasNoRide && Boolean(event.address || event.location_name)
  const showFallbackLeaveBy = !event.all_day && !happening && !isHosted && !hasNoRide && !(event.address || event.location_name) && Boolean(fallbackDepartureAt)

  if (timed) {
    async function handleCheck(e: React.MouseEvent) {
      e.stopPropagation()
      if (checking || snoozing || movingToNeedsYou || !onComplete) return
      setChecking(true)
      await new Promise((r) => setTimeout(r, 320))
      onComplete(event.id)
    }
    async function handleSnooze(duration: SnoozeDuration) {
      if (checking || snoozing || movingToNeedsYou || !onSnooze) return
      setSnoozing(true)
      try {
        await onSnooze(event, duration)
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
    if (past) {
      return (
        <motion.li
          layout
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 0.45, x: 0 }}
          exit={{ opacity: 0, height: 0, marginBottom: 0, overflow: 'hidden' }}
          whileTap={{ scale: 0.97, opacity: 0.75 }}
          transition={{ duration: 0.2, delay: index * 0.02 }}
          className="cursor-pointer list-none"
          data-calendar-event
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          onClick={(e) => { e.stopPropagation(); onOpen() }}
        >
          <div
            className={cn(
              'relative w-full overflow-hidden rounded-xl border border-amber-300/60 bg-amber-50/40 shadow-xs transition-all duration-200 min-h-[38px] px-3 py-1.5 flex items-center justify-between gap-2 border-l-4 border-l-amber-400 opacity-45 hover:opacity-85',
              isHighlighted && 'border-amber-400 ring-2 ring-inset ring-casa-gold shadow-card-hover',
              className
            )}
          >
            {/* Left: Time + Indicator + Title */}
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="font-mono text-caption font-bold text-amber-950 tabular-nums shrink-0">
                {format(start, 'h:mm a')}
              </span>
              <span className="text-amber-300 shrink-0">•</span>
              <span className="text-caption sm:text-body-sm font-semibold text-casa-navy truncate">
                {event.title}
              </span>
            </div>

            {/* Right: Member Pills + Done status */}
            <div className="flex items-center gap-1.5 shrink-0">
              {event.members.length > 0 && (
                <div className="flex gap-1">
                  {event.members.slice(0, 2).map((m) => (
                    <CalendarPill
                      key={m.id}
                      color={m.family_member?.color_hex ?? SHARED_GOLD}
                      className="!text-2xs !py-0 !px-1.5"
                    >
                      {m.family_member?.name}
                    </CalendarPill>
                  ))}
                </div>
              )}
              <span className="text-caption text-amber-900/60 font-medium">✓ Done</span>
            </div>
          </div>
        </motion.li>
      )
    }

    return (
      <motion.li
        layout
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: past ? 0.4 : 1, x: 0 }}
        exit={{ opacity: 0, height: 0, marginBottom: 0, overflow: 'hidden' }}
        whileTap={{ scale: 0.97, opacity: 0.75 }}
        transition={{ duration: 0.3, delay: index * 0.04 }}
        className="cursor-pointer list-none"
        data-calendar-event
        data-sidecar-loadable="true"
        data-event-id={event.id}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onClick={(e) => { e.stopPropagation(); onOpen() }}
      >
        <div className={cn(
          'relative w-full overflow-hidden rounded-widget border bg-amber-50/40 shadow-card grid grid-cols-1 sm:grid-cols-[125px_1fr] md:grid-cols-[135px_1fr] xl:grid-cols-[140px_1fr] transition-all',
          isHighlighted ? 'border-2 border-casa-gold shadow-card-hover' : 'border-casa-gold/30',
          className
        )}>
          {/* Left Pillar: Sand/Amber Time Block */}
          <div className="bg-amber-200/60 text-amber-950 px-3 py-1.5 sm:px-3 sm:py-2 flex flex-row sm:flex-col justify-between items-center sm:items-start border-b sm:border-b-0 sm:border-r border-amber-300/40 min-w-0">
            <div className="min-w-0">
              <div className="font-mono text-body sm:text-body-lg font-bold text-amber-950 tabular-nums leading-none">
                {format(start, 'h:mm')}
              </div>
              <div className="font-mono text-2xs sm:text-caption font-normal uppercase text-amber-900/75 mt-0.5 leading-none">
                {format(start, 'a')} · REMINDER
              </div>
            </div>
            <Bell size={13} className="text-amber-800 shrink-0 mt-0.5" />
          </div>

          {/* Right Content */}
          <div className="px-3 py-1.5 sm:px-3.5 sm:py-2 flex items-center justify-between gap-2.5 flex-wrap sm:flex-nowrap bg-casa-surface/60 min-w-0">
            <div className="min-w-0 flex-1">
              <span className={cn('text-body-sm font-bold text-casa-navy block truncate leading-snug', checking && 'line-through opacity-50')}>
                {event.title}
              </span>
              {event.members.length > 0 && (
                <div className="flex gap-1 mt-0.5">
                  {event.members.slice(0, 3).map((m) => (
                    <CalendarPill
                      key={m.id}
                      color={m.family_member?.color_hex ?? SHARED_GOLD}
                      className="!text-2xs !py-0 !px-1.5"
                    >
                      {m.family_member?.name}
                    </CalendarPill>
                  ))}
                </div>
              )}
            </div>

            {/* Action Buttons (Streamlined & accessible) */}
            <div className="flex items-center gap-1 shrink-0">
              <Button
                size="sm"
                variant={checking ? 'primary' : 'secondary'}
                onClick={handleCheck}
                disabled={checking || snoozing || movingToNeedsYou}
                className={cn('min-h-[34px] sm:min-h-[36px] px-2.5 sm:px-3 py-1 text-caption font-bold shadow-none', checking ? 'bg-casa-success text-white' : 'border-casa-border hover:border-casa-navy')}
              >
                <Check size={14} strokeWidth={2.5} className="mr-1" />
                Done
              </Button>
              <SnoozeMenu
                onSnooze={(duration) => { void handleSnooze(duration) }}
                renderTrigger={({ onClick }) => (
                  <IconButton
                    size="sm"
                    variant="ghost"
                    onClick={onClick}
                    disabled={checking || snoozing || movingToNeedsYou || !onSnooze}
                    aria-label="Snooze reminder"
                    title="Snooze"
                    className="min-h-[34px] min-w-[34px] text-casa-muted hover:text-casa-navy"
                    icon={<SnoozeOneHourIcon className={cn('w-4 h-4', snoozing && 'animate-pulse')} />}
                  />
                )}
              />
              <IconButton
                size="sm"
                variant="ghost"
                onClick={handleMoveToNeedsYou}
                disabled={checking || snoozing || movingToNeedsYou || !onSendToNeedsYou}
                aria-label="Move to Needs you"
                title="Move to Needs you"
                className="min-h-[34px] min-w-[34px] text-casa-muted hover:text-casa-navy"
                icon={<NeedsYouTransferIcon className={cn('w-4 h-4', movingToNeedsYou && 'animate-pulse')} />}
              />
            </div>
          </div>
        </div>
      </motion.li>
    )
  }

  if (past && !happening) {
    return (
      <motion.li
        layout
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 0.45, x: 0 }}
        whileTap={{ scale: 0.97, opacity: 0.75 }}
        transition={{ duration: 0.2, delay: index * 0.02 }}
        className="cursor-pointer list-none"
        data-calendar-event
        data-sidecar-loadable="true"
        data-event-id={event.id}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onClick={(e) => { e.stopPropagation(); onOpen() }}
      >
        <div
          className={cn(
            'relative w-full min-w-0 overflow-hidden rounded-xl border border-casa-border/60 bg-casa-surface/90 shadow-xs transition-all duration-200 min-h-[38px] px-3 py-1.5 flex items-center justify-between gap-2.5 border-l-4 opacity-45 hover:opacity-85',
            isHighlighted ? 'border-2 border-casa-gold shadow-card-hover opacity-100' : 'hover:border-casa-gold/60',
            className
          )}
          style={{ borderLeftColor: eventColor(event) }}
        >
          {/* Left: Time + Divider + Title + (optional brief location) */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="font-mono text-caption font-bold text-casa-navy tabular-nums shrink-0">
              {event.all_day ? 'ALL DAY' : format(start, 'h:mm a')}
            </span>
            <span className="text-casa-divider shrink-0">•</span>
            <EventProvenanceBadge sourceType={event.source_type} />
            <span className="text-caption sm:text-body-sm font-semibold text-casa-navy truncate">
              {isBirthday && <span className="mr-1" aria-hidden="true">🎂</span>}
              {cleanTitle}
            </span>
            {event.location_name && (
              <span className="hidden md:flex items-center gap-1 text-caption text-casa-muted truncate max-w-[160px]">
                <span className="text-casa-divider">•</span>
                <span className="truncate">{isHosted ? 'At home' : event.location_name}</span>
              </span>
            )}
          </div>

          {/* Right: Driver/Supervisor Capsule + Attendee Avatars */}
          <div className="flex items-center gap-2 shrink-0">
            {responsibility.responsible ? (
              <div
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-casa-bg border border-casa-border/70 text-caption font-medium"
                title={`${responsibility.responsible.name} (${responsibility.roleBadge === 'drive' ? 'Driver assigned' : isHosted ? 'Hosting' : 'Supervising'})`}
              >
                <div className="relative inline-flex shrink-0">
                  <span
                    className="w-4 h-4 rounded-full text-white flex items-center justify-center text-caption font-bold shrink-0 leading-none"
                    style={{ backgroundColor: responsibility.responsible?.color ?? SHARED_GOLD }}
                  >
                    {responsibility.responsible?.initial ?? '?'}
                  </span>
                  <span
                    className={cn(
                      'absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full border border-casa-surface flex items-center justify-center',
                      responsibility.roleBadge === 'drive' ? 'bg-casa-navy' : 'bg-casa-success-strong'
                    )}
                    aria-label={responsibility.roleBadge === 'drive' ? 'Drives' : isHosted ? 'Hosting' : 'Supervising'}
                  >
                    {responsibility.roleBadge === 'drive' ? <DrivingBadgeIcon /> : <SupervisingBadgeIcon />}
                  </span>
                </div>
                <span className="text-caption font-semibold text-casa-navy truncate max-w-[75px]">
                  {responsibility.responsible.name}
                </span>
              </div>
            ) : (
              responsibility.summary && (
                <span className={cn('text-caption font-semibold hidden sm:inline', isHosted ? 'text-casa-success-strong' : 'text-casa-gold')}>
                  {responsibility.summary}
                </span>
              )
            )}

            {responsibility.attendees.length > 0 && (
              <PersonAvatarStack
                people={responsibility.attendees.map((m) => ({
                  id: m.id,
                  name: m.family_member?.name ?? '?',
                  color: m.family_member?.color_hex ?? SHARED_GOLD,
                }))}
                max={3}
                size="xs"
                className="shrink-0"
              />
            )}

            <EventSyncStatusDot event={event} size="xs" />
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
      whileTap={{ scale: 0.97, opacity: 0.75 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
      className="cursor-pointer list-none"
      data-calendar-event
      data-sidecar-loadable="true"
      data-event-id={event.id}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={(e) => { e.stopPropagation(); onOpen() }}
    >
      <div className={cn(
        'relative w-full min-w-0 overflow-hidden rounded-widget border shadow-card hover:shadow-card-hover transition-all duration-200',
        'grid grid-cols-1 sm:grid-cols-[125px_1fr] md:grid-cols-[135px_1fr] xl:grid-cols-[140px_1fr]',
        isBirthday ? 'bg-gradient-to-br from-casa-accent-subtle via-casa-surface to-casa-bg' : 'bg-casa-surface',
        isHighlighted ? 'border-2 border-casa-gold shadow-card-hover' : 'border-casa-border/60 hover:border-casa-navy/60',
        className
      )}>
        {isBirthday && <BirthdayCardDecoration />}

        {/* ── Left Pillar: Architectural Time Anchor ── */}
        <div
          className={cn(
            'flex flex-row sm:flex-col justify-between items-center sm:items-start p-3.5 sm:p-4 text-white relative border-b sm:border-b-0 sm:border-r border-casa-border/40 sm:border-l-4',
            happening ? 'bg-casa-navy ring-1 ring-inset ring-casa-gold/40' : 'bg-casa-navy'
          )}
          style={{ borderLeftColor: eventColor(event) }}
        >
          <div>
            <div className="font-mono text-heading sm:text-display-xs font-bold leading-none tracking-tight text-white tabular-nums">
              {event.all_day ? 'ALL DAY' : format(start, 'h:mm')}
            </div>
            {!event.all_day && (
              <div className="font-mono text-caption uppercase text-white/70 font-semibold mt-1">
                {format(start, 'a')} {event.end_time && `· ${Math.round(differenceInMinutes(end, start))}m`}
              </div>
            )}
          </div>

          {/* Departure Pill / Travel Bar inside pillar */}
          {showLiveLeaveBy && (
            <div className="mt-2 w-full pt-1.5 border-t border-white/15">
              <LeaveByCard
                destination={event.address ?? event.location_name}
                eventStartIso={event.start_time}
                compact
                className="!text-casa-gold text-caption font-semibold"
              />
            </div>
          )}
          {showFallbackLeaveBy && (
            <div className="mt-2 w-full pt-1.5 border-t border-white/15">
              <span className="flex items-center gap-1 text-caption font-semibold text-casa-gold">
                <Navigation size={11} className="shrink-0" />
                {fallbackDepartureAt ? `Leave ${format(fallbackDepartureAt, 'h:mm a')}` : 'Leave soon'}
              </span>
            </div>
          )}
        </div>

        {/* ── Right Deck: Content, Driver Chip, Attendees & Action ── */}
        <div className="p-4 flex flex-col justify-between gap-3 min-w-0 bg-casa-surface">
          {/* Top Row: Title + Quick Navigation Button */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <EventProvenanceBadge sourceType={event.source_type} />
                <p className="font-display text-body-lg sm:text-heading font-bold text-casa-navy leading-snug truncate md:overflow-visible md:text-clip md:whitespace-normal">
                  {isBirthday && <span className="mr-1" aria-hidden="true">🎂</span>}
                  {cleanTitle}
                </p>
              </div>
              <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-1">
                {event.location_name && (
                  isHosted ? (
                    <span className="text-caption font-semibold uppercase tracking-wide text-casa-muted">At home</span>
                  ) : (
                    <span className="flex items-center gap-1 text-caption text-casa-muted truncate max-w-[200px] md:max-w-none">
                      <MapPin size={12} className="shrink-0 text-casa-gold" />
                      {event.location_name}
                    </span>
                  )
                )}
                {isHosted && !event.location_name && (
                  <span className="text-caption font-semibold uppercase tracking-wide text-casa-muted">At home</span>
                )}
                {event.location_name && event.enrichment?.weather_at_event && (
                  <WeatherIcon condition={event.enrichment.weather_at_event} size={12} />
                )}
              </div>
            </div>

            {/* Top Right: Sync Status Dot & Directions button */}
            <div className="flex items-center gap-1.5 shrink-0">
              <EventSyncStatusDot event={event} size="sm" />
              {(event.address || event.location_name) && !isHosted && (
                <IconButton
                  variant="secondary"
                  size="sm"
                  aria-label={`Open directions to ${event.location_name || event.address}`}
                  title="Open directions"
                  onClick={(e) => {
                    e.stopPropagation()
                    const query = event.address ? `${event.location_name ? `${event.location_name}, ` : ''}${event.address}` : event.location_name
                    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query || '')}`, '_blank')
                  }}
                  className="shrink-0 min-h-[44px] min-w-[44px] text-casa-navy border-casa-border hover:border-casa-navy"
                  icon={<Navigation size={14} className="text-casa-gold" />}
                />
              )}
            </div>
          </div>

          {/* Footer Row: Responsibility Chip + Attendee Stack */}
          <div className="pt-3 border-t border-casa-divider/70 flex flex-wrap items-center justify-between gap-2">
            {responsibility.responsible ? (
              <div
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-casa-bg border border-casa-border/80 text-caption font-medium"
                title={`${responsibility.responsible.name} (${responsibility.roleBadge === 'drive' ? 'Driver assigned' : isHosted ? 'Hosting' : 'Supervising'})`}
              >
                <div className="relative inline-flex shrink-0">
                  <span
                    className="w-7 h-7 rounded-full text-white flex items-center justify-center text-caption font-bold leading-none shadow-card border-2 border-casa-surface"
                    style={{ backgroundColor: responsibility.responsible?.color ?? 'var(--color-casa-gold)' }}
                  >
                    {responsibility.responsible?.initial ?? '?'}
                  </span>
                  <span
                    className={cn(
                      'absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border border-casa-surface flex items-center justify-center',
                      responsibility.roleBadge === 'drive' ? 'bg-casa-navy' : 'bg-casa-success-strong'
                    )}
                    aria-label={responsibility.roleBadge === 'drive' ? 'Drives' : isHosted ? 'Hosting' : 'Supervising'}
                  >
                    {responsibility.roleBadge === 'drive' ? <DrivingBadgeIcon /> : <SupervisingBadgeIcon />}
                  </span>
                </div>
                <span className="text-caption font-semibold text-casa-navy">
                  {responsibility.responsible.name}
                </span>
              </div>
            ) : (
              <span className={cn('text-caption font-semibold', isHosted ? 'text-casa-success-strong' : 'text-casa-gold')}>
                {responsibility.summary}
              </span>
            )}

            {responsibility.attendees.length > 0 && (
              <div className="flex items-center gap-1.5 ml-auto">
                <PersonAvatarStack
                  people={responsibility.attendees.map((m) => ({
                    id: m.id,
                    name: m.family_member?.name ?? '?',
                    color: m.family_member?.color_hex ?? SHARED_GOLD,
                  }))}
                  max={4}
                  size="md"
                  className="shrink-0"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.li>
  )
}

export function DrivingBadgeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-full h-full p-0.5" aria-hidden>
      <circle cx="12" cy="12" r="8.5" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="12" cy="12" r="2" stroke="white" strokeWidth="2.2" />
      <path d="M12 3.5v6M5.8 16.6l4.1-2.7M18.2 16.6l-4.1-2.7" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

export function SupervisingBadgeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-full h-full p-0.5" aria-hidden>
      <path d="M12 3l7 2.6v5.2c0 4.3-3 7.3-7 8.4-4-1.1-7-4.1-7-8.4V5.6z" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
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
                  <Button
                    onClick={() => resolveConflict(c.id, 'dismissed from day view')}
                    variant="ghost"
                    size="sm"
                    className="mt-1 min-h-0 p-0 text-caption text-casa-muted hover:bg-transparent hover:text-casa-error"
                  >
                    Dismiss
                  </Button>
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
                      <Button
                        onClick={() => snooze(item.id)}
                        variant="ghost"
                        size="sm"
                        className="min-h-0 p-0 text-caption text-casa-muted hover:bg-transparent"
                      >
                        Snooze
                      </Button>
                      <span className="text-casa-border text-caption">|</span>
                      <Button
                        onClick={() => dismiss(item.id)}
                        variant="ghost"
                        size="sm"
                        className="min-h-0 p-0 text-caption text-casa-muted hover:bg-transparent hover:text-casa-error"
                      >
                        Dismiss
                      </Button>
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
  const { selectedSidecarEventId, aiDrawerOpen, sidecarTab, openEventInSidecar } = useAppStore()
  const now = useLiveClock(15_000)
  const { data: family } = useFamilyMembers()
  const { completeReminder, snoozeReminderByDuration, moveReminderToNeedsYou } = useReminderNeedsYouActions()

  // Use the week that contains the selected date to get events
  const { data: weekEvents } = useWeekEvents(selectedDate)
  const activeEventId = aiDrawerOpen && sidecarTab === 'event' ? selectedSidecarEventId : null
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [quickCreate, setQuickCreate] = useState<{ open: boolean; start?: Date }>({ open: false })
  const quickCreateGesture = useCalendarQuickCreateGesture<Date>({
    resolveStart: (day) => {
      const start = new Date(day)
      start.setHours(9, 0, 0, 0)
      return start
    },
    onCreate: (start) => setQuickCreate({ open: true, start }),
  })

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
  return (
    <div className="flex h-full overflow-hidden" onClick={() => setSelectedEventId(null)}>

      {/* ── Main column ─────────────────────────────── */}
      <div
        className="flex-1 flex flex-col overflow-hidden touch-pan-y"
        onPointerDown={(event) => quickCreateGesture.onPointerDown(event, selectedDate)}
        onPointerMove={quickCreateGesture.onPointerMove}
        onPointerUp={quickCreateGesture.onPointerUp}
        onPointerCancel={quickCreateGesture.onPointerCancel}
        onDoubleClick={(event) => quickCreateGesture.onDoubleClick(event, selectedDate)}
      >

        {/* Events list */}
        <BounceScroll
          className="flex-1"
          innerClassName="px-5 py-4 pb-28 md:pb-4"
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
                    isHighlighted={activeEventId === event.id}
                    onOpen={() => {
                      openEventInSidecar(event.id)
                      setSelectedEventId(event.id)
                    }}
                    onComplete={completeReminder}
                    onSnooze={(targetEvent, duration) => {
                      void snoozeReminderByDuration(targetEvent, duration).catch((error) => {
                        console.error('DayView: failed to snooze reminder', error)
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
      <QuickCreateSheet
        open={quickCreate.open}
        initialStart={quickCreate.start}
        onClose={() => setQuickCreate({ open: false })}
      />
    </div>
  )
}
