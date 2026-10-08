import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { QrCode } from 'lucide-react'
import type { NextMoveView } from './header'
import { frontScrollMax, PAPER_SLIM_AT, type BriefLine, type PaperBrief, type PaperFacts, type PaperWords } from './paper'
import { RailClock, RailNext, RailRule, RailShell } from './WallRail'
import { Qr } from './WallDirections'
import { useDragSide } from './useSwipeDown'
import { useFrontScroll } from './useFrontScroll'
import { deviceKeyboardHere } from './keyboardMode'
import type { ScoutPaper } from './useScout'
import { outAndAboutPlan, outingLink, outingWhen, townNewsPage, weekendHighlight, type Outing, type TownNews } from '../../supabase/functions/_shared/scout.mjs'

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
    <section aria-label={label} className="flex min-w-0 flex-col border-0 border-t-2 border-solid border-wall-ink pt-[14px]">
      <span className="text-wall-label font-bold tracking-[0.22em] text-wall-brass-ink">{label.toUpperCase()}</span>
      {lines.length === 0 && <span className="mt-[16px] text-wall-detail text-wall-ink-2">Nothing to say.</span>}
      {lines.map((line, i) => (
        <div key={i} className="mt-[16px] flex flex-col gap-[4px]">
          <span className="font-display text-wall-heading font-semibold">{line.title}</span>
          <span className="text-wall-detail text-wall-ink-2">{line.detail}</span>
        </div>
      ))}
    </section>
  )
}

// The cards' slim and open (canvas 73A; Jake: "very smooth and very cool feeling"): a long, soft ease-out.
const CARD_MOTION = 'transition-all duration-[560ms] ease-[cubic-bezier(0.22,1,0.36,1)]'

/** A card's note, folding away to nothing and back (its height and its fade together). */
function Folds({ open, late = false, children }: { open: boolean; late?: boolean; children: ReactNode }) {
  return (
    <div className={`grid ${CARD_MOTION} ${late ? 'delay-[70ms]' : ''} ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
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
  // A gig from the calendars says what it is (Jake, Oct 8: trivia, concerts "just part of the out and about").
  const what = { music: 'Live music', comedy: 'Comedy', trivia: 'Trivia night' }[o.kind as string] ?? null
  return [what, outingWhen(o), o.place && o.place !== o.title ? o.place : null, o.free ? 'free' : null].filter(Boolean).join(' · ')
}

function PhoneButton({ o, onPhone }: { o: Outing; onPhone: (o: Outing) => void }) {
  return (
    <button type="button" onClick={() => onPhone(o)} className="flex h-[44px] shrink-0 items-center gap-[6px] rounded-full border border-solid border-wall-rule bg-transparent px-[14px] text-wall-detail font-semibold text-wall-ink">
      <QrCode aria-hidden="true" className="h-[18px] w-[18px]" /> Phone
    </button>
  )
}

/**
 * A page that scrolls when there's more than fits (Jake, Oct 8: "fit up all the available spots even have a scroll on
 * those pages if a lot is going on"): the front page's scroll — the wall moves the words, a fling and a soft end; the
 * arrow keys while it's the page on show. A fade at the foot says there's more.
 */
function ScrollPage({ active, children }: { active: boolean; children: ReactNode }) {
  const [max, setMax] = useState(0)
  const viewRef = useRef<HTMLDivElement | null>(null)
  const still = useCallback(() => {}, [])
  const { content, handlers, glideTo, at } = useFrontScroll(max, still)
  useLayoutEffect(() => {
    const measure = () => {
      if (content.current && viewRef.current) setMax(Math.max(0, content.current.offsetHeight - viewRef.current.clientHeight))
    }
    measure()
    const ro = new ResizeObserver(measure)
    for (const el of [content.current, viewRef.current]) if (el) ro.observe(el)
    return () => ro.disconnect()
  }, [content])
  useEffect(() => {
    if (!active) return
    const key = (e: KeyboardEvent) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') glideTo(at() + (e.key === 'ArrowDown' ? 320 : -320)) }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [active, glideTo, at])
  return (
    <div ref={viewRef} className="absolute inset-x-0 bottom-[112px] top-0 overflow-hidden" {...handlers}>
      <div ref={content} className="px-[72px] pb-[48px] pt-[96px] will-change-transform">{children}</div>
      {max > 0 && <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-[56px] bg-linear-to-b from-transparent to-wall-ground-calm" />}
    </div>
  )
}

const KIND_WORD: Record<string, string> = { couple: 'For two', family: 'Family', fitness: 'Get moving', music: 'Live music', comedy: 'Comedy', trivia: 'Trivia', restaurant: 'Place' }
const dayShort = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
const timeOf = (when: string | null) => (when && when.length > 10 ? outingWhen({ when, recurring: null })?.split(' · ')[1] ?? null : null)

/** One outing on Out & about: what kind and when in small capitals, its name, where and why; a tap opens its card. */
function Entry({ o, chip, onOpen }: { o: Outing; chip: string; onOpen: (o: Outing) => void }) {
  const where = o.kind === 'restaurant' ? outingMeta(o) : [o.place && o.place !== o.title ? o.place : null, o.free ? 'free' : null].filter(Boolean).join(' · ')
  return (
    <button type="button" aria-label={o.title} onClick={() => onOpen(o)} className="flex min-w-0 flex-col gap-[2px] border-0 border-t border-solid border-wall-rule bg-transparent px-0 pb-[10px] pt-[10px] text-left font-body text-wall-ink">
      <span className="truncate text-wall-label font-bold tracking-[0.12em] text-wall-brass-ink">{chip.toUpperCase()}{o.status === 'saved' ? ' · SAVED' : ''}</span>
      <span className="line-clamp-2 font-display text-wall-heading font-semibold">{o.title}</span>
      {where && <span className="truncate text-wall-detail text-wall-ink-2">{where}</span>}
    </button>
  )
}

function Section({ label, count, children }: { label: string; count?: number; children: ReactNode }) {
  return (
    <section aria-label={label} className="mt-[34px] flex flex-col">
      <span className="text-wall-label font-bold tracking-[0.22em] text-wall-brass-ink">{label.toUpperCase()}{count ? ` · ${count}` : ''}</span>
      {children}
    </section>
  )
}

/**
 * Page 2, Out & about (canvas 72B, rethought Oct 8 — Jake: "im not seeing much … things that look cool a couple weeks
 * out are good to know too for planning"): by when — tonight and the weekend day by day, next week, further out, every
 * week, and places — everything the Scout and the calendars have, the page scrolling when it's a lot.
 */
function OutPage({ scout, active, now, onOpen }: { scout: ScoutPaper; active: boolean; now: Date; onOpen: (o: Outing) => void }) {
  const plan = outAndAboutPlan(scout.outings, { today: scout.today, nowTime: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}` })
  const grid = 'mt-[6px] grid grid-cols-4 gap-x-[32px]'
  return (
    <ScrollPage active={active}>
      <PageHead kicker="Out & about · the next six weeks"
        title={plan.count >= 12 ? 'Plenty worth getting out for.' : plan.count ? 'A few worth getting out for.' : 'Nothing checked out this week.'}
        deck="Checked: real, on, and within half an hour of home — an hour for a show worth the drive." />
      <Section label="Tonight & this weekend">
        <div className={`mt-[6px] grid gap-x-[32px] ${plan.weekend.length >= 4 ? 'grid-cols-4' : plan.weekend.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {plan.weekend.map((d) => (
            <div key={d.day} aria-label={d.label} className="flex min-w-0 flex-col">
              <span className="mb-[2px] mt-[10px] font-display text-wall-date font-semibold">{d.label} <span className="text-wall-ink-2">{d.label === 'Tonight' ? '' : dayShort(d.day).replace(/^\w+, /, '')}</span></span>
              {d.items.length === 0 && <span className="border-0 border-t border-solid border-wall-rule pt-[10px] text-wall-detail text-wall-ink-2">Nothing found yet.</span>}
              {d.items.map((o) => <Entry key={o.id} o={o} chip={[timeOf(o.when), KIND_WORD[o.kind]].filter(Boolean).join(' · ')} onOpen={onOpen} />)}
              {d.more > 0 && <span className="pt-[6px] text-wall-detail text-wall-ink-2">+{d.more} more {d.more === 1 ? 'band' : 'bands'} — ask Alexa</span>}
            </div>
          ))}
        </div>
      </Section>
      {plan.nextWeek.length > 0 && (
        <Section label="Next week" count={plan.nextWeek.length}>
          <div className={grid}>{plan.nextWeek.map((o) => <Entry key={o.id} o={o} chip={[o.when ? dayShort(o.when.slice(0, 10)).split(',')[0] : null, timeOf(o.when), KIND_WORD[o.kind]].filter(Boolean).join(' · ')} onOpen={onOpen} />)}</div>
        </Section>
      )}
      {plan.later.length > 0 && (
        <Section label="Further out · worth planning for" count={plan.later.length}>
          <div className={grid}>{plan.later.map((o) => <Entry key={o.id} o={o} chip={[o.when ? dayShort(o.when.slice(0, 10)) : null, KIND_WORD[o.kind]].filter(Boolean).join(' · ')} onOpen={onOpen} />)}</div>
        </Section>
      )}
      {plan.weekly.length > 0 && (
        <Section label="Every week" count={plan.weekly.length}>
          <div className={grid}>{plan.weekly.map((o) => <Entry key={o.id} o={o} chip={[o.recurring?.replace(/^every /i, ''), KIND_WORD[o.kind]].filter(Boolean).join(' · ')} onOpen={onOpen} />)}</div>
        </Section>
      )}
      {plan.places.length > 0 && (
        <Section label="New & worth it · places" count={plan.places.length}>
          <div className={grid}>{plan.places.map((o) => <Entry key={o.id} o={o} chip={o.gem ? 'Hidden gem' : 'Worth a try'} onOpen={onOpen} />)}</div>
        </Section>
      )}
    </ScrollPage>
  )
}

const NEWS_COLUMNS = [
  { section: 'schools', label: 'The schools', none: 'Nothing from the schools this week.' },
  { section: 'city', label: 'The county & city', none: 'Nothing from the city this week.' },
  { section: 'papers', label: 'From the papers', none: 'Nothing from the papers yet — they come in as the newsletters do.' },
] as const

const SHORT_DATE = { month: 'short', day: 'numeric', timeZone: 'UTC' } as const

/**
 * Page 3, Around town (canvas 72C, Oct 8 rethought): the dates to know first (soonest on), then everything from the
 * schools, the city and the papers, each line with where it's from — scrolling when there's a lot.
 */
function TownPage({ news, today, active }: { news: TownNews[]; today: string; active: boolean }) {
  const page = townNewsPage(news, today)
  return (
    <ScrollPage active={active}>
      <PageHead kicker="Around town · what touches us" title="The week’s news, for this house."
        deck="From the schools, the city and the papers you get — only what reaches the family." />
      {page.dates.length > 0 && (
        <Section label="Dates to know" count={page.dates.length}>
          <div className="mt-[10px] grid grid-cols-4 gap-[16px]">
            {page.dates.slice(0, 8).map((n) => (
              <div key={`${n.headline}-${n.on_date}`} className="flex min-w-0 flex-col gap-[2px] rounded-[14px] bg-wall-paper px-[18px] py-[12px]">
                <span className="font-display text-wall-date font-semibold text-wall-brass-ink">{n.on_date ? dayShort(n.on_date) : ''}</span>
                <span className="line-clamp-2 text-wall-detail text-wall-ink">{n.headline}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
      <div className="mt-[34px] grid grid-cols-3 gap-x-[44px]">
        {NEWS_COLUMNS.map(({ section, label, none }) => (
          <section key={section} aria-label={label} className="flex min-w-0 flex-col">
            <span className="border-0 border-b border-solid border-wall-rule pb-[10px] text-wall-label font-bold tracking-[0.22em] text-wall-brass-ink">{label.toUpperCase()}</span>
            {page[section].length === 0 && <span className="mt-[16px] text-wall-detail text-wall-ink-2">{none}</span>}
            {page[section].map((n, i) => (
              <article key={`${n.headline}-${i}`} aria-label={n.headline} className={`flex flex-col pt-[16px] ${i ? 'mt-[16px] border-0 border-t border-solid border-wall-rule' : ''}`}>
                <span className="font-display text-wall-date font-medium">{n.headline}</span>
                {n.line && <span className="mt-[6px] text-wall-detail text-wall-ink-2">{n.line}</span>}
                <span className="mt-[6px] text-wall-label font-bold tracking-[0.08em] text-wall-brass-ink">
                  {[n.source, n.source_date ? new Date(`${n.source_date}T12:00:00Z`).toLocaleDateString('en-US', SHORT_DATE) : null].filter(Boolean).join(' · ').toUpperCase()}
                </span>
              </article>
            ))}
          </section>
        ))}
      </div>
    </ScrollPage>
  )
}

/** An outing's card: its QR for the phone (its page, or the place on Google Maps), Save, Not for us. */
function OutingCard({ o, answer, computer, onClose }: { o: Outing; answer?: ScoutPaper['answer']; computer: boolean; onClose: () => void }) {
  const saved = o.status === 'saved'
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-wall-ink/30" onClick={onClose}>
      <div role="dialog" aria-label={`${o.title} on your phone`} onClick={(e) => e.stopPropagation()} className="flex max-w-[860px] items-center gap-[28px] rounded-[24px] bg-wall-on-pigment px-[30px] py-[26px] text-wall-ink shadow-[0_8px_22px_rgba(38,34,29,0.18)]">
        <Qr text={outingLink(o)} label={`QR code: ${o.title}`} />
        <div className="flex min-w-0 flex-col gap-[10px]">
          <span className="text-wall-label font-bold tracking-[0.2em] text-wall-brass-ink">{(KIND_WORD[o.kind] ?? '').toUpperCase()} · ON YOUR PHONE</span>
          <span className="font-display text-wall-date font-bold leading-tight">{o.title}</span>
          <span className="text-wall-detail text-wall-ink-2">{outingMeta(o)}</span>
          {o.why && <span className="text-wall-detail text-wall-ink-2">{o.why}</span>}
          <span className="text-wall-detail text-wall-ink-2">{o.kind === 'restaurant' ? 'Point your phone’s camera here — Google Maps opens with it.' : 'Point your phone’s camera here — its page opens.'}</span>
          <div className="flex flex-wrap items-center gap-[12px]">
            {computer && <a href={outingLink(o)} target="_blank" rel="noreferrer" className="flex h-[52px] items-center rounded-full bg-wall-ink px-[22px] text-wall-detail font-semibold text-wall-on-pigment no-underline">Open its page</a>}
            {answer && <button type="button" aria-pressed={saved} onClick={() => { answer(o.id, saved ? 'new' : 'saved'); onClose() }} className="h-[52px] rounded-full border border-solid border-wall-ink-2 bg-wall-paper px-[22px] text-wall-detail font-semibold text-wall-ink">{saved ? 'Saved ✓' : 'Save'}</button>}
            {answer && <button type="button" onClick={() => { answer(o.id, 'not_for_us'); onClose() }} className="h-[52px] rounded-full border border-solid border-wall-rule bg-transparent px-[22px] text-wall-detail text-wall-ink-2">Not for us</button>}
            <button type="button" onClick={onClose} className="h-[52px] rounded-full border-0 bg-transparent px-[16px] text-wall-detail font-semibold text-wall-ink">Done</button>
          </div>
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
  const pageNow = useRef(0)
  useEffect(() => { pageNow.current = page }, [page])
  const [phone, setPhone] = useState<Outing | null>(null)
  const computer = useMemo(() => deviceKeyboardHere(), [])
  const turn = (step: 1 | -1) => setPage((p) => Math.min(pages - 1, Math.max(0, p + step)))
  // The front page's scroll (canvas 73A): how far it goes, and whether the cards are slim.
  const [slim, setSlim] = useState(false)
  const slimNow = useRef(false)
  const [max, setMax] = useState(0)
  const viewRef = useRef<HTMLDivElement | null>(null)
  const cardsRef = useRef<HTMLDivElement | null>(null)
  const cardHeights = useRef({ full: 0, slim: 0 })
  const { content: frontContent, handlers: frontHandlers, glideTo, at: scrolledTo } = useFrontScroll(max, (y) => {
    const s = y > PAPER_SLIM_AT
    if (s !== slimNow.current) { slimNow.current = s; setSlim(s) }
  })
  const { handlers, dragX } = useDragSide(turn, page, pages)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && pageNow.current === 0) glideTo(scrolledTo() + (e.key === 'ArrowDown' ? 280 : -280))
      if (e.key === 'ArrowRight') setPage((p) => Math.min(pages - 1, p + 1))
      if (e.key === 'ArrowLeft') setPage((p) => Math.max(0, p - 1))
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [pages, glideTo, scrolledTo])

  // This weekend's best for the two of them (Jake: "a highlight from the Out and about"); the writer's own pick without it.
  const weekend = scout ? weekendHighlight(scout.outings, { today: scout.today }) : null
  const feature = weekend
    ? { label: `${weekend.label} · for two`, title: weekend.outing.title, detail: [outingMeta(weekend.outing), weekend.outing.why].filter(Boolean).join(' — '), outing: weekend.outing }
    : brief.feature ? { ...brief.feature, outing: null } : null
  const both = Boolean(brief.forgot && feature)
  // How far the words scroll: measured, and again whenever they or the cards change size (a resize, the cards slimming).
  useLayoutEffect(() => {
    const measure = () => {
      const content = frontContent.current
      const view = viewRef.current
      if (!content || !view) return
      const cards = cardsRef.current?.offsetHeight ?? 0
      const h = cardHeights.current
      if (!slimNow.current) h.full = cards
      else h.slim = h.slim ? Math.min(h.slim, cards) : cards
      setMax(frontScrollMax({ content: content.offsetHeight, view: view.clientHeight, full: h.full || cards, slim: cards ? h.slim || Math.round((h.full || cards) * 0.62) : 0 }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    for (const el of [frontContent.current, viewRef.current, cardsRef.current]) if (el) ro.observe(el)
    return () => ro.disconnect()
  }, [words, brief, feature?.title]) // eslint-disable-line react-hooks/exhaustive-deps
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
          <section aria-label="The front page" aria-hidden={page !== 0} className={`relative h-full ${pages > 1 ? 'w-1/3' : 'w-full'}`}>
            {/* The words scroll (canvas 73A): moved by the wall, not the browser, so the Pi stays smooth. */}
            <div ref={viewRef} className="absolute inset-x-0 bottom-[112px] top-0 overflow-hidden" {...frontHandlers}>
              <div ref={frontContent} className="px-[72px] pb-[8px] pt-[48px] will-change-transform">
                <div className="flex items-center gap-[18px]">
                  <span aria-hidden="true" className="h-[2px] w-[40px] bg-wall-brass" />
                  <span className="text-wall-label font-bold tracking-[0.22em] text-wall-brass-ink">THE MORNING · {facts.day.replace(/, \d{4}$/, '').toUpperCase()}</span>
                </div>
                <h1 className="m-0 mt-[16px] font-display text-wall-headline font-medium text-wall-ink">
                  {words.headline}
                  {brief.turn && <> <i className="text-wall-brass-ink">{brief.turn}</i></>}
                </h1>
                {words.deck && <p className="m-0 mt-[16px] font-display text-wall-answer italic text-wall-ink-2">{words.deck}</p>}

                <div className="mt-[36px] grid grid-cols-4 gap-x-[36px]">
                  <Column label="Today · watch for" lines={brief.today} />
                  <Column label="This weekend" lines={brief.weekend} />
                  <Column label="Next month" lines={brief.month} />
                  <Column label="Way out" lines={brief.wayOut} />
                </div>
                {brief.aside && <p className="m-0 mt-[28px] font-display text-wall-date italic text-wall-ink-2">{brief.aside}</p>}
              </div>

              {/* The two cards stay at the foot; once the words move they slim to a line each, and open again at the top. */}
              {(brief.forgot || feature) && (
                <div ref={cardsRef} className="absolute inset-x-0 bottom-0 px-[72px]">
                  <div aria-hidden="true" className="h-[28px] bg-linear-to-b from-transparent to-wall-ground-calm" />
                  <div className={`grid gap-[28px] bg-wall-ground-calm pb-[12px] ${both ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {brief.forgot && (
                      <section aria-label="You may have forgotten" onClick={slim ? () => glideTo(0) : undefined}
                        className={`flex min-w-0 flex-col rounded-[18px] border-[1.5px] border-solid border-wall-brass bg-wall-brass/10 px-[26px] ${CARD_MOTION} ${slim ? 'py-[12px]' : 'py-[20px]'}`}>
                        <span className="text-wall-label font-bold tracking-[0.22em] text-wall-brass-ink">YOU MAY HAVE FORGOTTEN</span>
                        <span className={`mt-[8px] overflow-hidden font-display text-wall-date font-semibold ${CARD_MOTION} ${slim ? 'max-h-[34px]' : 'max-h-[68px]'}`}>{brief.forgot.title}</span>
                        <Folds open={!slim}><span className="mt-[8px] block text-wall-detail text-wall-ink-2">{brief.forgot.detail}</span></Folds>
                      </section>
                    )}
                    {feature && (
                      <section aria-label={feature.label} onClick={slim ? () => glideTo(0) : undefined}
                        className={`flex min-w-0 items-center gap-[20px] rounded-[18px] bg-wall-paper px-[26px] delay-[70ms] ${CARD_MOTION} ${slim ? 'py-[12px] shadow-[0_1px_0_rgba(38,34,29,0.06),0_3px_10px_rgba(38,34,29,0.10)]' : 'py-[20px] shadow-[0_1px_0_rgba(38,34,29,0.06),0_8px_22px_rgba(38,34,29,0.12)]'}`}>
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="text-wall-label font-bold tracking-[0.22em] text-wall-brass-ink">{feature.label.toUpperCase()}</span>
                          <span className={`mt-[8px] overflow-hidden font-display text-wall-date font-semibold delay-[70ms] ${CARD_MOTION} ${slim ? 'max-h-[34px]' : 'max-h-[68px]'}`}>{feature.title}</span>
                          <Folds open={!slim} late><span className="mt-[8px] block text-wall-detail text-wall-ink-2">{feature.detail}</span></Folds>
                        </div>
                        {feature.outing && <PhoneButton o={feature.outing} onPhone={openPhone} />}
                      </section>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>

          {scout && (
            <>
              <section aria-label="Out & about" aria-hidden={page !== 1} className="relative h-full w-1/3">
                <OutPage scout={scout} active={page === 1} now={now} onOpen={setPhone} />
              </section>
              <section aria-label="Around town" aria-hidden={page !== 2} className="relative h-full w-1/3">
                <TownPage news={scout.news} today={scout.today} active={page === 2} />
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
      {phone && <OutingCard o={phone} answer={scout?.answer} computer={computer} onClose={() => setPhone(null)} />}
    </article>
  )
}
