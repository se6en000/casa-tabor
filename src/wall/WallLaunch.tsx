import { useMemo, type ReactNode } from 'react'
import { formatWallClock, formatWallDate } from './clock'
import { describeNextMove, weatherLine, type NextMoveView } from './header'
import { describeHomeLead, selectHeaderLead, thenItems } from './headerLead'
import WallThen from './WallThen'
import NextMovePanel, { type NextMoveActions } from './NextMovePanel'
import { buildScore } from './score'
import type { DayPlan, WallMember } from './engine/types'
import { AddButton, MenuButton, MicButton } from './WallMenu'
import WallScore, { type ScoreInteraction } from './WallScore'
import WallTomorrowNote, { type TomorrowNote } from './WallTomorrowNote'
import { DecisionCount, EmailCount, type DatedDecision } from './WallDecisions'
import type { DecisionAction } from './decisions'
import type { PackingGroup, WallChecklistItem } from './packing'
import { PrepRail } from './WallPrep'
import { CasaCalling } from './WallCasaTalk'
import type { CasaTopic } from './casaTalk'

export interface WallLaunchProps {
  now: Date
  members: WallMember[]
  /** null while today's data is loading. */
  plan: DayPlan | null
  currentWeather?: { temp: number; condition: string } | null
  onOpenMenu?: () => void
  onAsk?: () => void
  /** Casa has something to say (canvas 21a): the mic glows and the quiet line takes the name's place. */
  calling?: { topic: CasaTopic; onOpen: () => void } | null
  /** The + beside the mic: adding by touch. */
  onAdd?: () => void
  interaction?: ScoreInteraction
  moveActions?: NextMoveActions
  decisionCount?: number
  onOpenDecisions?: () => void
  /** What came in by email and waits (canvas 14d), and opening its review. */
  emailCount?: number
  onOpenEmail?: () => void
  /** Opens a calendar item (something at home leading the header, a line under THEN). */
  onOpenItem?: (id: string) => void
  /** The week strip, drawn under the Score. */
  week?: ReactNode
  /** Tomorrow speaking up in the afternoon. */
  tomorrow?: TomorrowNote | null
  /**
   * Today's get & pack (row 18; Jake, 2026-10-01: "the home page/today should show the get and pack section so I can
   * check off … Owen's pink shirt before I leave for school"): the events still ahead and their lists, and today's
   * decisions. While any list is left, the lanes go compact and these sit under them, as on the evening face.
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

/** The launch posture (board 02a): clock, Next Move, and the full Score. */
export default function WallLaunch({ now, members, plan, currentWeather, onOpenMenu, onAsk, calling = null, onAdd, interaction, moveActions, decisionCount = 0, onOpenDecisions, emailCount = 0, onOpenEmail, onOpenItem, week, tomorrow: tomorrowNote = null, prep = null }: WallLaunchProps) {
  const packing = Boolean(prep && prep.packing.total > 0)
  // The rail shows with a list to get ready or the day's small jobs (NEXT UP, canvas 27a).
  const prepping = packing || Boolean(prep?.nextUp)
  // Today's list takes the room the TOMORROW note would use; tomorrow's own list is on the evening face.
  const tomorrow = packing ? null : tomorrowNote
  // NEXT UP takes two boxes, or one beside a get & pack list.
  const nextUpColumns: 1 | 2 = packing ? 1 : 2
  const hideRoutines = interaction?.routines?.hidden === true
  const score = useMemo(() => (plan ? buildScore(plan, members, now, { hideRoutines }) : null), [plan, members, now, hideRoutines])
  const clock = formatWallClock(now)
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

  return (
    // With a list to get ready, the evening face's layout (Jake: "why can't it have the same layout as the night /
    // tomorrow mode?"): a shorter header that keeps the Next Move, compact lanes, decisions and get & pack beneath,
    // and the week strip.
    // One header height whether or not there's a list, so the screen never jumps when the list is done (polish, Oct 1).
    <div className="flex h-full w-full flex-col gap-[22px] bg-wall-ground p-[44px] font-body text-wall-ink">
      <header className="flex h-[184px] shrink-0 items-stretch gap-[48px]">
        <div className="flex w-[520px] shrink-0 flex-col gap-[6px]">
          <div className="flex items-center gap-[10px]">
            <MenuButton onOpen={onOpenMenu ?? (() => {})} />
            {onAsk && <MicButton onAsk={calling ? calling.onOpen : onAsk} calling={Boolean(calling)} small className="ml-[4px]" />}
            {onAdd && <AddButton onAdd={onAdd} />}
            {calling ? (
              // The one thing Casa has to say takes the row (it is among the decisions, so the count waits).
              <CasaCalling topic={calling.topic} onOpen={calling.onOpen} className="ml-[10px]" />
            ) : (
              <>
                {/* The row fits the name or the email count, not both beside TO DECIDE: the count ran into the ring (2026-09-30). */}
                {!(onOpenEmail && emailCount > 0) && <span className="whitespace-nowrap text-wall-label font-semibold tracking-[0.18em] text-wall-brass-ink">TABOR HOUSE</span>}
                {onOpenDecisions && <DecisionCount count={decisionCount} onOpen={onOpenDecisions} className="ml-[6px]" />}
                {onOpenEmail && <EmailCount count={emailCount} onOpen={onOpenEmail} />}
              </>
            )}
          </div>
          <div className="mt-[2px] flex items-baseline gap-[10px]">
            <span className="font-display text-wall-clock font-medium lining-nums">{clock.time}</span>
            <span className="text-wall-heading font-semibold text-wall-ink-2">{clock.meridiem}</span>
          </div>
          <div className="truncate font-display text-wall-date font-semibold">
            {formatWallDate(now)}
            {weather && <span className="font-body text-wall-detail font-normal text-wall-ink-2"> · {weather}</span>}
          </div>
        </div>

        <div className="w-px shrink-0 bg-wall-rule" />

        <NextMovePanel
          view={nextMove}
          pigmentIndex={driverPigment}
          actions={homeLead ? undefined : moveActions}
          onDetails={onDetails}
          compact={then.length > 0}
        />
        <WallThen items={then} members={members} pigmentOf={(id) => score?.lanes.find((lane) => lane.member.id === id)?.pigmentIndex ?? null} onOpen={onOpenItem} />
      </header>

      {tomorrow && <WallTomorrowNote note={tomorrow} />}
      <WallScore score={score} now={now} compact={prepping} interaction={interaction} />
      {prep && prepping && (
        <PrepRail
          decisions={prep.decisions}
          decisionLabel="Needs a decision today"
          now={now}
          onAnswer={prep.onAnswer}
          packing={prep.packing}
          packLabel="Get & pack today"
          departure={null}
          onToggleItem={prep.onToggleItem}
          onOpenEvent={prep.onOpenEvent}
          onSeeAll={prep.onSeeAll}
          nextUp={prep.nextUp ? { node: prep.nextUp(nextUpColumns), columns: nextUpColumns } : null}
        />
      )}
      {week}
    </div>
  )
}
