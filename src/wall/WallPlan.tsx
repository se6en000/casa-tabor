import { Check, X } from 'lucide-react'
import { agreeGroups, planChange, planCount, planSections, savedRows, withDependents, type PlanArgs, type PlanItem, type PlanOpen, type PlanResult } from './plan'

// Plan it with Casa on the wall (FAMILY_WALL_PLAN.md P3.25 phase 3; canvas 12b–12d, approved by Jake
// 2026-09-29): the draft beside the conversation, one card with a tick per thing and one Agree, and
// what was saved — each line opening where it lives, and Undo until the end of the next day.

const eyebrow = 'text-wall-label font-bold tracking-[0.2em]'
const darkPill = 'h-[60px] shrink-0 rounded-full border-0 bg-wall-ink px-[32px] text-wall-body font-bold text-wall-on-pigment'
const pill = 'h-[60px] shrink-0 rounded-full border border-solid border-wall-ink-2 bg-transparent px-[28px] text-wall-body font-semibold text-wall-ink'

/** The draft (board 12b): not saved, revised as he talks, what just changed marked. */
export function WallPlanDraft({ plan, previous, working, onSetUp, onKeepTalking }: {
  plan: PlanArgs
  previous: PlanItem[] | null
  working: boolean
  onSetUp: () => void
  onKeepTalking: () => void
}) {
  const change = planChange(previous, plan.items)
  const sections = planSections(plan.items)
  return (
    <section aria-label={`${plan.title} — the plan`} className="flex min-w-0 flex-1 flex-col gap-[10px] rounded-[24px] bg-wall-on-pigment px-[32px] py-[26px] text-wall-ink">
      <div className="flex items-baseline justify-between gap-[24px]">
        <div className="min-w-0 truncate font-display text-wall-quote font-semibold">{plan.title}</div>
        <div className={`${eyebrow} shrink-0 text-wall-brass-ink`}>PLAN · NOT SAVED YET</div>
      </div>
      {/* What changed shows as the tan on its lines, nothing more (Jake, 2026-09-29: a list of every
          change on top of the plan "is just noise"). */}
      <div className="grid min-h-0 grid-cols-2 gap-x-[36px] gap-y-[8px]">
        {sections.map((s) => (
          <div key={s.heading} className={`flex min-w-0 flex-col ${s.heading === 'STEPS' ? 'col-span-2' : ''}`}>
            <div className={`${eyebrow} mt-[6px] text-wall-brass-ink`}>{s.heading}</div>
            {s.intro && <div className="text-wall-detail text-wall-ink-2">{s.intro}{s.why ? ` · ${s.why}` : ''}</div>}
            {s.lines.map((l) => (
              <div key={l.key} className={`flex items-start gap-[14px] rounded-[12px] px-[10px] py-[6px] ${change.marked.has(l.key) ? 'bg-wall-brass/15' : ''}`}>
                {s.heading === 'STEPS' && (
                  l.done
                    ? <span aria-hidden="true" className="mt-[2px] flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[6px] bg-wall-brass-ink text-wall-on-pigment"><Check size={18} strokeWidth={3} /></span>
                    : <span aria-hidden="true" className="mt-[2px] flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full border-2 border-solid border-wall-brass-ink text-wall-label font-bold text-wall-brass-ink">{l.number}</span>
                )}
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-baseline justify-between gap-[16px]">
                    <span className={`min-w-0 truncate text-wall-body font-semibold ${l.done ? 'text-wall-ink-2 line-through' : ''}`}>{l.text}</span>
                    {l.meta && <span className="shrink-0 text-wall-detail font-semibold text-wall-ink-2">{l.meta}</span>}
                  </div>
                  {l.why && <span className="text-wall-detail text-wall-ink-2">{l.why}</span>}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="mt-auto flex items-center gap-[14px] pt-[8px]">
        <button type="button" disabled={working} className={darkPill} onClick={onSetUp}>Set it up…</button>
        <button type="button" disabled={working} className={pill} onClick={onKeepTalking}>Keep talking</button>
        <span className="ml-auto text-wall-detail text-wall-ink-2">{planCount(plan.items, []).label}</span>
      </div>
    </section>
  )
}

/** One card, one Agree (board 12c): everything it will make, grouped by where it lands; untick to leave out. */
export function WallPlanAgree({ plan, skip, working, onToggle, onAgree, onBack }: {
  plan: PlanArgs
  /** What's unticked (held by the band, so a spoken yes saves the same choice). */
  skip: string[]
  working: boolean
  onToggle: (id: string) => void
  onAgree: () => void
  onBack: () => void
}) {
  const left = withDependents(plan.items, skip)
  const count = planCount(plan.items, left)
  const groups = agreeGroups(plan.items)
  return (
    <div className="absolute bottom-0 left-0 z-20 h-[1080px] w-[1920px] bg-wall-night-ground/40" onClick={(e) => { e.stopPropagation(); onBack() }}>
      <section aria-label={`Set up ${plan.title}`} onClick={(e) => e.stopPropagation()}
        className="absolute left-[360px] top-[70px] flex h-[940px] w-[1200px] flex-col rounded-[28px] bg-wall-on-pigment px-[56px] py-[40px] font-body text-wall-ink">
        <div className={`${eyebrow} text-wall-brass-ink`}>SET IT UP · NOTHING IS SAVED UNTIL YOU AGREE</div>
        <div className="mt-[10px] font-display text-wall-quote font-semibold leading-tight">{plan.title}</div>
        <div className="mt-[6px] text-wall-body text-wall-ink-2">Untick anything you don’t want. The rest is saved together, in one go.</div>
        <div className="mt-[6px] grid min-h-0 flex-1 grid-cols-2 content-start gap-x-[48px] overflow-hidden">
          {groups.map((g) => (
            <div key={g.heading} className="flex flex-col">
              <div className={`${eyebrow} mb-[4px] mt-[16px] text-wall-brass-ink`}>{g.heading}</div>
              {g.rows.map((r) => {
                const on = !left.includes(r.id)
                return (
                  <button key={r.id} type="button" aria-pressed={on} onClick={() => onToggle(r.id)}
                    className="flex min-h-[56px] items-center gap-[16px] border-0 border-t border-solid border-wall-stone bg-transparent p-0 text-left text-wall-body text-wall-ink">
                    <span aria-hidden="true" className={`flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-[6px] ${on ? 'bg-wall-ink text-wall-on-pigment' : 'border-2 border-solid border-wall-ink-2'}`}>{on && <Check size={20} strokeWidth={3} />}</span>
                    <span className={`min-w-0 flex-1 ${on ? '' : 'text-wall-ink-2 line-through'}`}>{r.label}</span>
                    {r.meta && <span className="shrink-0 text-wall-detail text-wall-ink-2">{r.meta}</span>}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
        <div className="mt-auto flex items-center gap-[14px] pt-[16px]">
          <button type="button" disabled={working || count.things === 0} className={darkPill} onClick={onAgree}>
            {working ? 'Saving…' : `Agree · set up ${count.things} ${count.things === 1 ? 'thing' : 'things'}`}
          </button>
          <button type="button" disabled={working} className={pill} onClick={onBack}>Change something</button>
          <span className="ml-auto text-right text-wall-detail text-wall-ink-2">You can undo the whole plan<br />until the end of tomorrow.</span>
        </div>
      </section>
    </div>
  )
}

/** Saved (board 12d): each line opens where it lives; Undo until the end of the next day. */
export function WallPlanSaved({ plan, result, working, onOpen, onUndo, onDone }: {
  plan: PlanArgs
  result: PlanResult
  working: boolean
  /** Opens a line where it lives; absent = no buttons. The wall has no shopping screen, so no button there. */
  onOpen?: (open: PlanOpen) => void
  onUndo: () => void
  onDone: () => void
}) {
  const { rows, left } = savedRows(plan.items, result, plan.skip ?? [])
  const saved = planCount(plan.items, plan.skip ?? [])
  const until = result.undo_until ? new Date(result.undo_until) : null
  const undoable = !result.undone && until != null && until.getTime() > Date.now()
  // The deadline is the start of the day after tomorrow: say it as that day's eve ("Wed 11:59 PM").
  const lastDay = until ? new Date(until.getTime() - 60_000).toLocaleDateString('en-US', { weekday: 'short' }) : ''
  return (
    <div className="absolute bottom-0 left-0 z-20 h-[1080px] w-[1920px] bg-wall-night-ground/40" onClick={(e) => { e.stopPropagation(); onDone() }}>
      <section aria-label={`${plan.title} — saved`} onClick={(e) => e.stopPropagation()}
        className="absolute left-[360px] top-[70px] flex h-[940px] w-[1200px] flex-col rounded-[28px] bg-wall-on-pigment px-[56px] py-[40px] font-body text-wall-ink">
        <div className="flex items-start justify-between">
          <div className={`${eyebrow} text-wall-brass-ink`}>{result.undone ? 'UNDONE · NOTHING FROM THIS PLAN IS LEFT' : `SAVED · ${saved.things} ${saved.things === 1 ? 'THING' : 'THINGS'}`}</div>
          <button type="button" aria-label="Close" onClick={onDone} className="flex h-[56px] w-[56px] items-center justify-center rounded-full border border-solid border-wall-stone bg-transparent p-0 text-wall-ink"><X size={22} /></button>
        </div>
        <div className="font-display text-wall-quote font-semibold leading-tight">{result.undone ? `${plan.title} is undone` : `${plan.title} is set up`}</div>
        {!result.undone && <div className="mt-[6px] text-wall-body text-wall-ink-2">Each one opens where it lives, so you can change it there.</div>}
        {!result.undone && (
          <div className="mt-[22px] flex flex-col">
            {rows.map((r) => (
              <div key={r.label} className="flex min-h-[64px] items-center gap-[16px] border-0 border-t border-solid border-wall-stone text-wall-body">
                <span aria-hidden="true" className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full bg-wall-brass-ink text-wall-on-pigment"><Check size={18} strokeWidth={3} /></span>
                <span className="min-w-0 flex-1">{r.label}</span>
                {r.open && onOpen && r.open.kind !== 'shopping' && <button type="button" className="h-[48px] shrink-0 rounded-full border border-solid border-wall-ink-2 bg-transparent px-[20px] text-wall-detail font-semibold text-wall-ink" onClick={() => onOpen(r.open!)}>{r.open.label}</button>}
              </div>
            ))}
          </div>
        )}
        {!result.undone && left.length > 0 && <div className="mt-[14px] text-wall-detail text-wall-ink-2">Left out: {left.join(', ')}.</div>}
        <div className="mt-auto flex items-center gap-[14px]">
          <button type="button" className={darkPill} onClick={onDone}>Done</button>
          {undoable && <button type="button" disabled={working} className="h-[60px] shrink-0 rounded-full border border-solid border-wall-rust bg-transparent px-[28px] text-wall-body font-semibold text-wall-rust" onClick={onUndo}>{working ? 'Undoing…' : 'Undo this plan'}</button>}
          {undoable && <span className="ml-auto text-wall-detail text-wall-ink-2">Undo works until {lastDay} 11:59 PM.</span>}
        </div>
      </section>
    </div>
  )
}
