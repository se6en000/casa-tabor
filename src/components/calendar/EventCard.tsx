import { useState, useEffect, useMemo } from 'react'
import { format, isBefore, isAfter, differenceInMinutes } from 'date-fns'
import { motion } from 'framer-motion'
import { MapPin, AlertTriangle, Navigation } from 'lucide-react'
import { cn } from '../../utils/cn'
import { cleanEventTitle, isBirthdayEvent } from '../../utils/eventTitle'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import { WeatherIcon } from '../shared/WeatherIcon'
import { BirthdayCardDecoration } from '../shared/BirthdayCardDecoration'
import { isEventMultiDay, getEventEndDate, getEventStartDate } from '../../utils/eventTime'
import { PersonAvatarStack } from '../ui'
import { MemberJewelPill } from '../ui/MemberJewelPill'
import { EventProvenanceBadge } from './EventProvenanceBadge'
import { EventSyncStatusDot } from './EventSyncStatusDot'
import type { FamilyMember } from '../../types'
import { deriveCalendarCardResponsibility } from '../../lib/calendarResponsibility'
import { resolveEventMode } from '../../lib/eventPlanOverrides'

// The single card used for every real (non-reminder) event in the calendar's
// stacking view (StackedView.tsx / DayView.tsx), and — since 2026-09-24 — the
// homepage's Today/Tomorrow lists too, so both places render identically and
// stay identical by construction instead of by two copies kept in sync by hand.
export const SHARED_COLOR = 'var(--color-casa-gold)'

export function formatCompactDuration(minutes: number): string {
  if (minutes <= 0 || minutes >= 1440) return ''
  if (minutes < 60) return `${minutes}m`
  if (minutes % 60 === 0) return `${minutes / 60}h`
  const hours = (minutes / 60).toFixed(1).replace('.0', '')
  return `${hours}h`
}

export function getPrimaryColor(event: EventWithDetails): string {
  if (!event.members || event.members.length === 0) return SHARED_COLOR
  if (event.members.length >= 5) return SHARED_COLOR
  const primary = event.members.find(m => m.role === 'primary') ?? event.members[0]
  return primary?.family_member?.color_hex || SHARED_COLOR
}

export interface EventCardProps {
  event: EventWithDetails
  household: FamilyMember[]
  now?: Date
  isHighlighted?: boolean
  onClick: () => void
}

export default function EventCard({ event, household, now = new Date(), isHighlighted = false, onClick }: EventCardProps) {
  const color = getPrimaryColor(event)
  const enr = event.enrichment
  const urgentAction = event.actions?.find(a => a.is_urgent && !a.completed)
  const start = getEventStartDate(event)
  const end = getEventEndDate(event)
  const past = isBefore(end, now)
  const isAllDayEvent = Boolean(event.all_day)
  const happening = !isAllDayEvent && isBefore(start, now) && isAfter(end, now)
  const isHeroState = happening || Boolean(urgentAction)
  const isMultiDay = isEventMultiDay(event)
  const mode = resolveEventMode(event)
  const isHosted = mode === 'hosted'
  const isBirthday = isBirthdayEvent(event)
  const cleanTitle = cleanEventTitle(event.title)

  // Re-derive driver/attendee responsibility whenever overrides change
  const [overrideVersion, setOverrideVersion] = useState(0)
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
    () => deriveCalendarCardResponsibility(event, household, new Date()),
    [event, household, now, overrideVersion]
  )

  const hasNoRide = Boolean(event.plan_override?.transportation_plan && Array.isArray(event.plan_override.transportation_plan.legs) && event.plan_override.transportation_plan.legs.length === 0)
  const departureTime = useMemo(() => {
    if (event.all_day || hasNoRide) return null
    if (enr?.departure_time) return new Date(enr.departure_time)
    if (enr?.drive_time_mins && event.start_time && !isHosted) {
      return new Date(new Date(event.start_time).getTime() - (enr.drive_time_mins + 5) * 60_000)
    }
    return null
  }, [enr?.departure_time, enr?.drive_time_mins, event.start_time, isHosted, event.all_day, hasNoRide])
  const durationMins = differenceInMinutes(end, start)
  const durationStr = formatCompactDuration(durationMins)

  if (past) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 0.45, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.15 }}
        onClick={(e) => { e.stopPropagation(); onClick() }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return
          e.preventDefault()
          onClick()
        }}
        role="button"
        tabIndex={0}
        className={cn(
          'relative rounded-xl border bg-casa-surface/60 shadow-2xs cursor-pointer touch-pan-y overflow-hidden transition-all duration-200 px-3 py-2 flex items-center justify-between gap-2 min-h-[40px]',
          'border-l-4',
          isHighlighted ? 'border-2 border-casa-gold shadow-md opacity-100 font-bold' : 'border-casa-border/60 hover:opacity-85 hover:border-casa-gold/60 opacity-45'
        )}
        style={{ borderLeftColor: color }}
        data-calendar-event
        data-sidecar-loadable="true"
        data-event-id={event.id}
      >
        {/* Left: Time + Divider + Title */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="font-mono text-caption font-bold text-casa-navy tabular-nums shrink-0">
            {isAllDayEvent
              ? (isMultiDay ? `${format(start, 'MMM d')} – ${format(end, 'MMM d')}` : 'ALL DAY')
              : format(start, 'h:mm a')}
          </span>
          <span className="text-casa-divider shrink-0">•</span>
          <EventProvenanceBadge sourceType={event.source_type} isHeroState={isHeroState} />
          <span className="text-caption sm:text-body-sm font-semibold text-casa-navy truncate">
            {isBirthday && <span className="mr-1" aria-hidden="true">🎂</span>}
            {cleanTitle}
          </span>
        </div>

        {/* Right: Driver/Supervisor Pill (if any) + Attendee Manifest Stack + Sync dot */}
        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          {responsibility.responsible && (
            <MemberJewelPill
              member={responsibility.responsible}
              role={responsibility.roleBadge === 'drive' ? 'driver' : 'supervise'}
              size="sm"
            />
          )}

          {responsibility.attendees.length > 0 && (
            <PersonAvatarStack
              people={responsibility.attendees.map((m) => ({
                id: m.id,
                name: m.family_member?.name ?? '?',
                color: m.family_member?.color_hex ?? SHARED_COLOR,
              }))}
              max={2}
              size="sm"
              showNames
            />
          )}
          <EventSyncStatusDot event={event} size="xs" />
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: past && !isHighlighted ? 0.45 : 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      whileTap={{ scale: 0.97, opacity: 0.75 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        onClick()
      }}
      role="button"
      tabIndex={0}
      className={cn(
        'relative rounded-widget border cursor-pointer touch-pan-x touch-pan-y shadow-card overflow-hidden transition-[box-shadow,border-color,opacity] duration-150 min-h-control',
        'grid grid-cols-[5.75rem_1fr]',
        isHighlighted
          ? 'border-2 border-casa-gold shadow-md'
          : isHeroState
            ? 'bg-casa-navy text-white border-casa-navy shadow-card-hover'
            : isBirthday
              ? 'bg-gradient-to-br from-casa-accent-subtle via-casa-surface to-casa-bg border-casa-border/80 hover:shadow-card-hover hover:border-casa-gold/50'
              : 'bg-casa-surface text-casa-navy border-casa-border/70 hover:shadow-card-hover hover:border-casa-gold/50'
      )}
      data-calendar-event
      data-sidecar-loadable="true"
      data-event-id={event.id}
    >
      {isBirthday && <BirthdayCardDecoration />}

      {/* ── Straight Left Pillar: Architectural Time Anchor ── */}
      <div
        className={cn(
          'p-2.5 flex flex-col justify-between items-start border-r relative border-l-4 min-w-0 overflow-hidden',
          isHeroState
            ? 'bg-white/5 border-r-white/15 text-white'
            : 'bg-casa-bg/80 border-r-casa-divider text-casa-navy'
        )}
        style={{ borderLeftColor: color }}
      >
        <div className="w-full min-w-0">
          <div
            className={cn(
              'font-mono text-body font-bold tabular-nums leading-none',
              isHeroState ? 'text-casa-gold' : 'text-casa-navy'
            )}
          >
            {isAllDayEvent
              ? (isMultiDay ? `${format(start, 'MMM d')} – ${format(end, 'MMM d')}` : 'ALL DAY')
              : format(start, 'h:mm')}
          </div>
          {!isAllDayEvent && (
            <div
              className={cn(
                'font-mono text-caption uppercase font-semibold mt-1 leading-tight flex flex-wrap items-baseline gap-x-1',
                isHeroState ? 'text-white/70' : 'text-casa-muted'
              )}
            >
              <span>{format(start, 'a')}</span>
              {durationStr && <span>· {durationStr}</span>}
            </div>
          )}
        </div>

        {/* Pillar bottom indicators: Weather / Alert (Pure SVG) */}
        <div className="w-full pt-1 flex items-center justify-between min-w-0">
          {event.location_name ? (
            <WeatherIcon condition={event.enrichment?.weather_at_event} size={12} />
          ) : (
            <span />
          )}
          {urgentAction && <AlertTriangle size={11} className="text-amber-400 shrink-0 ml-auto" />}
        </div>
      </div>

      {/* ── Right Content Deck ── */}
      <div
        className={cn(
          'p-3 flex flex-col justify-between gap-2 min-w-0',
          isHeroState ? 'bg-casa-navy' : 'bg-casa-surface'
        )}
      >
        <div className="space-y-1 min-w-0">
          {/* Title, Provenance & Sync Status */}
          <div className="flex items-center justify-between gap-1.5 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap min-w-0 flex-1">
              <EventProvenanceBadge sourceType={event.source_type} isHeroState={isHeroState} />
              <p
                className={cn(
                  'stacked-event-title font-bold text-body leading-snug line-clamp-2',
                  isHeroState ? 'text-white' : 'text-casa-navy'
                )}
              >
                {cleanTitle}
              </p>
            </div>
            <EventSyncStatusDot event={event} size="xs" className="shrink-0" />
          </div>

          {/* Location / Mode / Leave by */}
          {(event.location_name || isHosted) && (
            <div
              className={cn(
                'flex items-center gap-1.5 text-caption min-w-0 flex-wrap',
                isHeroState ? 'text-white/70' : 'text-casa-muted'
              )}
            >
              {isHosted ? (
                <span className="text-caption font-semibold uppercase tracking-wide">At home</span>
              ) : (
                <>
                  <span className="flex items-center gap-1 truncate text-caption">
                    <MapPin size={10} className="shrink-0 text-casa-gold" />
                    <span className="truncate">{event.location_name}</span>
                  </span>
                  {departureTime && !happening && (
                    <span className={cn(
                      'inline-flex items-center gap-1 font-semibold text-caption shrink-0',
                      isHeroState ? 'text-casa-gold' : 'text-casa-gold'
                    )}>
                      <span className="opacity-40">•</span>
                      <Navigation size={10} className="shrink-0" />
                      <span>Leave by {format(departureTime, 'h:mm a')}</span>
                    </span>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer: Driver / Supervisor Capsule + Attendee Manifest Stack */}
        {(responsibility.responsible || responsibility.attendees.length > 0) && (
          <div
            className={cn(
              'pt-1.5 border-t flex items-center justify-between gap-1.5 min-w-0',
              isHeroState ? 'border-white/15' : 'border-casa-divider'
            )}
          >
            {responsibility.responsible ? (
              <MemberJewelPill
                member={responsibility.responsible}
                role={responsibility.roleBadge === 'drive' ? 'driver' : 'supervise'}
                size="sm"
                className={isHeroState ? '!bg-white/10 !border-white/20 !text-white [&_span]:!text-white' : ''}
              />
            ) : (
              <span />
            )}

            {responsibility.attendees.length > 0 && (
              <div className="ml-auto shrink-0">
                <PersonAvatarStack
                  people={responsibility.attendees.map((m) => ({
                    id: m.id,
                    name: m.family_member?.name ?? '?',
                    color: m.family_member?.color_hex ?? SHARED_COLOR,
                  }))}
                  max={2}
                  size="sm"
                  showNames
                  className={isHeroState ? '[&_div]:!bg-white/10 [&_div]:!border-white/20 [&_span]:!text-white' : ''}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  )
}
