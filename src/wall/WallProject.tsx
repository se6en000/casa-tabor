import { useState } from 'react'
import WallDatePicker from './WallDatePicker'
import WallKeyboard from './WallKeyboard'
import type { TodoProjectDetail } from './todos'

// A project in full (P3.22 step 5, board 09c; Jake 2026-09-28: "I have to be able to visualize and
// change the steps to match my real life … reorganize, delete steps" and "a goal/target date").
// Done steps shrink to a line, the next one stands out, later ones are dimmed with their controls.
// Every change goes through todo_project_edit, which keeps his phone showing the current step.

export interface WallProjectProps {
  detail: TodoProjectDetail
  now: Date
  onEdit: (op: string, args?: Record<string, unknown>) => Promise<void>
  onBack: () => void
}

type Typing = { kind: 'rename' } | { kind: 'step'; stepId: string } | { kind: 'add'; afterId: string | null } | null

const size = (minutes: number | null, cents: number | null) =>
  [minutes ? (minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 6) / 10} hr`) : null, cents ? `$${Math.round(cents / 100)}` : null].filter(Boolean).join(' · ')

export default function WallProject({ detail, now, onEdit, onBack }: WallProjectProps) {
  const { project, steps } = detail
  const [typing, setTyping] = useState<Typing>(null)
  const [text, setText] = useState('')
  const [picking, setPicking] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const done = steps.filter((s) => s.done_at)
  const open = steps.filter((s) => !s.done_at)
  const current = open[0] ?? null
  const later = open.slice(1)
  const left = open.reduce((t, s) => ({ minutes: t.minutes + (s.minutes ?? 0), cents: t.cents + (s.cost_cents ?? 0) }), { minutes: 0, cents: 0 })

  const edit = async (op: string, args?: Record<string, unknown>) => {
    setBusy(true)
    try { await onEdit(op, args) } finally { setBusy(false) }
  }
  const startTyping = (t: Typing, value: string) => { setTyping(t); setText(value); setPicking(false) }
  const finishTyping = async () => {
    const value = text.trim()
    const t = typing
    setTyping(null)
    if (!t || !value) return
    if (t.kind === 'rename' && value !== project.title) await edit('rename', { title: value })
    if (t.kind === 'step') await edit('edit_step', { step_id: t.stepId, title: value })
    if (t.kind === 'add') await edit('add_step', { title: value, ...(t.afterId ? { step_id: t.afterId } : {}) })
  }
  const small = 'h-[48px] shrink-0 rounded-full border border-solid border-wall-rule bg-transparent px-[16px] text-wall-detail font-semibold text-wall-ink disabled:opacity-40'
  const target = project.aim_date ? new Date(`${project.aim_date}T12:00:00`) : null
  const daysLeft = target ? Math.round((target.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12).getTime()) / 86400e3) : null

  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-[16px]" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-end justify-between gap-[24px]">
        <div className="flex min-w-0 flex-col gap-[8px]">
          <span className="text-wall-label font-bold tracking-[0.2em] text-wall-brass-ink">TO DO › PROJECTS</span>
          <button type="button" aria-label="Rename the project" onClick={() => startTyping({ kind: 'rename' }, project.title)} className="min-w-0 truncate border-0 bg-transparent p-0 text-left font-display text-wall-move font-semibold leading-none text-wall-ink">
            {typing?.kind === 'rename' ? text || ' ' : project.title}
          </button>
          <span className="flex items-center gap-[14px] text-wall-body text-wall-ink-2">
            <span className="relative inline-block h-[10px] w-[140px] rounded-full bg-wall-stone">
              <span className="absolute left-0 top-0 h-[10px] rounded-full bg-wall-brass" style={{ width: steps.length ? `${(done.length / steps.length) * 100}%` : 0 }} />
            </span>
            {done.length} of {steps.length} steps done
            {left.minutes || left.cents ? ` · about ${size(left.minutes, left.cents)} to go` : ''}
          </span>
        </div>
        <button type="button" onClick={onBack} className={small}>Back to the list</button>
      </div>

      <div className="flex min-h-0 flex-1 gap-[44px]">
        <div className="flex min-w-0 flex-[1.5] flex-col overflow-hidden">
          <span className="pb-[6px] text-wall-label font-bold tracking-[0.2em] text-wall-ink-2">THE PLAN, IN ORDER</span>
          {done.map((s) => (
            <div key={s.id} className="flex h-[48px] shrink-0 items-center gap-[14px] border-0 border-t border-solid border-wall-rule text-wall-ink-2">
              <span aria-hidden="true" className="flex h-[28px] w-[28px] items-center justify-center rounded-full bg-wall-brass text-wall-label font-bold text-wall-on-pigment">✓</span>
              <span className="min-w-0 flex-1 truncate text-wall-detail line-through">{s.title}</span>
              <button type="button" disabled={busy} onClick={() => void edit('undo_step', { step_id: s.id })} className="h-[44px] border-0 bg-transparent px-[8px] text-wall-label text-wall-ink-2 underline">Undo</button>
            </div>
          ))}
          {current && (
            <div className="my-[8px] flex shrink-0 flex-col gap-[10px] rounded-[20px] bg-wall-ink px-[24px] py-[18px] text-wall-on-pigment">
              <span className="text-wall-label font-bold tracking-[0.2em] text-wall-night-brass">NEXT STEP · ON YOUR PHONE</span>
              <span className="font-display text-wall-date font-semibold leading-tight">{typing?.kind === 'step' && typing.stepId === current.id ? text || ' ' : current.title}</span>
              {size(current.minutes, current.cost_cents) && <span className="text-wall-detail text-wall-night-ink-2">{size(current.minutes, current.cost_cents)}</span>}
              <span className="flex gap-[10px]">
                <button type="button" disabled={busy} onClick={() => void edit('done_step', { step_id: current.id })} className="h-[52px] rounded-full border-0 bg-wall-night-brass px-[22px] text-wall-detail font-semibold text-wall-ink disabled:opacity-40">Done</button>
                <button type="button" onClick={() => startTyping({ kind: 'step', stepId: current.id }, current.title)} className="h-[52px] rounded-full border border-solid border-wall-night-ink-2 bg-transparent px-[20px] text-wall-detail font-semibold text-wall-on-pigment">Edit</button>
                <button type="button" disabled={busy || later.length === 0} onClick={() => void edit('move_step', { step_id: current.id, dir: 'down' })} className="h-[52px] rounded-full border border-solid border-wall-night-ink-2 bg-transparent px-[20px] text-wall-detail font-semibold text-wall-on-pigment disabled:opacity-40">Later ↓</button>
              </span>
            </div>
          )}
          {later.map((s, i) => (
            <div key={s.id} className="flex h-[60px] shrink-0 items-center gap-[10px] border-0 border-t border-solid border-wall-rule">
              <span className="w-[28px] text-center text-wall-label font-bold text-wall-ink-2">{done.length + i + 2}</span>
              <span className="min-w-0 flex-1 truncate text-wall-body">{typing?.kind === 'step' && typing.stepId === s.id ? text || ' ' : s.title}</span>
              <span className="shrink-0 text-wall-label text-wall-ink-2">{size(s.minutes, s.cost_cents)}</span>
              <button type="button" aria-label={`Move ${s.title} up`} disabled={busy} onClick={() => void edit('move_step', { step_id: s.id, dir: 'up' })} className={small}>↑</button>
              <button type="button" aria-label={`Move ${s.title} down`} disabled={busy || i === later.length - 1} onClick={() => void edit('move_step', { step_id: s.id, dir: 'down' })} className={small}>↓</button>
              <button type="button" aria-label={`Edit ${s.title}`} onClick={() => startTyping({ kind: 'step', stepId: s.id }, s.title)} className={small}>Edit</button>
              <button type="button" aria-label={`Delete ${s.title}`} disabled={busy} onClick={() => void edit('delete_step', { step_id: s.id })} className={small}>Delete</button>
            </div>
          ))}
          <button type="button" onClick={() => startTyping({ kind: 'add', afterId: null }, '')} className="mt-[10px] h-[52px] self-start rounded-full border border-dashed border-wall-ink-2 bg-transparent px-[22px] text-wall-detail font-semibold text-wall-ink">
            {typing?.kind === 'add' ? `+ ${text || '…'}` : '+ Add a step'}
          </button>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-[14px]">
          <span className="text-wall-label font-bold tracking-[0.2em] text-wall-ink-2">TARGET DATE</span>
          <div className="flex items-center gap-[14px]">
            <span className="font-display text-wall-date font-semibold">
              {target ? target.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: target.getFullYear() === now.getFullYear() ? undefined : 'numeric' }) : 'No target yet'}
            </span>
            {daysLeft != null && <span className={`text-wall-detail ${daysLeft < 0 ? 'font-semibold text-wall-rust' : 'text-wall-ink-2'}`}>{daysLeft < 0 ? `${-daysLeft} days past` : daysLeft === 0 ? 'today' : `in ${daysLeft} days`}</span>}
            <button type="button" onClick={() => { setPicking((p) => !p); setTyping(null) }} className={small}>{target ? 'Change' : 'Set a target'}</button>
          </div>
          {picking && <WallDatePicker value={project.aim_date} now={now} clearLabel="No target" onPick={(d) => { setPicking(false); void edit('target', { date: d }) }} />}
          <div className="mt-auto flex items-center gap-[10px]">
            {confirmDelete ? (
              <>
                <span className="text-wall-detail text-wall-rust">Delete the whole project?</span>
                <button type="button" disabled={busy} onClick={() => void edit('delete_project').then(onBack)} className="h-[48px] rounded-full border-0 bg-wall-rust px-[18px] text-wall-detail font-semibold text-wall-on-pigment">Delete</button>
                <button type="button" onClick={() => setConfirmDelete(false)} className={small}>Keep</button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className={small}>Delete project…</button>
            )}
          </div>
        </div>
      </div>
      {typing && <WallKeyboard value={text} onChange={setText} onDone={() => void finishTyping()} />}
    </div>
  )
}

