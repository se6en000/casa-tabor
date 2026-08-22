import { useMemo, useRef } from 'react'
import { motion } from 'framer-motion'
import { Repeat, Navigation, MapPin } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '../../utils/cn'
import { cleanEventTitle, formatGlanceTitle } from '../../utils/eventTitle'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'

import { EventSyncStatusDot } from './EventSyncStatusDot'

const HOUR_HEIGHT = 60 // px per hour
const GRID_START_HOUR = 6 // 6 AM

// When all 5 members are on an event, use gold (shared family)
const SHARED_COLOR = 'var(--color-casa-gold)'

interface EventBlockProps {
  event: EventWithDetails
  onClick: () => void
  onDoubleClick?: () => void
  columnCount?: number
  columnIndex?: number
  isActive?: boolean
  /** Called after a 450ms touch hold — WeekView takes over the drag from here */
  onDragStart?: (event: EventWithDetails, clientX: number, clientY: number, grabOffsetPx: number) => void
  /** Dims the block while its ghost is being dragged */
  isDragging?: boolean
}

function getPrimaryColor(event: EventWithDetails): string {
  if (!event.members || event.members.length === 0) return SHARED_COLOR
  if (event.members.length >= 5) return SHARED_COLOR
  // Prefer the member with role 'primary'
  const primary = event.members.find(m => m.role === 'primary') ?? event.members[0]
  return primary.family_member?.color_hex || SHARED_COLOR
}

function getEventPosition(event: EventWithDetails) {
  const start = new Date(event.start_time)
  const end = new Date(event.end_time)
  const startHour = start.getHours() + start.getMinutes() / 60
  const endHour = end.getHours() + end.getMinutes() / 60
  const duration = Math.max(endHour - startHour, 0.25)

  const top = (startHour - GRID_START_HOUR) * HOUR_HEIGHT
  const height = Math.max(duration * HOUR_HEIGHT, 42) // min height 42px for full glanceability

  return { top, height }
}

export default function EventBlock({ event, onClick, onDoubleClick, columnCount = 1, columnIndex = 0, isActive = false, onDragStart, isDragging }: EventBlockProps) {
  const { top, height } = getEventPosition(event)
  const color = getPrimaryColor(event)
  const start = new Date(event.start_time)
  const end = new Date(event.end_time)

  const widthPercent = 95 / columnCount
  const leftPercent = 2.5 + columnIndex * widthPercent

  const isCompact = height < 56

  const hasNoRide = Boolean(event.plan_override?.transportation_plan && Array.isArray(event.plan_override.transportation_plan.legs) && event.plan_override.transportation_plan.legs.length === 0)
  const departureAt = useMemo(() => {
    if (event.all_day || hasNoRide) return null
    if (event.enrichment?.departure_time) return new Date(event.enrichment.departure_time)
    if (event.enrichment?.drive_time_mins && event.start_time) {
      return new Date(new Date(event.start_time).getTime() - (event.enrichment.drive_time_mins + 5) * 60_000)
    }
    return null
  }, [event.enrichment?.departure_time, event.enrichment?.drive_time_mins, event.start_time, event.all_day, hasNoRide])

  const primaryMember = event.members && event.members.length > 0
    ? (event.members.find(m => m.role === 'primary') ?? event.members[0])?.family_member
    : null
  const otherMembersCount = (event.members?.length ?? 0) > 1 ? (event.members!.length - 1) : 0

  // ── Long-press drag detection ────────────────────────────────
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchOrigin = useRef<{ x: number; y: number } | null>(null)

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!onDragStart) return
    const touch = e.touches[0]
    touchOrigin.current = { x: touch.clientX, y: touch.clientY }
    const elRect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const grabOffsetPx = touch.clientY - elRect.top

    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null
      touchOrigin.current = null
      onDragStart(event, touch.clientX, touch.clientY, grabOffsetPx)
      // Haptic pulse if supported
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(40)
    }, 450)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!longPressTimer.current || !touchOrigin.current) return
    const t = e.touches[0]
    const dist = Math.hypot(t.clientX - touchOrigin.current.x, t.clientY - touchOrigin.current.y)
    if (dist > 10) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
      touchOrigin.current = null
    }
  }

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    touchOrigin.current = null
  }

  const timePrefix = format(start, 'h:mmaaa').toLowerCase().replace(':00', '')

  return (
    <motion.button
      data-event-block
      data-calendar-event
      data-sidecar-loadable="true"
      data-event-id={event.id}
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      whileTap={{ scale: 0.97, opacity: 0.75 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick?.() }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={cn(
        'absolute rounded-lg px-2 py-1 text-left flex flex-col justify-between',
        'hover:brightness-110 hover:shadow-card-hover',
        'overflow-hidden cursor-pointer',
        'text-white transition-all duration-150 shadow-2xs',
        isActive ? 'ring-2 ring-casa-gold ring-offset-1 ring-offset-casa-bg z-20 font-bold shadow-md' : 'border-0',
        isDragging ? 'opacity-30' : 'opacity-100',
      )}
      style={{
        top: `${top}px`,
        height: `${height}px`,
        left: `${leftPercent}%`,
        width: `${widthPercent}%`,
        backgroundColor: color,
        ...(isActive ? { zIndex: 20 } : {}),
      }}
      title={`${cleanEventTitle(event.title)} (${format(start, 'h:mm a')} – ${format(end, 'h:mm a')})`}
    >
      <div className="min-w-0 w-full">
        {/* Title line with start time prefix */}
        <div className="flex items-baseline gap-1.5 min-w-0 pr-3.5">
          <span className="font-mono text-caption font-bold opacity-90 shrink-0 tabular-nums leading-none">
            {timePrefix}
          </span>
          <p className={cn(
            'font-body font-semibold truncate leading-tight',
            isCompact ? 'text-caption' : 'text-body-sm',
            isActive && 'font-bold text-white'
          )}>
            {formatGlanceTitle(event.title)}
          </p>
        </div>

        {/* Departure line */}
        {departureAt && (
          <p className="text-caption font-mono font-bold text-amber-200 truncate flex items-center gap-1 mt-0.5">
            <Navigation size={9} className="shrink-0 text-amber-300" />
            <span>Leave {format(departureAt, 'h:mm a')}</span>
          </p>
        )}

        {/* Time range when not compact and no departure */}
        {!departureAt && !isCompact && (
          <p className="text-caption font-body opacity-80 mt-0.5">
            {format(start, 'h:mm a')} – {format(end, 'h:mm a')}
          </p>
        )}
      </div>

      {/* Footer metadata: Member Badge & Location */}
      {(primaryMember || event.location_name) && (
        <div className="flex items-center gap-1.5 mt-0.5 text-caption font-semibold text-white/90 truncate pr-2 shrink-0">
          {primaryMember && (
            <span className="inline-flex items-center gap-1 truncate">
              <span className="w-3.5 h-3.5 rounded-full bg-white/25 text-overline font-bold inline-flex items-center justify-center uppercase shrink-0">
                {primaryMember.name.charAt(0)}
              </span>
              <span className="truncate">{primaryMember.name}{otherMembersCount > 0 ? ` +${otherMembersCount}` : ''}</span>
            </span>
          )}
          {event.location_name && !isCompact && (
            <span className="inline-flex items-center gap-0.5 opacity-75 truncate text-caption">
              <MapPin size={9} className="shrink-0" />
              <span className="truncate">{event.location_name}</span>
            </span>
          )}
        </div>
      )}

      {/* Google Sync Status dot — top right corner */}
      <EventSyncStatusDot
        event={event}
        size="xs"
        className="absolute right-1.5 top-1.5 z-10"
      />
      {/* Repeat indicator for recurring instances */}
      {(event as any).recurrence_master_id && (
        <span className="absolute bottom-1 right-1 opacity-60">
          <Repeat size={9} className="text-white" />
        </span>
      )}
    </motion.button>
  )
}