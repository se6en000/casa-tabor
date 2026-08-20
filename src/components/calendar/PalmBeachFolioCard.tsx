import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { format, addHours, addDays, setHours, setMinutes, isToday, isTomorrow, isSameDay } from 'date-fns'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Mic, Sparkles, Clock,
  ChevronDown, ChevronUp, Bell, Users, Plus, CheckCircle2,
} from 'lucide-react'
import { cn } from '../../utils/cn'
import { useFamilyMembers } from '../../hooks/useFamilyMembers'
import type { FamilyMember } from '../../types'
import { useSavedPlaces, savedPlaceAddress } from '../../hooks/useSavedPlaces'
import { resolveDirectoryPlaceSave, type DirectoryPlaceSelection } from '../../utils/directorySuggestions'
import { normalizeAllDayEventRange } from '../../utils/allDayEventRange'
import DirectoryPlaceInput from '../shared/DirectoryPlaceInput'
import { useFieldDictation } from '../../hooks/useFieldDictation'
import { parseCalendarNaturalLanguage } from '../../utils/calendarNaturalLanguageParser'
import { supabase } from '../../lib/supabase'
import { triggerGoogleEventSync } from '../../lib/eventMutations'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Chip, IconButton, PersonAvatarStack } from '../ui'

export interface PalmBeachFolioCardProps {
  contextDate: Date
  initialStart?: Date
  initialEventType?: 'event' | 'reminder'
  initialQuery?: string
  mode?: 'inline' | 'popover'
  onClose: () => void
  onSaved?: (eventId: string) => void
  className?: string
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function toLocalDT(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function snapTo15(d: Date): Date {
  const step = 15 * 60 * 1000
  return new Date(Math.round(d.getTime() / step) * step)
}

export default function PalmBeachFolioCard({
  contextDate,
  initialStart,
  initialEventType = 'event',
  initialQuery,
  mode = 'inline',
  onClose,
  onSaved,
  className,
}: PalmBeachFolioCardProps) {
  const qc = useQueryClient()
  const { data: familyMembers = [] } = useFamilyMembers()
  const { data: savedPlaces = [] } = useSavedPlaces()

  const defaultStart = snapTo15(initialStart ?? setMinutes(setHours(contextDate, 9), 0))
  const defaultEnd = addHours(defaultStart, 1)

  const [eventType, setEventType] = useState<'event' | 'reminder'>(initialEventType)
  const [title, setTitle] = useState('')
  const [startDT, setStartDT] = useState(toLocalDT(defaultStart))
  const [endDT, setEndDT] = useState(toLocalDT(defaultEnd))
  const [allDay, setAllDay] = useState(false)
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])
  const [placeSelection, setPlaceSelection] = useState<DirectoryPlaceSelection>(null)
  const [notes, setNotes] = useState('')
  const [showAdvancedTime, setShowAdvancedTime] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState('')
  const [aiHighlight, setAiHighlight] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const isMicHoldingRef = useRef(false)
  const isHoldingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Voice Dictation & AI parsing
  const handleDictationComplete = useCallback((spokenText: string) => {
    if (!spokenText.trim()) return
    const parsed = parseCalendarNaturalLanguage(spokenText, contextDate, familyMembers, savedPlaces)

    setTitle(parsed.title)
    setEventType(parsed.eventType)
    if (parsed.allDay) {
      setAllDay(true)
    } else {
      setStartDT(parsed.startDT)
      setEndDT(parsed.endDT)
      setAllDay(false)
    }

    if (parsed.matchedMemberIds.length > 0) {
      setSelectedMemberIds(parsed.matchedMemberIds)
    }

    if (parsed.matchedPlace) {
      setPlaceSelection({
        mode: 'existing',
        placeId: parsed.matchedPlace.id,
      })
    }

    // Trigger golden celebration flash & tactile tick
    setAiHighlight(true)
    navigator.vibrate?.([10, 30, 14])
    setTimeout(() => setAiHighlight(false), 1200)
  }, [contextDate, familyMembers, savedPlaces])

  const { listening, start: startDictation, stop: stopDictation, toggle: toggleDictation } = useFieldDictation({
    onText: (text) => {
      setTitle(text)
    },
    onComplete: (finalText) => {
      handleDictationComplete(finalText)
    },
  })

  // Focus title on mount & parse initialQuery if provided
  useEffect(() => {
    if (initialQuery && initialQuery.trim()) {
      handleDictationComplete(initialQuery)
    }
    const timer = setTimeout(() => {
      inputRef.current?.focus()
    }, 100)
    return () => clearTimeout(timer)
  }, [initialQuery, handleDictationComplete])

  // Date change handler (scoped specifically to this entry card)
  const handleDateChange = (newDate: Date) => {
    const currentStart = new Date(startDT)
    const currentEnd = new Date(endDT)

    const updatedStart = new Date(newDate)
    updatedStart.setHours(currentStart.getHours(), currentStart.getMinutes(), 0, 0)

    const duration = currentEnd.getTime() - currentStart.getTime()
    const updatedEnd = new Date(updatedStart.getTime() + (duration > 0 ? duration : 3600000))

    setStartDT(toLocalDT(updatedStart))
    setEndDT(toLocalDT(updatedEnd))
    setShowDatePicker(false)
  }

  // Time preset handlers
  const applyPresetTime = (hour: number, minute: number = 0) => {
    const base = new Date(startDT)
    const newStart = setMinutes(setHours(base, hour), minute)
    const newEnd = addHours(newStart, 1)
    setStartDT(toLocalDT(newStart))
    setEndDT(toLocalDT(newEnd))
    setAllDay(false)
  }

  const applyDuration = (durationMinutes: number) => {
    const baseStart = new Date(startDT)
    const newEnd = new Date(baseStart.getTime() + durationMinutes * 60 * 1000)
    setEndDT(toLocalDT(newEnd))
    setAllDay(false)
  }

  const toggleMember = (id: string) => {
    setSelectedMemberIds(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    )
  }

  // Handle Save
  const handleSave = async () => {
    if (!title.trim()) {
      inputRef.current?.focus()
      return
    }
    setSaveError('')
    setSaveSuccess('')
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

    // Location directory resolution
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
      if (!createPlaceError) {
        void qc.invalidateQueries({ queryKey: ['saved_places'] })
        resolvedLocationName = input.name
        resolvedAddress = [input.address, input.city, input.state, input.zip].filter(Boolean).join(', ') || null
        resolvedLat = input.lat ?? null
        resolvedLng = input.lng ?? null
      }
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
      record_kind: 'single',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).select('id').single()

    if (error) {
      setSaveError(`Could not create entry: ${error.message}`)
      setSaving(false)
      return
    }

    triggerGoogleEventSync(supabase, inserted.id)

    if (inserted && selectedMemberIds.length > 0) {
      await supabase.from('event_members').insert(
        selectedMemberIds.map((familyMemberId, index) => ({
          event_id: inserted.id,
          family_member_id: familyMemberId,
          role: index === 0 ? 'primary' : 'attendee',
          rsvp_status: 'accepted',
        })),
      )
    }

    await qc.invalidateQueries({ queryKey: ['events'] })
    navigator.vibrate?.([12, 40, 20])
    setSaving(false)
    setSaveSuccess('Saved.')
    onSaved?.(inserted.id)
    setTimeout(onClose, 350)
  }

  const currentDate = useMemo(() => {
    try {
      const d = new Date(startDT)
      return Number.isNaN(d.getTime()) ? contextDate : d
    } catch {
      return contextDate
    }
  }, [startDT, contextDate])

  const formattedDate = useMemo(() => {
    if (isToday(currentDate)) return 'Today'
    if (isTomorrow(currentDate)) return 'Tomorrow'
    return format(currentDate, 'EEEE, MMM d')
  }, [currentDate])

  const parsedStartTime = useMemo(() => {
    try {
      return format(new Date(startDT), 'h:mm a')
    } catch {
      return '9:00 AM'
    }
  }, [startDT])

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: mode === 'inline' ? 8 : -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'relative bg-casa-surface/95 backdrop-blur-md rounded-2xl border shadow-card transition-all select-none',
        aiHighlight
          ? 'border-casa-gold ring-2 ring-casa-gold/40 shadow-glow-gold'
          : 'border-casa-gold/40 hover:border-casa-gold/70',
        mode === 'inline' ? 'w-full p-4.5' : 'w-[23rem] sm:w-[26rem] p-5 shadow-modal z-50',
        className,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {/* ── Header: Context Date & Event/Reminder Switch ── */}
      <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-casa-divider/70">
        <div className="relative flex items-center min-w-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowDatePicker((prev) => !prev)}
            aria-label="Click to change entry date"
            className="flex items-center gap-1.5 px-2 py-1 -ml-1 h-auto min-h-0 rounded-xl bg-casa-sand/40 hover:bg-casa-sand border border-casa-border/60 hover:border-casa-gold/60 text-casa-navy hover:text-casa-gold transition-all cursor-pointer group select-none"
          >
            <div className="w-2.5 h-2.5 rounded-full bg-casa-gold shrink-0 animate-pulse" />
            <span className="font-display font-bold text-body tracking-tight truncate max-w-[130px] sm:max-w-[160px]">
              {formattedDate}
            </span>
            <ChevronDown size={13} className={cn('text-casa-muted group-hover:text-casa-navy transition-transform', showDatePicker && 'rotate-180')} />
          </Button>

          <span className="text-3xs uppercase font-bold tracking-wider text-casa-gold/90 bg-casa-gold/10 px-2 py-0.5 rounded-full ml-1.5 hidden sm:inline-block">
            ✦ Quick Add
          </span>

          {/* Date Picker Dropdown Popover */}
          <AnimatePresence>
            {showDatePicker && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setShowDatePicker(false)}
                />
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-0 top-full mt-1.5 z-40 p-3 rounded-2xl bg-casa-surface border border-casa-gold/50 shadow-modal w-64 space-y-2.5"
                >
                  <div className="text-3xs uppercase font-bold tracking-wider text-casa-muted flex items-center justify-between">
                    <span>Change Entry Date</span>
                  </div>

                  {/* 1-Tap Quick Date Chips */}
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { label: 'Today', date: new Date() },
                      { label: 'Tomorrow', date: addDays(new Date(), 1) },
                      { label: format(addDays(new Date(), 2), 'EEEE'), date: addDays(new Date(), 2) },
                      { label: format(addDays(new Date(), 3), 'EEEE'), date: addDays(new Date(), 3) },
                    ].map((preset) => {
                      const isSel = isSameDay(currentDate, preset.date)
                      return (
                        <Button
                          key={preset.label}
                          type="button"
                          size="sm"
                          variant={isSel ? 'primary' : 'secondary'}
                          onClick={() => handleDateChange(preset.date)}
                          className={cn(
                            'h-8 min-h-0 text-caption font-bold px-2 justify-center rounded-xl',
                            isSel && 'bg-casa-navy text-white'
                          )}
                        >
                          {preset.label}
                        </Button>
                      )
                    })}
                  </div>

                  {/* Custom Calendar Date Selector */}
                  <div className="pt-2 border-t border-casa-border/40 space-y-1">
                    <span className="text-3xs font-semibold text-casa-muted">Choose date:</span>
                    <input
                      type="date"
                      value={startDT.slice(0, 10)}
                      onChange={(e) => {
                        if (e.target.value) {
                          const [y, m, d] = e.target.value.split('-').map(Number)
                          handleDateChange(new Date(y, m - 1, d))
                        }
                      }}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-casa-border bg-white text-caption font-bold text-casa-text focus:border-casa-gold outline-hidden"
                    />
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        {/* Tactile Event / Reminder Segmented Capsule */}
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
            leadingIcon={<Bell size={12} />}
            className={cn(
              'px-3 py-1 min-h-[36px] text-caption font-bold rounded-lg transition-all',
              eventType === 'reminder' ? 'bg-casa-gold text-casa-navy' : 'text-casa-muted hover:text-casa-navy',
            )}
          >
            Reminder
          </Button>
        </div>
      </div>

      {/* ── Title Input & Press-and-Hold Jewel Voice Mic ── */}
      <div className="space-y-3">
        <div className="relative flex items-center">
          <input
            ref={inputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSave()
              if (e.key === 'Escape') onClose()
            }}
            placeholder={
              listening
                ? 'Listening... speak naturally...'
                : eventType === 'reminder'
                  ? 'Remind to... or hold mic'
                  : "What's happening? or hold mic"
            }
            disabled={saving}
            className={cn(
              'w-full pl-3.5 pr-14 py-2.5 min-h-[44px] bg-casa-sand/50 border rounded-xl font-body text-body text-casa-text placeholder:text-casa-muted/70 transition-all outline-hidden',
              listening
                ? 'border-casa-gold ring-2 ring-casa-gold/30 bg-casa-gold/5'
                : 'border-casa-border/80 focus:border-casa-gold focus:bg-white',
            )}
          />

          {/* Press-and-Hold / Tap-to-Dictate Jewel Mic Button (44px target) */}
          <div className="absolute right-1.5 flex items-center">
            <IconButton
              aria-label="Voice input"
              icon={<Mic size={18} className={cn(listening && 'stroke-[2.5]')} />}
              onPointerDown={() => {
                isHoldingTimerRef.current = setTimeout(() => {
                  isMicHoldingRef.current = true
                  navigator.vibrate?.(15)
                  void startDictation(title)
                }, 500)
              }}
              onPointerUp={() => {
                if (isHoldingTimerRef.current) {
                  clearTimeout(isHoldingTimerRef.current)
                  isHoldingTimerRef.current = null
                }
                if (isMicHoldingRef.current) {
                  isMicHoldingRef.current = false
                  stopDictation()
                }
              }}
              onPointerLeave={() => {
                if (isHoldingTimerRef.current) {
                  clearTimeout(isHoldingTimerRef.current)
                  isHoldingTimerRef.current = null
                }
                if (isMicHoldingRef.current) {
                  isMicHoldingRef.current = false
                  stopDictation()
                }
              }}
              onClick={() => {
                if (!isMicHoldingRef.current) {
                  toggleDictation(title)
                }
              }}
              className={cn(
                'min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center transition-all select-none active:scale-95',
                listening
                  ? 'bg-casa-gold text-casa-navy shadow-glow-gold animate-bounce'
                  : 'bg-casa-navy/10 hover:bg-casa-gold/20 text-casa-navy hover:text-casa-gold border border-casa-gold/30',
              )}
            />
          </div>
        </div>

        {/* Live Audio Listening Waveform Shimmer */}
        <AnimatePresence>
          {listening && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-casa-gold/15 border border-casa-gold/40 text-caption font-bold text-casa-navy"
            >
              <Sparkles size={14} className="text-casa-gold animate-spin" />
              <span>Voice AI active — release or pause to auto-fill</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── 1-Tap Time Preset Row (52px Touch-Optimized) ── */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-caption font-bold text-casa-muted">
            <span className="flex items-center gap-1.5">
              <Clock size={13} className="text-casa-gold" />
              {allDay ? 'All Day' : `Starts at ${parsedStartTime}`}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowAdvancedTime(!showAdvancedTime)}
              className="p-0 min-h-0 text-3xs uppercase font-bold text-casa-navy hover:text-casa-gold flex items-center gap-0.5"
            >
              <span>{showAdvancedTime ? 'Presets' : 'Custom Time'}</span>
              {showAdvancedTime ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </Button>
          </div>

          {!showAdvancedTime ? (
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { label: 'Morning', sub: '9:00 AM', h: 9, m: 0 },
                { label: 'Midday', sub: '12:00 PM', h: 12, m: 0 },
                { label: 'Afternoon', sub: '3:30 PM', h: 15, m: 30 },
                { label: 'Evening', sub: '6:30 PM', h: 18, m: 30 },
              ].map((preset) => {
                const isSelected = !allDay && new Date(startDT).getHours() === preset.h && new Date(startDT).getMinutes() === preset.m
                return (
                  <Button
                    key={preset.label}
                    type="button"
                    variant={isSelected ? 'primary' : 'secondary'}
                    onClick={() => applyPresetTime(preset.h, preset.m)}
                    className={cn(
                      'min-h-[48px] px-2 py-1.5 rounded-xl text-center transition-all cursor-pointer active:scale-95 flex flex-col items-center justify-center',
                      isSelected
                        ? 'bg-casa-navy text-white border-casa-navy shadow-xs'
                        : 'bg-casa-sand/60 hover:bg-casa-sand text-casa-text border-casa-border/70',
                    )}
                  >
                    <div className="text-caption font-bold leading-tight">{preset.label}</div>
                    <div className={cn('text-3xs leading-tight', isSelected ? 'text-casa-gold' : 'text-casa-muted')}>
                      {preset.sub}
                    </div>
                  </Button>
                )
              })}
            </div>
          ) : (
            /* Custom Time / Duration Inputs */
            <div className="p-2.5 rounded-xl bg-casa-sand/60 border border-casa-border/80 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <span className="text-3xs text-casa-muted uppercase font-bold block mb-0.5">Date</span>
                  <input
                    type="date"
                    value={startDT.slice(0, 10)}
                    onChange={(e) => {
                      if (e.target.value) {
                        const [y, m, d] = e.target.value.split('-').map(Number)
                        handleDateChange(new Date(y, m - 1, d))
                      }
                    }}
                    className="w-full px-2 py-1.5 rounded-lg border border-casa-border bg-white text-caption font-bold text-casa-text"
                  />
                </div>
                <div>
                  <span className="text-3xs text-casa-muted uppercase font-bold block mb-0.5">Start</span>
                  <input
                    type="time"
                    value={startDT.slice(11, 16)}
                    onChange={(e) => {
                      const [h, m] = e.target.value.split(':').map(Number)
                      applyPresetTime(h, m)
                    }}
                    className="w-full px-2 py-1.5 rounded-lg border border-casa-border bg-white text-caption font-bold text-casa-text"
                  />
                </div>
                <div>
                  <span className="text-3xs text-casa-muted uppercase font-bold block mb-0.5">End</span>
                  <input
                    type="time"
                    value={endDT.slice(11, 16)}
                    onChange={(e) => {
                      const [h, m] = e.target.value.split(':').map(Number)
                      const baseEnd = new Date(endDT)
                      setEndDT(toLocalDT(setMinutes(setHours(baseEnd, h), m)))
                    }}
                    className="w-full px-2 py-1.5 rounded-lg border border-casa-border bg-white text-caption font-bold text-casa-text"
                  />
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {[
                  { label: '30m', min: 30 },
                  { label: '45m', min: 45 },
                  { label: '1h', min: 60 },
                  { label: '1.5h', min: 90 },
                  { label: '2h', min: 120 },
                ].map((dur) => (
                  <Chip
                    key={dur.label}
                    size="sm"
                    onClick={() => applyDuration(dur.min)}
                  >
                    {dur.label}
                  </Chip>
                ))}
                <Chip
                  size="sm"
                  selected={allDay}
                  onClick={() => setAllDay(!allDay)}
                >
                  All Day
                </Chip>
              </div>
            </div>
          )}
        </div>

        {/* ── Who's Going (Attendee Avatar Jewels) ── */}
        <div className="space-y-1.5">
          <div className="text-caption font-bold text-casa-muted flex items-center gap-1.5">
            <Users size={13} className="text-casa-gold" />
            <span>Family & Attendees</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {familyMembers.map((member: FamilyMember) => {
              const isSelected = selectedMemberIds.includes(member.id)
              return (
                <Chip
                  key={member.id}
                  size="md"
                  selected={isSelected}
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

        {/* ── Venue / Location (Saved Place Linker) ── */}
        {eventType === 'event' && (
          <div className="space-y-1">
            <DirectoryPlaceInput
              label="Where"
              placeholder="Add location or saved venue"
              onChange={setPlaceSelection}
              onClear={() => setPlaceSelection(null)}
            />
          </div>
        )}

        {/* Optional Notes Toggle */}
        <div className="pt-1">
          {!showNotes ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowNotes(true)}
              leadingIcon={<Plus size={10} />}
              className="p-0 min-h-0 text-3xs uppercase font-bold tracking-wider text-casa-muted hover:text-casa-navy"
            >
              Add Notes / Details
            </Button>
          ) : (
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes, gate code, reminders..."
              rows={2}
              className="w-full p-2.5 bg-casa-sand/50 border border-casa-border/80 rounded-xl font-body text-caption text-casa-text placeholder:text-casa-muted outline-hidden focus:border-casa-gold focus:bg-white"
            />
          )}
        </div>
      </div>

      {/* Error & Status Message */}
      {saveError && (
        <div className="mt-3 p-2 rounded-lg bg-rose-50 border border-rose-200 text-caption text-rose-700">
          {saveError}
        </div>
      )}

      {/* ── Action Tray ── */}
      <div className="flex items-center justify-between gap-3 mt-4 pt-3 border-t border-casa-divider/70">
        <Button
          type="button"
          variant="ghost"
          onClick={onClose}
          disabled={saving}
          className="text-caption font-bold text-casa-muted hover:text-casa-navy"
        >
          Cancel
        </Button>

        <Button
          type="button"
          variant="primary"
          onClick={() => void handleSave()}
          disabled={saving || !title.trim()}
          leadingIcon={saveSuccess ? <CheckCircle2 size={15} /> : <Sparkles size={14} />}
          className={cn(
            'px-5 text-caption font-bold',
            saveSuccess && 'bg-casa-gold text-casa-navy',
          )}
        >
          {saving ? 'Saving...' : saveSuccess ? 'Saved!' : 'Save Entry'}
        </Button>
      </div>
    </motion.div>
  )
}
