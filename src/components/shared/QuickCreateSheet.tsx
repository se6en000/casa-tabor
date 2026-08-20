import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  Sparkles,
  Mic,
  Clock,
  Users,
  CalendarDays,
  Bell,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { addHours, format } from 'date-fns'
import { cn } from '../../utils/cn'
import { supabase } from '../../lib/supabase'
import { syncAndMaterializeRecurringSeries, triggerGoogleEventSync } from '../../lib/eventMutations'
import { useQueryClient } from '@tanstack/react-query'
import { useFamilyMembers } from '../../hooks/useFamilyMembers'
import type { FamilyMember } from '../../types'
import { useSavedPlaces, savedPlaceAddress } from '../../hooks/useSavedPlaces'
import { resolveDirectoryPlaceSave, type DirectoryPlaceSelection } from '../../utils/directorySuggestions'
import { normalizeAllDayEventRange } from '../../utils/allDayEventRange'
import {
  parseSmartEvent,
  QUICK_SLOT_TIMES,
  toLocalDTString,
} from '../../utils/smartEventParser'
import { useFieldDictation } from '../../hooks/useFieldDictation'
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
  IconButton,
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

function snapTo5(d: Date): Date {
  const step = 5 * 60 * 1000
  return new Date(Math.round(d.getTime() / step) * step)
}

export default function QuickCreateSheet({ open, onClose, initialStart }: Props) {
  const qc = useQueryClient()
  const { data: familyMembers = [] } = useFamilyMembers()
  const { data: savedPlaces = [] } = useSavedPlaces()
  const [viewportHeight, setViewportHeight] = useState<number | null>(null)
  const sheetRef = useRef<HTMLDivElement>(null)

  const defaultStart = snapTo5(initialStart ?? new Date())
  const defaultEnd = addHours(defaultStart, 1)

  // Smart Input & Natural Language State
  const [smartInput, setSmartInput] = useState('')
  const [aiFeedback, setAiFeedback] = useState<string | null>(null)

  // Core Form State
  const [title, setTitle] = useState('')
  const [eventType, setEventType] = useState<'event' | 'reminder'>('event')
  const [startDT, setStartDT] = useState(() => toLocalDTString(defaultStart))
  const [endDT, setEndDT] = useState(() => toLocalDTString(defaultEnd))
  const [allDay, setAllDay] = useState(false)
  const [activeSlot, setActiveSlot] = useState<'morning' | 'midday' | 'afternoon' | 'evening' | null>('morning')
  const [customTimeOpen, setCustomTimeOpen] = useState(false)
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])
  const [placeSelection, setPlaceSelection] = useState<DirectoryPlaceSelection | null>(null)
  const [placeFieldKey, setPlaceFieldKey] = useState(0)

  // Details & Recurrence
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [rruleStr, setRruleStr] = useState<string | null>(null)
  const [rruleSummary, setRruleSummary] = useState<string>('Does not repeat')
  const [notes, setNotes] = useState('')
  const [scanSheetOpen, setScanSheetOpen] = useState(false)

  // Save State
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState('')
  const [savePartial, setSavePartial] = useState(false)

  const visibleFamilyMembers = useMemo(() => familyMembers, [familyMembers])

  // ── Smart Natural Language Extraction ─────────────────────────────────
  const applySmartParse = useCallback((text: string) => {
    if (!text.trim()) {
      setAiFeedback(null)
      return
    }
    const baseDate = initialStart ? new Date(initialStart) : new Date()
    const parsed = parseSmartEvent(text, {
      referenceDate: baseDate,
      familyMembers: visibleFamilyMembers.map((m: FamilyMember) => ({ id: m.id, name: m.name })),
      savedPlaces: savedPlaces.map((p) => ({ id: p.id, name: p.name, aliases: p.aliases })),
    })

    if (parsed.startDate) {
      setStartDT(parsed.startDT)
      setActiveSlot(parsed.quickSlot)
    }
    if (parsed.endDate) {
      setEndDT(parsed.endDT)
    }
    if (parsed.eventType) {
      setEventType(parsed.eventType)
    }
    if (parsed.matchedMemberIds && parsed.matchedMemberIds.length > 0) {
      setSelectedMemberIds(parsed.matchedMemberIds)
    }
    if (parsed.matchedPlaceName) {
      const saved = savedPlaces.find(
        (p) => p.name.toLowerCase() === parsed.matchedPlaceName?.toLowerCase(),
      )
      if (saved) {
        setPlaceSelection({
          mode: 'existing',
          placeId: saved.id,
        })
      }
    }

    // Build friendly pill summary
    const highlights: string[] = []
    if (parsed.startDate) highlights.push(format(parsed.startDate, 'h:mm a'))
    if (parsed.matchedMemberIds && parsed.matchedMemberIds.length > 0) {
      const names = parsed.matchedMemberIds
        .map((id: string) => visibleFamilyMembers.find((m: FamilyMember) => m.id === id)?.name)
        .filter(Boolean)
      if (names.length > 0) highlights.push(names.join(', '))
    }
    if (parsed.matchedPlaceName) highlights.push(parsed.matchedPlaceName)
    else if (parsed.rawLocation) highlights.push(parsed.rawLocation)

    if (highlights.length > 0) {
      setAiFeedback(`✦ Detected: ${highlights.join(' · ')}`)
    } else {
      setAiFeedback(null)
    }
  }, [initialStart, visibleFamilyMembers, savedPlaces])

  // ── Voice Dictation Integration ───────────────────────────────────────
  const {
    listening: micActive,
    start: startMic,
    stop: stopMic,
  } = useFieldDictation({
    onText: (fullText) => {
      setSmartInput(fullText)
      applySmartParse(fullText)
    },
    onFinal: (finalText) => {
      if (finalText.trim()) {
        setSmartInput(finalText)
        applySmartParse(finalText)
      }
    },
  })

  // Pointer Handlers for Push-to-Talk (Hold to speak, release to stop)
  const isPointerHoldingRef = useRef(false)
  const handleMicPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault()
    isPointerHoldingRef.current = true
    void startMic(smartInput)
  }
  const handleMicPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault()
    if (isPointerHoldingRef.current) {
      isPointerHoldingRef.current = false
      stopMic()
    }
  }

  // Text change handler for typing / pasting
  const handleSmartInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setSmartInput(val)
    applySmartParse(val)
  }

  // ── Quick Time Slot Handlers ──────────────────────────────────────────
  const handleSelectQuickSlot = (slotKey: 'morning' | 'midday' | 'afternoon' | 'evening') => {
    setActiveSlot(slotKey)
    const slot = QUICK_SLOT_TIMES[slotKey]
    const base = initialStart ? new Date(initialStart) : new Date()
    base.setHours(slot.hour, slot.minute, 0, 0)
    const sStr = toLocalDTString(base)
    const eStr = toLocalDTString(addHours(base, 1))
    setStartDT(sStr)
    setEndDT(eStr)
  }

  // 30s Kiosk Idle Reset
  useEffect(() => {
    if (!open) return
    const idleTimer = window.setTimeout(() => {
      if (!saving) onClose()
    }, 30000)
    return () => window.clearTimeout(idleTimer)
  }, [open, saving, smartInput, onClose])

  // Re-initialise whenever the sheet opens
  useEffect(() => {
    if (!open) return
    const s = snapTo5(initialStart ?? new Date())
    const frame = requestAnimationFrame(() => {
      setSmartInput('')
      setAiFeedback(null)
      setTitle('')
      setStartDT(toLocalDTString(s))
      setEndDT(toLocalDTString(addHours(s, 1)))
      setActiveSlot('morning')
      setCustomTimeOpen(false)
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
    return () => {
      if (vv) {
        vv.removeEventListener('resize', updateViewport)
        vv.removeEventListener('scroll', updateViewport)
      }
      setViewportHeight(null)
    }
  }, [open])

  // ── Database Event Creation Handler ───────────────────────────────────
  const handleSave = async () => {
    const effectiveTitle = title.trim() || smartInput.trim()
    if (!effectiveTitle) return

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
      title: effectiveTitle,
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
        setSaveError(`Event was created, but people could not be linked: ${memberError.message}`)
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

  const toggleMember = (memberId: string) => {
    setSelectedMemberIds((current) => (
      current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId]
    ))
  }

  const headerDateLabel = useMemo(() => {
    const target = initialStart ?? new Date()
    const isToday = new Date().toDateString() === target.toDateString()
    return isToday ? 'Today' : format(target, 'EEEE, MMM d')
  }, [initialStart])

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title=""
      showHandle
      panelClassName="sm:left-1/2 sm:right-auto sm:w-full sm:max-w-xl sm:-translate-x-1/2 sm:rounded-modal"
      panelStyle={{
        bottom: 'max(0px, env(safe-area-inset-bottom))',
        maxHeight: viewportHeight ? `${Math.max(300, viewportHeight - 8)}px` : 'calc(100dvh - 8px)',
      }}
      contentClassName="px-6 py-5"
      transition={{ type: 'spring', damping: 32, stiffness: 260 }}
    >
      <div ref={sheetRef} tabIndex={-1} className="space-y-5 select-none">
        {/* ── TOP HEADER: Date Badge + Event/Reminder Segmented Toggle ── */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-casa-sand/30 border border-casa-sand text-xs font-bold text-casa-navy">
              <CalendarDays size={13} className="text-casa-gold" />
              {headerDateLabel}
            </span>
            <span className="text-xs font-bold text-casa-gold tracking-widest uppercase">
              Quick Add
            </span>
          </div>

          <div className="inline-flex items-center p-1 rounded-full bg-casa-surface-muted border border-casa-border">
            <Button
              size="sm"
              variant={eventType === 'event' ? 'primary' : 'ghost'}
              onClick={() => setEventType('event')}
              className="rounded-full !text-caption !py-1 !px-3"
            >
              Event
            </Button>
            <Button
              size="sm"
              variant={eventType === 'reminder' ? 'primary' : 'ghost'}
              onClick={() => setEventType('reminder')}
              leadingIcon={<Bell size={12} />}
              className="rounded-full !text-caption !py-1 !px-3"
            >
              Reminder
            </Button>
          </div>
        </div>

        {/* ── SMART AI INPUT & VOICE CAPTURE BAR ───────────────────────── */}
        <div className="space-y-1.5">
          <div className="relative flex items-center w-full">
            <input
              type="text"
              value={smartInput}
              onChange={handleSmartInputChange}
              placeholder='e.g. "From 7 PM to 9 PM Kelly is going to the gym"'
              disabled={saving || Boolean(saveSuccess)}
              className="w-full h-14 pl-4 pr-14 rounded-2xl border-2 border-casa-gold/60 focus:border-casa-gold bg-casa-surface text-casa-navy placeholder:text-casa-slate/60 text-base font-medium shadow-sm transition-all focus:outline-none focus:ring-4 focus:ring-casa-gold/15"
            />

            {/* Embedded Luxury Push-to-Talk Mic Button */}
            <IconButton
              icon={<Mic size={18} strokeWidth={2.4} />}
              aria-label={micActive ? 'Listening... release to finish' : 'Hold to speak (Push to talk)'}
              title={micActive ? 'Listening... release to finish' : 'Hold to speak (Push to talk)'}
              onPointerDown={handleMicPointerDown}
              onPointerUp={handleMicPointerUp}
              onPointerCancel={handleMicPointerUp}
              size="md"
              className={cn(
                'absolute right-2 !size-control-sm rounded-xl',
                micActive
                  ? 'bg-red-500 text-white animate-pulse shadow-lg scale-105'
                  : 'bg-casa-gold/15 hover:bg-casa-gold/30 text-casa-gold active:scale-95',
              )}
            />
          </div>

          {/* AI Entity Feedback Pill */}
          {aiFeedback && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-casa-gold/10 text-xs font-semibold text-casa-gold-dark">
              <span>{aiFeedback}</span>
            </div>
          )}
        </div>

        {/* ── QUICK TIME SLOTS + CUSTOM TIME DIAL ───────────────────── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-casa-slate">
              <Clock size={14} />
              <span>Time Slot</span>
            </div>
            <IconButton
              icon={customTimeOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              aria-label={customTimeOpen ? 'Hide custom time dial' : 'Open custom time dial'}
              size="sm"
              variant="ghost"
              onClick={() => setCustomTimeOpen((o) => !o)}
            />
          </div>

          {/* 4 Quick Preset Slot Buttons */}
          <div className="grid grid-cols-4 gap-2">
            {(['morning', 'midday', 'afternoon', 'evening'] as const).map((slotKey) => {
              const slot = QUICK_SLOT_TIMES[slotKey]
              const isSelected = activeSlot === slotKey
              return (
                <Button
                  key={slotKey}
                  variant={isSelected ? 'secondary' : 'ghost'}
                  onClick={() => handleSelectQuickSlot(slotKey)}
                  className={cn(
                    'flex flex-col items-center justify-center !p-2.5 !h-auto rounded-xl border transition-all',
                    isSelected
                      ? 'border-casa-gold bg-casa-gold/15 text-casa-navy font-bold shadow-sm'
                      : 'border-casa-border bg-casa-surface text-casa-slate hover:bg-casa-surface-muted',
                  )}
                >
                  <span className="text-caption font-bold">{slot.label}</span>
                </Button>
              )
            })}
          </div>

          {/* Custom Time Expander */}
          {customTimeOpen && (
            <div className="pt-2 border-t border-casa-sand/40">
              <DateTimeDial
                startValue={startDT}
                endValue={endDT}
                onStartChange={(val) => {
                  setStartDT(val)
                  setActiveSlot(null)
                }}
                onEndChange={setEndDT}
                startChangeEndOffsetMinutes={60}
                defaultExpanded
              />
            </div>
          )}
        </div>

        {/* ── FAMILY & ATTENDEES CHIPS ──────────────────────────────── */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-casa-slate">
            <Users size={14} />
            <span>Family & Attendees</span>
          </div>

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
        </div>

        {/* ── LOCATION / VENUE SEARCH INPUT ─────────────────────────── */}
        <div className="space-y-1.5">
          <DirectoryPlaceInput
            key={placeFieldKey}
            label="Location"
            placeholder="Add location or saved venue"
            onChange={setPlaceSelection}
            onClear={() => setPlaceSelection(null)}
          />
        </div>

        {/* ── DETAILS & RECURRENCE DISCLOSURE ───────────────────────── */}
        <DisclosureSection
          title="Add notes / details"
          summary={allDay ? 'All day' : (rruleSummary !== 'Does not repeat' ? rruleSummary : '')}
          icon={<CalendarDays size={18} />}
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
        >
          <div className="space-y-4 pt-2">
            <Field label="Event Title Override (Optional)">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Explicit event title"
                disabled={saving || Boolean(saveSuccess)}
              />
            </Field>
            <Switch
              checked={allDay}
              onCheckedChange={setAllDay}
              label="All day"
              description="Keep this on the selected date without a specific time."
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
                rows={2}
                disabled={saving || Boolean(saveSuccess)}
              />
            </Field>
          </div>
        </DisclosureSection>

        {/* ── SAVE STATUS / ALERTS ──────────────────────────────────── */}
        {saveError && (
          <Alert tone="danger" title={savePartial ? 'Event created with an issue' : 'Event was not created'}>
            {saveError}
          </Alert>
        )}
        {saveSuccess && <Alert tone="success" title="Event created">{saveSuccess}</Alert>}

        {/* ── FOOTER ACTIONS: Cancel & Save Entry ────────────────────── */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <Button
            size="md"
            variant="ghost"
            onClick={onClose}
          >
            Cancel
          </Button>

          <Button
            size="lg"
            variant="strong"
            onClick={() => void handleSave()}
            disabled={(!smartInput.trim() && !title.trim()) || Boolean(saveSuccess) || savePartial}
            loading={saving}
            leadingIcon={<Sparkles size={18} />}
          >
            Save Entry
          </Button>
        </div>
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
