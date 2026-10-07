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
import type { FamilyMember } from '../types'
import { pigmentStyleFor } from '../wall/lanes'
import { everyone, people, useSource, type MemberPatch, type MemoryItem } from './data'
import { ago, moveInOrder, pickColor } from './model'
import { Action, Group, Label, PageHead, PersonDisc, Pill, Quiet, Row, Seg, Sheet, Stepper, Toggle } from './ui'
import { LightDay, LightNow } from './WallLight'
import { usePigment, useSize, useType } from './sizing'
import { useSaveNote } from './saveNote'
import { DEFAULT_CORE, type Persona } from '../../supabase/functions/_shared/house-persona.mjs'

// Settings V2 › General (canvas 47b–c): the household's six pages. Each answers one question, saves as it changes,
// and asks before anything that can't be taken back.

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

// ── Family ──────────────────────────────────────────────────────────────────────────────────────────────
// Profiles (Jake, Oct 6: "change the name, nicknames, add a pet, change the profile avatar color, and additional
// preferences that could be useful to customize the wall and how it presents the family").
const ROLES: Array<{ value: FamilyMember['role']; label: string }> = [
  { value: 'parent', label: 'Parent' }, { value: 'child', label: 'Kid' }, { value: 'caregiver', label: 'Caregiver' }, { value: 'pet', label: 'Pet' },
]
const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`

/** A name field that saves when you leave it (or press return), if it changed. */
function NameField({ label, value, onSave, placeholder }: { label: string; value: string; onSave: (v: string) => void; placeholder?: string }) {
  const t = useType()
  const [draft, setDraft] = useState(value)
  const commit = () => { if (draft.trim() !== value.trim()) onSave(draft.trim()) }
  return (
    <label className="flex flex-col gap-[4px] px-[14px] py-[10px]">
      <span className={`text-wall-ink-2 ${t.detail}`}>{label}</span>
      <input aria-label={label} value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        className={`h-[44px] rounded-[10px] border border-solid border-wall-stone bg-phone-ground px-[12px] font-body text-wall-ink ${t.body}`} />
    </label>
  )
}

function PersonProfile({ person, members, shown, onBack }: { person: FamilyMember; members: FamilyMember[]; shown: Map<string, number>; onBack: () => void }) {
  const src = useSource()
  const t = useType()
  const wall = useSize() === 'wall'
  const viewer = src.useViewer()
  const faceId = src.useFaceId()
  const edits = src.useMemberEdits()
  const [pins, setPins] = useState(false)
  const [nick, setNick] = useState('')
  const [note, show] = useSaveNote()
  const nicknames = person.nicknames ?? []
  const onWall = people(members)
  const place = onWall.findIndex((m) => m.id === person.id)
  const mine = (shown.get(person.id) ?? 0) % 6
  const holder = (c: number) => everyone(members).find((m) => m.id !== person.id && m.show_on_home_sidebar !== false && (shown.get(m.id) ?? 0) % 6 === c)
  const save = async (patch: MemberPatch, words?: string) => show(await edits.update(person.id, patch), words)

  return (
    <div>
      <PageHead title={person.name} about={[ROLES.find((r) => r.value === person.role)?.label, person.full_name && person.full_name !== person.name ? person.full_name : null].filter(Boolean).join(' · ')} back="Family" onBack={onBack} />
      <div className="mt-[14px] flex items-center gap-[14px]">
        <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-full font-display font-bold text-wall-on-pigment ${wall ? 'h-[88px] w-[88px] text-wall-move' : 'h-[64px] w-[64px] text-phone-title'} ${pigmentStyleFor(mine).solid}`}>{person.name.charAt(0)}</span>
        <p className={`m-0 text-wall-ink-2 ${t.detail}`}>{person.show_on_home_sidebar === false ? 'Not on the wall.' : `${ordinal(place + 1)} on the wall, in this color.`}</p>
      </div>
      {note}
      <Group label="Names">
        <NameField label="Name on the wall" value={person.name} onSave={(v) => { if (v) void save({ name: v }, `Now ${v}.`) }} />
        <NameField label="Full name" value={person.full_name ?? ''} placeholder="Olivia Tabor" onSave={(v) => void save({ full_name: v || null })} />
        <div className="px-[14px] py-[10px]">
          <span className={`text-wall-ink-2 ${t.detail}`}>Nicknames · the assistant knows them by these too</span>
          <div className="mt-[6px] flex flex-wrap items-center gap-[8px]">
            {nicknames.map((n) => (
              <span key={n} className={`flex h-[36px] items-center gap-[6px] rounded-full border border-solid border-wall-stone bg-phone-ground pl-[12px] pr-[4px] text-wall-ink ${t.detail}`}>
                {n}<Action label={`Remove the nickname ${n}`} tone="quiet" onClick={() => void save({ nicknames: nicknames.filter((x) => x !== n) }, `${n} removed.`)}><X size={16} /></Action>
              </span>
            ))}
            <input aria-label="Add a nickname" placeholder="Add a nickname" value={nick} onChange={(e) => setNick(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && nick.trim() && !nicknames.includes(nick.trim())) { void save({ nicknames: [...nicknames, nick.trim()] }, `${person.name} is also ${nick.trim()}.`); setNick('') } }}
              className={`h-[36px] w-[160px] rounded-full border border-dashed border-wall-stone bg-transparent px-[12px] font-body text-wall-ink ${t.detail}`} />
          </div>
        </div>
      </Group>
      <Group label="Who they are">
        <div className="px-[14px] py-[12px]">
          <Seg label="Who they are" value={person.role} onChange={(role) => void save({ role, ...(role === 'pet' ? { can_drive: false } : {}) }, `${person.name} is a ${ROLES.find((r) => r.value === role)?.label.toLowerCase()}.`)} options={ROLES} />
        </div>
        {person.role !== 'pet' && (
          <Row name="Drives" state={person.can_drive ? 'Can be the driver for an event' : 'Never offered as a driver'}
            right={<Toggle label={`${person.name} drives`} on={person.can_drive} onChange={(on) => void save({ can_drive: on }, on ? `${person.name} can drive.` : `${person.name} won’t be offered as a driver.`)} />} />
        )}
      </Group>
      <Group label="On the wall">
        <Row name="On the wall" state={person.show_on_home_sidebar === false ? `Off · no row on the wall${person.role === 'pet' ? '' : ', and not offered at sign-in'}` : 'Their own row on the wall, and offered at sign-in'}
          right={<Toggle label={`${person.name} on the wall`} on={person.show_on_home_sidebar !== false} onChange={(on) => void save({ show_on_home_sidebar: on }, on ? `${person.name} is on the wall.` : `${person.name} is off the wall.`)} />} />
        <div className="px-[14px] py-[12px]">
          <span className={`text-wall-ink-2 ${t.detail}`}>Color{holder(mine) ? '' : ''} · picking someone’s swaps the two of you</span>
          <div className="mt-[8px] flex flex-wrap gap-[10px]" role="radiogroup" aria-label={`${person.name}’s color`}>
            {[0, 1, 2, 3, 4, 5].map((c) => {
              const who = holder(c)
              return (
                <button key={c} type="button" role="radio" aria-checked={c === mine} aria-label={`Color ${c + 1}${who ? `, ${who.name}’s now` : ''}`}
                  onClick={async () => { const r = await edits.arrange(pickColor(person.id, c, shown)); show(r, who ? `Swapped colors with ${who.name}.` : 'Color changed.') }}
                  className={`flex items-center justify-center rounded-full border-0 p-0 font-display font-bold text-wall-on-pigment ${wall ? 'h-[64px] w-[64px] text-wall-heading' : 'h-[44px] w-[44px] text-phone-body'} ${pigmentStyleFor(c).solid} ${c === mine ? 'ring-[3px] ring-wall-ink ring-offset-2 ring-offset-wall-on-pigment' : ''}`}>
                  {who ? who.name.charAt(0) : ''}
                </button>
              )
            })}
          </div>
        </div>
        {place >= 0 && (
          <Row name="Place in the order" state={`${ordinal(place + 1)} of ${onWall.length} · the wall’s rows, the phone’s chips and sign-in follow it`}
            right={<div className="flex gap-[14px]">
              <Action label={`Move ${person.name} up`} disabled={place === 0} onClick={async () => show(await edits.arrange(moveInOrder(person.id, -1, onWall, shown)), 'Moved up.')}>Up</Action>
              <Action label={`Move ${person.name} down`} disabled={place === onWall.length - 1} onClick={async () => show(await edits.arrange(moveInOrder(person.id, 1, onWall, shown)), 'Moved down.')}>Down</Action>
            </div>} />
        )}
      </Group>
      {person.role !== 'pet' && (
        <Group label="Signing in">
          <Row name="PIN" state="Set or change it in Family PINs" onClick={() => setPins(true)} />
          {viewer.id === person.id && !src.onWall && (
            <Row name="Face ID on this phone" state={faceId.here ? 'On' : faceId.available ? 'Off · sign in with a look instead of a PIN' : 'Not available on this device'}
              right={faceId.here ? undefined : <Toggle label="Face ID on this phone" on={false} disabled={!faceId.available || !faceId.setUp} onChange={async () => { const done = await faceId.setUp?.(); show({ ok: Boolean(done), message: 'Face ID wasn’t set up.' }, 'Face ID is on.') }} />} />
          )}
        </Group>
      )}
      {pins && <Sheet label="Family PINs" onClose={() => setPins(false)}><FamilyPins onDone={() => setPins(false)} /></Sheet>}
    </div>
  )
}

export function FamilyPage({ head }: { head: ReactNode }) {
  const src = useSource()
  const members = src.useMembers()
  const viewer = src.useViewer()
  const faceId = src.useFaceId()
  const edits = src.useMemberEdits()
  const pigment = usePigment(members)
  const shown = useMemo(() => pigmentIndexes((members ?? []) as unknown as WallMember[]), [members])
  const [open, setOpen] = useState<string | null>(null)
  const [pins, setPins] = useState(false)
  const [adding, setAdding] = useState<{ name: string; role: FamilyMember['role']; drives: boolean } | null>(null)
  const [note, show] = useSaveNote()
  const t = useType()
  const person = everyone(members).find((m) => m.id === open) ?? null
  if (person && members) return <PersonProfile person={person} members={members} shown={shown} onBack={() => setOpen(null)} />
  const off = everyone(members).filter((m) => m.show_on_home_sidebar === false)
  const line = (m: FamilyMember) => [ROLES.find((r) => r.value === m.role)?.label ?? m.role, m.can_drive && m.role !== 'pet' ? 'drives' : null, m.nicknames?.length ? `“${m.nicknames[0]}”` : null, viewer.id === m.id && faceId.here && !src.onWall ? 'Face ID' : null].filter(Boolean).join(' · ')

  return (
    <div>
      {head}
      <Group label="On the wall">
        {members == null ? <Quiet>Loading…</Quiet> : people(members).map((m) => (
          <Row key={m.id} label={`Open ${m.name}`} onClick={() => setOpen(m.id)} lead={<PersonDisc name={m.name} className={pigment(m.id)} />} name={m.name} state={line(m)} />
        ))}
      </Group>
      {off.length > 0 && (
        <Group label="Not on the wall">
          {off.map((m) => <Row key={m.id} label={`Open ${m.name}`} onClick={() => setOpen(m.id)} lead={<PersonDisc name={m.name} className="bg-wall-ink-2" />} name={m.name} state={line(m)} />)}
        </Group>
      )}
      <div className="mt-[8px] px-[4px]"><Action onClick={() => setAdding({ name: '', role: 'child', drives: false })}><Plus size={18} aria-hidden="true" /> Add someone, or a pet</Action></div>
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
          <h2 className={`m-0 font-display font-semibold text-wall-ink ${t.heading}`}>{adding.role === 'pet' ? 'Add a pet' : 'Add someone'}</h2>
          <p className={`m-0 mt-[4px] text-wall-ink-2 ${t.detail}`}>{adding.role === 'pet' ? 'Pets start off the wall; turn them on in their profile.' : 'They get the next color and a row on the wall.'}</p>
          <input aria-label="Their name" placeholder="Their name" value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })}
            className={`mt-[12px] h-[48px] w-full rounded-[12px] border border-solid border-wall-stone bg-wall-on-pigment px-[14px] font-body text-wall-ink ${t.body}`} />
          <div className="mt-[12px]">
            <Seg label="Who they are" value={adding.role} onChange={(role) => setAdding({ ...adding, role, drives: role === 'parent' || role === 'caregiver' })} options={ROLES} />
          </div>
          {adding.role !== 'pet' && <div className="mt-[8px]"><Row name="Drives" right={<Toggle label="They drive" on={adding.drives} onChange={(on) => setAdding({ ...adding, drives: on })} />} /></div>}
          <div className="mt-[8px] flex justify-end gap-[18px]">
            <Action tone="quiet" onClick={() => setAdding(null)}>Cancel</Action>
            <Action disabled={!adding.name.trim()} onClick={async () => { const r = await edits.add(adding.name, adding.role, adding.drives); show(r, `${adding.name.trim()} is in the family.`); if (r.ok) setAdding(null) }}>Add</Action>
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
          // Signing in again is only for a lost sign-in; a sync that fails is something else (Oct 6: the family
          // calendar's sync failed on a duplicate for six days and this said "needs signing in again").
          const signIn = Boolean(c?.reauthorization_required || c?.health_status === 'reauthorization_required')
          const failing = Boolean(c && !signIn && c.last_sync_error)
          return (
            <Row key={m.id} lead={<PersonDisc name={m.name} className={pigment(m.id)} />} name={m.name}
              state={!c ? 'Not connected' : signIn ? 'Needs signing in again' : failing ? `${c.google_email} · syncing fails since ${ago(c.last_sync_at, now)} · ${c.last_sync_error}` : `${c.google_email} · checked ${ago(c.last_sync_at, now)}`}
              tone={!c ? 'quiet' : signIn || failing ? 'rust' : 'good'}
              right={!c || signIn ? <Action onClick={() => void src.connectGoogle(m.id)}>{c ? 'Reconnect' : 'Connect'}</Action> : undefined} />
          )
        })}
        {linked.filter((m) => m.connection && !m.connection.reauthorization_required && m.connection.health_status !== 'reauthorization_required').map((m) => (
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
            <Row name="Below the room" state="Like a painting, not a screen: more by day than at night"
              right={<Stepper label="How far below the room" value={Math.round((c.room_dim_strength ?? 0.3) * 100)} min={0} max={90} step={5} unit="%" onChange={(v) => void set({ room_dim_strength: v / 100 })} />} />
          </>
        ) : (
          <Row name="Hold at" right={<Stepper label="Hold the brightness at" value={max} min={5} max={100} step={5} unit="%" onChange={(v) => void set({ brightness_min: v, brightness_max: v })} />} />
        )}
      </Group>
      <Group label="Colour">
        <Row name="True to the room’s light" state={(c.color_soften ?? 0) > 0 ? 'Off: a gentle shift toward the lamp’s warmth' : 'The screen takes on the lamp’s warmth, or the daylight’s cool, fully'}
          right={<Toggle label="True to the room’s light" on={(c.color_soften ?? 0) === 0} onChange={(on) => void set({ color_soften: on ? 0 : 0.4 }, on ? 'True to the room.' : 'Softened.')} />} />
        <Row name="Warmer or cooler" state="A nudge on the room’s colour, if the screen reads a touch too warm or too cool"
          right={<Stepper label="Warmer or cooler" value={c.cct_bias_k ?? 0} min={-1000} max={1000} step={100} format={(v) => (v === 0 ? 'As the room' : v < 0 ? `${-v} K warmer` : `${v} K cooler`)} onChange={(v) => void set({ cct_bias_k: v })} />} />
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
              className={`h-[40px] shrink-0 rounded-full px-[14px] font-semibold ${t.detail} ${who === c.id ? 'border-2 border-solid border-wall-ink bg-wall-on-pigment text-wall-ink' : 'border border-solid border-wall-stone bg-wall-paper text-wall-ink'}`}>{c.name}</button>
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

// ── Alexa's personality ─────────────────────────────────────────────────────────────────────────────────
// Canvas 60 (Jake, Oct 7: "give Tabor House AI a personality, that evolves over time … call it Alexa"): who she is in
// a line he can rewrite, how much of it comes through, and what she's picked up — each note kept or forgotten. She
// looks back over the week's conversations every Sunday night (house-notes); a kept note is never changed by her.

export function AlexaPage({ head }: { head: ReactNode }) {
  const src = useSource()
  const t = useType()
  const wall = useSize() === 'wall'
  const { persona, save } = src.usePersona()
  const [editing, setEditing] = useState<string | null>(null)
  const [restart, setRestart] = useState(false)
  const [note, show] = useSaveNote()
  if (!persona) return <div>{head}<Group><Quiet>Loading…</Quiet></Group></div>
  const put = async (patch: Partial<Persona>, words: string) => show(await save({ ...persona, ...patch }), words)

  return (
    <div>
      {head}
      {note}
      <Group label="Who she is">
        {editing == null ? (
          <div className={`flex items-start gap-[16px] ${wall ? 'px-[26px] py-[22px]' : 'px-[14px] py-[14px]'}`}>
            <p className={`m-0 min-w-0 flex-1 font-display text-wall-ink ${wall ? t.heading : t.body}`}>{persona.core}</p>
            <Pill label="Edit who she is" onClick={() => setEditing(persona.core)}>Edit</Pill>
          </div>
        ) : (
          <div className={`flex flex-col gap-[10px] ${wall ? 'px-[26px] py-[22px]' : 'px-[14px] py-[14px]'}`}>
            <textarea aria-label="Who she is" value={editing} onChange={(e) => setEditing(e.target.value)} rows={4}
              className={`w-full resize-none rounded-[12px] border border-solid border-wall-stone bg-phone-ground px-[12px] py-[10px] font-display text-wall-ink ${t.heading}`} />
            <div className="flex flex-wrap items-center gap-[18px]">
              <Action onClick={async () => { await put({ core: editing.trim() || DEFAULT_CORE }, 'She’ll be that from the next thing you ask.'); setEditing(null) }}>Save</Action>
              <Action tone="quiet" onClick={() => setEditing(null)}>Cancel</Action>
              {editing !== DEFAULT_CORE && <Action tone="quiet" onClick={() => setEditing(DEFAULT_CORE)}>Back to the house</Action>}
            </div>
          </div>
        )}
      </Group>

      <Label>How much personality</Label>
      <div className={wall ? 'max-w-[560px]' : ''}>
        <Seg label="How much personality" value={persona.level} onChange={(level) => void put({ level }, { quiet: 'Quiet: mostly business.', some: 'Some: a light touch now and then.', playful: 'Playful: more of the house.' }[level])}
          options={[{ value: 'quiet', label: 'Quiet' }, { value: 'some', label: 'Some' }, { value: 'playful', label: 'Playful' }]} />
      </div>
      <p className={`m-0 mt-[10px] px-[4px] text-wall-ink-2 ${t.detail}`}>Times, drivers and yes-or-no answers always stay plain.</p>

      <div className={wall ? 'flex items-baseline justify-between gap-[12px]' : ''}>
        <Label>What she’s picked up · {persona.notes.length}</Label>
        <span className={`block px-[4px] text-wall-ink-2 ${wall ? '' : '-mt-[4px] mb-[8px]'} ${t.detail}`}>Next look back: Sunday night</span>
      </div>
      <Group>
        {persona.notes.length ? persona.notes.map((n) => (
          <div key={n.id} className={`flex ${wall ? 'items-center gap-[14px] px-[26px] py-[16px]' : 'flex-col gap-[10px] px-[14px] py-[12px]'}`}>
            <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <span className={`text-wall-ink ${t.body}`}>{n.text}</span>
              {n.source && <span className={`text-wall-ink-2 ${t.detail}`}>{n.source}</span>}
            </div>
            <div className="flex shrink-0 gap-[10px]">
              <Pill label={n.pinned ? `Kept: ${n.text}` : `Keep: ${n.text}`} filled={n.pinned}
                onClick={() => void put({ notes: persona.notes.map((x) => (x.id === n.id ? { ...x, pinned: !x.pinned } : x)) }, n.pinned ? 'She may let that one go someday.' : 'Kept. She won’t change it.')}>{n.pinned ? 'Kept' : 'Keep'}</Pill>
              <Pill label={`Forget: ${n.text}`} tone="rust" onClick={() => void put({ notes: persona.notes.filter((x) => x.id !== n.id) }, 'Forgotten.')}>Forget</Pill>
            </div>
          </div>
        )) : <Quiet>Nothing yet. Every Sunday night she looks back over the week’s conversations for running jokes, family words and how you like things said.</Quiet>}
      </Group>

      <Group label="Start over">
        {restart ? (
          <div className={`flex flex-col gap-[8px] ${wall ? 'px-[26px] py-[18px]' : 'px-[14px] py-[12px]'}`}>
            <span className={`text-wall-ink ${t.body}`}>Forget everything she’s picked up and go back to the house?</span>
            <div className="flex gap-[18px]">
              <Action tone="rust" onClick={async () => { await put({ core: DEFAULT_CORE, level: 'some', notes: [] }, 'Back to the house, nothing picked up.'); setRestart(false) }}>Yes, start over</Action>
              <Action tone="quiet" onClick={() => setRestart(false)}>Keep her</Action>
            </div>
          </div>
        ) : (
          <Row name="Start over" state="Back to the house, with nothing picked up" onClick={() => setRestart(true)} label="Start over" />
        )}
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
