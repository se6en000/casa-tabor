import type { GiftIdea } from '../wall/comingUp'
import type { PlanOpen } from '../wall/plan'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUp, CalendarDays, Check, ChevronDown, ChevronRight, ListChecks, Lock, Mail, Monitor, Navigation, Plus, Settings, ShoppingBasket, Sparkles, Sun, Users, X } from 'lucide-react'
import type { DayPlan, Trip, WallEvent, WallMember } from '../wall/engine/types'
import { dayWhen, mergeEvents, needsAroundFetch, stripDates } from '../wall/dayFocus'
import { pigmentStyleFor } from '../wall/lanes'
import type { WallChecklistItem } from '../wall/packing'
import { driverChoices } from '../wall/people'
import { pigmentIndexes } from '../wall/score'
import { weekDays } from '../wall/week'
import type { EditDraft, EditableEvent } from '../wall/editing'
import { eventView, familyItems, meView, type FamilyItem, type PhoneMove } from './lens'
import PhoneEventSheet from './PhoneEventSheet'
import PhoneAddSheet from './PhoneAddSheet'
import PhonePeople from './PhonePeople'
import PhoneGroceries, { type PhoneGroceriesData } from './PhoneGroceries'
import type { FamilyRoutine } from '../lib/familyRoutines'
import type { DayOff } from '../wall/engine/dayPlan'

const ymdOf = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
import PhoneEmailSettings from './PhoneEmailSettings'
import { useEmailSettings } from '../wall/useEmailOffers'
import PhoneScanSheet from './PhoneScanSheet'
import PhoneTodo from './PhoneTodo'
import PhoneProject from './PhoneProject'
import PhoneTodoSheet from './PhoneTodoSheet'
import { todoSummary, type TodoAction, type TodoItem, type TodoList, type TodoProjectDetail } from '../wall/todos'
import type { ComingUpAction, ComingUpItem } from '../wall/comingUp'
import type { ScannedItem } from '../utils/documentScanner'
import type { ScanPlanItem } from './scan'
import type { SavedContact, SavedPlace } from '../types'
import { blankEvent } from '../wall/editing'
import { keepFromSuggestion, keptFrom as keptFromOf, type KeepFrom } from '../wall/audience'
import { snoozeUntil, type CasaTopic, type TalkAnswer } from '../wall/casaTalk'
import PhoneCasaTalk from './PhoneCasaTalk'
import { primeKeyboard, usePhoneShell, useSheetSwipe } from './phoneShell'
import { dayTimeline, foldLabel, isPast, untilWords } from './timeline'
import { usePendingTicks } from './ticks'
import PhoneMonth from './PhoneMonth'
import PullToRefresh from './PullToRefresh'
import PhoneSkeleton from './PhoneSkeleton'
import PhoneTabBar from './PhoneTabBar'
import PhoneDayPager from './PhoneDayPager'
import PhonePushPage from './PhonePushPage'
import { haptic } from './haptic'
import { AnimatePresence } from 'framer-motion'

// The phone (board section 05): one person's lens on the same family day the wall
// draws. Drawn from data only, so it renders from fixtures (PhoneFixturePage).

// The phone rearranged (UX review, canvas rows 32–34): Today, Calendar, Groceries and — Jake's alone — To do.
type Tab = 'today' | 'calendar' | 'groceries' | 'todo'

export interface PhoneTripActions {
  leaving: (tripIds: string[]) => void
  undoLeaving: (tripIds: string[]) => void
  handOff: (trip: Trip, driverId: string, date?: Date) => Promise<void>
  dismiss?: (date: Date, key: string) => Promise<void>
}

export interface PhoneViewProps {
  now: Date
  /** Whose phone this is (the profile chosen at "Who is using Casa?"). */
  viewerId: string
  members: WallMember[]
  /** Everyone's routines and days off, for each person's page under People (canvas 16c). */
  routines?: FamilyRoutine[]
  dayOffs?: DayOff[]
  /** Today and the next six days; [0] is today. */
  week: DayPlan[]
  events: WallEvent[]
  checklist: WallChecklistItem[]
  tripActions?: PhoneTripActions
  /** "Casa wants to talk to you" (canvas 21c): the one thing Casa raises, on top of Me when it's for this person. */
  casaTalk?: { topic: CasaTopic | null; snooze: (key: string, until: Date) => Promise<void> } | null
  /** Chores ticked for the day (`chore:<id>:<date>`), and ticking one (canvas 30a, as the wall's NEXT UP). */
  choreDone?: ReadonlySet<string>
  tickChore?: (choreId: string, date: Date, done: boolean) => Promise<void>
  /** A month's events, for Any day (canvas 30b); fetched while the month is open. Without it, the events already here. */
  useMonthEvents?: (month: Date) => WallEvent[]
  /** Pull down to refresh: re-read the day. */
  onRefresh?: () => Promise<void>
  onToggleItem?: (item: WallChecklistItem) => void
  onAddItem?: (eventId: string, label: string) => Promise<void>
  useEventItems?: (eventId: string) => WallChecklistItem[]
  /** People (More → People): saved contacts and places, for call / text / directions. */
  contacts?: SavedContact[]
  places?: SavedPlace[]
  /** Adding (the + → Type it): the calendar's own create call. */
  createEvent?: (args: Record<string, unknown>) => Promise<string | null | void>
  /** Scan it's plan: what's new for events already there, and the packing (P3.24). */
  applyPlan?: (title: string, items: ScanPlanItem[]) => Promise<void>
  /** Saves an edit from the event sheet (the same steps as the wall). */
  saveEvent?: (event: EditableEvent, draft: EditDraft) => Promise<void>
  deleteEvent?: (event: EditableEvent) => Promise<void>
  /** Scan it (the + → Scan it): reads photos into drafts; added with `createEvent`. */
  scan?: (files: File[]) => Promise<{ summary: string; items: ScannedItem[] }>
  /** Scan it: what's already on the calendar on the scanned days (so a second scan doesn't double up). */
  findSimilar?: (items: ScannedItem[]) => Promise<Record<string, { id: string; title: string; start_time: string }>>
  /** Say it (the + → Say it): the assistant, drawn by the frame (live) or the fixture (scripted). */
  assistant?: (props: { onClose: () => void; onOpenEvent: (id: string) => void; onOpenPlace?: (open: PlanOpen) => void; onOpenDay?: (date: Date) => void; opening?: string | null; onForm?: () => void; onScan?: () => void }) => ReactNode
  /** Builds a day's plan from events (a far day's week, dayFocus.ts). */
  planDay?: (date: Date, events: WallEvent[]) => DayPlan
  /** The week around a far day on Me, loaded by the frame when asked with onFocusDay. */
  aroundEvents?: WallEvent[] | null
  onFocusDay?: (date: Date | null) => void
  /** Settings › Email's data (the fixture page passes its own). */
  useEmailSettingsHook?: typeof useEmailSettings
  /** Keep from… (05g): who each event is kept from, and the change. */
  keepFrom?: KeepFrom
  setKeptFrom?: (eventId: string, memberIds: string[]) => Promise<void>
  /** Coming up (board 07b): what needs planning, from the same service as the wall's. */
  comingUp?: { items: ComingUpItem[]; today: string; act: (key: string, action: ComingUpAction) => Promise<void>; start?: (key: string) => Promise<string | null>; ideas?: GiftIdea[]; editIdea?: (id: string, idea: string | null) => Promise<void> } | null
  /** To do and projects (P3.22 step 7) — Jake's list, so only on Jake's phone. */
  /** Groceries (canvas 33d): the shared list, live; the frame's own hook, or the fixture's. */
  groceries?: PhoneGroceriesData | null
  todos?: { list: TodoList; act: (request: TodoAction) => Promise<void>; useProject: (id: string | null) => { data?: TodoProjectDetail | null } } | null
}

/** A project on the phone, loaded (the hook lives here, so it only runs while one is open). */
function ProjectOnPhone({ id, todos, today, onBack, onOpenProject, onTalk }: { id: string; todos: NonNullable<PhoneViewProps['todos']>; today: string; onBack: () => void; onOpenProject: (id: string) => void; onTalk?: (say: string) => void }) {
  const { data } = todos.useProject(id)
  // Still on its way: the page's shape, so the push slides a page in, not an empty dim (Jake's phone, Oct 2).
  if (!data) {
    const title = todos.list.projects.find((p) => p.id === id)?.title ?? ''
    return (
      <section aria-label={`${title || 'Project'} — loading`} className="absolute inset-0 z-30 flex flex-col gap-[14px] bg-phone-ground px-[20px] pt-[max(22px,calc(env(safe-area-inset-top)+10px))] font-body text-wall-ink">
        <button type="button" onClick={onBack} className="flex h-[44px] items-center gap-[4px] self-start border-0 bg-transparent p-0 text-phone-body font-semibold text-wall-ink">‹ To do</button>
        <span className="text-phone-label font-bold tracking-[0.16em] text-wall-brass-ink">PROJECT</span>
        <h1 className="m-0 font-display text-phone-title font-bold">{title}</h1>
        <PhoneSkeleton />
      </section>
    )
  }
  return <PhoneProject detail={data} today={today} onEdit={(op, args) => todos.act({ action: 'project_edit', id, op, args })} onBack={onBack} onOpenProject={onOpenProject} onTalk={onTalk ? () => onTalk(`Let’s work on the ${data.project.title} project.`) : undefined} />
}

/** Like the wall's evening: from 7 PM the phone looks at tomorrow. */
const LOOK_AHEAD_HOUR = 19

const shortDate = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
const phoneDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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

const NO_TICKS: ReadonlySet<string> = new Set()
/** A page's room: clear of the status bar at the top, and of the floating tab bar at the foot. */
const PAGE_PAD = 'px-[20px] pb-[calc(110px+env(safe-area-inset-bottom))] pt-[max(22px,calc(env(safe-area-inset-top)+10px))]'

export default function PhoneView({ now, viewerId, members, week, events, checklist, tripActions, onToggleItem, onAddItem, useEventItems, createEvent, applyPlan, saveEvent, deleteEvent, scan, assistant, keepFrom = {}, setKeptFrom, contacts = [], places = [], comingUp = null, todos = null, groceries = null, findSimilar, planDay, aroundEvents = null, onFocusDay, useEmailSettingsHook = useEmailSettings, routines = [], dayOffs = [], casaTalk = null, choreDone = NO_TICKS, tickChore, useMonthEvents, onRefresh }: PhoneViewProps) {
  const [tab, setTab] = useState<Tab>('today')
  // Behind your initial (32h): people and places, email, settings.
  const [initialOpen, setInitialOpen] = useState(false)
  // A project open on the phone, and a to-do being edited (P3.22 step 7).
  const [projectId, setProjectId] = useState<string | null>(null)
  const [editingTodo, setEditingTodo] = useState<TodoItem | null>(null)
  const [filter, setFilter] = useState<string | null>(null)
  const [dayIndex, setDayIndex] = useState<number | null>(null)
  // "↑ 4 earlier" opened on today's list (canvas 30a): for the day it was opened on; another day folds again.
  const [earlierFor, setEarlierFor] = useState<string | null>(null)
  const [monthOpen, setMonthOpen] = useState(false)
  const behindRef = useRef<HTMLDivElement>(null)
  // A pushed page slides the screen behind a third of the way with it (PhonePushPage).
  const shiftBehind = useCallback((px: number) => {
    const el = behindRef.current
    if (el) el.style.transform = Math.abs(px) > 0.5 ? `translateX(${px.toFixed(1)}px)` : ''
  }, [])
  const ticks = usePendingTicks((key) => {
    if (key.startsWith('todo:')) void todos?.act({ action: 'done', id: key.slice('todo:'.length) })
    else {
      // chore:<id>:<YYYY-MM-DD>
      const [, choreId, ymd] = key.split(':')
      const [y, m, d] = ymd.split('-').map(Number)
      void tickChore?.(choreId, new Date(y, m - 1, d), true)
    }
  })
  // A far day Casa opened (Jake, 2026-09-30), with the week around it to swipe through on Family and Me.
  const [farDay, setFarDay] = useState<Date | null>(null)
  const [handOff, setHandOff] = useState<{ trip: Trip; plan: DayPlan } | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [openMode, setOpenMode] = useState<'details' | 'edit'>('details')
  const [addOpen, setAddOpen] = useState(false)
  const [peopleOpen, setPeopleOpen] = useState(false)
  const [groceryAdding, setGroceryAdding] = useState(false)
  const [emailSettingsOpen, setEmailSettingsOpen] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const [askOpen, setAskOpen] = useState(false)
  // Opened from a project ("Talk to Casa"): its words are said first.
  const [askOpening, setAskOpening] = useState<string | null>(null)
  const [adding, setAdding] = useState<EditableEvent | null>(null)
  const [busy, setBusy] = useState(false)
  const pigments = useMemo(() => pigmentIndexes(members), [members])
  const viewer = members.find((m) => m.id === viewerId) ?? null
  const today = week[0] ?? null
  // From 7 PM, "Me" and Family default to tomorrow, read from its start (everything still ahead).
  const ahead = now.getHours() >= LOOK_AHEAD_HOUR && week.length > 1
  const focusIndex = ahead ? 1 : 0
  // Me can be swiped to another day (2026-09-28); it starts on today, or tomorrow from 7 PM.
  const shownEvents = useMemo(() => mergeEvents(events as WallEvent[], aroundEvents) as typeof events, [events, aroundEvents])
  const farDates = planDay ? stripDates(week.map((p) => p.date), farDay, now) : null
  const farKey = farDates?.map((d) => d.toDateString()).join('|') ?? ''
  const shownDays = useMemo(
    () => farDates?.map((d) => week.find((p) => p.date.toDateString() === d.toDateString()) ?? planDay!(d, shownEvents as WallEvent[])) ?? week,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- farKey stands for farDates
    [farKey, week, planDay, shownEvents],
  )
  const farAt = farDay ? shownDays.findIndex((p) => p.date.toDateString() === farDay.toDateString()) : -1
  const meAt = Math.min(dayIndex ?? (farAt >= 0 ? farAt : focusIndex), Math.max(0, shownDays.length - 1))
  const focus = shownDays[meAt] ?? today
  const aroundKey = needsAroundFetch(farDay, now) && farDay ? farDay.toDateString() : ''
  useEffect(() => { onFocusDay?.(aroundKey ? new Date(aroundKey) : null) }, [aroundKey, onFocusDay])
  const lanePeople = members.filter((m) => m.show_on_home_sidebar !== false)
  const eventIds = useMemo(() => new Set(events.map((e) => e.id)), [events])
  const openable = (id: string | undefined | null) => Boolean(id && eventIds.has(id))
  // The day plan an event sits in (its trip, or its blocks), for its sheet.
  const planOf = (id: string) => week.find((p) => p.trips.some((t) => t.sourceId === id) || [...p.lanes.values()].some((segs) => segs.some((seg) => seg.sourceId === id))) ?? focus
  const askHandOff = (trip: Trip | null) => {
    if (!trip) return
    const plan = week.find((p) => p.trips.some((t) => t.id === trip.id)) ?? focus
    if (plan) setHandOff({ trip, plan })
  }
  const itemOf = (id: string) => checklist.find((i) => i.id === id)
  const talkTopic = casaTalk?.topic && (!casaTalk.topic.forId || casaTalk.topic.forId === viewerId) ? casaTalk.topic : null
  const answerTalk = async (a: TalkAnswer) => {
    if (!talkTopic) return
    const d = talkTopic.decision
    const action = a.action
    if (action.type === 'snooze') return casaTalk?.snooze(talkTopic.key, snoozeUntil(talkTopic.at, now))
    if (action.type === 'dismiss') return tripActions?.dismiss?.(d.date, d.key)
    const plan = week.find((p) => p.date.toDateString() === d.date.toDateString())
    if (!plan) return
    if (action.type === 'pick') {
      const trip = plan.trips.find((t) => t.id === action.tripIds[0])
      if (trip) setHandOff({ trip, plan })
      return
    }
    for (const id of action.tripIds) {
      const trip = plan.trips.find((t) => t.id === id)
      if (trip) await tripActions?.handOff(trip, action.driverId, d.date)
    }
  }

  const nowLine = (
    <div data-now-line aria-label={`Now, ${clock(now)}`} className="my-[6px] flex items-center gap-[8px]">
      <span aria-hidden="true" className="phone-now-dot h-[10px] w-[10px] shrink-0 rounded-full bg-wall-brass ring-4 ring-wall-brass/25" />
      <span className="shrink-0 text-phone-label font-extrabold tracking-[0.14em] text-wall-brass-ink">NOW · {clock(now)}</span>
      <span aria-hidden="true" className="h-[2px] flex-1 rounded-full bg-wall-brass" />
    </div>
  )
  // Me for any day of the strip (the day pager draws a page per day; premium plan, Phase A).
  const meScreenFor = (meAt: number, bare = false) => {
    const focus = shownDays[meAt] ?? today
    const meWhen = focus ? dayWhen(focus.date, now) : 'today'
    const onToday = !focus || focus.date.toDateString() === now.toDateString()
    const onTomorrow = Boolean(focus) && focus!.date.toDateString() === new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toDateString()
    const meWeekday = focus ? focus.date.toLocaleDateString('en-US', { weekday: 'long' }) : ''
    const focusNow = onToday || !focus ? now : new Date(focus.date.getFullYear(), focus.date.getMonth(), focus.date.getDate())
    const me = meView({ viewerId, plan: focus, members, events: shownEvents, checklist, now: focusNow })
    const tripOf = (move: PhoneMove) => focus?.trips.find((t) => t.id === move.tripIds[0]) ?? null
    return (
    <div className="flex flex-col gap-[18px]">
      {!bare && <div className="flex items-center justify-between">
        <div>
          <div className="text-phone-detail text-wall-ink-2">
            {onToday || !focus
              ? `${now.toLocaleDateString('en-US', { weekday: 'long' })} · ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
              : onTomorrow ? `Tomorrow · ${meWeekday}` : focus.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          <h1 className="m-0 font-display text-phone-title font-bold text-wall-ink">{viewer ? `${viewer.name}'s ${onToday ? 'day' : onTomorrow ? 'tomorrow' : meWeekday}` : onToday ? 'Your day' : onTomorrow ? 'Tomorrow' : meWeekday}</h1>
        </div>
        {viewer && <Disc id={viewer.id} members={members} pigments={pigments} size="h-[40px] w-[40px] text-phone-heading" />}
      </div>}

      {talkTopic && <PhoneCasaTalk topic={talkTopic} onAnswer={answerTalk} onTalk={assistant ? () => { setAskOpening(null); setAskOpen(true) } : undefined} />}

      {me.next ? (
        <section aria-label="Your next move" className="flex flex-col gap-[6px] rounded-[20px] bg-wall-ink p-[18px] text-wall-on-pigment">
          <div className={`text-phone-label font-bold tracking-[0.16em] ${me.next.phase === 'there' ? 'text-wall-night-brass' : 'text-wall-night-rust'}`}>{me.next.eyebrow}</div>
          <div className="font-display text-phone-move font-semibold">{me.next.title}</div>
          <div className="text-phone-body text-wall-stone">{me.next.summary}</div>
          {me.next.travelerIds.filter((id) => id !== viewerId).length > 0 && (
            <div className="flex items-center gap-[6px] text-phone-detail text-wall-stone">
              with {me.next.travelerIds.filter((id) => id !== viewerId).map((id) => <Disc key={id} id={id} members={members} pigments={pigments} size="h-[22px] w-[22px] text-phone-label" />)}
            </div>
          )}
          {/* Directions first: it's what you reach for (Jake, 2026-09-26). */}
          {me.next.address && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(me.next.address)}`}
              target="_blank"
              rel="noreferrer"
              className="mt-[8px] flex h-[48px] items-center justify-center gap-[8px] rounded-full bg-wall-on-pigment text-phone-body font-bold text-wall-ink no-underline"
            >
              <Navigation size={18} aria-hidden="true" /> Directions
            </a>
          )}
          <div className="flex gap-[8px]">
            {tripActions && meAt === 0 && (me.next.departed ? (
              <button type="button" onClick={() => tripActions.undoLeaving(me.next!.tripIds)} className="h-[44px] flex-1 rounded-full border border-solid border-wall-ink-2 bg-transparent text-phone-body font-semibold text-wall-on-pigment">Not yet (undo)</button>
            ) : me.next.phase !== 'there' ? (
              <button type="button" onClick={() => tripActions.leaving(me.next!.tripIds)} className="h-[44px] flex-1 rounded-full border border-solid border-wall-ink-2 bg-transparent text-phone-body font-semibold text-wall-on-pigment">Leaving now</button>
            ) : null)}
            {tripActions && <button type="button" onClick={() => askHandOff(tripOf(me.next!))} className="h-[44px] flex-1 rounded-full border border-solid border-wall-ink-2 bg-transparent text-phone-body font-semibold text-wall-on-pigment">Hand off</button>}
            {me.next.eventId && openable(me.next.eventId) && (
              <button type="button" onClick={() => { setOpenMode('edit'); setOpenId(me.next!.eventId) }} className="h-[44px] flex-1 rounded-full border border-solid border-wall-ink-2 bg-transparent text-phone-body font-semibold text-wall-on-pigment">Edit</button>
            )}
          </div>
        </section>
      ) : null}

      {me.moves.length > 0 && (
        <section aria-label="Your moves today">
          <Label>{`YOUR MOVES ${meWhen.toUpperCase()}`}</Label>
          {me.moves.map((m) => (
            <button key={m.tripIds[0]} type="button" disabled={!openable(tripOf(m)?.sourceId)} onClick={() => setOpenId(tripOf(m)?.sourceId ?? null)} className="flex w-full items-start gap-[12px] border-0 border-t border-solid border-wall-stone bg-transparent px-0 py-[10px] text-left text-wall-ink">
              {/* Jake's note on 05a: a "Leave by" label, and the time in bold. */}
              <span className="flex w-[72px] shrink-0 flex-col">
                <span className="text-phone-label text-wall-ink-2">Leave by</span>
                <span className="text-phone-heading font-bold">{m.leaveBy ?? '—'}</span>
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-phone-body font-semibold">{m.title}</span>
                <span className="text-phone-detail text-wall-ink-2">{m.summary}</span>
              </span>
            </button>
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

      {/* Your day (Jake, Oct 2: "Anything I'm tagged in for an event, meeting, reminder for today should show up"): the
          Family list for you — events and meetings you're in, your chores and to-dos — and your private reminders, with
          the NOW line. */}
      {(() => {
        const mine = familyItems(focus, members, viewerId)
        const ids = new Set(mine.map((i) => i.id))
        const own: FamilyItem[] = me.justYours.filter((j) => !ids.has(j.id)).map((j) => ({
          id: j.id, time: clock(j.at), at: j.at, end: new Date(j.at.getTime() + 15 * 60_000), title: j.title, sub: 'Just yours', people: viewerId ? [viewerId] : [], kind: 'todo' as const,
        }))
        const all = [...mine, ...own].sort((x, y) => Number(y.time === 'All day') - Number(x.time === 'All day') || x.at.getTime() - y.at.getTime())
        return all.length > 0 ? (
          <section aria-label="Your day">
            <Label>{`YOUR DAY${onToday ? '' : ` · ${meWeekday.toUpperCase()}`}`}</Label>
            {dayList(focus, all)}
          </section>
        ) : null
      })()}
    </div>
    )
  }

  // A day opened from Casa or the month (canvas 30b): Family on that day, with the week around it to swipe.
  const openDay = (date: Date) => {
    setMonthOpen(false)
    setTab('today')
    const i = week.findIndex((p) => p.date.toDateString() === date.toDateString())
    setFarDay(i >= 0 || !planDay ? null : date)
    setDayIndex(i >= 0 ? i : null)
  }
  // Family for any day of the strip (a page per day in the pager).
  // A day's list (canvas 30a), on Family and on Me: what's started above the NOW line (the last two in view, the rest
  // folded), finished faded, a late chore or to-do in rust, the next lifted; chores and to-dos tick.
  const dayList = (shownDay: DayPlan | null, items: FamilyItem[]) => {
    const shownKey = shownDay?.date.toDateString() ?? ''
  // Today's list splits at NOW (canvas 30a): started above the line (the last two in view), finished faded, the next
  // lifted with how long until it; chores and to-dos get ticks.
  const familyToday = Boolean(shownDay && sameDay(shownDay.date, now))
  const timeline = dayTimeline(items, now)
  const familyRow = (i: FamilyItem) => {
    const next = familyToday && i.id === timeline.nextId
    const tickKey = i.kind === 'chore' ? `${i.id}:${phoneDay(shownDay?.date ?? now)}` : `todo:${i.id}`
    const tickable = (i.kind === 'chore' && tickChore) || (i.kind === 'todo' && todos)
    const ticked = ticks.pending.has(tickKey) || (i.kind === 'chore' && choreDone.has(tickKey))
    // A chore or to-do whose time has passed, not ticked, is late (rust), not faded: it still needs doing.
    const late = familyToday && Boolean(tickable) && !ticked && i.kind !== 'event' && i.at.getTime() < now.getTime()
    const past = familyToday && isPast(i, now) && !late
    return (
      <div key={i.id} className={`flex items-stretch gap-[12px] ${next ? '-mx-[12px] my-[2px] rounded-[16px] bg-wall-brass/12 px-[12px] py-[12px]' : 'border-0 border-t border-solid border-wall-stone py-[10px]'} ${past ? 'opacity-45' : ''}`}>
        <button type="button" disabled={!openable(i.id)} onClick={() => setOpenId(i.id)} className="flex min-w-0 flex-1 items-stretch gap-[12px] border-0 bg-transparent p-0 text-left text-wall-ink">
          <span className={`w-[52px] shrink-0 pt-[2px] text-phone-body font-bold ${next ? 'text-wall-brass-ink' : late ? 'text-wall-rust' : ''}`}>{i.time}</span>
          <span aria-hidden="true" className={`w-[4px] shrink-0 rounded-[2px] ${past ? 'bg-wall-stone' : pigmentStyleFor(pigments.get(i.people[0] ?? '') ?? 0).solid}`} />
          <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
            <span className={`text-phone-body font-semibold ${ticked ? 'text-wall-ink-2 line-through' : ''}`}>{i.title}</span>
            {(i.sub || next || late) && <span className={`text-phone-detail ${next ? 'font-semibold text-wall-brass-ink' : late ? 'font-semibold text-wall-rust' : 'text-wall-ink-2'}`}>{next ? <><span key={untilWords(i.at, now)} className="phone-roll">{untilWords(i.at, now)}</span>{i.sub ? ` · ${i.sub}` : ''}</> : late ? `Late · ${i.sub}` : i.sub}</span>}
            {keptFromOf(keepFrom, i.id).length > 0 && (
              <span className="flex items-center gap-[4px] text-phone-label font-bold tracking-[0.12em] text-wall-brass-ink">
                <Lock size={12} strokeWidth={2.5} aria-hidden="true" /> KEPT FROM {keptFromOf(keepFrom, i.id).map((id) => members.find((m) => m.id === id)?.name ?? '').join(' & ').toUpperCase()}
              </span>
            )}
          </span>
        </button>
        {tickable && (
          <button
            type="button"
            role="checkbox"
            aria-checked={ticked}
            aria-label={`Done: ${i.title}`}
            onClick={() => { haptic(); if (i.kind === 'chore' && choreDone.has(tickKey)) void tickChore?.(i.id.slice('chore:'.length), shownDay?.date ?? now, false); else ticks.toggle(tickKey) }}
            className="flex h-[44px] w-[44px] shrink-0 items-center justify-center self-center border-0 bg-transparent p-0"
          >
            <span aria-hidden="true" className={`flex h-[24px] w-[24px] items-center justify-center rounded-[6px] border-[1.5px] border-solid ${ticked ? 'phone-tick-pop border-wall-ink-2 bg-wall-ink-2 text-wall-on-pigment' : 'border-wall-ink-2'}`}>
              {ticked && <Check size={16} strokeWidth={3} />}
            </span>
          </button>
        )}
        <span className="flex shrink-0 gap-[2px] self-center">
          {i.people.map((id) => <Disc key={id} id={id} members={members} pigments={pigments} size="h-[26px] w-[26px] text-phone-label" />)}
        </span>
      </div>
    )
  }
    return (
      <div className="phone-rise">
        {items.length === 0 && <div className="py-[12px] font-display text-phone-heading italic text-wall-ink-2">Nothing on the calendar.</div>}
        {familyToday ? (
          <>
            {timeline.allDay.map((i) => familyRow(i))}
            {timeline.folded.length > 0 && (earlierFor === shownKey
              ? timeline.folded.map((i) => familyRow(i))
              : (
                <div className="flex justify-center py-[8px]">
                  <button type="button" onClick={() => setEarlierFor(shownKey)} className="flex h-[36px] max-w-full items-center gap-[6px] rounded-full border-0 bg-phone-card px-[14px] text-phone-detail font-semibold text-wall-ink-2">
                    <ArrowUp size={15} strokeWidth={2.4} aria-hidden="true" className="shrink-0" />
                    <span className="truncate">{foldLabel(timeline.folded)}</span>
                  </button>
                </div>
              ))}
            {timeline.before.map((i) => familyRow(i))}
            {nowLine}
            {timeline.after.map((i) => familyRow(i))}
          </>
        ) : items.map((i) => familyRow(i))}
      </div>
    )
  }
  // Your initial at the top right of every tab (32h): people and places, email and settings sit behind it.
  const initial = viewer ? (
    <button type="button" aria-label="You, people and settings" onClick={() => setInitialOpen(true)} className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full border-0 bg-transparent p-0">
      <Disc id={viewer.id} members={members} pigments={pigments} size="h-[40px] w-[40px] text-phone-heading" />
    </button>
  ) : null
  // Today (canvas 32a/33a): one pager of days; the chips choose whose — Everyone first (Jake: "I first want to see big
  // picture"), then Me, then the rest. Everyone leaves the chores out; a person's own day has them (33a/33b notes).
  const todayScreenFor = (dayAt: number) => {
    const shownDay = shownDays[dayAt] ?? today
    const mine = Boolean(viewerId) && filter === viewerId
    const person = filter ? members.find((m) => m.id === filter) ?? null : null
    const onToday = !shownDay || sameDay(shownDay.date, now)
    const onTomorrow = Boolean(shownDay) && sameDay(shownDay!.date, new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))
    const whenWord = onToday ? 'day' : onTomorrow ? 'tomorrow' : shownDay!.date.toLocaleDateString('en-US', { weekday: 'long' })
    const title = !filter ? 'Everyone' : mine ? `Your ${whenWord}` : person ? `${person.name}’s ${whenWord}` : 'Everyone'
    const items = familyItems(shownDay, members, filter).filter((i) => filter !== null || i.kind !== 'chore')
    const chipPeople = [
      { id: null as string | null, name: 'Everyone' },
      ...(viewer && lanePeople.some((m) => m.id === viewer.id) ? [{ id: viewer.id as string | null, name: 'Me' }] : []),
      ...lanePeople.filter((m) => m.id !== viewerId).map((m) => ({ id: m.id as string | null, name: m.name })),
    ]
    return (
    <div className="flex flex-col gap-[14px]">
      <div className="flex items-start justify-between gap-[12px]">
        <div className="min-w-0">
          <button type="button" aria-label="Any day" onClick={() => setMonthOpen(true)} className="flex min-h-[28px] items-center gap-[4px] border-0 bg-transparent p-0 text-phone-detail text-wall-ink-2">
            {shownDay ? shortDate(shownDay.date) : ''}<ChevronDown size={15} aria-hidden="true" />
          </button>
          <h1 className="m-0 font-display text-phone-title font-bold text-wall-ink">{title}</h1>
        </div>
        {/* Only the page in view carries it (the neighbours are drawn ahead). */}
        {dayAt === pagerAt ? initial : <span aria-hidden="true" className="h-[44px] w-[44px] shrink-0" />}
      </div>
      <div className="-mx-[20px] flex gap-[8px] overflow-x-auto px-[20px] pb-[2px]">
        {chipPeople.map((p) => (
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
      {mine ? meScreenFor(dayAt, true) : (
        <>
          {!filter && talkTopic && <PhoneCasaTalk topic={talkTopic} onAnswer={answerTalk} onTalk={assistant ? () => { setAskOpening(null); setAskOpen(true) } : undefined} />}
          {dayList(shownDay, items)}
        </>
      )}
    </div>
    )
  }

  const phoneToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  // The week's tiles count events only, at home and away — not school, work or chores (Jake, Oct 2: "so the dots mean
  // something"); the first out is the first trip that isn't a routine run.
  const days = weekDays(week, members, [], now, checklist, { eventsOnly: true })
  // Calendar (was Week): the days ahead; a day opens on Today. Coming up stays on the wall (UX review).
  const calendarScreen = (
    <div className="flex flex-col gap-[10px]">
      <div className="flex items-center justify-between gap-[12px]">
        <h1 className="m-0 font-display text-phone-title font-bold text-wall-ink">Calendar</h1>
        <div className="flex items-center gap-[8px]">
          <button type="button" onClick={() => setMonthOpen(true)} className="flex h-[44px] items-center gap-[4px] rounded-full border border-solid border-wall-stone bg-transparent px-[14px] text-phone-detail font-semibold text-wall-ink">
            Any day <ChevronDown size={15} aria-hidden="true" />
          </button>
          {initial}
        </div>
      </div>
      {days.map((d, i) => (
        <button
          key={d.key}
          type="button"
          onClick={() => { setFarDay(null); setDayIndex(i); setTab('today') }}
          className={`flex min-h-[64px] w-full items-center gap-[14px] rounded-[16px] bg-transparent px-[14px] py-[10px] text-left text-wall-ink ${i === focusIndex ? 'border-2 border-solid border-wall-ink' : 'border border-solid border-wall-stone'}`}
        >
          <span className="flex w-[80px] flex-col">
            <span className={`text-phone-label font-bold tracking-[0.16em] ${i === focusIndex ? 'text-wall-brass-ink' : 'text-wall-ink-2'}`}>{d.weekday.toUpperCase()}</span>
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
  // To do (Jake's alone, 32e): his to-dos.
  const todoScreen = todos ? (
    <div className="flex flex-col gap-[10px]">
      <div className="flex items-start justify-between gap-[12px]">
        <div className="flex min-w-0 flex-col">
          <span className="whitespace-nowrap text-phone-detail text-wall-ink-2">{todoSummary(todos.list)}</span>
          <h1 className="m-0 font-display text-phone-title font-bold text-wall-ink">To do</h1>
        </div>
        {initial}
      </div>
      <PhoneTodo
        list={todos.list}
        today={phoneToday}
        onAct={todos.act}
        onOpenProject={setProjectId}
        onEdit={setEditingTodo}
        upcoming={comingUp?.items ?? []}
        onStart={comingUp?.start ? (key) => void comingUp.start!(key).then((id) => { if (id) setProjectId(id) }) : undefined}
      />
    </div>
  ) : null

  // Behind your initial (32h): all that's left of More. Meals, Music and the Briefing stay on the wall and the web.
  const initialRow = (icon: ReactNode, title: string, sub: string, onClick: () => void) => (
    <button type="button" onClick={onClick} className="flex min-h-[64px] w-full items-center gap-[14px] border-0 border-t border-solid border-wall-stone bg-transparent px-0 py-[8px] text-left text-wall-ink">
      <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-phone-card">{icon}</span>
      <span className="flex flex-1 flex-col gap-[2px]">
        <span className="text-phone-body font-bold">{title}</span>
        <span className="text-phone-detail text-wall-ink-2">{sub}</span>
      </span>
      <ChevronRight size={18} aria-hidden="true" className="text-wall-ink-2" />
    </button>
  )

  const tabs: Array<{ id: Tab; label: string; icon: ReactNode }> = [
    { id: 'today', label: 'Today', icon: <Sun size={22} /> },
    { id: 'calendar', label: 'Calendar', icon: <CalendarDays size={22} /> },
    ...(groceries ? [{ id: 'groceries' as Tab, label: 'Groceries', icon: <ShoppingBasket size={22} /> }] : []),
    ...(todos ? [{ id: 'todo' as Tab, label: 'To do', icon: <ListChecks size={22} /> }] : []),
  ]
  // The tab you're on goes back to its start, as an iPhone tab bar does: today, and the top.
  const pickTab = (id: Tab) => {
    if (id !== tab) haptic()
    if (id === tab) scroller()?.scrollTo({ top: 0, behavior: 'smooth' })
    setTab(id)
    if (id === 'today' && (tab === 'today' || tab === 'groceries' || tab === 'todo')) { setDayIndex(null); setFarDay(null) }
  }

  // Swipe between days on Me and Family (Jake, 2026-09-28: "it feels natural there"): left for the
  // next day, right for the day before, within the week; stops at the ends; off while a sheet is up.
  const mainRef = useRef<HTMLElement>(null)
  // The glass bar settles smaller while scrolling down the list, and comes back scrolling up or at the top.
  const [barCompact, setBarCompact] = useState(false)
  // Scrolled past the big title: a small one in a frosted bar at the top (premium plan, Phase B).
  const [tucked, setTucked] = useState(false)
  const lastScroll = useRef(0)
  // Nothing yet: the day's shape shimmering, not "Nothing on the calendar".
  const loading = week.length === 0 || members.length === 0
  // A page pushed over the tabs, or a sheet raised over them (the screen behind moves either way).
  const pushOpen = Boolean((openId && eventIds.has(openId)) || peopleOpen || emailSettingsOpen || (todos && projectId))
  const sheetUp = Boolean(monthOpen || addOpen || handOff || editingTodo || askOpen || initialOpen)
  // Me and Family are a pager of whole days (PhoneDayPager): the page in view is the one that scrolls.
  const paged = !loading && tab === 'today'
  const familyAt = Math.min(dayIndex ?? (farAt >= 0 ? farAt : focusIndex), Math.max(0, shownDays.length - 1))
  const pagerAt = familyAt
  const [activePage, setActivePageState] = useState<HTMLElement | null>(null)
  const activeRef = useRef<HTMLElement | null>(null)
  const setActivePage = useCallback((el: HTMLElement | null) => { activeRef.current = el; setActivePageState(el) }, [])
  const scroller = () => (paged ? activeRef.current : mainRef.current)
  const tuckedDay = shownDays[pagerAt]?.date ?? now
  const tuckedWhen = sameDay(tuckedDay, now) ? 'Today' : tuckedDay.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const tuckedWho = !filter ? 'Everyone' : filter === viewerId ? 'You' : members.find((m) => m.id === filter)?.name ?? 'Everyone'
  const tuckedTitle = tab === 'today' ? `${tuckedWho} · ${tuckedWhen}` : tab === 'calendar' ? 'Calendar' : tab === 'todo' ? 'To do' : 'Groceries'
  const onMainScroll = () => {
    const y = scroller()?.scrollTop ?? 0
    const down = y > lastScroll.current + 6
    const up = y < lastScroll.current - 6
    if ((y > 64) !== tucked) setTucked(y > 64)
    if (down && y > 80 && !barCompact) setBarCompact(true)
    else if ((up || y < 40) && barCompact) setBarCompact(false)
    if (down || up) lastScroll.current = y
  }
  const onMainScrollRef = useRef(onMainScroll)
  useEffect(() => { onMainScrollRef.current = onMainScroll })
  // Today's list opens scrolled to NOW (canvas 30a), a little of what's just happened above it; "↑ earlier" folds again
  // when the day or the tab changes.
  useEffect(() => {
    if (tab !== 'today') return
    const frame = window.requestAnimationFrame(() => {
      const main = activePage
      const line = main?.querySelector<HTMLElement>('[data-now-line]')
      // Once per page: a page already scrolled is left where it was.
      if (!main || !line || main.scrollTop > 0) return
      const top = line.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop
      main.scrollTo({ top: Math.max(0, top - main.clientHeight * 0.38) })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [tab, activePage, filter])
  // The tab bar settles smaller scrolling down the page in view, too.
  useEffect(() => {
    if (!activePage) return
    lastScroll.current = activePage.scrollTop
    const sync = window.requestAnimationFrame(() => onMainScrollRef.current())
    const on = () => onMainScrollRef.current()
    activePage.addEventListener('scroll', on, { passive: true })
    return () => { window.cancelAnimationFrame(sync); activePage.removeEventListener('scroll', on) }
  }, [activePage])
  usePhoneShell()
  const handOffSwipe = useSheetSwipe(() => setHandOff(null))
  const closeAsk = () => { setAskOpen(false); setAskOpening(null) }
  const askSwipe = useSheetSwipe(closeAsk, { handle: 56 })
  const initialSwipe = useSheetSwipe(() => setInitialOpen(false))

  const choices = handOff ? driverChoices(handOff.plan, members, handOff.trip, handOff.trip.sourceId) : []
  const opened = openId && eventIds.has(openId) ? eventView({ eventId: openId, plan: planOf(openId), events, members, viewerId, checklist }) : null

  return (
    // Locked to the screen like an app: the page never scrolls or bounces, only the middle does;
    // the top clears the notch / status bar and the tab bar clears the home indicator. With the keyboard up the frame
    // ends at its top (--phone-kb, phoneShell.ts), so a sheet or Ask Casa's line sits above it, never under it.
    <div data-phone-frame className={`fixed inset-x-0 top-0 bottom-[var(--phone-kb,0px)] flex flex-col overflow-hidden font-body text-wall-ink transition-colors duration-500 ${sheetUp && !pushOpen ? 'bg-wall-ink' : 'bg-phone-ground'}`}>
      {/* The screen behind pages and sheets: slid aside under a pushed page, shrunk back under a sheet. */}
      <div ref={behindRef} className={`absolute inset-0 flex flex-col overflow-hidden bg-phone-ground transition-[transform,border-radius] duration-500 ease-[cubic-bezier(0.2,0.9,0.25,1)] ${sheetUp && !pushOpen ? 'phone-behind-sheet' : ''}`}>
      {/* Me and Family: a pager of whole days you drag with your thumb (premium plan, Phase A). The other tabs: one page
          that fades in, running under the frosted tab bar. */}
      <main ref={mainRef} onScroll={paged || tab === 'groceries' ? undefined : onMainScroll} className={`relative flex-1 ${paged || tab === 'groceries' ? 'overflow-hidden' : `touch-pan-y overflow-y-auto overscroll-contain ${PAGE_PAD}`}`}>
        {tab === 'groceries' && groceries ? (
          <PhoneGroceries data={groceries} adding={groceryAdding} setAdding={setGroceryAdding} corner={initial} />
        ) : paged ? (
          <PhoneDayPager
            key={tab}
            count={shownDays.length}
            index={pagerAt}
            onIndex={(i) => { haptic(); setDayIndex(i) }}
            onActivePage={setActivePage}
            pageClassName={PAGE_PAD}
            renderPage={(i) => (Math.abs(i - pagerAt) <= 1 ? (
              <>
                {i === pagerAt && <PullToRefresh scrollRef={activeRef} onRefresh={onRefresh} />}
                {todayScreenFor(i)}
              </>
            ) : <PhoneSkeleton />)}
          />
        ) : (
          <>
            <PullToRefresh scrollRef={mainRef} onRefresh={onRefresh} />
            <div key={tab} className="phone-tab-in">
              {loading && <PhoneSkeleton />}
              {!loading && tab === 'calendar' && calendarScreen}
              {!loading && tab === 'todo' && todoScreen}
            </div>
          </>
        )}
      </main>
      <div aria-hidden={!tucked} className={`phone-tucked pointer-events-none absolute inset-x-0 top-0 z-10 flex h-[48px] items-center justify-center border-0 border-b border-solid border-wall-stone/70 bg-phone-ground/80 backdrop-blur-xl backdrop-saturate-150 ${tucked ? 'opacity-100' : '-translate-y-[8px] opacity-0'}`}>
        <span className="font-display text-phone-heading font-bold text-wall-ink">{tuckedTitle}</span>
      </div>
      {/* Casa to the right of the bar (32j); on Groceries it adds to the list (33d). */}
      <PhoneTabBar
        tabs={tabs}
        current={tab}
        onTab={pickTab}
        compact={barCompact}
        action={tab === 'groceries' && groceries
          ? { label: 'Add to groceries', icon: <Plus size={28} strokeWidth={2.2} />, onClick: () => { primeKeyboard(); setGroceryAdding(true) } }
          : assistant
            ? { label: 'Casa', icon: <Sparkles size={26} strokeWidth={1.9} />, onClick: () => { setAskOpening(null); setAskOpen(true) } }
            : { label: 'Add something', icon: <Plus size={28} strokeWidth={2.2} />, onClick: () => setAddOpen(true), disabled: !createEvent }}
      />
      </div>
      <AnimatePresence>
        {todos && projectId && (
          <PhonePushPage key={`project-${projectId}`} onShift={shiftBehind} onBack={() => setProjectId(null)}>
            <ProjectOnPhone id={projectId} todos={todos} today={phoneToday} onBack={() => setProjectId(null)} onOpenProject={setProjectId} onTalk={assistant ? (say) => { setProjectId(null); setAskOpening(say); setAskOpen(true) } : undefined} />
          </PhonePushPage>
        )}
      </AnimatePresence>
      {monthOpen && <PhoneMonth now={now} members={members} pigments={pigments} useMonth={useMonthEvents ?? (() => shownEvents as WallEvent[])} onOpen={openDay} onClose={() => setMonthOpen(false)} />}
      {todos && editingTodo && <PhoneTodoSheet item={editingTodo} onAct={todos.act} onClose={() => setEditingTodo(null)} />}

      <AnimatePresence>
      {opened && (
        <PhonePushPage key={`event-${openId}`} onShift={shiftBehind} onBack={() => { setOpenId(null); setOpenMode('details') }}>
        <PhoneEventSheet
          view={opened}
          members={members}
          pigments={pigments}
          viewerId={viewerId}
          now={now}
          initialMode={openMode}
          onClose={() => { setOpenId(null); setOpenMode('details') }}
          onHandOff={tripActions ? askHandOff : undefined}
          onLeaving={tripActions ? (trip) => tripActions.leaving([trip.id]) : undefined}
          onToggleItem={onToggleItem}
          onAddItem={onAddItem}
          useItems={useEventItems}
          saveEvent={saveEvent}
          deleteEvent={deleteEvent}
          keptFrom={keptFromOf(keepFrom, openId!)}
          suggestKeepFrom={opened.event ? keepFromSuggestion(opened.event, members, keepFrom) : []}
          onKeepFrom={setKeptFrom ? (ids) => setKeptFrom(openId!, ids) : undefined}
        />
        </PhonePushPage>
      )}
      </AnimatePresence>

      <AnimatePresence>
      {peopleOpen && (
        <PhonePushPage key="people" onShift={shiftBehind} onBack={() => setPeopleOpen(false)}>
        <PhonePeople
          contacts={contacts}
          places={places}
          onClose={() => setPeopleOpen(false)}
          family={{
            members,
            routines,
            dayOffs: dayOffs.filter((d) => d.override_type === 'day_off' && d.id).map((d) => ({ id: d.id!, memberId: d.member_id, start: ymdOf(d.start_at), end: ymdOf(d.end_at) })),
            now,
            canEdit: members.find((m) => m.id === viewerId)?.role === 'parent',
          }}
        />
        </PhonePushPage>
      )}
      </AnimatePresence>
      <AnimatePresence>
      </AnimatePresence>
      <AnimatePresence>
        {emailSettingsOpen && (
          <PhonePushPage key="email-settings" onShift={shiftBehind} onBack={() => setEmailSettingsOpen(false)}>
            <PhoneEmailSettings onClose={() => setEmailSettingsOpen(false)} useSettings={useEmailSettingsHook} />
          </PhonePushPage>
        )}
      </AnimatePresence>
      {/* Ask Casa rises as a tall sheet (premium plan): the screen behind shrinks back; drag its handle down to close. */}
      {askOpen && assistant && (
        <div className="phone-scrim absolute inset-0 z-30 bg-wall-ink/30" onClick={closeAsk}>
          <div {...askSwipe} onClick={(e) => e.stopPropagation()} className="phone-sheet absolute inset-x-0 bottom-0 top-[10px] overflow-hidden rounded-t-[26px] bg-phone-ground shadow-[0_-12px_40px_rgba(38,34,29,0.18)]">
            <div aria-hidden="true" className="absolute left-1/2 top-[6px] z-30 h-[5px] w-[38px] -translate-x-1/2 rounded-full bg-wall-stone" />
            {assistant?.({
        onClose: () => { setAskOpen(false); setAskOpening(null) },
        // From Casa's button (32f): the form one tap away, and Scan beside the box.
        onForm: createEvent ? () => { setAskOpen(false); setAskOpening(null); setAdding(blankEvent(tab === 'today' ? (shownDays[familyAt]?.date ?? now) : now, now, 'event')) } : undefined,
        onScan: scan && createEvent ? () => { setAskOpen(false); setAskOpening(null); setScanOpen(true) } : undefined,
        opening: askOpening,
        onOpenEvent: (id) => { setAskOpen(false); setOpenMode('details'); setOpenId(id) },
        // A day Casa opened (show_day): Family on that day — everyone's day, as asked — with the week
        // around it to swipe (Me, the drives alone, follows the same week).
        onOpenDay: (date) => {
          setAskOpen(false)
          openDay(date)
        },
        // A saved plan's project or To do (P3.25; board 12d).
        onOpenPlace: (open) => { setAskOpen(false); if (open.kind === 'project') setProjectId(open.id); else if (open.kind === 'todo') setTab('todo') },
      })}
          </div>
        </div>
      )}
      {scanOpen && scan && createEvent && (
        <PhoneScanSheet members={members} pigments={pigments} scan={scan} createEvent={createEvent} applyPlan={applyPlan} findSimilar={findSimilar} onClose={() => setScanOpen(false)} />
      )}
      {initialOpen && (
        <div className="phone-scrim absolute inset-0 z-30 bg-wall-ink/35" onClick={() => setInitialOpen(false)}>
          <section {...initialSwipe} aria-label="You, people and settings" onClick={(e) => e.stopPropagation()} className="phone-sheet absolute bottom-0 left-0 flex w-full flex-col rounded-t-[26px] bg-phone-ground px-[20px] pb-[max(30px,calc(env(safe-area-inset-bottom)+12px))] pt-[10px]">
            <div aria-hidden="true" className="mx-auto mb-[12px] h-[5px] w-[38px] rounded-full bg-wall-stone" />
            {viewer && (
              <div className="mb-[10px] flex items-center gap-[12px]">
                <Disc id={viewer.id} members={members} pigments={pigments} size="h-[48px] w-[48px] text-phone-heading" />
                <span className="font-display text-phone-heading font-bold text-wall-ink">{viewer.full_name ?? viewer.name}</span>
              </div>
            )}
            {initialRow(<Users size={20} />, 'People and places', 'Find someone · call, text, directions', () => { setInitialOpen(false); setPeopleOpen(true) })}
            {initialRow(<Mail size={20} />, 'Email', 'Keep me posted · what’s quiet · the wall', () => { setInitialOpen(false); setEmailSettingsOpen(true) })}
            <Link to="/settings" className="flex min-h-[64px] w-full items-center gap-[14px] border-0 border-t border-solid border-wall-stone py-[8px] text-wall-ink no-underline">
              <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-phone-card"><Settings size={20} /></span>
              <span className="flex flex-1 flex-col gap-[2px]"><span className="text-phone-body font-bold">Settings</span><span className="text-phone-detail text-wall-ink-2">Family, calendars, voice</span></span>
              <ChevronRight size={18} aria-hidden="true" className="text-wall-ink-2" />
            </Link>
            <Link to="/wall" className="mt-[12px] flex h-[48px] items-center justify-center gap-[10px] rounded-full border border-solid border-wall-ink-2 text-phone-body font-semibold text-wall-ink no-underline">
              <Monitor size={18} /> See the Wall
            </Link>
          </section>
        </div>
      )}
      {addOpen && (
        <PhoneAddSheet
          onClose={() => setAddOpen(false)}
          onType={() => {
            setAddOpen(false)
            // On the day being looked at: Family's day, or tomorrow in the evening.
            const day = tab === 'today' ? (shownDays[familyAt]?.date ?? now) : now
            setAdding(blankEvent(day, now, 'event'))
          }}
          onScan={scan && createEvent ? () => { setAddOpen(false); setScanOpen(true) } : undefined}
          onSay={assistant ? () => { setAddOpen(false); setAskOpen(true) } : undefined}
        />
      )}
      {adding && (
        <PhoneEventSheet
          key="new"
          view={{ event: adding, when: '', place: { name: '', address: null, driveMinutes: null }, going: [], trip: null, prep: [], repeating: false }}
          members={members}
          pigments={pigments}
          viewerId={viewerId}
          now={now}
          onClose={() => setAdding(null)}
          createEvent={createEvent}
        />
      )}

      {handOff && tripActions && (
        <div className="phone-scrim absolute inset-0 z-30 bg-wall-ink/35" onClick={() => setHandOff(null)}>
          <section {...handOffSwipe} aria-label="Hand off" className="phone-sheet absolute bottom-0 left-0 flex max-h-[85%] w-full flex-col gap-[10px] overflow-y-auto rounded-t-[26px] bg-phone-ground px-[20px] pb-[max(30px,calc(env(safe-area-inset-bottom)+12px))] pt-[18px]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-phone-detail text-wall-ink-2">{handOff.trip.title}</div>
                <div className="font-display text-phone-heading font-bold">Who takes it?</div>
              </div>
              <button type="button" aria-label="Close" onClick={() => setHandOff(null)} className="flex h-[44px] w-[44px] items-center justify-center rounded-full border border-solid border-wall-stone bg-transparent p-0 text-wall-ink"><X size={18} /></button>
            </div>
            {choices.filter((c) => c.memberId !== handOff.trip.driverId).map((c) => (
              <button
                key={c.memberId}
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  try {
                    await tripActions.handOff(handOff.trip, c.memberId, handOff.plan.date)
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
