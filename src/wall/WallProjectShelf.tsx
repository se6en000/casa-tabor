import { useState } from 'react'
import WallChooser from './WallChooser'
import { shelfCard } from './projectModel'
import type { TodoProject } from './todos'

// The projects shelf on the To do list (FAMILY_WALL_PLAN.md P3.23, canvas 10a, approved by Jake
// 2026-09-29: "projects should stand out by itself and not part of the regular everything else folded
// list … with progress trackers"). A card per project: a segment per step, what's left, the target and
// his pace, what's Now, a project inside. Four across; more open from the last card.

export interface WallProjectShelfProps {
  projects: TodoProject[]
  today: string
  onOpen: (id: string) => void
}

const SHOWN = 4

export default function WallProjectShelf({ projects, today, onOpen }: WallProjectShelfProps) {
  const [choosing, setChoosing] = useState(false)
  const withCards = projects.filter((p) => p.detail)
  const overflow = withCards.length > SHOWN
  const shown = overflow ? withCards.slice(0, SHOWN - 1) : withCards
  return (
    <section aria-label="Projects" className="flex shrink-0 flex-col gap-[8px]">
      <span className="text-wall-label font-bold tracking-[0.2em] text-wall-brass-ink">PROJECTS · {withCards.length} GOING</span>
      <div className="flex h-[220px] gap-[18px]">
        {shown.map((p) => {
          const c = shelfCard(p.detail!, today)
          return (
            <button key={p.id} type="button" aria-label={`Open ${p.title}`} onClick={(e) => { e.stopPropagation(); onOpen(p.id) }}
              className={`flex min-w-0 flex-1 flex-col gap-[6px] rounded-[20px] border border-solid border-wall-stone bg-wall-on-pigment/50 px-[20px] py-[14px] text-left text-wall-ink ${c.kind.startsWith('PAUSED') ? 'opacity-60' : ''}`}>
              <span className="flex w-full items-center justify-between">
                <span className="text-wall-label font-bold tracking-[0.15em] text-wall-ink-2">{c.kind}</span>
                <span aria-hidden="true" className="text-wall-heading text-wall-ink-2">›</span>
              </span>
              <span className="w-full truncate font-display text-wall-date font-semibold leading-tight">{p.title}</span>
              <span aria-hidden="true" className="flex h-[10px] w-full gap-[3px]">
                {c.segments.map((k, i) => <span key={i} className={`h-[10px] flex-1 rounded-full ${k === 'done' ? 'bg-wall-brass' : k === 'now' ? 'bg-wall-ink' : k === 'inside' ? 'bg-wall-brass/50' : 'bg-wall-stone'}`} />)}
              </span>
              <span className="w-full truncate text-wall-label text-wall-ink-2">{c.stats}</span>
              <span className="w-full truncate text-wall-label font-semibold">
                {c.target ?? 'No target yet'}
                {c.pace && <span className={c.pace.late ? 'text-wall-rust' : 'text-wall-brass-ink'}> · {c.pace.text}</span>}
              </span>
              <span className="flex w-full items-baseline gap-[10px]">
                <span className="shrink-0 text-wall-label font-bold tracking-[0.15em] text-wall-brass-ink">NOW</span>
                <span className="min-w-0 truncate text-wall-detail font-bold">{c.now.length ? c.now.join(' · ') : c.inside ? `waiting on ${c.inside.title}` : 'Nothing left'}</span>
              </span>
              {c.inside && <span className="w-full truncate text-wall-label text-wall-ink-2">Inside: {c.inside.title} · {c.inside.done} of {c.inside.total}</span>}
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
      {choosing && (
        <WallChooser title="All projects" options={withCards.map((p) => ({ key: p.id, label: p.title, detail: `${p.done} of ${p.total}${p.next ? ` · now: ${p.next}` : ''}` }))}
          onPick={(id) => { setChoosing(false); onOpen(id) }} onCancel={() => setChoosing(false)} />
      )}
    </section>
  )
}
