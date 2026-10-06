import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { stepWithin, type DayStep } from '../lib/daySwipe'
import { useDaySwipe } from '../lib/useDaySwipe'
import type { FamilyRoutine } from '../lib/familyRoutines'
import { blankEvent, type EditableEvent } from './editing'
import { buildDayPlan, type DayOff } from './engine/dayPlan'
import type { DayPlan, Trip, WallEvent, WallMember } from './engine/types'
import { selectNextMove } from './engine/nextMove'
import { describeNextMove } from './header'
import type { DayTripState } from './tripState'
import { decisionsFor, type DecisionAction } from './decisions'
import WallDecisionsSheet, { type DatedDecision } from './WallDecisions'
import WallHandOffSheet from './WallHandOffSheet'
import { packingGroups, type WallChecklistItem } from './packing'
import WallPackingSheet from './WallPackingSheet'
import WallTripSheet from './WallTripSheet'
import { coverageComingUp, tripCoverage } from './coverage'
import type { TravelSettings, TravelTrip } from './engine/travel'
import type { WallChore } from './engine/chores'
import { surpriseSafeChecklist } from './surprise'
import { NIGHT_IDLE_MS, eveningFocus, eveningKeepsUp, selectPosture, tomorrowLine, tonightByClock, type Posture } from './posture'
import { formatWallDate } from './clock'
import { PREVIEW_MS, shownPosture, type PreviewState } from './preview'
import { pigmentIndexes } from './score'
import { eventForPerson } from './selection'
import WallPersonSheet from './WallPersonSheet'
import WallCalm from './WallCalm'
import WallComingUp from './WallComingUp'
import WallTodos from './WallTodos'
import { quietStep, stepForEvent, todoTile, tonightNudge, type TodoAction, type TodoList, type TodoProjectDetail } from './todos'
import { WallNudge, WallQuietStep } from './WallNudge'
import { comingUpTile, type ComingUpAction, type ComingUpItem, type GiftIdea } from './comingUp'
import WallEvening from './WallEvening'
import WallEventSheet from './WallEventSheet'
import WallLaunch from './WallLaunch'
import WallMenu, { AddButton, MenuButton, MicButton } from './WallMenu'
import WallWeek from './WallWeek'
import { weekDays } from './week'
import { dayHeading, mergeEvents, needsAroundFetch, stripDates } from './dayFocus'
import { casaTopic, pushMessage, pushNow, snoozeUntil, type TalkAnswer } from './casaTalk'
import type { CasaTalkProps } from './useCasaTalk'
import WallCasaTalk, { CasaCalling } from './WallCasaTalk'
import type { ScoreInteraction } from './WallScore'
import WallNightCalm from './WallNightCalm'
import { comingHours, fitNextUp, nextUpItems, outTonight, stillTonight, type NextUpItem } from './nextUp'
import { NextUpSection, StillTonight, TONIGHT_ROOM } from './WallNextUp'

export interface WallViewProps {
  now: Date
  members: WallMember[]
  /** null while loading. */
  today: DayPlan | null
  tomorrow: DayPlan | null
  currentWeather?: { temp: number; condition: string } | null
  /** Checklist items for the day's events ("Pack tonight"). */
  checklist?: WallChecklistItem[]
  /** Every cached event plus the routine inputs: the event sheet and its previews rebuild days from these. */
  allEvents?: WallEvent[]
  routines?: FamilyRoutine[]
  dayOffs?: DayOff[]
  /** Opens the assistant band (the mic button beside MT). */
  /** Opens the assistant; with words, they're said first (a project's "Talk to Casa about it"). */
  onAsk?: (say?: string) => void
  /** The band, drawn over the wall. */
  overlay?: ReactNode
  /** A conversation with Casa (or the email review) is going: the idle timers hold — a project page or
   * To do stays up, and Calm doesn't come back (Jake, 2026-09-30). */
  busy?: boolean
  /** "Casa wants to talk to you" (canvas row 21): what it was asked to hold, and the phone notice. */
  casaTalk?: CasaTalkProps | null
  /** The item the assistant's answer is about: outlined like a selection. */
  pointAt?: string | null
  /** The assistant's draft or change waiting for a yes: previewed on the Score, on its day. */
  assistantDraft?: WallEvent | null
  /** Open this item's sheet ("Open it" in the band); the nonce repeats a request. */
  /** Open an event, a project or To do from outside (the band's Open, a saved plan's lines). */
  openRequest?: { id?: string; project?: string; todo?: boolean; day?: string; nonce: number } | null
  /** Decisions made on the wall for a day (hand-offs, "Leaving now"), applied to previews too. */
  tripStateFor?: (date: Date) => DayTripState
  /** "Leaving now", its undo, and "Hand off" from the Next Move. */
  tripActions?: {
    leaving: (tripIds: string[]) => void
    undoLeaving: (tripIds: string[]) => void
    /** Saves on the given day (default today). */
    handOff: (trip: Trip, driverId: string, date?: Date) => Promise<void>
    /** Remembers a "keep it as it is" answer for that day. */
    dismiss: (date: Date, decisionKey: string) => Promise<void>
  }
  /** Today and the next six days (decisions look this far ahead). */
  week?: DayPlan[]
  /** The week around a far day on show (dayFocus.ts), loaded by the frame when asked with onFocusDay. */
  aroundEvents?: WallEvent[] | null
  /** The far day whose week to load (null: none); told whenever it changes. */
  onFocusDay?: (date: Date | null) => void
  /** What came in by email and waits (canvas 14d), and opening its review. */
  emailCount?: number
  onOpenEmail?: () => void
  /** Deletes an event or reminder (the event sheet's Delete, after a yes). */
  deleteEvent?: (event: EditableEvent) => Promise<void>
  /** Ticks or unticks a packing item. */
  toggleChecklist?: (item: WallChecklistItem) => void
  /** Save a trip sheet's choice (canvas 19d). */
  saveTravel?: (key: string, change: TravelSettings) => Promise<void>
  /** Every trip we know of, up to four months out (coverage.ts plans each from the day it lands). */
  travelTrips?: TravelTrip[]
  /** Household chores (chores.ts), and saving them from a person's page (canvas 20). */
  chores?: WallChore[]
  saveChore?: (chore: WallChore) => Promise<void>
  deleteChore?: (id: string) => Promise<void>
  /** Add a line to an event's get & pack list (from its details). */
  addChecklist?: (eventId: string, label: string) => Promise<void>
  /** One event's own list, loaded when its details open (a reminder's isn't in the week's list). */
  useEventItems?: (eventId: string) => WallChecklistItem[]
  /** Adds an event or reminder (the + sheet), through the calendar's own create call. */
  createEvent?: (args: Record<string, unknown>) => Promise<void>
  /** Coming up (P3.19, board 07a): what needs planning, gift ideas, and the answers to an item. */
  comingUp?: { items: ComingUpItem[]; ideas: GiftIdea[]; today: string; act: (key: string, action: ComingUpAction) => Promise<void>; start?: (key: string) => Promise<string | null>; editIdea?: (id: string, idea: string | null) => Promise<void> } | null
  /** To do (P3.22, board 09b): Jake's Reminders list, sorted by Casa, and the answers to an item. */
  todos?: { list: TodoList; act: (request: TodoAction) => Promise<void>; useProject?: (id: string | null) => { data?: TodoProjectDetail | null } } | null
  /** Chores ticked for the day (`chore:<id>:<date>`), and ticking one (canvas 27a/27c). */
  choreDone?: ReadonlySet<string>
  tickChore?: (choreId: string, date: Date, done: boolean) => Promise<void>
}

const NO_TICKS: ReadonlySet<string> = new Set()
/** A tick crosses the line out this long before it's saved and leaves; a second tap in that time takes it back. */
const TICK_MS = 4000
const addTo = (key: string) => (set: Set<string>) => new Set(set).add(key)
const takeFrom = (key: string) => (set: Set<string>) => {
  const next = new Set(set)
  next.delete(key)
  return next
}

const HIDE_ROUTINES_KEY = 'casa-wall-hide-routines'
function readRoutinesHidden(): boolean {
  try { return localStorage.getItem(HIDE_ROUTINES_KEY) === '1' } catch { return false }
}
function writeRoutinesHidden(hidden: boolean) {
  try {
    if (hidden) localStorage.setItem(HIDE_ROUTINES_KEY, '1')
    else localStorage.removeItem(HIDE_ROUTINES_KEY)
  } catch { /* private mode: for this visit only */ }
}
const localYmd = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const POSTURE_NAMES: Record<Posture, string> = { launch: 'Full day', calm: 'Calm', evening: 'Evening' }
/** A touch on Calm keeps the full day up this long after the last touch. */
const WAKE_MS = 5 * 60_000

/**
 * The whole Wall, drawn from data only (no fetching), so it can be rendered from fixtures.
 * The wall picks its face by the clock and the day (posture.ts); a touch on Calm wakes
 * the full day until 5 idle minutes pass. The week strip is the way around: a day
 * tapped there shows that day (back after "Back", or 2 idle minutes). Previewing a
 * face lives in the MT menu. A tap on a calendar item opens its sheet.
 */
export default function WallView(props: WallViewProps) {
  const { now, members, today, tomorrow, currentWeather, checklist: allChecklist = [], allEvents = [], routines = [], dayOffs = [], onAsk, overlay, pointAt = null, assistantDraft = null, openRequest = null, tripStateFor, tripActions, week = [], aroundEvents = null, onFocusDay, emailCount = 0, onOpenEmail, deleteEvent, toggleChecklist, saveTravel, travelTrips = [], chores = [], saveChore, deleteChore, addChecklist, useEventItems, createEvent, comingUp = null, todos = null, busy = false, casaTalk = null, choreDone = NO_TICKS, tickChore } = props
  // The driver picker: from "Hand off" on the Next Move, or a decision answered "choose a driver".
  const [handOff, setHandOff] = useState<{ trip: Trip; plan: DayPlan; tripIds: string[]; date: Date } | null>(null)
  // Ticked a moment ago (crossed out), and ticked and saved (gone until the data says so).
  const [ticked, setTicked] = useState<Set<string>>(() => new Set())
  const [gone, setGone] = useState<Set<string>>(() => new Set())
  const tickTimers = useRef(new Map<string, number>())
  const [decisionsOpen, setDecisionsOpen] = useState(false)
  const [packingOpen, setPackingOpen] = useState(false)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  // A day tapped in the week strip: shown until "Back", or 2 idle minutes.
  const [dayPreview, setDayPreview] = useState<{ date: Date; until: number } | null>(null)
  // A touch on Calm wakes the full day until this time (5 idle minutes).
  const [awakeUntil, setAwakeUntil] = useState(0)
  // The night Calm (canvas 36a): the evening settles NIGHT_IDLE_MS after the last touch (a touch starts it again).
  const [touches, setTouches] = useState(0)
  const [idle, setIdle] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  // The + sheet: a blank item on the day on show.
  const [adding, setAdding] = useState<EditableEvent | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** The trip sheet on show (canvas 19d), by the trip's key. */
  const [tripKey, setTripKey] = useState<string | null>(null)
  // Opened from the "No one yet" row: straight to who's on it (board 08a).
  const [selectedForWho, setSelectedForWho] = useState(false)
  const [draftPreview, setDraftPreview] = useState<EditableEvent | null>(null)
  // Coming up, opened from the week strip's eighth tile: shown until "Back", or 2 idle minutes.
  const [comingUpUntil, setComingUpUntil] = useState(0)
  // To do, opened from its tile (or a swipe past Coming up): up until "Back", or 2 idle minutes.
  const [todoUntil, setTodoUntil] = useState(0)
  // A project to open straight away (a Coming up row's "Open project", P3.23).
  const [todoProject, setTodoProject] = useState<string | null>(null)
  // "Later tonight" on a nudge: off the wall for 45 minutes (the watch's reminder is untouched).
  const [nudgeLater, setNudgeLater] = useState<{ id: string; until: number } | null>(null)
  // "Hide routines" (canvas 16b): remembered on this wall until Show.
  const [routinesHidden, setRoutinesHidden] = useState(readRoutinesHidden)
  // A person's page (canvas 16e), from a tap on their name.
  const [personId, setPersonId] = useState<string | null>(null)
  // A tap on a chore's mark on the Score (canvas 20b): the person's page, opened straight into that chore.
  const [openChoreId, setOpenChoreId] = useState<string | null>(null)

  // Covering each trip (coverage.ts): its runs while the traveller is gone, from the day the trip lands in Casa.
  const tripCoverageByKey = useMemo(() => new Map(travelTrips
    .filter((t) => (t.homeAt ?? t.leaveHomeAt ?? new Date(0)).getTime() > now.getTime() - 3_600_000)
    .map((t) => [t.key, tripCoverage(t, (date) => buildDayPlan({ date, members, routines, events: allEvents, dayOffs, tripState: tripStateFor?.(date), travel: travelTrips, chores }))] as const)),
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the minute clock isn't a reason to replan; the day is
  [travelTrips, members, routines, allEvents, dayOffs, tripStateFor, chores, now.toDateString()])
  const comingUpItems = useMemo(() => comingUp ? [
    ...travelTrips.filter((t) => tripCoverageByKey.has(t.key)).map((t) => coverageComingUp(t, tripCoverageByKey.get(t.key)!, members, comingUp.today)),
    ...comingUp.items,
  ] : [], [comingUp, travelTrips, tripCoverageByKey, members])
  // A far day's week (dayFocus.ts) joins the cache, so its events open like any other.
  const knownEvents = useMemo(() => mergeEvents(allEvents, aroundEvents), [allEvents, aroundEvents])
  const eventsById = useMemo(() => new Map(knownEvents.map((e) => [e.id, e as EditableEvent])), [knownEvents])
  // Surprise-safe: a celebration's prep (the gift, the card) never reaches the wall, where the honoree can see it.
  const checklist = useMemo(() => surpriseSafeChecklist(allChecklist, allEvents, members), [allChecklist, allEvents, members])
  const buildPlanFor = useCallback(
    (date: Date, events: WallEvent[]) => buildDayPlan({ date, members, routines, events, dayOffs, tripState: tripStateFor?.(date), chores, ...(travelTrips.length ? { travel: travelTrips } : {}) }),
    [members, routines, dayOffs, tripStateFor, chores, travelTrips],
  )
  const pigments = useMemo(() => pigmentIndexes(members), [members])
  const selected = selectedId ? eventsById.get(selectedId) ?? null : null
  const person = personId ? members.find((m) => m.id === personId) ?? null : null
  // A project step's calendar event opens with its step (P3.23).
  const selectedStep = selected && todos ? stepForEvent(todos.list, selected.id) : null

  // While editing, the wall behind the sheet shows the day as it would be saved.
  // The same goes for the assistant's card while it waits for a yes.
  const draft: WallEvent | null = draftPreview ?? assistantDraft
  const withDraft = useCallback(
    (plan: DayPlan | null) => {
      if (!plan || !draft) return plan
      // A new item (not in the list yet) is added; an edited one replaces itself.
      const known = allEvents.some((e) => e.id === draft.id)
      return buildPlanFor(plan.date, known ? allEvents.map((e) => (e.id === draft.id ? draft : e)) : [...allEvents, draft])
    },
    [draft, allEvents, buildPlanFor],
  )
  const shownToday = useMemo(() => withDraft(today), [withDraft, today])
  const shownTomorrow = useMemo(() => withDraft(tomorrow), [withDraft, tomorrow])

  const chosen = selectPosture(today, now)
  const auto: Posture = chosen === 'calm' && (busy || Date.now() < awakeUntil) ? 'launch' : chosen
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  const shown = shownPosture(auto, preview, Date.now())
  const evening = shown.posture === 'evening'
  const focus = eveningFocus(now)
  // The day the wall shows by itself: tomorrow in the evening (today after midnight), else today.
  const autoDay = evening && focus.day === 'tomorrow' ? (tomorrow?.date ?? now) : now
  // The assistant's draft shows its own day (a change to Sunday previews Sunday).
  const draftDay = assistantDraft && !selectedId ? new Date(assistantDraft.start_time) : null
  const picked = draftDay && Number.isFinite(draftDay.getTime()) && !sameDay(draftDay, autoDay)
    ? draftDay
    : dayPreview && (busy || Date.now() < dayPreview.until) ? dayPreview.date : null
  const dayOnShow = picked ?? autoDay
  // Any day (Jake, 2026-09-30): a day outside the usual week brings the week around it onto the strip,
  // to swipe before and after; the frame loads it when it's past the cache.
  const focusDay = sameDay(dayOnShow, autoDay) ? null : dayOnShow
  const farDates = stripDates(week.map((p) => p.date), focusDay, now)
  const farKey = farDates?.map((d) => d.toDateString()).join('|') ?? ''
  const farPlans = useMemo(
    () => farDates?.map((d) => week.find((p) => sameDay(p.date, d)) ?? buildPlanFor(d, knownEvents)) ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- farKey stands for farDates
    [farKey, week, knownEvents, buildPlanFor],
  )
  const strip = farPlans ?? week
  const aroundKey = needsAroundFetch(focusDay, now) && focusDay ? focusDay.toDateString() : ''
  useEffect(() => { onFocusDay?.(aroundKey ? new Date(aroundKey) : null) }, [aroundKey, onFocusDay])
  const planFor = (date: Date) =>
    sameDay(date, now) ? shownToday : tomorrow && sameDay(date, tomorrow.date) ? shownTomorrow : withDraft(strip.find((p) => sameDay(p.date, date)) ?? week.find((p) => sameDay(p.date, date)) ?? null)

  // Drop the preview exactly when it lapses (the minute clock alone could keep it up to a minute longer).
  useEffect(() => {
    if (!preview) return
    const timer = window.setTimeout(() => setPreview(null), Math.max(0, preview.until - Date.now()))
    return () => window.clearTimeout(timer)
  }, [preview])
  useEffect(() => {
    const left = comingUpUntil - Date.now()
    if (left <= 0 || busy) return
    const timer = window.setTimeout(() => setComingUpUntil(0), left)
    return () => window.clearTimeout(timer)
  }, [comingUpUntil, busy])
  useEffect(() => {
    const left = todoUntil - Date.now()
    if (left <= 0 || busy) return
    const timer = window.setTimeout(() => setTodoUntil(0), left)
    return () => window.clearTimeout(timer)
  }, [todoUntil, busy])
  useEffect(() => {
    if (!dayPreview || busy) return
    const timer = window.setTimeout(() => setDayPreview(null), Math.max(0, dayPreview.until - Date.now()))
    return () => window.clearTimeout(timer)
  }, [dayPreview, busy])
  // Talking with Casa isn't idle (Jake, 2026-09-30: "the project screen went away and the calm home screen
  // came into view, the AI kept talking to me"): while busy, whatever is open stays and the wall stays awake;
  // the idle minutes start again when the conversation ends.
  // (The close timers below don't run while busy; when it ends, the idle minutes start again from then.)
  useEffect(() => {
    if (!busy) return
    return () => {
      const until = Date.now() + PREVIEW_MS
      setTodoUntil((u) => (u ? Math.max(u, until) : u))
      setComingUpUntil((u) => (u ? Math.max(u, until) : u))
      setDayPreview((d) => (d ? { ...d, until: Math.max(d.until, until) } : d))
      setAwakeUntil((u) => Math.max(u, Date.now() + WAKE_MS))
    }
  }, [busy])
  // Idle for the night: NIGHT_IDLE_MS after the last touch (each touch starts it again).
  useEffect(() => {
    const timer = window.setTimeout(() => setIdle(true), NIGHT_IDLE_MS)
    return () => window.clearTimeout(timer)
  }, [touches])
  // Fall back asleep exactly when the 5 idle minutes are up.
  const [, setTick] = useState(0)
  useEffect(() => {
    const left = awakeUntil - Date.now()
    if (left <= 0) return
    const timer = window.setTimeout(() => setTick((n) => n + 1), left)
    return () => window.clearTimeout(timer)
  }, [awakeUntil])

  useEffect(() => {
    if (openRequest?.project) { openTodo(); setTodoProject(openRequest.project) }
    else if (openRequest?.todo) openTodo()
    else if (openRequest?.id) setSelectedId(openRequest.id)
    else if (openRequest?.day) showDay(new Date(openRequest.day))
  }, [openRequest])

  // An event deleted elsewhere closes its sheet.
  useEffect(() => {
    if (selectedId && !eventsById.has(selectedId)) setSelectedId(null)
  }, [selectedId, eventsById])

  const weekDecisions: DatedDecision[] = useMemo(
    () =>
      week
        .flatMap((plan) =>
          decisionsFor(plan, members, now, new Set(Object.keys(tripStateFor?.(plan.date).dismissed ?? {}))).map((d) => ({ ...d, date: plan.date })),
        )
        .sort((a, b) => a.at.getTime() - b.at.getTime()),
    [week, members, now, tripStateFor],
  )
  // The one thing Casa raises (canvas row 21): within the next day, from this week's decisions.
  const [talkOpen, setTalkOpen] = useState(false)
  const topic = useMemo(
    () => (casaTalk ? casaTopic(weekDecisions, (date) => week.find((p) => p.date.toDateString() === date.toDateString()) ?? null, members, now, casaTalk.state) : null),
    [casaTalk, weekDecisions, week, members, now],
  )
  // The phones hear once (21c), sent by the wall alone, and only once the saved value has loaded.
  // (Sent ones are held here too: the saved value lags a render behind.)
  const pushedHere = useRef(new Set<string>())
  useEffect(() => {
    if (!topic || !casaTalk?.push || !casaTalk.ready || pushedHere.current.has(topic.key) || !pushNow(topic, casaTalk.state, now)) return
    pushedHere.current.add(topic.key)
    const message = pushMessage(topic)
    void casaTalk.save({ pushed: { [topic.key]: now.toISOString() } }).then(() => casaTalk.push!(message)).catch(() => {})
  }, [topic, casaTalk, now])
  // A trip's chip, flights or time away open the trip sheet, not the flight's own event (canvas 19d).
  const tripFor = (sourceId: string): TravelTrip | null =>
    (planFor(dayOnShow)?.travel ?? []).map((t) => t.trip).find((t) =>
      [t.id, t.tripEventId, t.outbound?.eventId, t.inbound?.eventId].includes(sourceId)) ?? null
  const interaction: ScoreInteraction = {
    onSelect: (id) => {
      const trip = saveTravel ? tripFor(id) : null
      if (trip) return setTripKey(trip.key)
      const chore = saveChore && id.startsWith('chore:') ? chores.find((c) => `chore:${c.id}` === id) : null
      if (chore) {
        setOpenChoreId(chore.id)
        return setPersonId(chore.member_id ?? chore.for_member_id)
      }
      setSelectedForWho(false)
      setSelectedId(id)
    },
    selectable: (id) => eventsById.has(id) || Boolean(saveTravel && tripFor(id)) || Boolean(saveChore && id.startsWith('chore:')),
    highlight: selectedId
      ? { sourceId: selectedId, draft: Boolean(draftPreview) }
      : talkOpen && topic
        ? { sourceId: topic.decision.sourceIds[0], draft: false }
      : assistantDraft
        ? { sourceId: assistantDraft.id, draft: true }
        : pointAt
          ? { sourceId: pointAt, draft: false }
        : null,
    onOpenDecision: tripActions ? () => setDecisionsOpen(true) : undefined,
    onAssign: (id) => {
      if (!eventsById.has(id)) return
      setSelectedForWho(true)
      setSelectedId(id)
    },
    routines: routines.length > 0 ? {
      hidden: routinesHidden,
      onToggle: () => setRoutinesHidden((was) => {
        writeRoutinesHidden(!was)
        return !was
      }),
    } : undefined,
    onOpenPerson: setPersonId,
  }
  const openPerson = (memberId: string) => {
    const id = today ? eventForPerson(today, memberId, now, (sourceId) => eventsById.has(sourceId)) : null
    if (id) setSelectedId(id)
    return Boolean(id)
  }

  // The strip's decisions: this week's, or a far week's while it's on show (the TO DECIDE count stays this week's).
  const stripDecisions: DatedDecision[] = useMemo(
    () =>
      farPlans
        ? farPlans.flatMap((plan) => decisionsFor(plan, members, now, new Set(Object.keys(tripStateFor?.(plan.date).dismissed ?? {}))).map((d) => ({ ...d, date: plan.date })))
        : weekDecisions,
    [farPlans, weekDecisions, members, now, tripStateFor],
  )
  const marksFor = (date: Date | undefined) =>
    Object.fromEntries(
      stripDecisions.filter((d) => date && sameDay(d.date, date)).flatMap((d) => d.sourceIds.map((id) => [id, d.key])),
    ) as Record<string, string>
  const answer = async (decision: DatedDecision, action: DecisionAction) => {
    if (!tripActions) return
    const plan = strip.find((p) => sameDay(p.date, decision.date)) ?? week.find((p) => sameDay(p.date, decision.date))
    if (action.type === 'dismiss') return tripActions.dismiss(decision.date, decision.key)
    if (!plan) return
    if (action.type === 'pick') {
      const trip = plan.trips.find((t) => t.id === action.tripIds[0])
      if (trip) setHandOff({ trip, plan, tripIds: action.tripIds, date: decision.date })
      setDecisionsOpen(false)
      return
    }
    for (const id of action.tripIds) {
      const trip = plan.trips.find((t) => t.id === id)
      if (trip) await tripActions.handOff(trip, action.driverId, decision.date)
    }
  }

  const answerTalk = async (a: TalkAnswer) => {
    if (!topic) return
    if (a.action.type === 'snooze') await casaTalk?.save({ snoozed: { [topic.key]: snoozeUntil(topic.at, now).toISOString() } })
    else await answer(topic.decision, a.action)
    setTalkOpen(false)
  }

  const move = shownToday ? selectNextMove(shownToday, now) : null
  const moveView = describeNextMove(move, members, now)
  const moveActions = tripActions && moveView && move
    ? {
        onLeaving: () => tripActions.leaving(moveView.tripIds),
        onUndoLeaving: () => tripActions.undoLeaving(moveView.tripIds),
        onHandOff: () => shownToday && setHandOff({ trip: move.trips[0], plan: shownToday, tripIds: [move.trips[0].id], date: shownToday.date }),
      }
    : undefined

  const openMenu = () => setMenuOpen(true)
  const openTalk = () => {
    if (!topic) return
    setTalkOpen(true)
    showDay(topic.decision.date)
  }
  const calling = topic && !overlay && !talkOpen ? { topic, onOpen: openTalk } : null
  const decisionsOn = (date: Date) => stripDecisions.filter((d) => sameDay(d.date, date))
  // The timer above closes it after 2 idle minutes, so render only asks whether it's open.
  const comingUpOpen = Boolean(comingUp) && comingUpUntil > 0
  const todoOpen = Boolean(todos) && todoUntil > 0 && !comingUpOpen
  // Settled for the night: the evening on its own (no preview, no day picked, nothing open, no conversation), nobody
  // has touched the wall for NIGHT_IDLE_MS, and nobody is on the road or leaving within the hour.
  const nightSettled = evening && !shown.preview && !picked && !busy && !overlay && !selected && !comingUpOpen && !todoOpen
    && !menuOpen && !adding && !personId && !tripKey && !decisionsOpen && !packingOpen
    && idle && !eveningKeepsUp(shownToday, now)
  const openComingUp = () => { setDayPreview(null); setTodoUntil(0); setComingUpUntil(Date.now() + PREVIEW_MS) }
  const openTodo = () => { setDayPreview(null); setComingUpUntil(0); setTodoProject(null); setTodoUntil(Date.now() + PREVIEW_MS) }
  const showDay = (date: Date) => {
    setComingUpUntil(0)
    setTodoUntil(0)
    setDayPreview(sameDay(date, autoDay) ? null : { date, until: Date.now() + PREVIEW_MS })
  }
  // Swipe between days (Jake, 2026-09-28): left for the next day, right for the day before, across
  // the week strip's seven days and on to Coming up; stops at the ends. Off while anything is open
  // on top (the band, an event, a sheet, the menu), so a conversation never changes the day.
  const rootRef = useRef<HTMLDivElement>(null)
  const swipeDay = (step: DayStep) => {
    // After the days: Coming up, then To do.
    const extras = [comingUp ? 'coming' : null, todos ? 'todo' : null].filter(Boolean) as Array<'coming' | 'todo'>
    const index = comingUpOpen ? strip.length + extras.indexOf('coming')
      : todoOpen ? strip.length + extras.indexOf('todo')
      : Math.max(0, strip.findIndex((p) => sameDay(p.date, dayOnShow)))
    const next = stepWithin(index, step, strip.length + extras.length - 1)
    if (next == null) return
    if (next < strip.length) showDay(strip[next].date)
    else if (extras[next - strip.length] === 'coming') openComingUp()
    else openTodo()
  }
  useDaySwipe(rootRef, swipeDay, { enabled: strip.length > 1 && !overlay && !selected && !adding && !handOff && !decisionsOpen && !packingOpen && !menuOpen && !person && !tripKey, minDistance: 200 })
  // NEXT UP and STILL TONIGHT (canvas 27a/27c): today's chores and timed to-dos, ticked here.
  const dayJobs = useMemo(() => nextUpItems(shownToday, todos?.list ?? null, choreDone, now), [shownToday, todos?.list, choreDone, now])
  const jobs = dayJobs.filter((item) => !gone.has(item.key))
  const tick = (item: NextUpItem) => {
    const pending = tickTimers.current.get(item.key)
    if (pending) {
      window.clearTimeout(pending)
      tickTimers.current.delete(item.key)
      setTicked(takeFrom(item.key))
      return
    }
    setTicked(addTo(item.key))
    tickTimers.current.set(item.key, window.setTimeout(() => {
      tickTimers.current.delete(item.key)
      setTicked(takeFrom(item.key))
      setGone(addTo(item.key))
      const saved = item.kind === 'chore' ? tickChore?.(item.id, item.at, true) : todos?.act({ action: 'done', id: item.id })
      // Didn't save: it comes back.
      Promise.resolve(saved).catch(() => setGone(takeFrom(item.key)))
    }, TICK_MS))
  }
  const rowProps = { members, pigmentOf: (id: string) => pigments.get(id) ?? null, ticked, onTick: tick, onOpen: (id: string) => eventsById.has(id) && setSelectedId(id) }
  const soonJobs = comingHours(jobs, now)
  const nextUp = soonJobs.length > 0 ? (columns: 1 | 2) => {
    const { shown, more } = fitNextUp(soonJobs, columns)
    return <NextUpSection items={shown} more={more} columns={columns} onSeeAll={todos ? openTodo : undefined} {...rowProps} />
  } : null
  // Before midnight the evening looks at tomorrow; what's left of today, and who's still out, sit in its header.
  const tonightJobs = evening && tonightByClock(now) ? stillTonight(jobs, outTonight(shownToday, members, now)) : []
  const tonightShown = tonightJobs.slice(0, TONIGHT_ROOM)
  const leftTonight = tonightJobs.filter((item) => item.kind !== 'out').length
  const stillTonightCard = tonightJobs.length > 0
    ? <StillTonight items={tonightShown} more={tonightJobs.length - tonightShown.length} {...rowProps} />
    : null

  const tomorrowDate = tomorrow?.date ?? null
  const weekStrip = strip.length > 1 ? (
    <WallWeek
      days={weekDays(strip, members, stripDecisions, now, checklist, { hideRoutines: routinesHidden }).map((day) => (day.isToday && leftTonight > 0 ? { ...day, leftTonight } : day))}
      members={members}
      pigmentOf={(id) => pigments.get(id) ?? null}
      shownKey={comingUpOpen || todoOpen ? '' : dayOnShow.toDateString()}
      onSelect={showDay}
      comingUp={comingUp ? { ...comingUpTile(comingUpItems, comingUp.today), open: comingUpOpen, onOpen: openComingUp } : null}
      todo={todos ? { ...todoTile(todos.list), open: todoOpen, onOpen: openTodo } : null}
    />
  ) : null
  const tomorrowText = tomorrowDate ? tomorrowLine(shownTomorrow, checklist, decisionsOn(tomorrowDate).length, now) : null
  const tomorrowNote = tomorrowText && tomorrowDate ? { text: tomorrowText, onOpen: () => showDay(tomorrowDate) } : null

  // The surface of To do (board 09a): tonight's nudge on the evening face, one small job in a quiet stretch.
  const nudgeItem = todos ? tonightNudge(todos.list, now) : null
  const nudge = nudgeItem && !(nudgeLater?.id === nudgeItem.id && Date.now() < nudgeLater.until) ? nudgeItem : null
  const tonight = stillTonightCard ? null : (nudge && todos ? (
    <WallNudge
      item={nudge}
      onDone={() => void todos.act({ action: 'done', id: nudge.id })}
      onLater={() => setNudgeLater({ id: nudge.id, until: Date.now() + 45 * 60_000 })}
    />
  ) : null)
  const smallJob = todos ? quietStep(todos.list, now, move?.leaveAt ?? null) : null
  const meanwhile = smallJob && todos ? <WallQuietStep item={smallJob} onDone={() => void todos.act({ action: 'done', id: smallJob.id })} /> : null

  let face
  // The night faces are dark; the corner mark takes their colours (its ink T would vanish on the dark ground).
  let darkFace = false
  if (todoOpen && todos) {
    face = (
      <WallTodos
        now={now}
        list={todos.list}
        onAct={async (request) => {
          setTodoUntil(Date.now() + PREVIEW_MS)
          await todos.act(request)
        }}
        canOpen={(id) => eventsById.has(id)}
        onOpen={(id) => setSelectedId(id)}
        onBack={() => { setTodoUntil(0); setTodoProject(null) }}
        onActivity={() => setTodoUntil(Date.now() + PREVIEW_MS)}
        week={weekStrip}
        initialProject={todoProject}
        onTalkAbout={onAsk ? (say) => onAsk(say) : undefined}
        upcoming={comingUp?.items ?? []}
        onStart={comingUp?.start}
        {...(todos.useProject ? { useProject: todos.useProject } : {})}
      />
    )
  } else if (comingUpOpen && comingUp) {
    face = (
      <WallComingUp
        now={now}
        items={comingUpItems}
        ideas={comingUp.ideas}
        onEditIdea={comingUp.editIdea}
        today={comingUp.today}
        onAct={async (key, action) => {
          setComingUpUntil(Date.now() + PREVIEW_MS)
          await comingUp.act(key, action)
        }}
        onBack={() => setComingUpUntil(0)}
        week={weekStrip}
        onOpenProject={todos ? (id) => { openTodo(); setTodoProject(id) } : undefined}
        onOpenTrip={saveTravel ? (key) => setTripKey(key) : undefined}
        onStart={todos && comingUp.start ? (key) => void comingUp.start!(key).then((id) => { if (id) { openTodo(); setTodoProject(id) } }) : undefined}
      />
    )
  } else if (nightSettled) {
    // The night Calm (canvas 36a/36b): nobody at the wall for a while in the evening.
    darkFace = true
    face = <WallNightCalm now={now} members={members} plan={planFor(dayOnShow)} stillTonight={tonightByClock(now) ? stillTonightCard : null} />
  } else if (!sameDay(dayOnShow, now) || (evening && !picked)) {
    // The day-ahead face: tomorrow in the evening, or a day tapped in the week strip.
    const plan = planFor(dayOnShow)
    darkFace = evening
    const isAuto = sameDay(dayOnShow, autoDay) && !picked
    const heading = evening && isAuto
      ? (focus.day === 'tomorrow' ? 'TOMORROW' : 'TODAY')
      : tomorrowDate && sameDay(dayOnShow, tomorrowDate)
        ? 'TOMORROW'
        : dayHeading(dayOnShow, now)
    face = (
      <WallEvening
        now={now}
        members={members}
        plan={plan}
        label={evening ? focus.label : formatWallDate(now)}
        heading={heading}
        dark={evening}
        checklist={checklist}
        interaction={{ ...interaction, marks: marksFor(plan?.date) }}
        decisions={plan ? decisionsOn(plan.date) : []}
        onAnswer={tripActions ? answer : undefined}
        onToggleItem={toggleChecklist}
        onOpenEvent={(id) => eventsById.has(id) && setSelectedId(id)}
        onSeeAllPacking={() => setPackingOpen(true)}
        week={weekStrip}
        onBack={picked ? () => setDayPreview(null) : undefined}
        tonight={evening && !picked ? tonight : null}
        stillTonight={evening && !picked ? stillTonightCard : null}
      />
    )
  } else if (shown.posture === 'calm') {
    face = <WallCalm now={now} members={members} plan={shownToday} currentWeather={currentWeather} onSelectPerson={openPerson} decisionCount={weekDecisions.length} onOpenDecisions={tripActions ? () => setDecisionsOpen(true) : undefined} tomorrow={tomorrowNote} meanwhile={meanwhile} />
  } else {
    // The full day (also Today tapped in the evening).
    face = (
      <WallLaunch
        now={now}
        members={members}
        plan={shownToday}
        currentWeather={currentWeather}
        onOpenMenu={openMenu}
        onAsk={onAsk}
        calling={calling}
        onAdd={createEvent ? () => setAdding(blankEvent(dayOnShow, now, 'event')) : undefined}
        interaction={{ ...interaction, marks: marksFor(shownToday?.date) }}
        moveActions={moveActions}
        decisionCount={weekDecisions.length}
        onOpenDecisions={tripActions ? () => setDecisionsOpen(true) : undefined}
        emailCount={emailCount}
        onOpenEmail={onOpenEmail}
        onOpenItem={(id) => eventsById.has(id) && setSelectedId(id)}
        tomorrow={tomorrowNote}
        week={weekStrip}
        prep={shownToday && toggleChecklist ? {
          packing: packingGroups(shownToday, checklist, { from: now }),
          decisions: decisionsOn(shownToday.date),
          onAnswer: tripActions ? answer : undefined,
          onToggleItem: toggleChecklist,
          onOpenEvent: (id) => eventsById.has(id) && setSelectedId(id),
          onSeeAll: () => setPackingOpen(true),
          nextUp,
        } : null}
      />
    )
  }
  // The dark evening face is on show (the day-ahead layout in the evening).
  const nightFace = !comingUpOpen && !todoOpen && evening && (!sameDay(dayOnShow, now) || !picked)
  const onLaunchFace = !comingUpOpen && !todoOpen && sameDay(dayOnShow, now) && !(evening && !picked) && shown.posture !== 'calm'

  return (
    <div
      ref={rootRef}
      className="relative h-full w-full"
      // A tap that nothing else handled (a person, a count, a block stop it) wakes Calm; once awake, any touch keeps it awake.
      onClick={() => setAwakeUntil(Date.now() + WAKE_MS)}
      onPointerDownCapture={() => {
        setIdle(false)
        setTouches((n) => n + 1)
        if (Date.now() < awakeUntil) setAwakeUntil(Date.now() + WAKE_MS)
      }}
    >
      {face}
      {/* After midnight the settled night shows no buttons until a touch (canvas 36b). */}
      {!onLaunchFace && !(nightSettled && now.getHours() < 6) && <MenuButton onOpen={openMenu} className={`absolute right-[44px] top-[44px] ${darkFace ? 'wall-evening' : ''}`} />}
      {!onLaunchFace && !(nightSettled && now.getHours() < 6) && onAsk && <MicButton onAsk={calling ? openTalk : onAsk} calling={Boolean(calling)} className="absolute right-[108px] top-[38px]" />}
      {!onLaunchFace && calling && <CasaCalling topic={calling.topic} onOpen={openTalk} className="absolute right-[256px] top-[44px]" />}
      {!onLaunchFace && !(nightSettled && now.getHours() < 6) && createEvent && <AddButton onAdd={() => setAdding(blankEvent(dayOnShow, now, 'event'))} className="absolute right-[184px] top-[44px]" />}
      {!selected && overlay && (
        // Over the night face the band is raised and the calendar steps back a little, so the
        // conversation reads as a layer of its own (Jake, 2026-09-27).
        <div className={`contents ${nightFace ? 'wall-band-over-night' : ''}`}>
          {nightFace && <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-wall-night-ground/40" />}
          {overlay}
        </div>
      )}
      {talkOpen && topic && !overlay && !selected && !handOff && (
        <WallCasaTalk
          topic={topic}
          onAnswer={answerTalk}
          onTalk={() => { setTalkOpen(false); onAsk?.() }}
          onClose={() => setTalkOpen(false)}
        />
      )}
      {shown.preview && !selected && (
        <div className="pointer-events-none absolute left-1/2 top-[8px] -translate-x-1/2 whitespace-nowrap rounded-full bg-wall-ink px-[18px] py-[4px] text-wall-label font-semibold text-wall-on-pigment">
          Previewing {POSTURE_NAMES[shown.posture]} · back to {POSTURE_NAMES[auto]} on its own
        </div>
      )}
      {selected && (
        <WallEventSheet
          key={selected.id}
          event={selected}
          members={members}
          now={now}
          allEvents={allEvents}
          buildPlanFor={buildPlanFor}
          pigmentOf={(id) => pigments.get(id) ?? null}
          checklist={checklist}
          onClose={() => {
            setSelectedId(null)
            setSelectedForWho(false)
            setDraftPreview(null)
          }}
          onPreview={setDraftPreview}
          onDelete={deleteEvent}
          onAddItem={addChecklist}
          useItems={useEventItems}
          startOn={selectedForWho ? 'who' : undefined}
          projectStep={selectedStep}
          onStepDone={selectedStep && todos ? async () => { await todos.act({ action: 'project_edit', id: selectedStep.projectId, op: 'done_step', args: { step_id: selectedStep.stepId } }) } : undefined}
          onOpenProject={selectedStep && todos ? () => { setSelectedId(null); openTodo(); setTodoProject(selectedStep.projectId) } : undefined}
        />
      )}
      {adding && !selected && (
        <WallEventSheet
          key="new"
          event={adding}
          members={members}
          now={now}
          allEvents={allEvents}
          buildPlanFor={buildPlanFor}
          pigmentOf={(id) => pigments.get(id) ?? null}
          checklist={checklist}
          onClose={() => {
            setAdding(null)
            setDraftPreview(null)
          }}
          onPreview={setDraftPreview}
          onCreate={createEvent}
        />
      )}
      {handOff && tripActions && (
        <WallHandOffSheet
          trip={handOff.trip}
          plan={handOff.plan}
          members={members}
          pigmentOf={(id) => pigments.get(id) ?? null}
          onPick={async (driverId) => {
            for (const id of handOff.tripIds) {
              const trip = handOff.plan.trips.find((t) => t.id === id)
              if (trip) await tripActions.handOff(trip, driverId, handOff.date)
            }
          }}
          onClose={() => setHandOff(null)}
        />
      )}
      {decisionsOpen && tripActions && (
        <WallDecisionsSheet decisions={weekDecisions} now={now} onAnswer={answer} onClose={() => setDecisionsOpen(false)} />
      )}
      {tripKey && saveTravel && (() => {
        const trip = travelTrips.find((t) => t.key === tripKey) ?? (planFor(dayOnShow)?.travel ?? []).map((t) => t.trip).find((t) => t.key === tripKey)
        if (!trip) return null
        return (
          <WallTripSheet
            trip={trip}
            members={members}
            pigmentOf={(id) => pigments.get(id) ?? 0}
            onChange={(change) => void saveTravel(trip.key, change)}
            onClose={() => setTripKey(null)}
            coverage={tripCoverageByKey.get(trip.key) ?? []}
            onCover={tripActions ? (run, driverId) => void tripActions.handOff({ id: run.tripId, source: run.source, sourceId: run.sourceId } as Trip, driverId, run.date) : undefined}
          />
        )
      })()}
      {packingOpen && toggleChecklist && (() => {
        const plan = planFor(dayOnShow)
        const packing = plan ? packingGroups(plan, checklist) : { groups: [], packed: 0, total: 0 }
        return <WallPackingSheet groups={packing.groups} packed={packing.packed} total={packing.total} onToggle={toggleChecklist} onClose={() => setPackingOpen(false)} />
      })()}
      {person && !selected && (
        <WallPersonSheet
          key={person.id}
          member={person}
          members={members}
          pigmentIndex={pigments.get(person.id) ?? 0}
          routines={routines.filter((r) => r.memberId === person.id)}
          dayOffs={dayOffs.filter((d) => d.member_id === person.id && d.override_type === 'day_off' && d.id).map((d) => ({ id: d.id!, start: localYmd(d.start_at), end: localYmd(d.end_at) }))}
          now={now}
          onClose={() => { setPersonId(null); setOpenChoreId(null) }}
          chores={saveChore ? chores : undefined}
          saveChore={saveChore}
          deleteChore={deleteChore}
          pigmentOf={(id) => pigments.get(id) ?? 0}
          openChoreId={openChoreId}
        />
      )}
      {menuOpen && (
        <WallMenu
          side={onLaunchFace ? 'left' : 'right'}
          onClose={() => setMenuOpen(false)}
          onPreview={(posture) => {
            setDayPreview(null)
            setPreview(posture === auto ? null : { posture, until: Date.now() + PREVIEW_MS })
            setMenuOpen(false)
          }}
        />
      )}
    </div>
  )
}
