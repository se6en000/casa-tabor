import type { CSSProperties } from 'react'
import { formatWallClock } from './clock'
import { pigmentStyleFor } from './lanes'
import type { Score, ScoreBlock } from './score'
import { TIMELINE_WIDTH, hourMarks, isOnTimeline, xForTime } from './timeline'

// Stage geometry (px on the fixed 1920x1080 stage).
const LANE_HEADER_WIDTH = 300
const LANE_GUTTER = 20
const TRACK_LEFT = LANE_HEADER_WIDTH + LANE_GUTTER
// The stage has 24px to the right of the timeline (padding included); labels may use 16 of it.
const LABEL_OVERHANG = 16
// "Everyone home by 9:00" needs about this much room right of its line, or it flips to the left.
const HOME_LABEL_ROOM = 320
const HOUR_MARKS = hourMarks()
// A label with less room than this before the right edge reads leftward from the edge instead.
const RIGHT_EDGE_ROOM = 240
const RIGHT_EDGE_LABEL_MAX = 420

function labelPlacement(block: ScoreBlock): CSSProperties {
  const room = TIMELINE_WIDTH + LABEL_OVERHANG - block.x
  if (room < RIGHT_EDGE_ROOM) return { right: -LABEL_OVERHANG, maxWidth: RIGHT_EDGE_LABEL_MAX, textAlign: 'right' }
  return { left: block.x, maxWidth: Math.min(block.labelMaxWidth ?? Infinity, room) }
}

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

/** The place may be cut short; the time after the last " · " never is. */
function LaneStatus({ text }: { text: string }) {
  const cut = text.lastIndexOf(' · ')
  const lead = cut === -1 ? text : text.slice(0, cut)
  const tail = cut === -1 ? null : text.slice(cut)
  return (
    <div className="mt-[4px] flex min-w-0 whitespace-nowrap text-wall-detail text-wall-ink-2">
      <span className="truncate">{lead}</span>
      {tail && <span className="shrink-0 whitespace-pre">{tail}</span>}
    </div>
  )
}

/** Tapping a calendar item on the Score opens its sheet; the open one is outlined (dashed while editing). */
export interface ScoreInteraction {
  onSelect: (sourceId: string) => void
  selectable: (sourceId: string) => boolean
  highlight?: { sourceId: string; draft: boolean } | null
  /** Calendar/routine source id → the open decision about it; shown as a "?" on its block. */
  marks?: Record<string, string>
  onOpenDecision?: (decisionKey: string) => void
}

export interface WallScoreProps {
  score: Score | null
  now: Date
  heading?: string
  /** Shorter lanes, for the evening posture. */
  compact?: boolean
  interaction?: ScoreInteraction
}

const MIN_HIT_WIDTH = 56

export default function WallScore({ score, now, heading = "TODAY · WHO'S WHERE", compact = false, interaction }: WallScoreProps) {
  const highlight = interaction?.highlight
  const ringFor = (sourceId: string) =>
    highlight?.sourceId === sourceId
      ? highlight.draft
        ? ' outline-2 outline-dashed outline-offset-4 outline-wall-brass-ink'
        : ' outline-[3px] outline-solid outline-offset-4 outline-wall-brass-ink'
      : ''
  const clock = formatWallClock(now)
  const showNow = isOnTimeline(now)
  const nowX = xForTime(now)
  // Hide the hour label the "now" time label would sit on top of.
  const marks = showNow ? HOUR_MARKS.filter((mark) => mark.x < nowX - 20 || mark.x > nowX + 70) : HOUR_MARKS
  const lanes = score?.lanes ?? []

  return (
    <section aria-label={heading} className={`relative flex shrink-0 flex-col ${compact ? 'h-[382px]' : 'h-[500px]'}`}>
      <div className="flex h-[32px] shrink-0 items-end">
        <div className="w-[320px] shrink-0 pb-[6px] text-wall-label font-bold tracking-[0.2em] text-wall-ink-2">
          {heading}
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
                {lane.status && <LaneStatus text={lane.status} />}
              </div>
            </div>
            <div className="w-[20px] shrink-0" />
            <div className="relative w-[1512px]">
              {lane.blocks.map((block) => (
                <div key={block.key}>
                  {block.label && block.kind !== 'place' && (
                    <div
                      data-block-label
                      className="absolute top-[6px] truncate whitespace-nowrap text-wall-detail font-semibold"
                      style={labelPlacement(block)}
                    >
                      {block.label}
                    </div>
                  )}
                  <div
                    className={`absolute top-[36px] flex h-[28px] items-center overflow-hidden rounded-[6px] ${blockClass(block)}${ringFor(block.sourceId)}`}
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
              {interaction &&
                lane.blocks
                  .filter((block) => interaction.selectable(block.sourceId))
                  .map((block) => (
                    <button
                      key={`hit:${block.key}`}
                      type="button"
                      aria-label={`Open ${block.label ?? 'this'}`}
                      className="absolute top-0 h-full border-0 bg-transparent p-0"
                      style={{ left: block.x - Math.max(0, (MIN_HIT_WIDTH - block.width) / 2), width: Math.max(block.width, MIN_HIT_WIDTH) }}
                      onClick={(event) => {
                        event.stopPropagation()
                        interaction.onSelect(block.sourceId)
                      }}
                    />
                  ))}
              {interaction?.marks && interaction.onOpenDecision &&
                lane.blocks
                  .filter((block, i, all) => interaction.marks![block.sourceId] && all.findIndex((b) => b.sourceId === block.sourceId) === i)
                  .map((block) => (
                    <button
                      key={`mark:${block.key}`}
                      type="button"
                      aria-label="Needs a decision"
                      className="absolute top-[17px] flex h-[44px] w-[44px] -translate-x-1/2 items-center justify-center rounded-full border-2 border-solid border-wall-brass-ink bg-wall-ground p-0 font-display text-wall-heading font-bold text-wall-brass-ink"
                      style={{ left: Math.max(22, block.x) }}
                      onClick={(event) => {
                        event.stopPropagation()
                        interaction.onOpenDecision?.(interaction.marks![block.sourceId])
                      }}
                    >
                      ?
                    </button>
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
            className={`absolute bottom-[10px] whitespace-nowrap bg-wall-ground font-display text-wall-heading font-semibold italic text-wall-brass-ink ${
              // Late in the day there's no room to the right of the line, so it reads to the left of it.
              score.everyoneHomeBy.x > TIMELINE_WIDTH - HOME_LABEL_ROOM ? '-translate-x-full pl-[4px] pr-[8px]' : 'pl-[8px] pr-[4px]'
            }`}
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
