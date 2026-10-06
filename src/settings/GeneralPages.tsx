import { useMemo, useState, type ReactNode } from 'react'
import { Plus, Search, X } from 'lucide-react'
import { pigmentIndexes } from '../wall/score'
import { choreDays, choreTime, newChore } from '../wall/choreText'
import ChoreEditor from '../wall/ChoreEditor'
import RoutineEditor from '../wall/RoutineEditor'
import { newRoutine, routineDetail, routineHeadline } from '../wall/routines'
import type { FamilyRoutine } from '../lib/familyRoutines'
import FamilyPins from '../signin/FamilyPins'
import type { WallChore } from '../wall/engine/chores'
import type { WallMember } from '../wall/engine/types'
import { people, useSource, type MemoryItem } from './data'
import { ago } from './model'
import { Action, Group, Label, PageHead, PersonDisc, Quiet, Row, Seg, Stepper, Toggle } from './ui'
import { LightDay, LightNow } from './WallLight'
import { usePigment, useSize, useType } from './sizing'
import { useSaveNote } from './saveNote'

// Settings V2 › General (canvas 47b–c): the household's six pages. Each answers one question, saves as it changes,
// and asks before anything that can't be taken back.

const ROLE: Record<string, string> = { parent: 'Parent', child: 'Kid', caregiver: 'Caregiver' }
/** Where a memory came from, in words (casa_memory.source). */
const SOURCE: Record<string, string> = { learned: 'picked up on its own', told: 'you told it', old_app: 'from the old app' }

function TextField({ value, onChange, placeholder, label, onEnter }: { value: string; onChange: (v: string) => void; placeholder: string; label: string; onEnter?: () => void }) {
  const t = useType()
  const wall = useSize() === 'wall'
  return (
    <label className={`flex items-center gap-[10px] rounded-full border border-solid border-wall-stone bg-wall-on-pigment px-[16px] ${wall ? 'h-[64px]' : 'h-[46px]'}`}>
      <Search size={wall ? 24 : 17} aria-hidden="true" className="shrink-0 text-wall-ink-2" />
      <input aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onEnter?.() }} placeholder={placeholder}
        className={`min-w-0 flex-1 border-0 bg-transparent font-body text-wall-ink outline-none placeholder:text-wall-ink-2 ${t.body}`} />
    </label>
  )
}

/** A sheet over the page (an editor), the phone's own. */
function Sheet({ children, onClose, label }: { children: ReactNode; onClose: () => void; label: string }) {
  return (
    <div className="phone-scrim fixed inset-0 z-50 flex items-end justify-center bg-wall-ink/35" onClick={onClose}>
      <section aria-label={label} onClick={(e) => e.stopPropagation()} className="phone-sheet max-h-[92vh] w-full max-w-[640px] overflow-y-auto rounded-t-[26px] bg-phone-ground px-[20px] pb-[max(30px,calc(env(safe-area-inset-bottom)+12px))] pt-[18px]">
        {children}
      </section>
    </div>
  )
}

// ── Family ──────────────────────────────────────────────────────────────────────────────────────────────
export function FamilyPage({ head }: { head: ReactNode }) {
  const src = useSource()
  const members = src.useMembers()
  const viewer = src.useViewer()
  const faceId = src.useFaceId()
  const pigment = usePigment(members)
  const [open, setOpen] = useState<string | null>(null)
  const [pins, setPins] = useState(false)
  const [adding, setAdding] = useState<{ name: string; role: 'parent' | 'child' | 'caregiver'; drives: boolean } | null>(null)
  const [note, show] = useSaveNote()
  const t = useType()
  const person = people(members).find((m) => m.id === open) ?? null

  if (person) {
    return (
      <div>
        <PageHead title={person.full_name ?? person.name} about={ROLE[person.role] ?? person.role} back="Family" onBack={() => setOpen(null)} />
        <Group label="Driving">
          <Row name="Drives" state={person.can_drive ? 'Can be the driver for an event' : 'Never offered as a driver'}
            right={<Toggle label={`${person.name} drives`} on={person.can_drive} onChange={async (on) => show(await src.setCanDrive(person.id, on), on ? `${person.name} can drive.` : `${person.name} won’t be offered as a driver.`)} />} />
        </Group>
        {note}
        <Group label="Signing in">
          <Row name="PIN" state="Set or change it in Family PINs" onClick={() => setPins(true)} />
          {viewer.id === person.id && !src.onWall && (
            <Row name="Face ID on this phone" state={faceId.here ? 'On' : faceId.available ? 'Off · sign in with a look instead of a PIN' : 'Not available on this device'}
              right={faceId.here ? undefined : <Toggle label="Face ID on this phone" on={false} disabled={!faceId.available || !faceId.setUp} onChange={async () => { const done = await faceId.setUp?.(); show({ ok: Boolean(done), message: 'Face ID wasn’t set up.' }, 'Face ID is on.') }} />} />
          )}
        </Group>
        {pins && <Sheet label="Family PINs" onClose={() => setPins(false)}><FamilyPins onDone={() => setPins(false)} /></Sheet>}
      </div>
    )
  }

  return (
    <div>
      {head}
      <Group label="People">
        {members == null ? <Quiet>Loading…</Quiet> : people(members).map((m) => (
          <Row key={m.id} label={`Open ${m.name}`} onClick={() => setOpen(m.id)} lead={<PersonDisc name={m.name} className={pigment(m.id)} />}
            name={m.name} state={[ROLE[m.role] ?? m.role, m.can_drive ? 'drives' : null, viewer.id === m.id && faceId.here ? 'Face ID' : null].filter(Boolean).join(' · ')} />
        ))}
      </Group>
      <div className="mt-[8px] px-[4px]"><Action onClick={() => setAdding({ name: '', role: 'child', drives: false })}><Plus size={18} aria-hidden="true" /> Add someone</Action></div>
      <Group label="Signing in">
        <Row name="Family PINs" state="Set, change or reset anyone’s PIN" onClick={() => setPins(true)} />
        {viewer.id && !src.onWall && (
          <Row name="Face ID on this phone" state={faceId.here ? `On for ${viewer.name}` : faceId.available ? 'Off' : 'Not available on this device'}
            right={faceId.here ? undefined : <Toggle label="Face ID on this phone" on={false} disabled={!faceId.available || !faceId.setUp} onChange={async () => { const done = await faceId.setUp?.(); show({ ok: Boolean(done), message: 'Face ID wasn’t set up.' }, 'Face ID is on.') }} />} />
        )}
      </Group>
      {note}
      {pins && <Sheet label="Family PINs" onClose={() => setPins(false)}><FamilyPins onDone={() => setPins(false)} /></Sheet>}
      {adding && (
        <Sheet label="Add someone" onClose={() => setAdding(null)}>
          <h2 className={`m-0 font-display font-semibold text-wall-ink ${t.heading}`}>Add someone</h2>
          <p className={`m-0 mt-[4px] text-wall-ink-2 ${t.detail}`}>They get the next color and a row on the wall.</p>
          <input aria-label="Their name" placeholder="Their name" value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })}
            className={`mt-[12px] h-[48px] w-full rounded-[12px] border border-solid border-wall-stone bg-wall-on-pigment px-[14px] font-body text-wall-ink ${t.body}`} />
          <div className="mt-[12px]">
            <Seg label="Who they are" value={adding.role} onChange={(role) => setAdding({ ...adding, role, drives: role !== 'child' })} options={[{ value: 'parent', label: 'Parent' }, { value: 'child', label: 'Kid' }, { value: 'caregiver', label: 'Caregiver' }]} />
          </div>
          <div className="mt-[8px]"><Row name="Drives" right={<Toggle label="They drive" on={adding.drives} onChange={(on) => setAdding({ ...adding, drives: on })} />} /></div>
          <div className="mt-[8px] flex justify-end gap-[18px]">
            <Action tone="quiet" onClick={() => setAdding(null)}>Cancel</Action>
            <Action disabled={!adding.name.trim()} onClick={async () => { const r = await src.addMember(adding.name, adding.role, adding.drives); show(r, `${adding.name.trim()} is in the family.`); if (r.ok) setAdding(null) }}>Add</Action>
          </div>
        </Sheet>
      )}
    </div>
  )
}

// ── Places and people ───────────────────────────────────────────────────────────────────────────────────
export function PlacesPage({ head }: { head: ReactNode }) {
  const src = useSource()
  const t = useType()
  const home = src.useHome()
  const places = src.usePlaces()
  const contacts = src.useContacts()
  const [tab, setTab] = useState<'places' | 'people'>('places')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [note, show] = useSaveNote()
  const match = (...parts: Array<string | null | undefined>) => !q.trim() || parts.some((p) => p?.toLowerCase().includes(q.trim().toLowerCase()))
  // The ones you go to most first (170 saved, many seen once in an email); a place dismissed in the old directory stays hidden.
  const uses = (p: object) => Number((p as { occurrence_count?: number | null }).occurrence_count ?? 0)
  const live = (places ?? []).filter((p) => !(p as { dismissed_at?: string | null }).dismissed_at)
  const [gone, setGone] = useState<Set<string>>(new Set())
  const suggested = live.filter((p) => p.confirmed === false && !gone.has(p.id))
  const shownPlaces = live.filter((p) => p.confirmed !== false && match(p.name, p.address, p.city, p.category))
    .sort((a, b) => uses(b) - uses(a) || a.name.localeCompare(b.name))
  const shownPeople = (contacts ?? []).filter((c) => match(c.name, c.relationship, c.place_name))

  return (
    <div>
      {head}
      <div className="mt-[14px] flex flex-col gap-[12px]">
        <Seg label="Places or people" value={tab} onChange={setTab} options={[{ value: 'places', label: 'Places' }, { value: 'people', label: 'People' }]} />
        <TextField value={q} onChange={setQ} label={tab === 'places' ? 'Find a place' : 'Find a person'} placeholder={tab === 'places' ? 'Find a place' : 'Find a person'} />
      </div>
      {tab === 'places' ? (
        <>
          <Group label="Home"><Row name="Home" state={home ?? 'Not set'} /></Group>
          {suggested.length > 0 && !q.trim() && (
            <Group label={`Found in email and events · ${suggested.length}`}>
              {suggested.slice(0, 6).map((p) => (
                <Row key={p.id} name={p.name} state={[p.address, p.city].filter(Boolean).join(', ')}
                  right={<div className="flex gap-[14px]">
                    <Action label={`Keep ${p.name}`} onClick={async () => { setGone(new Set(gone).add(p.id)); show(await src.keepPlace(p.id), `${p.name} is saved.`) }}>Keep</Action>
                    <Action label={`Not a place: ${p.name}`} tone="quiet" onClick={async () => { setGone(new Set(gone).add(p.id)); show(await src.dismissPlace(p.id), 'Put away.') }}>No</Action>
                  </div>} />
              ))}
            </Group>
          )}
          <Group label={places ? `Saved · ${shownPlaces.length}` : 'Saved'}>
            {places == null ? <Quiet>Loading…</Quiet> : shownPlaces.length === 0 ? <Quiet>No place matches “{q}”.</Quiet> : shownPlaces.map((p) => (
              <Row key={p.id} label={`Open ${p.name}`} onClick={() => { setEditing({ id: p.id, name: p.name }); setConfirmDelete(false) }} name={p.name}
                state={[p.category && p.category !== 'other' ? p.category.charAt(0).toUpperCase() + p.category.slice(1) : null, [p.address, p.city].filter(Boolean).join(', '), uses(p) > 1 ? `used ${uses(p)} times` : null].filter(Boolean).join(' · ')} />
            ))}
          </Group>
        </>
      ) : (
        <Group label={contacts ? `People · ${contacts.length}` : 'People'}>
          {contacts == null ? <Quiet>Loading…</Quiet> : shownPeople.length === 0 ? <Quiet>No one matches “{q}”.</Quiet> : shownPeople.map((c) => (
            <Row key={c.id} name={c.name} state={[c.relationship, c.phone, c.place_name].filter(Boolean).join(' · ')} />
          ))}
        </Group>
      )}
      {note}
      {editing && (
        <Sheet label={`${editing.name} — edit`} onClose={() => setEditing(null)}>
          <h2 className={`m-0 font-display font-semibold text-wall-ink ${t.heading}`}>Rename the place</h2>
          <input aria-label="The place’s name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            className={`mt-[12px] h-[48px] w-full rounded-[12px] border border-solid border-wall-stone bg-wall-on-pigment px-[14px] font-body text-wall-ink ${t.body}`} />
          <div className="mt-[14px] flex items-center justify-between gap-[12px]">
            {confirmDelete
              ? <Action tone="rust" onClick={async () => { show(await src.deletePlace(editing.id), 'Place removed.'); setEditing(null) }}>Yes, remove it</Action>
              : <Action tone="rust" onClick={() => setConfirmDelete(true)}>Remove</Action>}
            <div className="flex gap-[18px]">
              <Action tone="quiet" onClick={() => setEditing(null)}>Cancel</Action>
              <Action disabled={!editing.name.trim()} onClick={async () => { show(await src.renamePlace(editing.id, editing.name)); setEditing(null) }}>Save</Action>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  )
}

// ── Calendars and email ─────────────────────────────────────────────────────────────────────────────────
export function CalendarsPage({ head }: { head: ReactNode }) {
  const src = useSource()
  const now = src.now()
  const connections = src.useConnections()
  const members = src.useMembers()
  const pigment = usePigment(members)
  const { data: email, change } = src.useEmail()
  const readers = src.useEmailReaders()
  const [choosing, setChoosing] = useState<{ id: string; name: string } | null>(null)
  const [topic, setTopic] = useState('')
  const [note, show] = useSaveNote()
  const linked = (connections ?? []).filter((m) => m.connection || m.role === 'parent')
  const calendars = linked.flatMap((m) => (m.connection?.read_calendar_metadata ?? []).map((c) => ({ ...c, who: m.name })))

  return (
    <div>
      {head}
      <Group label="Google">
        {connections == null ? <Quiet>Loading…</Quiet> : linked.map((m) => {
          const c = m.connection
          const broken = Boolean(c?.reauthorization_required || c?.health_status === 'reauthorization_required' || c?.last_sync_error)
          return (
            <Row key={m.id} lead={<PersonDisc name={m.name} className={pigment(m.id)} />} name={m.name}
              state={!c ? 'Not connected' : broken ? 'Needs signing in again' : `${c.google_email} · checked ${ago(c.last_sync_at, now)}`}
              tone={!c ? 'quiet' : broken ? 'rust' : 'good'}
              right={!c || broken ? <Action onClick={() => void src.connectGoogle(m.id)}>{c ? 'Reconnect' : 'Connect'}</Action> : undefined} />
          )
        })}
        {linked.filter((m) => m.connection && !m.connection.reauthorization_required).map((m) => (
          <Row key={`choose-${m.id}`} label={`Choose ${m.name}’s calendars`} onClick={() => setChoosing({ id: m.id, name: m.name })} name={`${m.name}’s calendars`} state="Choose which ones show on the family calendar" />
        ))}
        <Row name="Check calendars now" state="They’re checked every few minutes on their own" right={<Action onClick={async () => show(await src.run('sync_calendars'), 'Checking now.')}>Check</Action>} />
      </Group>
      {calendars.length > 0 && (
        <Group label="Calendars read">
          {calendars.map((c) => <Row key={`${c.who}-${c.id}`} name={c.summary} state={c.who} lead={<span aria-hidden="true" className="h-[12px] w-[12px] shrink-0 rounded-full bg-wall-brass" style={c.backgroundColor ? { background: c.backgroundColor } : undefined} />} />)}
        </Group>
      )}
      <Group label="The email reader">
        {readers.on == null ? <Quiet>Loading…</Quiet> : linked.filter((m) => m.connection).map((m) => (
          <Row key={`gmail-${m.id}`} name={`Reads ${m.name}’s email`} state={readers.on?.[m.id] ? 'On · it adds what has a date, and asks first' : 'Off'}
            right={<Toggle label={`Read ${m.name}’s email`} on={Boolean(readers.on?.[m.id])} onChange={async (on) => show(await readers.set(m.id, on), on ? `Reading ${m.name}’s email.` : `Not reading ${m.name}’s email.`)} />} />
        ))}
      </Group>
      <Label>Keep me posted</Label>
      <div className="flex flex-col gap-[10px]">
        <TextField value={topic} onChange={setTopic} label="Keep me posted on" placeholder="“Liv’s coach”, “the school”" onEnter={async () => { if (topic.trim()) { show(await change({ action: 'add_rule', text: topic }), `I’ll keep you posted on ${topic.trim()}.`); setTopic('') } }} />
        <Group>
          {email == null ? <Quiet>Loading…</Quiet> : email.keep.length === 0 ? <Quiet>Nothing yet. Every email about these comes to you, never skipped.</Quiet> : email.keep.map((k) => (
            <Row key={k.id} name={k.label} state={k.kind === 'sender' ? 'From this sender' : 'About this'}
              right={<Action label={`Stop keeping me posted on ${k.label}`} tone="quiet" onClick={async () => show(await change({ action: 'remove_rule', id: k.id }), `No longer keeping you posted on ${k.label}.`)}><X size={18} /></Action>} />
          ))}
        </Group>
      </div>
      {email && email.quiet.length > 0 && (
        <Group label="Kept quiet">
          {email.quiet.map((q) => <Row key={q.id} name={q.from} state={`${q.skipped} skipped`} right={<Action onClick={async () => show(await change({ action: 'bring_back', id: q.id }), `${q.from} will come to you again.`)}>Bring back</Action>} />)}
        </Group>
      )}
      {choosing && <CalendarChooser who={choosing} onClose={() => setChoosing(null)} onSaved={(r) => { show(r, 'Calendars saved.'); setChoosing(null) }} />}
      <Group label="On the wall">
        <Row name="What an email says" state={email?.text_on_wall === false ? 'Off · the wall shows only who it’s from' : 'On · the wall shows a line of what it says'}
          right={<Toggle label="Email text on the wall" on={email?.text_on_wall !== false} disabled={!email} onChange={async (on) => show(await change({ action: 'text_on_wall', on }))} />} />
      </Group>
      {note}
    </div>
  )
}

function CalendarChooser({ who, onClose, onSaved }: { who: { id: string; name: string }; onClose: () => void; onSaved: (r: { ok: boolean; message?: string }) => void }) {
  const src = useSource()
  const t = useType()
  const { calendars, readIds, writeId, save } = src.useCalendarChoices(who.id)
  const [picked, setPicked] = useState<string[] | null>(null)
  const chosen = picked ?? readIds
  return (
    <Sheet label={`${who.name}’s calendars`} onClose={onClose}>
      <h2 className={`m-0 font-display font-semibold text-wall-ink ${t.heading}`}>{who.name}’s calendars</h2>
      <p className={`m-0 mt-[4px] text-wall-ink-2 ${t.detail}`}>The ones switched on show on the family calendar. New events go to the first.</p>
      <div className="mt-[12px]">
        <Group>
          {calendars == null ? <Quiet>Asking Google…</Quiet> : calendars.map((c) => (
            <Row key={c.id} lead={<span aria-hidden="true" className="h-[12px] w-[12px] shrink-0 rounded-full bg-wall-brass" style={c.color ? { background: c.color } : undefined} />}
              name={c.summary} state={c.id === writeId ? 'Where new events go' : c.primary ? 'Their main calendar' : undefined}
              right={c.id === writeId ? undefined : <Toggle label={`Show ${c.summary}`} on={chosen.includes(c.id)} onChange={(on) => setPicked(on ? [...chosen, c.id] : chosen.filter((x) => x !== c.id))} />} />
          ))}
        </Group>
      </div>
      <div className="mt-[12px] flex justify-end gap-[18px]">
        <Action tone="quiet" onClick={onClose}>Cancel</Action>
        <Action disabled={!calendars || picked == null} onClick={async () => onSaved(await save(chosen))}>Save</Action>
      </div>
    </Sheet>
  )
}

// ── The wall ────────────────────────────────────────────────────────────────────────────────────────────
const secs = (s: number) => (s < 60 ? `${s} sec` : `${Math.round((s / 60) * 10) / 10} min`)

export function WallPage({ head }: { head: ReactNode }) {
  const src = useSource()
  const { config, save } = src.useDisplay()
  const screen = src.useScreen()
  const light = src.useWallLight()
  const now = src.now()
  const [note, show] = useSaveNote()
  const c = config ?? {}
  const min = c.brightness_min ?? 0
  const max = c.brightness_max ?? 100
  // Held at one brightness when the range is closed and the old range is kept to go back to.
  const following = !(c.follow_room_backup && min === max)
  const set = async (patch: Parameters<typeof save>[0], words?: string) => show(await save(patch), words)

  return (
    <div>
      {head}
      <LightNow now={light.now} live={src.onWall} at={now} />
      <LightDay samples={light.today} at={now} />
      <Group label="Brightness">
        <Row name="Follow the room’s light" state={following ? 'The wall sensor dims it in a dark room and brightens it in a bright one, between these two.' : `Held at ${max}%, whatever the room`}
          right={<Toggle label="Follow the room’s light" on={following} onChange={(on) => void (on
            ? set({ brightness_min: c.follow_room_backup?.min ?? 0, brightness_max: c.follow_room_backup?.max ?? 50, follow_room_backup: null }, 'Following the room again.')
            : set({ follow_room_backup: { min, max }, brightness_min: max, brightness_max: max }, `Held at ${max}%.`))} />} />
        {following ? (
          <>
            <Row name="Dimmest" right={<Stepper label="Dimmest brightness" value={min} min={0} max={Math.max(0, max - 5)} step={5} unit="%" onChange={(v) => void set({ brightness_min: v })} />} />
            <Row name="Brightest" right={<Stepper label="Brightest brightness" value={max} min={Math.min(100, min + 5)} max={100} step={5} unit="%" onChange={(v) => void set({ brightness_max: v })} />} />
          </>
        ) : (
          <Row name="Hold at" right={<Stepper label="Hold the brightness at" value={max} min={5} max={100} step={5} unit="%" onChange={(v) => void set({ brightness_min: v, brightness_max: v })} />} />
        )}
      </Group>
      <Group label="Sleep">
        <Row name="Sleep when the room is dark" state="Wakes as soon as a light comes on" right={<Toggle label="Sleep when the room is dark" on={c.auto_sleep_enabled !== false} onChange={(on) => void set({ auto_sleep_enabled: on })} />} />
        {c.auto_sleep_enabled !== false && (
          <Row name="After the room goes dark" right={<Stepper label="Sleep after the room goes dark" value={c.sleep_delay_s ?? 120} min={30} max={900} step={30} format={secs} onChange={(v) => void set({ sleep_delay_s: v })} />} />
        )}
        <Row name="Night glow" state="A faint candle glow on the light strip at night" right={<Toggle label="Night glow" on={c.led_night_glow !== false} onChange={(on) => void set({ led_night_glow: on })} />} />
      </Group>
      {src.onWall && (
        <Group label="The light sensor, on this wall">
          <Row name="Sleep when darker than" state={`The room is ${light.now?.lux != null ? `${Math.round(light.now.lux * 10) / 10} lux` : '—'} now`}
            right={<Stepper label="Sleep when darker than" value={c.sleep_lux_threshold ?? 1.1} min={0.2} max={20} step={0.2} format={(v) => `${Math.round(v * 10) / 10} lux`} onChange={(v) => void set({ sleep_lux_threshold: Math.round(v * 10) / 10, wake_lux_threshold: Math.max(c.wake_lux_threshold ?? 1.2, Math.round((v + 0.1) * 10) / 10) })} />} />
          <Row name="Wake when brighter than" state="A little above the sleep level, so it doesn’t flicker"
            right={<Stepper label="Wake when brighter than" value={c.wake_lux_threshold ?? 1.2} min={Math.round(((c.sleep_lux_threshold ?? 1.1) + 0.1) * 10) / 10} max={25} step={0.2} format={(v) => `${Math.round(v * 10) / 10} lux`} onChange={(v) => void set({ wake_lux_threshold: Math.round(v * 10) / 10 })} />} />
          <Row name="The light strip" state="Plays its yes flash once" right={<Action onClick={async () => show(await src.wallDo('test_light'), 'There it goes.')}>Try it</Action>} />
        </Group>
      )}
      {src.onWall && (
        <Group label="This screen">
          <Row name="Turn off when nobody’s touched it" state="Only this screen" right={<Toggle label="Turn the screen off when idle" on={screen.settings.displaySleepEnabled} onChange={(on) => screen.update({ displaySleepEnabled: on })} />} />
          {screen.settings.displaySleepEnabled && (
            <Row name="After" right={<Stepper label="Turn off after" value={screen.settings.displayOffMins} min={2} max={120} step={1} unit="min" onChange={(v) => screen.update({ displayOffMins: v })} />} />
          )}
        </Group>
      )}
      {note}
    </div>
  )
}

// ── What the assistant knows ────────────────────────────────────────────────────────────────────────────
const SHOW = 30

export function KnowsPage({ head }: { head: ReactNode }) {
  const src = useSource()
  const t = useType()
  const members = src.useMembers()
  const pigment = usePigment(members)
  const { items, forget, confirm } = src.useMemory()
  const [hidePrivate, setHidePrivate] = src.usePrivateOnWall()
  const [who, setWho] = useState<string>('all')
  const [q, setQ] = useState('')
  const [all, setAll] = useState(false)
  const [note, show] = useSaveNote()
  const nameOf = (i: MemoryItem) => members?.find((m) => m.id === i.about_member_id)?.name ?? i.about_label ?? 'The house'
  const shown = (items ?? []).filter((i) => (who === 'all' || i.about_member_id === who) && (!q.trim() || i.text.toLowerCase().includes(q.trim().toLowerCase())))
  const unsure = shown.filter((i) => i.confidence !== 'sure')
  const sure = shown.filter((i) => i.confidence === 'sure')
  const line = (i: MemoryItem) => (
    <div key={i.id} className={`flex items-start gap-[12px] px-[14px] py-[12px]`}>
      {i.about_member_id ? <PersonDisc name={nameOf(i)} className={pigment(i.about_member_id)} /> : <PersonDisc name={i.about_label ?? 'House'} className="bg-wall-ink-2" />}
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className={`text-wall-ink ${t.body}`}>{i.text}</span>
        <span className={`text-wall-ink-2 ${t.detail}`}>{[nameOf(i), i.kind === 'thought' ? 'something to come back to' : null, i.sensitive ? 'private' : null, i.source ? SOURCE[i.source] ?? `from ${i.source}` : null, new Date(i.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })].filter(Boolean).join(' · ')}</span>
        <div className="flex gap-[18px]">
          {i.confidence !== 'sure' && <Action label={`Yes, keep: ${i.text}`} onClick={async () => show(await confirm(i.id), 'Kept as sure.')}>Yes, it’s right</Action>}
          <Action label={`Forget: ${i.text}`} tone="quiet" onClick={async () => show(await forget(i.id), 'Forgotten.')}>Forget</Action>
        </div>
      </div>
    </div>
  )
  const chips = [{ id: 'all', name: 'Everyone' }, ...people(members).map((m) => ({ id: m.id, name: m.name }))]

  return (
    <div>
      {head}
      <div className="mt-[14px] flex flex-col gap-[12px]">
        <TextField value={q} onChange={setQ} label="Search what it knows" placeholder="Search what it knows" />
        <div className="-mx-[4px] flex gap-[8px] overflow-x-auto px-[4px] pb-[2px]" role="group" aria-label="Whose">
          {chips.map((c) => (
            <button key={c.id} type="button" aria-pressed={who === c.id} onClick={() => setWho(c.id)}
              className={`h-[40px] shrink-0 rounded-full px-[14px] font-semibold ${t.detail} ${who === c.id ? 'border-2 border-solid border-wall-ink bg-wall-on-pigment text-wall-ink' : 'border border-solid border-wall-stone bg-transparent text-wall-ink'}`}>{c.name}</button>
          ))}
        </div>
      </div>
      {note}
      {items == null ? <Group><Quiet>Loading…</Quiet></Group> : (
        <>
          <Group label={`Not sure yet · ${unsure.length}`}>{unsure.length ? unsure.slice(0, all ? undefined : SHOW).map(line) : <Quiet>Nothing it’s unsure of.</Quiet>}</Group>
          <Group label={`Sure · ${sure.length}`}>{sure.length ? sure.slice(0, all ? undefined : SHOW).map(line) : <Quiet>Nothing here yet.</Quiet>}</Group>
          {!all && (unsure.length > SHOW || sure.length > SHOW) && <div className="mt-[10px] px-[4px]"><Action onClick={() => setAll(true)}>Show all {unsure.length + sure.length}</Action></div>}
        </>
      )}
      <Group label="On the wall">
        <Row name="Keep private things off the wall" state={hidePrivate ? 'On · private things show only on your phone' : 'Off · everything shows on the wall'}
          right={<Toggle label="Keep private things off the wall" on={hidePrivate} onChange={async (on) => show(await setHidePrivate(on))} />} />
      </Group>
    </div>
  )
}

// ── Chores and routines ─────────────────────────────────────────────────────────────────────────────────
export function ChoresPage({ head }: { head: ReactNode }) {
  const src = useSource()
  const size = useSize()
  const now = src.now()
  const members = src.useMembers()
  const viewer = src.useViewer()
  const pigment = usePigment(members)
  const { chores, save: saveChore, remove: removeChore } = src.useChores()
  const kept = src.useKeptCount()
  const [editing, setEditing] = useState<{ chore: WallChore; isNew: boolean } | null>(null)
  const routines = src.useRoutines()
  const [routineEditing, setRoutineEditing] = useState<{ routine: FamilyRoutine; isNew: boolean; name: string } | null>(null)
  const [adding, setAdding] = useState(false)
  const pigmentIndex = useMemo(() => pigmentIndexes((members ?? []) as unknown as WallMember[]), [members])
  const nameOf = (id: string | null) => members?.find((m) => m.id === id)?.name ?? 'Nobody yet'
  const sorted = [...(chores ?? [])].sort((a, b) => nameOf(a.member_id).localeCompare(nameOf(b.member_id)) || a.time_local.localeCompare(b.time_local))

  return (
    <div>
      {head}
      <Group label="Chores">
        {chores == null ? <Quiet>Loading…</Quiet> : sorted.length === 0 ? <Quiet>No chores yet.</Quiet> : sorted.map((c) => (
          <Row key={c.id} label={`Edit ${c.title}`} onClick={() => setEditing({ chore: c, isNew: false })} lead={<PersonDisc name={nameOf(c.member_id)} className={pigment(c.member_id)} />}
            name={c.title} state={`${nameOf(c.member_id)} · ${choreDays(c.days_of_week)}${c.every_weeks && c.every_weeks > 1 ? `, every ${c.every_weeks} weeks` : ''} · ${choreTime(c.time_local)}`} />
        ))}
      </Group>
      <div className="mt-[8px] px-[4px]"><Action onClick={() => setEditing({ chore: newChore(viewer.id, now), isNew: true })}><Plus size={18} aria-hidden="true" /> Add a chore</Action></div>
      <Group label="Routines: school, work, camp">
        {routines.items == null ? <Quiet>Loading…</Quiet> : routines.items.length === 0 ? <Quiet>No routines yet.</Quiet> : routines.items.map(({ routine, person }) => (
          <Row key={`${person.id}-${routine.key ?? routine.id ?? routine.title}`} label={`Edit ${person.name}’s ${routineHeadline(routine)}`} onClick={() => setRoutineEditing({ routine, isNew: false, name: person.name })}
            lead={<PersonDisc name={person.name} className={pigment(person.id)} />} name={`${person.name} · ${routineHeadline(routine)}`} state={routineDetail(routine)} />
        ))}
      </Group>
      {adding ? (
        <div className="mt-[8px] flex flex-wrap items-center gap-[8px] px-[4px]" role="group" aria-label="Add a routine for">
          {people(members).map((m) => (
            <Action key={m.id} onClick={() => { setAdding(false); setRoutineEditing({ routine: newRoutine(m.role === 'child' ? 'school' : 'work', m.id, (routines.items ?? []).filter((r) => r.person.id === m.id).map((r) => r.routine)), isNew: true, name: m.name }) }}>{m.name}</Action>
          ))}
          <Action tone="quiet" onClick={() => setAdding(false)}>Cancel</Action>
        </div>
      ) : <div className="mt-[8px] px-[4px]"><Action onClick={() => setAdding(true)}><Plus size={18} aria-hidden="true" /> Add a routine</Action></div>}
      <Group label="Keep from">
        <Row name={kept === 0 ? 'Nothing is kept from anyone' : kept === 1 ? '1 event is kept from someone' : `${kept} events are kept from someone`} state="Set on each event: open it and choose “Keep from”" />
      </Group>
      {routineEditing && members && (
        <Sheet label={routineEditing.isNew ? 'New routine' : `${routineEditing.name}’s ${routineHeadline(routineEditing.routine)} — edit`} onClose={() => setRoutineEditing(null)}>
          <RoutineEditor surface={size === 'wall' ? 'wall' : 'phone'} personName={routineEditing.name} routine={routineEditing.routine} isNew={routineEditing.isNew}
            drivers={people(members).filter((m) => m.can_drive).map((m) => ({ id: m.id, name: m.name }))} dayOffs={routines.dayOffs(routineEditing.routine.memberId)} now={now}
            onSave={async (routine, offs) => { await routines.save(routine, offs); setRoutineEditing(null) }}
            onRemove={async () => { await routines.remove(routineEditing.routine); setRoutineEditing(null) }}
            onCancel={() => setRoutineEditing(null)} />
        </Sheet>
      )}
      {editing && members && (
        <Sheet label={editing.isNew ? 'New chore' : `${editing.chore.title} — edit`} onClose={() => setEditing(null)}>
          <ChoreEditor surface={size === 'wall' ? 'wall' : 'phone'} chore={editing.chore} isNew={editing.isNew} members={people(members) as unknown as WallMember[]}
            pigmentOf={(id) => pigmentIndex.get(id) ?? 0} now={now}
            onSave={async (chore) => { await saveChore(chore); setEditing(null) }}
            onRemove={editing.isNew ? undefined : async () => { await removeChore(editing.chore.id); setEditing(null) }}
            onCancel={() => setEditing(null)} />
        </Sheet>
      )}
    </div>
  )
}
