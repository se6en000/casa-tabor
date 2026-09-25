import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FamilyRoutine } from '../lib/familyRoutines'
import type { EditableEvent } from './editing'
import { buildDayPlan, type DayOff } from './engine/dayPlan'
import type { DayPlan, WallEvent, WallMember } from './engine/types'
import type { WallChecklistItem } from './packing'
import { eveningFocus, selectPosture, type Posture } from './posture'
import { nextPreview, shownPosture, type PreviewState } from './preview'
import { pigmentIndexes } from './score'
import { eventForPerson } from './selection'
import WallCalm from './WallCalm'
import WallEvening from './WallEvening'
import WallEventSheet from './WallEventSheet'
import WallLaunch from './WallLaunch'
import WallMenu, { MenuButton } from './WallMenu'
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
}

const POSTURE_NAMES: Record<Posture, string> = { launch: 'Full day', calm: 'Calm', evening: 'Evening' }

/**
 * The whole Wall, drawn from data only (no fetching), so it can be rendered from fixtures.
 * A tap on empty wall previews the next face (back to the automatic one after 2 idle
 * minutes); a tap on a calendar item opens its sheet (details, then edit).
 */
export default function WallView(props: WallViewProps) {
  const { now, members, today, tomorrow, currentWeather, checklist = [], allEvents = [], routines = [], dayOffs = [] } = props
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draftPreview, setDraftPreview] = useState<EditableEvent | null>(null)

  const eventsById = useMemo(() => new Map(allEvents.map((e) => [e.id, e as EditableEvent])), [allEvents])
  const buildPlanFor = useCallback(
    (date: Date, events: WallEvent[]) => buildDayPlan({ date, members, routines, events, dayOffs }),
    [members, routines, dayOffs],
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

  // An event deleted elsewhere closes its sheet.
  useEffect(() => {
    if (selectedId && !eventsById.has(selectedId)) setSelectedId(null)
  }, [selectedId, eventsById])

  const interaction: ScoreInteraction = {
    onSelect: setSelectedId,
    selectable: (id) => eventsById.has(id),
    highlight: selectedId ? { sourceId: selectedId, draft: Boolean(draftPreview) } : null,
  }
  const openPerson = (memberId: string) => {
    const id = today ? eventForPerson(today, memberId, now, (sourceId) => eventsById.has(sourceId)) : null
    if (id) setSelectedId(id)
    return Boolean(id)
  }

  const openMenu = () => setMenuOpen(true)
  let face
  if (shown.posture === 'evening') {
    const focus = eveningFocus(now)
    face = <WallEvening now={now} members={members} plan={focus.day === 'today' ? shownToday : shownTomorrow} label={focus.label} focusDay={focus.day} checklist={checklist} interaction={interaction} />
  } else if (shown.posture === 'calm') {
    face = <WallCalm now={now} members={members} plan={shownToday} currentWeather={currentWeather} onSelectPerson={openPerson} />
  } else {
    face = <WallLaunch now={now} members={members} plan={shownToday} currentWeather={currentWeather} onOpenMenu={openMenu} interaction={interaction} />
  }

  return (
    <div className="relative h-full w-full" onClick={() => setPreview((state) => nextPreview(auto, state, Date.now()))}>
      {face}
      {shown.posture !== 'launch' && <MenuButton onOpen={openMenu} className="absolute right-[44px] top-[44px]" />}
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
      {menuOpen && <WallMenu onClose={() => setMenuOpen(false)} />}
    </div>
  )
}
