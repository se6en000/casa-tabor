import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus } from 'lucide-react'
import { addDays, addMinutes } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import InlineCalendarPicker from './InlineCalendarPicker'

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

const MINUTE_OPTIONS = [0, 15, 30, 45] as const

function snapMinuteToQuarter(minute: number): number {
  let closest: number = MINUTE_OPTIONS[0]
  let distance = Math.abs(minute - closest)
  for (const option of MINUTE_OPTIONS) {
    const nextDistance = Math.abs(minute - option)
    if (nextDistance < distance) {
      closest = option
      distance = nextDistance
    }
  }
  return closest
}

function parseLocalDT(value: string): Date {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

function getPickerParts(value: string) {
  const d = parseLocalDT(value)
  const hour24 = d.getHours()
  return {
    year: d.getFullYear(),
    month: d.getMonth(),
    day: d.getDate(),
    hour12: ((hour24 + 11) % 12) + 1,
    minute: snapMinuteToQuarter(d.getMinutes()),
    ampm: hour24 >= 12 ? 'PM' as const : 'AM' as const,
  }
}

function fromPickerParts(parts: { year: number; month: number; day: number; hour12: number; minute: number; ampm: 'AM' | 'PM' }) {
  const safeDay = Math.min(parts.day, new Date(parts.year, parts.month + 1, 0).getDate())
  const hour24 = (parts.hour12 % 12) + (parts.ampm === 'PM' ? 12 : 0)
  return new Date(parts.year, parts.month, safeDay, hour24, snapMinuteToQuarter(parts.minute), 0, 0)
}

export default function QuickCreateSheet({ open, onClose, initialStart }: Props) {
  const qc = useQueryClient()
  const [viewportHeight, setViewportHeight] = useState<number | null>(null)
  const sheetRef = useRef<HTMLDivElement>(null)

  const defaultStart = initialStart ?? new Date()
  const defaultEnd   = addMinutes(defaultStart, 30)

  const [title,   setTitle]   = useState('')
  const [startDT, setStartDT] = useState(toLocalDT(defaultStart))
  const [endDT,   setEndDT]   = useState(toLocalDT(defaultEnd))
  const [isAllDay, setIsAllDay] = useState(false)
  const [isMultiDay, setIsMultiDay] = useState(false)
  const [saving,  setSaving]  = useState(false)

  // Re-initialise whenever the sheet opens with a new slot
  useEffect(() => {
    if (!open) return
    const s = initialStart ?? new Date()
    setTitle('')
    setStartDT(toLocalDT(s))
    setEndDT(toLocalDT(addMinutes(s, 30)))
    setIsAllDay(false)
    setIsMultiDay(false)
    setSaving(false)
  }, [open, initialStart])

  useEffect(() => {
    if (isMultiDay) return
    const startDate = startDT.slice(0, 10)
    if (!startDate) return
    if (isAllDay) {
      const next = `${startDate}T23:59`
      if (endDT !== next) setEndDT(next)
      return
    }
    const endTime = endDT.slice(11, 16) || '00:00'
    const next = `${startDate}T${endTime}`
    if (endDT !== next) setEndDT(next)
  }, [isAllDay, isMultiDay, startDT, endDT])

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

  const updateStartParts = (patch: Partial<ReturnType<typeof getPickerParts>>) => {
    const parts = { ...getPickerParts(startDT), ...patch }
    const nextStart = fromPickerParts(parts)
    setStartDT(toLocalDT(nextStart))
    setEndDT(toLocalDT(addMinutes(nextStart, 30)))
  }

  const applyStartQuickOffset = (days: number) => {
    const base = parseLocalDT(startDT)
    const next = addDays(base, days)
    setStartDT(toLocalDT(next))
    setEndDT(toLocalDT(addMinutes(next, 30)))
  }

  const applyNow = () => {
    const now = new Date()
    now.setMinutes(snapMinuteToQuarter(now.getMinutes()), 0, 0)
    setStartDT(toLocalDT(now))
    setEndDT(toLocalDT(addMinutes(now, 30)))
  }

  const applyDuration = (minutes: number) => {
    const start = parseLocalDT(startDT)
    setEndDT(toLocalDT(addMinutes(start, minutes)))
  }

  const updateEndParts = (patch: Partial<ReturnType<typeof getPickerParts>>) => {
    const parts = { ...getPickerParts(endDT), ...patch }
    const nextEnd = fromPickerParts(parts)
    setEndDT(toLocalDT(nextEnd))
  }

  const handleSave = async () => {
    if (!title.trim()) return
    setSaving(true)
    const effectiveStart = isAllDay ? `${startDT.slice(0, 10)}T00:00` : startDT
    const effectiveEnd = isAllDay ? `${endDT.slice(0, 10)}T23:59` : endDT
    const start = new Date(effectiveStart)
    const end   = new Date(effectiveEnd)
    if (isNaN(start.getTime()) || isNaN(end.getTime())) { setSaving(false); return }
    if (end < start) { setSaving(false); alert('End must be after start.'); return }

    const { data: inserted, error } = await supabase.from('events').insert({
      title:      title.trim(),
      start_time: start.toISOString(),
      end_time:   end.toISOString(),
      all_day:    isAllDay,
      status:     'confirmed',
      event_type: 'event',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).select('id').single()

    if (error) {
      alert(`Could not create event: ${error.message}`)
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
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="qc-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black z-[60]"
            onClick={onClose}
          />

          <motion.div
            key="qc-sheet"
            ref={sheetRef}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 260 }}
            className="fixed left-0 right-0 z-[70] bg-casa-surface rounded-t-2xl shadow-modal sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-lg sm:rounded-2xl overflow-y-auto"
            tabIndex={-1}
            style={{
              bottom: 'max(0px, env(safe-area-inset-bottom))',
              maxHeight: viewportHeight
                ? `${Math.max(300, viewportHeight - 8)}px`
                : 'calc(100dvh - 8px)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-casa-border" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-casa-border">
              <h3 className="font-display text-display-sm text-casa-navy">New Event</h3>
              <button onClick={onClose} className="p-1 rounded-full hover:bg-casa-bg transition-colors">
                <X size={20} className="text-casa-muted" />
              </button>
            </div>

            {/* Form */}
            <div className="px-6 py-5 space-y-4">
              {/* Title */}
              <div>
                <label className="text-caption font-semibold text-casa-muted uppercase tracking-wide block mb-1.5">
                  Event Title
                </label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
                  placeholder="What's happening?"
                  className="w-full px-4 py-2.5 rounded-xl border border-casa-border bg-casa-bg text-body text-casa-navy placeholder:text-casa-muted focus:outline-none focus:ring-2 focus:ring-casa-gold/40"
                />
              </div>

              {/* Quick time actions */}
              <div className="space-y-2">
                <p className="text-caption font-semibold text-casa-muted uppercase tracking-wide">Quick picks</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={applyNow} className="px-3 py-1.5 rounded-full border border-casa-border bg-casa-bg text-caption font-semibold text-casa-text hover:border-casa-gold">Now</button>
                  <button type="button" onClick={() => applyStartQuickOffset(0)} className="px-3 py-1.5 rounded-full border border-casa-border bg-casa-bg text-caption font-semibold text-casa-text hover:border-casa-gold">Today</button>
                  <button type="button" onClick={() => applyStartQuickOffset(1)} className="px-3 py-1.5 rounded-full border border-casa-border bg-casa-bg text-caption font-semibold text-casa-text hover:border-casa-gold">Tomorrow</button>
                  <button type="button" onClick={() => applyDuration(30)} className="px-3 py-1.5 rounded-full border border-casa-border bg-casa-bg text-caption font-semibold text-casa-text hover:border-casa-gold">30m</button>
                  <button type="button" onClick={() => applyDuration(60)} className="px-3 py-1.5 rounded-full border border-casa-border bg-casa-bg text-caption font-semibold text-casa-text hover:border-casa-gold">1h</button>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsAllDay(v => !v)
                    if (!isAllDay) {
                      setStartDT(`${startDT.slice(0, 10)}T00:00`)
                      setEndDT(`${endDT.slice(0, 10)}T23:59`)
                    }
                  }}
                  className={`px-3 py-1.5 rounded-full border text-caption font-semibold transition-colors ${isAllDay ? 'border-casa-gold bg-casa-gold/15 text-casa-navy' : 'border-casa-border bg-casa-bg text-casa-text hover:border-casa-gold'}`}
                >
                  All day
                </button>
                <button
                  type="button"
                  onClick={() => setIsMultiDay(v => !v)}
                  className={`px-3 py-1.5 rounded-full border text-caption font-semibold transition-colors ${isMultiDay ? 'border-casa-gold bg-casa-gold/15 text-casa-navy' : 'border-casa-border bg-casa-bg text-casa-text hover:border-casa-gold'}`}
                >
                  Multi-day
                </button>
              </div>

              {/* Mobile native picker */}
              <div className="sm:hidden grid grid-cols-1 gap-3">
                <div>
                  <label className="text-caption font-semibold text-casa-muted uppercase tracking-wide block mb-1.5">Start</label>
                  {isAllDay ? (
                    <input
                      type="date"
                      value={startDT.slice(0, 10)}
                      onChange={e => setStartDT(`${e.target.value}T00:00`)}
                      className="w-full h-11 rounded-xl border border-casa-border bg-casa-bg px-3 text-body-sm text-casa-navy focus:outline-none focus:ring-2 focus:ring-casa-gold/40"
                    />
                  ) : (
                    <input
                      type="datetime-local"
                      step={900}
                      value={startDT}
                      onChange={e => {
                        const nextStart = parseLocalDT(e.target.value)
                        setStartDT(toLocalDT(nextStart))
                        setEndDT(toLocalDT(addMinutes(nextStart, 30)))
                      }}
                      className="w-full h-11 rounded-xl border border-casa-border bg-casa-bg px-3 text-body-sm text-casa-navy focus:outline-none focus:ring-2 focus:ring-casa-gold/40"
                    />
                  )}
                </div>
                <div>
                  <label className="text-caption font-semibold text-casa-muted uppercase tracking-wide block mb-1.5">End</label>
                  {isAllDay ? (
                    <input
                      type="date"
                      value={endDT.slice(0, 10)}
                      onChange={e => setEndDT(`${e.target.value}T23:59`)}
                      disabled={!isMultiDay}
                      className="w-full h-11 rounded-xl border border-casa-border bg-casa-bg px-3 text-body-sm text-casa-navy disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-casa-gold/40"
                    />
                  ) : (
                    <input
                      type="datetime-local"
                      step={900}
                      value={endDT}
                      onChange={e => setEndDT(e.target.value)}
                      className="w-full h-11 rounded-xl border border-casa-border bg-casa-bg px-3 text-body-sm text-casa-navy focus:outline-none focus:ring-2 focus:ring-casa-gold/40"
                    />
                  )}
                </div>
              </div>

              {/* Desktop precision picker */}
              <div className="hidden sm:grid grid-cols-2 gap-3">
                <div>
                  <label className="text-caption font-semibold text-casa-muted uppercase tracking-wide block mb-1.5">
                    Start
                  </label>
                  {(() => {
                    const p = getPickerParts(startDT)
                    return (
                      <div className="rounded-xl border border-casa-border bg-casa-bg p-2 space-y-2">
                        <InlineCalendarPicker
                          value={startDT.slice(0, 10)}
                          onChange={(nextDate) => {
                            const nextStart = parseLocalDT(`${nextDate}T${isAllDay ? '00:00' : (startDT.slice(11, 16) || '00:00')}`)
                            setStartDT(toLocalDT(nextStart))
                            if (isAllDay) {
                              setEndDT(`${nextDate}T23:59`)
                            } else {
                              setEndDT(toLocalDT(addMinutes(nextStart, 30)))
                            }
                          }}
                        />
                        <p className="text-caption text-casa-muted">
                          Selected: {parseLocalDT(startDT).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                        </p>
                        {!isAllDay && (
                        <div className="grid grid-cols-3 gap-1.5">
                          <select
                            data-vk-nav="true"
                            value={p.hour12}
                            onChange={e => updateStartParts({ hour12: Number(e.target.value) })}
                            className="h-10 rounded-lg border border-casa-border bg-casa-surface px-2 text-body-sm text-casa-navy focus:outline-none focus:ring-2 focus:ring-casa-gold/40"
                          >
                            {Array.from({ length: 12 }, (_, i) => i + 1).map(hour => <option key={hour} value={hour}>{hour}</option>)}
                          </select>
                          <select
                            data-vk-nav="true"
                            value={p.minute}
                            onChange={e => updateStartParts({ minute: Number(e.target.value) })}
                            className="h-10 rounded-lg border border-casa-border bg-casa-surface px-2 text-body-sm text-casa-navy focus:outline-none focus:ring-2 focus:ring-casa-gold/40"
                          >
                            {MINUTE_OPTIONS.map(min => <option key={min} value={min}>{String(min).padStart(2, '0')}</option>)}
                          </select>
                          <select
                            data-vk-nav="true"
                            value={p.ampm}
                            onChange={e => updateStartParts({ ampm: e.target.value as 'AM' | 'PM' })}
                            className="h-10 rounded-lg border border-casa-border bg-casa-surface px-2 text-body-sm font-semibold text-casa-navy focus:outline-none focus:ring-2 focus:ring-casa-gold/40"
                          >
                            <option value="AM">AM</option>
                            <option value="PM">PM</option>
                          </select>
                        </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
                <div>
                  <label className="text-caption font-semibold text-casa-muted uppercase tracking-wide block mb-1.5">
                    End
                  </label>
                  {(() => {
                    const p = getPickerParts(endDT)
                    return (
                      <div className="rounded-xl border border-casa-border bg-casa-bg p-2 space-y-2">
                        <InlineCalendarPicker
                          value={endDT.slice(0, 10)}
                          onChange={(nextDate) => {
                            if (!isMultiDay) return
                            setEndDT(`${nextDate}T${isAllDay ? '23:59' : (endDT.slice(11, 16) || '00:00')}`)
                          }}
                          className={!isMultiDay ? 'pointer-events-none opacity-60' : undefined}
                        />
                        <p className="text-caption text-casa-muted">
                          Selected: {parseLocalDT(endDT).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}{!isMultiDay ? ' (same day)' : ''}
                        </p>
                        {!isAllDay && (
                        <div className="grid grid-cols-3 gap-1.5">
                          <select
                            data-vk-nav="true"
                            value={p.hour12}
                            onChange={e => updateEndParts({ hour12: Number(e.target.value) })}
                            className="h-10 rounded-lg border border-casa-border bg-casa-surface px-2 text-body-sm text-casa-navy focus:outline-none focus:ring-2 focus:ring-casa-gold/40"
                          >
                            {Array.from({ length: 12 }, (_, i) => i + 1).map(hour => <option key={hour} value={hour}>{hour}</option>)}
                          </select>
                          <select
                            data-vk-nav="true"
                            value={p.minute}
                            onChange={e => updateEndParts({ minute: Number(e.target.value) })}
                            className="h-10 rounded-lg border border-casa-border bg-casa-surface px-2 text-body-sm text-casa-navy focus:outline-none focus:ring-2 focus:ring-casa-gold/40"
                          >
                            {MINUTE_OPTIONS.map(min => <option key={min} value={min}>{String(min).padStart(2, '0')}</option>)}
                          </select>
                          <select
                            data-vk-nav="true"
                            value={p.ampm}
                            onChange={e => updateEndParts({ ampm: e.target.value as 'AM' | 'PM' })}
                            className="h-10 rounded-lg border border-casa-border bg-casa-surface px-2 text-body-sm font-semibold text-casa-navy focus:outline-none focus:ring-2 focus:ring-casa-gold/40"
                          >
                            <option value="AM">AM</option>
                            <option value="PM">PM</option>
                          </select>
                        </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 pb-6 pt-2">
              <button
                onClick={handleSave}
                disabled={!title.trim() || saving}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-semibold text-body transition-all bg-casa-navy text-white hover:bg-casa-navy/90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus size={18} />
                {saving ? 'Creating…' : 'Create Event'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
