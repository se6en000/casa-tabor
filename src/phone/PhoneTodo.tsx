import { useRef, useState } from 'react'
import { GROUPS, sizeChips, type TodoAction, type TodoItem, type TodoList } from '../wall/todos'
import { haptic } from './haptic'

// To do on Jake's phone (canvas 34c; Jake, Oct 2: "To do only for me … project stuff not visible, to keep it simpler").
// Next up as cards with three gestures — the circle finishes it, a tap opens it to edit, a swipe left gives Tomorrow
// or Later — and what it takes in one plain line; everything else folded under one card. No projects shelf or step
// questions (they stay on the wall); a project step that's due is just a card, its project in small type. Answers go
// through the same `todos` function as the wall.

export interface PhoneTodoProps {
  list: TodoList
  onAct: (request: TodoAction) => Promise<void>
  onEdit: (item: TodoItem) => void
}

/** How far a swiped card opens: Tomorrow and Later. */
const SWIPE_W = 148

export function Answer({ label, primary = false, onClick }: { label: string; primary?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onClick() }}
      className={`h-[44px] shrink-0 whitespace-nowrap rounded-full px-[14px] text-phone-detail font-semibold ${primary ? 'border-0 bg-wall-ink text-wall-on-pigment' : 'border border-solid border-wall-stone bg-transparent text-wall-ink'}`}>
      {label}
    </button>
  )
}

export default function PhoneTodo({ list, onAct, onEdit }: PhoneTodoProps) {
  const [open, setOpen] = useState<string | null>(null)
  const [foldOpen, setFoldOpen] = useState(false)
  // A card swiped left shows Tomorrow and Later (34c); one at a time.
  const [swiped, setSwiped] = useState<string | null>(null)
  const drag = useRef<{ id: string; x: number; y: number; dx: number; on: boolean } | null>(null)
  const [dragX, setDragX] = useState<{ id: string; dx: number } | null>(null)
  const groups = [
    ...(list.suggestions.length ? [{ key: 'noticed', label: 'Casa noticed', count: list.suggestions.length }] : []),
    ...GROUPS.filter((g) => g.key !== 'projects').map((g) => ({ key: g.key, label: g.label, count: list.groups[g.key].length })).filter((g) => g.count > 0),
  ]
  const folded = groups.reduce((n, g) => n + g.count, 0)
  const snooze = (id: string, days: number) => { setSwiped(null); void onAct({ action: 'snooze', id, days }) }

  const card = (item: TodoItem) => {
    const project = item.projectId ? list.projects.find((p) => p.id === item.projectId)?.title ?? 'A project' : null
    const chips = sizeChips(item)
    const late = chips.some((c) => c.late)
    const x = dragX?.id === item.id ? dragX.dx : swiped === item.id ? -SWIPE_W : 0
    return (
      <div key={item.id} className="relative overflow-hidden rounded-[16px]">
        <div aria-hidden={swiped !== item.id} className="absolute inset-y-0 right-0 flex">
          <button type="button" tabIndex={swiped === item.id ? 0 : -1} onClick={() => snooze(item.id, 1)} className="flex w-[74px] flex-col items-center justify-center gap-[2px] border-0 bg-wall-brass p-0 text-phone-label font-bold text-wall-on-pigment">Tomorrow</button>
          <button type="button" tabIndex={swiped === item.id ? 0 : -1} onClick={() => snooze(item.id, 7)} className="flex w-[74px] flex-col items-center justify-center gap-[2px] border-0 bg-wall-ink-2 p-0 text-phone-label font-bold text-wall-on-pigment">Later</button>
        </div>
        <div
          className={`relative flex items-start gap-[12px] rounded-[16px] border border-solid border-wall-stone bg-wall-on-pigment px-[12px] py-[12px] ${dragX?.id === item.id ? '' : 'transition-transform duration-200'}`}
          style={{ transform: x ? `translateX(${x}px)` : undefined }}
          onTouchStart={(e) => { const t = e.touches[0]; drag.current = { id: item.id, x: t.clientX, y: t.clientY, dx: swiped === item.id ? -SWIPE_W : 0, on: false } }}
          onTouchMove={(e) => {
            const d = drag.current
            if (!d) return
            const t = e.touches[0]
            const dx = t.clientX - d.x + (swiped === item.id ? -SWIPE_W : 0)
            if (!d.on && Math.abs(t.clientX - d.x) < 10) return
            if (!d.on && Math.abs(t.clientY - d.y) > Math.abs(t.clientX - d.x)) { drag.current = null; return }
            d.on = true
            d.dx = Math.max(-SWIPE_W - 20, Math.min(0, dx))
            setDragX({ id: item.id, dx: d.dx })
          }}
          onTouchEnd={() => {
            const d = drag.current
            drag.current = null
            setDragX(null)
            if (!d?.on) return
            setSwiped(d.dx < -SWIPE_W / 2 ? item.id : null)
          }}
        >
          <button type="button" role="checkbox" aria-checked={false} aria-label={`Done: ${item.title}`} onClick={() => { haptic(); void onAct({ action: 'done', id: item.id }) }}
            className="-m-[7px] flex h-[44px] w-[44px] shrink-0 items-center justify-center border-0 bg-transparent p-0">
            <span aria-hidden="true" className={`h-[28px] w-[28px] rounded-full border-[1.75px] border-solid ${late ? 'border-wall-rust' : 'border-wall-ink-2'}`} />
          </button>
          <button type="button" aria-label={`Edit ${item.title}`} disabled={Boolean(item.projectId)}
            onClick={() => { if (swiped) return setSwiped(null); onEdit(item) }}
            className="flex min-w-0 flex-1 flex-col gap-[3px] border-0 bg-transparent p-0 text-left text-wall-ink disabled:opacity-100">
            <span className="text-phone-body font-semibold leading-snug">{item.title}</span>
            {project ? <span className="text-phone-detail text-wall-brass-ink">{project} · a project step</span> : item.nextStep && <span className="text-phone-detail text-wall-ink">{item.nextStep}</span>}
            {chips.length > 0 && (
              <span className="text-phone-detail text-wall-ink-2">
                {chips.map((c, i) => <span key={i} className={c.late ? 'font-semibold text-wall-rust' : ''}>{i > 0 ? ' · ' : ''}{c.text}</span>)}
              </span>
            )}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-[14px]">
      <section aria-label="Next up" className="flex flex-col gap-[8px]">
        <h2 className="m-0 font-body text-phone-label font-bold tracking-[0.16em] text-wall-ink-2">NEXT UP</h2>
        {list.nextUp.length === 0 && <p className="m-0 font-display text-phone-heading italic text-wall-ink-2">Nothing waiting right now.</p>}
        {list.nextUp.map(card)}
      </section>

      {folded > 0 && (
        <section aria-label="Everything else" className="flex flex-col gap-[6px]">
          <button type="button" aria-expanded={foldOpen} onClick={() => setFoldOpen((o) => !o)} className="flex min-h-[52px] items-center justify-between rounded-[16px] border-0 bg-phone-card px-[14px] text-left text-phone-body font-semibold text-wall-ink">
            <span>Everything else · {folded}</span>
            <span aria-hidden="true" className="text-phone-heading text-wall-ink-2">{foldOpen ? '⌄' : '›'}</span>
          </button>
          {foldOpen && groups.map((g) => (
          <div key={g.key} className={`flex flex-col rounded-[16px] bg-wall-on-pigment px-[14px] ${open === g.key ? 'border-2 border-solid border-wall-ink pb-[6px]' : 'border border-solid border-wall-stone'}`}>
            <button type="button" aria-expanded={open === g.key} onClick={() => setOpen((o) => (o === g.key ? null : g.key))} className="flex h-[52px] items-center justify-between border-0 bg-transparent p-0 text-wall-ink">
              <span className="flex items-baseline gap-[8px]"><span className={`font-display text-phone-heading font-bold ${g.key === 'noticed' ? 'text-wall-brass-ink' : ''}`}>{g.label}</span><span className="text-phone-detail text-wall-ink-2">{g.count}</span></span>
              <span aria-hidden="true" className="text-phone-heading text-wall-ink-2">{open === g.key ? '⌄' : '›'}</span>
            </button>
            {open === g.key && g.key === 'noticed' && list.suggestions.map((sg) => (
              <div key={sg.id} className="flex items-center gap-[8px] border-0 border-t border-solid border-wall-stone py-[8px]">
                <span className="flex min-w-0 flex-1 flex-col"><span className="text-phone-detail font-semibold">{sg.title}</span><span className="text-phone-label text-wall-ink-2">{sg.kind === 'merge' ? `Same as “${sg.withTitle ?? 'another one'}” — merge?` : sg.kind === 'done' ? 'Looks over — close it?' : 'Just a buy — move it to Shopping?'}</span></span>
                <Answer label="Keep" onClick={() => void onAct({ action: 'dismiss', id: sg.id })} />
                <Answer label="Yes" primary onClick={() => void onAct({ action: 'accept', id: sg.id })} />
              </div>
            ))}
            {open === g.key && g.key !== 'noticed' && list.groups[g.key as keyof TodoList['groups']].map((i) => (
              <div key={i.id} className="flex items-center gap-[8px] border-0 border-t border-solid border-wall-stone py-[8px]">
                <button type="button" aria-label={`Edit ${i.title}`} onClick={() => onEdit(i)} className="flex min-w-0 flex-1 flex-col border-0 bg-transparent p-0 text-left text-wall-ink">
                  <span className="text-phone-detail font-semibold">{i.title}</span>
                  <span className="text-phone-label text-wall-ink-2">{sizeChips(i).map((c) => c.text).join(' · ')}</span>
                </button>
                <Answer label="Done" primary onClick={() => void onAct({ action: 'done', id: i.id })} />
              </div>
            ))}
          </div>
          ))}
        </section>
      )}
      <p className="m-0 text-center text-phone-detail text-wall-ink-2">Tick to finish · tap to open and edit · swipe left for not now</p>
    </div>
  )
}
