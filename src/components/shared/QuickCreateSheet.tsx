import { useState, useEffect, useRef } from 'react'
import { Plus } from 'lucide-react'
import { addHours, addDays, startOfDay, isToday, isTomorrow, format } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Field, Input, Sheet } from '../ui'

interface Props {
  open: boolean
  onClose: () => void
  /** The date/time of the tapped slot */
  initialStart?: Date
}

function toLocalDT(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function parseLocalDT(value: string): Date {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

/** Snap a date to the nearest 5-minute mark (also zeroes seconds/ms). */
function snapTo5(d: Date): Date {
  const step = 5 * 60 * 1000
  return new Date(Math.round(d.getTime() / step) * step)
}

type WheelParts = { dayTs: number; hour12: number; minute: number; ampm: 'AM' | 'PM' }

function getWheelParts(value: string): WheelParts {
  const d = parseLocalDT(value)
  const h24 = d.getHours()
  return {
    dayTs: startOfDay(d).getTime(),
    hour12: ((h24 + 11) % 12) + 1,
    minute: (Math.round(d.getMinutes() / 5) * 5) % 60,
    ampm: h24 >= 12 ? 'PM' : 'AM',
  }
}

function combineWheel(p: WheelParts): Date {
  const base = new Date(p.dayTs)
  const h24 = (p.hour12 % 12) + (p.ampm === 'PM' ? 12 : 0)
  base.setHours(h24, p.minute, 0, 0)
  return base
}

function dayLabel(d: Date): string {
  if (isToday(d)) return 'Today'
  if (isTomorrow(d)) return 'Tomorrow'
  return format(d, 'EEE, MMM d')
}

function buildDayItems(anchorTs: number): { value: number; label: string }[] {
  const items: { value: number; label: string }[] = []
  for (let i = 0; i < 400; i++) {
    const d = addDays(new Date(anchorTs), i)
    items.push({ value: startOfDay(d).getTime(), label: dayLabel(d) })
  }
  return items
}

const HOUR_ITEMS = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: String(i + 1) }))
const MINUTE_ITEMS = Array.from({ length: 12 }, (_, i) => ({ value: i * 5, label: String(i * 5).padStart(2, '0') }))
const AMPM_ITEMS: { value: string; label: string }[] = [
  { value: 'AM', label: 'AM' },
  { value: 'PM', label: 'PM' },
]

const ITEM_H = 46
const VISIBLE = 5
const PAD = ((VISIBLE - 1) / 2) * ITEM_H

/** A single iOS-style drum column with snap scrolling + haptics. */
function WheelColumn({
  items,
  value,
  onChange,
  flex = 1,
  emphasize = false,
}: {
  items: { value: number | string; label: string }[]
  value: number | string
  onChange: (v: number | string) => void
  flex?: number
  emphasize?: boolean
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const settleTimer = useRef<number | undefined>(undefined)
  const userScrolling = useRef(false)
  const selectedIndex = Math.max(0, items.findIndex(i => i.value === value))

  // Keep the drum aligned with external value changes (e.g. start bumps end),
  // but never fight the user while they are actively flicking.
  useEffect(() => {
    if (userScrolling.current) return
    const el = scrollRef.current
    if (!el) return
    const target = selectedIndex * ITEM_H
    if (Math.abs(el.scrollTop - target) > 1) el.scrollTop = target
  }, [selectedIndex])

  const handleScroll = () => {
    userScrolling.current = true
    if (settleTimer.current) window.clearTimeout(settleTimer.current)
    settleTimer.current = window.setTimeout(() => {
      userScrolling.current = false
      const el = scrollRef.current
      if (!el) return
      const idx = clamp(Math.round(el.scrollTop / ITEM_H), 0, items.length - 1)
      const picked = items[idx]
      if (picked && picked.value !== value) {
        navigator.vibrate?.(6)
        onChange(picked.value)
      }
    }, 110)
  }

  return (
    <div className="relative overflow-hidden" style={{ flex, height: VISIBLE * ITEM_H }}>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-scroll snap-y snap-mandatory overscroll-contain [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
      >
        <div style={{ height: PAD }} />
        {items.map((it, i) => {
          const dist = Math.abs(i - selectedIndex)
          const opacity = dist === 0 ? 1 : dist === 1 ? 0.5 : dist === 2 ? 0.25 : 0.12
          return (
            <div
              key={String(it.value)}
              className="flex items-center justify-center snap-center select-none whitespace-nowrap"
              style={{
                height: ITEM_H,
                opacity,
                fontWeight: dist === 0 ? 700 : 500,
                fontSize: emphasize ? 21 : 22,
                transform: dist === 0 ? 'scale(1)' : 'scale(0.9)',
                transition: 'opacity 120ms ease, transform 120ms ease',
              }}
            >
              {it.label}
            </div>
          )
        })}
        <div style={{ height: PAD }} />
      </div>

      {/* Center selection band */}
      <div
        className="pointer-events-none absolute inset-x-1 top-1/2 -translate-y-1/2 rounded-lg bg-casa-gold/10 border-y border-casa-gold/40"
        style={{ height: ITEM_H }}
      />
      {/* Top / bottom fade masks */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-casa-bg to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-casa-bg to-transparent" />
    </div>
  )
}

function WheelRow({
  parts,
  onPatch,
  dayItems,
}: {
  parts: WheelParts
  onPatch: (p: Partial<WheelParts>) => void
  dayItems: { value: number; label: string }[]
}) {
  return (
    <div className="relative flex gap-1 rounded-xl border border-casa-border bg-casa-bg px-2 text-casa-navy">
      <WheelColumn flex={2.4} items={dayItems} value={parts.dayTs} onChange={v => onPatch({ dayTs: v as number })} />
      <WheelColumn items={HOUR_ITEMS} value={parts.hour12} onChange={v => onPatch({ hour12: v as number })} />
      <WheelColumn items={MINUTE_ITEMS} value={parts.minute} onChange={v => onPatch({ minute: v as number })} />
      <WheelColumn items={AMPM_ITEMS} value={parts.ampm} onChange={v => onPatch({ ampm: v as 'AM' | 'PM' })} emphasize />
    </div>
  )
}

function durationLabel(startDT: string, endDT: string): string {
  const start = parseLocalDT(startDT)
  const end = parseLocalDT(endDT)
  let mins = Math.round((end.getTime() - start.getTime()) / 60000)
  if (mins <= 0) return 'Ends before it starts'
  const days = Math.floor(mins / 1440)
  mins -= days * 1440
  const hrs = Math.floor(mins / 60)
  const rem = mins % 60
  const parts: string[] = []
  if (days) parts.push(`${days} day${days > 1 ? 's' : ''}`)
  if (hrs) parts.push(`${hrs} hr`)
  if (rem) parts.push(`${rem} min`)
  return parts.length ? parts.join(' ') : '0 min'
}

export default function QuickCreateSheet({ open, onClose, initialStart }: Props) {
  const qc = useQueryClient()
  const [viewportHeight, setViewportHeight] = useState<number | null>(null)
  const sheetRef = useRef<HTMLDivElement>(null)

  const defaultStart = snapTo5(initialStart ?? new Date())
  const defaultEnd = addHours(defaultStart, 1)

  const [title, setTitle] = useState('')
  const [startDT, setStartDT] = useState(toLocalDT(defaultStart))
  const [endDT, setEndDT] = useState(toLocalDT(defaultEnd))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [dayAnchor, setDayAnchor] = useState(() => startOfDay(addDays(defaultStart, -30)).getTime())

  // Re-initialise whenever the sheet opens with a new slot
  useEffect(() => {
    if (!open) return
    const s = snapTo5(initialStart ?? new Date())
    const frame = requestAnimationFrame(() => {
      setTitle('')
      setStartDT(toLocalDT(s))
      setEndDT(toLocalDT(addHours(s, 1)))
      setDayAnchor(startOfDay(addDays(s, -30)).getTime())
      setSaving(false)
      setSaveError('')
    })
    return () => cancelAnimationFrame(frame)
  }, [open, initialStart])

  useEffect(() => {
    if (!open) return
    const clearFieldFocus = () => {
      const active = document.activeElement
      if (!(active instanceof HTMLElement)) return
      if (!sheetRef.current?.contains(active)) return
      if (!active.matches('input, textarea, [contenteditable="true"]')) return
      active.blur()
      sheetRef.current?.focus({ preventScroll: true })
    }
    const raf = requestAnimationFrame(clearFieldFocus)
    const timer = window.setTimeout(clearFieldFocus, 320)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(timer)
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    const vv = window.visualViewport
    const updateViewport = () => {
      if (!vv) return
      setViewportHeight(vv.height)
    }

    if (vv) {
      updateViewport()
      vv.addEventListener('resize', updateViewport)
      vv.addEventListener('scroll', updateViewport)
    }

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target
      if (!(target instanceof HTMLElement)) return
      if (!target.matches('input, textarea, [contenteditable="true"]')) return
      if (window.innerWidth >= 1024) return
      setTimeout(() => {
        target.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }, 120)
    }

    document.addEventListener('focusin', handleFocusIn)
    return () => {
      if (vv) {
        vv.removeEventListener('resize', updateViewport)
        vv.removeEventListener('scroll', updateViewport)
      }
      document.removeEventListener('focusin', handleFocusIn)
      setViewportHeight(null)
    }
  }, [open])

  const dayItems = buildDayItems(dayAnchor)
  const startParts = getWheelParts(startDT)
  const endParts = getWheelParts(endDT)

  // Changing the start shifts the end to preserve the current duration.
  const patchStart = (patch: Partial<WheelParts>) => {
    const prevStart = parseLocalDT(startDT)
    const prevEnd = parseLocalDT(endDT)
    const dur = Math.max(5 * 60 * 1000, prevEnd.getTime() - prevStart.getTime())
    const next = combineWheel({ ...getWheelParts(startDT), ...patch })
    setStartDT(toLocalDT(next))
    setEndDT(toLocalDT(new Date(next.getTime() + dur)))
  }

  const patchEnd = (patch: Partial<WheelParts>) => {
    const next = combineWheel({ ...getWheelParts(endDT), ...patch })
    setEndDT(toLocalDT(next))
  }

  const handleSave = async () => {
    if (!title.trim()) return
    setSaveError('')
    setSaving(true)
    const start = new Date(startDT)
    let end = new Date(endDT)
    if (isNaN(start.getTime()) || isNaN(end.getTime())) { setSaving(false); return }
    if (end.getTime() <= start.getTime()) end = addHours(start, 1)

    const { data: inserted, error } = await supabase.from('events').insert({
      title:      title.trim(),
      start_time: start.toISOString(),
      end_time:   end.toISOString(),
      status:     'confirmed',
      event_type: 'event',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).select('id').single()

    if (error) {
      setSaveError(`Could not create event: ${error.message}`)
      setSaving(false)
      return
    }

    qc.invalidateQueries({ queryKey: ['events'] })
    navigator.vibrate?.(15)
    // Trigger weather fetch for the new event (fire-and-forget)
    if (inserted?.id) {
      supabase.functions.invoke('fetch-event-weather', { body: { event_id: inserted.id } })
        .then(() => qc.invalidateQueries({ queryKey: ['events'] }))
        .catch(() => {})
      // Push new event to Google Calendar so it shows up there too
      supabase.functions.invoke('create-google-event', { body: { event_id: inserted.id } })
        .catch(() => {})
    }
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New Event"
      showHandle
      panelClassName="sm:left-1/2 sm:right-auto sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:rounded-modal"
      panelStyle={{
        bottom: 'max(0px, env(safe-area-inset-bottom))',
        maxHeight: viewportHeight ? `${Math.max(300, viewportHeight - 8)}px` : 'calc(100dvh - 8px)',
      }}
      contentClassName="px-6 py-5"
      transition={{ type: 'spring', damping: 32, stiffness: 260 }}
    >
      <div ref={sheetRef} tabIndex={-1} className="space-y-4">
              <Field label="Event title" required>
                <Input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void handleSave() }}
                  placeholder="What's happening?"
                />
              </Field>

              {/* Start wheel */}
              <div>
                <label className="text-caption font-semibold text-casa-muted uppercase tracking-wide block mb-1.5">
                  Start
                </label>
                <WheelRow parts={startParts} onPatch={patchStart} dayItems={dayItems} />
              </div>

              {/* End wheel */}
              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <label className="text-caption font-semibold text-casa-muted uppercase tracking-wide">
                    End
                  </label>
                  <span className="text-caption text-casa-muted">{durationLabel(startDT, endDT)}</span>
                </div>
                <WheelRow parts={endParts} onPatch={patchEnd} dayItems={dayItems} />
              </div>
              {saveError && <Alert tone="danger" title="Event was not created">{saveError}</Alert>}
              <Button
                fullWidth
                size="lg"
                variant="strong"
                onClick={() => void handleSave()}
                disabled={!title.trim()}
                loading={saving}
                leadingIcon={<Plus size={18} />}
              >
                Create Event
              </Button>
      </div>
    </Sheet>
  )
}
