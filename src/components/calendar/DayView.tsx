import { useState, useEffect, useMemo } from 'react'
import { format, isAfter, isBefore, isSameDay, parseISO, differenceInMinutes } from 'date-fns'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Clock, MapPin, Navigation, Send,
  Calendar, AlertTriangle, ClipboardList, Check,
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
import { Button, CalendarPill, IconButton, PersonAvatarStack } from '../ui'
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
        whileTap={{ scale: 0.98, opacity: 0.85 }}
        transition={{ duration: 0.25, delay: index * 0.03 }}
        className="cursor-pointer list-none"
        data-calendar-event
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onClick={(e) => { e.stopPropagation(); onOpen() }}
      >
        <div className={cn(
          'w-full overflow-hidden rounded-2xl bg-casa-surface border border-casa-border/80 shadow-xs hover:shadow-card-hover transition-all flex flex-row items-stretch min-h-[58px]',
          isHighlighted && 'border-casa-gold ring-2 ring-casa-gold/40 shadow-card-hover',
          className
        )}>
          {/* Left Pillar: Proportional Cashmere Sand Time Block */}
          <div className="w-[6rem] min-w-[6rem] sm:w-[6.5rem] sm:min-w-[6.5rem] bg-casa-surface-subtle border-r border-casa-control-border/80 px-2.5 py-2 flex flex-col justify-center items-center text-center shrink-0 select-none">
            <div className="font-body text-body font-bold text-casa-top-pick-band leading-none tabular-nums">
              {format(start, 'h:mm')}
            </div>
            <div className="font-mono text-3xs font-bold tracking-widest uppercase text-casa-top-pick-band/80 mt-1 flex items-center justify-center gap-0.5 leading-none whitespace-nowrap">
              <span>{format(start, 'a')}</span>
              <span>•</span>
              <span>REMIND</span>
            </div>
          </div>

          {/* Right Content */}
          <div className="px-4 py-2.5 flex items-center justify-between gap-3 flex-1 min-w-0 bg-casa-surface">
            <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap sm:flex-nowrap">
              <span className={cn('font-body text-body-sm sm:text-body font-bold text-casa-navy truncate leading-snug', checking && 'line-through opacity-50')}>
                {event.title}
              </span>
              {event.members.length > 0 && (
                <div className="flex gap-1 shrink-0">
                  {event.members.slice(0, 2).map((m) => (
                    <span
                      key={m.id}
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-caption font-medium bg-casa-info-soft text-casa-info-strong"
                    >
                      {m.family_member?.name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Action Cluster */}
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCheck}
                disabled={checking || snoozing || movingToNeedsYou}
                className={cn(
                  'h-8 px-3 rounded-full border border-casa-control-border bg-casa-surface hover:bg-emerald-50 hover:border-emerald-500 hover:text-emerald-800 text-caption font-bold text-casa-navy shadow-xs flex items-center gap-1 transition-all',
                  checking && 'bg-casa-success border-casa-success text-white hover:bg-casa-success'
                )}
              >
                <Check size={12} strokeWidth={2.5} className={checking ? 'text-white' : 'text-casa-navy'} />
                <span>Done</span>
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
                    className="w-8 h-8 rounded-full hover:bg-casa-surface-subtle text-casa-muted hover:text-casa-navy flex items-center justify-center transition-all"
                    icon={<Clock size={14} className={cn(snoozing && 'animate-pulse text-amber-600')} />}
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
                className="w-8 h-8 rounded-full hover:bg-casa-surface-subtle text-casa-muted hover:text-casa-navy flex items-center justify-center transition-all"
                icon={<NeedsYouTransferIcon className={cn('w-3.5 h-3.5 text-casa-muted', movingToNeedsYou && 'animate-pulse')} />}
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
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onClick={(e) => { e.stopPropagation(); onOpen() }}
      >
        <div
          className={cn(
            'relative w-full min-w-0 overflow-hidden rounded-xl border border-casa-border/60 bg-casa-surface/90 shadow-xs transition-all duration-200 min-h-[38px] px-3 py-1.5 flex items-center justify-between gap-2.5 border-l-4 opacity-45 hover:opacity-85',
            isHighlighted ? 'border-casa-navy ring-2 ring-inset ring-casa-gold shadow-card-hover' : 'hover:border-casa-gold/60',
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
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-casa-bg border border-casa-border/70 text-caption font-medium">
                <span
                  className="w-4 h-4 rounded-full text-white flex items-center justify-center text-caption font-bold shrink-0"
                  style={{ backgroundColor: responsibility.responsible?.color ?? SHARED_GOLD }}
                >
                  {responsibility.responsible?.initial ?? '?'}
                </span>
                <span className="text-caption font-semibold text-casa-navy truncate max-w-[70px]">
                  {responsibility.responsible.name}
                </span>
                <span className={cn(
                  'text-caption font-bold px-1 rounded flex items-center gap-1',
                  responsibility.roleBadge === 'drive' ? 'bg-casa-gold/15 text-casa-gold' : 'bg-casa-success/15 text-casa-success-strong'
                )}>
                  {responsibility.roleBadge === 'drive' ? (
                    <>
                      <span className="w-3 h-3 bg-casa-navy rounded-full inline-flex items-center justify-center shrink-0">
                        <DrivingBadgeIcon />
                      </span>
                      <span>Drives</span>
                    </>
                  ) : (
                    <>
                      <span className="w-3 h-3 bg-casa-success-strong rounded-full inline-flex items-center justify-center shrink-0">
                        <SupervisingBadgeIcon />
                      </span>
                      <span>{isHosted ? 'Hosting' : 'Supervising'}</span>
                    </>
                  )}
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
      whileTap={{ scale: 0.98, opacity: 0.85 }}
      transition={{ duration: 0.25, delay: index * 0.03 }}
      className="cursor-pointer list-none"
      data-calendar-event
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={(e) => { e.stopPropagation(); onOpen() }}
    >
      <div className={cn(
        'w-full min-w-0 overflow-hidden rounded-2xl bg-casa-surface border border-casa-border/80 shadow-xs hover:shadow-card-hover transition-all flex flex-row items-stretch min-h-[76px]',
        isBirthday ? 'bg-gradient-to-br from-casa-accent-subtle/30 via-casa-surface to-casa-surface' : 'bg-casa-surface',
        isHighlighted && 'border-casa-navy ring-2 ring-casa-navy/30 shadow-card-hover',
        className
      )}>
        {isBirthday && <BirthdayCardDecoration />}

        {/* ── Left Pillar: Midnight Navy Architectural Anchor ── */}
        <div
          className={cn(
            'w-[7rem] min-w-[7rem] sm:w-[7.5rem] sm:min-w-[7.5rem] bg-casa-navy text-white p-3 flex flex-col justify-between items-start shrink-0 select-none relative',
            happening ? 'bg-casa-navy ring-1 ring-inset ring-casa-gold/40' : 'bg-casa-navy'
          )}
        >
          <div>
            <div className="font-body text-body-lg font-bold leading-none text-white tabular-nums">
              {event.all_day ? 'ALL DAY' : format(start, 'h:mm')}
              {!event.all_day && (
                <span className="text-caption font-semibold text-white/70 ml-1">
                  {format(start, 'a')}
                </span>
              )}
            </div>
            {!event.all_day && event.end_time && (
              <div className="font-mono text-3xs text-white/75 mt-1 font-medium leading-none whitespace-nowrap">
                {Math.round(differenceInMinutes(end, start))} min
              </div>
            )}
          </div>

          {/* Departure Note */}
          {showLiveLeaveBy && (
            <div className="text-3xs text-casa-gold font-medium truncate w-full leading-none whitespace-nowrap">
              <LeaveByCard
                destination={event.address ?? event.location_name}
                eventStartIso={event.start_time}
                compact
                className="!text-casa-gold !p-0 !bg-transparent !border-none text-3xs"
              />
            </div>
          )}
          {showFallbackLeaveBy && (
            <div className="text-3xs text-casa-gold font-medium truncate w-full leading-none whitespace-nowrap">
              {fallbackDepartureAt ? `Leave ${format(fallbackDepartureAt, 'h:mm a')}` : 'Leave soon'}
            </div>
          )}
        </div>

        {/* ── Right Content ── */}
        <div className="p-3.5 flex flex-col justify-between gap-2 flex-1 min-w-0 bg-casa-surface">
          {/* Top: Title + Location */}
          <div className="min-w-0">
            <h3 className="font-serif text-heading font-bold text-casa-navy leading-snug truncate">
              {isBirthday && <span className="mr-1" aria-hidden="true">🎂</span>}
              {cleanTitle}
            </h3>
            {(event.location_name || isHosted) && (
              <div className="flex items-center gap-1 text-caption text-casa-muted mt-0.5">
                {isHosted ? (
                  <span>At home</span>
                ) : (
                  <>
                    <MapPin size={12} className="shrink-0 text-casa-muted" />
                    <span className="truncate">{event.location_name}</span>
                  </>
                )}
                {event.location_name && event.enrichment?.weather_at_event && (
                  <WeatherIcon condition={event.enrichment.weather_at_event} size={12} />
                )}
              </div>
            )}
          </div>

          {/* Bottom Row: Responsibility Capsule + Attendee Avatars & Send Action */}
          <div className="flex items-center justify-between gap-2">
            {/* Responsibility Chips */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {responsibility.responsible && (
                <span
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-white text-caption font-bold shadow-2xs"
                  style={{ backgroundColor: responsibility.responsible?.color ?? SHARED_GOLD }}
                >
                  {responsibility.responsible.initial} {responsibility.responsible.name}
                </span>
              )}

              {responsibility.roleBadge === 'drive' ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-casa-surface-subtle text-casa-top-pick-band border border-casa-control-border text-3xs font-semibold">
                  <DrivingCompassIcon className="w-3 h-3 text-casa-top-pick-band" />
                  <span>Driver Assigned</span>
                </span>
              ) : responsibility.roleBadge === 'supervise' ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-900 border border-emerald-200/80 text-3xs font-semibold">
                  <SupervisingBadgeIcon />
                  <span>{isHosted ? 'Hosting' : 'Supervising'}</span>
                </span>
              ) : responsibility.summary ? (
                <span className="text-caption font-semibold text-casa-top-pick-band">
                  {responsibility.summary}
                </span>
              ) : null}
            </div>

            {/* Attendees & Navigation Action */}
            <div className="flex items-center gap-2 ml-auto">
              {responsibility.attendees.length > 0 && (
                <div className="flex items-center -space-x-1.5">
                  {responsibility.attendees.slice(0, 4).map((m) => (
                    <span
                      key={m.id}
                      className="w-5 h-5 rounded-full text-white font-bold text-3xs flex items-center justify-center ring-2 ring-white shadow-2xs shrink-0"
                      style={{ backgroundColor: m.family_member?.color_hex ?? SHARED_GOLD }}
                      title={m.family_member?.name}
                    >
                      {m.family_member?.name?.[0]?.toUpperCase() ?? '?'}
                    </span>
                  ))}
                </div>
              )}

              {/* Quick Navigation / Send Icon */}
              {(event.address || event.location_name) && !isHosted && (
                <IconButton
                  variant="ghost"
                  size="sm"
                  aria-label={`Open directions to ${event.location_name || event.address}`}
                  title="Open directions"
                  onClick={(e) => {
                    e.stopPropagation()
                    const query = event.address ? `${event.location_name ? `${event.location_name}, ` : ''}${event.address}` : event.location_name
                    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query || '')}`, '_blank')
                  }}
                  className="min-h-[30px] min-w-[30px] p-1 text-casa-muted hover:text-casa-navy hover:bg-black/5 rounded-full"
                  icon={<Send size={14} className="text-casa-muted" />}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.li>
  )
}

export function DrivingBadgeIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.5" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="2" r="2" stroke="white" strokeWidth="2" />
      <path d="M12 3.5v6M5.8 16.6l4.1-2.7M18.2 16.6l-4.1-2.7" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function DrivingCompassIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z" />
    </svg>
  )
}

export function SupervisingBadgeIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3l7 2.6v5.2c0 4.3-3 7.3-7 8.4-4-1.1-7-4.1-7-8.4V5.6z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function NeedsYouTransferIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 12h11M11 7l5 5-5 5M19 5v14" />
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
  const now = useLiveClock(15_000)
  const { data: family } = useFamilyMembers()
  const { completeReminder, snoozeReminderByDuration, moveReminderToNeedsYou } = useReminderNeedsYouActions()

  // Use the week that contains the selected date to get events
  const { data: weekEvents } = useWeekEvents(selectedDate)
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
                    onOpen={() => setSelectedEventId(event.id)}
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
