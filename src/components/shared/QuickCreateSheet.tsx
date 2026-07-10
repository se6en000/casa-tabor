import { useState, useEffect, useRef } from 'react'
import { Plus } from 'lucide-react'
import { addHours } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { Alert, Button, DateTimeDial, Field, Input, Sheet } from '../ui'

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

/** Snap a date to the nearest 5-minute mark (also zeroes seconds/ms). */
function snapTo5(d: Date): Date {
  const step = 5 * 60 * 1000
  return new Date(Math.round(d.getTime() / step) * step)
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

  // Re-initialise whenever the sheet opens with a new slot
  useEffect(() => {
    if (!open) return
    const s = snapTo5(initialStart ?? new Date())
    const frame = requestAnimationFrame(() => {
      setTitle('')
      setStartDT(toLocalDT(s))
      setEndDT(toLocalDT(addHours(s, 1)))
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

              <DateTimeDial
                startValue={startDT}
                endValue={endDT}
                onStartChange={setStartDT}
                onEndChange={setEndDT}
                defaultExpanded
              />
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
