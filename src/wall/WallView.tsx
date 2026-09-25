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
import type { WallChecklistItem } from './packing'
import { eveningFocus, selectPosture, type Posture } from './posture'
import { nextPreview, shownPosture, type PreviewState } from './preview'
import { pigmentIndexes } from './score'
import { eventForPerson } from './selection'
import WallCalm from './WallCalm'
import WallEvening from './WallEvening'
import WallEventSheet from './WallEventSheet'
import WallLaunch from './WallLaunch'
import WallMenu, { MenuButton, MicButton } from './WallMenu'
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
}

const POSTURE_NAMES: Record<Posture, string> = { launch: 'Full day', calm: 'Calm', evening: 'Evening' }

/**
 * The whole Wall, drawn from data only (no fetching), so it can be rendered from fixtures.
 * A tap on empty wall previews the next face (back to the automatic one after 2 idle
 * minutes); a tap on a calendar item opens its sheet (details, then edit).
 */
export default function WallView(props: WallViewProps) {
  const { now, members, today, tomorrow, currentWeather, checklist = [], allEvents = [], routines = [], dayOffs = [], onAsk, overlay, pointAt = null, openRequest = null, tripStateFor, tripActions, week = [] } = props
  // The driver picker: from "Hand off" on the Next Move, or a decision answered "choose a driver".
  const [handOff, setHandOff] = useState<{ trip: Trip; plan: DayPlan; tripIds: string[]; date: Date } | null>(null)
  const [decisionsOpen, setDecisionsOpen] = useState(false)
  const [preview, setPreview] = useState<PreviewState | null>(null)
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

  const auto = selectPosture(today, now)
  const shown = shownPosture(auto, preview, Date.now())

  // Drop the preview exactly when it lapses (the minute clock alone could keep it up to a minute longer).
  useEffect(() => {
    if (!preview) return
    const timer = window.setTimeout(() => setPreview(null), Math.max(0, preview.until - Date.now()))
    return () => window.clearTimeout(timer)
  }, [preview])

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
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
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
  let face
  if (shown.posture === 'evening') {
    const focus = eveningFocus(now)
    const eveningPlan = focus.day === 'today' ? shownToday : shownTomorrow
    face = (
      <WallEvening
        now={now}
        members={members}
        plan={eveningPlan}
        label={focus.label}
        focusDay={focus.day}
        checklist={checklist}
        interaction={{ ...interaction, marks: marksFor(eveningPlan?.date) }}
        decisions={weekDecisions.filter((d) => eveningPlan && sameDay(d.date, eveningPlan.date))}
        onAnswer={tripActions ? answer : undefined}
      />
    )
  } else if (shown.posture === 'calm') {
    face = <WallCalm now={now} members={members} plan={shownToday} currentWeather={currentWeather} onSelectPerson={openPerson} decisionCount={weekDecisions.length} onOpenDecisions={tripActions ? () => setDecisionsOpen(true) : undefined} />
  } else {
    face = <WallLaunch now={now} members={members} plan={shownToday} currentWeather={currentWeather} onOpenMenu={openMenu} onAsk={onAsk} interaction={{ ...interaction, marks: marksFor(shownToday?.date) }} moveActions={moveActions} decisionCount={weekDecisions.length} onOpenDecisions={tripActions ? () => setDecisionsOpen(true) : undefined} />
  }

  return (
    <div className="relative h-full w-full" onClick={() => setPreview((state) => nextPreview(auto, state, Date.now()))}>
      {face}
      {shown.posture !== 'launch' && <MenuButton onOpen={openMenu} className="absolute right-[44px] top-[44px]" />}
      {shown.posture !== 'launch' && onAsk && <MicButton onAsk={onAsk} className="absolute right-[108px] top-[38px]" />}
      {!selected && overlay}
      {shown.preview && !selected && (
        <div className="pointer-events-none absolute left-1/2 top-[8px] -translate-x-1/2 whitespace-nowrap rounded-full bg-wall-ink px-[18px] py-[4px] text-wall-label font-semibold text-wall-on-pigment">
          Previewing {POSTURE_NAMES[shown.posture]} · tap for the next · back to {POSTURE_NAMES[auto]} on its own
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
      {menuOpen && <WallMenu onClose={() => setMenuOpen(false)} />}
    </div>
  )
}
