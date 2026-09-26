import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronLeft, MapPin, Minus, Plus } from 'lucide-react'
import type { Trip, WallMember } from '../wall/engine/types'
import { pigmentStyleFor } from '../wall/lanes'
import type { WallChecklistItem } from '../wall/packing'
import { dayChips, draftChanges, draftFromEvent, setDay, setGoing, setTitle, stepEnd, stepStart, type EditDraft, type EditableEvent } from '../wall/editing'
import type { EventView } from './lens'

// Board 05d: one event on the phone — when and where, who's going, the trip, get &
// pack; Edit for the everyday changes (title, day, times, who's going), saved through
// the same steps as the wall; Delete after a clear yes. Repeats and places go to Calendar.

/** A tap on − or + moves a time this many minutes (stepStart/stepEnd take minutes). */
const STEP_MIN = 15

const fmt = (minutes: number) => {
  const h = Math.floor(minutes / 60) % 24
  return `${h % 12 === 0 ? 12 : h % 12}:${String(minutes % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

export interface PhoneEventSheetProps {
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
}

export default function PhoneEventSheet({ view, members, pigments, viewerId, now, onClose, onHandOff, onLeaving, onToggleItem, saveEvent, deleteEvent }: PhoneEventSheetProps) {
  const event = view.event as EditableEvent
  const [mode, setMode] = useState<'details' | 'edit' | 'delete'>('details')
  const [draft, setDraft] = useState<EditDraft>(() => draftFromEvent(event))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name ?? ''
  const disc = (id: string, size = 'h-[36px] w-[36px] text-phone-body') => (
    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-full font-display font-bold text-wall-on-pigment ${size} ${pigmentStyleFor(pigments.get(id) ?? 0).solid}`}>{nameOf(id).charAt(0)}</span>
  )
  const changes = draftChanges(event, draft, members)
  const run = async (work: () => Promise<void>, failed: string) => {
    setBusy(true)
    setError(null)
    try {
      await work()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : failed)
      setBusy(false)
    }
  }
  const trip = view.trip
  const pill = 'h-[44px] rounded-full border border-solid border-wall-ink-2 bg-transparent px-[18px] text-phone-body font-semibold text-wall-ink'
  const dark = 'h-[44px] rounded-full border-0 bg-wall-ink px-[20px] text-phone-body font-bold text-wall-on-pigment'
  const label = 'text-phone-label font-bold tracking-[0.16em] text-wall-ink-2'

  return (
    <section aria-label={`${event.title} on the phone`} className="absolute inset-0 z-20 flex flex-col bg-phone-ground font-body text-wall-ink">
      {/* A pinned top bar, clear of the notch: Back and Edit never scroll away or sit under the status bar. */}
      <div className="flex shrink-0 items-center justify-between border-0 border-b border-solid border-wall-stone bg-phone-ground px-[20px] pb-[10px] pt-[max(14px,calc(env(safe-area-inset-top)+6px))]">
        <button type="button" aria-label="Back" onClick={onClose} className="flex h-[44px] w-[44px] items-center justify-center rounded-full border border-solid border-wall-stone bg-transparent p-0 text-wall-ink"><ChevronLeft size={20} /></button>
        {mode === 'details' && !view.repeating && saveEvent && <button type="button" className={pill} onClick={() => { setDraft(draftFromEvent(event)); setMode('edit') }}>Edit</button>}
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain px-[20px] pb-[max(30px,calc(env(safe-area-inset-bottom)+16px))]">

      {mode !== 'edit' ? (
        <div className="mt-[14px] flex flex-col gap-[16px]">
          <div>
            <div className="text-phone-label font-bold tracking-[0.16em] text-wall-brass-ink">{view.when}</div>
            <h2 className="m-0 mt-[6px] font-display text-phone-title font-bold text-wall-ink">{event.title}</h2>
          </div>
          {view.place.name && (
            <div className="flex items-start gap-[10px] text-phone-body">
              <MapPin size={20} className="mt-[2px] shrink-0 text-wall-ink-2" aria-hidden="true" />
              <div>
                <div className="font-semibold">{view.place.name}</div>
                <div className="text-phone-detail text-wall-ink-2">
                  {[view.place.address && view.place.address !== view.place.name ? view.place.address : null, view.place.driveMinutes != null ? `${view.place.driveMinutes} min from home` : null].filter(Boolean).join(' · ')}
                </div>
              </div>
            </div>
          )}
          {view.place.address && (
            <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(view.place.address)}`} target="_blank" rel="noreferrer" className={`${pill} flex items-center justify-center no-underline`}>Directions</a>
          )}
          <div>
            <div className={label}>WHO'S GOING</div>
            <div className="mt-[8px] flex flex-wrap gap-[8px]">
              {view.going.length === 0 && <span className="text-phone-body italic text-wall-ink-2">Nobody yet</span>}
              {view.going.map((id) => <span key={id} className="flex items-center gap-[6px] text-phone-body">{disc(id)}{nameOf(id)}</span>)}
            </div>
          </div>
          {trip && (
            <div className="flex flex-col gap-[8px] rounded-[16px] bg-phone-card p-[14px]">
              <div className={label}>THE TRIP</div>
              <div className="flex items-center gap-[10px] text-phone-body">
                {trip.driverId ? disc(trip.driverId, 'h-[28px] w-[28px] text-phone-detail') : null}
                <span>
                  <b>{trip.driverId ? `${nameOf(trip.driverId)} drives` : 'Needs a driver'}</b>
                  {trip.leaveAt ? ` · leave ${fmt(trip.leaveAt.getHours() * 60 + trip.leaveAt.getMinutes())}` : ''}
                  {trip.homeAt ? ` · back ${fmt(trip.homeAt.getHours() * 60 + trip.homeAt.getMinutes())}` : ''}
                </span>
              </div>
              <div className="flex gap-[8px]">
                {onLeaving && trip.driverId === viewerId && trip.leaveAt && trip.leaveAt.toDateString() === now.toDateString() && !trip.departedAt && (
                  <button type="button" className={`${dark} flex-1`} onClick={() => onLeaving(trip)}>Leaving now</button>
                )}
                {onHandOff && <button type="button" className={`${pill} flex-1`} onClick={() => onHandOff(trip)}>{trip.driverId ? 'Hand off' : 'Choose a driver'}</button>}
              </div>
            </div>
          )}
          {view.prep.length > 0 && (
            <div>
              <div className={label}>GET &amp; PACK · {view.prep.filter((i) => i.checked).length} OF {view.prep.length}</div>
              {view.prep.map((item) => (
                <button key={item.id} type="button" aria-pressed={item.checked} disabled={!onToggleItem} onClick={() => onToggleItem?.(item)} className="flex min-h-[44px] w-full items-center gap-[12px] border-0 border-t border-solid border-wall-stone bg-transparent p-0 text-left text-phone-body text-wall-ink">
                  <span aria-hidden="true" className={`flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[4px] border-2 border-solid ${item.checked ? 'border-wall-ink bg-wall-ink text-wall-on-pigment' : 'border-wall-ink-2'}`}>{item.checked && <Check size={14} strokeWidth={3} />}</span>
                  <span className={item.checked ? 'text-wall-ink-2 line-through' : ''}>{item.label}</span>
                </button>
              ))}
            </div>
          )}

          {view.repeating ? (
            <div className="text-phone-detail text-wall-ink-2">This repeats. <Link to={`/calendar?event=${event.id}`} className="text-wall-ink">Change or delete it in Calendar</Link>.</div>
          ) : mode === 'delete' ? (
            <div className="flex flex-col gap-[10px] rounded-[16px] border-2 border-solid border-wall-rust p-[14px]">
              <div className="font-display text-phone-heading font-bold">Delete “{event.title}”?</div>
              <div className="text-phone-detail text-wall-ink-2">{(event.event_type ?? '') === 'reminder' ? 'It comes off the wall, the phones and your Reminders.' : 'It comes off the wall, the phones and Google Calendar, for everyone.'}</div>
              {error && <div className="text-phone-detail font-semibold text-wall-rust">{error}</div>}
              <div className="flex gap-[8px]">
                <button type="button" disabled={busy} className="h-[44px] flex-1 rounded-full border-0 bg-wall-rust text-phone-body font-bold text-wall-on-pigment" onClick={() => deleteEvent && void run(() => deleteEvent(event), 'Deleting didn’t work. Nothing was removed.')}>{busy ? 'Deleting…' : 'Yes, delete'}</button>
                <button type="button" disabled={busy} className={pill} onClick={() => { setMode('details'); setError(null) }}>Keep it</button>
              </div>
            </div>
          ) : (
            deleteEvent && <button type="button" className={`${pill} self-start text-wall-rust`} onClick={() => setMode('delete')}>Delete</button>
          )}
        </div>
      ) : (
        <div className="mt-[14px] flex flex-col gap-[18px]">
          <label className="flex flex-col gap-[6px]">
            <span className={label}>TITLE</span>
            <input value={draft.title} onChange={(e) => setDraft((d) => setTitle(d, e.target.value))} className="h-[52px] rounded-[12px] border border-solid border-wall-stone bg-wall-on-pigment px-[14px] font-display text-phone-heading font-semibold text-wall-ink" />
          </label>
          <div className="flex flex-col gap-[6px]">
            <span className={label}>DAY</span>
            <div className="flex gap-[6px] overflow-x-auto">
              {dayChips(now, draft.day).map((chip) => (
                <button key={chip.date.getTime()} type="button" aria-pressed={chip.selected} onClick={() => setDraft((d) => setDay(d, chip.date))} className={`flex h-[60px] min-w-[52px] flex-col items-center justify-center rounded-[12px] ${chip.selected ? 'border-0 bg-wall-ink text-wall-on-pigment' : 'border border-solid border-wall-stone bg-transparent text-wall-ink'}`}>
                  <span className="text-phone-label font-bold">{chip.weekday}</span>
                  <span className="font-display text-phone-heading font-bold">{chip.date.getDate()}</span>
                </button>
              ))}
            </div>
          </div>
          {!draft.allDay && (['start', 'end'] as const).map((which) => (
            <div key={which} className="flex items-center gap-[10px]">
              <span className="w-[56px] text-phone-body text-wall-ink-2">{which === 'start' ? 'Starts' : 'Ends'}</span>
              <button type="button" aria-label={`${which === 'start' ? 'Start' : 'End'} earlier`} onClick={() => setDraft((d) => (which === 'start' ? stepStart(d, -STEP_MIN) : stepEnd(d, -STEP_MIN)))} className="flex h-[44px] w-[44px] items-center justify-center rounded-full border border-solid border-wall-stone bg-transparent p-0 text-wall-ink"><Minus size={18} /></button>
              <span className="flex h-[48px] flex-1 items-center justify-center rounded-[12px] border-2 border-solid border-wall-brass font-display text-phone-heading font-semibold">{fmt(which === 'start' ? draft.startMin : draft.endMin)}</span>
              <button type="button" aria-label={`${which === 'start' ? 'Start' : 'End'} later`} onClick={() => setDraft((d) => (which === 'start' ? stepStart(d, STEP_MIN) : stepEnd(d, STEP_MIN)))} className="flex h-[44px] w-[44px] items-center justify-center rounded-full border border-solid border-wall-stone bg-transparent p-0 text-wall-ink"><Plus size={18} /></button>
            </div>
          ))}
          <div className="flex flex-col gap-[8px]">
            <span className={label}>WHO'S GOING</span>
            <div className="grid grid-cols-3 gap-[8px]">
              {members.filter((m) => m.show_on_home_sidebar !== false).map((m) => {
                const on = draft.going.includes(m.id)
                return (
                  <button key={m.id} type="button" aria-pressed={on} onClick={() => setDraft((d) => setGoing(d, on ? d.going.filter((id) => id !== m.id) : [...d.going, m.id]))} className={`flex h-[60px] flex-col items-center justify-center gap-[2px] rounded-[12px] text-phone-detail text-wall-ink ${on ? 'border-2 border-solid border-wall-ink bg-wall-on-pigment font-bold' : 'border border-solid border-wall-stone bg-transparent'}`}>
                    {disc(m.id, 'h-[26px] w-[26px] text-phone-detail')}{m.name}
                  </button>
                )
              })}
            </div>
          </div>
          {error && <div className="text-phone-detail font-semibold text-wall-rust">{error}</div>}
          <div className="flex gap-[8px]">
            <button type="button" disabled={busy || !draft.title.trim()} className={`${dark} flex-1`} onClick={() => (changes.length === 0 ? onClose() : saveEvent && void run(() => saveEvent(event, draft), 'Saving didn’t work. Nothing was changed.'))}>
              {busy ? 'Saving…' : changes.length === 0 ? 'Done' : 'Save'}
            </button>
            <button type="button" className={pill} onClick={() => setMode('details')}>Cancel</button>
          </div>
          <Link to={`/calendar?event=${event.id}`} className="self-start text-phone-detail text-wall-ink-2">More options (place, repeats) in Calendar</Link>
        </div>
      )}
      </div>
    </section>
  )
}
