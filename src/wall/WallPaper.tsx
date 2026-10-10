import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Bookmark, Flame, Gem, Heart, House, Mic, QrCode, Repeat, RotateCw, Ticket, Users } from 'lucide-react'
import { frontScrollMax, PAPER_SLIM_AT, type BriefLine, type PaperBrief, type PaperFacts, type PaperWords } from './paper'
import { RailClock, RailRule, RailShell } from './WallRail'
import { Qr } from './WallDirections'
import { useDragSide } from './useSwipeDown'
import { addArgs, eveningLine, goingFor, leaveBy, ticketsDue, type OutingDetails } from './outingCard'
import { pigmentStyleFor } from './lanes'
import { pigmentIndexes } from './score'
import type { WallEvent, WallMember } from './engine/types'
import { useFrontScroll } from './useFrontScroll'
import { deviceKeyboardHere } from './keyboardMode'
import type { ScoutPaper } from './useScout'
import { townOf, type GuideLabel, type GuidePlace } from '../../supabase/functions/_shared/guide.mjs'
import { LIST_TAGS, laterLine, placeItem, yourList, type ListItem, type ListTag } from '../../supabase/functions/_shared/your-list.mjs'
import { outingLink, outingWhen, townNewsPage, weekendHighlight, type Outing, type TownNews } from '../../supabase/functions/_shared/scout.mjs'

export interface WallPaperProps {
  now: Date
  facts: PaperFacts
  words: PaperWords
  /** The brief beyond the three lines: the server's, or plain ones from the facts until it arrives. */
  brief: PaperBrief
  /** The left panel under the clock: today's panel, quiet — when to leave and with whom, nothing else (canvas 79S). */
  today?: ReactNode
  /** The counts at the foot of the left panel. */
  counts?: ReactNode
  /** Out & about and Around town (canvas 72): with none, the paper is the front page alone. */
  scout?: ScoutPaper | null
  /** For an outing's Add to calendar (canvas 77): who could go, what's already on, and the wall's own add. */
  members?: WallMember[]
  events?: WallEvent[]
  onAdd?: (args: Record<string, unknown>) => Promise<void>
  onPutAway: () => void
  onAsk?: (say: string) => void
  /** The front page's refresh (Jake, Oct 10: "subtle, just a refresh icon"): today's paper written again. */
  onRefresh?: () => Promise<void>
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

const dayShort = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
const timeOf = (when: string | null) => (when && when.length > 10 ? outingWhen({ when, recurring: null })?.split(' · ')[1] ?? null : null)

// The labels the guide's picks earn (canvas 85B; guide.mjs): each its icon and word — color is never the only signal.
const TAGS: Record<GuideLabel, { word: string; Icon: typeof Flame }> = {
  local: { word: 'Locals’ favorite', Icon: House },
  hot: { word: 'Hot right now', Icon: Flame },
  gem: { word: 'Hidden gem', Icon: Gem },
  big: { word: 'Big night', Icon: Ticket },
}
function Section({ label, count, children }: { label: string; count?: number; children: ReactNode }) {
  return (
    <section aria-label={label} className="mt-[34px] flex flex-col">
      <span className="text-wall-label font-bold tracking-[0.22em] text-wall-brass-ink">{label.toUpperCase()}{count ? ` · ${count}` : ''}</span>
      {children}
    </section>
  )
}

// Out & about from your list (canvas 86C; Jake, Oct 9: "the list will be significantly slimmed down to stuff I purposely
// add"): why each one is here, in their words — its icon and word, never color alone.
const LIST_TAG: Record<ListTag, { word: string; Icon: typeof Flame; tone: 'ink' | 'rust' | 'brass' }> = {
  try: { word: LIST_TAGS.try, Icon: Bookmark, tone: 'ink' },
  spot: { word: LIST_TAGS.spot, Icon: Heart, tone: 'ink' },
  asked: { word: LIST_TAGS.asked, Icon: Mic, tone: 'ink' },
  again: { word: LIST_TAGS.again, Icon: Repeat, tone: 'brass' },
  family: { word: LIST_TAGS.family, Icon: Users, tone: 'ink' },
  kelly: { word: LIST_TAGS.kelly, Icon: Heart, tone: 'ink' },
  jake: { word: LIST_TAGS.jake, Icon: Heart, tone: 'ink' },
  local: { word: TAGS.local.word, Icon: House, tone: 'ink' },
  hot: { word: TAGS.hot.word, Icon: Flame, tone: 'rust' },
  gem: { word: TAGS.gem.word, Icon: Gem, tone: 'ink' },
  big: { word: TAGS.big.word, Icon: Ticket, tone: 'ink' },
}
/** On a highlight card: a small filled pill. */
function ListPill({ tag }: { tag: ListTag }) {
  const t = LIST_TAG[tag]
  if (!t) return null
  return (
    <span className={`inline-flex h-[30px] shrink-0 items-center gap-[7px] whitespace-nowrap rounded-full px-[12px] font-body text-wall-label font-bold ${t.tone === 'rust' ? 'bg-wall-rust text-wall-on-pigment' : t.tone === 'brass' ? 'bg-wall-brass text-wall-ink' : 'bg-wall-ink text-wall-on-pigment'}`}>
      <t.Icon aria-hidden="true" className="h-[15px] w-[15px]" strokeWidth={2.2} />{t.word}
    </span>
  )
}
/** In the newspaper columns: the icon and the word, in small capitals. */
function ListWord({ tag }: { tag: ListTag }) {
  const t = LIST_TAG[tag]
  if (!t) return null
  return (
    <span className={`inline-flex items-center gap-[6px] whitespace-nowrap text-wall-label font-bold tracking-[0.12em] ${t.tone === 'rust' ? 'text-wall-rust' : t.tone === 'brass' ? 'text-wall-brass-ink' : 'text-wall-ink'}`}>
      <t.Icon aria-hidden="true" className="h-[14px] w-[14px]" strokeWidth={2.3} />{t.word.toUpperCase()}
    </span>
  )
}
const eyebrow = (it: ListItem) => [it.is, it.when].filter(Boolean).join(' · ').toUpperCase()

/** One of the four on top: a card (Jake: "i did like the card format for the 3/4 highlight items"). */
function Highlight({ it, onOpen }: { it: ListItem; onOpen: (it: ListItem) => void }) {
  return (
    <button type="button" aria-label={it.title} onClick={() => onOpen(it)} className="flex min-w-0 flex-col gap-[10px] rounded-[22px] border-0 bg-wall-paper px-[26px] pb-[24px] pt-[22px] text-left font-body text-wall-ink">
      {it.tags.length > 0 && <span className="flex flex-wrap gap-[6px]">{it.tags.map((t) => <ListPill key={t} tag={t} />)}</span>}
      <span className="text-wall-label font-bold tracking-[0.14em] text-wall-brass-ink">{eyebrow(it)}</span>
      <span className="line-clamp-2 font-display text-wall-date font-semibold">{it.title}</span>
      {it.where && <span className="-mt-[4px] truncate text-wall-detail text-wall-ink-2">{it.where}</span>}
      {it.heard && <span className="line-clamp-3 border-0 border-t border-solid border-wall-rule pt-[10px] text-wall-detail">{it.heard}</span>}
      {it.why && <span className="line-clamp-2 font-display text-wall-detail italic">{it.why}</span>}
    </button>
  )
}

/** One in the columns below: no box (Jake: "can these not be cards … feels more newspaper like?"). */
function Story({ it, onOpen }: { it: ListItem; onOpen: (it: ListItem) => void }) {
  return (
    <button type="button" aria-label={it.title} onClick={() => onOpen(it)}
      className="flex min-w-0 flex-col gap-[6px] border-0 bg-transparent p-0 text-left font-body text-wall-ink">
      {it.tags.length > 0 && <span className="flex flex-wrap gap-x-[14px] gap-y-[4px]">{it.tags.map((t) => <ListWord key={t} tag={t} />)}</span>}
      <span className="text-wall-label font-bold tracking-[0.14em] text-wall-brass-ink">{eyebrow(it)}</span>
      <span className="line-clamp-2 font-display text-wall-heading font-semibold">{it.title}</span>
      {it.where && <span className="truncate text-wall-detail text-wall-ink-2">{it.where}</span>}
      {it.heard && <span className="line-clamp-3 text-wall-detail">{it.heard}</span>}
      {it.why && <span className="line-clamp-2 font-display text-wall-detail italic">{it.why}</span>}
    </button>
  )
}

/** Four across, spaced like the front page's columns — no rules (Jake, Oct 10: "the same format as the front page"). */
function Columns({ items, onOpen }: { items: ListItem[]; onOpen: (it: ListItem) => void }) {
  return (
    <div className="grid grid-cols-4 gap-x-[36px] gap-y-[30px]">
      {items.map((it) => <Story key={it.key} it={it} onOpen={onOpen} />)}
    </div>
  )
}

/**
 * Page 2, Out & about from your list (canvas 86C; Jake, Oct 9: "ok lets build this"): four highlights — the soonest
 * night they asked for or would do again, the newest place to try, the next "again", one surprise — then twelve in
 * newspaper columns, soonest first; Add one and Saved for later at the foot.
 */
function OutPage({ scout, active, now, onOpen, onOpenPlace, onAsk }: { scout: ScoutPaper; active: boolean; now: Date; onOpen: (o: Outing) => void; onOpenPlace: (p: GuidePlace) => void; onAsk?: (say: string) => void }) {
  const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const page = useMemo(() => yourList({ places: scout.guide ?? [], outings: scout.outings, watches: scout.watches ?? [], today: scout.today, nowTime, calendar: scout.calendar ?? {} }),
    [scout.guide, scout.outings, scout.watches, scout.today, scout.calendar, nowTime])
  const [allLater, setAllLater] = useState(false)
  const open = (it: ListItem) => { if (it.place) onOpenPlace(it.place); else if (it.outing) onOpen(it.outing) }
  const later = laterLine(page.later)
  const counted = `${page.counts.places} ${page.counts.places === 1 ? 'place' : 'places'} on your list · ${page.counts.onCalendar ? `${page.counts.onCalendar} on the calendar` : 'none on the calendar yet'}`
  return (
    <ScrollPage active={active}>
      <PageHead kicker="Out & about · from your list" title={page.highlights.length ? 'A few worth getting out for.' : 'Your list is empty so far.'}
        deck={page.highlights.length ? 'What you saved, what you loved and want again — and one surprise. Tap any for more.' : 'Share a place from any app, or tell Alexa “we want to try…” — it starts here.'} />
      {page.highlights.length > 0 && (
        <div className="mt-[30px] grid grid-cols-4 gap-[18px]">{page.highlights.map((it) => <Highlight key={it.key} it={it} onOpen={open} />)}</div>
      )}
      {page.more.length > 0 && (
        <section aria-label="Coming up" className="mt-[40px] flex flex-col">
          <span className="flex items-baseline gap-[18px]">
            <span className="text-wall-label font-bold tracking-[0.22em] text-wall-brass-ink">{`COMING UP · ${page.more.length} MORE`}</span>
            <span className="text-wall-detail text-wall-ink-2">soonest first — your places, what you asked about, and the nights you’d do again</span>
          </span>
          <div className="mt-[14px]"><Columns items={page.more} onOpen={open} /></div>
          {allLater && page.later.length > 0 && <div className="mt-[30px]"><Columns items={page.later} onOpen={open} /></div>}
        </section>
      )}
      <div className="mt-[40px] grid grid-cols-2 gap-x-[36px]">
        <div className="flex flex-col gap-[6px]">
          <span className="text-wall-label font-bold tracking-[0.14em] text-wall-brass-ink">ADD ONE</span>
          <span className="font-display text-wall-heading font-semibold">Somewhere you want to go?</span>
          <span className="text-wall-detail">Share it from any app, or tell Alexa “we want to try…”.</span>
          <span className="text-wall-detail text-wall-ink-2">{counted}.</span>
          {onAsk && <button type="button" onClick={() => onAsk('We want to try ')} className="h-[44px] self-start border-0 bg-transparent p-0 font-body text-wall-detail font-bold text-wall-ink">+ Tell Alexa</button>}
        </div>
        {later && (
          <div className="flex flex-col gap-[6px]">
            <span className="text-wall-label font-bold tracking-[0.14em] text-wall-brass-ink">SAVED FOR LATER · {page.counts.later}</span>
            <span className="font-display text-wall-heading font-semibold">More when the week fits</span>
            <span className="line-clamp-2 text-wall-detail">{later}.</span>
            <button type="button" onClick={() => setAllLater(!allLater)} className="h-[44px] self-start border-0 bg-transparent p-0 font-body text-wall-detail font-bold text-wall-ink">{allLater ? 'Fewer ›' : 'See them ›'}</button>
          </div>
        )}
      </div>
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
 * schools, the city and the papers — the fullest first, across the page — each line with where it's from, scrolling
 * when there's a lot.
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
      {/* The fullest first, its stories across four columns (Jake, Oct 10: "sort it by largest list first and go across
          with the items … so its filled, vs one long column"); one with nothing yet says so at the foot. */}
      {[...NEWS_COLUMNS].sort((x, y) => page[y.section].length - page[x.section].length).map(({ section, label, none }) => (
        <section key={section} aria-label={label} className="mt-[34px] flex flex-col border-0 border-t-2 border-solid border-wall-ink pt-[14px]">
          <span className="text-wall-label font-bold tracking-[0.22em] text-wall-brass-ink">{label.toUpperCase()}{page[section].length ? ` · ${page[section].length}` : ''}</span>
          {page[section].length === 0 && <span className="mt-[16px] text-wall-detail text-wall-ink-2">{none}</span>}
          {page[section].length > 0 && (
            <div className="mt-[16px] grid grid-cols-4 gap-x-[36px] gap-y-[24px]">
              {page[section].map((n, i) => (
                <article key={`${n.headline}-${i}`} aria-label={n.headline} className="flex min-w-0 flex-col">
                  <span className="font-display text-wall-heading font-semibold">{n.headline}</span>
                  {n.line && <span className="mt-[4px] text-wall-detail text-wall-ink-2">{n.line}</span>}
                  <span className="mt-[6px] text-wall-label font-bold tracking-[0.08em] text-wall-brass-ink">
                    {[n.source, n.source_date ? new Date(`${n.source_date}T12:00:00Z`).toLocaleDateString('en-US', SHORT_DATE) : null].filter(Boolean).join(' · ').toUpperCase()}
                  </span>
                </article>
              ))}
            </div>
          )}
        </section>
      ))}
    </ScrollPage>
  )
}

/** "6–8:30 PM", "11 AM–3 PM", or just its start; null without a time. */
function rangeOf(when: string | null, ends: string | null): string | null {
  const m = /(\d{2}):(\d{2})$/.exec(when && when.length > 10 ? when : '')
  if (!m) return null
  const part = (h: number, min: number) => ({ t: `${h % 12 || 12}${min ? `:${String(min).padStart(2, '0')}` : ''}`, pm: h >= 12 })
  const a = part(Number(m[1]), Number(m[2]))
  const e = /^(\d{2}):(\d{2})$/.exec(ends ?? '')
  if (!e) return `${a.t} ${a.pm ? 'PM' : 'AM'}`
  const b = part(Number(e[1]), Number(e[2]))
  return a.pm === b.pm ? `${a.t}–${b.t} ${b.pm ? 'PM' : 'AM'}` : `${a.t} ${a.pm ? 'PM' : 'AM'}–${b.t} ${b.pm ? 'PM' : 'AM'}`
}

const KIND_LONG: Record<string, string> = { couple: 'For two', family: 'For the family', fitness: 'Get moving', music: 'Live music', comedy: 'Comedy', trivia: 'Trivia night', restaurant: 'A place to try' }
const readDay = (iso: string | null | undefined, today: string) => {
  if (!iso) return ''
  const ymd = new Date(iso).toLocaleDateString('en-CA')
  return ymd === today ? 'today' : new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * An outing's card (canvas 77; Jake, Oct 8: "for the events can i get the option to scan a qr code, or add some kind of
 * action (tell me more, gets the details online and display it?) … what would a pro UX person suggest" → "build it"):
 * when and where, why it was picked, what to know — read from its own page as the card opens (once, kept), what its page
 * doesn't say said so — and the QR for its tickets or page. Add to calendar (who's going, when, leave by, that evening, a
 * reminder to get tickets), Send to our phones, Save, Ask Alexa, Not for us.
 */
type Alike = Awaited<ReturnType<NonNullable<ScoutPaper['like']>>>
const MONTH_DAY = { month: 'short', day: 'numeric' } as const
const BUZZ_FROM: Record<string, string> = { reddit: 'Reddit', press: 'The local press', shared: 'In your words' }

/** A fact in two columns: the small-capital word, then what it is. */
function Fact({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex gap-[18px] border-0 border-t border-solid border-wall-rule py-[10px]">
      <span className="w-[150px] shrink-0 text-wall-label font-bold tracking-[0.12em] text-wall-ink-2">{k}</span>
      <span className="min-w-0 text-wall-detail text-wall-ink">{children}</span>
    </div>
  )
}

/**
 * A place, tapped (canvas 86E; Jake, Oct 9 — "allow me to click and see more details"): why it's here, what people say
 * (each with where it was said), the two of them and the place (on the list since, the calendar), the details; Plan a
 * night, More like this (canvas 86F: the same scene near home — Add to the list or Not for us), To our phones, We went,
 * Not for us. The QR opens it on Maps.
 */
function GuideNote({ p, scout, onAsk, onClose }: { p: GuidePlace; scout: ScoutPaper; onAsk?: (say: string) => void; onClose: () => void }) {
  const [said, setSaid] = useState<string | null>(null)
  const [alike, setAlike] = useState<Alike | 'looking' | 'none' | null>(null)
  const [added, setAdded] = useState<Record<string, 'added' | 'no'>>({})
  const mine = p.status === 'saved' || p.status === 'spot'
  const it = placeItem(p, { today: scout.today, calendar: scout.calendar ?? {}, surprise: !mine })
  const town = townOf(p.address)
  const sub = [p.shelf_label, town].filter(Boolean).join(' · ')
  const hit = scout.calendar?.[p.id]
  const link = p.maps_url ?? p.website
  const sayings = p.buzz.filter((b) => b.said)
  const since = p.saved_at ? new Date(p.saved_at).toLocaleDateString('en-US', MONTH_DAY) : null
  const how = p.origin === 'alexa' ? 'you told Alexa' : p.origin === 'shared' ? 'you shared it' : p.origin === 'asked' ? 'you asked about it' : p.origin === 'taste' ? 'from Your taste' : p.origin === 'like' ? 'found with More like this' : p.origin === 'guide' ? 'one of the guide’s picks you saved' : null
  const pill = 'h-[56px] rounded-full px-[26px] text-wall-body font-semibold'
  const send = async () => {
    try { await scout.sendPlace?.(p); setSaid('Sent to the phones') } catch { setSaid('The phones didn’t take it. Try again.') }
  }
  const findAlike = async () => {
    if (!scout.like) return
    setAlike('looking')
    try { const r = await scout.like(p.id); setAlike(r.places.length ? r : 'none') } catch { setAlike('none') }
  }
  const add = async (x: Alike['places'][number]) => {
    setAdded((a) => ({ ...a, [x.google_place_id]: 'added' }))
    try { await scout.addPlace?.({ google_place_id: x.google_place_id, name: x.name, whose: p.whose, like_of: p.id, said: x.what }) } catch { setAdded((a) => Object.fromEntries(Object.entries(a).filter(([k]) => k !== x.google_place_id))) }
  }
  return (
    <div className="absolute inset-0 z-20 bg-wall-ink/30" onClick={onClose}>
      <div role="dialog" aria-label={`${p.name}, up close`} onClick={(e) => e.stopPropagation()}
        className="absolute bottom-[48px] left-[80px] right-[80px] top-[48px] flex flex-col rounded-[28px] bg-wall-ground-calm px-[52px] pb-[36px] pt-[40px] font-body text-wall-ink shadow-[0_30px_70px_rgba(38,34,29,0.35)]">
        <div className="flex items-start gap-[24px]">
          <div className="flex min-w-0 flex-1 flex-col gap-[12px]">
            {alike && alike !== 'none'
              ? <span className="flex items-center gap-[10px] text-wall-label font-bold tracking-[0.18em] text-wall-brass-ink"><Repeat aria-hidden="true" className="h-[18px] w-[18px]" />MORE LIKE {p.name.toUpperCase()}</span>
              : it.tags.length > 0 && <span className="flex flex-wrap gap-[8px]">{it.tags.map((t) => <ListPill key={t} tag={t} />)}</span>}
            <span className="font-display text-wall-headline font-semibold leading-none">{alike && alike !== 'none' && alike !== 'looking' ? (alike.known_for ? `Same scene: ${alike.known_for.replace(/\.$/, '').toLowerCase()}.` : 'The same kind of place.') : p.name}</span>
            {(!alike || alike === 'none') && sub && <span className="text-wall-body text-wall-ink-2">{sub}</span>}
            {alike && alike !== 'none' && alike !== 'looking' && <span className="text-wall-body text-wall-ink-2">Found from local guides and the places’ own pages. Add the ones you want — they join your list{p.whose && p.whose !== 'us' ? ` as ${LIST_TAG[p.whose as ListTag]?.word ?? 'theirs'}` : ''}.</span>}
          </div>
          {link && (!alike || alike === 'none') && <div className="shrink-0"><Qr text={link} label={`QR code: ${p.name} on Google Maps`} small /></div>}
          <button type="button" aria-label="Close" onClick={onClose} className="flex h-[56px] w-[56px] shrink-0 items-center justify-center border-0 bg-transparent p-0 text-wall-quote text-wall-ink-2">×</button>
        </div>

        {alike === 'looking' && <span role="status" className="mt-[28px] text-wall-body text-wall-ink-2">Looking for places with the same scene…</span>}
        {alike && alike !== 'none' && alike !== 'looking' ? (
          <div className="mt-[20px] flex min-h-0 flex-1 flex-col overflow-y-auto">
            {alike.places.map((x) => (
              <div key={x.google_place_id} className="flex items-center gap-[28px] border-0 border-t border-solid border-wall-rule py-[18px]">
                <div className="flex min-w-0 flex-1 flex-col gap-[4px]">
                  <span className="font-display text-wall-date font-semibold">{x.name}</span>
                  <span className="text-wall-detail text-wall-ink-2">{[x.town, x.drive_min ? `${x.drive_min} min` : null, x.rating ? `${x.rating} on Google` : null].filter(Boolean).join(' · ')}</span>
                  {x.what && <span className="text-wall-body">{x.what}</span>}
                  {x.alike && <span className="flex items-center gap-[8px] font-display text-wall-detail italic text-wall-brass-ink"><Repeat aria-hidden="true" className="h-[16px] w-[16px]" />{x.alike}</span>}
                  {x.source && <span className="text-wall-label font-bold text-wall-brass-ink">{x.source}</span>}
                </div>
                {added[x.google_place_id] === 'added' ? <span role="status" className="text-wall-body font-semibold text-wall-brass-ink">On your list ✓</span>
                  : added[x.google_place_id] === 'no' ? <span className="text-wall-body text-wall-ink-2">Not for us</span>
                  : (
                    <div className="flex shrink-0 flex-col items-stretch gap-[8px]">
                      {scout.addPlace && <button type="button" onClick={() => void add(x)} className={`${pill} border-0 bg-wall-ink text-wall-on-pigment`}>+ Add to the list</button>}
                      <button type="button" onClick={() => setAdded((a) => ({ ...a, [x.google_place_id]: 'no' }))} className="h-[44px] border-0 bg-transparent p-0 text-wall-detail font-semibold text-wall-ink-2">Not for us</button>
                    </div>
                  )}
              </div>
            ))}
          </div>
        ) : alike !== 'looking' && (
          <div className="mt-[26px] grid min-h-0 flex-1 grid-cols-[1.1fr_1fr] gap-[56px] overflow-y-auto">
            <div className="flex flex-col">
              <span className="text-wall-label font-bold tracking-[0.18em] text-wall-brass-ink">WHAT PEOPLE SAY</span>
              {sayings.length === 0 && <span className="mt-[10px] text-wall-detail text-wall-ink-2">{p.heard ?? 'Nothing heard about it yet.'}</span>}
              {sayings.slice(0, 3).map((b, i) => (
                <div key={i} className="flex flex-col gap-[4px] border-0 border-t border-solid border-wall-rule py-[12px]">
                  <span className="text-wall-body">{b.kind === 'shared' ? `“${String(b.said).replace(/\.$/, '')}”` : b.said}</span>
                  <span className="text-wall-label font-bold text-wall-brass-ink">{BUZZ_FROM[b.kind] ?? 'The web'}</span>
                </div>
              ))}
              <span className="mt-[22px] text-wall-label font-bold tracking-[0.18em] text-wall-brass-ink">YOU TWO AND {p.name.toUpperCase()}</span>
              <Fact k={mine ? (p.status === 'spot' ? 'YOUR SPOT' : 'ON YOUR LIST') : 'NOT ON YOUR LIST'}>{mine ? [since ? `Since ${since}` : null, how].filter(Boolean).join(' — ') || 'On your list' : 'One of the guide’s picks — save it to put it on your list'}</Fact>
              {p.whose && p.whose !== 'us' && <Fact k="WHOSE">{LIST_TAG[p.whose as ListTag]?.word}</Fact>}
              {p.note && <Fact k="WHY">{p.note}</Fact>}
              <Fact k="THE CALENDAR">{hit?.next ? `On it ${new Date(`${hit.next}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', ...MONTH_DAY })}` : hit?.last ? `Last there ${new Date(`${hit.last}T12:00:00`).toLocaleDateString('en-US', MONTH_DAY)}` : 'Not on the calendar yet'}</Fact>
            </div>
            <div className="flex flex-col">
              <span className="text-wall-label font-bold tracking-[0.18em] text-wall-brass-ink">THE DETAILS</span>
              {p.address && <Fact k="WHERE">{p.address.replace(/, USA$/, '')}{p.drive_min ? ` · ${p.drive_min} min` : ''}</Fact>}
              {p.rating && <Fact k="GOOGLE">{p.rating}{p.rating_count ? ` from ${p.rating_count.toLocaleString('en-US')} reviews` : ''}</Fact>}
              {p.website && <Fact k="WEBSITE">{p.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</Fact>}
              {p.why && <Fact k="WHY YOU TWO"><span className="font-display italic">{p.why}</span></Fact>}
            </div>
          </div>
        )}
        {alike === 'none' && <span role="status" className="mt-[10px] text-wall-detail text-wall-ink-2">Nothing close enough with the same scene turned up.</span>}

        <div className="mt-[22px] flex shrink-0 flex-wrap items-center gap-[12px]">
          {onAsk && (!alike || alike === 'none') && <button type="button" onClick={() => { onClose(); onAsk(`Help us plan a night at ${p.name}${town ? ` in ${town}` : ''}`) }} className={`${pill} border-0 bg-wall-ink text-wall-on-pigment`}>Plan a night</button>}
          {scout.like && (!alike || alike === 'none') && <button type="button" onClick={() => void findAlike()} className={`${pill} flex items-center gap-[10px] border-2 border-solid border-wall-brass-ink bg-transparent text-wall-brass-ink`}><Repeat aria-hidden="true" className="h-[20px] w-[20px]" />More like this</button>}
          {alike && alike !== 'none' && alike !== 'looking' && <button type="button" onClick={() => setAlike(null)} className={`${pill} border border-solid border-wall-rule bg-wall-paper text-wall-ink`}>Back to {p.name}</button>}
          {(!alike || alike === 'none') && (
            <>
              {scout.sendPlace && <button type="button" onClick={() => void send()} className={`${pill} border border-solid border-wall-rule bg-wall-paper text-wall-ink`}>To our phones</button>}
              {scout.answerPlace && !mine && <button type="button" onClick={() => { scout.answerPlace!(p.id, 'saved'); onClose() }} className={`${pill} border border-solid border-wall-rule bg-wall-paper text-wall-ink`}>Save it</button>}
              {scout.answerPlace && mine && <button type="button" onClick={() => { scout.answerPlace!(p.id, 'been'); onClose() }} className={`${pill} border border-solid border-wall-rule bg-wall-paper text-wall-ink`}>We went</button>}
            </>
          )}
          {said && <span role="status" className="text-wall-detail font-semibold text-wall-brass-ink">{said}</span>}
          <span className="flex-1" />
          {scout.answerPlace && (!alike || alike === 'none') && <button type="button" onClick={() => { scout.answerPlace!(p.id, 'not_for_us'); onClose() }} className="h-[56px] border-0 bg-transparent px-[8px] text-wall-body font-semibold text-wall-ink-2">Not for us</button>}
        </div>
      </div>
    </div>
  )
}

function OutingCard({ o, scout, members, events, computer, onAdd, onAsk, onClose }: {
  o: Outing; scout: ScoutPaper; members: WallMember[]; events: WallEvent[]; computer: boolean
  onAdd?: (args: Record<string, unknown>) => Promise<void>; onAsk?: (say: string) => void; onClose: () => void
}) {
  const [mode, setMode] = useState<'card' | 'add'>('card')
  const [going, setGoing] = useState<string[]>(() => goingFor(o.kind, members))
  const [details, setDetails] = useState<OutingDetails | null | 'reading' | 'unread'>(scout.details && o.url ? 'reading' : 'unread')
  const [remind, setRemind] = useState(true)
  const [said, setSaid] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!scout.details || !o.url) return
    let live = true
    scout.details(o.id).then((d) => { if (live) setDetails(d ?? 'unread') }).catch(() => { if (live) setDetails('unread') })
    return () => { live = false }
  }, [o.id, o.url, scout])
  const read = typeof details === 'object' ? details : null
  const saved = o.status === 'saved'
  const day = o.when ? dayShort(o.when.slice(0, 10)) : null
  const time = timeOf(o.when)
  const span = rangeOf(o.when, read?.ends ?? null)
  const kicker = [KIND_LONG[o.kind], day, span ?? o.recurring].filter(Boolean).join(' · ')
  const evening = Number(o.when?.slice(11, 13) ?? 18) >= 17
  const where = [o.place !== o.title ? o.place : null, o.address, o.drive_min ? `about ${o.drive_min} min` : null].filter(Boolean).join(' · ')
  const link = read?.ticket_url ?? outingLink(o)
  const tickets = ticketsDue(o, read, scout.today)
  const leave = leaveBy(o)
  const dated = Boolean(o.when)
  const pill = 'h-[56px] rounded-full px-[26px] text-wall-body font-semibold'

  const add = async () => {
    if (!onAdd) return
    setBusy(true)
    try {
      await onAdd(addArgs(o, read, going, members))
      if (tickets && remind) {
        const [y, m, d] = tickets.due.split('-').map(Number)
        const at = new Date(y, m - 1, d, 9, 0)
        await onAdd({ title: `Get tickets: ${o.title}`, start: at.toISOString(), end: new Date(at.getTime() + 15 * 60_000).toISOString(), event_type: 'reminder', ...(read?.ticket_url ? { notes: `Tickets: ${read.ticket_url}` } : {}) })
      }
      if (o.status !== 'saved') scout.answer?.(o.id, 'saved')
      setSaid(`On the calendar — ${day}${time ? `, ${time}` : ''}`)
      window.setTimeout(onClose, 1800)
    } catch (e) {
      setSaid(e instanceof Error ? e.message : 'That didn’t save. Try again.')
    }
    setBusy(false)
  }
  const send = async () => {
    try { await scout.send?.(o); setSaid('Sent to the phones') } catch { setSaid('The phones didn’t take it. Try again.') }
  }

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-wall-ink/30 pl-[560px]" onClick={onClose}>
      <div role="dialog" aria-label={`${o.title} on your phone`} onClick={(e) => e.stopPropagation()} className="flex max-h-[1000px] w-[1240px] flex-col gap-[16px] rounded-[28px] bg-wall-ground-calm px-[48px] py-[40px] text-wall-ink shadow-[0_18px_48px_rgba(38,34,29,0.35)]">
        <div className="flex items-start justify-between gap-[24px]">
          <div className="flex min-w-0 flex-col gap-[8px]">
            <span className="text-wall-label font-bold tracking-[0.2em] text-wall-brass-ink">{kicker.toUpperCase()}</span>
            <span className="font-display text-wall-title font-semibold leading-[1.02]">{o.title}</span>
            {where && <span className="text-wall-body text-wall-ink-2">{where}</span>}
            {o.why && <span className="font-display text-wall-answer italic">“{o.why}”</span>}
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="flex h-[48px] w-[48px] shrink-0 items-center justify-center border-0 bg-transparent p-0 text-wall-date text-wall-ink-2">×</button>
        </div>
        {mode === 'card' ? (
          <>
            <div className="grid grid-cols-[1fr_250px] gap-[40px]">
              <div className="flex min-w-0 flex-col">
                <span className="mb-[6px] text-wall-label font-bold tracking-[0.2em] text-wall-ink-2">WHAT TO KNOW{read?.read_at ? ` · READ FROM ITS PAGE ${readDay(read.read_at, scout.today).toUpperCase()}` : ''}</span>
                {details === 'reading' && <span className="border-0 border-t border-solid border-wall-rule py-[10px] text-wall-body text-wall-ink-2">Reading its page…</span>}
                {details === 'unread' && <span className="border-0 border-t border-solid border-wall-rule py-[10px] text-wall-body text-wall-ink-2">Couldn’t read its page — the QR opens it on your phone.</span>}
                {read?.facts.map((f) => (
                  <div key={f.label} className="grid grid-cols-[200px_1fr] gap-[16px] border-0 border-t border-solid border-wall-rule py-[10px]">
                    <span className="pt-[3px] text-wall-label font-bold tracking-[0.16em] text-wall-brass-ink">{f.label.toUpperCase()}</span>
                    <span className="text-wall-body">{f.text}</span>
                  </div>
                ))}
                {read && (read.not_said?.length ?? 0) > 0 && (
                  <div className="grid grid-cols-[200px_1fr] items-center gap-[16px] border-0 border-t border-solid border-wall-rule py-[6px]">
                    <span className="text-wall-label font-bold tracking-[0.16em] text-wall-brass-ink">NOT ON ITS PAGE</span>
                    <span className="flex items-center gap-[10px] text-wall-body">
                      {read.not_said!.join(', ')}
                      {onAsk && <button type="button" onClick={() => { onClose(); onAsk(`${o.title}: ${read.not_said!.map((l) => (l === 'For kids' ? 'is it good for kids' : l === 'Parking' ? 'where do we park' : `what about ${l.toLowerCase()}`)).join(', and ')}?`) }} className="h-[44px] border-0 bg-transparent px-[4px] text-wall-body text-wall-ink underline underline-offset-[5px]">ask Alexa</button>}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex flex-col items-center gap-[10px]">
                <Qr text={link} label={`QR code: ${o.title}`} />
                <span className="text-center text-wall-detail text-wall-ink-2">{read?.ticket_url ? 'Tickets on your phone — point the camera here' : o.kind === 'restaurant' ? 'Google Maps on your phone — point the camera here' : 'Its page on your phone — point the camera here'}</span>
              </div>
            </div>
            <div className="mt-[6px] flex flex-wrap items-center gap-[14px]">
              {dated && onAdd && <button type="button" onClick={() => setMode('add')} className={`${pill} border-0 bg-wall-ink text-wall-on-pigment`}>Add to calendar</button>}
              {computer && <a href={link} target="_blank" rel="noreferrer" className={`${pill} flex items-center border border-solid border-wall-rule bg-wall-paper text-wall-ink no-underline`}>Open its page</a>}
              {scout.send && <button type="button" onClick={() => void send()} className={`${pill} border border-solid border-wall-rule bg-wall-paper text-wall-ink`}>Send to our phones</button>}
              {scout.answer && <button type="button" aria-pressed={saved} onClick={() => { scout.answer!(o.id, saved ? 'new' : 'saved'); onClose() }} className={`${pill} border border-solid border-wall-rule bg-wall-paper text-wall-ink`}>{saved ? 'Saved ✓' : 'Save'}</button>}
              {onAsk && <button type="button" onClick={() => { onClose(); onAsk(`Tell me more about ${o.title}${day ? ` on ${day}` : ''}`) }} className={`${pill} border border-solid border-wall-rule bg-wall-paper text-wall-ink`}>Ask Alexa</button>}
              {said && <span role="status" className="text-wall-body font-semibold text-wall-brass-ink">{said}</span>}
              {scout.answer && <button type="button" onClick={() => { scout.answer!(o.id, 'not_for_us'); onClose() }} className={`${pill} ml-auto border border-solid border-wall-rule bg-transparent text-wall-ink-2`}>Not for us</button>}
            </div>
          </>
        ) : (
          <>
            <span className="mt-[6px] text-wall-label font-bold tracking-[0.2em] text-wall-ink-2">ADD TO THE CALENDAR</span>
            <div className="flex flex-wrap gap-[12px]">
              {members.filter((m) => m.role === 'parent' || m.role === 'child').filter((m) => m.name !== 'Tabor Family').map((m) => {
                const on = going.includes(m.id)
                return (
                  <button key={m.id} type="button" aria-pressed={on} onClick={() => setGoing((g) => (on ? g.filter((x) => x !== m.id) : [...g, m.id]))}
                    className={`flex h-[56px] items-center gap-[10px] rounded-full pl-[8px] pr-[20px] text-wall-body font-semibold ${on ? 'border-0 bg-wall-ink text-wall-on-pigment' : 'border border-solid border-wall-rule bg-transparent text-wall-ink-2'}`}>
                    <span aria-hidden="true" className={`flex h-[40px] w-[40px] items-center justify-center rounded-full font-display text-wall-heading text-wall-on-pigment ${pigmentStyleFor(pigmentIndexes(members).get(m.id) ?? 0).solid}`}>{m.name.slice(0, 1)}</span>
                    {m.name}
                  </button>
                )
              })}
            </div>
            <div className="mt-[6px] grid grid-cols-3 gap-[20px]">
              <div className="border-0 border-t-2 border-solid border-wall-ink pt-[10px]"><div className="text-wall-label font-bold tracking-[0.18em] text-wall-brass-ink">WHEN</div><div className="font-display text-wall-date font-semibold">{day}{span ? ` · ${span}` : ''}</div></div>
              <div className="border-0 border-t-2 border-solid border-wall-ink pt-[10px]"><div className="text-wall-label font-bold tracking-[0.18em] text-wall-brass-ink">LEAVE BY</div><div className="font-display text-wall-date font-semibold">{leave ?? 'Worked out once it’s on'}</div></div>
              <div className="border-0 border-t-2 border-solid border-wall-ink pt-[10px]"><div className="text-wall-label font-bold tracking-[0.18em] text-wall-brass-ink">{evening ? 'THAT EVENING' : 'THAT DAY'}</div><div className="text-wall-body">{eveningLine(o, going, events, members)}</div></div>
            </div>
            {tickets && (
              <button type="button" role="checkbox" aria-checked={remind} onClick={() => setRemind((r) => !r)} className="mt-[6px] flex items-center gap-[14px] rounded-[16px] border-0 bg-wall-paper px-[20px] py-[16px] text-left text-wall-body text-wall-ink">
                <span aria-hidden="true" className={`flex h-[26px] w-[26px] items-center justify-center rounded-[6px] ${remind ? 'bg-wall-ink text-wall-on-pigment' : 'border-[1.5px] border-solid border-wall-ink-2'}`}>{remind ? '✓' : ''}</span>
                <span>Remind me to get tickets — <b>{tickets.day}</b>{read?.facts.find((f) => f.label === 'Tickets') ? ` (${read.facts.find((f) => f.label === 'Tickets')!.text})` : ''}</span>
              </button>
            )}
            <div className="mt-[8px] flex items-center gap-[14px]">
              <button type="button" disabled={busy || going.length === 0} onClick={() => void add()} className={`${pill} border-0 bg-wall-ink text-wall-on-pigment disabled:opacity-60`}>{busy ? 'Adding…' : 'Add it'}</button>
              <button type="button" onClick={() => setMode('card')} className={`${pill} border border-solid border-wall-rule bg-transparent text-wall-ink-2`}>Back</button>
              {said && <span role="status" className="text-wall-body font-semibold text-wall-brass-ink">{said}</span>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * The morning paper (canvas 48a, 58, 72; Jake, Oct 6: "heres what to worry about today, heres what to prepare for the
 * weekend/next week, heres something a month out … surprise me"; Oct 8: "it doesnt have to be just one … couples things,
 * family ideas, health activities … family news with outside news"): on a calm morning, until 11 or until it's put away.
 * The left panel keeps the clock and one quiet line — when to leave, with whom (canvas 79S); the stage is three pages, turned with a sideways swipe (a finger or
 * the mouse), the arrow keys or the button at the foot — the front page (the headline, four columns, one thing forgotten
 * and this weekend's best for the two of them), Out & about (the Scout's checked list) and Around town (the news). The
 * front page's words are the server's, written once a day (supabase/functions/morning-paper); until they come, plain ones.
 */
export default function WallPaper({ now, facts, words, brief, today = null, counts, scout, members = [], events = [], onAdd, onPutAway, onAsk, onRefresh }: WallPaperProps) {
  const pages = scout ? 3 : 1
  const [page, setPage] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const refresh = () => {
    if (!onRefresh || refreshing) return
    setRefreshing(true)
    onRefresh().catch(() => { /* the paper stays as it was */ }).finally(() => setRefreshing(false))
  }
  const pageNow = useRef(0)
  useEffect(() => { pageNow.current = page }, [page])
  const [phone, setPhone] = useState<Outing | null>(null)
  const [place, setPlace] = useState<GuidePlace | null>(null)
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
        {today}
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
                  {onRefresh && (
                    <button type="button" aria-label={refreshing ? 'Writing today’s paper again' : 'Refresh the paper'} aria-busy={refreshing} disabled={refreshing} onClick={refresh}
                      className="-my-[12px] ml-auto flex h-[44px] w-[44px] items-center justify-center rounded-full border-0 bg-transparent p-0 text-wall-ink-2 opacity-60 disabled:opacity-100">
                      <RotateCw aria-hidden="true" className={`h-[20px] w-[20px] ${refreshing ? 'animate-spin' : ''}`} strokeWidth={2} />
                    </button>
                  )}
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
                <OutPage scout={scout} active={page === 1} now={now} onOpen={setPhone} onOpenPlace={setPlace} onAsk={onAsk} />
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
      {phone && scout && <OutingCard o={phone} scout={scout} members={members} events={events} computer={computer} onAdd={onAdd} onAsk={onAsk} onClose={() => setPhone(null)} />}
      {place && scout && <GuideNote p={place} scout={scout} onAsk={onAsk} onClose={() => setPlace(null)} />}
    </article>
  )
}
