import { useMemo, type ReactNode } from 'react'
import { formatWallDate } from './clock'
import { describeNextMove, weatherLine, type NextMoveView } from './header'
import { describeHomeLead, selectHeaderLead, thenItems } from './headerLead'
import WallThen from './WallThen'
import NextMovePanel, { type NextMoveActions } from './NextMovePanel'
import { buildScore } from './score'
import type { DayPlan, WallMember } from './engine/types'
import WallScore, { type ScoreInteraction } from './WallScore'
import WallTomorrowNote, { type TomorrowNote } from './WallTomorrowNote'
import type { DatedDecision } from './WallDecisions'
import type { DecisionAction } from './decisions'
import type { PackingGroup, WallChecklistItem } from './packing'
import { PrepRail } from './WallPrep'
import { RailClock, RailRule, RailShell, TakeWithYou } from './WallRail'

export interface WallLaunchProps {
  now: Date
  members: WallMember[]
  /** null while today's data is loading. */
  plan: DayPlan | null
  currentWeather?: { temp: number; condition: string } | null
  interaction?: ScoreInteraction
  moveActions?: NextMoveActions
  /** The counts at the foot of the left panel (to decide, from email, to plan, to do). */
  counts?: ReactNode
  /** Opens a calendar item (something at home leading the header, a line under THEN). */
  onOpenItem?: (id: string) => void
  /** The week strip, drawn under the Score. */
  week?: ReactNode
  /** Tomorrow speaking up in the afternoon. */
  tomorrow?: TomorrowNote | null
  /**
   * Today's get & pack (row 18; Jake, 2026-10-01: "the home page/today should show the get and pack section so I can
   * check off … Owen's pink shirt before I leave for school"): the events still ahead and their lists, and today's
   * decisions. What goes with the next move sits under it in the left panel (TAKE WITH YOU, canvas 56A); while any
   * other list is left, the lanes go compact and these sit under them, as on the evening face.
   */
  prep?: {
    packing: { groups: PackingGroup[]; packed: number; total: number }
    decisions: DatedDecision[]
    onAnswer?: (decision: DatedDecision, action: DecisionAction) => Promise<void>
    onToggleItem?: (item: WallChecklistItem) => void
    onOpenEvent?: (eventId: string) => void
    onSeeAll?: () => void
    /** NEXT UP (canvas 27a): the day's chores and timed to-dos, drawn across one box or two; null when there are none. */
    nextUp?: ((columns: 1 | 2) => ReactNode) | null
  } | null
}

/**
 * The full day (canvas 56A, "the stage"): the left panel holds now — the clock, the Next Move with what to take, and
 * THEN — and the whole stage beside it goes to the day: the Score, today's lists, the week strip.
 */
export default function WallLaunch({ now, members, plan, currentWeather, interaction, moveActions, counts, onOpenItem, week, tomorrow: tomorrowNote = null, prep = null }: WallLaunchProps) {
  const hideRoutines = interaction?.routines?.hidden === true
  const score = useMemo(() => (plan ? buildScore(plan, members, now, { hideRoutines }) : null), [plan, members, now, hideRoutines])
  // Who leads the header (canvas 29e/29f): the next move, or something at home — a one-off beats a routine run the
  // sitter covers when they're within 45 minutes, and keeps the header until it's over. THEN is the next three.
  const lead = useMemo(() => selectHeaderLead(plan, members, now), [plan, members, now])
  const then = useMemo(() => thenItems(plan, members, lead, now), [plan, members, lead, now])
  const homeLead = lead?.kind === 'home' ? lead : null
  const nextMove = useMemo((): NextMoveView | null => {
    if (!lead) return null
    if (lead.kind === 'move') return describeNextMove(lead.move, members, now)
    const home = describeHomeLead(lead.item, lead.now, members, now)
    return { eyebrow: home.eyebrow, urgent: false, driverId: home.whoId, initial: home.initial, title: home.title, detail: home.detail, summary: home.title, what: home.title, how: home.detail, timing: '', leaveTime: null, also: null, ring: home.ring, tripIds: [], departed: false, status: 'upcoming' }
  }, [lead, members, now])
  const driverPigment = score?.lanes.find((lane) => lane.member.id === nextMove?.driverId)?.pigmentIndex ?? null
  const weather = weatherLine(currentWeather, plan, now)
  const onDetails = homeLead && onOpenItem ? () => onOpenItem(homeLead.item.id) : undefined

  // TAKE WITH YOU: the lists of the events the next move goes to; the stage keeps the rest.
  const { take, rest } = useMemo(() => {
    const groups = prep?.packing.groups ?? []
    const eventIds = new Set(lead?.kind === 'move' && nextMove ? (plan?.trips ?? []).filter((t) => nextMove.tripIds.includes(t.id)).map((t) => t.sourceId) : [])
    const take = groups.filter((g) => eventIds.has(g.eventId))
    const others = groups.filter((g) => !eventIds.has(g.eventId))
    const items = others.flatMap((g) => g.items)
    return { take, rest: { groups: others, packed: items.filter((i) => i.checked).length, total: items.length } }
  }, [prep, lead, nextMove, plan])
  const packing = rest.total > 0
  // The rail on the stage shows with a list to get ready or the day's small jobs (NEXT UP, canvas 27a).
  const prepping = packing || Boolean(prep?.nextUp)
  // Today's list takes the room the TOMORROW note would use; tomorrow's own list is on the evening face.
  const tomorrow = packing ? null : tomorrowNote
  // NEXT UP takes two boxes, or one beside a get & pack list.
  const nextUpColumns: 1 | 2 = packing ? 1 : 2

  return (
    <div className="relative h-full w-full bg-wall-ground font-body text-wall-ink">
      <RailShell foot={counts}>
        <RailClock now={now}>
          <div className="flex flex-wrap items-baseline gap-x-[12px]">
            <span className="font-display text-wall-date font-semibold">{formatWallDate(now)}</span>
            {weather && <span className="text-wall-detail text-wall-ink-2">{weather}</span>}
          </div>
        </RailClock>
        <RailRule />
        <NextMovePanel rail view={nextMove} pigmentIndex={driverPigment} actions={homeLead ? undefined : moveActions} onDetails={onDetails} />
        {take.length > 0 && (
          <div className="mt-[26px]">
            <TakeWithYou groups={take} onToggleItem={prep?.onToggleItem} onSeeAll={prep?.onSeeAll} room={then.length > 0 ? 3 : 5} />
          </div>
        )}
        {then.length > 0 && (
          <div className="mt-[30px]">
            <WallThen rail items={then} members={members} pigmentOf={(id) => score?.lanes.find((lane) => lane.member.id === id)?.pigmentIndex ?? null} onOpen={onOpenItem} />
          </div>
        )}
      </RailShell>

      <div className="absolute inset-y-0 left-[560px] right-0 flex flex-col gap-[22px] px-[56px] py-[44px]">
        {tomorrow && <WallTomorrowNote note={tomorrow} />}
        <WallScore score={score} now={now} fill compact={prepping} interaction={interaction} />
        {prep && prepping && (
          <PrepRail
            decisions={prep.decisions}
            decisionLabel="Needs a decision today"
            now={now}
            onAnswer={prep.onAnswer}
            packing={rest}
            packLabel="Get & pack today"
            departure={null}
            onToggleItem={prep.onToggleItem}
            onOpenEvent={prep.onOpenEvent}
            onSeeAll={prep.onSeeAll}
            nextUp={prep.nextUp ? { node: prep.nextUp(nextUpColumns), columns: nextUpColumns } : null}
            fixed
          />
        )}
        {week}
      </div>
    </div>
  )
}
