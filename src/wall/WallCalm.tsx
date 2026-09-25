import { useMemo } from 'react'
import { formatWallClock, formatWallDate } from './clock'
import { selectNextMove } from './engine/nextMove'
import type { DayPlan, WallMember } from './engine/types'
import { describeNextMove, weatherLine } from './header'
import { pigmentStyleFor } from './lanes'
import { calmHeadline, calmNextLine } from './posture'
import { buildScore, type ScoreBlock } from './score'
import { TIMELINE_WIDTH, hourMarks, isOnTimeline, xForTime } from './timeline'

// The ribbon: the whole day in miniature, 1680px wide, one thin row per person.
const RIBBON_LEFT = 48
const RIBBON_WIDTH = 1680
const RIBBON_ROW = 20
const scaleX = (x: number) => (x / TIMELINE_WIDTH) * RIBBON_WIDTH
// Every other hour, so the miniature stays quiet.
const RIBBON_MARKS = hourMarks().filter((mark) => mark.hour % 2 === 1)

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
}

/** The calm posture (board 02b): a big clock, where everyone is, and the day in miniature. */
export default function WallCalm({ now, members, plan, currentWeather }: WallCalmProps) {
  const score = useMemo(() => (plan ? buildScore(plan, members, now) : null), [plan, members, now])
  const next = useMemo(() => (plan ? calmNextLine(describeNextMove(selectNextMove(plan, now), members, now)) : null), [plan, members, now])
  const clock = formatWallClock(now)
  const weather = weatherLine(currentWeather, plan, now)
  const lanes = score?.lanes ?? []

  return (
    <div className="flex h-full w-full flex-col justify-between bg-wall-ground-calm px-[96px] pb-[64px] pt-[80px] font-body text-wall-ink">
      <div className="flex items-start gap-[120px]">
        <div className="flex w-[720px] shrink-0 flex-col gap-[14px]">
          <div className="flex items-baseline gap-[14px]">
            <span className="font-display text-wall-clock-calm font-medium lining-nums">{clock.time}</span>
            <span className="text-wall-date font-semibold text-wall-ink-2">{clock.meridiem}</span>
          </div>
          <div className="mt-[10px] font-display text-wall-date-calm font-semibold">{formatWallDate(now)}</div>
          {weather && <div className="text-wall-body text-wall-ink-2">{weather}</div>}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-[26px] pt-[24px]">
          <div className="font-display text-wall-move font-medium italic">{calmHeadline(plan, now)}</div>
          <div className="flex flex-col border-b border-wall-rule">
            {lanes.map((lane) => (
              <div key={lane.member.id} className="flex h-[70px] items-center gap-[18px] border-t border-wall-rule">
                <span
                  aria-hidden="true"
                  className={`flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full font-display text-wall-heading font-bold text-wall-on-pigment ${pigmentStyleFor(lane.pigmentIndex).solid}`}
                >
                  {lane.member.name.charAt(0)}
                </span>
                <span className="w-[130px] shrink-0 truncate font-display text-wall-name font-bold">{lane.member.name}</span>
                <span className="truncate text-wall-body">{lane.status || 'Nothing on the calendar'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-[18px]">
        {next && (
          <div className="flex items-center gap-[12px] text-wall-body">
            <span aria-hidden="true" className="h-[10px] w-[10px] shrink-0 rounded-full bg-wall-brass-ink" />
            <span className="text-wall-label font-bold tracking-[0.15em] text-wall-brass-ink">NEXT</span>
            <span className="truncate">{next}</span>
          </div>
        )}

        <div aria-hidden="true" className="relative" style={{ height: 30 + lanes.length * RIBBON_ROW }}>
          <div className="absolute top-0 h-[20px] text-wall-label text-wall-ink-2" style={{ left: RIBBON_LEFT, width: RIBBON_WIDTH }}>
            {RIBBON_MARKS.map((mark) => (
              <span key={mark.hour} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: scaleX(mark.x) }}>
                {mark.label}
              </span>
            ))}
          </div>
          {lanes.map((lane, row) => (
            <div key={lane.member.id} className="absolute left-0 h-[18px] w-[1728px]" style={{ top: 30 + row * RIBBON_ROW }}>
              <span className="absolute left-0 top-0 text-wall-label font-bold leading-[18px]">{lane.member.name.charAt(0)}</span>
              <div className="absolute top-[9px] h-px bg-wall-rule" style={{ left: RIBBON_LEFT, width: RIBBON_WIDTH }} />
              {lane.blocks.map((block) => (
                <div
                  key={block.key}
                  className={`absolute top-[5px] h-[8px] rounded-[4px] ${ribbonClass(block)}`}
                  style={{ left: RIBBON_LEFT + scaleX(block.x), width: Math.max(4, scaleX(block.width)) }}
                />
              ))}
            </div>
          ))}
          {isOnTimeline(now) && (
            <div
              className="absolute top-[24px] w-[2px] bg-wall-brass-ink"
              style={{ left: RIBBON_LEFT + scaleX(xForTime(now)), height: 6 + lanes.length * RIBBON_ROW }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
