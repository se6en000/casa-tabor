import { useState } from 'react'
import WallChooser from './WallChooser'
import { hoursText, shelfCard } from './projectModel'
import { SEGMENT } from './projectStyle'
import type { ComingUpItem } from './comingUp'
import type { TodoProject } from './todos'

// The projects shelf on the To do list (FAMILY_WALL_PLAN.md P3.23, canvas 10a, approved by Jake
// 2026-09-29: "projects should stand out by itself and not part of the regular everything else folded
// list … with progress trackers"). A card per project: a segment per step, what's left, the target and
// his pace, what's Now, a project inside. Four across; more open from the last card.

export interface WallProjectShelfProps {
  projects: TodoProject[]
  today: string
  onOpen: (id: string) => void
  /** Seasons coming up that can start (canvas 10a's dashed card): shown after the projects, while there's room. */
  upcoming?: ComingUpItem[]
  onStart?: (key: string) => void
}

const SHOWN = 4

export default function WallProjectShelf({ projects, today, onOpen, upcoming = [], onStart }: WallProjectShelfProps) {
  const [choosing, setChoosing] = useState(false)
  const [starting, setStarting] = useState<ComingUpItem | null>(null)
  const withCards = projects.filter((p) => p.detail)
  const overflow = withCards.length > SHOWN
  const shown = overflow ? withCards.slice(0, SHOWN - 1) : withCards
  const seasons = onStart ? upcoming.filter((i) => i.startable && i.plan).slice(0, Math.max(0, SHOWN - shown.length - (overflow ? 1 : 0))) : []
  const day = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { ...o, timeZone: 'UTC' })
  return (
    <section aria-label="Projects" className="flex shrink-0 flex-col gap-[8px]">
      <span className="text-wall-label font-bold tracking-[0.2em] text-wall-brass-ink">PROJECTS · {withCards.length} GOING</span>
      <div className="flex h-[372px] gap-[20px]">
        {shown.map((p) => {
          const c = shelfCard(p.detail!, today)
          return (
            <button key={p.id} type="button" aria-label={`Open ${p.title}`} onClick={(e) => { e.stopPropagation(); onOpen(p.id) }}
              className={`flex min-w-0 flex-1 flex-col gap-[8px] rounded-[20px] border border-solid border-wall-stone bg-wall-on-pigment/50 px-[22px] py-[18px] text-left text-wall-ink ${c.kind.startsWith('PAUSED') ? 'opacity-60' : ''}`}>
              <span className="flex w-full items-center justify-between">
                <span className="text-wall-label font-bold tracking-[0.15em] text-wall-ink-2">{c.kind}</span>
                <span aria-hidden="true" className="text-wall-heading text-wall-ink-2">›</span>
              </span>
              <span className="w-full truncate font-display text-wall-date font-semibold leading-none">{p.title}</span>
              <span aria-hidden="true" className="flex h-[12px] w-full shrink-0 gap-[4px]">
                {c.segments.map((k, i) => <span key={i} className={`h-[12px] flex-1 rounded-full ${SEGMENT[k]}`} />)}
              </span>
              <span className="w-full truncate text-wall-detail text-wall-ink-2">{c.stats}</span>
              <span className="flex w-full flex-col">
                <span className="truncate text-wall-detail font-bold">{c.targetLine}</span>
                {c.pace && <span className={`truncate text-wall-label font-bold ${c.pace.late ? 'text-wall-rust' : 'text-wall-brass-ink'}`}>{c.pace.text}</span>}
              </span>
              <span className="h-px w-full shrink-0 bg-wall-stone" />
              <span className="flex w-full flex-col gap-[2px]">
                <span className="text-wall-label font-bold tracking-[0.15em] text-wall-brass-ink">{c.nowLabel}</span>
                <span className="line-clamp-2 text-wall-body font-bold leading-snug">{c.now.length ? c.now.join(' · ') : c.inside ? `Waiting on ${c.inside.title}` : 'Nothing left: done?'}</span>
              </span>
              {c.inside && (
                <span className="mt-auto flex w-full items-center gap-[10px] rounded-[12px] border border-solid border-wall-stone bg-wall-ground px-[12px] py-[8px]">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-wall-brass-ink"><path d="M5 3v9a4 4 0 0 0 4 4h10" /><path d="M15 12l4 4-4 4" /></svg>
                  <span className="flex min-w-0 flex-1 flex-col gap-[4px]">
                    <span className="flex items-baseline justify-between gap-[8px]"><span className="truncate text-wall-label font-bold">{c.inside.title}</span><span className="shrink-0 text-wall-label text-wall-ink-2">{c.inside.done} of {c.inside.total}</span></span>
                    <span aria-hidden="true" className="flex h-[6px] gap-[3px]">{Array.from({ length: Math.max(1, c.inside.total) }, (_, i) => <span key={i} className={`h-[6px] flex-1 rounded-full ${SEGMENT[i < c.inside!.done ? 'done' : i === c.inside!.done ? 'now' : 'later']}`} />)}</span>
                    {c.inside.next && <span className="truncate text-wall-label text-wall-ink-2">next: {c.inside.next}</span>}
                  </span>
                </span>
              )}
            </button>
          )
        })}
        {seasons.map((i) => {
          const ready = i.pokeOn <= today
          return (
            <button key={i.key} type="button" aria-label={`${i.title}: coming up`} onClick={(e) => { e.stopPropagation(); setStarting(i) }}
              className="flex min-w-0 flex-1 flex-col gap-[8px] rounded-[20px] border-2 border-dashed border-wall-ink-2 bg-transparent px-[22px] py-[18px] text-left text-wall-ink">
              <span className="flex w-full items-center justify-between">
                <span className="text-wall-label font-bold tracking-[0.15em] text-wall-ink-2">SEASONAL · {ready ? 'READY TO START' : `STARTS ${day(i.pokeOn, { month: 'short', day: 'numeric' }).toUpperCase()}`}</span>
                <span aria-hidden="true" className="text-wall-heading text-wall-ink-2">›</span>
              </span>
              <span className="w-full truncate font-display text-wall-date font-semibold leading-none">{i.title}</span>
              <span aria-hidden="true" className="flex h-[12px] w-full shrink-0 gap-[4px]">
                {Array.from({ length: i.plan!.steps }, (_, n) => <span key={n} className={`h-[12px] flex-1 rounded-full ${SEGMENT.later}`} />)}
              </span>
              <span className="w-full truncate text-wall-detail text-wall-ink-2">{i.plan!.steps} steps · ~{hoursText(i.plan!.minutes)} · a plan ready</span>
              <span className="flex w-full flex-col">
                <span className="truncate text-wall-detail font-bold">Target {day(i.date, { weekday: 'short', month: 'short', day: 'numeric' })} · {i.daysAway} days</span>
                <span className="truncate text-wall-label font-bold text-wall-ink-2">{ready ? 'Tap to start it' : 'Nothing to do yet'}</span>
              </span>
              <span className="h-px w-full shrink-0 bg-wall-stone" />
              <span className="flex w-full flex-col gap-[2px]">
                <span className="text-wall-label font-bold tracking-[0.15em] text-wall-brass-ink">FIRST{ready ? '' : `, ${day(i.pokeOn, { month: 'short', day: 'numeric' }).toUpperCase()}`}</span>
                <span className="line-clamp-2 text-wall-body font-bold leading-snug">{i.plan!.first}</span>
              </span>
            </button>
          )
        })}
        {overflow && (
          <button type="button" onClick={(e) => { e.stopPropagation(); setChoosing(true) }}
            className="flex min-w-0 flex-1 flex-col justify-center gap-[8px] rounded-[20px] border-[1.5px] border-dashed border-wall-ink-2 bg-transparent px-[20px] text-left text-wall-ink">
            <span className="font-display text-wall-date font-semibold">{withCards.length - shown.length} more</span>
            <span className="line-clamp-3 text-wall-label text-wall-ink-2">{withCards.slice(shown.length).map((p) => p.title).join(' · ')}</span>
          </button>
        )}
      </div>
      {starting && (
        <WallChooser title={`Start ${starting.title} now? Its first step goes on your phone.`} options={[{ key: 'start', label: 'Start it now', detail: `${starting.plan?.steps ?? ''} steps, in order; change anything on its page` }]}
          onPick={() => { const key = starting.key; setStarting(null); onStart?.(key) }} onCancel={() => setStarting(null)} />
      )}
      {choosing && (
        <WallChooser title="All projects" options={withCards.map((p) => ({ key: p.id, label: p.title, detail: `${p.done} of ${p.total}${p.next ? ` · now: ${p.next}` : ''}` }))}
          onPick={(id) => { setChoosing(false); onOpen(id) }} onCancel={() => setChoosing(false)} />
      )}
    </section>
  )
}
