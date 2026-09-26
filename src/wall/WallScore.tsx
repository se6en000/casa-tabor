import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { formatWallClock } from './clock'
import { fitLabels } from './labelFit'
import { pigmentStyleFor } from './lanes'
import type { Score, ScoreBlock } from './score'
import { TIMELINE_WIDTH, hourMarks, isOnTimeline, xForTime } from './timeline'

// Stage geometry (px on the fixed 1920x1080 stage).
const LANE_HEADER_WIDTH = 300
const LANE_GUTTER = 20
const TRACK_LEFT = LANE_HEADER_WIDTH + LANE_GUTTER
// The stage has 24px to the right of the timeline (padding included); labels may use 16 of it.
const LABEL_OVERHANG = 16
const HOUR_MARKS = hourMarks()
const LABEL_LIMIT = TIMELINE_WIDTH + LABEL_OVERHANG
type LabelFit = Record<string, { left: number; maxWidth: number }>

// Block keys are unique within a lane only (a shared trip appears in several).
const laneKey = (memberId: string, block: ScoreBlock) => `${memberId}:${block.key}`

/** Before measuring: at the block, cut at the next label or the edge. */
function labelPlacement(key: string, block: ScoreBlock, fit: LabelFit): CSSProperties {
  return fit[key] ?? { left: block.x, maxWidth: Math.min(block.labelMaxWidth ?? Infinity, LABEL_LIMIT - block.x) }
}

/** Measures the labels' real widths so a late one can move left instead of being cut at the edge (labelFit.ts). */
function useLabelFit(score: Score | null) {
  const ref = useRef<HTMLElement>(null)
  const [fit, setFit] = useState<LabelFit>({})
  useLayoutEffect(() => {
    let live = true
    const measure = () => {
      const root = ref.current
      if (!root || !live || !score) return
      const next: LabelFit = {}
      for (const lane of score.lanes) {
        const track = root.querySelector<HTMLElement>(`[data-lane-track="${CSS.escape(lane.member.id)}"]`)
        if (!track) continue
        const byKey = new Map(lane.blocks.map((block) => [laneKey(lane.member.id, block), block] as const))
        const labels = [...track.querySelectorAll<HTMLElement>('[data-block-label]')].flatMap((el) => {
          const key = el.dataset.blockLabel ?? ''
          const block = byKey.get(key)
          // scrollWidth rounds; on the kiosk's scaled stage a 219.4px label reads 219 and would be cut to "…", so allow 1px.
          return block ? [{ key, x: block.x, width: el.scrollWidth + 1, maxWidth: block.labelMaxWidth }] : []
        })
        Object.assign(next, fitLabels(labels, LABEL_LIMIT))
      }
      setFit((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next))
    }
    // Measure once the real faces are in: measuring with the fallback font and again after it
    // loaded made labels jump (and screenshots flaky on a busy machine).
    if (!document.fonts || document.fonts.status === 'loaded') measure()
    else void document.fonts.ready.then(measure)
    return () => {
      live = false
    }
  }, [score])
  return { ref, fit }
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

// Where things sit inside a lane. Full-size lanes are 78px; the evening's compact lanes are
// about 58px, so everything moves up and the bars get thinner rather than spilling onto the
// next lane's line (seen on the kiosk 2026-09-25). Written out in full for Tailwind.
const LANE_GEOMETRY = {
  full: { label: 'top-[6px]', bar: 'top-[36px] h-[28px]', monogram: 'top-[34px] h-[32px] w-[32px]', note: 'top-[38px]', mark: 'top-[17px]' },
  compact: { label: 'top-[2px]', bar: 'top-[28px] h-[22px]', monogram: 'top-[26px] h-[26px] w-[26px]', note: 'top-[28px]', mark: 'top-[7px]' },
} as const

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
  const labels = useLabelFit(score)
  const at = LANE_GEOMETRY[compact ? 'compact' : 'full']

  return (
    <section ref={labels.ref} aria-label={heading} className={`relative flex shrink-0 flex-col ${compact ? 'h-[382px]' : 'h-[500px]'}`}>
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
        {score && score.allDay.length > 0 && (
          // All day: context for the day, not a place in time — one quiet row under the hours.
          // Above the "already past" shading: an all-day item isn't over at 7 AM.
          <div data-all-day className={`relative z-10 flex shrink-0 items-center ${compact ? 'h-[36px]' : 'h-[42px]'}`}>
            <div className="w-[320px] shrink-0 text-wall-label font-bold tracking-[0.2em] text-wall-ink-2">ALL DAY</div>
            <div className="flex min-w-0 flex-1 gap-[10px] overflow-hidden pl-[20px]">
              {score.allDay.map((item) => {
                const open = interaction && interaction.selectable(item.sourceId)
                return (
                  <button
                    key={item.sourceId}
                    type="button"
                    disabled={!open}
                    aria-label={`Open ${item.title}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      interaction?.onSelect(item.sourceId)
                    }}
                    className={`flex h-[32px] min-w-0 shrink items-center gap-[8px] rounded-full border border-solid border-wall-rule bg-transparent pl-[4px] pr-[14px] text-wall-ink ${item.people.length === 0 ? 'pl-[14px]' : ''}${ringFor(item.sourceId)}`}
                  >
                    {item.people.map((p) => (
                      <span key={p.id} aria-hidden="true" className={`flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full text-wall-label font-bold text-wall-on-pigment ${pigmentStyleFor(p.pigmentIndex ?? 0).solid}`}>{p.initial}</span>
                    ))}
                    <span className="truncate whitespace-nowrap text-wall-detail font-semibold">{item.title}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
        {lanes.map((lane, laneIndex) => (
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
            <div data-lane-track={lane.member.id} className="relative w-[1512px]">
              {score?.everyoneHomeBy?.laneIndex === laneIndex && (
                // In the lane score.ts chose (where it covers no block); late in the day it reads to the left of its line.
                <div
                  className={`absolute bottom-[9px] whitespace-nowrap bg-wall-ground font-display text-wall-heading font-semibold italic text-wall-brass-ink ${
                    score.everyoneHomeBy.flip ? '-translate-x-full pl-[4px] pr-[8px]' : 'pl-[8px] pr-[4px]'
                  }`}
                  style={{ left: score.everyoneHomeBy.x }}
                >
                  {score.everyoneHomeBy.label}
                </div>
              )}
              {lane.blocks.map((block) => (
                <div key={block.key}>
                  {block.label && block.kind !== 'place' && (
                    <div
                      data-block-label={laneKey(lane.member.id, block)}
                      className={`absolute ${at.label} truncate whitespace-nowrap text-wall-detail font-semibold`}
                      style={labelPlacement(laneKey(lane.member.id, block), block, labels.fit)}
                    >
                      {block.label}
                    </div>
                  )}
                  <div
                    data-block-bar={laneKey(lane.member.id, block)}
                    className={`absolute ${at.bar} flex items-center overflow-hidden rounded-[6px] ${blockClass(block)}${ringFor(block.sourceId)}`}
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
                  data-monogram
                  className={`absolute ${at.monogram} flex -translate-x-1/2 items-center justify-center rounded-full border-2 text-wall-label font-bold ${
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
                      className={`absolute ${at.mark} flex h-[44px] w-[44px] -translate-x-1/2 items-center justify-center rounded-full border-2 border-solid border-wall-brass-ink bg-wall-ground p-0 font-display text-wall-heading font-bold text-wall-brass-ink`}
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
                  className={`absolute ${at.note} whitespace-nowrap text-wall-label font-semibold`}
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
