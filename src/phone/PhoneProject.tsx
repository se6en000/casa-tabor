import { useSheetSwipe } from './phoneShell'
import { useState, type ReactNode } from 'react'
import {
  EFFORT_CHOICES, FITS, applyProjectEdit, arrangement, doneSteps, effortText, hoursText, moneyText, nudgeStep, placeNew, planGroups, projectStats, whoOptions,
  type ProjectDetail, type ProjectStep,
} from '../wall/projectModel'
import { SEGMENT, type SegmentKind } from '../wall/projectStyle'
import { Answer } from './PhoneTodo'

// A project on the phone (FAMILY_WALL_PLAN.md P3.22 step 7; the wall's canvas 10b–10d in one column):
// the same page — Now in dark, "Then" between groups, the project inside, what's left — with the same
// step details and the same Project settings, typed with the phone's own keyboard and pickers. The
// order changes with ↑ / ↓ in a step's details (no dragging on a phone that also scrolls).

export interface PhoneProjectProps {
  detail: ProjectDetail
  today: string
  onEdit: (op: string, args?: Record<string, unknown>) => Promise<unknown>
  onBack: () => void
  onOpenProject: (id: string) => void
  /** Opens Ask Casa talking about this project (P3.25 phase 4). */
  onTalk?: () => void
}

const niceDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })

function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const swipe = useSheetSwipe(onClose)
  return (
    <div className="absolute inset-0 z-40 flex items-end bg-wall-ink/30" onClick={onClose}>
      <section {...swipe} aria-label={label} className="flex max-h-[90%] w-full flex-col gap-[12px] overflow-y-auto rounded-t-[26px] bg-phone-ground px-[20px] pb-[max(30px,calc(env(safe-area-inset-bottom)+12px))] pt-[18px]" onClick={(e) => e.stopPropagation()}>
        {children}
      </section>
    </div>
  )
}

const Label = ({ children }: { children: string }) => <span className="text-phone-label font-bold tracking-[0.16em] text-wall-ink-2">{children}</span>

function Pill({ label, on = false, onClick }: { label: string; on?: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={`h-[40px] shrink-0 whitespace-nowrap rounded-full px-[12px] text-phone-detail font-semibold ${on ? 'border-0 bg-wall-ink text-wall-on-pigment' : 'border border-solid border-wall-stone bg-transparent text-wall-ink'}`}>
      {label}
    </button>
  )
}

function Toggle({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onClick} className={`relative h-[32px] w-[52px] shrink-0 rounded-full border-0 p-0 ${on ? 'bg-wall-ink' : 'bg-wall-stone'}`}>
      <span className={`absolute top-[4px] h-[24px] w-[24px] rounded-full bg-wall-on-pigment ${on ? 'left-[24px]' : 'left-[4px]'}`} />
    </button>
  )
}

const field = 'h-[44px] rounded-[12px] border border-solid border-wall-stone bg-wall-on-pigment px-[12px] text-phone-body text-wall-ink'

/** A step's details: the same controls, in the same order, as the wall's (canvas 10c). */
function StepSheet({ detail, step, number, total, onSet, onDone, onMove, onSplit, onMoveTo, onDelete, onClose }: {
  detail: ProjectDetail; step: ProjectStep; number: number; total: number
  onSet: (args: Record<string, unknown>) => void; onDone: () => void; onMove: (dir: 'up' | 'down') => void
  onSplit: (title: string) => void; onMoveTo: (id: string) => void; onDelete: () => void; onClose: () => void
}) {
  const [title, setTitle] = useState(step.title)
  const [split, setSplit] = useState('')
  const [confirm, setConfirm] = useState(false)
  const repeat = Boolean(step.repeat_minutes && step.repeat_count)
  const fits = new Set(step.fits)
  return (
    <Sheet label={`${step.title} — details`} onClose={onClose}>
      <span className="text-phone-label font-bold tracking-[0.14em] text-wall-brass-ink">STEP {number} OF {total} · {detail.project.title.toUpperCase()}</span>
      <input aria-label="The step" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() && title.trim() !== step.title && onSet({ title: title.trim() })} className={`${field} font-display text-phone-heading font-semibold`} />

      <Label>WHO</Label>
      <div className="flex flex-wrap gap-[6px]">{whoOptions(detail.project).map((p) => <Pill key={p} label={p} on={step.who === p} onClick={() => onSet({ who: step.who === p ? '' : p })} />)}</div>

      <Label>EFFORT</Label>
      <div className="flex flex-wrap gap-[6px]">
        {EFFORT_CHOICES.map((c) => <Pill key={c.minutes} label={c.label} on={step.minutes === c.minutes && !repeat} onClick={() => onSet({ minutes: c.minutes, repeat_minutes: '', repeat_count: '' })} />)}
        <label className="flex h-[40px] items-center gap-[4px] rounded-full border border-solid border-wall-stone px-[10px] text-phone-detail text-wall-ink">
          <input aria-label="Hours" type="number" inputMode="decimal" min="0" placeholder="hrs" defaultValue={step.minutes && !EFFORT_CHOICES.some((c) => c.minutes === step.minutes) ? step.minutes / 60 : ''}
            onBlur={(e) => e.target.value && onSet({ minutes: Math.round(Number(e.target.value) * 60), repeat_minutes: '', repeat_count: '' })} className="w-[46px] border-0 bg-transparent text-phone-detail text-wall-ink" />
          hr
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-[8px]">
        <Toggle on={repeat} label="The same job, many times" onClick={() => onSet(repeat ? { repeat_minutes: '', repeat_count: '' } : { repeat_minutes: 20, repeat_count: 2, repeat_unit: step.repeat_unit ?? 'times' })} />
        <span className="text-phone-detail">Same job, many times</span>
        {repeat && (
          <span className="flex items-center gap-[6px] text-phone-detail">
            <input aria-label="Minutes each" type="number" inputMode="numeric" min="1" defaultValue={step.repeat_minutes!} onBlur={(e) => Number(e.target.value) > 0 && onSet({ repeat_minutes: Number(e.target.value), repeat_count: step.repeat_count })} className={`${field} w-[64px]`} />
            min ×
            <input aria-label="How many" type="number" inputMode="numeric" min="1" defaultValue={step.repeat_count!} onBlur={(e) => Number(e.target.value) > 0 && onSet({ repeat_minutes: step.repeat_minutes, repeat_count: Number(e.target.value) })} className={`${field} w-[56px]`} />
            <input aria-label="What's counted" defaultValue={step.repeat_unit ?? 'times'} onBlur={(e) => onSet({ repeat_unit: e.target.value, repeat_minutes: step.repeat_minutes, repeat_count: step.repeat_count })} className={`${field} w-[96px]`} />
          </span>
        )}
      </div>
      {step.minutes ? <span className="text-phone-detail text-wall-ink-2">Now: {effortText(step.minutes)}</span> : null}

      <Label>COST</Label>
      <label className="flex items-center gap-[6px] text-phone-body">$
        <input aria-label="Cost" type="number" inputMode="decimal" min="0" placeholder="optional" defaultValue={step.cost_cents ? step.cost_cents / 100 : ''} onBlur={(e) => onSet({ cost_cents: e.target.value === '' ? '' : Math.round(Number(e.target.value) * 100) })} className={`${field} w-[120px]`} />
      </label>
      <div className="flex items-center gap-[8px]">
        <Toggle on={Boolean(step.shop_item)} label="Put it on the shopping list" onClick={() => onSet({ shop_item: step.shop_item ? '' : step.title })} />
        <span className="text-phone-detail">{step.shop_item ? `On the shopping list: ${step.shop_item}` : 'Nothing to buy'}</span>
      </div>

      <Label>WHEN IT FITS</Label>
      <div className="flex flex-wrap gap-[6px]">{FITS.map((f) => <Pill key={f.key} label={f.label} on={fits.has(f.key)} onClick={() => onSet({ fits: fits.has(f.key) ? step.fits.filter((x) => x !== f.key) : [...step.fits, f.key] })} />)}</div>

      <Label>ON THE CALENDAR</Label>
      <div className="flex flex-wrap items-center gap-[8px] text-phone-detail">
        <input aria-label="From" type="date" value={step.cal_start ?? ''} onChange={(e) => onSet({ cal_start: e.target.value })} className={field} />
        {step.cal_start && <>to<input aria-label="To (optional)" type="date" value={step.cal_end ?? ''} min={step.cal_start} onChange={(e) => onSet({ cal_end: e.target.value })} className={field} /></>}
        {step.cal_start && <Pill label="Off the calendar" onClick={() => onSet({ cal_start: '' })} />}
      </div>

      <Label>NOTES</Label>
      <textarea aria-label="Notes" defaultValue={step.notes ?? ''} onBlur={(e) => e.target.value !== (step.notes ?? '') && onSet({ notes: e.target.value })} rows={2} className="rounded-[12px] border border-solid border-wall-stone bg-wall-on-pigment p-[10px] text-phone-body text-wall-ink" />

      <div className="flex flex-wrap gap-[6px] pt-[4px]">
        <Answer label="Done" primary onClick={onDone} />
        <Answer label="↑ Earlier" onClick={() => onMove('up')} />
        <Answer label="↓ Later" onClick={() => onMove('down')} />
        {confirm ? <Answer label="Yes, delete it" onClick={onDelete} /> : <Answer label="Delete…" onClick={() => setConfirm(true)} />}
      </div>
      <div className="flex items-center gap-[6px]">
        <input aria-label="Split it up: the next part" value={split} onChange={(e) => setSplit(e.target.value)} placeholder="Split it up: the next part…" className={`${field} min-w-0 flex-1`} />
        <Answer label="Add" onClick={() => { if (split.trim()) { onSplit(split.trim()); setSplit('') } }} />
      </div>
      {(detail.others ?? []).length > 0 && (
        <label className="flex items-center gap-[6px] text-phone-detail text-wall-ink-2">Move to
          <select aria-label="Move to another project" defaultValue="" onChange={(e) => e.target.value && onMoveTo(e.target.value)} className={`${field} min-w-0 flex-1`}>
            <option value="" disabled>another project…</option>
            {(detail.others ?? []).map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
          </select>
        </label>
      )}
      <Answer label="Close" onClick={onClose} />
    </Sheet>
  )
}

/** Project settings: the same screen for every project (canvas 10d). */
function SettingsSheet({ detail, onEdit, onClose, onDeleted }: { detail: ProjectDetail; onEdit: (op: string, args?: Record<string, unknown>) => void; onClose: () => void; onDeleted: () => void }) {
  const { project } = detail
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [confirm, setConfirm] = useState(false)
  return (
    <Sheet label="Project settings" onClose={onClose}>
      <span className="text-phone-label font-bold tracking-[0.14em] text-wall-brass-ink">{project.title.toUpperCase()} › SETTINGS</span>
      <span className="font-display text-phone-title font-bold">Project settings</span>
      <Label>THE GOAL</Label>
      <input aria-label="Target date" type="date" value={project.aim_date ?? ''} onChange={(e) => onEdit('settings', { aim_date: e.target.value })} className={field} />
      <div className="flex flex-wrap gap-[6px]">
        <Pill label="Firm: it has to be" on={project.aim_firm} onClick={() => onEdit('settings', { aim_firm: true })} />
        <Pill label="An aim" on={!project.aim_firm} onClick={() => onEdit('settings', { aim_firm: false })} />
      </div>
      <label className="flex items-center gap-[6px] text-phone-body">Budget $
        <input aria-label="Budget" type="number" inputMode="decimal" min="0" defaultValue={project.budget_cents ? project.budget_cents / 100 : ''} onBlur={(e) => onEdit('settings', { budget_cents: e.target.value === '' ? '' : Math.round(Number(e.target.value) * 100) })} className={`${field} w-[140px]`} />
      </label>
      <Label>WHO DOES WHAT</Label>
      {project.people.map((p, i) => (
        <div key={`${p.name}-${i}`} className="flex items-center gap-[8px] border-0 border-t border-solid border-wall-stone py-[6px]">
          <span className="w-[80px] truncate text-phone-label font-bold text-wall-ink-2">{(p.role ?? 'you').toUpperCase()}</span>
          <span className="min-w-0 flex-1 truncate text-phone-body font-semibold">{p.name}</span>
          {project.people.length > 1 && <Answer label="Remove" onClick={() => onEdit('settings', { people: project.people.filter((_, j) => j !== i) })} />}
        </div>
      ))}
      <div className="flex gap-[6px]">
        <input aria-label="Someone new" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className={`${field} min-w-0 flex-1`} />
        <input aria-label="What they do" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Painter" className={`${field} w-[110px]`} />
        <Answer label="Add" onClick={() => { if (name.trim()) { onEdit('settings', { people: [...project.people, { name: name.trim(), role: role.trim() || null }] }); setName(''); setRole('') } }} />
      </div>
      <Label>ON YOUR PHONE</Label>
      <div className="flex flex-wrap gap-[6px]">
        <Pill label="Just the next step" on={project.phone === 'next'} onClick={() => onEdit('settings', { phone: 'next' })} />
        <Pill label="Everything in Now" on={project.phone === 'now'} onClick={() => onEdit('settings', { phone: 'now' })} />
        <Pill label="Nothing" on={project.phone === 'none'} onClick={() => onEdit('settings', { phone: 'none' })} />
      </div>
      <div className="flex items-center gap-[8px]">
        <Toggle on={project.yearly} label="Comes back every year" onClick={() => onEdit('settings', { yearly: !project.yearly })} />
        <span className="text-phone-detail">{project.yearly ? 'Comes back every year, from this year’s steps and times.' : 'A one-time job.'}</span>
      </div>
      <Label>PART OF</Label>
      {detail.parent
        ? <div className="flex items-center gap-[8px] text-phone-detail">Inside <b>{detail.parent.title}</b><Answer label="Take it out" onClick={() => onEdit('part_of', { parent_id: '' })} /></div>
        : (
          <select aria-label="Put it under a project" defaultValue="" onChange={(e) => e.target.value && onEdit('part_of', { parent_id: e.target.value })} className={field}>
            <option value="" disabled>Nothing: it stands on its own</option>
            {(detail.others ?? []).map((o) => <option key={o.id} value={o.id}>Put it under {o.title}</option>)}
          </select>
        )}
      <Label>HOW IT’S GOING</Label>
      <div className="flex flex-wrap items-center gap-[6px]">
        <Pill label="Going" on={project.status === 'active'} onClick={() => onEdit('status', { status: 'active' })} />
        <Pill label="Done" on={project.status === 'done'} onClick={() => onEdit('status', { status: 'done' })} />
        <Pill label="Drop it" on={project.status === 'dropped'} onClick={() => onEdit('status', { status: 'dropped' })} />
        <label className="flex items-center gap-[4px] text-phone-detail">Pause until
          <input aria-label="Pause until" type="date" value={project.status === 'paused' ? project.paused_until ?? '' : ''} onChange={(e) => e.target.value && onEdit('status', { status: 'paused', until: e.target.value })} className={field} />
        </label>
      </div>
      <div className="flex gap-[6px] pt-[6px]">
        <Answer label="Back to the plan" primary onClick={onClose} />
        {confirm ? <Answer label="Yes, delete the project" onClick={() => { onEdit('delete_project'); onDeleted() }} /> : <Answer label="Delete the project…" onClick={() => setConfirm(true)} />}
      </div>
    </Sheet>
  )
}

export default function PhoneProject({ detail: incoming, today, onEdit, onBack, onOpenProject, onTalk }: PhoneProjectProps) {
  const [pending, setPending] = useState<ProjectDetail | null>(null)
  const [seen, setSeen] = useState(incoming)
  if (seen !== incoming) {
    setSeen(incoming)
    setPending(null)
  }
  const detail = pending ?? incoming
  const { project } = detail
  const [picked, setPicked] = useState<string | null>(null)
  const [settings, setSettings] = useState(false)
  const [adding, setAdding] = useState('')
  const [showDone, setShowDone] = useState(false)
  const edit = (op: string, args: Record<string, unknown> = {}) => {
    setPending(applyProjectEdit(detail, op, args))
    void onEdit(op, args)
  }
  const groups = planGroups(detail)
  const openIds = groups.map((g) => g.map((s) => s.id))
  const flat = groups.flat()
  const done = doneSteps(detail)
  const own = [...done, ...flat].filter((s) => !s.child_project_id)
  const stats = projectStats(detail, today)
  const bar: SegmentKind[] = [...done.map(() => 'done' as const), ...flat.map((s) => (s.child ? 'inside' as const : groups[0]?.some((x) => x.id === s.id) ? 'now' as const : 'later' as const))]
  const pickedStep = flat.find((s) => s.id === picked) ?? null

  const row = (s: ProjectStep, dark: boolean) => s.child ? (
    <div key={s.id} className={`my-[4px] flex items-center gap-[8px] rounded-[12px] border-[1.5px] border-solid px-[10px] py-[8px] ${dark ? 'border-wall-night-brass text-wall-night-ink' : 'border-wall-brass text-wall-ink'}`}>
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="text-phone-body font-bold">{s.child.title}</span>
        <span className={`text-phone-label ${dark ? 'text-wall-night-ink-2' : 'text-wall-ink-2'}`}>A project inside · {s.child.done} of {s.child.total}{s.child.next ? ` · next: ${s.child.next}` : ''}</span>
      </span>
      <button type="button" onClick={() => onOpenProject(s.child!.id)} className={`h-[40px] shrink-0 rounded-full border border-solid bg-transparent px-[12px] text-phone-detail font-semibold ${dark ? 'border-wall-night-ink-2 text-wall-night-ink' : 'border-wall-stone text-wall-ink'}`}>Open</button>
    </div>
  ) : (
    <div key={s.id} className={`flex min-h-[52px] items-center gap-[8px] border-0 border-t border-solid ${dark ? 'border-wall-night-rule text-wall-night-ink' : 'border-wall-stone text-wall-ink'}`}>
      <button type="button" aria-label={`Mark ${s.title} done`} onClick={() => edit('done_step', { step_id: s.id })} className="flex h-[44px] w-[36px] shrink-0 items-center justify-center border-0 bg-transparent p-0">
        <span className={`h-[24px] w-[24px] rounded-full border-2 border-solid ${dark ? 'border-wall-night-brass' : 'border-wall-ink-2'}`} />
      </button>
      <button type="button" aria-label={`Open ${s.title}`} onClick={() => setPicked(s.id)} className={`flex min-w-0 flex-1 flex-col border-0 bg-transparent py-[6px] text-left ${dark ? 'text-wall-night-ink' : 'text-wall-ink'}`}>
        <span className="text-phone-body font-semibold">{s.title}</span>
        <span className={`text-phone-label ${dark ? 'text-wall-night-ink-2' : 'text-wall-ink-2'}`}>{[effortText(s.minutes), s.cost_cents ? moneyText(s.cost_cents) : null, s.who, s.cal_start ? niceDate(s.cal_start) : null].filter(Boolean).join(' · ') || 'Tap to add the details'}</span>
      </button>
    </div>
  )

  return (
    <section aria-label={`${project.title} — project`} className="absolute inset-0 z-30 flex flex-col overflow-y-auto bg-phone-ground px-[20px] pb-[30px] pt-[max(18px,calc(env(safe-area-inset-top)+8px))] font-body text-wall-ink">
      <div className="flex items-center justify-between">
        <button type="button" onClick={detail.parent ? () => onOpenProject(detail.parent!.id) : onBack} className="h-[44px] border-0 bg-transparent p-0 text-phone-body font-semibold text-wall-ink">‹ {detail.parent ? detail.parent.title : 'To do'}</button>
        <span className="flex gap-[8px]">
          {onTalk && <Answer label="Talk to Casa" primary onClick={onTalk} />}
          <Answer label="Settings" onClick={() => setSettings(true)} />
        </span>
      </div>
      <span className="pt-[4px] text-phone-label font-bold tracking-[0.14em] text-wall-brass-ink">{project.yearly ? 'SEASONAL · EVERY YEAR' : 'PROJECT'}</span>
      <h1 className="m-0 font-display text-phone-title font-bold leading-tight">{project.title}</h1>
      {/* A project replaced ("Changed to Chucky", P3.25 phase 4): closed, kept, reopenable — as on the wall. */}
      {project.status === 'dropped' && (
        <div className="mt-[8px] flex items-center gap-[10px] rounded-[14px] border-2 border-solid border-wall-rust px-[12px] py-[8px]">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-phone-label font-bold tracking-[0.16em] text-wall-rust">CLOSED</span>
            <span className="text-phone-detail">{project.closed_reason ? `${project.closed_reason.replace(/[.!]$/, '')}.` : 'This project is closed.'} Nothing here is on your list or calendar.</span>
          </span>
          <Answer label="Reopen" onClick={() => edit('reopen', {})} />
        </div>
      )}
      <span aria-hidden="true" className="my-[8px] flex h-[8px] gap-[3px]">{bar.map((k, i) => <span key={i} className={`h-[8px] flex-1 rounded-full ${SEGMENT[k]}`} />)}</span>
      <div className="grid grid-cols-2 gap-[8px]">
        {[
          ['STEPS', `${stats.done} of ${stats.total}`, stats.inside.length ? `plus ${stats.inside[0].title}` : `${stats.total - stats.done} to go`],
          ['YOUR TIME', stats.yourMinutes ? `~${hoursText(stats.yourMinutes)}` : '—', stats.theirs.length ? `and the ${stats.theirs[0].who.toLowerCase()}’s` : 'left'],
          ['MONEY LEFT', stats.moneyLeft ? moneyText(stats.moneyLeft) : '—', stats.budget ? `of ${moneyText(stats.budget)}` : 'no budget'],
          ['TARGET', project.aim_date ? niceDate(project.aim_date) : 'None', stats.finish ? `pace: ${niceDate(stats.finish)}${stats.lateBy ? `, ${stats.lateBy} days late` : ''}` : stats.daysLeft != null ? `in ${stats.daysLeft} days` : ''],
        ].map(([k, v, sub]) => (
          <div key={k} className="flex flex-col rounded-[14px] border border-solid border-wall-stone bg-wall-on-pigment px-[12px] py-[8px]">
            <span className="text-phone-label font-bold tracking-[0.12em] text-wall-ink-2">{k}</span>
            <span className="font-display text-phone-heading font-bold">{v}</span>
            <span className={`truncate text-phone-label ${k === 'TARGET' && stats.lateBy ? 'font-semibold text-wall-rust' : 'text-wall-ink-2'}`}>{sub}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-[14px]">
        <Label>THE PLAN</Label>
        {done.length > 0 && <button type="button" onClick={() => setShowDone((v) => !v)} className="h-[44px] border-0 bg-transparent p-0 text-phone-detail text-wall-ink-2 underline">{showDone ? 'Hide the done ones' : `${done.length} done`}</button>}
      </div>
      {showDone && done.map((s) => (
        <div key={s.id} className="flex min-h-[44px] items-center gap-[8px] text-wall-ink-2">
          <span className="text-phone-detail line-through">{s.child?.title ?? s.title}</span>
          {s.child?.status === 'dropped' && <span className="text-phone-label font-bold tracking-[0.12em] text-wall-rust">CLOSED{s.child.closed_reason ? ` · ${s.child.closed_reason.toUpperCase()}` : ''}</span>}
          {s.child && <button type="button" onClick={() => onOpenProject(s.child!.id)} className="ml-auto h-[44px] border-0 bg-transparent text-phone-label underline text-wall-ink-2">Open</button>}
          {!s.child && <button type="button" onClick={() => edit('undo_step', { step_id: s.id })} className="ml-auto h-[44px] border-0 bg-transparent text-phone-label underline text-wall-ink-2">Undo</button>}
        </div>
      ))}
      {groups.map((g, gi) => gi === 0 ? (
        <div key="now" className="mt-[4px] flex flex-col rounded-[16px] bg-wall-ink px-[10px] py-[8px]">
          <span className="pb-[2px] text-phone-label font-bold tracking-[0.16em] text-wall-night-brass">{project.status === 'dropped' ? 'NOT GOING · CLOSED' : `NOW${project.phone === 'none' ? '' : ' · ON YOUR PHONE'}${g.length > 1 ? ' · SIDE BY SIDE' : ''}`}</span>
          {g.map((s) => row(s, true))}
        </div>
      ) : (
        <div key={g[0].id} className="flex flex-col">
          <span className="flex items-center gap-[8px] pt-[10px]"><span className="text-phone-label font-bold tracking-[0.2em] text-wall-brass-ink">THEN</span><span className="h-px flex-1 bg-wall-brass" />{g.length > 1 && <span className="text-phone-label text-wall-ink-2">side by side</span>}</span>
          {g.map((s) => row(s, false))}
        </div>
      ))}
      <div className="flex gap-[6px] pt-[12px]">
        <input aria-label="A new step" value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="+ Add a step…" className={`${field} min-w-0 flex-1`} />
        <Answer label="Add" onClick={() => { if (adding.trim()) { edit('add_step', { title: adding.trim() }); setAdding('') } }} />
      </div>

      {pickedStep && (
        <StepSheet
          detail={detail}
          step={pickedStep}
          number={own.findIndex((s) => s.id === pickedStep.id) + 1}
          total={own.length}
          onSet={(args) => edit('set_step', { step_id: pickedStep.id, ...args })}
          onDone={() => { edit('done_step', { step_id: pickedStep.id }); setPicked(null) }}
          onMove={(dir) => edit('arrange', { groups: arrangement(detail, nudgeStep(openIds, pickedStep.id, dir)) })}
          onSplit={(title) => {
            const gi = openIds.findIndex((g) => g.includes(pickedStep.id))
            edit('add_step', { title, arrange: arrangement(detail, placeNew(openIds, { kind: 'join', group: gi, index: openIds[gi].indexOf(pickedStep.id) + 1 })) })
          }}
          onMoveTo={(id) => { edit('move_to', { step_id: pickedStep.id, project_id: id }); setPicked(null) }}
          onDelete={() => { edit('delete_step', { step_id: pickedStep.id }); setPicked(null) }}
          onClose={() => setPicked(null)}
        />
      )}
      {settings && <SettingsSheet detail={detail} onEdit={edit} onClose={() => setSettings(false)} onDeleted={onBack} />}
    </section>
  )
}
