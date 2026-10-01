import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { useSavedPlaces } from '../hooks/useSavedPlaces'
import type { DayScheduleOverride, FamilyRoutine } from '../lib/familyRoutines'
import { placeFromSaved, yourPlaces } from './places'
import {
  WEEK, WEEK_LETTERS, cannotSave, clock, daysLabel, dayText, overrideFor, overrideLine, putOverride, removeOverride, routineKind,
  setDriver, setPlace, setYear, stepHours, stepTime, toggleDay, yearLine, type DriverChoice,
} from './routines'
import { OUTLINE, QUIET, SIZES, SOLID, type Surface } from './surface'
import WallDatePicker from './WallDatePicker'
import WallKeyboard from './WallKeyboard'

// The routine editor (canvas 16d), on the wall and the phone: where, days and hours, the days that differ, who
// drives, the school year, and days off. Nothing is saved until Save; days off go with it.

export interface DayOffRow { id: string; start: string; end: string }

export interface RoutineEditorProps {
  surface: Surface
  personName: string
  routine: FamilyRoutine
  isNew: boolean
  drivers: DriverChoice[]
  /** The person's days off coming up (they apply to all their routines). */
  dayOffs: DayOffRow[]
  now: Date
  onSave: (routine: FamilyRoutine, dayOffs: { add: string[]; remove: string[] }) => Promise<void>
  onRemove: () => Promise<void>
  onCancel: () => void
}

type Picking = null | 'place' | 'title' | 'yearStart' | 'yearEnd' | 'dayOff'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** − time + ; held down, it keeps stepping. */
function Stepper({ surface, label, value, onStep }: { surface: Surface; label: string; value: string; onStep: (delta: number) => void }) {
  const s = SIZES[surface]
  const timer = useRef<number | null>(null)
  const stop = () => { if (timer.current != null) { window.clearInterval(timer.current); window.clearTimeout(timer.current); timer.current = null } }
  useEffect(() => stop, [])
  const start = (delta: number) => {
    onStep(delta)
    stop()
    timer.current = window.setTimeout(() => { timer.current = window.setInterval(() => onStep(delta), 110) }, 420)
  }
  const key = (delta: number) => (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onStep(delta) } }
  const round = `${s.chip} ${QUIET} px-0`
  return (
    <div className="flex items-center gap-[10px]">
      <span className={`${s.detail} w-[64px]`}>{label}</span>
      <button type="button" aria-label={`${label} 5 minutes earlier`} className={round} onPointerDown={() => start(-5)} onPointerUp={() => stop()} onPointerLeave={() => stop()} onPointerCancel={() => stop()} onKeyDown={key(-5)}>−</button>
      <span className={`${s.line} w-[120px] text-center`} aria-live="polite">{clock(value, true)}</span>
      <button type="button" aria-label={`${label} 5 minutes later`} className={round} onPointerDown={() => start(5)} onPointerUp={() => stop()} onPointerLeave={() => stop()} onPointerCancel={() => stop()} onKeyDown={key(5)}>+</button>
    </div>
  )
}

function DriverChips({ surface, label, value, drivers, onPick }: { surface: Surface; label: string; value: string; drivers: DriverChoice[]; onPick: (d: DriverChoice | null) => void }) {
  const s = SIZES[surface]
  return (
    <div className="flex flex-wrap items-center gap-[8px]">
      <span className={`${s.detail} ${surface === 'phone' ? 'w-full' : 'w-[88px]'}`}>{label}</span>
      {drivers.map((d) => {
        const on = value.trim().toLowerCase() === d.name.toLowerCase()
        return <button key={d.name} type="button" aria-pressed={on} onClick={() => onPick(d)} className={`${s.chip} ${on ? SOLID : QUIET}`}>{d.name}</button>
      })}
      <button type="button" aria-pressed={!value.trim()} onClick={() => onPick(null)} className={`${s.chip} ${!value.trim() ? SOLID : QUIET}`}>Nobody yet</button>
    </div>
  )
}

export default function RoutineEditor({ surface, personName, routine: initial, isNew, drivers, dayOffs, now, onSave, onRemove, onCancel }: RoutineEditorProps) {
  const s = SIZES[surface]
  const [routine, setRoutine] = useState(initial)
  const [picking, setPicking] = useState<Picking>(null)
  const [text, setText] = useState('')
  const [day, setDay] = useState<DayScheduleOverride | null>(null)
  const [offAdd, setOffAdd] = useState<string[]>([])
  const [offRemove, setOffRemove] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)
  const { data: savedPlaces = [] } = useSavedPlaces()
  const places = useMemo(() => (picking === 'place' ? yourPlaces(savedPlaces, text) : []), [picking, savedPlaces, text])
  const kind = routineKind(routine)
  const work = kind === 'work'
  const named = kind === 'class' || kind === 'other'
  const kindName = kind === 'class' ? 'Class or practice' : kind === 'other' ? 'Routine' : kind.charAt(0).toUpperCase() + kind.slice(1)
  const rule = 'border-0 border-t border-solid border-wall-stone'
  const section = `flex flex-col gap-[10px] ${rule} ${s.row}`
  const offs = [...dayOffs.filter((d) => !offRemove.includes(d.id)), ...offAdd.map((d) => ({ id: `new:${d}`, start: d, end: d }))].sort((a, b) => a.start.localeCompare(b.start))
  const problem = cannotSave(routine)

  const save = async () => {
    if (problem) { setError(problem); return }
    setSaving(true)
    setError(null)
    try {
      await onSave(routine, { add: offAdd, remove: offRemove })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Saving didn’t work. Nothing was changed.')
      setSaving(false)
    }
  }
  const remove = async () => {
    setSaving(true)
    try {
      await onRemove()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Removing didn’t work.')
      setSaving(false)
      setRemoving(false)
    }
  }
  const startTyping = (what: 'place' | 'title') => {
    setText(what === 'title' ? routine.title : '')
    setPicking(what)
  }
  const finishTitle = () => {
    if (text.trim()) setRoutine((r) => ({ ...r, title: text.trim() }))
    setPicking(null)
  }
  const pickDate = (value: string | null) => {
    if (picking === 'yearStart') setRoutine((r) => setYear(r, value, r.endDate ?? null))
    if (picking === 'yearEnd') setRoutine((r) => setYear(r, r.startDate ?? null, value))
    if (picking === 'dayOff' && value) setOffAdd((list) => (list.includes(value) ? list : [...list, value]))
    setPicking(null)
  }

  // ── A text field: the phone's own keyboard; on the wall, the wall keyboard along the bottom.
  const typed = (label: string, onDone: () => void) => surface === 'phone'
    ? <input aria-label={label} autoFocus value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onDone() }} className={`${s.field} w-full border border-solid border-wall-ink-2 bg-wall-on-pigment text-wall-ink outline-none`} />
    : <div className={`${s.field} flex items-center border border-solid border-wall-ink-2 bg-wall-on-pigment text-wall-ink`}>{text || <span className="text-wall-ink-2">{label}</span>}</div>

  if (picking === 'place') {
    const choose = (place: { name: string; address: string }) => { setRoutine((r) => setPlace(r, place)); setPicking(null) }
    return (
      <div className="flex flex-col gap-[14px]">
        <div className="flex items-center gap-[12px]">
          <span className={`${s.heading} flex-1`}>Where is it?</span>
          <button type="button" onClick={() => setPicking(null)} className={`${s.pill} ${OUTLINE}`}>Back</button>
        </div>
        {typed('A place you’ve been, or its name', () => text.trim() && choose({ name: text, address: '' }))}
        <div className="flex flex-col">
          {places.map((p) => (
            <button key={p.id} type="button" onClick={() => choose(placeFromSaved(p))} className={`flex flex-col items-start gap-[2px] ${rule} ${s.row} bg-transparent text-left text-wall-ink`}>
              <span className={s.line}>{p.name}</span>
              <span className={s.detail}>{placeFromSaved(p).address}</span>
            </button>
          ))}
          {text.trim() && (
            <button type="button" onClick={() => choose({ name: text, address: '' })} className={`${rule} ${s.row} bg-transparent text-left text-wall-ink ${s.line}`}>
              Use “{text.trim()}”
            </button>
          )}
        </div>
        {surface === 'wall' && <WallKeyboard value={text} onChange={setText} onDone={() => text.trim() && choose({ name: text, address: '' })} />}
      </div>
    )
  }

  if (picking === 'yearStart' || picking === 'yearEnd' || picking === 'dayOff') {
    const value = picking === 'yearStart' ? routine.startDate ?? null : picking === 'yearEnd' ? routine.endDate ?? null : null
    const title = picking === 'yearStart' ? 'The year starts' : picking === 'yearEnd' ? 'The year ends' : `A day off for ${personName}`
    return (
      <div className="flex flex-col gap-[14px]">
        <div className="flex items-center gap-[12px]">
          <span className={`${s.heading} flex-1`}>{title}</span>
          <button type="button" onClick={() => setPicking(null)} className={`${s.pill} ${OUTLINE}`}>Back</button>
        </div>
        {surface === 'wall'
          ? <WallDatePicker value={value} now={now} onPick={pickDate} clearLabel={picking === 'dayOff' ? 'Never mind' : 'No date'} />
          : (
            <div className="flex flex-col gap-[10px]">
              <input type="date" aria-label={title} defaultValue={value ?? ''} onChange={(e) => e.target.value && pickDate(e.target.value)} className={`${s.field} border border-solid border-wall-ink-2 bg-wall-on-pigment text-wall-ink`} />
              <button type="button" onClick={() => pickDate(null)} className={`${s.pill} ${QUIET} self-start`}>{picking === 'dayOff' ? 'Never mind' : 'No date'}</button>
            </div>
          )}
      </div>
    )
  }

  if (day) {
    const save = (o: DayScheduleOverride) => setDay(o)
    return (
      <div className="flex flex-col gap-[16px]">
        <div className="flex items-center gap-[12px]">
          <span className={`${s.heading} flex-1`}>Different on {DAY_NAMES[day.dayOfWeek]}s</span>
          <button type="button" onClick={() => setDay(null)} className={`${s.pill} ${OUTLINE}`}>Back</button>
        </div>
        <div className="flex flex-wrap gap-[8px]">
          {WEEK.filter((d) => routine.daysOfWeek.includes(d)).map((d) => (
            <button key={d} type="button" aria-pressed={d === day.dayOfWeek} onClick={() => setDay({ ...overrideFor(routine, d) })} className={`${s.chip} ${d === day.dayOfWeek ? SOLID : QUIET}`}>{DAY_NAMES[d].slice(0, 3)}</button>
          ))}
        </div>
        <Stepper surface={surface} label="In at" value={day.startLocal || routine.startLocal} onStep={(delta) => save({ ...day, startLocal: stepTime(day.startLocal || routine.startLocal, delta, { max: day.endLocal || routine.endLocal }) })} />
        <Stepper surface={surface} label="Out at" value={day.endLocal || routine.endLocal} onStep={(delta) => save({ ...day, endLocal: stepTime(day.endLocal || routine.endLocal, delta, { min: day.startLocal || routine.startLocal }) })} />
        {!work && <DriverChips surface={surface} label="Drop-off" value={day.dropoffDriverName ?? ''} drivers={drivers} onPick={(d) => save({ ...day, dropoffDriverName: d?.name ?? '', dropoffDriverId: d?.id ?? null })} />}
        {!work && <DriverChips surface={surface} label="Pickup" value={day.pickupDriverName ?? ''} drivers={drivers} onPick={(d) => save({ ...day, pickupDriverName: d?.name ?? '', pickupDriverId: d?.id ?? null })} />}
        <div className={s.detail}>{overrideLine(routine, day)}</div>
        <div className="flex gap-[10px]">
          <button type="button" onClick={() => { setRoutine((r) => putOverride(r, day)); setDay(null) }} className={`${s.pill} ${SOLID}`}>Done</button>
          {routine.dayOverrides?.some((o) => o.dayOfWeek === day.dayOfWeek) && (
            <button type="button" onClick={() => { setRoutine((r) => removeOverride(r, day.dayOfWeek)); setDay(null) }} className={`${s.pill} ${OUTLINE}`}>Same as usual</button>
          )}
        </div>
      </div>
    )
  }

  const overrides = (routine.dayOverrides ?? []).filter((o) => o.enabled !== false && routine.daysOfWeek.includes(o.dayOfWeek)).sort((a, b) => WEEK.indexOf(a.dayOfWeek) - WEEK.indexOf(b.dayOfWeek))
  return (
    <div className="flex flex-col gap-[6px]">
      <div className="flex items-center gap-[12px] pb-[8px]">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={s.small}>{personName}</span>
          <span className={s.name}>{isNew ? `New ${kindName.toLowerCase()}` : named ? routine.title : `${kindName} routine`}</span>
        </span>
        <button type="button" onClick={onCancel} className={`${s.pill} ${OUTLINE}`}>Cancel</button>
        <button type="button" disabled={saving} onClick={() => void save()} className={`${s.pill} ${SOLID}`}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
      {error && <div role="alert" className={`${s.line} text-wall-rust`}>{error}</div>}

      {named && (
        <div className={section}>
          <span className={s.label}>WHAT IT’S CALLED</span>
          {picking === 'title'
            ? <div className="flex flex-col gap-[8px]">{typed('Piano, Huskies practice…', finishTitle)}<button type="button" onClick={finishTitle} className={`${s.pill} ${SOLID} self-start`}>Done</button></div>
            : <div className="flex items-center gap-[12px]"><span className={`${s.line} flex-1`}>{routine.title}</span><button type="button" onClick={() => startTyping('title')} className={`${s.pill} ${OUTLINE}`}>Change</button></div>}
          {picking === 'title' && surface === 'wall' && <WallKeyboard value={text} onChange={setText} onDone={finishTitle} />}
        </div>
      )}

      <div className={section}>
        <span className={s.label}>WHERE</span>
        <div className="flex items-center gap-[12px]">
          <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
            <span className={s.line}>{routine.venueName || (work ? 'Not set (home or office)' : 'Not set yet')}</span>
            {routine.venueAddress && <span className={s.detail}>{routine.venueAddress}</span>}
          </span>
          <button type="button" onClick={() => startTyping('place')} className={`${s.pill} ${OUTLINE}`}>Change</button>
        </div>
      </div>

      <div className={section}>
        <span className={s.label}>DAYS AND HOURS</span>
        <div className="flex gap-[8px]" role="group" aria-label={`Days: ${daysLabel(routine.daysOfWeek)}`}>
          {WEEK.map((d, i) => {
            const on = routine.daysOfWeek.includes(d)
            return <button key={d} type="button" aria-label={DAY_NAMES[d]} aria-pressed={on} onClick={() => setRoutine((r) => toggleDay(r, d))} className={`${s.chip} ${on ? SOLID : QUIET} px-0`}>{WEEK_LETTERS[i]}</button>
          })}
        </div>
        <Stepper surface={surface} label="Starts" value={routine.startLocal} onStep={(delta) => setRoutine((r) => stepHours(r, 'start', delta))} />
        <Stepper surface={surface} label="Ends" value={routine.endLocal} onStep={(delta) => setRoutine((r) => stepHours(r, 'end', delta))} />
        <span className={s.small}>DIFFERENT ON SOME DAYS</span>
        {overrides.map((o) => (
          <div key={o.dayOfWeek} className="flex items-center gap-[12px]">
            <span className={`${s.detail} flex-1`}>{overrideLine(routine, o)}</span>
            <button type="button" onClick={() => setDay({ ...o })} className={`${s.pill} ${OUTLINE}`}>Edit</button>
          </div>
        ))}
        {routine.daysOfWeek.length > 0 && (
          <button type="button" onClick={() => setDay({ ...overrideFor(routine, WEEK.find((d) => routine.daysOfWeek.includes(d) && !overrides.some((o) => o.dayOfWeek === d)) ?? routine.daysOfWeek[0]) })} className={`${s.pill} ${QUIET} self-start`}>
            A day that’s different
          </button>
        )}
      </div>

      {!work && (
        <div className={section}>
          <span className={s.label}>WHO DRIVES</span>
          <DriverChips surface={surface} label="Drop-off" value={routine.dropoffDriverName} drivers={drivers} onPick={(d) => setRoutine((r) => setDriver(r, 'dropoff', d))} />
          <DriverChips surface={surface} label="Pickup" value={routine.pickupDriverName} drivers={drivers} onPick={(d) => setRoutine((r) => setDriver(r, 'pickup', d))} />
          <span className={s.small}>Or by day: “Kelly picks {personName} up on Fridays.”</span>
        </div>
      )}

      {!work && (
        <div className={section}>
          <span className={s.label}>{kind === 'school' ? 'THE SCHOOL YEAR' : 'WHEN IT RUNS'}</span>
          <div className="flex flex-wrap items-center gap-[10px]">
            <span className={`${s.line} flex-1`}>{yearLine(routine)}</span>
            <button type="button" onClick={() => setPicking('yearStart')} className={`${s.pill} ${OUTLINE}`}>{routine.startDate ? `From ${dayText(routine.startDate, false)}` : 'Starts'}</button>
            <button type="button" onClick={() => setPicking('yearEnd')} className={`${s.pill} ${OUTLINE}`}>{routine.endDate ? `To ${dayText(routine.endDate, false)}` : 'Ends'}</button>
          </div>
        </div>
      )}

      <div className={section}>
        <span className={s.label}>DAYS OFF</span>
        <div className="flex flex-wrap gap-[8px]">
          {offs.filter((d) => d.end >= ymd(now)).map((d) => (
            <span key={d.id} className={`${s.chip} ${QUIET} gap-[6px] pr-[6px]`}>
              {d.start === d.end ? dayText(d.start, false) : `${dayText(d.start, false)} – ${dayText(d.end, false)}`}
              <button type="button" aria-label={`Remove the day off ${dayText(d.start, false)}`} onClick={() => (d.id.startsWith('new:') ? setOffAdd((l) => l.filter((x) => x !== d.start)) : setOffRemove((l) => [...l, d.id]))} className="flex h-[44px] w-[44px] items-center justify-center rounded-full border-0 bg-transparent p-0 text-wall-ink-2">
                <X size={surface === 'wall' ? 20 : 16} />
              </button>
            </span>
          ))}
          <button type="button" onClick={() => setPicking('dayOff')} className={`${s.chip} ${QUIET}`}>Add a day off</button>
        </div>
        <span className={s.small}>Or say it: “No school Monday”, “{personName}’s out at noon Friday.”</span>
      </div>

      {!isNew && (
        <div className={`${rule} ${s.row} flex flex-wrap items-center gap-[10px]`}>
          {removing ? (
            <>
              <span className={`${s.detail} flex-1`}>Remove this routine? The wall stops showing it.</span>
              <button type="button" onClick={() => void remove()} className={`${s.pill} border-0 bg-wall-rust text-wall-on-pigment`}>Yes, remove</button>
              <button type="button" onClick={() => setRemoving(false)} className={`${s.pill} ${OUTLINE}`}>Keep it</button>
            </>
          ) : (
            <button type="button" onClick={() => setRemoving(true)} className={`${s.pill} border-0 bg-transparent px-0 text-wall-rust`}>Remove this routine</button>
          )}
        </div>
      )}
    </div>
  )
}
