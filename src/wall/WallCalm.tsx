import { useMemo, type ReactNode } from 'react'
import { formatWallDate } from './clock'
import { selectNextMove } from './engine/nextMove'
import type { DayPlan, WallMember } from './engine/types'
import { describeNextMove, weatherLine } from './header'
import { pigmentStyleFor } from './lanes'
import { calmHeadline, nextInWords } from './posture'
import { RailClock, RailLabel, RailRule, RailShell } from './WallRail'
import WallTomorrowNote, { type TomorrowNote } from './WallTomorrowNote'
import { buildScore, type ScoreBlock } from './score'
import { TIMELINE_WIDTH, hourMarks, isOnTimeline, xForTime } from './timeline'

// Each person's day as a thread at the end of their line (canvas 56A calm): the whole day in miniature, 480 px wide.
const THREAD_WIDTH = 480
const scaleX = (x: number) => (x / TIMELINE_WIDTH) * THREAD_WIDTH
const THREAD_MARKS = hourMarks().filter((mark) => mark.hour === 7 || mark.hour === 12 || mark.hour === 17 || mark.hour === 21)
const ROW = 76

function ribbonClass(block: ScoreBlock): string {
  const pigment = pigmentStyleFor(block.pigmentIndex)
  if (block.kind === 'drive') return pigment.solid
  if (block.kind === 'drive_unassigned' || block.placeStatus === 'unknown') return `border border-dashed ${pigment.outline}`
  return block.kind === 'place' ? pigment.tint : pigment.strong
}

export interface WallCalmProps {
  now: Date
  members: WallMember[]
  plan: DayPlan | null
  currentWeather?: { temp: number; condition: string } | null
  /** Tapping a person opens what they're in now, or next (returns false when there's nothing to open). */
  onSelectPerson?: (memberId: string) => boolean
  /** The counts at the foot of the left panel. */
  counts?: ReactNode
  /** Tomorrow speaking up in the afternoon. */
  tomorrow?: TomorrowNote | null
  /** One small job for the quiet stretch (P3.22, board 09a). */
  meanwhile?: ReactNode
}

/**
 * The calm posture (board 02b, canvas 56A calm by day): the left panel keeps the clock and the next thing; the stage is
 * one quiet sentence and who's where, each person with a thread of their day; a small job and tomorrow float below.
 */
export default function WallCalm({ now, members, plan, currentWeather, onSelectPerson, counts, tomorrow = null, meanwhile = null }: WallCalmProps) {
  const score = useMemo(() => (plan ? buildScore(plan, members, now) : null), [plan, members, now])
  const next = useMemo(() => (plan ? describeNextMove(selectNextMove(plan, now), members, now) : null), [plan, members, now])
  const weather = weatherLine(currentWeather, plan, now)
  const lanes = score?.lanes ?? []
  const nextPigment = lanes.find((lane) => lane.member.id === next?.driverId)?.pigmentIndex ?? null
  const inWords = nextInWords(next)

  return (
    <div className="relative h-full w-full bg-wall-ground-calm font-body text-wall-ink">
      <RailShell foot={counts}>
        <RailClock now={now} size="calm">
          <div className="font-display text-wall-date font-semibold">{formatWallDate(now)}</div>
          {weather && <div className="mt-[6px] text-wall-detail text-wall-ink-2">{weather}</div>}
        </RailClock>
        <RailRule />
        {next ? (
          <section aria-label="Next" className="flex shrink-0 flex-col">
            <RailLabel tone="brass">NEXT{inWords ? ` · ${inWords.toUpperCase()}` : ''}</RailLabel>
            {next.leaveTime && <span className="mt-[16px] font-display text-wall-headline font-semibold lining-nums">{next.leaveTime}</span>}
            <div className="mt-[16px] flex min-w-0 items-center gap-[12px]">
              <span
                aria-hidden="true"
                className={`flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full font-display text-wall-label font-bold ${nextPigment == null ? 'border-2 border-dashed border-wall-ink-2 text-wall-ink-2' : `text-wall-on-pigment ${pigmentStyleFor(nextPigment).solid}`}`}
              >
                {next.initial}
              </span>
              <span className="line-clamp-2 font-display text-wall-date font-semibold">{next.what ?? next.title}</span>
            </div>
            <div className="mt-[10px] line-clamp-2 text-wall-detail text-wall-ink-2">{next.how ?? next.detail}</div>
          </section>
        ) : (
          <div className="font-display text-wall-date italic text-wall-ink-2">Nothing else on the road today.</div>
        )}
      </RailShell>

      <div className="absolute inset-y-0 left-[560px] right-0 flex flex-col px-[72px] pb-[56px] pt-[84px]">
        <div className="shrink-0 font-display text-wall-headline font-medium italic">{calmHeadline(plan, now)}</div>

        <div className="relative mt-[56px] flex shrink-0 flex-col">
          <div aria-hidden="true" className="relative ml-auto h-[24px] text-wall-label text-wall-ink-2" style={{ width: THREAD_WIDTH }}>
            {THREAD_MARKS.map((mark) => (
              <span key={mark.hour} className={`absolute whitespace-nowrap ${mark.hour === 7 ? '' : mark.hour === 21 ? '-translate-x-full' : '-translate-x-1/2'}`} style={{ left: scaleX(mark.x) }}>
                {mark.label}
              </span>
            ))}
          </div>
          <div className="flex flex-col border-b border-wall-rule">
            {lanes.map((lane) => (
              <button
                key={lane.member.id}
                type="button"
                className="relative flex items-center gap-[20px] border-0 border-t border-solid border-wall-rule bg-transparent p-0 text-left text-wall-ink"
                style={{ height: ROW }}
                onClick={(event) => {
                  // Only swallow the tap when it opened something; otherwise it previews the next face.
                  if (onSelectPerson?.(lane.member.id)) event.stopPropagation()
                }}
              >
                <span
                  aria-hidden="true"
                  className={`flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-full font-display text-wall-heading font-bold text-wall-on-pigment ${pigmentStyleFor(lane.pigmentIndex).solid}`}
                >
                  {lane.member.name.charAt(0)}
                </span>
                <span className="w-[150px] shrink-0 truncate font-display text-wall-name font-bold">{lane.member.name}</span>
                <span className="min-w-0 flex-1 truncate text-wall-body">{lane.status || 'Nothing on the calendar'}</span>
                <span aria-hidden="true" className="relative h-full shrink-0" style={{ width: THREAD_WIDTH }}>
                  <span className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 bg-wall-rule" />
                  {lane.blocks.map((block) => (
                    <span
                      key={block.key}
                      className={`absolute top-1/2 h-[10px] -translate-y-1/2 rounded-[5px] ${ribbonClass(block)}`}
                      style={{ left: scaleX(block.x), width: Math.max(8, scaleX(block.width)) }}
                    />
                  ))}
                </span>
              </button>
            ))}
          </div>
          {isOnTimeline(now) && lanes.length > 0 && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 top-[22px] w-[2px] bg-wall-brass"
              style={{ right: THREAD_WIDTH - scaleX(xForTime(now)) - 1 }}
            />
          )}
        </div>

        {(meanwhile || tomorrow) && (
          <div className="mt-auto flex shrink-0 gap-[28px]">
            {meanwhile && <div className="flex min-w-0 flex-1 items-center rounded-[20px] bg-wall-paper px-[30px] py-[24px] shadow-[0_1px_0_rgba(38,34,29,0.06),0_8px_22px_rgba(38,34,29,0.12)]">{meanwhile}</div>}
            {tomorrow && <div className={`flex min-w-0 items-center rounded-[20px] bg-wall-paper px-[30px] py-[20px] shadow-[0_1px_0_rgba(38,34,29,0.06),0_8px_22px_rgba(38,34,29,0.12)] ${meanwhile ? 'w-[420px] shrink-0' : 'flex-1'}`}><WallTomorrowNote note={tomorrow} quiet /></div>}
          </div>
        )}
      </div>
    </div>
  )
}
