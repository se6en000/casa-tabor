import { formatWallClock } from './clock'
import { pigmentStyleFor } from './lanes'
import type { Score, ScoreBlock } from './score'
import { TIMELINE_WIDTH, hourMarks, isOnTimeline, xForTime } from './timeline'

// Stage geometry (px on the fixed 1920x1080 stage).
const LANE_HEADER_WIDTH = 300
const LANE_GUTTER = 20
const TRACK_LEFT = LANE_HEADER_WIDTH + LANE_GUTTER
const HOUR_MARKS = hourMarks()

function blockClass(block: ScoreBlock): string {
  const pigment = pigmentStyleFor(block.pigmentIndex)
  switch (block.kind) {
    case 'place':
      return pigment.tint
    case 'drive':
      return pigment.hatch
    case 'drive_unassigned':
      return 'border-2 border-dashed border-wall-ink-2'
    case 'activity':
      // No place recorded: an outline, so it never reads as a confirmed outing.
      return block.placeStatus === 'unknown' ? `border-2 border-dashed ${pigment.outline}` : pigment.strong
  }
}

export default function WallScore({ score, now }: { score: Score | null; now: Date }) {
  const clock = formatWallClock(now)
  const showNow = isOnTimeline(now)
  const nowX = xForTime(now)
  // Hide the hour label the "now" time label would sit on top of.
  const marks = showNow ? HOUR_MARKS.filter((mark) => mark.x < nowX - 20 || mark.x > nowX + 70) : HOUR_MARKS
  const lanes = score?.lanes ?? []

  return (
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
        {lanes.map((lane) => (
          <div key={lane.member.id} className="flex min-h-0 flex-1 border-t border-wall-rule">
            <div className="flex w-[300px] shrink-0 items-center gap-[14px]">
              <span
                aria-hidden="true"
                className={`flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-full font-display text-wall-heading font-bold text-wall-on-pigment ${pigmentStyleFor(lane.pigmentIndex).solid}`}
              >
                {lane.member.name.charAt(0)}
              </span>
              <div className="min-w-0">
                <div className="font-display text-wall-name font-bold">{lane.member.name}</div>
                {lane.status && <div className="mt-[4px] truncate text-wall-detail text-wall-ink-2">{lane.status}</div>}
              </div>
            </div>
            <div className="w-[20px] shrink-0" />
            <div className="relative w-[1512px]">
              {lane.blocks.map((block) => (
                <div key={block.key}>
                  {block.label && block.kind !== 'place' && (
                    <div
                      className="absolute top-[6px] truncate whitespace-nowrap text-wall-detail font-semibold"
                      style={{ left: block.x, maxWidth: Math.min(block.labelMaxWidth ?? Infinity, TIMELINE_WIDTH + 60 - block.x) }}
                    >
                      {block.label}
                    </div>
                  )}
                  <div
                    className={`absolute top-[36px] flex h-[28px] items-center overflow-hidden rounded-[6px] ${blockClass(block)}`}
                    style={{ left: block.x, width: block.width }}
                  >
                    {block.kind === 'place' && (
                      <span className="truncate whitespace-nowrap pl-[26px] pr-[10px] text-wall-label font-medium">{block.label}</span>
                    )}
                  </div>
                </div>
              ))}
              {lane.monograms.map((mono) => (
                <span
                  key={mono.key}
                  aria-hidden="true"
                  className={`absolute top-[34px] flex h-[32px] w-[32px] -translate-x-1/2 items-center justify-center rounded-full border-2 text-wall-label font-bold ${
                    mono.pigmentIndex == null
                      ? 'border-dashed border-wall-ink-2 bg-wall-ground text-wall-ink-2'
                      : `border-wall-ground text-wall-on-pigment ${pigmentStyleFor(mono.pigmentIndex).solid}`
                  }`}
                  style={{ left: mono.x }}
                >
                  {mono.initial}
                </span>
              ))}
              {lane.notes.map((note) => (
                <div
                  key={note.key}
                  className="absolute top-[38px] whitespace-nowrap text-wall-label font-semibold"
                  style={{ left: note.x + 24 }}
                >
                  {note.text}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {score?.everyoneHomeBy && (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 top-[32px] border-l border-dashed border-wall-brass"
            style={{ left: TRACK_LEFT + score.everyoneHomeBy.x }}
          />
          <div
            className="absolute bottom-[10px] whitespace-nowrap bg-wall-ground pl-[8px] pr-[4px] font-display text-wall-heading font-semibold italic text-wall-brass-ink"
            style={{ left: TRACK_LEFT + score.everyoneHomeBy.x }}
          >
            {score.everyoneHomeBy.label}
          </div>
        </>
      )}

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
  )
}
