import type { ReactNode } from 'react'
import type { NextMoveView } from './header'
import type { BriefLine, PaperBrief, PaperFacts, PaperWords } from './paper'
import { RailClock, RailNext, RailRule, RailShell } from './WallRail'

export interface WallPaperProps {
  now: Date
  facts: PaperFacts
  words: PaperWords
  /** The brief beyond the three lines: the server's, or plain ones from the facts until it arrives. */
  brief: PaperBrief
  /** The calm faces' NEXT, in the left panel. */
  next: NextMoveView | null
  nextPigment: number | null
  /** The counts at the foot of the left panel. */
  counts?: ReactNode
  onPutAway: () => void
  onAsk?: () => void
}

const KICKER_DATE = { weekday: 'long', month: 'long', day: 'numeric' } as const

function Column({ label, lines }: { label: string; lines: BriefLine[] }) {
  return (
    <section aria-label={label} className="flex min-h-0 min-w-0 flex-col overflow-hidden border-0 border-t-2 border-solid border-wall-ink pt-[14px]">
      <span className="text-wall-label font-bold tracking-[0.22em] text-wall-brass-ink">{label.toUpperCase()}</span>
      {lines.length === 0 && <span className="mt-[16px] text-wall-detail text-wall-ink-2">Nothing to say.</span>}
      {lines.map((line, i) => (
        <div key={i} className="mt-[16px] flex flex-col gap-[4px]">
          <span className="font-display text-wall-heading font-semibold">{line.title}</span>
          <span className="line-clamp-3 text-wall-detail text-wall-ink-2">{line.detail}</span>
        </div>
      ))}
    </section>
  )
}

/**
 * The morning brief (canvas 58; Jake, Oct 6: "heres what to worry about today, heres what to prepare for the
 * weekend/next week, heres something a month out … surprise me … you can adjust this every day without my
 * permission"): on a calm morning, until 11 or until it's put away. The left panel keeps the clock and the next thing;
 * the stage is the front page — the headline in two halves, the line under it, four columns (today, the weekend, next
 * month, way out), one thing forgotten, the day's surprise, and a line at the foot. The words are the server's, written
 * once a day (supabase/functions/morning-paper); until they come, plain ones from the facts.
 */
export default function WallPaper({ now, facts, words, brief, next, nextPigment, counts, onPutAway, onAsk }: WallPaperProps) {
  const both = Boolean(brief.forgot && brief.feature)
  return (
    <article aria-label="The morning paper" className="relative h-full w-full bg-wall-ground-calm font-body text-wall-ink">
      <RailShell foot={counts}>
        <RailClock now={now} size="calm">
          <div className="font-display text-wall-date font-semibold">{now.toLocaleDateString('en-US', KICKER_DATE)}</div>
          <div className="mt-[8px] line-clamp-3 text-wall-detail text-wall-ink-2">{words.sky || facts.weatherNow}</div>
        </RailClock>
        <RailRule />
        <RailNext view={next} pigmentIndex={nextPigment} />
      </RailShell>

      <div className="absolute inset-y-0 left-[560px] right-0 flex flex-col px-[72px] pb-[44px] pt-[48px]">
        <div className="flex shrink-0 items-center gap-[18px]">
          <span aria-hidden="true" className="h-[2px] w-[40px] bg-wall-brass" />
          <span className="text-wall-label font-bold tracking-[0.22em] text-wall-brass-ink">THE MORNING · {facts.day.replace(/, \d{4}$/, '').toUpperCase()}</span>
        </div>
        <h1 className="m-0 mt-[16px] line-clamp-2 shrink-0 font-display text-wall-headline font-medium text-wall-ink">
          {words.headline}
          {brief.turn && <> <i className="text-wall-brass-ink">{brief.turn}</i></>}
        </h1>
        {words.deck && <p className="m-0 mt-[16px] line-clamp-2 shrink-0 font-display text-wall-answer italic text-wall-ink-2">{words.deck}</p>}

        <div className="mt-[36px] grid min-h-0 flex-1 grid-cols-4 gap-x-[36px]">
          <Column label="Today · watch for" lines={brief.today} />
          <Column label="This weekend" lines={brief.weekend} />
          <Column label="Next month" lines={brief.month} />
          <Column label="Way out" lines={brief.wayOut} />
        </div>

        {(brief.forgot || brief.feature) && (
          <div className={`mt-[24px] grid shrink-0 gap-[28px] ${both ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {brief.forgot && (
              <section aria-label="You may have forgotten" className="flex min-w-0 flex-col gap-[8px] rounded-[18px] border-[1.5px] border-solid border-wall-brass bg-wall-brass/10 px-[26px] py-[20px]">
                <span className="text-wall-label font-bold tracking-[0.22em] text-wall-brass-ink">YOU MAY HAVE FORGOTTEN</span>
                <span className="line-clamp-2 font-display text-wall-date font-semibold">{brief.forgot.title}</span>
                <span className="line-clamp-2 text-wall-detail text-wall-ink-2">{brief.forgot.detail}</span>
              </section>
            )}
            {brief.feature && (
              <section aria-label={brief.feature.label} className="flex min-w-0 flex-col gap-[8px] rounded-[18px] bg-wall-paper px-[26px] py-[20px] shadow-[0_1px_0_rgba(38,34,29,0.06),0_8px_22px_rgba(38,34,29,0.12)]">
                <span className="text-wall-label font-bold tracking-[0.22em] text-wall-brass-ink">{brief.feature.label.toUpperCase()}</span>
                <span className="line-clamp-2 font-display text-wall-date font-semibold">{brief.feature.title}</span>
                <span className="line-clamp-2 text-wall-detail text-wall-ink-2">{brief.feature.detail}</span>
              </section>
            )}
          </div>
        )}

        <footer className="mt-[24px] flex shrink-0 items-center justify-between gap-[24px]">
          <span className="min-w-0 truncate font-display text-wall-date italic text-wall-ink-2">{brief.aside}</span>
          <div className="flex shrink-0 gap-[16px]">
            {onAsk && (
              <button type="button" onClick={(e) => { e.stopPropagation(); onAsk() }} className="h-[56px] rounded-full border border-solid border-wall-rule bg-wall-paper px-[30px] text-wall-body font-semibold text-wall-ink">
                Ask about it
              </button>
            )}
            <button type="button" onClick={(e) => { e.stopPropagation(); onPutAway() }} className="h-[56px] rounded-full border-0 bg-wall-ink px-[30px] text-wall-body font-semibold text-wall-on-pigment">
              Put it away
            </button>
          </div>
        </footer>
      </div>
    </article>
  )
}
