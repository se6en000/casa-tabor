import { formatWallClock } from './clock'
import type { PaperFacts, PaperWords } from './paper'

export interface WallPaperProps {
  now: Date
  facts: PaperFacts
  words: PaperWords
  /** The calm face's "NEXT" line. */
  next: string | null
  onPutAway: () => void
  onAsk?: () => void
}

/**
 * The morning paper (canvas 48a, Jake Oct 6: "i kinda like A. very creative"): on a calm morning, until 11 or until
 * it's put away, the calm face is the front page — the time in the masthead, a headline, the line under it, and three
 * columns: the runs, the sky, and the rest of the day. The +, mic and menu sit where they always do (WallView).
 */
export default function WallPaper({ now, facts, words, next, onPutAway, onAsk }: WallPaperProps) {
  const clock = formatWallClock(now)
  const rest = [...facts.away, ...facts.also]
  return (
    <article aria-label="The morning paper" className="flex h-full w-full flex-col bg-wall-ground-calm px-[96px] pb-[56px] pt-[44px] font-body text-wall-ink">
      <header className="grid grid-cols-[1fr_auto_1fr] items-center">
        <div className="flex items-baseline gap-[10px]">
          <span className="font-display text-wall-clock font-medium lining-nums">{clock.time}</span>
          <span className="text-wall-body font-semibold text-wall-ink-2">{clock.meridiem}</span>
        </div>
        <div className="flex flex-col items-center gap-[4px]">
          <span className="font-display text-wall-title font-semibold">Tabor House</span>
          <span className="text-wall-label font-bold tracking-[0.22em] text-wall-ink-2">THIS MORNING</span>
        </div>
        <div />
      </header>

      {/* The folio: a double rule, the date and the sky. */}
      <div className="mt-[22px] border-0 border-b border-t-[3px] border-solid border-wall-ink pt-[3px]" />
      <div className="flex items-center justify-between border-0 border-b border-solid border-wall-rule px-[4px] py-[12px] text-wall-detail text-wall-ink-2">
        <span className="font-semibold text-wall-ink">{facts.day}</span>
        {facts.weatherNow && <span>{facts.weatherNow}</span>}
      </div>

      <div className="flex max-w-[1500px] flex-col gap-[18px] pb-[34px] pt-[44px]">
        <h1 className="m-0 font-display text-wall-headline font-semibold text-wall-ink">{words.headline}</h1>
        {words.deck && <p className="m-0 font-display text-wall-deck italic text-wall-ink-2">{words.deck}</p>}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[1.25fr_1fr_1fr] border-0 border-t border-solid border-wall-ink">
        <section aria-label="The runs" className="flex min-h-0 flex-col gap-[16px] overflow-hidden pr-[40px] pt-[22px]">
          <span className="text-wall-label font-bold tracking-[0.22em] text-wall-brass-ink">THE RUNS</span>
          {facts.runs.length === 0 && <span className="text-wall-heading text-wall-ink-2">Nothing on the road.</span>}
          {facts.runs.slice(0, 5).map((run, i) => (
            <div key={i} className="flex items-baseline gap-[14px]">
              <span className="w-[74px] shrink-0 font-display text-wall-answer font-bold lining-nums">{run.at}</span>
              <span className="text-wall-heading">
                {run.text}
                {run.alert && <> — <span className="font-semibold text-wall-rust">{run.alert}</span></>}
              </span>
            </div>
          ))}
        </section>
        <section aria-label="The sky" className="flex flex-col gap-[16px] border-0 border-l border-solid border-wall-rule px-[40px] pt-[22px]">
          <span className="text-wall-label font-bold tracking-[0.22em] text-wall-brass-ink">THE SKY</span>
          <span className="text-wall-heading">{words.sky || facts.weatherNow || 'No forecast this morning.'}</span>
        </section>
        <section aria-label="Also today" className="flex min-h-0 flex-col gap-[16px] overflow-hidden border-0 border-l border-solid border-wall-rule pl-[40px] pt-[22px]">
          <span className="text-wall-label font-bold tracking-[0.22em] text-wall-brass-ink">ALSO TODAY</span>
          {rest.length === 0 && <span className="text-wall-heading text-wall-ink-2">Nothing else on the calendar.</span>}
          {rest.slice(0, 5).map((line, i) => <span key={i} className="text-wall-heading">{line}</span>)}
        </section>
      </div>

      <footer className="flex items-center justify-between border-0 border-t border-solid border-wall-rule pt-[18px]">
        <div className="flex items-center gap-[12px] text-wall-body text-wall-ink-2">
          {next && (
            <>
              <span className="inline-block h-[10px] w-[10px] rounded-full bg-wall-brass" />
              <span className="text-wall-label font-bold tracking-[0.15em] text-wall-brass-ink">NEXT</span>
              <span>{next}</span>
            </>
          )}
        </div>
        <div className="flex gap-[16px]">
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
    </article>
  )
}
