import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, Car, Check, ChevronLeft, ChevronRight, Clock, Lock, MapPin, Navigation, Plus } from 'lucide-react'
import type { Trip, WallMember } from '../wall/engine/types'
import { pigmentStyleFor } from '../wall/lanes'
import type { WallChecklistItem } from '../wall/packing'
import { createArgs, draftChanges, draftFromEvent, NEW_EVENT_ID, setAllDay, setAnytime, setDay, setDriver, setGoing, setPlace, setTitle, stepEnd, stepStart, type EditDraft, type EditableEvent } from '../wall/editing'
import type { PlaceSearchResult } from '../wall/places'
import type { EventView } from './lens'
import { notesOf, notesSource } from '../../supabase/functions/_shared/event-notes.mjs'

// Board 05d: one event on the phone — when and where, who's going, the trip, get &
// pack; Edit with everything the wall's sheet has (Jake, Oct 8: "On mobile I need to be able to edit events /reminders
// with all the options the wall has"): title, any day, the time (a tap opens the phone's own wheel), all day or anytime,
// the place (saved places, a search for the real address, Save to my places), who's going, who drives; a project
// step's Done and its project. Saved through the same steps as the wall; Delete after a clear yes. Repeats go to Calendar.

const fmt = (minutes: number) => {
  const h = Math.floor(minutes / 60) % 24
  return `${h % 12 === 0 ? 12 : h % 12}:${String(minutes % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

export interface PhoneEventSheetProps {
  /** Adding (step 5, smarter drafts): what clashes for whoever's going, said as Casa's card says it. */
  clashesFor?: (draft: EditDraft) => string[]
  /** Adding: the place the last event like this one was at ("Happy Tails, like last time"). */
  placeFromLastTime?: (title: string) => { name: string; address: string | null } | null
  /** The family's saved places, offered as the place is typed (Jake, Oct 2: "edit the location of anything that takes location on mobile"). */
  placeOptions?: Array<{ name: string; address: string }>
  view: EventView
  members: WallMember[]
  pigments: Map<string, number>
  viewerId: string
  now: Date
  onClose: () => void
  onHandOff?: (trip: Trip) => void
  onLeaving?: (trip: Trip) => void
  onToggleItem?: (item: WallChecklistItem) => void
  saveEvent?: (event: EditableEvent, draft: EditDraft) => Promise<void>
  deleteEvent?: (event: EditableEvent) => Promise<void>
  /** Open straight into editing (the card's Edit). */
  initialMode?: 'details' | 'edit'
  /** Adding (a blank event, id NEW_EVENT_ID): the calendar's own create call. */
  createEvent?: (args: Record<string, unknown>) => Promise<unknown>
  /** Keep from… (05g): who it's kept from, who the title suggests, and the change. */
  keptFrom?: string[]
  suggestKeepFrom?: string[]
  onKeepFrom?: (memberIds: string[]) => Promise<void>
  /** Add a line to its get & pack list (Jake, 2026-09-29); absent = no Add. */
  onAddItem?: (eventId: string, label: string) => Promise<void>
  /** This event's own list, loaded for it (a reminder's isn't in the week's list). */
  useItems?: (eventId: string) => WallChecklistItem[]
  /** Save what people wrote in its notes (canvas 65); absent = shown, not edited. */
  onSaveNotes?: (event: EditableEvent, notes: string) => Promise<void>
  /** A place search for the real address (the wall's place-search); absent = saved places only. */
  searchPlaces?: (query: string) => Promise<PlaceSearchResult[]>
  /** Keep a searched place as one of the family's (the wall's Save to my places). */
  savePlace?: (place: PlaceSearchResult) => Promise<void>
  /** A project step's calendar event (the wall's): which step it is, ticking it, and its project. */
  projectStep?: { project: string; title: string; number: number; total: number; done: boolean } | null
  onStepDone?: () => Promise<void>
  onOpenProject?: () => void
}

const noItems = (): WallChecklistItem[] => []

export default function PhoneEventSheet({ view, members, pigments, viewerId, now, initialMode = 'details', onClose, onHandOff, onLeaving, onToggleItem, saveEvent, deleteEvent, createEvent, keptFrom = [], suggestKeepFrom = [], onKeepFrom, onAddItem, useItems = noItems, onSaveNotes, clashesFor, placeFromLastTime, placeOptions = [], searchPlaces, savePlace, projectStep = null, onStepDone, onOpenProject }: PhoneEventSheetProps) {
  const event = view.event as EditableEvent
  // Adding: the same sheet, straight into editing, blank.
  const isNew = event.id === NEW_EVENT_ID
  const [kind, setKind] = useState<'event' | 'reminder'>(event.event_type === 'reminder' ? 'reminder' : 'event')
  const [mode, setMode] = useState<'details' | 'edit' | 'delete'>(isNew || (initialMode === 'edit' && !view.repeating) ? 'edit' : 'details')
  const [draft, setDraft] = useState<EditDraft>(() => draftFromEvent(event))
  const [busy, setBusy] = useState(false)
  const loadedItems = useItems(isNew ? '' : event.id)
  const prep = [...new Map([...view.prep, ...loadedItems.filter((item) => item.event_id === event.id)].map((item) => [item.id, item])).values()].sort((a, b) => a.sort_order - b.sort_order)
  const [itemText, setItemText] = useState('')
  const [itemError, setItemError] = useState<string | null>(null)
  // Notes (canvas 65): null while reading them; what's typed while editing; what was saved until the calendar catches up.
  const [notesText, setNotesText] = useState<string | null>(null)
  const [notesKept, setNotesKept] = useState<string | null>(null)
  const [notesError, setNotesError] = useState<string | null>(null)
  const notes = notesKept ?? notesOf(event.description)
  const source = notesSource(event.description)
  const saveNotes = async () => {
    const text = (notesText ?? '').trim()
    setNotesText(null)
    if (!onSaveNotes || text === notes) return
    setNotesKept(text)
    try {
      setNotesError(null)
      await onSaveNotes(event, text)
    } catch {
      setNotesKept(null)
      setNotesError('The notes didn’t save. Try again.')
    }
  }
  const addItem = async () => {
    const text = itemText.trim()
    if (!text || !onAddItem) return
    setItemText('')
    try {
      setItemError(null)
      await onAddItem(event.id, text.charAt(0).toUpperCase() + text.slice(1))
    } catch {
      setItemText(text)
      setItemError('That didn’t save. Try again.')
    }
  }
  // Keep from… stays one quiet button until it's wanted (or already in use).
  const [keepOpen, setKeepOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name ?? ''
  const names = (ids: string[]) => ids.map(nameOf).join(' & ')
  const disc = (id: string, size = 'h-[36px] w-[36px] text-phone-body') => (
    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-full font-display font-bold text-wall-on-pigment ${size} ${pigmentStyleFor(pigments.get(id) ?? 0).solid}`}>{nameOf(id).charAt(0)}</span>
  )
  const changes = draftChanges(event, draft, members)
  const choices = ((event as { enrichment?: { place_choices?: Array<{ name: string; address: string }> | null } | null }).enrichment?.place_choices ?? []).filter((c) => c?.name && c?.address)
  // Smarter drafts (step 5): a clash warns but never blocks; the place from last time is one tap; an outing asks who drives.
  const clashes = isNew && kind === 'event' && !draft.allDay && clashesFor ? clashesFor(draft) : []
  const lastPlace = isNew && !draft.place.name.trim() && draft.title.trim().length >= 3 && placeFromLastTime ? placeFromLastTime(draft.title) : null
  const outing = Boolean(draft.place.name.trim()) && !/^home$/i.test(draft.place.name.trim())
  // Saved places matching what's typed (not once one is picked: it has its address then).
  const typed = draft.place.name.trim().toLowerCase()
  const placeHits = typed.length >= 2 && !draft.place.address
    ? placeOptions.filter((p) => p.name.toLowerCase().includes(typed) && p.name.toLowerCase() !== typed).slice(0, 3)
    : []
  // The real address, searched as the wall does (three letters on, a moment after typing stops).
  const [found, setFound] = useState<PlaceSearchResult[]>([])
  const [picked, setPicked] = useState<PlaceSearchResult | null>(null)
  const [keptPlace, setKeptPlace] = useState<'offer' | 'saved' | null>(null)
  useEffect(() => {
    if (!searchPlaces || typed.length < 3 || draft.place.address) { setFound([]); return }
    let cancelled = false
    const timer = window.setTimeout(() => { void searchPlaces(typed).then((r) => { if (!cancelled) setFound(r.slice(0, 4)) }).catch(() => {}) }, 350)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [typed, draft.place.address, searchPlaces])
  const savedNames = new Set(placeOptions.map((p) => p.name.toLowerCase()))
  const reminder = kind === 'reminder'
  const off = reminder ? draft.anytime : draft.allDay
  const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const drivers = members.filter((m) => m.can_drive)
  // The place box: open while there's no place yet (and while typing one); a pick closes it to its row.
  const [placeOpen, setPlaceOpen] = useState(() => !draft.place.name.trim())
  const [driverOpen, setDriverOpen] = useState(false)
  // The place as a name and its address — never the address run into the name ("Ferrin Park Field 1, 11921 …").
  const splitName = (full: string) => (full.includes(',') ? { name: full.split(',')[0].trim(), address: full.slice(full.indexOf(',') + 1).trim() } : null)
  const shownPlace = draft.place.address && draft.place.address !== draft.place.name
    ? { name: splitName(draft.place.name)?.name ?? draft.place.name, address: draft.place.address }
    : splitName(draft.place.name) ?? { name: draft.place.name, address: draft.place.address || null }
  const save = () => {
    if (isNew) { if (createEvent) void run(async () => { await createEvent(createArgs(draft, kind, members)) }, 'Adding didn’t work. Nothing was added.'); return }
    if (changes.length === 0) { onClose(); return }
    if (saveEvent) void run(() => saveEvent(event, draft), 'Saving didn’t work. Nothing was changed.')
  }
  const run = async (work: () => Promise<void>, failed: string, stayOpen = false) => {
    setBusy(true)
    setError(null)
    try {
      await work()
      if (stayOpen) setBusy(false)
      else onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : failed)
      setBusy(false)
    }
  }
  const trip = view.trip
  const pill = 'h-[44px] rounded-full border border-solid border-wall-ink-2 bg-transparent px-[18px] text-phone-body font-semibold text-wall-ink'
  const dark = 'h-[44px] rounded-full border-0 bg-wall-ink px-[20px] text-phone-body font-bold text-wall-on-pigment'
  const label = 'text-phone-label font-bold tracking-[0.16em] text-wall-ink-2'
  const brass = 'h-[44px] rounded-full border-0 bg-wall-brass px-[20px] text-phone-body font-bold text-wall-on-pigment'
  // The place's address without its name said again ("Lake Lytal, 3645 Gun Club Road…" → "3645 Gun Club Road…").
  const named = view.place.address?.toLowerCase().startsWith(`${view.place.name.toLowerCase()}, `)
  const viewAddress = view.place.address && view.place.address !== view.place.name
    ? (named ? view.place.address.slice(view.place.name.length + 2) : view.place.address)
    : null
  const viewPlace = { name: view.place.name, detail: [viewAddress, view.place.driveMinutes != null ? `${view.place.driveMinutes} min from home` : null].filter(Boolean).join(' · ') }
  // Editing (canvas 82A): grouped cards of rows, as the phone's own settings are.
  const group = 'mb-[6px] mt-[22px] px-[14px] text-phone-label font-semibold tracking-[0.08em] text-wall-ink-2'
  const card = 'flex flex-col overflow-hidden rounded-[14px] bg-wall-on-pigment'
  const row = 'flex min-h-[52px] items-center gap-[12px] border-solid border-wall-stone bg-transparent px-[14px] py-[8px] text-wall-ink'
  const chip = 'h-[36px] rounded-full border border-solid border-wall-ink-2 bg-transparent px-[14px] text-phone-detail font-semibold text-wall-ink'

  return (
    <section aria-label={`${event.title} on the phone`} className="absolute inset-0 z-20 flex flex-col bg-phone-ground font-body text-wall-ink">
      {/* A pinned top bar, clear of the notch: Back and Edit never scroll away or sit under the status bar. */}
      {mode === 'edit' ? (
        // Editing (canvas 82A; Jake, Oct 8: "The edit screens look pretty ugly on mobile" → "82A"): the iPhone's own
        // top bar — Cancel, what it is, Save — always in reach.
        <div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center border-0 border-b border-solid border-wall-stone bg-phone-ground px-[16px] pb-[10px] pt-[max(14px,calc(env(safe-area-inset-top)+6px))]">
          <button type="button" onClick={() => (isNew ? onClose() : setMode('details'))} className="h-[44px] justify-self-start border-0 bg-transparent p-0 text-phone-body text-wall-ink">Cancel</button>
          <span className="text-phone-body font-bold">{isNew ? (kind === 'reminder' ? 'New reminder' : 'New event') : kind === 'reminder' ? 'Edit reminder' : 'Edit event'}</span>
          <button type="button" disabled={busy || !draft.title.trim()} onClick={save} className={`${brass} justify-self-end px-[18px] disabled:opacity-40`}>
            {busy ? (isNew ? 'Adding…' : 'Saving…') : isNew ? 'Add it' : changes.length === 0 ? 'Done' : 'Save'}
          </button>
        </div>
      ) : (
      <div className="flex shrink-0 items-center justify-between border-0 border-b border-solid border-wall-stone bg-phone-ground px-[20px] pb-[10px] pt-[max(14px,calc(env(safe-area-inset-top)+6px))]">
        <button type="button" aria-label="Back" onClick={onClose} className="-ml-[8px] flex h-[44px] items-center gap-[2px] border-0 bg-transparent p-0 pr-[8px] text-phone-body text-wall-ink"><ChevronLeft size={24} aria-hidden="true" />Back</button>
        {mode === 'details' && !view.repeating && !projectStep && saveEvent && <button type="button" className={brass} onClick={() => { setDraft(draftFromEvent(event)); setMode('edit') }}>Edit</button>}
      </div>
      )}
      <div className="flex-1 overflow-y-auto overscroll-contain px-[20px] pb-[max(30px,calc(env(safe-area-inset-bottom)+16px))]">

      {mode !== 'edit' ? (
        // The event (canvas 83A; Jake, Oct 9: "This screen still looks ugly" → "the buttons. need some pop" → "83A … with
        // the navigation button/where from 83b"): the when and title, then light cards on the ground, as its Edit is;
        // the buttons filled; Keep from and Delete quiet rows in the last card.
        <div className="flex flex-col pb-[10px]">
          <div className="mt-[16px] text-phone-label font-bold tracking-[0.14em] text-wall-brass-ink">{view.when}</div>
          <h2 className="m-0 mt-[6px] font-display text-phone-title font-bold leading-[1.08] text-wall-ink">{event.title}</h2>
          {projectStep && (
            <>
              <span className={group}>PROJECT STEP · {projectStep.number} OF {projectStep.total}</span>
              <section aria-label="Project step" className={`${card} gap-[10px] p-[14px]`}>
                <div className="text-phone-body">Step {projectStep.number} of {projectStep.total} in <b>{projectStep.project}</b></div>
                <div className="flex gap-[8px]">
                  {onStepDone && (projectStep.done
                    ? <span className="flex h-[44px] items-center gap-[6px] text-phone-body font-semibold text-wall-ink-2"><Check size={18} aria-hidden="true" /> Done</span>
                    : <button type="button" disabled={busy} className={`${dark} flex-1`} onClick={() => void run(onStepDone, 'That didn’t save. Try again.')}>Done</button>)}
                  {onOpenProject && <button type="button" className={`${brass} flex-1`} onClick={onOpenProject}>Open project</button>}
                </div>
                <div className="text-phone-detail text-wall-ink-2">Its dates and name come from the project: change them there.</div>
              </section>
            </>
          )}
          {view.place.name && (
            <>
              <span className={group}>WHERE</span>
              <div className={card}>
                <div className={`${row} py-[12px]`}>
                  <MapPin size={20} className="shrink-0 text-wall-ink-2" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="text-phone-body font-semibold">{viewPlace.name}</div>
                    {viewPlace.detail && <div className="text-phone-detail leading-snug text-wall-ink-2">{viewPlace.detail}</div>}
                  </div>
                  {view.place.address && (
                    <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(view.place.address)}`} target="_blank" rel="noreferrer" aria-label="Directions"
                      className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full bg-wall-ink text-wall-on-pigment no-underline">
                      <Navigation size={19} aria-hidden="true" />
                    </a>
                  )}
                </div>
                {/* Not sure of the place (Jake, Oct 2): the choices, one tap; or none at all: add the address. */}
                {!view.place.address && choices.length > 0 && saveEvent && (
                  <section aria-label="Which one?" className="flex flex-col gap-[8px] border-0 border-t border-solid border-wall-stone p-[12px]">
                    <div className={label}>WHICH ONE?</div>
                    {choices.map((c) => (
                      <button key={`${c.name}|${c.address}`} type="button" onClick={() => void run(() => saveEvent(event, setPlace(draftFromEvent(event), { name: c.name, address: c.address, driveMinutes: null })), 'That didn’t save. Try again.')}
                        className="flex min-h-[48px] flex-col items-start justify-center rounded-[12px] border border-solid border-wall-stone bg-phone-ground px-[12px] py-[8px] text-left text-wall-ink">
                        <span className="text-phone-body font-semibold">{c.name}</span>
                        <span className="text-phone-detail text-wall-ink-2">{c.address}</span>
                      </button>
                    ))}
                  </section>
                )}
                {!view.place.address && view.place.name && choices.length === 0 && saveEvent && !(event as { _placePending?: boolean })._placePending && (
                  <div className="px-[14px] pb-[12px] pl-[46px]">
                    <button type="button" onClick={() => { setDraft(draftFromEvent(event)); setMode('edit') }} className={brass}>Add the address</button>
                  </div>
                )}
              </div>
            </>
          )}
          <span className={group}>WHO'S GOING</span>
          <div className={`${card} flex-row flex-wrap gap-x-[16px] gap-y-[8px] px-[14px] py-[12px]`}>
            {view.going.length === 0 && <span className="text-phone-body italic text-wall-ink-2">Nobody yet</span>}
            {view.going.map((id) => <span key={id} className="flex items-center gap-[10px] text-phone-body">{disc(id)}{nameOf(id)}</span>)}
          </div>
          {trip && (
            <>
              <span className={group}>THE TRIP</span>
              <div className={`${card} gap-[10px] px-[14px] py-[12px]`}>
                <div className="flex items-center gap-[12px] text-phone-body">
                  {trip.driverId ? disc(trip.driverId) : <Car size={20} className="shrink-0 text-wall-ink-2" aria-hidden="true" />}
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{trip.driverId ? `${nameOf(trip.driverId)} drives` : 'Needs a driver'}</span>
                    {(trip.leaveAt || trip.homeAt) && (
                      <span className="block text-phone-detail text-wall-ink-2">
                        {[trip.leaveAt ? `Leave ${fmt(trip.leaveAt.getHours() * 60 + trip.leaveAt.getMinutes())}` : null, trip.homeAt ? `back ${fmt(trip.homeAt.getHours() * 60 + trip.homeAt.getMinutes())}` : null].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </span>
                  {onHandOff && <button type="button" className={`${brass} shrink-0`} onClick={() => onHandOff(trip)}>{trip.driverId ? 'Hand off' : 'Choose a driver'}</button>}
                </div>
                {onLeaving && trip.driverId === viewerId && trip.leaveAt && trip.leaveAt.toDateString() === now.toDateString() && !trip.departedAt && (
                  <button type="button" className={dark} onClick={() => onLeaving(trip)}>Leaving now</button>
                )}
              </div>
            </>
          )}
          {(prep.length > 0 || (onAddItem && !isNew)) && (
            <>
              <span className={group}>{prep.length ? `GET & PACK · ${prep.filter((i) => i.checked).length} OF ${prep.length}` : 'GET & PACK'}</span>
              <div className={card}>
                {prep.map((item) => (
                  <button key={item.id} type="button" aria-pressed={item.checked} disabled={!onToggleItem} onClick={() => onToggleItem?.(item)} className={`${row} w-full border-0 border-b text-left text-phone-body`}>
                    <span aria-hidden="true" className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px] border-2 border-solid ${item.checked ? 'border-wall-ink bg-wall-ink text-wall-on-pigment' : 'border-wall-ink-2 bg-transparent'}`}>{item.checked && <Check size={14} strokeWidth={3} />}</span>
                    <span className={item.checked ? 'text-wall-ink-2 line-through' : ''}>{item.label}</span>
                  </button>
                ))}
                {onAddItem && !isNew && (
                  <form className={`${row} py-[4px]`} onSubmit={(e) => { e.preventDefault(); void addItem() }}>
                    <Plus size={20} className="shrink-0 text-wall-ink-2" aria-hidden="true" />
                    <input aria-label="Add to get & pack" value={itemText} onChange={(e) => setItemText(e.target.value)} placeholder="Add something to get or pack"
                      className="h-[44px] min-w-0 flex-1 border-0 bg-transparent p-0 text-phone-body text-wall-ink placeholder:text-wall-ink-2 focus:outline-none" />
                    {itemText.trim() && <button type="submit" className={`${brass} h-[36px] shrink-0 px-[14px]`}>Add</button>}
                  </form>
                )}
              </div>
              {itemError && <div className="mt-[6px] px-[14px] text-phone-detail font-semibold text-wall-rust">{itemError}</div>}
            </>
          )}

          {/* Notes (canvas 65d): what people wrote, or an email's specifics with where they came from; a tap edits. */}
          {!isNew && (notes || onSaveNotes) && (
            <>
              <span className={group}>NOTES</span>
              {notesText != null ? (
                <form className={`${card} gap-[10px] p-[12px]`} onSubmit={(e) => { e.preventDefault(); void saveNotes() }}>
                  <textarea aria-label="Notes" autoFocus rows={6} value={notesText} onChange={(e) => setNotesText(e.target.value)}
                    className="min-h-[132px] w-full resize-y rounded-[10px] border border-solid border-wall-stone bg-phone-ground p-[12px] text-phone-body leading-snug text-wall-ink" />
                  <div className="flex gap-[8px]">
                    <button type="submit" className={dark}>Save</button>
                    <button type="button" className={pill} onClick={() => setNotesText(null)}>Cancel</button>
                  </div>
                </form>
              ) : (
                <div className={card}>
                  <button type="button" aria-label={notes ? `Notes: ${notes}` : 'Add a note'} disabled={!onSaveNotes} onClick={() => setNotesText(notes)}
                    className="min-h-[52px] w-full border-0 bg-transparent px-[14px] py-[12px] text-left">
                    {notes
                      ? <span className="block whitespace-pre-wrap break-words text-phone-body leading-snug text-wall-ink">{notes}</span>
                      : <span className="flex items-center gap-[12px] text-phone-body text-wall-ink-2"><Plus size={20} aria-hidden="true" /> Add a note</span>}
                  </button>
                  {source && (
                    <div className="flex flex-wrap items-baseline gap-x-[12px] border-0 border-t border-solid border-wall-stone px-[14px] text-phone-detail text-wall-ink-2">
                      <span className="py-[10px]">{source.text}</span>
                      {source.url && <a href={source.url} target="_blank" rel="noreferrer" className="flex min-h-[44px] items-center font-semibold text-wall-brass-ink">Open email ›</a>}
                    </div>
                  )}
                </div>
              )}
              {notesError && <div className="mt-[6px] px-[14px] text-phone-detail font-semibold text-wall-rust">{notesError}</div>}
            </>
          )}

          {/* A surprise (05g): the suggestion stands out above the quiet rows. */}
          {onKeepFrom && !isNew && keptFrom.length === 0 && suggestKeepFrom.length > 0 && (
            <div className={`${card} mt-[22px] gap-[10px] p-[14px]`}>
              <div className="text-phone-body">A surprise for {names(suggestKeepFrom)}? Keep it off the wall and off {names(suggestKeepFrom)}’s phone.</div>
              <button type="button" disabled={busy} className={dark} onClick={() => void run(() => onKeepFrom(suggestKeepFrom), 'That didn’t save. Nothing changed.', true)}>
                Keep it from {names(suggestKeepFrom)}
              </button>
            </div>
          )}
          {view.repeating ? (
            <div className="mt-[22px] px-[14px] text-phone-detail text-wall-ink-2">This repeats. <Link to={`/calendar?event=${event.id}`} className="text-wall-ink">Change or delete it in Calendar</Link>.</div>
          ) : null}
          {((onKeepFrom && !isNew) || (deleteEvent && !view.repeating)) && (
            <div className={`${card} mt-[22px]`}>
              {onKeepFrom && !isNew && (
                <div className={`${row} flex-wrap ${deleteEvent && !view.repeating ? 'border-0 border-b' : ''}`}>
                  {!keepOpen && keptFrom.length === 0 ? (
                    <button type="button" onClick={() => setKeepOpen(true)} className="flex min-h-[44px] w-full items-center gap-[12px] border-0 bg-transparent p-0 text-left text-wall-ink">
                      <Lock size={20} className="shrink-0 text-wall-ink-2" aria-hidden="true" />
                      <span className="flex-1">
                        <span className="block text-phone-body">Keep from…</span>
                        <span className="block text-phone-detail text-wall-ink-2">Everyone can see it, and it’s on the wall.</span>
                      </span>
                      <ChevronRight size={18} className="text-wall-ink-2" aria-hidden="true" />
                    </button>
                  ) : (
                    <div className="flex w-full flex-col gap-[8px] py-[4px]">
                      <div className="flex items-center gap-[12px] text-phone-body"><Lock size={20} className="shrink-0 text-wall-ink-2" aria-hidden="true" /> Keep from</div>
                      <div className="flex flex-wrap gap-[8px]">
                        {members.filter((m) => m.show_on_home_sidebar !== false && m.id !== viewerId).map((m) => {
                          const on = keptFrom.includes(m.id)
                          return (
                            <button
                              key={m.id}
                              type="button"
                              aria-pressed={on}
                              aria-label={`Keep from ${m.name}`}
                              disabled={busy}
                              onClick={() => void run(() => onKeepFrom(on ? keptFrom.filter((id) => id !== m.id) : [...keptFrom, m.id]), 'That didn’t save. Nothing changed.', true)}
                              className={`flex h-[40px] items-center gap-[6px] rounded-full px-[12px] text-phone-detail font-semibold ${on ? 'border-0 bg-wall-ink text-wall-on-pigment' : 'border border-solid border-wall-stone bg-phone-ground text-wall-ink'}`}
                            >
                              {on && <Lock size={14} aria-hidden="true" />}{m.name}
                            </button>
                          )
                        })}
                      </div>
                      <div className="text-phone-detail text-wall-ink-2">
                        {keptFrom.length > 0 ? `Not on the wall, and never on ${names(keptFrom)}’s phone.` : 'Everyone can see it, and it’s on the wall.'}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {deleteEvent && !view.repeating && (mode === 'delete' ? (
                <div className="flex flex-col gap-[10px] p-[14px]">
                  <div className="font-display text-phone-heading font-bold">Delete “{event.title}”?</div>
                  <div className="text-phone-detail text-wall-ink-2">{(event.event_type ?? '') === 'reminder' ? 'It comes off the wall, the phones and your Reminders.' : 'It comes off the wall, the phones and Google Calendar, for everyone.'}</div>
                  {error && <div className="text-phone-detail font-semibold text-wall-rust">{error}</div>}
                  <div className="flex gap-[8px]">
                    <button type="button" disabled={busy} className="h-[44px] flex-1 rounded-full border-0 bg-wall-rust text-phone-body font-bold text-wall-on-pigment" onClick={() => void run(() => deleteEvent(event), 'Deleting didn’t work. Nothing was removed.')}>{busy ? 'Deleting…' : 'Yes, delete'}</button>
                    <button type="button" disabled={busy} className={pill} onClick={() => { setMode('details'); setError(null) }}>Keep it</button>
                  </div>
                </div>
              ) : (
                <button type="button" className={`${row} w-full border-0 text-left text-phone-body text-wall-rust`} onClick={() => setMode('delete')}>
                  {(event.event_type ?? '') === 'reminder' ? 'Delete reminder' : 'Delete event'}
                </button>
              ))}
            </div>
          )}
          {error && mode === 'details' && <div className="mt-[8px] px-[14px] text-phone-detail font-semibold text-wall-rust">{error}</div>}
        </div>
      ) : (
        <div className="flex flex-col pb-[20px]">
          {/* The title, big, as on the event itself; a new one asks Event or Reminder under it. */}
          {/* Wraps rather than cuts off ("Softball: Huskies @ RPB Cascade" on two lines). */}
          <textarea aria-label="Title" value={draft.title} autoFocus={isNew} rows={draft.title.length > 22 ? 2 : 1} placeholder={kind === 'reminder' ? 'What to remember' : 'What is it?'}
            onChange={(e) => setDraft((d) => setTitle(d, e.target.value.replace(/\n/g, ' ')))}
            className="mt-[16px] resize-none border-0 border-b-[1.5px] border-solid border-wall-stone bg-transparent px-[2px] pb-[10px] font-display text-phone-title font-bold leading-[1.1] text-wall-ink placeholder:text-wall-ink-2 focus:outline-none" />
          {isNew && (
            <div className="mt-[12px] flex self-start rounded-full bg-phone-card p-[3px]">
              {(['event', 'reminder'] as const).map((k) => (
                <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={`h-[36px] rounded-full border-0 px-[18px] text-phone-detail font-semibold ${kind === k ? 'bg-wall-ink text-wall-on-pigment' : 'bg-transparent text-wall-ink'}`}>
                  {k === 'event' ? 'Event' : 'Reminder'}
                </button>
              ))}
            </div>
          )}

          <span className={group}>WHERE</span>
          <div className={card}>
            {placeOpen ? (
              <div className="flex flex-col gap-[8px] px-[14px] py-[12px]">
                <div className="flex items-center gap-[10px]">
                  <MapPin size={18} aria-hidden="true" className="shrink-0 text-wall-ink-2" />
                  <input value={draft.place.name} autoFocus={placeOpen} placeholder="Home, a place, or an address (optional)"
                    onChange={(e) => { setPicked(null); setKeptPlace(null); setDraft((d) => setPlace(d, { name: e.target.value, address: '', driveMinutes: null })) }}
                    className="h-[40px] min-w-0 flex-1 border-0 bg-transparent p-0 text-phone-body text-wall-ink placeholder:text-wall-ink-2 focus:outline-none" />
                </div>
                {[...placeHits.map((p) => ({ key: `saved:${p.name}`, name: p.name, address: p.address, result: null as PlaceSearchResult | null })),
                  ...found.filter((r) => !placeHits.some((p) => p.name === r.name)).map((r) => ({ key: r.place_id, name: r.name, address: r.address, result: r }))].map((o) => (
                  <button key={o.key} type="button"
                    onClick={() => { setPicked(o.result); setKeptPlace(o.result && savePlace && !savedNames.has(o.name.toLowerCase()) ? 'offer' : null); setPlaceOpen(false); setDraft((d) => setPlace(d, { name: o.name, address: o.address ?? '', driveMinutes: null })) }}
                    className="flex min-h-[48px] flex-col items-start justify-center border-0 border-t border-solid border-wall-stone bg-transparent px-[28px] py-[6px] text-left text-wall-ink">
                    <span className="text-phone-body font-semibold">{o.name}</span>
                    {o.address && <span className="text-phone-detail text-wall-ink-2">{o.address}</span>}
                  </button>
                ))}
              </div>
            ) : (
              <button type="button" aria-label={`Change the place: ${shownPlace.name}`} onClick={() => setPlaceOpen(true)} className={`${row} w-full border-0`}>
                <MapPin size={18} aria-hidden="true" className="shrink-0 text-wall-ink-2" />
                <span className="flex min-w-0 flex-1 flex-col text-left">
                  <span className="text-phone-body text-wall-ink">{shownPlace.name}</span>
                  <span className="text-phone-detail text-wall-ink-2">{[shownPlace.address ?? (/^home$/i.test(shownPlace.name) ? null : 'Its address is found after you save'), draft.place.driveMinutes != null ? `${draft.place.driveMinutes} min` : null].filter(Boolean).join(' · ')}</span>
                </span>
                <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-wall-ink-2" />
              </button>
            )}
          </div>
          {lastPlace && (
            <button type="button" onClick={() => { setPlaceOpen(false); setDraft((d) => setPlace(d, { name: lastPlace.name, address: lastPlace.address ?? '', driveMinutes: null })) }}
              className="mt-[8px] flex min-h-[40px] items-center gap-[6px] self-start rounded-full border border-solid border-wall-brass bg-wall-brass/10 px-[14px] text-phone-detail font-semibold text-wall-brass-ink">
              <MapPin size={15} aria-hidden="true" /> {lastPlace.name}, like last time
            </button>
          )}
          {keptPlace === 'offer' && picked && savePlace && (
            <div className="mt-[8px] flex flex-wrap items-center gap-[8px] px-[4px]">
              <span className="text-phone-detail text-wall-ink-2">Keep it as one of your places?</span>
              <button type="button" className={chip} onClick={() => { setKeptPlace('saved'); void savePlace(picked).catch(() => setKeptPlace('offer')) }}>Save to my places</button>
              <button type="button" className={chip} onClick={() => setKeptPlace(null)}>Just this once</button>
            </div>
          )}
          {keptPlace === 'saved' && <span className="mt-[8px] px-[4px] text-phone-detail font-semibold text-wall-brass-ink">Saved to your places.</span>}

          <span className={group}>WHEN</span>
          <div className={card}>
            <label className={row}>
              <span className="flex-1 text-phone-body">{reminder ? 'Anytime (no date)' : 'All day'}</span>
              <input type="checkbox" checked={off} onChange={(e) => setDraft((d) => (reminder ? setAnytime(d, e.target.checked) : setAllDay(d, e.target.checked)))}
                className="relative h-[31px] w-[51px] shrink-0 cursor-pointer appearance-none rounded-full bg-wall-stone transition-colors before:absolute before:left-[2px] before:top-[2px] before:h-[27px] before:w-[27px] before:rounded-full before:bg-wall-on-pigment before:shadow before:transition-transform before:content-[''] checked:bg-wall-ink checked:before:translate-x-[20px]" />
            </label>
            {!(reminder && draft.anytime) && (
              // A tap opens the phone's own date picker.
              <label className={`${row} relative border-t`}>
                <CalendarDays size={18} aria-hidden="true" className="shrink-0 text-wall-ink-2" />
                <span className="flex-1 text-phone-body">Date</span>
                <span className="text-phone-body text-wall-ink-2">{draft.day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                <input aria-label="Date" type="date" value={ymd(draft.day)} onChange={(e) => { if (e.target.value) { const [y, m, d] = e.target.value.split('-').map(Number); setDraft((dr) => setDay(dr, new Date(y, m - 1, d))) } }}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
              </label>
            )}
            {!off && (reminder ? (['start'] as const) : (['start', 'end'] as const)).map((which) => (
              // And a time, the phone's own wheel.
              <label key={which} className={`${row} relative border-t`}>
                {which === 'start' ? <Clock size={18} aria-hidden="true" className="shrink-0 text-wall-ink-2" /> : <span className="w-[18px] shrink-0" />}
                <span className="flex-1 text-phone-body">{which === 'start' ? (reminder ? 'At' : 'Starts') : 'Ends'}</span>
                <span className="rounded-[8px] bg-wall-stone/60 px-[10px] py-[4px] text-phone-body">{fmt(which === 'start' ? draft.startMin : draft.endMin)}</span>
                <input aria-label={which === 'start' ? (reminder ? 'At' : 'Starts at') : 'Ends at'} type="time" value={hhmm(which === 'start' ? draft.startMin : draft.endMin)}
                  onChange={(e) => { if (!e.target.value) return; const [h, m] = e.target.value.split(':').map(Number); const to = h * 60 + m; setDraft((d) => (which === 'start' ? stepStart(d, to - d.startMin) : stepEnd(d, to - d.endMin))) }}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
              </label>
            ))}
          </div>

          <span className={group}>WHO’S GOING</span>
          <div className={`${card} grid grid-cols-6 px-[6px] py-[12px]`}>
            {members.filter((m) => m.show_on_home_sidebar !== false).map((m) => {
              const on = draft.going.includes(m.id)
              return (
                <button key={m.id} type="button" aria-pressed={on} aria-label={m.name} onClick={() => setDraft((d) => setGoing(d, on ? d.going.filter((id) => id !== m.id) : [...d.going, m.id]))}
                  className="flex flex-col items-center gap-[5px] border-0 bg-transparent p-0 text-wall-ink">
                  {on ? disc(m.id, 'h-[40px] w-[40px] text-phone-heading') : <span aria-hidden="true" className="flex h-[40px] w-[40px] items-center justify-center rounded-full border-[1.5px] border-solid border-wall-ink-2/50 font-display text-phone-heading text-wall-ink-2">{m.name.charAt(0)}</span>}
                  <span className={`text-phone-label ${on ? 'font-bold' : 'text-wall-ink-2'}`}>{m.name}</span>
                </button>
              )
            })}
          </div>
          {isNew && kind === 'event' && draft.going.length === 0 && draft.title.trim() && (
            <div className="mt-[8px] px-[4px] text-phone-detail font-semibold text-wall-brass-ink">Nobody’s on it yet — who’s going?</div>
          )}
          {clashes.map((c) => <div key={c} role="status" className="mt-[8px] px-[4px] text-phone-detail font-semibold text-wall-rust">{c}</div>)}

          {kind === 'event' && outing && drivers.length > 0 && (
            <>
              <span className={group}>THE TRIP</span>
              <div className={card}>
                <button type="button" aria-expanded={driverOpen} onClick={() => setDriverOpen((o) => !o)} className={`${row} w-full border-0`}>
                  <Car size={18} aria-hidden="true" className="shrink-0 text-wall-ink-2" />
                  <span className="flex-1 text-left text-phone-body">Driving</span>
                  {draft.driverId ? <>{disc(draft.driverId, 'h-[26px] w-[26px] text-phone-detail')}<span className="text-phone-body text-wall-ink-2">{nameOf(draft.driverId)}</span></> : <span className="text-phone-body text-wall-ink-2">Nobody yet</span>}
                  <ChevronRight size={18} aria-hidden="true" className={`shrink-0 text-wall-ink-2 transition-transform ${driverOpen ? 'rotate-90' : ''}`} />
                </button>
                {driverOpen && [...drivers.map((m) => ({ id: m.id as string | null, name: m.name })), { id: null, name: 'Nobody yet' }].map((o) => (
                  <button key={o.id ?? 'none'} type="button" aria-pressed={draft.driverId === o.id} onClick={() => { setDraft((d) => setDriver(d, o.id)); setDriverOpen(false) }}
                    className={`${row} w-full border-0 border-t`}>
                    {o.id ? disc(o.id, 'h-[26px] w-[26px] text-phone-detail') : <span className="w-[26px] shrink-0" />}
                    <span className="flex-1 text-left text-phone-body">{o.name}</span>
                    {draft.driverId === o.id && <Check size={18} aria-hidden="true" className="shrink-0 text-wall-brass-ink" />}
                  </button>
                ))}
              </div>
            </>
          )}

          {error && <div className="mt-[12px] px-[4px] text-phone-detail font-semibold text-wall-rust">{error}</div>}
          {isNew ? (
            <span className="mt-[14px] px-[4px] text-phone-detail text-wall-ink-2">Goes on Google Calendar too.</span>
          ) : (
            <Link to={`/calendar?event=${event.id}`} className="mt-[14px] self-start px-[4px] text-phone-detail text-wall-ink-2">Repeats are changed in Calendar.</Link>
          )}
        </div>
      )}
      </div>
    </section>
  )
}
