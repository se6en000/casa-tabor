import { useState, useEffect, useRef, useMemo } from 'react'
import { CalendarDays, Plus, Camera, Sparkles } from 'lucide-react'
import { addHours } from 'date-fns'
import { cn } from '../../utils/cn'
import { supabase } from '../../lib/supabase'
import { syncAndMaterializeRecurringSeries, triggerGoogleEventSync } from '../../lib/eventMutations'
import { useQueryClient } from '@tanstack/react-query'
import { useFamilyMembers } from '../../hooks/useFamilyMembers'
import type { FamilyMember } from '../../types'
import { useSavedPlaces, savedPlaceAddress } from '../../hooks/useSavedPlaces'
import { resolveDirectoryPlaceSave, type DirectoryPlaceSelection } from '../../utils/directorySuggestions'
import { normalizeAllDayEventRange } from '../../utils/allDayEventRange'
import DirectoryPlaceInput from './DirectoryPlaceInput'
import MobileDocumentScanSheet from '../mobile/MobileDocumentScanSheet'
import RecurrenceRuleBuilder from '../calendar/RecurrenceRuleBuilder'
import {
  Alert,
  Button,
  Chip,
  DateTimeDial,
  DisclosureSection,
  Field,
  Input,
  PersonAvatarStack,
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

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function toLocalDT(d: Date): string {
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
  const visibleFamilyMembers = useMemo(
    () => familyMembers.filter((m) => (m.show_on_home_sidebar ?? true) || selectedMemberIds.includes(m.id)),
    [familyMembers, selectedMemberIds]
  )

  const [placeSelection, setPlaceSelection] = useState<DirectoryPlaceSelection>(null)
  const [placeFieldKey, setPlaceFieldKey] = useState(0)
  const { data: savedPlaces = [] } = useSavedPlaces()
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [rruleStr, setRruleStr] = useState<string | null>(null)
  const [rruleSummary, setRruleSummary] = useState('Does not repeat')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState('')
  const [savePartial, setSavePartial] = useState(false)
  const [scanSheetOpen, setScanSheetOpen] = useState(false)

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
      setPlaceSelection(null)
      setPlaceFieldKey((k) => k + 1)
      setDetailsOpen(false)
      setRruleStr(null)
      setRruleSummary('Does not repeat')
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
    const repeatRule = rruleStr ? rruleStr.replace(/^RRULE:/, '') : null

    // Resolve the location against saved_places (lookup-first) instead of
    // trusting free-typed text, so quick-created events dedupe/link to the
    // household directory and get a real address up front for the driving
    // plan instead of an unstructured location string.
    const placeResolution = resolveDirectoryPlaceSave(
      placeSelection,
      savedPlaces.map((p) => ({ id: p.id, primary: p.name, aliases: p.aliases })),
    )
    let resolvedLocationName: string | null = null
    let resolvedAddress: string | null = null
    let resolvedLat: number | null = null
    let resolvedLng: number | null = null
    if (placeResolution.action === 'link') {
      const place = savedPlaces.find((p) => p.id === placeResolution.placeId)
      resolvedLocationName = place?.name ?? null
      resolvedAddress = place ? savedPlaceAddress(place) || null : null
      resolvedLat = place?.lat ?? null
      resolvedLng = place?.lng ?? null
    } else if (placeResolution.action === 'create-and-link') {
      const input = placeResolution.createInput
      const { error: createPlaceError } = await supabase.from('saved_places').insert({
        name: input.name,
        aliases: [],
        address: input.address ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        zip: input.zip ?? null,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        category: 'other',
        confirmed: true,
        source: 'manual',
        occurrence_count: 1,
      })
      if (createPlaceError) {
        setSaveError(`Could not save the new place: ${createPlaceError.message}`)
        setSaving(false)
        return
      }
      void qc.invalidateQueries({ queryKey: ['saved_places'] })
      resolvedLocationName = input.name
      resolvedAddress = [input.address, input.city, input.state, input.zip].filter(Boolean).join(', ') || null
      resolvedLat = input.lat ?? null
      resolvedLng = input.lng ?? null
    }

    const { data: inserted, error } = await supabase.from('events').insert({
      title: title.trim(),
      description: notes.trim() || null,
      start_time: allDayRange?.start ?? start.toISOString(),
      end_time: allDayRange?.end ?? end.toISOString(),
      all_day: allDay,
      status: 'confirmed',
      event_type: eventType,
      location_name: resolvedLocationName,
      address: resolvedAddress,
      lat: resolvedLat,
      lng: resolvedLng,
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
      await syncAndMaterializeRecurringSeries(supabase, inserted.id)
    } else {
      triggerGoogleEventSync(supabase, inserted.id)
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
    rruleSummary !== 'Does not repeat' ? rruleSummary : null,
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
      <div ref={sheetRef} tabIndex={-1} className="space-y-4">
        {/* ── 1-Tap AI Scanner Banner (Mobile & Desktop) ── */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setScanSheetOpen(true)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setScanSheetOpen(true) }}
          className="flex items-center justify-between p-3.5 rounded-2xl bg-gradient-to-r from-casa-navy via-slate-900 to-slate-950 text-white border border-casa-gold/35 hover:border-casa-gold cursor-pointer active:scale-[0.98] transition-all shadow-xs"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-casa-gold text-casa-navy flex items-center justify-center shrink-0 shadow-2xs">
              <Camera size={18} strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <div className="text-body-sm font-bold text-white flex items-center gap-1.5 leading-tight">
                <span>Scan Document or Card</span>
                <Sparkles size={13} className="text-casa-gold" />
              </div>
              <div className="text-caption text-slate-300 truncate mt-0.5">
                Extract 1 to many events & reminders with AI
              </div>
            </div>
          </div>
          <div className="text-caption font-bold text-casa-gold bg-casa-gold/15 border border-casa-gold/25 px-2.5 py-1 rounded-lg shrink-0 ml-2">
            Scan
          </div>
        </div>

        <div className="flex items-center gap-2 py-0.5">
          <div className="flex-1 h-px bg-casa-border" />
          <span className="text-3xs uppercase font-bold tracking-wider text-casa-muted">or create manually</span>
          <div className="flex-1 h-px bg-casa-border" />
        </div>

        {/* Event vs Reminder Segmented Switch */}
        <div className="flex items-center justify-between pb-1">
          <span className="text-caption font-bold text-casa-muted">Type</span>
          <div className="flex items-center bg-casa-sand/80 p-0.5 rounded-xl border border-casa-border/60">
            <Button
              type="button"
              size="sm"
              variant={eventType === 'event' ? 'primary' : 'ghost'}
              onClick={() => setEventType('event')}
              className={cn(
                'px-3 py-1 min-h-[36px] text-caption font-bold rounded-lg transition-all',
                eventType !== 'event' && 'text-casa-muted hover:text-casa-navy',
              )}
            >
              Event
            </Button>
            <Button
              type="button"
              size="sm"
              variant={eventType === 'reminder' ? 'secondary' : 'ghost'}
              onClick={() => setEventType('reminder')}
              className={cn(
                'px-3 py-1 min-h-[36px] text-caption font-bold rounded-lg transition-all',
                eventType === 'reminder' ? 'bg-casa-gold text-casa-navy shadow-2xs' : 'text-casa-muted hover:text-casa-navy',
              )}
            >
              Reminder
            </Button>
          </div>
        </div>

        <Field label="Event title" required>
          <Input
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void handleSave() }}
            placeholder={eventType === 'reminder' ? 'What do you need to remember?' : "What's happening?"}
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
            {visibleFamilyMembers.map((member: FamilyMember) => {
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
          hint="Search saved places or add a new one — Casa links it to the household directory."
        >
          <DirectoryPlaceInput
            key={placeFieldKey}
            label="Where"
            placeholder="Where is it?"
            onChange={setPlaceSelection}
            onClear={() => setPlaceSelection(null)}
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
            <RecurrenceRuleBuilder
              value={rruleStr}
              onChange={(str, summary) => {
                setRruleStr(str)
                setRruleSummary(summary)
              }}
              startDate={startDT}
              disabled={saving || Boolean(saveSuccess)}
            />
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

      {/* ── Document / Card Scanner Sheet ── */}
      <MobileDocumentScanSheet
        open={scanSheetOpen}
        onClose={() => setScanSheetOpen(false)}
        onSuccess={() => {
          setScanSheetOpen(false)
          onClose()
        }}
      />
    </Sheet>
  )
}
