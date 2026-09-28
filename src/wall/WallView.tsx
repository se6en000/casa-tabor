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
import { surpriseSafeChecklist } from './surprise'
import { eveningFocus, selectPosture, tomorrowLine, type Posture } from './posture'
import { formatWallDate } from './clock'
import { PREVIEW_MS, shownPosture, type PreviewState } from './preview'
import { pigmentIndexes } from './score'
import { eventForPerson } from './selection'
import WallCalm from './WallCalm'
import WallComingUp from './WallComingUp'
import { comingUpTile, type ComingUpAction, type ComingUpItem, type GiftIdea } from './comingUp'
import WallEvening from './WallEvening'
import WallEventSheet from './WallEventSheet'
import WallLaunch from './WallLaunch'
import WallMenu, { AddButton, MenuButton, MicButton } from './WallMenu'
import WallWeek from './WallWeek'
import { weekDays } from './week'
import type { ScoreInteraction } from './WallScore'

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
  onAsk?: () => void
  /** The band, drawn over the wall. */
  overlay?: ReactNode
  /** The item the assistant's answer is about: outlined like a selection. */
  pointAt?: string | null
  /** The assistant's draft or change waiting for a yes: previewed on the Score, on its day. */
  assistantDraft?: WallEvent | null
  /** Open this item's sheet ("Open it" in the band); the nonce repeats a request. */
  openRequest?: { id: string; nonce: number } | null
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
  /** Deletes an event or reminder (the event sheet's Delete, after a yes). */
  deleteEvent?: (event: EditableEvent) => Promise<void>
  /** Ticks or unticks a packing item. */
  toggleChecklist?: (item: WallChecklistItem) => void
  /** Adds an event or reminder (the + sheet), through the calendar's own create call. */
  createEvent?: (args: Record<string, unknown>) => Promise<void>
  /** Coming up (P3.19, board 07a): what needs planning, gift ideas, and the answers to an item. */
  comingUp?: { items: ComingUpItem[]; ideas: GiftIdea[]; today: string; act: (key: string, action: ComingUpAction) => Promise<void> } | null
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
  const { now, members, today, tomorrow, currentWeather, checklist: allChecklist = [], allEvents = [], routines = [], dayOffs = [], onAsk, overlay, pointAt = null, assistantDraft = null, openRequest = null, tripStateFor, tripActions, week = [], deleteEvent, toggleChecklist, createEvent, comingUp = null } = props
  // The driver picker: from "Hand off" on the Next Move, or a decision answered "choose a driver".
  const [handOff, setHandOff] = useState<{ trip: Trip; plan: DayPlan; tripIds: string[]; date: Date } | null>(null)
  const [decisionsOpen, setDecisionsOpen] = useState(false)
  const [packingOpen, setPackingOpen] = useState(false)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  // A day tapped in the week strip: shown until "Back", or 2 idle minutes.
  const [dayPreview, setDayPreview] = useState<{ date: Date; until: number } | null>(null)
  // A touch on Calm wakes the full day until this time (5 idle minutes).
  const [awakeUntil, setAwakeUntil] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  // The + sheet: a blank item on the day on show.
  const [adding, setAdding] = useState<EditableEvent | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Opened from the "No one yet" row: straight to who's on it (board 08a).
  const [selectedForWho, setSelectedForWho] = useState(false)
  const [draftPreview, setDraftPreview] = useState<EditableEvent | null>(null)
  // Coming up, opened from the week strip's eighth tile: shown until "Back", or 2 idle minutes.
  const [comingUpUntil, setComingUpUntil] = useState(0)

  const eventsById = useMemo(() => new Map(allEvents.map((e) => [e.id, e as EditableEvent])), [allEvents])
  // Surprise-safe: a celebration's prep (the gift, the card) never reaches the wall, where the honoree can see it.
  const checklist = useMemo(() => surpriseSafeChecklist(allChecklist, allEvents, members), [allChecklist, allEvents, members])
  const buildPlanFor = useCallback(
    (date: Date, events: WallEvent[]) => buildDayPlan({ date, members, routines, events, dayOffs, tripState: tripStateFor?.(date) }),
    [members, routines, dayOffs, tripStateFor],
  )
  const pigments = useMemo(() => pigmentIndexes(members), [members])
  const selected = selectedId ? eventsById.get(selectedId) ?? null : null

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
  const auto: Posture = chosen === 'calm' && Date.now() < awakeUntil ? 'launch' : chosen
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
    : dayPreview && Date.now() < dayPreview.until ? dayPreview.date : null
  const dayOnShow = picked ?? autoDay
  const planFor = (date: Date) =>
    sameDay(date, now) ? shownToday : tomorrow && sameDay(date, tomorrow.date) ? shownTomorrow : withDraft(week.find((p) => sameDay(p.date, date)) ?? null)

  // Drop the preview exactly when it lapses (the minute clock alone could keep it up to a minute longer).
  useEffect(() => {
    if (!preview) return
    const timer = window.setTimeout(() => setPreview(null), Math.max(0, preview.until - Date.now()))
    return () => window.clearTimeout(timer)
  }, [preview])
  useEffect(() => {
    const left = comingUpUntil - Date.now()
    if (left <= 0) return
    const timer = window.setTimeout(() => setComingUpUntil(0), left)
    return () => window.clearTimeout(timer)
  }, [comingUpUntil])
  useEffect(() => {
    if (!dayPreview) return
    const timer = window.setTimeout(() => setDayPreview(null), Math.max(0, dayPreview.until - Date.now()))
    return () => window.clearTimeout(timer)
  }, [dayPreview])
  // Fall back asleep exactly when the 5 idle minutes are up.
  const [, setTick] = useState(0)
  useEffect(() => {
    const left = awakeUntil - Date.now()
    if (left <= 0) return
    const timer = window.setTimeout(() => setTick((n) => n + 1), left)
    return () => window.clearTimeout(timer)
  }, [awakeUntil])

  useEffect(() => {
    if (openRequest) setSelectedId(openRequest.id)
  }, [openRequest])

  // An event deleted elsewhere closes its sheet.
  useEffect(() => {
    if (selectedId && !eventsById.has(selectedId)) setSelectedId(null)
  }, [selectedId, eventsById])

  const interaction: ScoreInteraction = {
    onSelect: (id) => {
      setSelectedForWho(false)
      setSelectedId(id)
    },
    selectable: (id) => eventsById.has(id),
    highlight: selectedId
      ? { sourceId: selectedId, draft: Boolean(draftPreview) }
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
  }
  const openPerson = (memberId: string) => {
    const id = today ? eventForPerson(today, memberId, now, (sourceId) => eventsById.has(sourceId)) : null
    if (id) setSelectedId(id)
    return Boolean(id)
  }

  const weekDecisions: DatedDecision[] = useMemo(
    () =>
      week
        .flatMap((plan) =>
          decisionsFor(plan, members, now, new Set(Object.keys(tripStateFor?.(plan.date).dismissed ?? {}))).map((d) => ({ ...d, date: plan.date })),
        )
        .sort((a, b) => a.at.getTime() - b.at.getTime()),
    [week, members, now, tripStateFor],
  )
  const marksFor = (date: Date | undefined) =>
    Object.fromEntries(
      weekDecisions.filter((d) => date && sameDay(d.date, date)).flatMap((d) => d.sourceIds.map((id) => [id, d.key])),
    ) as Record<string, string>
  const answer = async (decision: DatedDecision, action: DecisionAction) => {
    if (!tripActions) return
    const plan = week.find((p) => sameDay(p.date, decision.date))
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
  const decisionsOn = (date: Date) => weekDecisions.filter((d) => sameDay(d.date, date))
  // The timer above closes it after 2 idle minutes, so render only asks whether it's open.
  const comingUpOpen = Boolean(comingUp) && comingUpUntil > 0
  const showDay = (date: Date) => {
    setComingUpUntil(0)
    setDayPreview(sameDay(date, autoDay) ? null : { date, until: Date.now() + PREVIEW_MS })
  }
  // Swipe between days (Jake, 2026-09-28): left for the next day, right for the day before, across
  // the week strip's seven days and on to Coming up; stops at the ends. Off while anything is open
  // on top (the band, an event, a sheet, the menu), so a conversation never changes the day.
  const rootRef = useRef<HTMLDivElement>(null)
  const swipeDay = (step: DayStep) => {
    const pages = week.length + (comingUp ? 1 : 0)
    const index = comingUpOpen ? week.length : Math.max(0, week.findIndex((p) => sameDay(p.date, dayOnShow)))
    const next = stepWithin(index, step, pages - 1)
    if (next == null) return
    if (next === week.length) {
      setDayPreview(null)
      setComingUpUntil(Date.now() + PREVIEW_MS)
    } else {
      showDay(week[next].date)
    }
  }
  useDaySwipe(rootRef, swipeDay, { enabled: week.length > 1 && !overlay && !selected && !adding && !handOff && !decisionsOpen && !packingOpen && !menuOpen, minDistance: 200 })
  const tomorrowDate = tomorrow?.date ?? null
  const weekStrip = week.length > 1 ? (
    <WallWeek
      days={weekDays(week, members, weekDecisions, now, checklist)}
      members={members}
      pigmentOf={(id) => pigments.get(id) ?? null}
      shownKey={comingUpOpen ? '' : dayOnShow.toDateString()}
      onSelect={showDay}
      comingUp={comingUp ? { ...comingUpTile(comingUp.items, comingUp.today), open: comingUpOpen, onOpen: () => { setDayPreview(null); setComingUpUntil(Date.now() + PREVIEW_MS) } } : null}
    />
  ) : null
  const tomorrowText = tomorrowDate ? tomorrowLine(shownTomorrow, checklist, decisionsOn(tomorrowDate).length, now) : null
  const tomorrowNote = tomorrowText && tomorrowDate ? { text: tomorrowText, onOpen: () => showDay(tomorrowDate) } : null

  let face
  if (comingUpOpen && comingUp) {
    face = (
      <WallComingUp
        now={now}
        items={comingUp.items}
        ideas={comingUp.ideas}
        today={comingUp.today}
        onAct={async (key, action) => {
          setComingUpUntil(Date.now() + PREVIEW_MS)
          await comingUp.act(key, action)
        }}
        onBack={() => setComingUpUntil(0)}
        week={weekStrip}
      />
    )
  } else if (!sameDay(dayOnShow, now) || (evening && !picked)) {
    // The day-ahead face: tomorrow in the evening, or a day tapped in the week strip.
    const plan = planFor(dayOnShow)
    const isAuto = sameDay(dayOnShow, autoDay) && !picked
    const heading = evening && isAuto
      ? (focus.day === 'tomorrow' ? 'TOMORROW' : 'TODAY')
      : tomorrowDate && sameDay(dayOnShow, tomorrowDate)
        ? 'TOMORROW'
        : `LOOKING AHEAD · ${dayOnShow.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase()}`
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
      />
    )
  } else if (shown.posture === 'calm') {
    face = <WallCalm now={now} members={members} plan={shownToday} currentWeather={currentWeather} onSelectPerson={openPerson} decisionCount={weekDecisions.length} onOpenDecisions={tripActions ? () => setDecisionsOpen(true) : undefined} tomorrow={tomorrowNote} />
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
        onAdd={createEvent ? () => setAdding(blankEvent(dayOnShow, now, 'event')) : undefined}
        interaction={{ ...interaction, marks: marksFor(shownToday?.date) }}
        moveActions={moveActions}
        decisionCount={weekDecisions.length}
        onOpenDecisions={tripActions ? () => setDecisionsOpen(true) : undefined}
        tomorrow={tomorrowNote}
        week={weekStrip}
      />
    )
  }
  // The dark evening face is on show (the day-ahead layout in the evening).
  const nightFace = !comingUpOpen && evening && (!sameDay(dayOnShow, now) || !picked)
  const onLaunchFace = !comingUpOpen && sameDay(dayOnShow, now) && !(evening && !picked) && shown.posture !== 'calm'

  return (
    <div
      ref={rootRef}
      className="relative h-full w-full"
      // A tap that nothing else handled (a person, a count, a block stop it) wakes Calm; once awake, any touch keeps it awake.
      onClick={() => setAwakeUntil(Date.now() + WAKE_MS)}
      onPointerDownCapture={() => {
        if (Date.now() < awakeUntil) setAwakeUntil(Date.now() + WAKE_MS)
      }}
    >
      {face}
      {!onLaunchFace && <MenuButton onOpen={openMenu} className="absolute right-[44px] top-[44px]" />}
      {!onLaunchFace && onAsk && <MicButton onAsk={onAsk} className="absolute right-[108px] top-[38px]" />}
      {!onLaunchFace && createEvent && <AddButton onAdd={() => setAdding(blankEvent(dayOnShow, now, 'event'))} className="absolute right-[184px] top-[44px]" />}
      {!selected && overlay && (
        // Over the night face the band is raised and the calendar steps back a little, so the
        // conversation reads as a layer of its own (Jake, 2026-09-27).
        <div className={`contents ${nightFace ? 'wall-band-over-night' : ''}`}>
          {nightFace && <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-wall-night-ground/40" />}
          {overlay}
        </div>
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
          startOn={selectedForWho ? 'who' : undefined}
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
      {packingOpen && toggleChecklist && (() => {
        const plan = planFor(dayOnShow)
        const packing = plan ? packingGroups(plan, checklist) : { groups: [], packed: 0, total: 0 }
        return <WallPackingSheet groups={packing.groups} packed={packing.packed} total={packing.total} onToggle={toggleChecklist} onClose={() => setPackingOpen(false)} />
      })()}
      {menuOpen && (
        <WallMenu
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
