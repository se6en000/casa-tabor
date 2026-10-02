import { Mic } from 'lucide-react'
import { useEffect, useEffectEvent, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import WallChooser from './WallChooser'
import { SEGMENT, type SegmentKind } from './projectStyle'
import WallKeyboard from './WallKeyboard'
import { deviceKeyboardHere } from './keyboardMode'
import WallNumberPad from './WallNumberPad'
import WallProjectSettings from './WallProjectSettings'
import WallStepPanel, { EffortChoices, Pill, type StepInput } from './WallStepPanel'
import {
  applyProjectEdit, arrangement, hoursText, doneSteps, dropTargetAt, effortText, moneyText, moveStep, nudgeStep, placeNew, planGroups, projectStats, whoOptions,
  type DropTarget, type LineBox, type ProjectDetail, type ProjectStep, type RowBox,
} from './projectModel'

// The project page (FAMILY_WALL_PLAN.md P3.23, canvas 10b/10c, approved by Jake 2026-09-29): where
// you work. "I can see the project and edit it right in the same screen … very easy to review and
// change the order, add a step in realtime." Top to bottom is the order; steps side by side share a
// group; "Then" lines separate groups; the first group is Now (what his phone shows). Drag a step by
// its handle (↑ / ↓ in its details stay as the fallback); tap its time, cost or who for a quick change;
// tap the step and every detail opens in the right column, the list staying put.

export interface WallProjectProps {
  detail: ProjectDetail
  now: Date
  onEdit: (op: string, args?: Record<string, unknown>) => Promise<unknown>
  onBack: () => void
  onOpenProject: (id: string) => void
  /** Opens Casa talking about this project (P3.25 phase 4). */
  onTalk?: (say: string) => void
}

type Typing = { what: StepInput | 'rename' | 'add' | 'child' | 'notes-project'; stepId?: string; at?: DropTarget; value: string } | null
type Quick = { stepId: string; kind: 'effort' | 'who' } | null
type Pad = { what: 'cost' | 'effort'; stepId: string } | null
type Choose = { what: 'move_to' | 'child'; stepId?: string; at?: DropTarget } | null
type Drag = { id: string; startY: number; dy: number; scale: number; rows: RowBox[]; lines: LineBox[]; groupCount: number; origin: number; target: DropTarget | null } | null

const TYPING_LABEL: Record<NonNullable<Typing>['what'], string> = {
  rename: 'THE PROJECT’S NAME', 'notes-project': 'A NOTE ABOUT THE PROJECT', add: 'A NEW STEP', child: 'A NEW PROJECT INSIDE',
  title: 'THE STEP', notes: 'A NOTE ON THE STEP', unit: 'WHAT’S COUNTED (WINDOWS, SHUTTERS…)', shop: 'WHAT TO BUY',
  person: 'SOMEONE NEW', split: 'THE NEXT PART, BESIDE IT', cost: 'COST', effort: 'TIME',
}
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const niceDate = (d: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', opts)

function Grip({ title, onDown }: { title: string; onDown: (e: ReactPointerEvent<HTMLButtonElement>) => void }) {
  return (
    // data-native-drag: the app-wide mouse drag-to-scroll (pointerGestures) leaves this drag alone.
    // touch-action inline: the app's `button { touch-action: manipulation }` beats a class, and with it the
    // touchscreen took the drag for a scroll and cancelled it a few pixels in (Jake, 2026-09-29).
    <button type="button" data-native-drag aria-label={`Hold and drag to move ${title}`} onPointerDown={onDown} style={{ touchAction: 'none' }} className="flex h-[48px] w-[36px] shrink-0 items-center justify-center border-0 bg-transparent p-0 text-wall-ink-2">
      <svg width="16" height="24" viewBox="0 0 16 24" fill="currentColor" aria-hidden="true"><circle cx="4" cy="4" r="2" /><circle cx="12" cy="4" r="2" /><circle cx="4" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="4" cy="20" r="2" /><circle cx="12" cy="20" r="2" /></svg>
    </button>
  )
}

export default function WallProject({ detail: incoming, now, onEdit, onBack, onOpenProject, onTalk }: WallProjectProps) {
  // Changes show at once (the same edit applied here); the server's copy replaces it when it lands.
  const [pending, setPending] = useState<ProjectDetail | null>(null)
  const [seen, setSeen] = useState(incoming)
  if (seen !== incoming) {
    setSeen(incoming)
    setPending(null)
  }
  const detail = pending ?? incoming
  const { project } = detail
  const [picked, setPicked] = useState<string | null>(null)
  const [showDone, setShowDone] = useState(false)
  const [typing, setTyping] = useState<Typing>(null)
  const [quick, setQuick] = useState<Quick>(null)
  const [pad, setPad] = useState<Pad>(null)
  const [choose, setChoose] = useState<Choose>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [settings, setSettings] = useState(false)
  const [drag, setDrag] = useState<Drag>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef(new Map<string, HTMLElement>())
  const lineRefs = useRef(new Map<number, HTMLElement>())

  const edit = (op: string, args: Record<string, unknown> = {}) => {
    setPending(applyProjectEdit(detail, op, args))
    void onEdit(op, args)
  }
  const groups = planGroups(detail)
  const openIds = groups.map((g) => g.map((s) => s.id))
  const flat = groups.flat()
  const done = doneSteps(detail)
  const stats = projectStats(detail, ymd(now))
  const pickedStep = flat.find((s) => s.id === picked) ?? null
  const stepFor = (id?: string) => detail.steps.find((s) => s.id === id)
  const setStep = (id: string, args: Record<string, unknown>) => edit('set_step', { step_id: id, ...args })
  const arrange = (open: string[][]) => edit('arrange', { groups: arrangement(detail, open) })

  // Dragging: rows and Then lines measured once when the drag starts, so nothing jumps under the finger.
  const startDrag = (id: string) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const list = listRef.current
    if (!list) return
    const scale = list.getBoundingClientRect().height / (list.offsetHeight || 1) || 1
    const rows: RowBox[] = []
    groups.forEach((g, gi) => g.forEach((s, index) => {
      const r = rowRefs.current.get(s.id)?.getBoundingClientRect()
      if (r) rows.push({ group: gi, index, top: r.top, bottom: r.bottom })
    }))
    const lines: LineBox[] = [...lineRefs.current].map(([at, el]) => { const r = el.getBoundingClientRect(); return { at, top: r.top, bottom: r.bottom } })
    setQuick(null)
    setDrag({ id, startY: e.clientY, dy: 0, scale, rows, lines, groupCount: groups.length, origin: list.getBoundingClientRect().top, target: null })
  }
  // The listeners go on once per drag; these read the latest drag and plan when they fire.
  const onMove = useEffectEvent((e: PointerEvent) => setDrag((d) => d && { ...d, dy: (e.clientY - d.startY) / d.scale, target: dropTargetAt(e.clientY, d.rows, d.lines, d.groupCount) }))
  const onUp = useEffectEvent(() => {
    const d = drag
    setDrag(null)
    if (!d || !d.target || Math.abs(d.dy) <= 8) return
    const next = moveStep(openIds, d.id, d.target)
    if (JSON.stringify(next) !== JSON.stringify(openIds)) arrange(next)
  })
  const dragging = drag !== null
  useEffect(() => {
    if (!dragging) return
    const move = (e: PointerEvent) => onMove(e)
    const up = () => onUp()
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [dragging])
  // Where the drop line goes, in the list's own pixels.
  const dropY = (() => {
    if (!drag?.target) return null
    const t = drag.target
    if (t.kind === 'new') {
      const line = drag.lines.find((l) => l.at === t.at)
      if (line) return ((line.top + line.bottom) / 2 - drag.origin) / drag.scale
      const edge = t.at === 0 ? drag.rows[0]?.top : drag.rows[drag.rows.length - 1]?.bottom
      return edge == null ? null : (edge - drag.origin) / drag.scale
    }
    const inGroup = drag.rows.filter((r) => r.group === t.group)
    const at = inGroup[t.index] ? inGroup[t.index].top : inGroup[inGroup.length - 1]?.bottom
    return at == null ? null : (at - drag.origin) / drag.scale
  })()

  const finishTyping = () => {
    const t = typing
    setTyping(null)
    if (!t) return
    const value = t.value.trim()
    const step = stepFor(t.stepId)
    if (t.what === 'rename') { if (value && value !== project.title) edit('rename', { title: value }) }
    else if (t.what === 'notes-project') edit('settings', { notes: value })
    else if (t.what === 'add') { if (value) edit('add_step', { title: value, arrange: arrangement(detail, placeNew(openIds, t.at ?? { kind: 'new', at: openIds.length })) }) }
    else if (t.what === 'child') { if (value) edit('add_child', { title: value, arrange: arrangement(detail, placeNew(openIds, t.at ?? { kind: 'new', at: openIds.length })) }) }
    else if (!step) return
    else if (t.what === 'title') { if (value) setStep(step.id, { title: value }) }
    else if (t.what === 'notes') setStep(step.id, { notes: value })
    else if (t.what === 'unit') setStep(step.id, { repeat_unit: value, repeat_minutes: step.repeat_minutes, repeat_count: step.repeat_count })
    else if (t.what === 'shop') setStep(step.id, { shop_item: value })
    else if (t.what === 'person') {
      if (!value) return
      edit('settings', { people: [...project.people, { name: value }] })
      setStep(step.id, { who: value })
    } else if (t.what === 'split') {
      if (!value) return
      const gi = openIds.findIndex((g) => g.includes(step.id))
      edit('add_step', { title: value, arrange: arrangement(detail, placeNew(openIds, { kind: 'join', group: gi, index: openIds[gi].indexOf(step.id) + 1 })) })
    }
  }
  const ask = (step: ProjectStep) => (what: StepInput) => {
    if (what === 'cost' || what === 'effort') return setPad({ what, stepId: step.id })
    const value = what === 'title' ? step.title : what === 'notes' ? step.notes ?? '' : what === 'unit' ? step.repeat_unit ?? '' : what === 'shop' ? step.shop_item ?? step.title : ''
    setTyping({ what, stepId: step.id, value })
  }

  if (settings) return <WallProjectSettings detail={detail} now={now} onEdit={edit} onBack={() => setSettings(false)} onDeleted={onBack} />

  const row = (s: ProjectStep, dark: boolean) => {
    const chip = (label: string, aria: string, onClick: () => void) => (
      <button type="button" aria-label={aria} onClick={(e) => { e.stopPropagation(); onClick() }}
        className={`h-[44px] shrink-0 whitespace-nowrap rounded-full px-[14px] text-wall-label font-semibold ${dark ? 'border border-solid border-wall-night-ink-2 bg-transparent text-wall-night-ink' : 'border border-solid border-wall-stone bg-transparent text-wall-ink-2'}`}>{label}</button>
    )
    const dragging = drag?.id === s.id
    if (s.child) {
      return (
        <div key={s.id} ref={(el) => { if (el) rowRefs.current.set(s.id, el); else rowRefs.current.delete(s.id) }}
          className={`relative flex min-h-[74px] shrink-0 items-center gap-[8px] ${dragging ? 'z-10 rounded-[14px] bg-wall-on-pigment shadow-[0_18px_36px_rgba(38,34,29,0.28)]' : ''}`}
          style={dragging ? { transform: `translateY(${drag!.dy}px)` } : undefined}>
          <Grip title={s.title} onDown={startDrag(s.id)} />
          <div className={`my-[6px] flex min-w-0 flex-1 items-center gap-[14px] rounded-[14px] border-[1.5px] border-solid px-[14px] py-[8px] ${dark ? 'border-wall-night-brass text-wall-night-ink' : 'border-wall-brass text-wall-ink'}`}>
            <div className="flex min-w-0 flex-1 flex-col gap-[4px]">
              <span className="flex items-baseline gap-[10px]"><span className="truncate text-wall-body font-bold">{s.child.title}</span><span className={`shrink-0 text-wall-label font-bold tracking-[0.15em] ${dark ? 'text-wall-night-brass' : 'text-wall-brass-ink'}`}>A PROJECT INSIDE</span></span>
              <span className="flex items-center gap-[12px]">
                <span aria-hidden="true" className="flex h-[8px] w-[160px] shrink-0 gap-[3px]">
                  {Array.from({ length: Math.max(1, s.child.total) }, (_, i) => <span key={i} className={`h-[8px] flex-1 rounded-full ${i < s.child!.done ? SEGMENT.done : i === s.child!.done ? (dark ? 'bg-wall-night-brass' : SEGMENT.now) : SEGMENT.later}`} />)}
                </span>
                <span className={`truncate text-wall-label ${dark ? 'text-wall-night-ink-2' : 'text-wall-ink-2'}`}>{s.child.done} of {s.child.total}{s.child.next ? ` · next: ${s.child.next}` : ''}</span>
              </span>
            </div>
            <button type="button" onClick={(e) => { e.stopPropagation(); onOpenProject(s.child!.id) }} className={`h-[44px] shrink-0 rounded-full border border-solid bg-transparent px-[14px] text-wall-label font-semibold ${dark ? 'border-wall-night-ink-2 text-wall-night-ink' : 'border-wall-ink-2 text-wall-ink'}`}>Open</button>
            <button type="button" onClick={(e) => { e.stopPropagation(); edit('take_out', { step_id: s.id }) }} className={`h-[44px] shrink-0 rounded-full border border-solid bg-transparent px-[14px] text-wall-label font-semibold ${dark ? 'border-wall-night-ink-2 text-wall-night-ink' : 'border-wall-ink-2 text-wall-ink'}`}>Take it out</button>
          </div>
        </div>
      )
    }
    return (
      <div key={s.id} ref={(el) => { if (el) rowRefs.current.set(s.id, el); else rowRefs.current.delete(s.id) }}
        className={`relative flex h-[58px] shrink-0 items-center gap-[6px] ${picked === s.id ? 'rounded-[14px] border-2 border-solid border-wall-brass' : ''} ${dragging ? `z-10 rounded-[14px] ${dark ? 'bg-wall-ink' : 'bg-wall-on-pigment'} shadow-[0_18px_36px_rgba(38,34,29,0.28)]` : ''} ${dark ? 'text-wall-night-ink' : 'text-wall-ink'}`}
        style={dragging ? { transform: `translateY(${drag!.dy}px)` } : undefined}>
        <Grip title={s.title} onDown={startDrag(s.id)} />
        <button type="button" aria-label={`Mark ${s.title} done`} onClick={(e) => { e.stopPropagation(); edit('done_step', { step_id: s.id }) }} className="flex h-[44px] w-[44px] shrink-0 items-center justify-center border-0 bg-transparent p-0">
          <span className={`h-[28px] w-[28px] rounded-full border-2 border-solid ${dark ? 'border-wall-night-brass' : 'border-wall-ink-2'}`} />
        </button>
        <button type="button" aria-label={`Open ${s.title}`} onClick={(e) => { e.stopPropagation(); setQuick(null); setPicked((p) => (p === s.id ? null : s.id)) }} className={`min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-left text-wall-body ${dark ? 'font-bold text-wall-night-ink' : 'font-semibold text-wall-ink'}`}>{s.title}</button>
        <span className="flex gap-[6px]">
          {chip(effortText(s.minutes) || 'Time?', `Change the time for ${s.title}`, () => setQuick((q) => (q?.stepId === s.id && q.kind === 'effort' ? null : { stepId: s.id, kind: 'effort' })))}
          {s.cost_cents ? chip(moneyText(s.cost_cents), `Change the cost of ${s.title}`, () => setPad({ what: 'cost', stepId: s.id })) : null}
          {chip(s.who ?? 'Who?', `Change who does ${s.title}`, () => setQuick((q) => (q?.stepId === s.id && q.kind === 'who' ? null : { stepId: s.id, kind: 'who' })))}
        </span>
        {quick?.stepId === s.id && (
          <div className="absolute right-[10px] top-[56px] z-30 flex w-[600px] flex-col gap-[10px] rounded-[16px] border border-solid border-wall-ink-2 bg-wall-on-pigment px-[16px] py-[14px] text-wall-ink shadow-[0_14px_30px_rgba(38,34,29,0.22)]" onClick={(e) => e.stopPropagation()}>
            <span className="flex justify-between text-wall-label text-wall-ink-2"><span className="font-bold tracking-[0.2em]">{quick.kind === 'effort' ? 'TIME' : 'WHO'}</span><span>a quick change · tap the step for everything</span></span>
            {quick.kind === 'effort'
              ? <EffortChoices minutes={s.minutes} onPick={(m) => { setStep(s.id, { minutes: m, repeat_minutes: '', repeat_count: '' }); setQuick(null) }} onOther={() => { setQuick(null); setPad({ what: 'effort', stepId: s.id }) }} />
              : <div className="flex flex-wrap gap-[7px]">{whoOptions(project).map((p) => <Pill key={p} label={p} on={s.who === p} onClick={() => { setStep(s.id, { who: p }); setQuick(null) }} />)}</div>}
          </div>
        )}
      </div>
    )
  }

  const thenLine = (at: number) => (
    <div key={`then-${at}`} ref={(el) => { if (el) lineRefs.current.set(at, el); else lineRefs.current.delete(at) }}
      className={`flex h-[44px] shrink-0 items-center gap-[12px] ${drag?.target?.kind === 'new' && drag.target.at === at ? 'rounded-[10px] bg-wall-brass/20' : ''}`}>
      <span className="pl-[6px] text-wall-label font-bold tracking-[0.25em] text-wall-brass-ink">THEN</span>
      <span className="h-px flex-1 bg-wall-brass" />
      <button type="button" onClick={(e) => { e.stopPropagation(); setTyping({ what: 'add', at: { kind: 'new', at }, value: '' }) }} className="h-[40px] rounded-full border border-dashed border-wall-ink-2 bg-transparent px-[14px] text-wall-label font-semibold text-wall-ink-2">+ Add here</button>
    </div>
  )
  const sideBySide = (dark: boolean) => <span className={`pl-[48px] text-wall-label font-bold tracking-[0.15em] ${dark ? 'text-wall-night-ink-2' : 'text-wall-ink-2'}`}>SIDE BY SIDE · ANY ORDER</span>
  // Steps are numbered among themselves (a project inside isn't a step): "Step 7 of 9".
  const own = [...done, ...flat].filter((s) => !s.child_project_id)
  const number = (id: string) => own.findIndex((s) => s.id === id) + 1

  const bar: SegmentKind[] = [...done.map(() => 'done' as const), ...flat.map((s) => (s.child ? 'inside' as const : groups[0]?.some((x) => x.id === s.id) ? 'now' as const : 'later' as const))]
  const theirs = stats.theirs.map((t) => `${effortText(t.minutes)} of the ${t.who.toLowerCase()}’s`).join(', ')

  return (
    <section data-no-swipe aria-label={`${project.title} — project`} className="absolute inset-0 z-20 flex flex-col gap-[14px] bg-wall-ground px-[44px] py-[36px] font-body text-wall-ink" onClick={() => { setQuick(null) }}>
      <div className="flex shrink-0 items-end justify-between gap-[24px]">
        <div className="flex min-w-0 flex-col gap-[6px]">
          <span className="text-wall-label font-bold tracking-[0.2em] text-wall-brass-ink">TO DO › PROJECTS{detail.parent ? ` › INSIDE ${detail.parent.title.toUpperCase()}` : ''}</span>
          <button type="button" aria-label="Rename the project" onClick={(e) => { e.stopPropagation(); setTyping({ what: 'rename', value: project.title }) }} className="min-w-0 truncate border-0 bg-transparent p-0 text-left font-display text-wall-move font-semibold leading-none text-wall-ink">{typing?.what === 'rename' ? typing.value || ' ' : project.title}</button>
        </div>
        <div className="flex shrink-0 gap-[12px]">
          {/* Change it by talking (P3.25 phase 4; Jake: "where is the button to invoke AI on the project screen?"). */}
          {onTalk && <button type="button" onClick={(e) => { e.stopPropagation(); onTalk(`Let’s work on the ${project.title} project.`) }} className="flex h-[52px] items-center gap-[10px] rounded-full border-0 bg-wall-ink px-[22px] text-wall-detail font-semibold text-wall-on-pigment"><Mic size={20} aria-hidden="true" />Talk to Casa about it</button>}
          <button type="button" onClick={(e) => { e.stopPropagation(); setSettings(true) }} className="h-[52px] rounded-full border border-solid border-wall-ink-2 bg-transparent px-[22px] text-wall-detail font-semibold text-wall-ink">Project settings</button>
          {detail.parent && <button type="button" onClick={(e) => { e.stopPropagation(); onOpenProject(detail.parent!.id) }} className="h-[52px] rounded-full border border-solid border-wall-ink-2 bg-transparent px-[22px] text-wall-detail font-semibold text-wall-ink">Back to {detail.parent.title}</button>}
          <button type="button" onClick={(e) => { e.stopPropagation(); onBack() }} className="h-[52px] rounded-full border border-solid border-wall-ink-2 bg-transparent px-[22px] text-wall-detail font-semibold text-wall-ink">Back to the list</button>
        </div>
      </div>

      {/* A project replaced by another ("Changed to Chucky", P3.25 phase 4): closed, kept, reopenable. */}
      {project.status === 'dropped' && (
        <div className="flex shrink-0 items-center gap-[16px] rounded-[16px] border-2 border-solid border-wall-rust px-[20px] py-[12px]">
          <span className="text-wall-label font-bold tracking-[0.2em] text-wall-rust">CLOSED</span>
          <span className="min-w-0 flex-1 truncate text-wall-body">{project.closed_reason ? `${project.closed_reason.replace(/[.!]$/, '')}.` : 'This project is closed.'} Nothing here is on your list or calendar.</span>
          <button type="button" onClick={(e) => { e.stopPropagation(); edit('reopen', {}) }} className="h-[52px] shrink-0 rounded-full border border-solid border-wall-ink-2 bg-transparent px-[22px] text-wall-detail font-semibold text-wall-ink">Reopen</button>
        </div>
      )}
      <div aria-hidden="true" className="flex h-[12px] shrink-0 gap-[4px]">
        {bar.map((k, i) => <span key={i} className={`h-[12px] flex-1 rounded-full ${SEGMENT[k]}`} />)}
      </div>

      <div className="flex shrink-0 gap-[14px]">
        {[
          ['STEPS', `${stats.done} of ${stats.total} done`, stats.inside.length ? `plus ${stats.inside.map((c) => `${c.title}, ${c.done} of ${c.total}`).join('; ')}` : `${stats.total - stats.done} to go`, false],
          ['YOUR TIME LEFT', stats.yourMinutes ? `~${hoursText(stats.yourMinutes)}` : '—', theirs ? `and ${theirs}` : 'yours and Kelly’s', false],
          ['MONEY LEFT', stats.moneyLeft ? moneyText(stats.moneyLeft) : '—', stats.budget ? `of a ${moneyText(stats.budget)} budget` : 'no budget set', Boolean(stats.budget && stats.moneyLeft + stats.spent > stats.budget)],
          ['TARGET', project.aim_date ? niceDate(project.aim_date) : 'No target', stats.finish ? `At your pace: ${niceDate(stats.finish, { month: 'short', day: 'numeric' })}${stats.lateBy ? `, ${stats.lateBy} days late` : ''}` : stats.daysLeft != null ? `in ${stats.daysLeft} days` : 'set one in Project settings', Boolean(stats.lateBy)],
        ].map(([k, v, sub, warn]) => (
          <div key={String(k)} className="flex min-w-0 flex-1 flex-col gap-[3px] rounded-[16px] border border-solid border-wall-stone bg-wall-on-pigment/50 px-[18px] py-[12px]">
            <span className="text-wall-label font-bold tracking-[0.15em] text-wall-ink-2">{k}</span>
            <span className="truncate font-display text-wall-date font-bold leading-none">{v}</span>
            <span className={`truncate text-wall-label font-semibold ${warn ? 'text-wall-rust' : 'text-wall-ink-2'}`}>{sub}</span>
          </div>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 gap-[40px]">
        <div className="flex min-w-0 flex-[1.45] flex-col">
          <div className="flex h-[44px] shrink-0 items-center justify-between">
            <span className="text-wall-label font-bold tracking-[0.2em] text-wall-ink-2">THE PLAN · TOP TO BOTTOM IS THE ORDER</span>
            {done.length > 0 && <button type="button" onClick={(e) => { e.stopPropagation(); setShowDone((v) => !v) }} className="h-[44px] border-0 bg-transparent px-[6px] text-wall-label font-semibold text-wall-ink-2 underline underline-offset-4">{showDone ? 'Hide the done ones' : `${done.length} done · show them`}</button>}
          </div>
          <div ref={listRef} className="relative flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
            {showDone && done.map((s) => (
              <div key={s.id} className="flex h-[44px] shrink-0 items-center gap-[12px] border-0 border-t border-solid border-wall-rule text-wall-ink-2">
                <span aria-hidden="true" className="ml-[44px] flex h-[26px] w-[26px] items-center justify-center rounded-full bg-wall-brass text-wall-label font-bold text-wall-on-pigment">✓</span>
                <span className="min-w-0 flex-1 truncate text-wall-detail line-through">{s.child?.title ?? s.title}</span>
                {s.child?.status === 'dropped' && <span className="shrink-0 text-wall-label font-bold tracking-[0.15em] text-wall-rust">CLOSED{s.child.closed_reason ? ` · ${s.child.closed_reason.toUpperCase()}` : ''}</span>}
                {s.child && <button type="button" onClick={(e) => { e.stopPropagation(); onOpenProject(s.child!.id) }} className="h-[44px] shrink-0 border-0 bg-transparent px-[8px] text-wall-label text-wall-ink-2 underline">Open</button>}
                {!s.child && <button type="button" onClick={(e) => { e.stopPropagation(); edit('undo_step', { step_id: s.id }) }} className="h-[44px] border-0 bg-transparent px-[8px] text-wall-label text-wall-ink-2 underline">Undo</button>}
              </div>
            ))}
            {groups.length === 0 && <span className="py-[20px] font-display text-wall-date italic text-wall-ink-2">Nothing left to do. Add a step, or it’s done.</span>}
            {groups.map((g, gi) => (
              gi === 0 ? (
                <div key="now" className="flex shrink-0 flex-col rounded-[18px] bg-wall-ink py-[8px] pl-[8px] pr-[14px]">
                  <span className="flex items-center justify-between pb-[2px] pl-[48px]">
                    <span className="text-wall-label font-bold tracking-[0.25em] text-wall-night-brass">{project.status === 'dropped' ? 'NOT GOING · CLOSED' : `NOW${project.phone === 'none' ? '' : ' · ON YOUR PHONE'}`}</span>
                    {g.length > 1 && sideBySide(true)}
                  </span>
                  {g.map((s) => row(s, true))}
                </div>
              ) : (
                <div key={`g-${g[0].id}`} className="flex shrink-0 flex-col">
                  {thenLine(gi)}
                  {g.length > 1 && sideBySide(false)}
                  {g.map((s) => row(s, false))}
                </div>
              )
            ))}
            {dropY != null && <span aria-hidden="true" className="pointer-events-none absolute left-[40px] right-0 z-20 h-[4px] rounded-full bg-wall-brass" style={{ top: dropY - 2 }} />}
          </div>
          <div className="flex shrink-0 gap-[10px] pt-[10px]">
            <button type="button" onClick={(e) => { e.stopPropagation(); setTyping({ what: 'add', value: '' }) }} className="h-[48px] rounded-full border-[1.5px] border-dashed border-wall-ink-2 bg-transparent px-[20px] text-wall-detail font-semibold text-wall-ink">+ Add a step</button>
            <button type="button" onClick={(e) => { e.stopPropagation(); setChoose({ what: 'child' }) }} className="h-[48px] rounded-full border-[1.5px] border-dashed border-wall-ink-2 bg-transparent px-[20px] text-wall-detail font-semibold text-wall-ink">+ Add a project inside</button>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-[12px]">
          {pickedStep ? (
            <WallStepPanel
              detail={detail}
              step={pickedStep}
              number={number(pickedStep.id)}
              total={own.length}
              onSet={(args) => setStep(pickedStep.id, args)}
              onAsk={ask(pickedStep)}
              onDone={() => { edit('done_step', { step_id: pickedStep.id }); setPicked(null) }}
              onMove={(dir) => arrange(nudgeStep(openIds, pickedStep.id, dir))}
              onMoveTo={() => setChoose({ what: 'move_to', stepId: pickedStep.id })}
              onDelete={() => setConfirmDelete(pickedStep.id)}
              onClose={() => setPicked(null)}
            />
          ) : (
            <>
              <span className="text-wall-label font-bold tracking-[0.2em] text-wall-ink-2">WHO’S ON IT</span>
              <div className="flex flex-col rounded-[18px] border border-solid border-wall-stone bg-wall-on-pigment/50 px-[20px] py-[6px]">
                {project.people.map((p) => {
                  const count = flat.filter((s) => s.who === p.name).length
                  return (
                    <div key={p.name} className="flex h-[48px] items-center gap-[12px] border-0 border-t border-solid border-wall-stone first:border-t-0">
                      <span className="w-[110px] truncate text-wall-label font-bold tracking-[0.1em] text-wall-ink-2">{(p.role ?? 'you').toUpperCase()}</span>
                      <span className="min-w-0 flex-1 truncate text-wall-detail font-bold">{p.name}</span>
                      <span className="text-wall-label text-wall-ink-2">{count ? `${count} step${count === 1 ? '' : 's'}` : ''}</span>
                    </div>
                  )
                })}
              </div>
              <span className="pt-[4px] text-wall-label font-bold tracking-[0.2em] text-wall-ink-2">NOTES</span>
              <button type="button" onClick={(e) => { e.stopPropagation(); setTyping({ what: 'notes-project', value: project.notes ?? '' }) }} className="min-h-[60px] rounded-[18px] border border-dashed border-wall-rule bg-transparent px-[18px] py-[12px] text-left text-wall-detail text-wall-ink">{project.notes || 'Add a note about the project'}</button>
              <span className="mt-auto text-wall-detail text-wall-ink-2">Tap a step to see and change all of it here. Tap its time or who for a quick change. Hold the handle to drag it.</span>
            </>
          )}
        </div>
      </div>

      {confirmDelete && (
        <WallChooser title={`Delete “${stepFor(confirmDelete)?.title ?? 'this step'}”? It leaves your phone too.`} options={[{ key: 'yes', label: 'Delete it' }]}
          onPick={() => { edit('delete_step', { step_id: confirmDelete }); setConfirmDelete(null); setPicked(null) }} onCancel={() => setConfirmDelete(null)} />
      )}
      {choose && (
        <WallChooser
          title={choose.what === 'move_to' ? 'Move this step to…' : 'A project inside this one'}
          options={choose.what === 'move_to'
            ? (detail.others ?? []).map((o) => ({ key: o.id, label: o.title }))
            : [{ key: '@new', label: 'A new project…', detail: 'Give it a name; its steps go on its own page' }, ...(detail.others ?? []).map((o) => ({ key: o.id, label: o.title, detail: 'one you already have' }))]}
          onPick={(key) => {
            const c = choose
            setChoose(null)
            if (c.what === 'move_to') { edit('move_to', { step_id: c.stepId, project_id: key }); setPicked(null) }
            else if (key === '@new') setTyping({ what: 'child', at: c.at, value: '' })
            else edit('add_child', { project_id: key, arrange: arrangement(detail, placeNew(openIds, c.at ?? { kind: 'new', at: openIds.length })) })
          }}
          onCancel={() => setChoose(null)}
        />
      )}
      {pad && (
        <WallNumberPad
          label={pad.what === 'cost' ? `Cost of ${stepFor(pad.stepId)?.title ?? 'the step'}` : `Time for ${stepFor(pad.stepId)?.title ?? 'the step'}`}
          prefix={pad.what === 'cost' ? '$' : ''}
          initial={pad.what === 'cost' ? (stepFor(pad.stepId)?.cost_cents ?? 0) / 100 || null : null}
          units={pad.what === 'effort' ? ['hours', 'days', 'minutes'] : undefined}
          onDone={(v, unit) => {
            const id = pad.stepId
            setPad(null)
            if (pad.what === 'cost') setStep(id, { cost_cents: v == null ? '' : Math.round(v * 100) })
            else setStep(id, { minutes: v == null ? '' : Math.round(v * (unit === 'days' ? 480 : unit === 'hours' ? 60 : 1)), repeat_minutes: '', repeat_count: '' })
          }}
          onCancel={() => setPad(null)}
        />
      )}
      {typing && (
        <>
          {/* With Casa's keyboard, what's typed shows above it; on a computer it's typed in place (WallKeyboard). */}
          {!deviceKeyboardHere() && <div className="absolute bottom-[430px] left-0 z-30 flex h-[84px] w-[1920px] items-center gap-[24px] bg-wall-on-pigment px-[44px]" onClick={(e) => e.stopPropagation()}>
            <span className="shrink-0 text-wall-label font-bold tracking-[0.2em] text-wall-brass-ink">{TYPING_LABEL[typing.what]}</span>
            <span className="min-w-0 truncate font-display text-wall-date font-semibold">{typing.value}<span className="text-wall-brass">|</span></span>
            <button type="button" onClick={() => setTyping(null)} className="ml-auto h-[52px] shrink-0 rounded-full border border-solid border-wall-ink-2 bg-transparent px-[22px] text-wall-detail font-semibold text-wall-ink">Cancel</button>
          </div>}
          <WallKeyboard key={`${typing.what}:${typing.stepId ?? ''}`} showsValue value={typing.value} onChange={(value) => setTyping((t) => t && { ...t, value })} onDone={finishTyping} onCancel={() => setTyping(null)} />
        </>
      )}
    </section>
  )
}
