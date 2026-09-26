import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { FamilyRoutine } from '../lib/familyRoutines'
import type { EditableEvent } from './editing'
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
import { eveningFocus, selectPosture, tomorrowLine, type Posture } from './posture'
import { formatWallDate } from './clock'
import { PREVIEW_MS, shownPosture, type PreviewState } from './preview'
import { pigmentIndexes } from './score'
import { eventForPerson } from './selection'
import WallCalm from './WallCalm'
import WallEvening from './WallEvening'
import WallEventSheet from './WallEventSheet'
import WallLaunch from './WallLaunch'
import WallMenu, { MenuButton, MicButton } from './WallMenu'
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
  const { now, members, today, tomorrow, currentWeather, checklist = [], allEvents = [], routines = [], dayOffs = [], onAsk, overlay, pointAt = null, openRequest = null, tripStateFor, tripActions, week = [], deleteEvent, toggleChecklist } = props
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
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draftPreview, setDraftPreview] = useState<EditableEvent | null>(null)

  const eventsById = useMemo(() => new Map(allEvents.map((e) => [e.id, e as EditableEvent])), [allEvents])
  const buildPlanFor = useCallback(
    (date: Date, events: WallEvent[]) => buildDayPlan({ date, members, routines, events, dayOffs, tripState: tripStateFor?.(date) }),
    [members, routines, dayOffs, tripStateFor],
  )
  const pigments = useMemo(() => pigmentIndexes(members), [members])
  const selected = selectedId ? eventsById.get(selectedId) ?? null : null

  // While editing, the wall behind the sheet shows the day as it would be saved.
  const withDraft = useCallback(
    (plan: DayPlan | null) => (plan && draftPreview ? buildPlanFor(plan.date, allEvents.map((e) => (e.id === draftPreview.id ? draftPreview : e))) : plan),
    [draftPreview, allEvents, buildPlanFor],
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
  const picked = dayPreview && Date.now() < dayPreview.until ? dayPreview.date : null
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
    onSelect: setSelectedId,
    selectable: (id) => eventsById.has(id),
    highlight: selectedId
      ? { sourceId: selectedId, draft: Boolean(draftPreview) }
      : pointAt
        ? { sourceId: pointAt, draft: false }
        : null,
    onOpenDecision: tripActions ? () => setDecisionsOpen(true) : undefined,
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
  const showDay = (date: Date) => setDayPreview(sameDay(date, autoDay) ? null : { date, until: Date.now() + PREVIEW_MS })
  const tomorrowDate = tomorrow?.date ?? null
  const weekStrip = week.length > 1 ? (
    <WallWeek
      days={weekDays(week, members, weekDecisions, now, checklist)}
      members={members}
      pigmentOf={(id) => pigments.get(id) ?? null}
      shownKey={dayOnShow.toDateString()}
      onSelect={showDay}
    />
  ) : null
  const tomorrowText = tomorrowDate ? tomorrowLine(shownTomorrow, checklist, decisionsOn(tomorrowDate).length, now) : null
  const tomorrowNote = tomorrowText && tomorrowDate ? { text: tomorrowText, onOpen: () => showDay(tomorrowDate) } : null

  let face
  if (!sameDay(dayOnShow, now) || (evening && !picked)) {
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
        interaction={{ ...interaction, marks: marksFor(shownToday?.date) }}
        moveActions={moveActions}
        decisionCount={weekDecisions.length}
        onOpenDecisions={tripActions ? () => setDecisionsOpen(true) : undefined}
        tomorrow={tomorrowNote}
        week={weekStrip}
      />
    )
  }
  const onLaunchFace = sameDay(dayOnShow, now) && !(evening && !picked) && shown.posture !== 'calm'

  return (
    <div
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
      {!selected && overlay}
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
            setDraftPreview(null)
          }}
          onPreview={setDraftPreview}
          onDelete={deleteEvent}
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
