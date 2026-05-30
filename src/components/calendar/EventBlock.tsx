import { useRef } from 'react'
import { motion } from 'framer-motion'
import { Repeat } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '../../utils/cn'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'

const HOUR_HEIGHT = 60 // px per hour
const GRID_START_HOUR = 6 // 6 AM

// When all 5 members are on an event, use gold (shared family)
const SHARED_COLOR = '#C9A96E'

// Confidence dot colors
const CONFIDENCE_DOT: Record<string, string> = {
  high: '#22c55e',    // green
  medium: '#f59e0b',  // amber
  low: '#ef4444',     // red
}

interface EventBlockProps {
  event: EventWithDetails
  onClick: () => void
  onDoubleClick?: () => void
  columnCount?: number
  columnIndex?: number
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
  const duration = endHour - startHour

  const top = (startHour - GRID_START_HOUR) * HOUR_HEIGHT
  const height = Math.max(duration * HOUR_HEIGHT, 28) // min height 28px

  return { top, height }
}

export default function EventBlock({ event, onClick, onDoubleClick, columnCount = 1, columnIndex = 0, onDragStart, isDragging }: EventBlockProps) {
  const { top, height } = getEventPosition(event)
  const color = getPrimaryColor(event)
  const start = new Date(event.start_time)
  const end = new Date(event.end_time)

  const widthPercent = 95 / columnCount
  const leftPercent = 2.5 + columnIndex * widthPercent

  const isCompact = height < 50
  const confidence = event.enrichment?.confidence
  const confidenceDotColor = confidence ? CONFIDENCE_DOT[confidence] : null

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

  return (
      <motion.button
      data-event-block
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick?.() }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={cn(
        'absolute rounded-lg px-2.5 py-1.5 text-left',
        'hover:brightness-110 hover:shadow-card-hover',
        'overflow-hidden cursor-pointer border-0',
        'text-white transition-opacity',
        isDragging ? 'opacity-30' : 'opacity-100',
      )}
      style={{
        top: `${top}px`,
        height: `${height}px`,
        left: `${leftPercent}%`,
        width: `${widthPercent}%`,
        backgroundColor: color,
      }}
    >
      {/* Title — strip "Owner | " prefix */}
      {(() => {
        const pipeIdx = event.title.indexOf(' | ')
        const cleanTitle = pipeIdx !== -1 ? event.title.slice(pipeIdx + 3) : event.title
        return (
          <p className={cn(
            'font-body font-semibold truncate leading-tight',
            isCompact ? 'text-[11px]' : 'text-body-sm'
          )}>
            {cleanTitle}
          </p>
        )
      })()}

      {/* Time range */}
      {!isCompact && (
        <p className="text-[11px] font-body opacity-80 mt-0.5">
          {format(start, 'h:mm a')} – {format(end, 'h:mm a')}
        </p>
      )}

      {/* Member pills — owner named pill + attendee initial dots */}
      {!isCompact && event.members && event.members.length > 0 && (() => {
        const primary = event.members.find(m => m.role === 'primary') ?? event.members[0]
        const others = event.members.filter(m => m !== primary)
        return (
          <div className="flex items-center gap-1 flex-wrap mt-1">
            <span
              className="px-1.5 py-0.5 rounded-full text-[9px] font-bold leading-none whitespace-nowrap bg-white/90"
              style={{ color: primary.family_member?.color_hex ?? '#444' }}
            >
              {primary.family_member?.name ?? '?'}
            </span>
            {others.slice(0, 3).map(m => (
              <span
                key={m.id}
                title={m.family_member?.name}
                className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold shrink-0 bg-white/80"
                style={{ color: m.family_member?.color_hex ?? '#444' }}
              >
                {m.family_member?.name?.[0] ?? '?'}
              </span>
            ))}
          </div>
        )
      })()}

      {/* Confidence dot — top right corner */}
      {confidenceDotColor && (
        <span
          className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full border border-white/50"
          style={{ backgroundColor: confidenceDotColor }}
          title={`Enrichment confidence: ${confidence}`}
        />
      )}
      {/* Repeat indicator for recurring instances */}
      {(event as any).recurrence_master_id && (
        <span className="absolute bottom-1 right-1 opacity-60">
          <Repeat size={9} className="text-white" />
        </span>
      )}
    </motion.button>
  )
}