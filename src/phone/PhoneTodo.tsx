import { useState } from 'react'
import type { ComingUpItem } from '../wall/comingUp'
import { hoursText, shelfCard } from '../wall/projectModel'
import { SEGMENT } from '../wall/projectStyle'
import { GROUPS, sizeChips, type PastStep, type TodoAction, type TodoItem, type TodoList } from '../wall/todos'

// To do on the phone (FAMILY_WALL_PLAN.md P3.22 step 7, the wall's canvas 10a in one column): Week ›
// To do on Jake's phone. The same list as the wall — a passed step asked about, the projects shelf (a
// card each; a season coming up dashed), Next up with what each takes, everything else folded. A card
// opens its project (PhoneProject). Answers go through the same `todos` function as the wall.

export interface PhoneTodoProps {
  list: TodoList
  today: string
  onAct: (request: TodoAction) => Promise<void>
  onOpenProject: (id: string) => void
  onEdit: (item: TodoItem) => void
  upcoming?: ComingUpItem[]
  onStart?: (key: string) => void
}

const SNOOZES = [{ label: 'Tomorrow', days: 1 }, { label: '3 days', days: 3 }, { label: 'A week', days: 7 }]
const Nest = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 3v9a4 4 0 0 0 4 4h10" /><path d="M15 12l4 4-4 4" /></svg>
)

export function Answer({ label, primary = false, onClick }: { label: string; primary?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onClick() }}
      className={`h-[44px] shrink-0 whitespace-nowrap rounded-full px-[14px] text-phone-detail font-semibold ${primary ? 'border-0 bg-wall-ink text-wall-on-pigment' : 'border border-solid border-wall-stone bg-transparent text-wall-ink'}`}>
      {label}
    </button>
  )
}

const plus = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400e3).toISOString().slice(0, 10)
const short = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })

function PastRow({ step, today, onAct }: { step: PastStep; today: string; onAct: PhoneTodoProps['onAct'] }) {
  const [moving, setMoving] = useState(false)
  const when = step.date === plus(today, -1) ? 'yesterday' : `on ${short(step.date)}`
  const edit = (op: string, args: Record<string, unknown>) => onAct({ action: 'project_edit', id: step.projectId, op, args: { step_id: step.id, ...args } })
  return (
    <div className="flex flex-col gap-[6px] border-0 border-t border-solid border-wall-stone py-[10px]">
      <span className="text-phone-label font-bold text-wall-brass-ink">{step.project}</span>
      <span className="text-phone-body font-semibold text-wall-ink">{step.title}</span>
      <span className="text-phone-detail font-semibold text-wall-rust">It was {when}. Done?</span>
      <span className="flex flex-wrap gap-[6px]">
        <Answer label="Done" primary onClick={() => void edit('done_step', {})} />
        <Answer label={moving ? 'Keep it' : 'Not yet'} onClick={() => setMoving((m) => !m)} />
      </span>
      {moving && (
        <span className="flex flex-wrap items-center gap-[6px]">
          <Answer label="Tomorrow" onClick={() => void edit('set_step', { cal_start: plus(today, 1) })} />
          <Answer label="No date" onClick={() => void edit('set_step', { cal_start: '' })} />
          <label className="flex h-[44px] items-center gap-[6px] rounded-full border border-solid border-wall-stone px-[12px] text-phone-detail text-wall-ink">
            Pick
            <input type="date" aria-label="Move it to" min={plus(today, 1)} onChange={(e) => e.target.value && void edit('set_step', { cal_start: e.target.value })} className="border-0 bg-transparent text-phone-detail text-wall-ink" />
          </label>
        </span>
      )}
    </div>
  )
}

export default function PhoneTodo({ list, today, onAct, onOpenProject, onEdit, upcoming = [], onStart }: PhoneTodoProps) {
  const [open, setOpen] = useState<string | null>(null)
  const [snoozing, setSnoozing] = useState<string | null>(null)
  const seasons = onStart ? upcoming.filter((i) => i.startable && i.plan) : []
  const groups = [
    ...(list.suggestions.length ? [{ key: 'noticed', label: 'Casa noticed', count: list.suggestions.length }] : []),
    ...GROUPS.filter((g) => g.key !== 'projects').map((g) => ({ key: g.key, label: g.label, count: list.groups[g.key].length })).filter((g) => g.count > 0),
  ]
  return (
    <div className="flex flex-col gap-[14px]">
      {(list.pastSteps ?? []).length > 0 && (
        <section aria-label="Was it done?" className="flex flex-col">
          {(list.pastSteps ?? []).map((st) => <PastRow key={st.id} step={st} today={today} onAct={onAct} />)}
        </section>
      )}

      {(list.projects.length > 0 || seasons.length > 0) && (
        <section aria-label="Projects" className="flex flex-col gap-[8px]">
          <h2 className="m-0 font-body text-phone-label font-bold tracking-[0.16em] text-wall-brass-ink">PROJECTS · {list.projects.length} GOING</h2>
          {list.projects.filter((p) => p.detail).map((p) => {
            const c = shelfCard(p.detail!, today)
            return (
              <button key={p.id} type="button" aria-label={`Open ${p.title}`} onClick={() => onOpenProject(p.id)}
                className={`flex flex-col gap-[6px] rounded-[18px] border border-solid border-wall-stone bg-wall-on-pigment px-[14px] py-[12px] text-left text-wall-ink ${c.kind.startsWith('PAUSED') ? 'opacity-60' : ''}`}>
                <span className="flex items-center justify-between"><span className="text-phone-label font-bold tracking-[0.12em] text-wall-ink-2">{c.kind}</span><span aria-hidden="true" className="text-phone-heading text-wall-ink-2">›</span></span>
                <span className="font-display text-phone-heading font-bold leading-tight">{p.title}</span>
                <span aria-hidden="true" className="flex h-[8px] gap-[3px]">{c.segments.map((k, i) => <span key={i} className={`h-[8px] flex-1 rounded-full ${SEGMENT[k]}`} />)}</span>
                <span className="text-phone-detail text-wall-ink-2">{c.stats}</span>
                <span className="text-phone-detail font-semibold">{c.targetLine}{c.pace && <span className={c.pace.late ? 'text-wall-rust' : 'text-wall-brass-ink'}> · {c.pace.text}</span>}</span>
                <span className="flex flex-col border-0 border-t border-solid border-wall-stone pt-[6px]">
                  <span className="text-phone-label font-bold tracking-[0.12em] text-wall-brass-ink">{c.nowLabel}</span>
                  <span className="text-phone-body font-semibold">{c.now.length ? c.now.join(' · ') : c.inside ? `Waiting on ${c.inside.title}` : 'Nothing left: done?'}</span>
                </span>
                {/* Every active project inside (the wall swipes; the phone scrolls, so it lists them). */}
                {c.insides.map((inside) => (
                  <span key={inside.id} className="flex items-center gap-[8px] rounded-[12px] bg-phone-card px-[10px] py-[6px] text-wall-brass-ink">
                    <Nest />
                    <span className="flex min-w-0 flex-1 flex-col gap-[3px] text-wall-ink">
                      <span className="flex justify-between gap-[6px] text-phone-label"><b className="truncate">{inside.title}</b><span className="shrink-0 text-wall-ink-2">{inside.done} of {inside.total}</span></span>
                      <span aria-hidden="true" className="flex h-[5px] gap-[2px]">{Array.from({ length: Math.max(1, inside.total) }, (_, i) => <span key={i} className={`h-[5px] flex-1 rounded-full ${SEGMENT[i < inside.done ? 'done' : i === inside.done ? 'now' : 'later']}`} />)}</span>
                    </span>
                  </span>
                ))}
              </button>
            )
          })}
          {seasons.map((i) => (
            <button key={i.key} type="button" aria-label={`${i.title}: coming up`} onClick={() => onStart?.(i.key)}
              className="flex flex-col gap-[6px] rounded-[18px] border-2 border-dashed border-wall-ink-2 bg-transparent px-[14px] py-[12px] text-left text-wall-ink">
              <span className="text-phone-label font-bold tracking-[0.12em] text-wall-ink-2">SEASONAL · {i.pokeOn <= today ? 'READY TO START' : `STARTS ${short(i.pokeOn).toUpperCase()}`}</span>
              <span className="font-display text-phone-heading font-bold leading-tight">{i.title}</span>
              <span className="text-phone-detail text-wall-ink-2">{i.plan!.steps} steps · ~{hoursText(i.plan!.minutes)} · first: {i.plan!.first}</span>
              <span className="text-phone-detail font-semibold text-wall-brass-ink">Tap to start it now</span>
            </button>
          ))}
        </section>
      )}

      <section aria-label="Next up" className="flex flex-col">
        <h2 className="m-0 pb-[4px] font-body text-phone-label font-bold tracking-[0.16em] text-wall-ink-2">NEXT UP</h2>
        {list.nextUp.length === 0 && <p className="m-0 font-display text-phone-heading italic text-wall-ink-2">Nothing waiting right now.</p>}
        {list.nextUp.map((item) => {
          const project = item.projectId ? list.projects.find((p) => p.id === item.projectId)?.title : null
          return (
            <div key={item.id} className="flex flex-col gap-[5px] border-0 border-t border-solid border-wall-stone py-[10px]">
              {project && <span className="flex items-center gap-[4px] text-phone-label font-bold text-wall-brass-ink"><Nest />{project} · now</span>}
              <button type="button" aria-label={`Edit ${item.title}`} onClick={() => (item.projectId ? onOpenProject(item.projectId) : onEdit(item))} className="border-0 bg-transparent p-0 text-left text-phone-body font-semibold text-wall-ink">{item.title}</button>
              {item.nextStep && <span className="text-phone-detail font-bold text-wall-brass-ink">Next: {item.nextStep}</span>}
              <span className="flex flex-wrap gap-[5px]">
                {sizeChips(item).map((c, i) => <span key={i} className={`flex h-[26px] items-center rounded-full border border-solid px-[9px] text-phone-label font-semibold ${c.late ? 'border-wall-rust text-wall-rust' : 'border-wall-stone text-wall-ink-2'}`}>{c.text}</span>)}
              </span>
              <span className="flex flex-wrap gap-[6px] pt-[2px]">
                <Answer label="Done" primary onClick={() => void onAct({ action: 'done', id: item.id })} />
                {snoozing === item.id
                  ? SNOOZES.map((s) => <Answer key={s.days} label={s.label} onClick={() => { setSnoozing(null); void onAct({ action: 'snooze', id: item.id, days: s.days }) }} />)
                  : <Answer label="Not now" onClick={() => setSnoozing(item.id)} />}
              </span>
            </div>
          )
        })}
      </section>

      <section aria-label="Everything else" className="flex flex-col gap-[6px]">
        <h2 className="m-0 font-body text-phone-label font-bold tracking-[0.16em] text-wall-ink-2">EVERYTHING ELSE, FOLDED</h2>
        {groups.map((g) => (
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
    </div>
  )
}
