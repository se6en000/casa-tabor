import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { useWeekConflicts, useResolveConflict, useSnoozeConflict } from '../../hooks/useConflicts'
import { useCalendarStore } from '../../stores/calendarStore'
import { cn } from '../../utils/cn'
import type { Conflict } from '../../types'

const TYPE_CONFIG: Record<string, { label: string; emoji: string; borderBg: string; badge: string }> = {
  drive_time:    { label: 'Needs a Ride',   emoji: '🚗', borderBg: 'border-red-200 bg-red-50',    badge: 'bg-red-100 text-red-700' },
  double_book:   { label: 'Double Booked',  emoji: '⚡', borderBg: 'border-amber-200 bg-amber-50', badge: 'bg-amber-100 text-amber-700' },
  overlap:       { label: 'Time Overlap',   emoji: '⏱',  borderBg: 'border-amber-200 bg-amber-50', badge: 'bg-amber-100 text-amber-700' },
  gear_conflict: { label: 'Gear Conflict',  emoji: '🎒', borderBg: 'border-blue-100 bg-blue-50',   badge: 'bg-blue-100 text-blue-700' },
}
const DEFAULT_CONFIG = { label: 'Conflict', emoji: '⚠️', borderBg: 'border-amber-200 bg-amber-50', badge: 'bg-amber-100 text-amber-700' }

function shortTitle(raw: string): string {
  const stripped = raw.includes(' | ') ? raw.split(' | ').slice(1).join(' | ') : raw
  return stripped.length > 28 ? stripped.slice(0, 26) + '…' : stripped
}

function ConflictGroup({
  type, conflicts, onDismiss, onDismissAll, onSnooze,
}: {
  type: string
  conflicts: Conflict[]
  onDismiss: (id: string) => void
  onDismissAll: (ids: string[]) => void
  onSnooze: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const cfg = TYPE_CONFIG[type] ?? DEFAULT_CONFIG

  return (
    <div className={cn('rounded-card border overflow-hidden', cfg.borderBg)}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:brightness-95 transition-all"
      >
        <span className="text-base leading-none select-none">{cfg.emoji}</span>
        <span className="flex-1 font-semibold text-body-sm text-casa-navy">{cfg.label}</span>
        <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded-full', cfg.badge)}>
          {conflicts.length}
        </span>
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); onDismissAll(conflicts.map((c) => c.id)) }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onDismissAll(conflicts.map((c) => c.id)) } }}
          className="text-[11px] text-casa-muted hover:text-casa-navy underline hover:no-underline ml-1 cursor-pointer"
        >
          Dismiss all
        </span>
        <span className="text-casa-muted ml-1">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-current/10 divide-y divide-current/10">
              {conflicts.map((c) => (
                <ConflictRow key={c.id} conflict={c} type={type} onDismiss={onDismiss} onSnooze={onSnooze} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ConflictRow({ conflict, type, onDismiss, onSnooze }: {
  conflict: Conflict
  type: string
  onDismiss: (id: string) => void
  onSnooze: (id: string) => void
}) {
  const navigate = useNavigate()
  const { setSelectedDate } = useCalendarStore()
  const desc = conflict.description

  const eventDate = conflict.event_a?.start_time ? parseISO(conflict.event_a.start_time) : null
  const dateLabel = eventDate ? format(eventDate, 'EEE MMM d · h:mm a') : null

  function handleNavigate(e: React.MouseEvent) {
    e.stopPropagation()
    if (eventDate) setSelectedDate(eventDate)
    navigate('/calendar')
  }

  let person = ''
  let detail: React.ReactNode

  if (type === 'double_book' || type === 'overlap') {
    const match = desc.match(/^(.+?) is double-booked: "(.+?)" overlaps with "(.+?)"/)
    if (match) {
      person = match[1]
      detail = (
        <span className="flex items-center gap-1 flex-wrap">
          <span className="px-1.5 py-0.5 bg-white/60 rounded border border-current/10 text-[11px] font-medium">{shortTitle(match[2])}</span>
          <span className="text-[10px] text-casa-muted">↔</span>
          <span className="px-1.5 py-0.5 bg-white/60 rounded border border-current/10 text-[11px] font-medium">{shortTitle(match[3])}</span>
        </span>
      )
    }
  } else if (type === 'drive_time') {
    const match = desc.match(/^(.+?) needs a ride to "(.+?)"/)
    if (match) {
      person = match[1]
      detail = (
        <span className="px-1.5 py-0.5 bg-white/60 rounded border border-current/10 text-[11px] font-medium">
          {shortTitle(match[2])}
        </span>
      )
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleNavigate}
      onKeyDown={e => { if (e.key === 'Enter') handleNavigate(e as unknown as React.MouseEvent) }}
      className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-black/5 transition-colors group cursor-pointer"
      title="View in calendar"
    >
      <span className="shrink-0 w-6 h-6 rounded-full bg-white/70 border border-current/15 flex items-center justify-center text-[11px] font-bold text-casa-navy">
        {person ? person.charAt(0) : '?'}
      </span>

      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          {person && <span className="text-[11px] font-semibold text-casa-navy">{person}</span>}
          {detail ?? <span className="text-[11px] text-casa-muted truncate">{desc}</span>}
        </div>
        {dateLabel && (
          <div className="text-[10px] text-casa-muted font-medium">{dateLabel}</div>
        )}
      </div>

      <ExternalLink size={12} className="shrink-0 text-casa-muted opacity-0 group-hover:opacity-60 transition-opacity" />

      <div className="shrink-0 flex items-center gap-1" onClick={e => e.stopPropagation()}>
        <button
          onClick={() => onSnooze(conflict.id)}
          className="text-[11px] font-medium px-2 py-1 rounded-md text-casa-muted hover:text-casa-navy hover:bg-white/60 transition-colors"
          title="Snooze until tomorrow"
        >
          Snooze
        </button>
        <span className="text-casa-border text-xs">|</span>
        <button
          onClick={() => onDismiss(conflict.id)}
          className="text-[11px] font-medium px-2 py-1 rounded-md text-casa-muted hover:text-red-600 hover:bg-white/60 transition-colors"
          title="Dismiss permanently"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}

export default function ConflictAlertsSection({ className }: { className?: string }) {
  const { data: conflicts } = useWeekConflicts()
  const resolve = useResolveConflict()
  const snooze = useSnoozeConflict()

  if (!conflicts || conflicts.length === 0) return null

  const groups = conflicts.reduce<Record<string, Conflict[]>>((acc, c) => {
    ;(acc[c.conflict_type] ??= []).push(c)
    return acc
  }, {})

  const sortedTypes = Object.keys(groups).sort((a, b) => {
    const sA = a === 'drive_time' ? 3 : a === 'double_book' ? 2 : 1
    const sB = b === 'drive_time' ? 3 : b === 'double_book' ? 2 : 1
    return sB - sA
  })

  async function handleDismiss(id: string) { await resolve(id, 'dismissed') }
  async function handleDismissAll(ids: string[]) { await Promise.all(ids.map((id) => resolve(id, 'dismissed'))) }
  async function handleSnooze(id: string) { await snooze(id) }

  return (
    <div className={cn('space-y-2', className)}>
      {sortedTypes.map((type) => (
        <ConflictGroup
          key={type}
          type={type}
          conflicts={groups[type]}
          onDismiss={handleDismiss}
          onDismissAll={handleDismissAll}
          onSnooze={handleSnooze}
        />
      ))}
    </div>
  )
}
