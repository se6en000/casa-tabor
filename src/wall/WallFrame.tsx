import { useFamilyMembers } from '../hooks/useFamilyMembers'
import { formatWallClock, formatWallDate } from './clock'
import { selectLaneMembers, pigmentClassFor } from './lanes'
import { TIMELINE_WIDTH, hourMarks, isOnTimeline, xForTime } from './timeline'
import { useMinuteClock } from './useMinuteClock'

// Stage geometry (px on the fixed 1920x1080 stage).
const LANE_HEADER_WIDTH = 300
const LANE_GUTTER = 20
const TRACK_LEFT = LANE_HEADER_WIDTH + LANE_GUTTER
const HOUR_MARKS = hourMarks()

export default function WallFrame() {
  const now = useMinuteClock()
  const { data: members = [] } = useFamilyMembers()
  const lanes = selectLaneMembers(members)
  const clock = formatWallClock(now)
  const showNow = isOnTimeline(now)
  const nowX = xForTime(now)
  // Hide the hour label the "now" time label would sit on top of.
  const marks = showNow ? HOUR_MARKS.filter((mark) => mark.x < nowX - 20 || mark.x > nowX + 70) : HOUR_MARKS

  return (
    <div className="flex h-full w-full flex-col gap-[28px] bg-wall-ground p-[44px] font-body text-wall-ink">
      <header className="flex h-[220px] shrink-0 items-stretch gap-[48px]">
        <div className="flex w-[520px] shrink-0 flex-col gap-[6px]">
          <div className="flex items-center gap-[12px]">
            <span
              aria-hidden="true"
              className="flex h-[44px] w-[44px] items-center justify-center rounded-full border border-wall-brass font-display text-wall-detail font-bold text-wall-brass-ink"
            >
              MT
            </span>
            <span className="text-wall-label font-semibold tracking-[0.25em] text-wall-brass-ink">MAISON TABOR</span>
          </div>
          <div className="mt-[2px] flex items-baseline gap-[10px]">
            <span className="font-display text-wall-clock font-medium lining-nums">{clock.time}</span>
            <span className="text-wall-heading font-semibold text-wall-ink-2">{clock.meridiem}</span>
          </div>
          <div className="font-display text-wall-date font-semibold">{formatWallDate(now)}</div>
        </div>

        <div className="w-px shrink-0 bg-wall-rule" />

        <section aria-label="Next move" className="flex min-w-0 flex-1 flex-col justify-center gap-[10px]">
          <div className="text-wall-label font-bold tracking-[0.2em] text-wall-ink-2">NEXT MOVE</div>
          <p className="m-0 font-display text-wall-date italic text-wall-ink-2">
            Being built — the next departure will appear here.
          </p>
        </section>
      </header>

      <section aria-label="Today, who's where" className="relative flex h-[500px] shrink-0 flex-col">
        <div className="flex h-[32px] shrink-0 items-end">
          <div className="w-[320px] shrink-0 pb-[6px] text-wall-label font-bold tracking-[0.2em] text-wall-ink-2">
            TODAY · WHO'S WHERE
          </div>
          <div className="relative h-full w-[1512px] text-wall-label text-wall-ink-2">
            {marks.map((mark) => (
              <span
                key={mark.hour}
                className="absolute bottom-[6px] -translate-x-1/2 whitespace-nowrap"
                style={{ left: Math.min(mark.x, TIMELINE_WIDTH - 12) }}
              >
                {mark.label}
              </span>
            ))}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col border-b border-wall-rule">
          {lanes.map((member, index) => (
            <div key={member.id} className="flex min-h-0 flex-1 border-t border-wall-rule">
              <div className="flex w-[300px] shrink-0 items-center gap-[14px]">
                <span
                  aria-hidden="true"
                  className={`flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-full font-display text-wall-heading font-bold text-wall-on-pigment ${pigmentClassFor(index)}`}
                >
                  {member.name.charAt(0)}
                </span>
                <span className="font-display text-wall-name font-bold">{member.name}</span>
              </div>
              <div className="w-[20px] shrink-0" />
              <div className="relative w-[1512px]" />
            </div>
          ))}
        </div>

        {showNow && (
          <>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 top-[32px] bg-wall-ground/60"
              style={{ left: TRACK_LEFT, width: nowX }}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 top-[26px] w-[2px] bg-wall-brass-ink"
              style={{ left: TRACK_LEFT + nowX - 1 }}
            />
            <div
              className="absolute top-[4px] text-wall-label font-bold text-wall-brass-ink lining-nums"
              style={{ left: TRACK_LEFT + nowX + 8 }}
            >
              {clock.time}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
