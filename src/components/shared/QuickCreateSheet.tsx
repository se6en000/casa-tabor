import { useState, useEffect, useRef } from 'react'
import { CalendarDays, Plus } from 'lucide-react'
import { addHours } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { useFamilyMembers } from '../../hooks/useFamilyMembers'
import { normalizeAllDayEventRange } from '../../utils/allDayEventRange'
import {
  Alert,
  Button,
  Chip,
  DateTimeDial,
  DisclosureSection,
  Field,
  Input,
  PersonAvatarStack,
  Select,
  Sheet,
  Switch,
  Textarea,
} from '../ui'

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
  const { data: familyMembers = [] } = useFamilyMembers()
  const [viewportHeight, setViewportHeight] = useState<number | null>(null)
  const sheetRef = useRef<HTMLDivElement>(null)

  const defaultStart = snapTo5(initialStart ?? new Date())
  const defaultEnd = addHours(defaultStart, 1)

  const [title, setTitle] = useState('')
  const [startDT, setStartDT] = useState(toLocalDT(defaultStart))
  const [endDT, setEndDT] = useState(toLocalDT(defaultEnd))
  const [allDay, setAllDay] = useState(false)
  const [eventType, setEventType] = useState<'event' | 'reminder'>('event')
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])
  const [location, setLocation] = useState('')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [repeat, setRepeat] = useState<'none' | 'daily' | 'weekly' | 'monthly'>('none')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState('')
  const [savePartial, setSavePartial] = useState(false)

  // Re-initialise whenever the sheet opens with a new slot
  useEffect(() => {
    if (!open) return
    const s = snapTo5(initialStart ?? new Date())
    const frame = requestAnimationFrame(() => {
      setTitle('')
      setStartDT(toLocalDT(s))
      setEndDT(toLocalDT(addHours(s, 1)))
      setAllDay(false)
      setEventType('event')
      setSelectedMemberIds([])
      setLocation('')
      setDetailsOpen(false)
      setRepeat('none')
      setNotes('')
      setSaving(false)
      setSaveError('')
      setSaveSuccess('')
      setSavePartial(false)
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
    setSaveSuccess('')
    setSavePartial(false)
    setSaving(true)
    const start = new Date(startDT)
    let end = new Date(endDT)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setSaveError('Choose a valid date and time.')
      setSaving(false)
      return
    }
    if (end.getTime() <= start.getTime()) end = addHours(start, 1)
    const allDayRange = allDay ? normalizeAllDayEventRange(startDT, endDT) : null
    const repeatRule = repeat === 'none' ? null : `FREQ=${repeat.toUpperCase()}`

    const { data: inserted, error } = await supabase.from('events').insert({
      title: title.trim(),
      description: notes.trim() || null,
      start_time: allDayRange?.start ?? start.toISOString(),
      end_time: allDayRange?.end ?? end.toISOString(),
      all_day: allDay,
      status: 'confirmed',
      event_type: eventType,
      location_name: location.trim() || null,
      rrule: repeatRule,
      record_kind: repeatRule ? 'series_template' : 'single',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).select('id').single()

    if (error) {
      setSaveError(`Could not create event: ${error.message}`)
      setSaving(false)
      return
    }

    if (repeatRule) {
      const { error: seriesError } = await supabase.from('event_series').insert({
        template_event_id: inserted.id,
        recurrence_lines: [`RRULE:${repeatRule}`],
        ownership: 'casa',
      })
      if (seriesError) {
        setSavePartial(true)
        setSaveError(`Event was created, but its repeat pattern could not be configured: ${seriesError.message}`)
        setSaving(false)
        void qc.invalidateQueries({ queryKey: ['events'] })
        return
      }
    }

    if (inserted && selectedMemberIds.length > 0) {
      const { error: memberError } = await supabase.from('event_members').insert(
        selectedMemberIds.map((familyMemberId, index) => ({
          event_id: inserted.id,
          family_member_id: familyMemberId,
          role: index === 0 ? 'primary' : 'attendee',
          rsvp_status: 'accepted',
        })),
      )
      if (memberError) {
        setSavePartial(true)
        setSaveError(`Event was created, but people could not be added: ${memberError.message}`)
        setSaving(false)
        void qc.invalidateQueries({ queryKey: ['events'] })
        return
      }
    }

    await qc.invalidateQueries({ queryKey: ['events'] })
    navigator.vibrate?.(15)
    if (inserted?.id) {
      void supabase.functions.invoke('fetch-event-weather', { body: { event_id: inserted.id } })
        .then(() => qc.invalidateQueries({ queryKey: ['events'] }))
        .catch((cause: unknown) => console.error('QuickCreateSheet: weather refresh failed', cause))
      void supabase.functions.invoke('create-google-event', { body: { event_id: inserted.id } })
        .catch((cause: unknown) => console.error('QuickCreateSheet: calendar sync request failed', cause))
    }
    setSaving(false)
    setSaveSuccess('Created. Connected calendars and event details will update shortly.')
    window.setTimeout(onClose, 900)
  }

  const handleAllDayChange = (checked: boolean) => {
    setAllDay(checked)
    if (checked) {
      const date = startDT.slice(0, 10)
      setStartDT(`${date}T00:00`)
      setEndDT(`${date}T00:00`)
    }
  }

  const handleAllDayDateChange = (date: string) => {
    setStartDT(`${date}T00:00`)
    setEndDT(`${date}T00:00`)
  }

  const toggleMember = (memberId: string) => {
    setSelectedMemberIds((current) => (
      current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId]
    ))
  }

  const detailsSummary = [
    allDay ? 'All day' : null,
    eventType === 'reminder' ? 'Reminder' : null,
    repeat === 'none' ? null : `Repeats ${repeat}`,
    notes.trim() ? 'Notes added' : null,
  ].filter(Boolean).join(' · ') || 'All day, repeat, reminder, or notes'

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
      <div ref={sheetRef} tabIndex={-1} className="space-y-5">
        <Field label="Event title" required>
          <Input
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void handleSave() }}
            placeholder="What's happening?"
            disabled={saving || Boolean(saveSuccess)}
          />
        </Field>

        {allDay ? (
          <Field label="Date">
            <Input
              type="date"
              value={startDT.slice(0, 10)}
              onChange={(event) => handleAllDayDateChange(event.target.value)}
              disabled={saving || Boolean(saveSuccess)}
            />
          </Field>
        ) : (
          <DateTimeDial
            startValue={startDT}
            endValue={endDT}
            onStartChange={setStartDT}
            onEndChange={setEndDT}
            startChangeEndOffsetMinutes={60}
            defaultExpanded
          />
        )}

        <Field label="People" hint="The first person selected is the primary attendee.">
          <div className="flex flex-wrap gap-2">
            {familyMembers.map((member) => {
              const selected = selectedMemberIds.includes(member.id)
              return (
                <Chip
                  key={member.id}
                  size="md"
                  selected={selected}
                  onClick={() => toggleMember(member.id)}
                  disabled={saving || Boolean(saveSuccess)}
                  icon={
                    <PersonAvatarStack
                      people={[{ id: member.id, name: member.name, color: member.color_hex }]}
                      size="sm"
                      max={1}
                    />
                  }
                >
                  {member.name}
                </Chip>
              )
            })}
          </div>
        </Field>

        <Field
          label="Where"
          hint="Add a place or address. Casa will refine the destination after creation."
        >
          <Input
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder="Where is it?"
            disabled={saving || Boolean(saveSuccess)}
          />
        </Field>

        <DisclosureSection
          title="More details"
          summary={detailsSummary}
          icon={<CalendarDays size={18} />}
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
        >
          <div className="space-y-4">
            <Switch
              checked={allDay}
              onCheckedChange={handleAllDayChange}
              label="All day"
              description="Keep this on the selected date without a specific time."
              disabled={saving || Boolean(saveSuccess)}
            />
            <Switch
              checked={eventType === 'reminder'}
              onCheckedChange={(checked) => setEventType(checked ? 'reminder' : 'event')}
              label="Reminder"
              description="Create a reminder instead of a calendar event."
              disabled={saving || Boolean(saveSuccess)}
            />
            <Field label="Repeat" hint="For a custom schedule, create the event first and use Edit details.">
              <Select
                value={repeat}
                onChange={(event) => setRepeat(event.target.value as typeof repeat)}
                disabled={saving || Boolean(saveSuccess)}
              >
                <option value="none">Does not repeat</option>
                <option value="daily">Every day</option>
                <option value="weekly">Every week</option>
                <option value="monthly">Every month</option>
              </Select>
            </Field>
            <Field label="Notes">
              <Textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Anything to remember?"
                rows={3}
                disabled={saving || Boolean(saveSuccess)}
              />
            </Field>
          </div>
        </DisclosureSection>

        {saveError && (
          <Alert tone="danger" title={savePartial ? 'Event created with an issue' : 'Event was not created'}>
            {saveError}
          </Alert>
        )}
        {saveSuccess && <Alert tone="success" title="Event created">{saveSuccess}</Alert>}
        <Button
          fullWidth
          size="lg"
          variant="strong"
          onClick={() => void handleSave()}
          disabled={!title.trim() || Boolean(saveSuccess) || savePartial}
          loading={saving}
          leadingIcon={<Plus size={18} />}
        >
          Create Event
        </Button>
      </div>
    </Sheet>
  )
}
