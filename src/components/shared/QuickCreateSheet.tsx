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
import { supabase } from '../../lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { useFamilyMembers } from '../../hooks/useFamilyMembers'
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

function snapTo5(d: Date): Date {
  const step = 5 * 60 * 1000
  return new Date(Math.round(d.getTime() / step) * step)
}

function formatStartsAtLabel(dtString: string): string {
  try {
    const d = new Date(dtString)
    if (Number.isNaN(d.getTime())) return 'Starts at 9:00 AM'
    return `Starts at ${format(d, 'h:mm a')}`
  } catch {
    return 'Starts at 9:00 AM'
  }
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
  const [startDT, setStartDT] = useState(toLocalDTString(defaultStart))
  const [endDT, setEndDT] = useState(toLocalDTString(defaultEnd))
  const [activeSlot, setActiveSlot] = useState<'morning' | 'midday' | 'afternoon' | 'evening' | null>('morning')
  const [customTimeOpen, setCustomTimeOpen] = useState(false)
  const [allDay, setAllDay] = useState(false)
  const [eventType, setEventType] = useState<'event' | 'reminder'>('event')
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])
  const [placeSelection, setPlaceSelection] = useState<DirectoryPlaceSelection>(null)
  const [placeFieldKey, setPlaceFieldKey] = useState(0)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [repeat, setRepeat] = useState<'none' | 'daily' | 'weekly' | 'monthly'>('none')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState('')
  const [savePartial, setSavePartial] = useState(false)

  // ── Smart Natural Language Parser Trigger ─────────────────────────────
  const applySmartParse = useCallback(
    (text: string) => {
      if (!text.trim()) {
        setAiFeedback(null)
        return
      }

      const parsed = parseSmartEvent(text, {
        referenceDate: initialStart ?? new Date(),
        familyMembers,
        savedPlaces,
      })

      if (parsed.title) setTitle(parsed.title)
      setStartDT(parsed.startDT)
      setEndDT(parsed.endDT)
      setEventType(parsed.eventType)
      if (parsed.quickSlot) setActiveSlot(parsed.quickSlot)

      if (parsed.matchedMemberIds.length > 0) {
        setSelectedMemberIds((prev) => {
          const combined = Array.from(new Set([...prev, ...parsed.matchedMemberIds]))
          return combined
        })
      }

      if (parsed.matchedPlaceName) {
        const place = savedPlaces.find(
          (p) => p.name.toLowerCase() === parsed.matchedPlaceName?.toLowerCase(),
        )
        if (place) {
          setPlaceSelection({
            kind: 'directory',
            placeId: place.id,
            displayName: place.name,
            address: savedPlaceAddress(place) || undefined,
          })
          setPlaceFieldKey((k) => k + 1)
        }
      }

      // Generate brief visual reassurance badge
      const feedbackParts: string[] = []
      try {
        const timeFormatted = format(parsed.startDate, 'h:mm a')
        feedbackParts.push(timeFormatted)
      } catch { /* ignore */ }

      if (parsed.matchedMemberIds.length > 0) {
        const names = parsed.matchedMemberIds
          .map((id) => familyMembers.find((m) => m.id === id)?.name)
          .filter(Boolean)
        if (names.length > 0) feedbackParts.push(names.join(', '))
      }
      if (parsed.matchedPlaceName || parsed.rawLocation) {
        feedbackParts.push(parsed.matchedPlaceName || parsed.rawLocation || '')
      }

      setAiFeedback(feedbackParts.length > 0 ? feedbackParts.join(' · ') : 'Smart parsed')
    },
    [familyMembers, savedPlaces, initialStart],
  )

  // ── Voice Dictation Hook with Dual Path (Pi WebSocket + Mac WebSpeech) ─
  const {
    listening: micListening,
    start: startMic,
    stop: stopMic,
    toggle: toggleMic,
  } = useFieldDictation({
    onText: (dictated) => {
      setSmartInput(dictated)
      applySmartParse(dictated)
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
  const handleMicPointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    isPointerHoldingRef.current = true
    void startMic(smartInput)
  }
  const handleMicPointerUp = (e: React.PointerEvent) => {
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
    const repeatRule = repeat === 'none' ? null : `FREQ=${repeat.toUpperCase()}`

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
      const { error: seriesError } = await supabase.from('event_series').insert({
        template_event_id: inserted.id,
        recurrence_lines: [`RRULE:${repeatRule}`],
        ownership: 'casa',
      })
      if (seriesError) {
        setSavePartial(true)
        setSaveError(`Event was created, but repeat pattern failed: ${seriesError.message}`)
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
        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-casa-gold inline-block" />
            <span className="font-serif text-xl font-bold tracking-tight text-casa-navy">
              {headerDateLabel}
            </span>
            <Chip size="sm" tone="accent" icon={<Sparkles size={12} />}>
              Quick Add
            </Chip>
          </div>

          {/* Event / Reminder Pill Toggle */}
          <div className="flex items-center rounded-full p-1 bg-casa-sand/30 border border-casa-sand/50 shadow-inner">
            <Button
              size="sm"
              variant={eventType === 'event' ? 'strong' : 'ghost'}
              onClick={() => setEventType('event')}
              className="rounded-full"
            >
              Event
            </Button>
            <Button
              size="sm"
              variant={eventType === 'reminder' ? 'strong' : 'ghost'}
              onClick={() => setEventType('reminder')}
              leadingIcon={<Bell size={12} />}
              className="rounded-full"
            >
              Reminder
            </Button>
          </div>
        </div>

        {/* ── SMART NATURAL LANGUAGE AI INPUT BAR WITH MIC ──────────── */}
        <div className="relative">
          <div
            className={`relative flex items-center rounded-2xl border-2 transition-all shadow-sm bg-white dark:bg-casa-navy/40 ${
              micListening
                ? 'border-casa-gold ring-4 ring-casa-gold/25 shadow-gold'
                : 'border-casa-gold/40 focus-within:border-casa-gold focus-within:ring-2 focus-within:ring-casa-gold/20'
            }`}
          >
            <input
              type="text"
              value={smartInput}
              onChange={handleSmartInputChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSave()
              }}
              placeholder="From 7 P.M to 9 pm Kelly is going to the gym..."
              className="w-full px-4 py-3.5 text-base font-medium placeholder:text-casa-slate/50 text-casa-navy focus:outline-none bg-transparent"
              disabled={saving || Boolean(saveSuccess)}
            />

            {/* Embedded Microphone Button */}
            <div className="pr-2 flex items-center gap-1.5">
              <IconButton
                icon={<Mic size={20} className={micListening ? 'animate-bounce text-casa-navy' : 'text-casa-slate'} />}
                aria-label={micListening ? 'Listening... Release or click to stop' : 'Push to talk or click to speak'}
                title={micListening ? 'Listening (Release to stop)' : 'Push to talk or click to speak'}
                variant={micListening ? 'strong' : 'ghost'}
                size="md"
                onPointerDown={handleMicPointerDown}
                onPointerUp={handleMicPointerUp}
                onClick={() => toggleMic(smartInput)}
                className={`rounded-xl transition-all ${
                  micListening ? 'bg-casa-gold ring-2 ring-casa-gold/50 animate-pulse' : ''
                }`}
              />
            </div>
          </div>

          {/* Live AI Parsing Extraction Badge */}
          {aiFeedback && (
            <div className="mt-1.5 px-3 py-1 rounded-lg bg-casa-gold/10 border border-casa-gold/20 flex items-center justify-between text-xs text-casa-gold-dark font-medium animate-fadeIn">
              <span className="flex items-center gap-1.5">
                <Sparkles size={12} className="text-casa-gold animate-spin-slow" />
                <span>AI extracted: <strong>{aiFeedback}</strong></span>
              </span>
              <span className="text-xs opacity-75 text-casa-slate">Edit anytime below</span>
            </div>
          )}
        </div>

        {/* ── TIME & QUICK SLOTS SECTION ────────────────────────────── */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-casa-navy">
              <Clock size={16} className="text-casa-gold-dark" />
              <span>{formatStartsAtLabel(startDT)}</span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setCustomTimeOpen((prev) => !prev)}
              trailingIcon={customTimeOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              className="text-xs uppercase tracking-wider font-bold"
            >
              Custom Time
            </Button>
          </div>

          {/* 4 Quick Time Slot Buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(['morning', 'midday', 'afternoon', 'evening'] as const).map((slotKey) => {
              const slot = QUICK_SLOT_TIMES[slotKey]
              const isSelected = activeSlot === slotKey && !customTimeOpen
              const timeLabel = slot.hour > 12 ? `${slot.hour - 12}:${slot.minute === 0 ? '00' : slot.minute} PM` : `${slot.hour}:${slot.minute === 0 ? '00' : slot.minute} AM`
              return (
                <Button
                  key={slotKey}
                  variant={isSelected ? 'strong' : 'subtle'}
                  size="md"
                  onClick={() => handleSelectQuickSlot(slotKey)}
                  className={`w-full justify-between capitalize font-semibold ${
                    isSelected ? 'bg-casa-navy text-white shadow-sm' : ''
                  }`}
                >
                  <span>{slotKey}</span>
                  <span className={`text-xs font-mono ml-1 ${isSelected ? 'text-casa-gold' : 'text-casa-slate'}`}>
                    {timeLabel}
                  </span>
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
          summary={allDay ? 'All day' : (repeat !== 'none' ? `Repeats ${repeat}` : '')}
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
            <Field label="Repeat" hint="For recurring events or chores.">
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
    </Sheet>
  )
}
