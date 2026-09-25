import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Check, ChevronLeft, Bookmark, Search, X } from 'lucide-react'
import type { EventWithDetails } from '../hooks/useCalendarEvents'
import { useSavedPlaces, useSavePlace } from '../hooks/useSavedPlaces'
import { clearReminderDueDate, reconcileTransportationLegTimes, toggleEventAttendee, updateEventSchedule, updateEventTitle, updateEventVenue } from '../lib/eventMutations'
import { saveEventTransportationOverride } from '../lib/eventPlanOverrides'
import { syncTransportationAttendees } from '../lib/eventTransportation'
import { supabase } from '../lib/supabase'
import type { SavedPlaceCategory } from '../types'
import { DEFAULT_HOUSEHOLD_COORDINATES } from '../utils/geoDistance'
import {
  canClearPlace, consequenceLine, dayChips, draftChanges, draftFromEvent, isReminder, previewEvent, savePlanFor,
  setAllDay, setAnytime, setDay, setDriver, setGoing, setPlace, setTitle, stepEnd, stepStart, withDriver,
  type DraftPlace, type EditDraft, type EditableEvent,
} from './editing'
import type { DayPlan, WallEvent, WallMember } from './engine/types'
import { clockTime, placeName } from './header'
import { pigmentStyleFor, selectLaneMembers } from './lanes'
import { driverChoices } from './people'
import type { WallChecklistItem } from './packing'
import { SAVE_PLACE_KINDS, placeFromSaved, placeFromSearch, yourPlaces, type PlaceSearchResult } from './places'
import { toggleChecklistItem } from './useWallChecklist'
import WallKeyboard from './WallKeyboard'

// The event sheet (boards 03a, 03d, 03e, 03f): details, then Edit turns the same
// sheet into a form; the place picker and the wall keyboard live inside it.

const DETAILS_IDLE_MS = 2 * 60_000
const EDIT_IDLE_MS = 5 * 60_000
const HOUR_CHIPS = Array.from({ length: 17 }, (_, i) => i + 6) // 6 AM – 10 PM

type Mode = 'details' | 'edit' | 'place'
type KeyboardTarget = 'title' | 'search' | 'saveName' | null

export interface WallEventSheetProps {
  event: EditableEvent
  members: WallMember[]
  now: Date
  /** Every cached event, so a preview can rebuild the day with this one changed. */
  allEvents: WallEvent[]
  buildPlanFor: (date: Date, events: WallEvent[]) => DayPlan
  /** Pigment per member id (the Score's colors). */
  pigmentOf: (memberId: string) => number | null
  checklist: WallChecklistItem[]
  onClose: () => void
  /** The event as the draft would save it (null when nothing changed), for the Score behind the sheet. */
  onPreview: (event: EditableEvent | null) => void
}

const midnight = (d: Date) => {
  const day = new Date(d)
  day.setHours(0, 0, 0, 0)
  return day
}
const fmtMinutes = (m: number) => {
  const d = new Date(2000, 0, 1, Math.floor(m / 60) % 24, m % 60)
  return `${clockTime(d)} ${m % 1440 < 720 ? 'AM' : 'PM'}`
}

/** The street part of a place's address, without repeating its name ("Ferrin Park Field 1, 11921 …" → "11921 …"). */
function placeAddressLine(place: DraftPlace): string | null {
  const parts = place.address.split(',').map((p) => p.trim()).filter(Boolean)
  const name = (place.name || '').split(',')[0].trim().toLowerCase()
  const rest = parts[0]?.toLowerCase() === name ? parts.slice(1) : parts
  return rest.slice(0, 2).join(', ') || null
}

function isRepeating(event: EditableEvent): boolean {
  const e = event as EditableEvent & { rrule?: string | null; recurrence_master_id?: string | null; series_id?: string | null; record_kind?: string | null }
  return Boolean(e.rrule || e.recurrence_master_id || e.series_id || e.record_kind === 'occurrence')
}

function whenLabel(event: EditableEvent, now: Date): string {
  if (isReminder(event) && event.has_due_date === false) return 'ANYTIME'
  const start = new Date(event.start_time)
  const end = new Date(event.end_time)
  const days = Math.round((midnight(start).getTime() - midnight(now).getTime()) / 86_400_000)
  const day = days === 0 ? 'TODAY' : days === 1 ? 'TOMORROW' : start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()
  if (event.all_day) return `${day} · ALL DAY`
  const time = (d: Date) => `${clockTime(d)} ${d.getHours() < 12 ? 'AM' : 'PM'}`
  return isReminder(event) ? `${day} · ${time(start)}` : `${day} · ${time(start)} – ${time(end)}`
}

export default function WallEventSheet(props: WallEventSheetProps) {
  const { event, members, now, allEvents, buildPlanFor, pigmentOf, checklist, onClose, onPreview } = props
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<Mode>('details')
  const [tab, setTab] = useState<'when' | 'who'>('when')
  const [draft, setDraft] = useState<EditDraft>(() => draftFromEvent(event))
  const [keyboard, setKeyboard] = useState<KeyboardTarget>(null)
  const [hourPicker, setHourPicker] = useState(false)
  const [otherDates, setOtherDates] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lastTouch = useRef(Date.now())

  // ── Place picker state ─────────────────────────────────────────────────
  const [placeQuery, setPlaceQuery] = useState('')
  const [results, setResults] = useState<PlaceSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [saveFor, setSaveFor] = useState<PlaceSearchResult | null>(null)
  const [saveName, setSaveName] = useState('')
  const [saveKind, setSaveKind] = useState<SavedPlaceCategory>('other')
  const [resolving, setResolving] = useState(false)
  const { data: savedPlaces = [] } = useSavedPlaces()
  const savePlace = useSavePlace()
  const mine = yourPlaces(savedPlaces, placeQuery)

  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name ?? null
  const eventDay = midnight(new Date(event.start_time))
  const before = useMemo(() => buildPlanFor(eventDay, allEvents), [buildPlanFor, eventDay.getTime(), allEvents]) // eslint-disable-line react-hooks/exhaustive-deps
  const trip = before.trips.find((t) => t.sourceId === event.id) ?? null
  // Everyone with a lane, plus anyone already going (a sitter switched off still shows if she's on this one).
  const goingCandidates = useMemo(() => {
    const going = draftFromEvent(event).going
    return selectLaneMembers(members).concat(members.filter((m) => going.includes(m.id) && !selectLaneMembers(members).includes(m)))
  }, [members, event])
  const changes = useMemo(() => draftChanges(event, draft, members), [event, draft, members])
  const preview = useMemo(() => (changes.length > 0 ? previewEvent(event, draft) : null), [changes, event, draft])
  const after = useMemo(() => {
    if (!preview) return null
    return buildPlanFor(midnight(new Date(preview.start_time)), allEvents.map((e) => (e.id === event.id ? preview : e)))
  }, [preview, allEvents, buildPlanFor, event.id])
  const consequence = after ? consequenceLine(before, after, event.id, members, { before: draftFromEvent(event).going, after: draft.going }) : null
  const wasOf = (field: string) => changes.find((c) => c.field === field)?.was ?? null

  useEffect(() => onPreview(mode === 'details' ? null : preview), [preview, mode]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onPreview(null), []) // eslint-disable-line react-hooks/exhaustive-deps

  // Walk away and it closes: 2 minutes on details, 5 while editing (unsaved changes are dropped).
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (Date.now() - lastTouch.current > (mode === 'details' ? DETAILS_IDLE_MS : EDIT_IDLE_MS)) onClose()
    }, 10_000)
    return () => window.clearInterval(timer)
  }, [mode, onClose])

  const touch = () => {
    lastTouch.current = Date.now()
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const full = event as unknown as EventWithDetails
      let current = full
      for (const step of savePlanFor(event, draft)) {
        if (step.kind === 'title') await updateEventTitle(supabase, queryClient, event.id, step.title)
        if (step.kind === 'people') {
          // One member at a time, each from the event as the previous step left it.
          for (const id of [...step.add, ...step.remove]) {
            const adding = step.add.includes(id)
            await toggleEventAttendee(supabase, queryClient, current, id, adding, members as never)
            const person = members.find((m) => m.id === id)
            const hasRow = current.members.some((m) => (m.family_member?.id ?? m.id) === id)
            const nextMembers = adding
              ? hasRow
                ? current.members.map((m) => ((m.family_member?.id ?? m.id) === id ? { ...m, role: 'attendee' } : m)) // a driver row becomes "going"
                : [...current.members, { id: crypto.randomUUID(), role: 'attendee', family_member: person as never }]
              : current.members.filter((m) => (m.family_member?.id ?? m.id) !== id)
            const plan = current.plan_override?.transportation_plan
            current = {
              ...current,
              members: nextMembers,
              plan_override: plan && current.plan_override
                ? { ...current.plan_override, transportation_plan: syncTransportationAttendees(plan, nextMembers.map((m) => m.family_member?.name ?? '').filter(Boolean)) }
                : current.plan_override,
            }
          }
        }
        if (step.kind === 'driver') {
          const name = members.find((m) => m.id === step.driverId)?.name ?? ''
          const plan = withDriver(current as never, current.plan_override?.transportation_plan, step.driverId, name)
          await saveEventTransportationOverride({ supabase, queryClient, event: current, transportationPlan: plan, waits: current.plan_override?.waits, modeOverride: current.plan_override?.mode_override })
          current = { ...current, plan_override: { ...(current.plan_override ?? ({} as never)), transportation_plan: plan } }
        }
        if (step.kind === 'clearDueDate') await clearReminderDueDate(supabase, queryClient, event.id)
        if (step.kind === 'schedule') {
          await updateEventSchedule(supabase, queryClient, current, step.start, step.end, step.allDay)
          const plan = current.plan_override?.transportation_plan
          current = {
            ...current,
            start_time: step.start.toISOString(),
            end_time: step.end.toISOString(),
            all_day: step.allDay,
            plan_override: plan && current.plan_override && !step.allDay
              ? { ...current.plan_override, transportation_plan: reconcileTransportationLegTimes(plan, step.start, step.end) }
              : current.plan_override,
          }
        }
        if (step.kind === 'venue') await updateEventVenue(supabase, queryClient, current, step.venue, { familyMembers: members as never })
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Saving didn’t work. Nothing was changed on the wall.')
      setSaving(false)
    }
  }

  const keyboardValue = keyboard === 'title' ? draft.title : keyboard === 'search' ? placeQuery : keyboard === 'saveName' ? saveName : ''
  const onKeyboardChange = (value: string) => {
    touch()
    if (keyboard === 'title') setDraft((d) => setTitle(d, value))
    if (keyboard === 'search') setPlaceQuery(value)
    if (keyboard === 'saveName') setSaveName(value)
  }


  useEffect(() => {
    if (mode !== 'place' || placeQuery.trim().length < 3) {
      setResults([])
      return
    }
    let cancelled = false
    const timer = window.setTimeout(async () => {
      setSearching(true)
      const { data } = await supabase.functions.invoke('place-search', {
        body: { query: placeQuery.trim(), lat: DEFAULT_HOUSEHOLD_COORDINATES.lat, lng: DEFAULT_HOUSEHOLD_COORDINATES.lng },
      })
      if (cancelled) return
      setSearching(false)
      const places = (data as { places?: PlaceSearchResult[] } | null)?.places
      setResults(Array.isArray(places) ? places.slice(0, 3) : [])
    }, 350)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [placeQuery, mode])

  /** Use a place: work out the drive from home (same lookup the app uses), then back to the form. */
  const choosePlace = async (place: { name: string; address: string }, knownDrive?: number | null) => {
    touch()
    setKeyboard(null)
    let driveMinutes: number | null = knownDrive ?? null
    if (place.address && knownDrive === undefined) {
      setResolving(true)
      const start = new Date(midnight(draft.day).getTime() + draft.startMin * 60_000)
      const { data } = await supabase.functions.invoke('route-eta', {
        body: { destination: place.address, arrival_time: start.toISOString(), buffer_mins: 5 },
      })
      setResolving(false)
      const eta = data as { found?: boolean; drive_time_mins?: number } | null
      driveMinutes = eta?.found && typeof eta.drive_time_mins === 'number' ? eta.drive_time_mins : null
    }
    const next: DraftPlace = { name: place.name, address: place.address, driveMinutes }
    setDraft((d) => setPlace(d, next))
    setSaveFor(null)
    setMode('edit')
  }

  const saveAndUse = async () => {
    if (!saveFor) return
    touch()
    try {
      await savePlace.mutateAsync({
        name: saveName.trim() || saveFor.name,
        address: saveFor.street || saveFor.address,
        city: saveFor.city ?? null,
        state: saveFor.state ?? null,
        zip: saveFor.zip ?? null,
        lat: saveFor.lat,
        lng: saveFor.lng,
        phone: saveFor.phone ?? null,
        category: saveKind,
      })
    } catch {
      // Saving the place failed; still use it for this event.
    }
    await choosePlace({ name: saveName.trim() || saveFor.name, address: saveFor.address })
  }

  // ── Render ─────────────────────────────────────────────────────────────
  const eyebrow = 'text-wall-label font-bold tracking-[0.2em]'
  const pill = 'h-[56px] shrink-0 rounded-full border border-wall-rule bg-transparent px-[22px] text-wall-detail font-semibold text-wall-ink'
  const darkPill = 'h-[60px] shrink-0 rounded-full border-0 bg-wall-ink px-[32px] text-wall-body font-semibold text-wall-on-pigment'
  const was = (field: string) => {
    const w = wasOf(field)
    return w ? <span className="text-wall-label font-semibold text-wall-brass-ink">was {w}</span> : null
  }
  const [head, ...rest] = event.title.split(':')
  const own = checklist.filter((item) => item.event_id === event.id).sort((a, b) => a.sort_order - b.sort_order)
  const reminder = isReminder(event)

  return (
    <div
      className="absolute inset-0 z-10"
      onClick={(e) => {
        e.stopPropagation()
        if (mode === 'details') onClose()
      }}
      onPointerDown={touch}
    >
      <div className="pointer-events-none absolute inset-0 bg-wall-ink/20" />
      <section
        aria-label={`${event.title} details`}
        className="absolute right-0 top-0 flex h-[1080px] w-[780px] flex-col gap-[22px] rounded-l-[28px] bg-wall-on-pigment px-[56px] py-[40px] font-body text-wall-ink shadow-[-24px_0_60px_rgba(38,34,29,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        {mode === 'details' && (
          <>
            <div className="flex items-start justify-between gap-[24px]">
              <div className="flex min-w-0 flex-col gap-[10px]">
                <div className={`${eyebrow} text-wall-brass-ink`}>{whenLabel(event, now)}</div>
                <div className="font-display text-wall-move font-semibold leading-[1.02]">
                  {head.trim()}
                  {rest.length > 0 && <div className="mt-[4px] text-wall-date font-medium text-wall-ink-2">{rest.join(':').trim()}</div>}
                </div>
              </div>
              <button type="button" aria-label="Close" onClick={onClose} className="flex h-[56px] w-[56px] shrink-0 items-center justify-center rounded-full border border-wall-rule bg-transparent p-0 text-wall-ink">
                <X size={22} />
              </button>
            </div>

            <People event={event} trip={trip} nameOf={nameOf} pigmentOf={pigmentOf} />

            {trip ? (
              <div className="flex flex-col gap-[12px]">
                <div className={`${eyebrow} text-wall-ink-2`}>THE TRIP</div>
                <div className="grid grid-cols-4 text-wall-detail text-wall-ink-2">
                  {[
                    [trip.leaveAt, 'leave home'],
                    [trip.arriveAt, 'arrive'],
                    [new Date(event.end_time), 'ends'],
                    [trip.homeAt, 'home'],
                  ].map(([d, label]) => (
                    <div key={label as string}>
                      <div className="font-display text-wall-date font-bold text-wall-ink">{d ? clockTime(d as Date) : '—'}</div>
                      {label as string}
                    </div>
                  ))}
                </div>
                <div className="text-wall-body">
                  {placeName(trip)}
                  {trip.driveMinutes != null && ` · ${trip.driveMinutes} min drive`}
                  {trip.weather && <div className="text-wall-detail text-wall-ink-2">{trip.weather}</div>}
                </div>
              </div>
            ) : (
              (event.location_name || event.address) && (
                <div className="flex flex-col gap-[8px]">
                  <div className={`${eyebrow} text-wall-ink-2`}>PLACE</div>
                  <div className="text-wall-body">{event.location_name || event.address}</div>
                </div>
              )
            )}

            {own.length > 0 && (
              <div className="flex flex-col">
                <div className={`${eyebrow} mb-[6px] text-wall-ink-2`}>
                  PACK · {own.filter((i) => i.checked).length} OF {own.length}
                </div>
                {own.slice(0, 5).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => void toggleChecklistItem(queryClient, item.id, !item.checked)}
                    className="flex h-[56px] items-center gap-[16px] border-0 border-t border-solid border-wall-rule bg-transparent p-0 text-left"
                  >
                    <span className={`flex h-[26px] w-[26px] items-center justify-center rounded-[5px] border-2 ${item.checked ? 'border-wall-brass-ink bg-wall-brass-ink text-wall-on-pigment' : 'border-wall-ink-2'}`}>
                      {item.checked && <Check size={18} strokeWidth={3} />}
                    </span>
                    <span className={`text-wall-body ${item.checked ? 'text-wall-ink-2 line-through' : 'text-wall-ink'}`}>{item.label}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-auto flex items-center gap-[14px]">
              {isRepeating(event) ? (
                <span className="text-wall-detail text-wall-ink-2">This repeats. Change it from Calendar in the menu for now.</span>
              ) : (
                <button type="button" className={darkPill} onClick={() => { setDraft(draftFromEvent(event)); setMode('edit') }}>
                  Edit
                </button>
              )}
            </div>
          </>
        )}

        {mode === 'edit' && (
          <>
            <div className="flex items-center justify-between">
              <div className={`${eyebrow} text-wall-brass-ink`}>{reminder ? 'EDITING · REMINDER' : 'EDITING'}</div>
              <div className="flex gap-[8px]">
                {(['when', 'who'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => { setKeyboard(null); setTab(t) }}
                    className={`h-[52px] rounded-full px-[22px] text-wall-detail font-semibold ${tab === t ? 'border-0 bg-wall-ink text-wall-on-pigment' : 'border border-solid border-wall-rule bg-transparent text-wall-ink'}`}
                  >
                    {t === 'when' ? 'When & where' : 'Who'}
                    {(t === 'who' ? ['going', 'driver'] : ['title', 'day', 'start', 'end', 'allDay', 'anytime', 'place']).some((f) => wasOf(f)) && ' •'}
                  </button>
                ))}
              </div>
            </div>

            {tab === 'when' && (
            <>
            <div className="flex flex-col gap-[8px]">
              <span className={`${eyebrow} text-wall-ink-2`}>TITLE</span>
              <button
                type="button"
                onClick={() => setKeyboard('title')}
                className={`flex min-h-[72px] items-center rounded-[14px] bg-wall-ground px-[20px] text-left font-display text-wall-date font-semibold text-wall-ink ${keyboard === 'title' ? 'border-[3px] border-solid border-wall-brass-ink' : 'border border-solid border-wall-rule'}`}
              >
                {/* While typing, wrap so the end (where you're typing) is always visible. */}
                <span className={keyboard === 'title' ? 'min-w-0 break-words py-[8px]' : 'truncate'}>
                  {draft.title || ' '}
                  {keyboard === 'title' && <span aria-hidden="true" className="ml-[3px] inline-block h-[32px] w-[3px] translate-y-[5px] bg-wall-ink" />}
                </span>
              </button>
              {was('title')}
            </div>

            {keyboard !== 'title' && (
              <>
                {!(reminder && draft.anytime) && (
                  <div className="flex flex-col gap-[10px]">
                    <div className="flex items-center justify-between">
                      <span className={`${eyebrow} text-wall-ink-2`}>DAY</span>
                      {was('day')}
                    </div>
                    <div className="flex gap-[8px]">
                      {dayChips(now, draft.day).map((chip) => (
                        <button
                          key={chip.date.getTime()}
                          type="button"
                          onClick={() => { touch(); setDraft((d) => setDay(d, chip.date)); setOtherDates(false) }}
                          className={`flex h-[76px] flex-1 flex-col items-center justify-center gap-[2px] rounded-[14px] ${chip.selected ? 'border-0 bg-wall-ink text-wall-on-pigment' : 'border border-solid border-wall-rule bg-transparent text-wall-ink'}`}
                        >
                          <span className={`text-wall-label font-bold ${chip.selected ? 'text-wall-brass' : 'text-wall-ink-2'}`}>{chip.weekday}</span>
                          <span className="font-display text-wall-heading font-bold">{chip.date.getDate()}</span>
                        </button>
                      ))}
                      <button type="button" onClick={() => setOtherDates((o) => !o)} className="flex h-[76px] flex-1 items-center justify-center rounded-[14px] border border-solid border-wall-rule bg-transparent text-wall-label font-semibold text-wall-ink">
                        Other
                      </button>
                    </div>
                    {otherDates && (
                      <div className="grid grid-cols-7 gap-[6px]">
                        {Array.from({ length: 35 }, (_, i) => {
                          const date = midnight(now)
                          date.setDate(date.getDate() + 6 + i)
                          return (
                            <button key={i} type="button" onClick={() => { setDraft((d) => setDay(d, date)); setOtherDates(false) }} className="h-[48px] rounded-[10px] border border-solid border-wall-rule bg-transparent text-wall-label font-semibold text-wall-ink">
                              {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex flex-col gap-[12px]">
                  <div className="flex items-center justify-between">
                    <span className={`${eyebrow} text-wall-ink-2`}>TIME</span>
                    <label className="flex items-center gap-[12px] text-wall-detail font-semibold">
                      <input
                        type="checkbox"
                        className="h-[26px] w-[26px] accent-wall-ink"
                        checked={reminder ? draft.anytime : draft.allDay}
                        onChange={(e) => { touch(); setDraft((d) => (reminder ? setAnytime(d, e.target.checked) : setAllDay(d, e.target.checked))) }}
                      />
                      {reminder ? 'Anytime' : 'All day'}
                    </label>
                  </div>
                  {!(reminder ? draft.anytime : draft.allDay) && (
                    <>
                      <TimeRow label={reminder ? 'At' : 'Starts'} minutes={draft.startMin} was={was('start')} onStep={(delta) => { touch(); setDraft((d) => stepStart(d, delta)) }} onTap={() => setHourPicker((h) => !h)} />
                      {hourPicker && (
                        <div className="grid grid-cols-9 gap-[6px]">
                          {HOUR_CHIPS.map((h) => (
                            <button key={h} type="button" onClick={() => { setDraft((d) => stepStart(d, h * 60 + (d.startMin % 60) - d.startMin)); setHourPicker(false) }} className="h-[48px] rounded-[10px] border border-solid border-wall-rule bg-transparent text-wall-label font-semibold text-wall-ink">
                              {h % 12 === 0 ? 12 : h % 12}{h < 12 ? 'a' : 'p'}
                            </button>
                          ))}
                        </div>
                      )}
                      {!reminder && <TimeRow label="Ends" minutes={draft.endMin} was={was('end')} onStep={(delta) => { touch(); setDraft((d) => stepEnd(d, delta)) }} />}
                    </>
                  )}
                  {was('allDay') ?? was('anytime')}
                </div>

                <div className="flex flex-col gap-[10px]">
                  <div className="flex items-center justify-between">
                    <span className={`${eyebrow} text-wall-ink-2`}>PLACE</span>
                    {was('place')}
                  </div>
                  <div className="flex items-center gap-[14px]">
                    <div className="flex min-h-[72px] min-w-0 flex-1 flex-col justify-center rounded-[14px] border border-solid border-wall-rule bg-wall-ground px-[20px] py-[8px]">
                      <span className="truncate font-display text-wall-heading font-bold">{(draft.place.name || draft.place.address).split(',')[0].trim() || 'No place'}</span>
                      <span className="truncate text-wall-label text-wall-ink-2">
                        {resolving
                          ? 'Working out the drive…'
                          : [placeAddressLine(draft.place), draft.place.driveMinutes ? `${draft.place.driveMinutes} min drive` : null].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                    <button type="button" className={pill} onClick={() => { setPlaceQuery(''); setMode('place') }}>
                      Change
                    </button>
                  </div>
                </div>

                {changes.length > 0 && (
                  <div className="rounded-[16px] bg-wall-brass/15 px-[22px] py-[16px] text-wall-body">
                    <b>What changes: </b>
                    {consequence ?? 'Nothing else on the wall moves.'}
                  </div>
                )}
                {error && <div className="text-wall-body font-semibold text-wall-rust">{error}</div>}
              </>
            )}
            </>
            )}

            {tab === 'who' && (
              <>
                <div className="flex flex-col gap-[12px]">
                  <div className="flex items-baseline justify-between">
                    <span className={`${eyebrow} text-wall-ink-2`}>WHO'S GOING</span>
                    {was('going')}
                  </div>
                  <div className="grid grid-cols-3 gap-[12px]">
                    {goingCandidates.map((m) => {
                      const on = draft.going.includes(m.id)
                      const wasOn = draftFromEvent(event).going.includes(m.id)
                      const pigment = pigmentOf(m.id)
                      return (
                        <button
                          key={m.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => { touch(); setDraft((d) => setGoing(d, on ? d.going.filter((id) => id !== m.id) : [...d.going, m.id])) }}
                          className={`flex h-[72px] items-center gap-[14px] rounded-[16px] px-[16px] text-left ${on ? 'border-0 bg-wall-ink text-wall-on-pigment' : 'border border-solid border-wall-rule bg-transparent text-wall-ink-2'} ${on !== wasOn ? 'outline-2 outline-solid outline-offset-2 outline-wall-brass-ink' : ''}`}
                        >
                          <span
                            aria-hidden="true"
                            className={`flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full font-display text-wall-heading font-bold ${on && pigment != null ? `text-wall-on-pigment ${pigmentStyleFor(pigment).solid}` : 'border-2 border-solid border-wall-rule'}`}
                          >
                            {m.name.charAt(0)}
                          </span>
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate text-wall-body font-semibold">{m.name}</span>
                            {on !== wasOn && <span className="text-wall-label text-wall-brass">{on ? 'added' : 'removed'}</span>}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {trip && (
                  <div className="flex flex-col gap-[12px]">
                    <div className="flex items-baseline justify-between">
                      <span className={`${eyebrow} text-wall-ink-2`}>
                        WHO DRIVES{trip.leaveAt && trip.homeAt ? ` · ${clockTime(trip.leaveAt)} – ${clockTime(trip.homeAt)}` : ''}
                      </span>
                      {was('driver')}
                    </div>
                    <div className="grid grid-cols-2 gap-[12px]">
                      {[...driverChoices(before, members, trip, event.id), { memberId: null, name: 'Nobody yet', note: '' }].map((choice) => {
                        const chosen = draft.driverId === choice.memberId
                        const pigment = choice.memberId ? pigmentOf(choice.memberId) : null
                        return (
                          <button
                            key={choice.memberId ?? 'nobody'}
                            type="button"
                            aria-pressed={chosen}
                            onClick={() => { touch(); setDraft((d) => setDriver(d, choice.memberId)) }}
                            className={`flex h-[80px] items-center gap-[14px] rounded-[16px] px-[18px] text-left ${chosen ? 'border-0 bg-wall-ink text-wall-on-pigment' : choice.memberId ? 'border border-solid border-wall-rule bg-transparent text-wall-ink' : 'border border-dashed border-wall-rule bg-transparent text-wall-ink-2'}`}
                          >
                            <span
                              aria-hidden="true"
                              className={`flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full font-display text-wall-heading font-bold ${pigment != null ? `text-wall-on-pigment ${pigmentStyleFor(pigment).solid}` : 'border-2 border-dashed border-wall-rule'}`}
                            >
                              {choice.memberId ? choice.name.charAt(0) : '?'}
                            </span>
                            <span className="flex min-w-0 flex-col">
                              <span className="text-wall-body font-semibold">{choice.name}</span>
                              {choice.note && <span className={`truncate text-wall-label ${chosen ? 'text-wall-brass' : 'text-wall-ink-2'}`}>{choice.note}</span>}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {changes.length > 0 && (
                  <div className="rounded-[16px] bg-wall-brass/15 px-[22px] py-[16px] text-wall-body">
                    <b>What changes: </b>
                    {consequence ?? 'Nothing else on the wall moves.'}
                  </div>
                )}
                {error && <div className="text-wall-body font-semibold text-wall-rust">{error}</div>}
              </>
            )}

            <div className="mt-auto flex items-center gap-[14px]">
              <button type="button" className={darkPill} disabled={saving || changes.length === 0 || !draft.title.trim()} onClick={() => void save()}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" className={pill} onClick={() => { setDraft(draftFromEvent(event)); setKeyboard(null); setMode('details') }}>
                Cancel
              </button>
              <span className="ml-auto text-wall-label text-wall-ink-2">Updates Google Calendar too</span>
            </div>
          </>
        )}

        {mode === 'place' && (
          <>
            <div className="flex items-center gap-[16px]">
              <button type="button" aria-label="Back to editing" onClick={() => { setKeyboard(null); setMode('edit') }} className="flex h-[56px] w-[56px] items-center justify-center rounded-full border border-wall-rule bg-transparent p-0 text-wall-ink">
                <ChevronLeft size={24} />
              </button>
              <div className={`${eyebrow} text-wall-brass-ink`}>PLACE FOR {head.trim().toUpperCase()}</div>
            </div>
            <button
              type="button"
              onClick={() => setKeyboard('search')}
              className={`flex h-[76px] items-center gap-[14px] rounded-[14px] bg-wall-ground px-[20px] text-left ${keyboard === 'search' ? 'border-[3px] border-solid border-wall-brass-ink' : 'border border-solid border-wall-rule'}`}
            >
              <Search size={24} className="shrink-0 text-wall-ink-2" />
              <span className="truncate font-display text-wall-date font-semibold text-wall-ink">{placeQuery || 'Search a place or address'}</span>
              {searching && <span className="ml-auto text-wall-label text-wall-ink-2">searching…</span>}
            </button>

            {keyboard === null && (
              <>
                {mine.length > 0 && (
                  <div className="flex flex-col gap-[10px]">
                    <div className={`${eyebrow} text-wall-ink-2`}>YOUR PLACES</div>
                    <div className="flex flex-wrap gap-[10px]">
                      {mine.map((p) => (
                        <button key={p.id} type="button" className={pill} onClick={() => void choosePlace(placeFromSaved(p))}>
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {results.length > 0 && (
                  <div className="flex flex-col">
                    <div className={`${eyebrow} mb-[6px] text-wall-ink-2`}>FROM GOOGLE MAPS</div>
                    {results.map((r) => (
                      <div key={r.place_id} className="flex flex-col border-t border-wall-rule">
                        <div className="flex min-h-[84px] items-center gap-[16px]">
                          <div className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate font-display text-wall-heading font-bold">{r.name}</span>
                            <span className="truncate text-wall-label text-wall-ink-2">{r.address}</span>
                          </div>
                          <button type="button" className={pill} onClick={() => void choosePlace(placeFromSearch(r))}>
                            Use
                          </button>
                          <button type="button" aria-label="Save as one of your places" onClick={() => { setSaveFor(r); setSaveName(r.name) }} className="flex h-[56px] w-[56px] shrink-0 items-center justify-center rounded-full border border-wall-rule bg-transparent p-0 text-wall-ink">
                            <Bookmark size={22} />
                          </button>
                        </div>
                        {saveFor?.place_id === r.place_id && (
                          <div className="mb-[8px] flex flex-col gap-[12px] rounded-[16px] bg-wall-brass/15 px-[20px] py-[16px]">
                            <div className={`${eyebrow} text-wall-brass-ink`}>SAVE AS ONE OF YOUR PLACES</div>
                            <button type="button" onClick={() => setKeyboard('saveName')} className="flex h-[60px] items-center rounded-[12px] border border-solid border-wall-rule bg-wall-ground px-[16px] text-left text-wall-body text-wall-ink">
                              {saveName}
                            </button>
                            <div className="flex flex-wrap gap-[10px]">
                              {SAVE_PLACE_KINDS.map((kind) => (
                                <button key={kind.value} type="button" onClick={() => setSaveKind(kind.value)} className={saveKind === kind.value ? darkPill.replace('h-[60px]', 'h-[56px]') : pill}>
                                  {kind.label}
                                </button>
                              ))}
                            </div>
                            <button type="button" className={`${darkPill} self-start bg-wall-brass-ink`} onClick={() => void saveAndUse()}>
                              Save and use it
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-auto flex gap-[12px] border-t border-wall-rule pt-[18px]">
                  <button type="button" className={pill} onClick={() => void choosePlace({ name: 'Home', address: '' }, 0)}>
                    It's at home
                  </button>
                  {canClearPlace(event) && (
                    <button type="button" className={pill} onClick={() => void choosePlace({ name: '', address: '' }, null)}>
                      No place
                    </button>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </section>

      {keyboard && (
        <WallKeyboard
          value={keyboardValue}
          onChange={onKeyboardChange}
          onDone={() => setKeyboard(null)}
        />
      )}
    </div>
  )
}

function TimeRow({ label, minutes, was, onStep, onTap }: { label: string; minutes: number; was: ReactNode; onStep: (delta: number) => void; onTap?: () => void }) {
  const round = 'flex h-[64px] w-[64px] shrink-0 items-center justify-center rounded-full border border-wall-rule bg-transparent p-0 text-wall-date text-wall-ink'
  return (
    <div className="flex items-center gap-[14px]">
      <span className="w-[80px] text-wall-detail font-semibold text-wall-ink-2">{label}</span>
      <button type="button" aria-label="15 minutes earlier" className={round} onClick={() => onStep(-15)}>−</button>
      <button type="button" onClick={onTap} className={`h-[72px] w-[250px] rounded-[14px] bg-wall-ground font-display text-wall-date font-bold text-wall-ink ${was ? 'border-2 border-solid border-wall-brass-ink' : 'border border-solid border-wall-rule'}`}>
        {fmtMinutes(minutes)}
      </button>
      <button type="button" aria-label="15 minutes later" className={round} onClick={() => onStep(15)}>+</button>
      {was}
    </div>
  )
}

function People({ event, trip, nameOf, pigmentOf }: {
  event: EditableEvent
  trip: { travelerIds: string[]; driverId: string | null } | null
  nameOf: (id: string | null) => string | null
  pigmentOf: (id: string) => number | null
}) {
  const ids = [...new Set((event.members ?? []).map((m) => m.family_member_id ?? m.family_member?.id).filter((id): id is string => Boolean(id)))]
  const rows: Array<{ id: string | null; text: string }> = ids.filter((id) => id !== trip?.driverId).map((id) => ({ id, text: nameOf(id) ?? '' }))
  if (trip?.driverId) rows.push({ id: trip.driverId, text: `${nameOf(trip.driverId)} drives` })
  if (trip && !trip.driverId) rows.push({ id: null, text: 'No driver yet' })
  if (rows.length === 0) return null
  return (
    <div className="flex flex-wrap gap-x-[28px] gap-y-[12px]">
      {rows.map((row) => {
        const pigment = row.id ? pigmentOf(row.id) : null
        return (
          <div key={`${row.id}:${row.text}`} className="flex items-center gap-[12px]">
            <span
              aria-hidden="true"
              className={`flex h-[44px] w-[44px] items-center justify-center rounded-full font-display text-wall-heading font-bold ${pigment == null ? 'border-2 border-dashed border-wall-ink-2 text-wall-ink-2' : `text-wall-on-pigment ${pigmentStyleFor(pigment).solid}`}`}
            >
              {row.id ? (nameOf(row.id) ?? '?').charAt(0) : '?'}
            </span>
            <span className="text-wall-body font-semibold">{row.text}</span>
          </div>
        )
      })}
    </div>
  )
}
