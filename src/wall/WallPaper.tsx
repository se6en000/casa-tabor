import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { QrCode } from 'lucide-react'
import type { NextMoveView } from './header'
import type { BriefLine, PaperBrief, PaperFacts, PaperWords } from './paper'
import { RailClock, RailNext, RailRule, RailShell } from './WallRail'
import { Qr } from './WallDirections'
import { useDragSide } from './useSwipeDown'
import { deviceKeyboardHere } from './keyboardMode'
import type { ScoutPaper } from './useScout'
import { outAndAbout, outingLink, outingWhen, townNewsPage, weekendHighlight, type Outing, type TownNews } from '../../supabase/functions/_shared/scout.mjs'

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
  /** Out & about and Around town (canvas 72): with none, the paper is the front page alone. */
  scout?: ScoutPaper | null
  onPutAway: () => void
  onAsk?: (say: string) => void
}

const KICKER_DATE = { weekday: 'long', month: 'long', day: 'numeric' } as const
const PAGES = [
  { name: 'The front page', ask: 'Tell me more about today' },
  { name: 'Out & about', ask: 'What should we do this weekend?' },
  { name: 'Around town', ask: 'Tell me more about the news around town' },
]

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

/** A page's kicker, title and the line under it (pages 2 and 3). */
function PageHead({ kicker, title, deck }: { kicker: string; title: string; deck: string }) {
  return (
    <>
      <div className="flex shrink-0 items-center gap-[18px]">
        <span aria-hidden="true" className="h-[2px] w-[40px] bg-wall-brass" />
        <span className="text-wall-label font-bold tracking-[0.22em] text-wall-brass-ink">{kicker.toUpperCase()}</span>
      </div>
      <h1 className="m-0 mt-[16px] shrink-0 font-display text-wall-title font-medium text-wall-ink">{title}</h1>
      <p className="m-0 mt-[14px] shrink-0 font-display text-wall-answer italic text-wall-ink-2">{deck}</p>
    </>
  )
}

/** The line under an outing's name: when and where, or for a place how far and how liked. */
function outingMeta(o: Outing): string {
  if (o.kind === 'restaurant') {
    return [o.drive_min ? `${o.drive_min} min away` : null, o.rating ? `${o.rating}★ from ${o.rating_count ?? 0}` : null, o.gem ? 'a hidden gem' : null].filter(Boolean).join(' · ')
  }
  return [outingWhen(o), o.place && o.place !== o.title ? o.place : null, o.free ? 'free' : null].filter(Boolean).join(' · ')
}

function PhoneButton({ o, onPhone }: { o: Outing; onPhone: (o: Outing) => void }) {
  return (
    <button type="button" onClick={() => onPhone(o)} className="flex h-[44px] shrink-0 items-center gap-[6px] rounded-full border border-solid border-wall-rule bg-transparent px-[14px] text-wall-detail font-semibold text-wall-ink">
      <QrCode aria-hidden="true" className="h-[18px] w-[18px]" /> Phone
    </button>
  )
}

/** Phone · Save · Not for us, under each outing. */
function OutingActions({ o, onPhone, answer }: { o: Outing; onPhone: (o: Outing) => void; answer?: ScoutPaper['answer'] }) {
  const saved = o.status === 'saved'
  return (
    <div className="mt-[10px] flex items-center gap-[14px] whitespace-nowrap">
      <PhoneButton o={o} onPhone={onPhone} />
      {answer && (
        <>
          <button type="button" aria-pressed={saved} onClick={() => answer(o.id, saved ? 'new' : 'saved')} className="h-[44px] border-0 bg-transparent px-[2px] text-wall-detail font-semibold text-wall-brass-ink">
            {saved ? 'Saved ✓' : 'Save'}
          </button>
          <button type="button" onClick={() => answer(o.id, 'not_for_us')} className="h-[44px] border-0 bg-transparent px-[2px] text-wall-detail text-wall-ink-2 underline decoration-wall-rule underline-offset-[5px]">
            Not for us
          </button>
        </>
      )}
    </div>
  )
}

const OUT_COLUMNS = [
  { kind: 'couple', label: 'For the two of you' },
  { kind: 'family', label: 'For the family' },
  { kind: 'fitness', label: 'Get moving' },
  { kind: 'restaurant', label: 'New & worth it' },
] as const

/** Page 2, Out & about (canvas 72B): the two best of each kind, checked this week. */
function OutPage({ scout, onPhone }: { scout: ScoutPaper; onPhone: (o: Outing) => void }) {
  const lists = outAndAbout(scout.outings, { today: scout.today })
  const count = Object.values(lists).reduce((n, l) => n + l.length, 0)
  return (
    <>
      <PageHead kicker="Out & about · this week and next"
        title={count >= 4 ? 'Plenty worth getting out for.' : count ? 'A few worth getting out for.' : 'Nothing checked out this week.'}
        deck="Checked this week: real, on, and within half an hour of home." />
      <div className="mt-[40px] grid min-h-0 flex-1 grid-cols-4 gap-x-[32px]">
        {OUT_COLUMNS.map(({ kind, label }) => (
          <section key={kind} aria-label={label} className="flex min-h-0 min-w-0 flex-col overflow-hidden">
            <span className="border-0 border-b border-solid border-wall-rule pb-[10px] text-wall-label font-bold tracking-[0.22em] text-wall-brass-ink">{label.toUpperCase()}</span>
            {lists[kind].length === 0 && <span className="mt-[16px] text-wall-detail text-wall-ink-2">Nothing this week.</span>}
            {lists[kind].map((o, i) => (
              <article key={o.id} aria-label={o.title} className={`flex flex-col pt-[16px] ${i ? 'mt-[16px] border-0 border-t border-solid border-wall-rule' : ''}`}>
                <span className="line-clamp-2 font-display text-wall-date font-medium">{o.title}</span>
                <span className="mt-[6px] line-clamp-2 text-wall-detail font-semibold text-wall-brass-ink">{outingMeta(o)}</span>
                {o.why && <span className="mt-[6px] line-clamp-3 text-wall-detail text-wall-ink-2">{o.why}</span>}
                <OutingActions o={o} onPhone={onPhone} answer={scout.answer} />
              </article>
            ))}
          </section>
        ))}
      </div>
    </>
  )
}

const NEWS_COLUMNS = [
  { section: 'schools', label: 'The schools', none: 'Nothing from the schools this week.' },
  { section: 'city', label: 'The county & city', none: 'Nothing from the city this week.' },
  { section: 'papers', label: 'From the papers', none: 'Nothing from the papers this week.' },
] as const

const SHORT_DATE = { month: 'short', day: 'numeric', timeZone: 'UTC' } as const

/** Page 3, Around town (canvas 72C): the morning's news, only what reaches the family, each line with where it's from. */
function TownPage({ news }: { news: TownNews[] }) {
  const page = townNewsPage(news)
  return (
    <>
      <PageHead kicker="Around town · what touches us" title="The week’s news, for this house."
        deck="From the schools, the city and the papers you get — only what reaches the family." />
      <div className="mt-[40px] grid min-h-0 flex-1 grid-cols-3 gap-x-[44px]">
        {NEWS_COLUMNS.map(({ section, label, none }) => (
          <section key={section} aria-label={label} className="flex min-h-0 min-w-0 flex-col overflow-hidden">
            <span className="border-0 border-b border-solid border-wall-rule pb-[10px] text-wall-label font-bold tracking-[0.22em] text-wall-brass-ink">{label.toUpperCase()}</span>
            {page[section].length === 0 && <span className="mt-[16px] text-wall-detail text-wall-ink-2">{none}</span>}
            {page[section].map((n, i) => (
              <article key={`${n.headline}-${i}`} aria-label={n.headline} className={`flex flex-col pt-[16px] ${i ? 'mt-[16px] border-0 border-t border-solid border-wall-rule' : ''}`}>
                <span className="line-clamp-2 font-display text-wall-date font-medium">{n.headline}</span>
                {n.line && <span className="mt-[6px] line-clamp-3 text-wall-detail text-wall-ink-2">{n.line}</span>}
                <span className="mt-[6px] text-wall-label font-bold tracking-[0.08em] text-wall-brass-ink">
                  {[n.source, n.source_date ? new Date(`${n.source_date}T12:00:00Z`).toLocaleDateString('en-US', SHORT_DATE) : null].filter(Boolean).join(' · ').toUpperCase()}
                </span>
              </article>
            ))}
          </section>
        ))}
      </div>
    </>
  )
}

/** The phone's QR for an outing: its page (or the place on Google Maps). */
function PhoneCard({ o, onClose }: { o: Outing; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-wall-ink/30" onClick={onClose}>
      <div role="dialog" aria-label={`${o.title} on your phone`} onClick={(e) => e.stopPropagation()} className="flex max-w-[760px] items-center gap-[28px] rounded-[24px] bg-wall-on-pigment px-[30px] py-[26px] text-wall-ink shadow-[0_8px_22px_rgba(38,34,29,0.18)]">
        <Qr text={outingLink(o)} label={`QR code: ${o.title}`} />
        <div className="flex min-w-0 flex-col gap-[10px]">
          <span className="text-wall-label font-bold tracking-[0.2em] text-wall-brass-ink">ON YOUR PHONE</span>
          <span className="font-display text-wall-date font-bold leading-tight">{o.title}</span>
          <span className="text-wall-detail text-wall-ink-2">{outingMeta(o)}</span>
          <span className="text-wall-detail text-wall-ink-2">{o.kind === 'restaurant' ? 'Point your phone’s camera here — Google Maps opens with it.' : 'Point your phone’s camera here — its page opens.'}</span>
          <button type="button" onClick={onClose} className="h-[52px] self-start rounded-full border border-solid border-wall-ink-2 bg-wall-paper px-[22px] text-wall-detail font-semibold text-wall-ink">Done</button>
        </div>
      </div>
    </div>
  )
}

/**
 * The morning paper (canvas 48a, 58, 72; Jake, Oct 6: "heres what to worry about today, heres what to prepare for the
 * weekend/next week, heres something a month out … surprise me"; Oct 8: "it doesnt have to be just one … couples things,
 * family ideas, health activities … family news with outside news"): on a calm morning, until 11 or until it's put away.
 * The left panel keeps the clock and the next thing; the stage is three pages, turned with a sideways swipe (a finger or
 * the mouse), the arrow keys or the button at the foot — the front page (the headline, four columns, one thing forgotten
 * and this weekend's best for the two of them), Out & about (the Scout's checked list) and Around town (the news). The
 * front page's words are the server's, written once a day (supabase/functions/morning-paper); until they come, plain ones.
 */
export default function WallPaper({ now, facts, words, brief, next, nextPigment, counts, scout, onPutAway, onAsk }: WallPaperProps) {
  const pages = scout ? 3 : 1
  const [page, setPage] = useState(0)
  const [phone, setPhone] = useState<Outing | null>(null)
  const computer = useMemo(() => deviceKeyboardHere(), [])
  const turn = (step: 1 | -1) => setPage((p) => Math.min(pages - 1, Math.max(0, p + step)))
  const { handlers, dragX } = useDragSide(turn, page, pages)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowRight') setPage((p) => Math.min(pages - 1, p + 1))
      if (e.key === 'ArrowLeft') setPage((p) => Math.max(0, p - 1))
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [pages])

  // This weekend's best for the two of them (Jake: "a highlight from the Out and about"); the writer's own pick without it.
  const weekend = scout ? weekendHighlight(scout.outings, { today: scout.today }) : null
  const feature = weekend
    ? { label: `${weekend.label} · for two`, title: weekend.outing.title, detail: [outingMeta(weekend.outing), weekend.outing.why].filter(Boolean).join(' — '), outing: weekend.outing }
    : brief.feature ? { ...brief.feature, outing: null } : null
  const both = Boolean(brief.forgot && feature)
  const openPhone = (o: Outing) => {
    if (computer) window.open(outingLink(o), '_blank', 'noopener')
    else setPhone(o)
  }

  return (
    <article aria-label="The morning paper" onClick={(e) => e.stopPropagation()} className="relative h-full w-full bg-wall-ground-calm font-body text-wall-ink">
      <RailShell foot={counts}>
        <RailClock now={now} size="calm">
          <div className="font-display text-wall-date font-semibold">{now.toLocaleDateString('en-US', KICKER_DATE)}</div>
          <div className="mt-[8px] line-clamp-3 text-wall-detail text-wall-ink-2">{words.sky || facts.weatherNow}</div>
        </RailClock>
        <RailRule />
        <RailNext view={next} pigmentIndex={nextPigment} />
      </RailShell>

      <div className="absolute inset-y-0 left-[560px] right-0 touch-none overflow-hidden" data-no-swipe={pages > 1 ? '' : undefined} {...handlers}>
        <div
          className={`flex h-full ${pages > 1 ? 'w-[300%]' : 'w-full'} ${dragX ? '' : 'transition-transform duration-[420ms] ease-out'}`}
          style={{ transform: `translateX(calc(${(-page * 100) / pages}% + ${dragX}px))` }}
        >
          <section aria-label="The front page" aria-hidden={page !== 0} className={`flex h-full ${pages > 1 ? 'w-1/3' : 'w-full'} flex-col px-[72px] pb-[124px] pt-[48px]`}>
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

            {(brief.forgot || feature) && (
              <div className={`mt-[24px] grid shrink-0 gap-[28px] ${both ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {brief.forgot && (
                  <section aria-label="You may have forgotten" className="flex min-w-0 flex-col gap-[8px] rounded-[18px] border-[1.5px] border-solid border-wall-brass bg-wall-brass/10 px-[26px] py-[20px]">
                    <span className="text-wall-label font-bold tracking-[0.22em] text-wall-brass-ink">YOU MAY HAVE FORGOTTEN</span>
                    <span className="line-clamp-2 font-display text-wall-date font-semibold">{brief.forgot.title}</span>
                    <span className="line-clamp-2 text-wall-detail text-wall-ink-2">{brief.forgot.detail}</span>
                  </section>
                )}
                {feature && (
                  <section aria-label={feature.label} className="flex min-w-0 items-center gap-[20px] rounded-[18px] bg-wall-paper px-[26px] py-[20px] shadow-[0_1px_0_rgba(38,34,29,0.06),0_8px_22px_rgba(38,34,29,0.12)]">
                    <div className="flex min-w-0 flex-1 flex-col gap-[8px]">
                      <span className="text-wall-label font-bold tracking-[0.22em] text-wall-brass-ink">{feature.label.toUpperCase()}</span>
                      <span className="line-clamp-2 font-display text-wall-date font-semibold">{feature.title}</span>
                      <span className="line-clamp-2 text-wall-detail text-wall-ink-2">{feature.detail}</span>
                    </div>
                    {feature.outing && <PhoneButton o={feature.outing} onPhone={openPhone} />}
                  </section>
                )}
              </div>
            )}
            {brief.aside && <p className="m-0 mt-[20px] shrink-0 truncate font-display text-wall-date italic text-wall-ink-2">{brief.aside}</p>}
          </section>

          {scout && (
            <>
              <section aria-label="Out & about" aria-hidden={page !== 1} className="flex h-full w-1/3 flex-col px-[72px] pb-[124px] pt-[96px]">
                <OutPage scout={scout} onPhone={openPhone} />
              </section>
              <section aria-label="Around town" aria-hidden={page !== 2} className="flex h-full w-1/3 flex-col px-[72px] pb-[124px] pt-[96px]">
                <TownPage news={scout.news} />
              </section>
            </>
          )}
        </div>

        <footer className="absolute inset-x-[72px] bottom-[44px] flex h-[56px] items-center justify-between gap-[24px]">
          <div className="flex min-w-0 items-center gap-[20px]">
            {pages > 1 && (
              <>
                <div aria-hidden="true" className="flex gap-[8px]">
                  {PAGES.map((p, i) => (
                    <span key={p.name} className={`h-[10px] w-[10px] rounded-full border-[1.5px] border-solid border-wall-brass-ink ${i === page ? 'bg-wall-brass-ink' : ''}`} />
                  ))}
                </div>
                <span className="text-wall-detail text-wall-ink-2">{PAGES[page].name} · {page + 1} of {pages}</span>
                <button type="button" onClick={() => setPage(page === pages - 1 ? 0 : page + 1)} className="h-[48px] rounded-full border border-solid border-wall-ink-2 bg-transparent px-[22px] text-wall-detail font-semibold text-wall-ink">
                  {page === pages - 1 ? '‹ Back to the front' : `${PAGES[page + 1].name} ›`}
                </button>
              </>
            )}
          </div>
          <div className="flex shrink-0 gap-[16px]">
            {onAsk && (
              <button type="button" onClick={() => onAsk(PAGES[page].ask)} className="h-[56px] rounded-full border border-solid border-wall-rule bg-wall-paper px-[30px] text-wall-body font-semibold text-wall-ink">
                Ask about it
              </button>
            )}
            <button type="button" onClick={onPutAway} className="h-[56px] rounded-full border-0 bg-wall-ink px-[30px] text-wall-body font-semibold text-wall-on-pigment">
              Put it away
            </button>
          </div>
        </footer>
      </div>
      {phone && <PhoneCard o={phone} onClose={() => setPhone(null)} />}
    </article>
  )
}
