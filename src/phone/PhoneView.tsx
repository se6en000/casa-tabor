import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, Check, ChefHat, Grid2x2, Lock, MapPin, Monitor, Music, Newspaper, Plus, Settings, ShoppingCart, User, Users, X } from 'lucide-react'
import type { DayPlan, Trip, WallEvent, WallMember } from '../wall/engine/types'
import { pigmentStyleFor } from '../wall/lanes'
import type { WallChecklistItem } from '../wall/packing'
import { driverChoices } from '../wall/people'
import { pigmentIndexes } from '../wall/score'
import { weekDays } from '../wall/week'
import { familyItems, meView, type PhoneMove } from './lens'

// The phone (board section 05): one person's lens on the same family day the wall
// draws. Drawn from data only, so it renders from fixtures (PhoneFixturePage).

type Tab = 'me' | 'family' | 'week' | 'more'

export interface PhoneTripActions {
  leaving: (tripIds: string[]) => void
  undoLeaving: (tripIds: string[]) => void
  handOff: (trip: Trip, driverId: string, date?: Date) => Promise<void>
}

export interface PhoneViewProps {
  now: Date
  /** Whose phone this is (the profile chosen at "Who is using Casa?"). */
  viewerId: string
  members: WallMember[]
  /** Today and the next six days; [0] is today. */
  week: DayPlan[]
  events: WallEvent[]
  checklist: WallChecklistItem[]
  tripActions?: PhoneTripActions
  onToggleItem?: (item: WallChecklistItem) => void
  /** The + (adding comes in P4.5). */
  onAdd?: () => void
}

const shortDate = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
const clock = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/, '')

function Disc({ id, members, pigments, size = 'h-[32px] w-[32px] text-phone-detail' }: { id: string; members: WallMember[]; pigments: Map<string, number>; size?: string }) {
  const name = members.find((m) => m.id === id)?.name ?? '?'
  return (
    <span aria-label={name} className={`flex shrink-0 items-center justify-center rounded-full font-display font-bold text-wall-on-pigment ${size} ${pigmentStyleFor(pigments.get(id) ?? 0).solid}`}>
      {name.charAt(0)}
    </span>
  )
}

function Label({ children }: { children: ReactNode }) {
  return <div className="text-phone-label font-bold tracking-[0.16em] text-wall-ink-2">{children}</div>
}

function CheckLine({ item, onToggle }: { item: { id: string; label: string; checked?: boolean }; onToggle?: () => void }) {
  return (
    <button type="button" onClick={onToggle} disabled={!onToggle} aria-pressed={Boolean(item.checked)} className="flex min-h-[44px] w-full items-center gap-[12px] border-0 border-t border-solid border-wall-stone bg-transparent p-0 text-left text-phone-body text-wall-ink">
      <span aria-hidden="true" className={`flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[4px] border-2 border-solid ${item.checked ? 'border-wall-ink bg-wall-ink text-wall-on-pigment' : 'border-wall-ink-2'}`}>
        {item.checked && <Check size={14} strokeWidth={3} />}
      </span>
      <span className={item.checked ? 'text-wall-ink-2 line-through' : ''}>{item.label}</span>
    </button>
  )
}

export default function PhoneView({ now, viewerId, members, week, events, checklist, tripActions, onToggleItem, onAdd }: PhoneViewProps) {
  const [tab, setTab] = useState<Tab>('me')
  const [filter, setFilter] = useState<string | null>(null)
  const [dayIndex, setDayIndex] = useState(0)
  const [handOff, setHandOff] = useState<Trip | null>(null)
  const [busy, setBusy] = useState(false)
  const pigments = useMemo(() => pigmentIndexes(members), [members])
  const viewer = members.find((m) => m.id === viewerId) ?? null
  const today = week[0] ?? null
  const me = useMemo(() => meView({ viewerId, plan: today, members, events, checklist, now }), [viewerId, today, members, events, checklist, now])
  const lanePeople = members.filter((m) => m.show_on_home_sidebar !== false)
  const tripOf = (move: PhoneMove) => today?.trips.find((t) => t.id === move.tripIds[0]) ?? null
  const itemOf = (id: string) => checklist.find((i) => i.id === id)

  const meScreen = (
    <div className="flex flex-col gap-[18px]">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-phone-detail text-wall-ink-2">{now.toLocaleDateString('en-US', { weekday: 'long' })} · {now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</div>
          <h1 className="m-0 font-display text-phone-title font-bold text-wall-ink">{viewer ? `${viewer.name}'s day` : 'Your day'}</h1>
        </div>
        {viewer && <Disc id={viewer.id} members={members} pigments={pigments} size="h-[40px] w-[40px] text-phone-heading" />}
      </div>

      {me.next ? (
        <section aria-label="Your next move" className="flex flex-col gap-[6px] rounded-[20px] bg-wall-ink p-[18px] text-wall-on-pigment">
          <div className="text-phone-label font-bold tracking-[0.16em] text-wall-night-rust">
            {me.next.departed ? 'ON THE ROAD' : me.next.leaveBy ? `LEAVE BY ${me.next.leaveBy}` : 'NEXT'}
          </div>
          <div className="font-display text-phone-move font-semibold">{me.next.title}</div>
          <div className="text-phone-body text-wall-stone">{me.next.summary}</div>
          {me.next.travelerIds.filter((id) => id !== viewerId).length > 0 && (
            <div className="flex items-center gap-[6px] text-phone-detail text-wall-stone">
              with {me.next.travelerIds.filter((id) => id !== viewerId).map((id) => <Disc key={id} id={id} members={members} pigments={pigments} size="h-[22px] w-[22px] text-phone-label" />)}
            </div>
          )}
          {tripActions && (
            <div className="mt-[8px] flex gap-[8px]">
              {me.next.departed ? (
                <button type="button" onClick={() => tripActions.undoLeaving(me.next!.tripIds)} className="h-[44px] flex-1 rounded-full border border-solid border-wall-ink-2 bg-transparent text-phone-body font-semibold text-wall-on-pigment">Not yet (undo)</button>
              ) : (
                <button type="button" onClick={() => tripActions.leaving(me.next!.tripIds)} className="h-[44px] flex-1 rounded-full border-0 bg-wall-on-pigment text-phone-body font-bold text-wall-ink">Leaving now</button>
              )}
              <button type="button" onClick={() => setHandOff(tripOf(me.next!))} className="h-[44px] flex-1 rounded-full border border-solid border-wall-ink-2 bg-transparent text-phone-body font-semibold text-wall-on-pigment">Hand off</button>
            </div>
          )}
        </section>
      ) : (
        <div className="rounded-[20px] bg-phone-card p-[18px] font-display text-phone-heading italic text-wall-ink-2">Nothing for you to drive today.</div>
      )}

      {me.moves.length > 0 && (
        <section aria-label="Your moves today">
          <Label>YOUR MOVES TODAY</Label>
          {me.moves.map((m) => (
            <div key={m.tripIds[0]} className="flex items-start gap-[12px] border-0 border-t border-solid border-wall-stone py-[10px]">
              {/* Jake's note on 05a: a "Leave by" label, and the time in bold. */}
              <span className="flex w-[72px] shrink-0 flex-col">
                <span className="text-phone-label text-wall-ink-2">Leave by</span>
                <span className="text-phone-heading font-bold">{m.leaveBy ?? '—'}</span>
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-phone-body font-semibold">{m.title}</span>
                <span className="text-phone-detail text-wall-ink-2">{m.summary}</span>
              </span>
            </div>
          ))}
        </section>
      )}

      {me.covered.length > 0 && (
        <section aria-label="Covered">
          <Label>COVERED · YOU DON’T NEED TO</Label>
          {me.covered.map((c, i) => (
            <div key={i} className="flex items-center gap-[10px] border-0 border-t border-solid border-wall-stone py-[9px] text-phone-body">
              <Check size={16} strokeWidth={2.5} aria-hidden="true" className="shrink-0 text-wall-pigment-2" />
              <b>{c.when}</b>
              <span className="min-w-0 truncate">{c.driver} · {c.what}</span>
            </div>
          ))}
        </section>
      )}

      {me.hidden.length > 0 && (
        <section aria-label="Kept from someone" className="rounded-[16px] bg-phone-card px-[14px] py-[12px]">
          {[...new Set(me.hidden.map((h) => h.from))].map((from) => (
            <div key={from}>
              <div className="mb-[4px] flex items-center gap-[8px] text-phone-label font-bold tracking-[0.16em] text-wall-ink-2">
                <Lock size={13} strokeWidth={2.5} aria-hidden="true" /> HIDDEN FROM {from.toUpperCase()} · NOT ON THE WALL
              </div>
              {me.hidden.filter((h) => h.from === from).map((h) => {
                const item = itemOf(h.itemId)
                return <CheckLine key={h.itemId} item={{ id: h.itemId, label: h.label, checked: item?.checked }} onToggle={item && onToggleItem ? () => onToggleItem(item) : undefined} />
              })}
            </div>
          ))}
        </section>
      )}

      {me.justYours.length > 0 && (
        <section aria-label="Just yours">
          <Label>JUST YOURS</Label>
          {me.justYours.map((j) => (
            <div key={j.id} className="flex items-baseline gap-[12px] border-0 border-t border-solid border-wall-stone py-[10px] text-phone-body">
              <span className="w-[56px] shrink-0 text-phone-detail font-bold">{clock(j.at)}</span>
              <span>{j.title}</span>
            </div>
          ))}
        </section>
      )}
    </div>
  )

  const shownDay = week[dayIndex] ?? today
  const items = familyItems(shownDay, members, filter)
  const familyScreen = (
    <div className="flex flex-col gap-[14px]">
      <div>
        <div className="text-phone-detail text-wall-ink-2">{shownDay ? shortDate(shownDay.date) : ''}</div>
        <h1 className="m-0 font-display text-phone-title font-bold text-wall-ink">Everyone</h1>
      </div>
      <div className="-mx-[20px] flex gap-[8px] overflow-x-auto px-[20px] pb-[2px]">
        {[{ id: null as string | null, name: 'Everyone' }, ...lanePeople.map((m) => ({ id: m.id as string | null, name: m.name }))].map((p) => (
          <button
            key={p.id ?? 'all'}
            type="button"
            aria-pressed={filter === p.id}
            aria-label={p.name}
            onClick={() => setFilter(p.id)}
            className={`flex h-[40px] shrink-0 items-center gap-[6px] rounded-full pl-[4px] pr-[12px] text-phone-detail font-semibold text-wall-ink ${filter === p.id ? 'border-2 border-solid border-wall-ink bg-wall-on-pigment' : 'border border-solid border-wall-stone bg-transparent'} ${p.id ? '' : 'pl-[12px]'}`}
          >
            {p.id && <Disc id={p.id} members={members} pigments={pigments} size="h-[30px] w-[30px] text-phone-detail" />}
            {p.name}
          </button>
        ))}
      </div>
      <div>
        {items.length === 0 && <div className="py-[12px] font-display text-phone-heading italic text-wall-ink-2">Nothing on the calendar.</div>}
        {items.map((i) => (
          <div key={i.id} className="flex items-stretch gap-[12px] border-0 border-t border-solid border-wall-stone py-[10px]">
            <span className="w-[52px] shrink-0 pt-[2px] text-phone-body font-bold">{i.time}</span>
            <span aria-hidden="true" className={`w-[4px] shrink-0 rounded-[2px] ${pigmentStyleFor(pigments.get(i.people[0] ?? '') ?? 0).solid}`} />
            <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
              <span className="text-phone-body font-semibold">{i.title}</span>
              {i.sub && <span className="text-phone-detail text-wall-ink-2">{i.sub}</span>}
            </span>
            <span className="flex shrink-0 gap-[2px] self-center">
              {i.people.map((id) => <Disc key={id} id={id} members={members} pigments={pigments} size="h-[26px] w-[26px] text-phone-label" />)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )

  const days = weekDays(week, members, [], now, checklist)
  const weekScreen = (
    <div className="flex flex-col gap-[10px]">
      <h1 className="m-0 font-display text-phone-title font-bold text-wall-ink">The week</h1>
      {days.map((d, i) => (
        <button
          key={d.key}
          type="button"
          onClick={() => { setDayIndex(i); setTab('family') }}
          className={`flex min-h-[64px] w-full items-center gap-[14px] rounded-[16px] bg-transparent px-[14px] py-[10px] text-left text-wall-ink ${i === 0 ? 'border-2 border-solid border-wall-ink' : 'border border-solid border-wall-stone'}`}
        >
          <span className="flex w-[80px] flex-col">
            <span className={`text-phone-label font-bold tracking-[0.16em] ${i === 0 ? 'text-wall-brass-ink' : 'text-wall-ink-2'}`}>{d.weekday.toUpperCase()}</span>
            <span className="font-display text-phone-heading font-bold">{d.dayNumber}</span>
          </span>
          <span className="flex flex-1 flex-col gap-[6px]">
            <span className="flex gap-[4px]">{d.memberIds.map((id) => <span key={id} className={`h-[12px] w-[12px] rounded-full ${pigmentStyleFor(pigments.get(id) ?? 0).solid}`} />)}</span>
            <span className="text-phone-detail text-wall-ink-2">{d.firstOut}</span>
          </span>
          {d.toDo > 0 && <span className="text-phone-detail font-bold text-wall-brass-ink">{d.toDo} to do</span>}
        </button>
      ))}
    </div>
  )

  const tiles: Array<{ to: string; label: string; sub: string; icon: ReactNode }> = [
    { to: '/grocery', label: 'Grocery', sub: 'The list, by store', icon: <ShoppingCart size={20} /> },
    { to: '/cook', label: 'Meals', sub: 'Recipes and tonight', icon: <ChefHat size={20} /> },
    { to: '/music', label: 'Music', sub: 'Speakers and playlists', icon: <Music size={20} /> },
    { to: '/briefing', label: 'Briefing', sub: 'The day in a few lines', icon: <Newspaper size={20} /> },
    { to: '/settings', label: 'Places', sub: 'Saved places · drive times', icon: <MapPin size={20} /> },
    { to: '/settings', label: 'Settings', sub: 'Family, calendars, voice', icon: <Settings size={20} /> },
  ]
  const moreScreen = (
    <div className="flex flex-col gap-[16px]">
      <h1 className="m-0 font-display text-phone-title font-bold text-wall-ink">More</h1>
      <div className="grid grid-cols-2 gap-[10px]">
        {tiles.map((t) => (
          <Link key={t.label} to={t.to} className="flex h-[124px] flex-col justify-between rounded-[18px] border border-solid border-wall-stone bg-wall-on-pigment p-[14px] text-wall-ink no-underline">
            <span className="flex h-[40px] w-[40px] items-center justify-center rounded-full bg-phone-card">{t.icon}</span>
            <span className="flex flex-col gap-[2px]">
              <span className="font-display text-phone-heading font-bold">{t.label}</span>
              <span className="text-phone-detail text-wall-ink-2">{t.sub}</span>
            </span>
          </Link>
        ))}
      </div>
      <Link to="/wall" className="flex h-[52px] items-center justify-center gap-[10px] rounded-full border border-solid border-wall-ink-2 text-phone-body font-semibold text-wall-ink no-underline">
        <Monitor size={18} /> See the Wall
      </Link>
    </div>
  )

  const tabs: Array<{ id: Tab; label: string; icon: ReactNode }> = [
    { id: 'me', label: 'Me', icon: <User size={22} /> },
    { id: 'family', label: 'Family', icon: <Users size={22} /> },
    { id: 'week', label: 'Week', icon: <CalendarDays size={22} /> },
    { id: 'more', label: 'More', icon: <Grid2x2 size={22} /> },
  ]
  const tabButton = (t: (typeof tabs)[number]) => (
    <button
      key={t.id}
      type="button"
      aria-current={tab === t.id ? 'page' : undefined}
      onClick={() => { setTab(t.id); if (t.id === 'family' && tab !== 'week') setDayIndex(0) }}
      className={`flex h-[52px] w-[62px] flex-col items-center justify-center gap-[3px] border-0 bg-transparent p-0 text-phone-label ${tab === t.id ? 'font-bold text-wall-ink' : 'font-medium text-wall-ink-2'}`}
    >
      {t.icon}
      {t.label}
    </button>
  )

  const choices = handOff && today ? driverChoices(today, members, handOff, handOff.sourceId) : []

  return (
    <div className="relative flex h-dvh w-full flex-col bg-phone-ground font-body text-wall-ink">
      <main className="flex-1 overflow-y-auto px-[20px] pb-[24px] pt-[22px]">
        {tab === 'me' && meScreen}
        {tab === 'family' && familyScreen}
        {tab === 'week' && weekScreen}
        {tab === 'more' && moreScreen}
      </main>
      <nav aria-label="Sections" className="flex h-[78px] shrink-0 items-center justify-between border-0 border-t border-solid border-wall-stone bg-wall-on-pigment px-[14px] pb-[18px] pt-[6px]">
        {tabButton(tabs[0])}
        {tabButton(tabs[1])}
        <button type="button" aria-label="Add something" onClick={onAdd} disabled={!onAdd} className="-mt-[18px] flex h-[56px] w-[56px] items-center justify-center rounded-full border-0 bg-wall-ink p-0 text-wall-on-pigment shadow-[0_6px_16px_rgba(38,34,29,0.25)]">
          <Plus size={26} strokeWidth={2.2} />
        </button>
        {tabButton(tabs[2])}
        {tabButton(tabs[3])}
      </nav>

      {handOff && tripActions && (
        <div className="absolute inset-0 z-10 bg-wall-ink/35" onClick={() => setHandOff(null)}>
          <section aria-label="Hand off" className="absolute bottom-0 left-0 flex w-full flex-col gap-[10px] rounded-t-[26px] bg-phone-ground px-[20px] pb-[30px] pt-[18px]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-phone-detail text-wall-ink-2">{handOff.title}</div>
                <div className="font-display text-phone-heading font-bold">Who takes it?</div>
              </div>
              <button type="button" aria-label="Close" onClick={() => setHandOff(null)} className="flex h-[44px] w-[44px] items-center justify-center rounded-full border border-solid border-wall-stone bg-transparent p-0 text-wall-ink"><X size={18} /></button>
            </div>
            {choices.filter((c) => c.memberId !== handOff.driverId).map((c) => (
              <button
                key={c.memberId}
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  try {
                    await tripActions.handOff(handOff, c.memberId)
                    setHandOff(null)
                  } finally {
                    setBusy(false)
                  }
                }}
                className="flex min-h-[56px] w-full items-center gap-[12px] rounded-[14px] border border-solid border-wall-stone bg-wall-on-pigment px-[12px] text-left text-wall-ink"
              >
                <Disc id={c.memberId} members={members} pigments={pigments} />
                <span className="flex flex-col">
                  <span className="text-phone-body font-semibold">{c.name}</span>
                  <span className={`text-phone-detail ${c.note === 'free' ? 'text-wall-ink-2' : 'text-wall-rust'}`}>{c.note}</span>
                </span>
              </button>
            ))}
          </section>
        </div>
      )}
    </div>
  )
}
