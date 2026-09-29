import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { agreeGroups, planChange, planCount, planSections, savedRows, withDependents, type PlanArgs, type PlanItem, type PlanOpen, type PlanResult } from '../wall/plan'

// Plan it with Casa on the phone (FAMILY_WALL_PLAN.md P3.25 phase 3; canvas 12e, approved by Jake
// 2026-09-29): the same draft as the wall's, carried on by typing on the couch; the same one card with
// ticks and one Agree, and what was saved.

const label = 'text-phone-label font-bold tracking-[0.16em]'
const dark = 'h-[44px] rounded-full border-0 bg-wall-ink px-[20px] text-phone-body font-bold text-wall-on-pigment'
const pill = 'h-[44px] rounded-full border border-solid border-wall-ink-2 bg-transparent px-[18px] text-phone-body font-semibold text-wall-ink'

/** The draft, in the conversation (board 12e): steps, then the rest on one line; See it all opens every line. */
export function PhonePlanCard({ plan, previous, working, onSetUp }: { plan: PlanArgs; previous: PlanItem[] | null; working: boolean; onSetUp: () => void }) {
  const [all, setAll] = useState(false)
  const change = planChange(previous, plan.items)
  const sections = planSections(plan.items)
  const steps = sections.find((s) => s.heading === 'STEPS')
  const rest = sections.filter((s) => s !== steps)
  return (
    <section aria-label={`${plan.title} — the plan`} className="flex flex-col gap-[8px] rounded-[18px] border border-solid border-wall-stone bg-wall-on-pigment p-[14px]">
      <div className="flex items-baseline justify-between gap-[10px]">
        <span className="min-w-0 font-display text-phone-heading font-bold leading-tight">{plan.title}</span>
        <span className={`${label} shrink-0 text-wall-brass-ink`}>PLAN · NOT SAVED</span>
      </div>
      {change.line && <span className="self-start rounded-full bg-wall-brass/15 px-[10px] py-[4px] text-phone-detail font-semibold text-wall-brass-ink">{change.line}</span>}
      {steps && (
        <div className="flex flex-col">
          {steps.intro && <span className={`${label} text-wall-ink-2`}>{steps.intro.toUpperCase()}</span>}
          {steps.lines.map((l) => (
            <div key={l.key} className={`flex justify-between gap-[8px] rounded-[8px] px-[6px] py-[5px] text-phone-detail ${change.marked.has(l.key) ? 'bg-wall-brass/15' : ''}`}>
              <span className={l.done ? 'text-wall-ink-2 line-through' : ''}>{l.number ? `${l.number} · ` : ''}{l.text}</span>
              <span className="shrink-0 text-wall-ink-2">{l.meta}</span>
            </div>
          ))}
        </div>
      )}
      {all ? rest.map((s) => (
        <div key={s.heading} className="flex flex-col">
          <span className={`${label} text-wall-brass-ink`}>{s.heading}</span>
          {s.lines.map((l) => <div key={l.key} className={`flex justify-between gap-[8px] px-[6px] py-[3px] text-phone-detail ${change.marked.has(l.key) ? 'rounded-[8px] bg-wall-brass/15' : ''}`}><span>{l.text}</span><span className="shrink-0 text-wall-ink-2">{l.meta}</span></div>)}
        </div>
      )) : rest.length > 0 && (
        <span className="text-phone-detail text-wall-ink-2">+ {rest.map((s) => `${s.lines.length} ${s.heading.toLowerCase()}`).join(' · ')}</span>
      )}
      <div className="flex gap-[8px] pt-[4px]">
        <button type="button" disabled={working} onClick={onSetUp} className={`${dark} flex-1`}>Set it up…</button>
        <button type="button" onClick={() => setAll((a) => !a)} className={pill}>{all ? 'Less' : 'See it all'}</button>
      </div>
    </section>
  )
}

/** One card, one Agree (board 12c), as a sheet: untick to leave out; the rest saves together. */
export function PhonePlanAgree({ plan, working, onAgree, onBack }: { plan: PlanArgs; working: boolean; onAgree: (skip: string[]) => void; onBack: () => void }) {
  const [skip, setSkip] = useState<string[]>([])
  const left = withDependents(plan.items, skip)
  const count = planCount(plan.items, left)
  return (
    <div className="absolute inset-0 z-40 flex items-end bg-wall-ink/30" onClick={onBack}>
      <section aria-label={`Set up ${plan.title}`} onClick={(e) => e.stopPropagation()} className="flex max-h-[92%] w-full flex-col gap-[10px] overflow-y-auto rounded-t-[26px] bg-phone-ground px-[20px] pb-[max(24px,calc(env(safe-area-inset-bottom)+12px))] pt-[18px] text-wall-ink">
        <span className={`${label} text-wall-brass-ink`}>NOTHING IS SAVED UNTIL YOU AGREE</span>
        <span className="font-display text-phone-heading font-bold leading-tight">{plan.title}</span>
        {agreeGroups(plan.items).map((g) => (
          <div key={g.heading} className="flex flex-col">
            <span className={`${label} mt-[6px] text-wall-brass-ink`}>{g.heading}</span>
            {g.rows.map((r) => {
              const on = !left.includes(r.id)
              return (
                <button key={r.id} type="button" aria-pressed={on} onClick={() => setSkip((s) => (s.includes(r.id) ? s.filter((x) => x !== r.id) : [...s, r.id]))}
                  className="flex min-h-[44px] w-full items-center gap-[12px] border-0 border-t border-solid border-wall-stone bg-transparent p-0 text-left text-phone-body text-wall-ink">
                  <span aria-hidden="true" className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[5px] ${on ? 'bg-wall-ink text-wall-on-pigment' : 'border-2 border-solid border-wall-ink-2'}`}>{on && <Check size={14} strokeWidth={3} />}</span>
                  <span className={`min-w-0 flex-1 ${on ? '' : 'text-wall-ink-2 line-through'}`}>{r.label}</span>
                  {r.meta && <span className="shrink-0 text-phone-detail text-wall-ink-2">{r.meta}</span>}
                </button>
              )
            })}
          </div>
        ))}
        <span className="text-phone-detail text-wall-ink-2">You can undo the whole plan until the end of tomorrow.</span>
        <div className="flex gap-[8px]">
          <button type="button" disabled={working || count.things === 0} onClick={() => onAgree(left)} className={`${dark} flex-1`}>{working ? 'Saving…' : `Agree · set up ${count.things}`}</button>
          <button type="button" onClick={onBack} className={pill}>Change</button>
        </div>
      </section>
    </div>
  )
}

/** Saved (board 12d), as a sheet: each line opens where it lives; Undo until the end of the next day. */
export function PhonePlanSaved({ plan, result, working, onOpen, onUndo, onDone }: { plan: PlanArgs; result: PlanResult; working: boolean; onOpen?: (open: PlanOpen) => void; onUndo: () => void; onDone: () => void }) {
  const { rows, left } = savedRows(plan.items, result, plan.skip ?? [])
  const saved = planCount(plan.items, plan.skip ?? [])
  const until = result.undo_until ? new Date(result.undo_until) : null
  const undoable = !result.undone && until != null && until.getTime() > Date.now()
  const lastDay = until ? new Date(until.getTime() - 60_000).toLocaleDateString('en-US', { weekday: 'short' }) : ''
  return (
    <div className="absolute inset-0 z-40 flex items-end bg-wall-ink/30" onClick={onDone}>
      <section aria-label={`${plan.title} — saved`} onClick={(e) => e.stopPropagation()} className="flex max-h-[92%] w-full flex-col gap-[10px] overflow-y-auto rounded-t-[26px] bg-phone-ground px-[20px] pb-[max(24px,calc(env(safe-area-inset-bottom)+12px))] pt-[18px] text-wall-ink">
        <div className="flex items-start justify-between">
          <span className={`${label} text-wall-brass-ink`}>{result.undone ? 'UNDONE' : `SAVED · ${saved.things} ${saved.things === 1 ? 'THING' : 'THINGS'}`}</span>
          <button type="button" aria-label="Close" onClick={onDone} className="flex h-[44px] w-[44px] items-center justify-center rounded-full border border-solid border-wall-stone bg-transparent p-0 text-wall-ink"><X size={18} /></button>
        </div>
        <span className="font-display text-phone-heading font-bold leading-tight">{result.undone ? `${plan.title} is undone` : `${plan.title} is set up`}</span>
        {!result.undone && rows.map((r) => (
          <div key={r.label} className="flex min-h-[44px] items-center gap-[10px] border-0 border-t border-solid border-wall-stone text-phone-body">
            <span aria-hidden="true" className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-wall-brass-ink text-wall-on-pigment"><Check size={13} strokeWidth={3} /></span>
            <span className="min-w-0 flex-1">{r.label}</span>
            {r.open && onOpen && r.open.kind !== 'shopping' && <button type="button" onClick={() => onOpen(r.open!)} className="h-[44px] shrink-0 rounded-full border border-solid border-wall-ink-2 bg-transparent px-[12px] text-phone-detail font-semibold text-wall-ink">{r.open.label}</button>}
          </div>
        ))}
        {!result.undone && left.length > 0 && <span className="text-phone-detail text-wall-ink-2">Left out: {left.join(', ')}.</span>}
        <div className="flex items-center gap-[8px]">
          <button type="button" onClick={onDone} className={dark}>Done</button>
          {undoable && <button type="button" disabled={working} onClick={onUndo} className="h-[44px] rounded-full border border-solid border-wall-rust bg-transparent px-[16px] text-phone-body font-semibold text-wall-rust">{working ? 'Undoing…' : 'Undo this plan'}</button>}
        </div>
        {undoable && <span className="text-phone-detail text-wall-ink-2">Undo works until {lastDay} 11:59 PM.</span>}
      </section>
    </div>
  )
}
